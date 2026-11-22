// Package render runs candela-rt, Candela's renderer for NVIDIA GPUs, as an optional child process of
// `jigcad serve`, and proxies its WebSocket on the workbench's own origin (JIG-016 §7).
//
// `candela-rt serve` listens on one port and wants a token somewhere in the request URI. Here it listens on a
// free localhost port with a random token, and neither reaches the browser: the page opens ws://<page host>/rt,
// and the proxy adds the token. The browser learns about the GPU from the protocol's own hello, so the Go side
// only needs to know that the child is alive and accepts connections.
//
// A Sidecar is one of four states: off (not wanted, not installed, no bundle, or stopped), starting (the child
// runs but does not listen yet), up (it listens; /rt is proxied) and down (it exited or never came up). A child
// that exits is restarted with a doubling backoff; one that keeps failing before it listens is left down.
package render

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http/httputil"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// State is what a Sidecar is doing.
type State string

const (
	StateOff      State = "off"      // not wanted, no binary, no bundle, or stopped with the server
	StateStarting State = "starting" // the child runs and does not accept connections yet
	StateUp       State = "up"       // the child accepts connections; /rt is proxied
	StateDown     State = "down"     // the child exited or cannot start; see Reason
)

// Defaults of Config's durations and limits.
const (
	DefaultReadyTimeout     = 30 * time.Second // V8 and CUDA start-up take 10–20 s
	DefaultMinBackoff       = time.Second
	DefaultMaxBackoff       = 30 * time.Second
	DefaultStopTimeout      = 5 * time.Second
	DefaultMaxStartFailures = 5
)

// Config configures a Sidecar.
type Config struct {
	// Mode is --render: "auto" ($JIGCAD_CANDELA_RT, else candela-rt on PATH), "off" (or empty), or a binary's path.
	Mode string
	// DistDir is the workbench's built files on disk; candela-core.js is passed to the child in place.
	DistDir string
	// Dist is used when DistDir is empty (the workbench embedded in the binary): candela-core.js is copied to a
	// temporary file for as long as Run runs.
	Dist fs.FS
	// Log receives the child's output (prefixed "candela-rt: ") and the supervisor's lines; nil: the standard logger.
	Log *log.Logger
	// ReadyTimeout bounds one start, from exec to accepting connections (default 30 s).
	ReadyTimeout time.Duration
	// MinBackoff and MaxBackoff bound the wait before a restart; it doubles from Min to Max and returns to Min once
	// the child stayed up for MaxBackoff (defaults 1 s and 30 s).
	MinBackoff, MaxBackoff time.Duration
	// StopTimeout is how long the child has after SIGTERM before SIGKILL (default 5 s).
	StopTimeout time.Duration
	// MaxStartFailures is how many starts in a row may end before the child accepts connections (an exit at start-up,
	// such as no CUDA device, or ReadyTimeout); then the sidecar stays down. 0: 5; negative: retry forever.
	MaxStartFailures int
	// OnChange, when set, is called with the new status after each change, from the goroutine that changed it.
	// It must not block.
	OnChange func(Status)
}

// Status is a Sidecar's state as the page and the log see it.
type Status struct {
	State    State
	Reason   string // why it is off or down
	Bin      string // the candela-rt binary, once found
	Restarts int    // starts after the first one
}

// Sidecar supervises one candela-rt child process. Its methods are safe for concurrent use.
type Sidecar struct {
	cfg      Config
	log      *log.Logger
	bundle   string // candela-core.js on disk, or
	bundleFS fs.FS  // the file system to extract it from

	mu    sync.Mutex
	st    Status
	proxy *httputil.ReverseProxy // set while up
}

// Disabled returns a Sidecar that stays off for the given reason.
func Disabled(reason string) *Sidecar {
	return &Sidecar{log: log.Default(), st: Status{State: StateOff, Reason: reason}}
}

// New finds the binary and the bundle the configuration names. It does not start anything (see Run): the sidecar
// is starting when both were found, off when rendering is not wanted or not installed, and down when a named
// binary cannot be used.
func New(cfg Config) *Sidecar {
	if cfg.Log == nil {
		cfg.Log = log.Default()
	}
	def := func(d *time.Duration, v time.Duration) {
		if *d <= 0 {
			*d = v
		}
	}
	def(&cfg.ReadyTimeout, DefaultReadyTimeout)
	def(&cfg.MinBackoff, DefaultMinBackoff)
	def(&cfg.MaxBackoff, DefaultMaxBackoff)
	cfg.MaxBackoff = max(cfg.MaxBackoff, cfg.MinBackoff)
	def(&cfg.StopTimeout, DefaultStopTimeout)
	if cfg.MaxStartFailures == 0 {
		cfg.MaxStartFailures = DefaultMaxStartFailures
	}
	s := &Sidecar{cfg: cfg, log: cfg.Log}

	bin, err := Find(cfg.Mode)
	switch {
	case errors.Is(err, ErrOff), errors.Is(err, ErrNotFound):
		s.st = Status{State: StateOff, Reason: err.Error()}
		return s
	case err != nil:
		s.st = Status{State: StateDown, Reason: err.Error()}
		return s
	}
	s.st = Status{State: StateStarting, Bin: bin}
	switch {
	case cfg.DistDir != "":
		p, err := filepath.Abs(filepath.Join(cfg.DistDir, BundleName))
		if err == nil {
			var fi os.FileInfo
			if fi, err = os.Stat(p); err == nil && fi.IsDir() {
				err = fmt.Errorf("%s is a directory", p)
			}
		}
		if err != nil {
			s.st = Status{State: StateOff, Bin: bin, Reason: fmt.Sprintf("the workbench at %s has no %s (rebuild it)", cfg.DistDir, BundleName)}
			return s
		}
		s.bundle = p
	case cfg.Dist != nil:
		if _, err := fs.Stat(cfg.Dist, BundleName); err != nil {
			s.st = Status{State: StateOff, Bin: bin, Reason: "the embedded workbench has no " + BundleName}
			return s
		}
		s.bundleFS = cfg.Dist
	default:
		s.st = Status{State: StateOff, Bin: bin, Reason: "no workbench files to take " + BundleName + " from"}
	}
	return s
}

// Status returns the current status.
func (s *Sidecar) Status() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.st
}

// update changes the status under the lock and reports the change.
func (s *Sidecar) update(f func(st *Status)) {
	s.mu.Lock()
	f(&s.st)
	if s.st.State != StateUp {
		s.proxy = nil
	}
	st := s.st
	s.mu.Unlock()
	if s.cfg.OnChange != nil {
		s.cfg.OnChange(st)
	}
}

func (s *Sidecar) set(state State, reason string) {
	s.update(func(st *Status) { st.State, st.Reason = state, reason })
}

// Run starts the child and keeps it running until ctx ends, then stops it and returns once it is gone. It returns
// at once when the sidecar is not starting (off or down after New), and returns early when the child keeps failing
// at start-up (Config.MaxStartFailures).
func (s *Sidecar) Run(ctx context.Context) {
	if s.Status().State != StateStarting {
		return
	}
	bundle := s.bundle
	if s.bundleFS != nil {
		p, cleanup, err := extract(s.bundleFS)
		if err != nil {
			s.set(StateDown, "extracting "+BundleName+": "+err.Error())
			s.log.Printf("render: %s", s.Status().Reason)
			return
		}
		defer cleanup()
		bundle = p
	}
	stopped := func() {
		s.set(StateOff, "stopped with the server")
		s.log.Printf("render: candela-rt stopped")
	}
	backoff := s.cfg.MinBackoff
	failures := 0
	for attempt := 0; ; attempt++ {
		if attempt > 0 {
			s.update(func(st *Status) { st.State, st.Reason = StateStarting, ""; st.Restarts++ })
		}
		if ctx.Err() != nil {
			stopped()
			return
		}
		o := s.runOnce(ctx, bundle)
		if ctx.Err() != nil {
			stopped()
			return
		}
		if o.up {
			failures = 0
			if o.upFor >= s.cfg.MaxBackoff {
				backoff = s.cfg.MinBackoff
			}
		} else {
			failures++
		}
		if !o.up && s.cfg.MaxStartFailures > 0 && failures >= s.cfg.MaxStartFailures {
			s.set(StateDown, o.reason)
			s.log.Printf("render: candela-rt %s; not restarting after %d failed starts", o.reason, failures)
			return
		}
		s.set(StateDown, o.reason)
		s.log.Printf("render: candela-rt %s; restarting in %s", o.reason, backoff)
		t := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			t.Stop()
			stopped()
			return
		case <-t.C:
		}
		backoff = min(2*backoff, s.cfg.MaxBackoff)
	}
}

// outcome is how one child process ended.
type outcome struct {
	up     bool          // it accepted connections
	upFor  time.Duration // for this long
	reason string        // how it ended, for Status.Reason
}

// runOnce runs one child until it exits or ctx ends.
func (s *Sidecar) runOnce(ctx context.Context, bundle string) outcome {
	port, err := freePort()
	if err != nil {
		return outcome{reason: "found no free port: " + err.Error()}
	}
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	token := rand.Text()
	bin := s.Status().Bin
	cmd := exec.Command(bin, "serve", "--bind", "127.0.0.1", "--port", strconv.Itoa(port), "--token", token, "--bundle", bundle)
	cmd.SysProcAttr = sysProcAttr()
	// The child writes to a pipe of ours rather than through exec's copying goroutines, so that Wait returns when
	// the child exits even if something it started still holds the pipe.
	pr, pw, err := os.Pipe()
	if err != nil {
		return outcome{reason: "could not start: " + err.Error()}
	}
	cmd.Stdout, cmd.Stderr = pw, pw
	err = cmd.Start()
	_ = pw.Close()
	if err != nil {
		_ = pr.Close()
		return outcome{reason: "could not start: " + err.Error()}
	}
	pid := cmd.Process.Pid
	s.log.Printf("render: starting %s on %s (pid %d)", bin, addr, pid)

	out := &output{log: s.log}
	outDone := make(chan struct{})
	go func() { out.copy(pr); _ = pr.Close(); close(outDone) }()
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	// gone cleans up after the child: whatever it started goes too, and its last output is read.
	gone := func(err error) string {
		_ = signalGroup(pid, syscall.SIGKILL)
		select {
		case <-outDone:
		case <-time.After(time.Second):
		}
		return describe(err, out.tail())
	}
	// signal reaches the whole group, or at least the child (os.Process stays safe to signal after the child is
	// reaped, unlike its pid).
	signal := func(sig syscall.Signal) {
		if signalGroup(pid, sig) != nil {
			_ = cmd.Process.Signal(sig)
		}
	}
	stop := func() error {
		signal(syscall.SIGTERM)
		t := time.NewTimer(s.cfg.StopTimeout)
		defer t.Stop()
		select {
		case err := <-exited:
			return err
		case <-t.C:
			signal(syscall.SIGKILL)
			return <-exited
		}
	}

	started := time.Now()
	ready := time.NewTimer(s.cfg.ReadyTimeout)
	defer ready.Stop()
	poll := time.NewTicker(50 * time.Millisecond)
	defer poll.Stop()
	for listening := false; !listening; {
		select {
		case err := <-exited:
			return outcome{reason: "exited during start-up (" + gone(err) + ")"}
		case <-ready.C:
			gone(stop())
			return outcome{reason: fmt.Sprintf("did not accept connections on %s within %s", addr, s.cfg.ReadyTimeout)}
		case <-ctx.Done():
			gone(stop())
			return outcome{}
		case <-poll.C:
			listening = accepts(addr)
		}
	}

	upAt := time.Now()
	p := newProxy(addr, token, s.log)
	s.update(func(st *Status) { st.State, st.Reason = StateUp, ""; s.proxy = p }) // update holds s.mu
	s.log.Printf("render: candela-rt up on %s after %s", addr, upAt.Sub(started).Round(time.Millisecond))
	select {
	case err := <-exited:
		upFor := time.Since(upAt)
		s.unproxy()
		return outcome{up: true, upFor: upFor, reason: fmt.Sprintf("exited after %s (%s)", upFor.Round(time.Millisecond), gone(err))}
	case <-ctx.Done():
		s.unproxy()
		gone(stop())
		return outcome{up: true, upFor: time.Since(upAt)}
	}
}

// unproxy stops proxying at once, ahead of the state change the supervisor makes once the child is gone.
func (s *Sidecar) unproxy() {
	s.mu.Lock()
	s.proxy = nil
	s.mu.Unlock()
}

// describe says how a child ended: its exit status and the last lines it wrote.
func describe(err error, tail []string) string {
	msg := "exit status 0"
	if err != nil {
		msg = err.Error()
	}
	if len(tail) > 0 {
		msg += ": " + strings.Join(tail, " | ")
	}
	return msg
}

// freePort returns a localhost port nothing listens on (yet).
func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer func() { _ = l.Close() }()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// accepts tells whether something accepts TCP connections on addr.
func accepts(addr string) bool {
	c, err := net.DialTimeout("tcp", addr, 250*time.Millisecond)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}
