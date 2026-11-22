package render

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"testing/fstest"
	"time"

	"github.com/go-go-golems/jig/pkg/render/rendertest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	rendertest.Main() // the sidecar under test runs this binary as candela-rt
	os.Exit(m.Run())
}

// syncBuf is a log destination the test can read while the sidecar writes.
type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

// rig is one sidecar on the fake, with its records, log and state history.
type rig struct {
	sc      *Sidecar
	records string
	log     *syncBuf
	mu      sync.Mutex
	history []Status
	done    chan struct{}
	stop    context.CancelFunc
}

// dist is a workbench build with a bundle in it.
func dist(t *testing.T) string {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, BundleName), []byte("// candela core"), 0o644))
	return dir
}

// start runs a sidecar on the fake with env set for the fake, and stops it at the end of the test.
func start(t *testing.T, cfg Config, env map[string]string) *rig {
	t.Helper()
	r := &rig{records: t.TempDir(), log: &syncBuf{}, done: make(chan struct{})}
	cfg.Mode = rendertest.Binary(t)
	t.Setenv(rendertest.EnvRecord, r.records)
	for k, v := range env {
		t.Setenv(k, v)
	}
	if cfg.DistDir == "" && cfg.Dist == nil {
		cfg.DistDir = dist(t)
	}
	cfg.Log = log.New(r.log, "", 0)
	cfg.OnChange = func(st Status) { r.mu.Lock(); r.history = append(r.history, st); r.mu.Unlock() }
	r.sc = New(cfg)
	require.Equal(t, StateStarting, r.sc.Status().State, r.sc.Status().Reason)
	ctx, cancel := context.WithCancel(context.Background())
	r.stop = cancel
	go func() { defer close(r.done); r.sc.Run(ctx) }()
	t.Cleanup(func() { r.shutdown(t) })
	return r
}

// shutdown stops the sidecar and waits for Run to return.
func (r *rig) shutdown(t *testing.T) {
	t.Helper()
	r.stop()
	select {
	case <-r.done:
	case <-time.After(15 * time.Second):
		t.Fatal("Run did not return after the context ended")
	}
}

func (r *rig) states() []State {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []State
	for _, st := range r.history {
		out = append(out, st.State)
	}
	return out
}

func (r *rig) waitFor(t *testing.T, state State) Status {
	t.Helper()
	require.Eventually(t, func() bool { return r.sc.Status().State == state }, 10*time.Second, 10*time.Millisecond,
		"state %s, wanted %s; log:\n%s", r.sc.Status().State, state, r.log)
	return r.sc.Status()
}

// alive tells whether a process exists and is not a zombie.
func alive(pid int) bool {
	if syscall.Kill(pid, 0) != nil {
		return false
	}
	b, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "stat"))
	if err != nil {
		return !errors.Is(err, os.ErrNotExist)
	}
	s := string(b)
	i := strings.LastIndexByte(s, ')')
	return i < 0 || i+2 >= len(s) || s[i+2] != 'Z'
}

func assertGone(t *testing.T, pid int) {
	t.Helper()
	assert.Eventually(t, func() bool { return !alive(pid) }, 5*time.Second, 20*time.Millisecond, "process %d is still running", pid)
}

func getJSON(t *testing.T, h http.HandlerFunc, target string, header http.Header) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest("GET", target, nil)
	for k, v := range header {
		req.Header[k] = v
	}
	w := httptest.NewRecorder()
	h(w, req)
	var out map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out), w.Body.String())
	return w.Code, out
}

// ── discovery ──────────────────────────────────────────────────────────────────

func executable(t *testing.T, dir, name string) string {
	p := filepath.Join(dir, name)
	require.NoError(t, os.WriteFile(p, []byte("#!/bin/sh\nexit 0\n"), 0o755))
	return p
}

func TestFind(t *testing.T) {
	bin := t.TempDir()
	rt := executable(t, bin, "candela-rt")
	other := executable(t, t.TempDir(), "my-rt")
	plain := filepath.Join(t.TempDir(), "candela-rt")
	require.NoError(t, os.WriteFile(plain, []byte("not a program"), 0o644))
	missing := filepath.Join(t.TempDir(), "nothing")

	t.Setenv(EnvBinary, "")
	t.Setenv("PATH", t.TempDir())
	for _, mode := range []string{"", "off"} {
		_, err := Find(mode)
		assert.ErrorIs(t, err, ErrOff, mode)
	}
	_, err := Find("auto")
	assert.ErrorIs(t, err, ErrNotFound, "auto with nothing installed is off, not an error")

	t.Setenv("PATH", bin)
	got, err := Find("auto")
	require.NoError(t, err)
	assert.Equal(t, rt, got, "auto finds candela-rt on PATH")

	t.Setenv(EnvBinary, other)
	got, err = Find("auto")
	require.NoError(t, err)
	assert.Equal(t, other, got, "$JIGCAD_CANDELA_RT comes before PATH")
	t.Setenv(EnvBinary, missing)
	_, err = Find("auto")
	require.Error(t, err)
	assert.NotErrorIs(t, err, ErrNotFound, "a variable naming a missing binary is an error")
	assert.Contains(t, err.Error(), "$"+EnvBinary)

	got, err = Find(other)
	require.NoError(t, err)
	assert.Equal(t, other, got)
	for _, p := range []string{missing, plain, bin} {
		_, err = Find(p)
		require.Error(t, err, p)
		assert.NotErrorIs(t, err, ErrNotFound)
		assert.NotErrorIs(t, err, ErrOff)
		assert.Contains(t, err.Error(), "--render "+p)
	}
}

func TestNewStates(t *testing.T) {
	t.Setenv(EnvBinary, "")
	t.Setenv("PATH", t.TempDir())
	rt := executable(t, t.TempDir(), "candela-rt")
	quiet := log.New(io.Discard, "", 0)

	st := New(Config{Mode: "auto", DistDir: dist(t), Log: quiet}).Status()
	assert.Equal(t, StateOff, st.State)
	assert.Contains(t, st.Reason, "no candela-rt")

	st = New(Config{Mode: "off", DistDir: dist(t), Log: quiet}).Status()
	assert.Equal(t, StateOff, st.State)

	st = New(Config{Mode: filepath.Join(t.TempDir(), "gone"), DistDir: dist(t), Log: quiet}).Status()
	assert.Equal(t, StateDown, st.State, "a named binary that is missing is down")
	assert.Contains(t, st.Reason, "--render")

	st = New(Config{Mode: rt, DistDir: t.TempDir(), Log: quiet}).Status()
	assert.Equal(t, StateOff, st.State, "a build without the bundle is off")
	assert.Contains(t, st.Reason, BundleName)
	assert.Equal(t, rt, st.Bin)

	st = New(Config{Mode: rt, Dist: fstest.MapFS{"index.html": {}}, Log: quiet}).Status()
	assert.Equal(t, StateOff, st.State)
	assert.Contains(t, st.Reason, "embedded")

	st = New(Config{Mode: rt, DistDir: dist(t), Log: quiet}).Status()
	assert.Equal(t, StateStarting, st.State)
}

// ── the child process ──────────────────────────────────────────────────────────

func TestUpProxiesWithToken(t *testing.T) {
	r := start(t, Config{}, nil)
	r.waitFor(t, StateUp)

	recs := rendertest.Records(t, r.records)
	require.Len(t, recs, 1)
	args := recs[0].Args
	assert.Equal(t, "serve", args[0])
	assert.Equal(t, "127.0.0.1", rendertest.Flag(args, "--bind"), "candela-rt binds 0.0.0.0 unless told")
	token := rendertest.Flag(args, "--token")
	assert.GreaterOrEqual(t, len(token), 20, "a random token")
	assert.NotEmpty(t, rendertest.Flag(args, "--port"))
	assert.True(t, filepath.IsAbs(rendertest.Flag(args, "--bundle")))
	assert.Equal(t, BundleName, filepath.Base(rendertest.Flag(args, "--bundle")))

	code, caps := getJSON(t, r.sc.ServeCapabilities, "/api/render/capabilities", nil)
	assert.Equal(t, 200, code)
	assert.Equal(t, map[string]any{"rt": true, "state": "up", "reason": "", "restarts": float64(0)}, caps)

	ts := httptest.NewServer(http.HandlerFunc(r.sc.ServeRT))
	defer ts.Close()

	// A plain request shows what reaches the child: the token in the query, in place of the client's, and neither
	// the jigcad cookie nor the bearer token.
	req, _ := http.NewRequest("GET", ts.URL+"/rt?token=forged&view=1", nil)
	req.Header.Set("Cookie", "jigcad_token=secret")
	req.Header.Set("Authorization", "Bearer secret")
	res, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	var echo rendertest.Echo
	require.NoError(t, json.NewDecoder(res.Body).Decode(&echo))
	res.Body.Close()
	assert.Equal(t, "/?token="+token+"&view=1", echo.URI)
	assert.Empty(t, echo.Header.Get("Cookie"))
	assert.Empty(t, echo.Header.Get("Authorization"))

	// A WebSocket handshake without a token goes through, upgraded, and bytes round-trip.
	conn, br, res, err := rendertest.Handshake(ts.Listener.Addr().String(), "/rt", nil)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()
	require.Equal(t, http.StatusSwitchingProtocols, res.StatusCode)
	assert.Equal(t, rendertest.AcceptKey("dGhlIHNhbXBsZSBub25jZQ=="), res.Header.Get("Sec-WebSocket-Accept"))
	assert.Equal(t, "/?token="+token, res.Header.Get("X-Fake-Uri"))
	_, err = conn.Write([]byte("hello candela"))
	require.NoError(t, err)
	got := make([]byte, len("hello candela"))
	_, err = io.ReadFull(br, got)
	require.NoError(t, err)
	assert.Equal(t, "hello candela", string(got))

	// Shutting down stops the child, the proxy and the open socket.
	r.shutdown(t)
	assert.Equal(t, StateOff, r.sc.Status().State)
	assertGone(t, recs[0].Pid)
	_, err = io.ReadFull(br, got[:1])
	assert.Error(t, err, "the proxied socket closes with the child")
	code, out := getJSON(t, r.sc.ServeRT, "/rt", nil)
	assert.Equal(t, 503, code)
	assert.Equal(t, "rt_unavailable", out["error"].(map[string]any)["code"])
	_, caps = getJSON(t, r.sc.ServeCapabilities, "/api/render/capabilities", nil)
	assert.Equal(t, false, caps["rt"])
}

func TestRestartAfterCrash(t *testing.T) {
	r := start(t, Config{MinBackoff: 50 * time.Millisecond, MaxBackoff: 200 * time.Millisecond},
		map[string]string{rendertest.EnvCrashAfter: "300ms"})
	require.Eventually(t, func() bool { st := r.sc.Status(); return st.Restarts >= 2 && st.State == StateUp },
		15*time.Second, 10*time.Millisecond, "log:\n%s", r.log)

	states := r.states()
	assert.Equal(t, []State{StateUp, StateDown, StateStarting, StateUp, StateDown, StateStarting, StateUp}, states[:7],
		"up, crash, restart, …")
	r.mu.Lock()
	down := r.history[1]
	r.mu.Unlock()
	assert.Contains(t, down.Reason, "exited after")
	assert.Contains(t, down.Reason, "exit status 2")
	assert.Contains(t, down.Reason, "crashing on purpose", "the reason carries the child's last output")
	assert.Contains(t, r.log.String(), "candela-rt: crashing on purpose", "child output is logged with a prefix")

	r.shutdown(t)
	recs := rendertest.Records(t, r.records)
	assert.GreaterOrEqual(t, len(recs), 3)
	tokens := map[string]bool{}
	for _, rec := range recs {
		assertGone(t, rec.Pid)
		tokens[rendertest.Flag(rec.Args, "--token")] = true
	}
	assert.Len(t, tokens, len(recs), "each start has its own token")
}

func TestStartupFailure(t *testing.T) {
	r := start(t, Config{MinBackoff: 20 * time.Millisecond, MaxStartFailures: 2},
		map[string]string{rendertest.EnvExitAtStart: "no CUDA-capable device is detected"})
	select {
	case <-r.done: // gives up after two failed starts
	case <-time.After(10 * time.Second):
		t.Fatalf("Run did not give up; log:\n%s", r.log)
	}
	st := r.sc.Status()
	assert.Equal(t, StateDown, st.State)
	assert.Contains(t, st.Reason, "exited during start-up")
	assert.Contains(t, st.Reason, "exit status 3")
	assert.Contains(t, st.Reason, "no CUDA-capable device is detected")
	assert.Equal(t, 1, st.Restarts)
	assert.Len(t, rendertest.Records(t, r.records), 2)
	assert.NotContains(t, r.states(), StateUp)

	code, out := getJSON(t, r.sc.ServeRT, "/rt", nil)
	assert.Equal(t, 503, code)
	e := out["error"].(map[string]any)
	assert.Equal(t, "rt_unavailable", e["code"])
	assert.Contains(t, e["message"], "no CUDA-capable device")
	_, caps := getJSON(t, r.sc.ServeCapabilities, "/api/render/capabilities", nil)
	assert.Equal(t, false, caps["rt"])
	assert.Equal(t, "down", caps["state"])
	assert.Contains(t, caps["reason"], "no CUDA-capable device")
}

func TestReadyTimeout(t *testing.T) {
	r := start(t, Config{ReadyTimeout: 300 * time.Millisecond, MaxStartFailures: 1},
		map[string]string{rendertest.EnvListenAfter: "1m"})
	select {
	case <-r.done:
	case <-time.After(10 * time.Second):
		t.Fatalf("Run did not give up; log:\n%s", r.log)
	}
	st := r.sc.Status()
	assert.Equal(t, StateDown, st.State)
	assert.Contains(t, st.Reason, "did not accept connections")
	recs := rendertest.Records(t, r.records)
	require.Len(t, recs, 1)
	assertGone(t, recs[0].Pid)
}

func TestNoOrphans(t *testing.T) {
	r := start(t, Config{StopTimeout: time.Second}, map[string]string{rendertest.EnvGrandchild: "1"})
	r.waitFor(t, StateUp)
	recs := rendertest.Records(t, r.records)
	require.Len(t, recs, 1)
	require.NotZero(t, recs[0].Grandchild)
	require.True(t, alive(recs[0].Grandchild))
	began := time.Now()
	r.shutdown(t)
	assert.Less(t, time.Since(began), 4*time.Second, "a grandchild holding the output pipe does not hold up the stop")
	assertGone(t, recs[0].Pid)
	assertGone(t, recs[0].Grandchild)
}

func TestEmbeddedBundle(t *testing.T) {
	r := start(t, Config{Dist: fstest.MapFS{BundleName: {Data: []byte("// embedded core")}}}, nil)
	r.waitFor(t, StateUp)
	recs := rendertest.Records(t, r.records)
	require.Len(t, recs, 1)
	p := rendertest.Flag(recs[0].Args, "--bundle")
	b, err := os.ReadFile(p)
	require.NoError(t, err)
	assert.Equal(t, "// embedded core", string(b))
	r.shutdown(t)
	_, err = os.Stat(p)
	assert.ErrorIs(t, err, os.ErrNotExist, "the extracted bundle is removed")
}

// ── the handlers without a child ───────────────────────────────────────────────

func TestOff(t *testing.T) {
	sc := New(Config{Mode: "off", Log: log.New(io.Discard, "", 0)})
	done := make(chan struct{})
	go func() { sc.Run(context.Background()); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Run of an off sidecar does not return")
	}
	code, out := getJSON(t, sc.ServeRT, "/rt", nil)
	assert.Equal(t, 503, code)
	assert.Equal(t, "rt_unavailable", out["error"].(map[string]any)["code"])
	code, caps := getJSON(t, sc.ServeCapabilities, "/api/render/capabilities", nil)
	assert.Equal(t, 200, code)
	assert.Equal(t, false, caps["rt"])
	assert.Equal(t, "off", caps["state"])
	assert.Contains(t, caps["reason"], "--render off")
	assert.EqualValues(t, 0, caps["restarts"])
}

func TestCrossOrigin(t *testing.T) {
	sc := Disabled("test")
	code, out := getJSON(t, sc.ServeRT, "http://jig.local:8787/rt", http.Header{"Origin": {"https://evil.example"}})
	assert.Equal(t, 403, code)
	assert.Equal(t, "forbidden_origin", out["error"].(map[string]any)["code"])
	code, _ = getJSON(t, sc.ServeRT, "http://jig.local:8787/rt", http.Header{"Origin": {"http://jig.local:8787"}})
	assert.Equal(t, 503, code, "the page's own origin passes")
}
