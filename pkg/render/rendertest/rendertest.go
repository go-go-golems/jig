// Package rendertest stands in for candela-rt in tests. A test binary calls Main first thing in TestMain; when
// $JIGCAD_FAKE_CANDELA_RT is "1" the binary then behaves as `candela-rt serve` instead of running its tests, so a
// test can name its own executable (Binary) as the renderer. The fake parses serve's flags, listens where told,
// refuses requests whose URI lacks token=<t>, and answers a WebSocket handshake with 101 and then echoes raw bytes.
package rendertest

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Environment of the fake.
const (
	EnvFake        = "JIGCAD_FAKE_CANDELA_RT" // "1": run as the fake (Binary sets it)
	EnvExitAtStart = "FAKE_RT_EXIT_AT_START"  // a message: write it to stderr and exit 3 before listening
	EnvCrashAfter  = "FAKE_RT_CRASH_AFTER"    // a duration: exit 2 that long after listening
	EnvListenAfter = "FAKE_RT_LISTEN_AFTER"   // a duration: wait that long before listening
	EnvRecord      = "FAKE_RT_RECORD"         // a directory: write <pid>.json, a Record, on start
	EnvGrandchild  = "FAKE_RT_GRANDCHILD"     // "1": start a sleeping process of its own that holds its stdout
)

// Record is what one run of the fake writes to $FAKE_RT_RECORD/<pid>.json.
type Record struct {
	Pid        int      `json:"pid"`
	Args       []string `json:"args"`
	Grandchild int      `json:"grandchild,omitempty"`
}

// Echo is the fake's answer to a request that is not a WebSocket handshake.
type Echo struct {
	URI    string      `json:"uri"`
	Header http.Header `json:"header"`
}

// Main runs the fake and exits when the environment asks for it, and returns otherwise.
func Main() {
	switch os.Getenv(EnvFake) {
	case "1":
		os.Exit(serve(os.Args[1:]))
	case "sleep":
		time.Sleep(time.Hour)
		os.Exit(0)
	}
}

// Binary returns the test's own executable, set up to run as the fake (it sets $JIGCAD_FAKE_CANDELA_RT for the
// test's duration, so the test cannot be parallel).
func Binary(t testing.TB) string {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv(EnvFake, "1")
	return exe
}

// Records reads the records the fake wrote to dir.
func Records(t testing.TB, dir string) []Record {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	var out []Record
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		var r Record
		if err := json.Unmarshal(b, &r); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

// Flag returns the value after name in args, or "".
func Flag(args []string, name string) string {
	for i, a := range args {
		if a == name && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}

func serve(args []string) int {
	if len(args) == 0 || args[0] != "serve" {
		fmt.Fprintln(os.Stderr, "usage: candela-rt serve [--port 8790] [--bind 0.0.0.0] [--token t] [--bundle path]")
		return 64
	}
	fl := flag.NewFlagSet("serve", flag.ContinueOnError)
	port := fl.Int("port", 8790, "")
	bind := fl.String("bind", "0.0.0.0", "")
	token := fl.String("token", "", "")
	bundle := fl.String("bundle", "", "")
	fl.Int("max-spp", 2048, "")
	fl.Int("max-width", 1920, "")
	if err := fl.Parse(args[1:]); err != nil {
		return 64
	}
	rec := Record{Pid: os.Getpid(), Args: args}
	if os.Getenv(EnvGrandchild) == "1" {
		exe, _ := os.Executable()
		c := exec.Command(exe)
		c.Env = append(os.Environ(), EnvFake+"=sleep")
		c.Stdout, c.Stderr = os.Stdout, os.Stderr
		if err := c.Start(); err != nil {
			fmt.Fprintln(os.Stderr, "grandchild:", err)
			return 1
		}
		rec.Grandchild = c.Process.Pid
	}
	if dir := os.Getenv(EnvRecord); dir != "" {
		b, _ := json.Marshal(rec)
		if err := os.WriteFile(filepath.Join(dir, strconv.Itoa(rec.Pid)+".json"), b, 0o600); err != nil {
			fmt.Fprintln(os.Stderr, "record:", err)
			return 1
		}
	}
	if msg := os.Getenv(EnvExitAtStart); msg != "" {
		fmt.Fprintln(os.Stderr, "candela-rt starting")
		fmt.Fprintln(os.Stderr, msg)
		return 3
	}
	if _, err := os.Stat(*bundle); err != nil {
		fmt.Fprintln(os.Stderr, "cannot read the bundle:", err)
		return 1
	}
	if d, err := time.ParseDuration(os.Getenv(EnvListenAfter)); err == nil {
		time.Sleep(d)
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(*bind, strconv.Itoa(*port)))
	if err != nil {
		fmt.Fprintln(os.Stderr, "listen:", err)
		return 1
	}
	fmt.Println("serving on", ln.Addr())
	if d, err := time.ParseDuration(os.Getenv(EnvCrashAfter)); err == nil {
		go func() {
			time.Sleep(d)
			fmt.Fprintln(os.Stderr, "crashing on purpose")
			os.Exit(2)
		}()
	}
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if *token != "" && !strings.Contains(r.RequestURI, "token="+*token) {
			http.Error(w, "bad token", http.StatusUnauthorized) // candela-rt closes the socket with 4401
			return
		}
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(Echo{URI: r.RequestURI, Header: r.Header})
			return
		}
		conn, brw, err := http.NewResponseController(w).Hijack()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		_, _ = fmt.Fprintf(brw, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"+
			"Sec-WebSocket-Accept: %s\r\nX-Fake-Uri: %s\r\n\r\n", AcceptKey(r.Header.Get("Sec-WebSocket-Key")), r.RequestURI)
		if brw.Flush() != nil {
			return
		}
		_, _ = io.Copy(conn, brw.Reader)
	})
	err = (&http.Server{Handler: h, ReadHeaderTimeout: 5 * time.Second}).Serve(ln)
	fmt.Fprintln(os.Stderr, "serve:", err)
	return 1
}

// AcceptKey is the Sec-WebSocket-Accept answer to a Sec-WebSocket-Key (RFC 6455 §4.2.2).
func AcceptKey(key string) string {
	h := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(h[:])
}

// Handshake opens a WebSocket by hand: it sends the upgrade request for path to addr (host:port) with the
// extra header, and returns the connection and the server's response. The caller closes the connection.
func Handshake(addr, path string, header http.Header) (net.Conn, *bufio.Reader, *http.Response, error) {
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return nil, nil, nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	req, err := http.NewRequest("GET", "http://"+addr+path, nil)
	if err != nil {
		_ = conn.Close()
		return nil, nil, nil, err
	}
	for k, v := range header {
		req.Header[k] = v
	}
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	if err := req.Write(conn); err != nil {
		_ = conn.Close()
		return nil, nil, nil, err
	}
	br := bufio.NewReader(conn)
	res, err := http.ReadResponse(br, req)
	if err != nil {
		_ = conn.Close()
		return nil, nil, nil, err
	}
	return conn, br, res, nil
}
