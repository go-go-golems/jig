// Package server is jigcad's HTTP server: the workbench's static files and the agent's model backend. A page
// calls POST /api/sample and reads one server-sent-event stream per call; the server runs model rounds through a
// sample.Backend and, when the model calls a tool, sends a `tool` event and waits until the page posts the result
// to /api/sample/{call}/tools/{use}. Tools run in the page because they read and edit the workbench's live state.
//
// The sample handlers are adapted from github.com/go-go-golems/slop-computer pkg/server/rt_sample.go (SLOP-010),
// without slop's views, grants, consent and audit log: jigcad serves one operator, guarded by the listen address
// and an optional bearer token.
package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-go-golems/jig/pkg/sample"
)

// Limits of the page-facing protocol (the same as slop's runtime limits).
const (
	MaxPromptBytes     = 256 << 10 // the input text of one call
	MaxToolResultBytes = 32 << 10  // one tool result
	MaxTools           = 16 // enforced by sample.ValidateRequest
	toolWait           = 150 * time.Second // how long a call waits for one tool result
)

// Config configures a Server.
type Config struct {
	// Sample runs model calls; nil serves the workbench with the agent unavailable.
	Sample sample.Backend
	// Tiers are the configured tier models, reported by /api/sample/models.
	Tiers map[string]string
	// MaxRounds bounds the model rounds of one call (0 = sample's default).
	MaxRounds int
	// Static serves everything outside /api/ (the workbench's dist/); nil serves nothing there.
	Static fs.FS
	// Token, when set, must be presented on every /api/ request as a bearer token or the jigcad_token cookie.
	Token string
	// Log receives one line per call; nil uses the standard logger.
	Log *log.Logger
}

// Server is an http.Handler.
type Server struct {
	cfg   Config
	mux   *http.ServeMux
	mu    sync.Mutex
	calls map[string]*call
}

// call is one model call in flight: its cancel function and the tool uses waiting for results.
type call struct {
	cancel context.CancelFunc
	tools  map[string]chan sample.ToolResult
}

// New builds a Server.
func New(cfg Config) *Server {
	if cfg.Log == nil {
		cfg.Log = log.Default()
	}
	s := &Server{cfg: cfg, mux: http.NewServeMux(), calls: map[string]*call{}}
	s.mux.HandleFunc("GET /api/sample/models", s.guard(s.models))
	s.mux.HandleFunc("POST /api/sample", s.guard(s.start))
	s.mux.HandleFunc("POST /api/sample/{call}/tools/{use}", s.guard(s.toolResult))
	s.mux.HandleFunc("POST /api/sample/{call}/cancel", s.guard(s.cancel))
	s.mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) { fail(w, 404, "not_found", "No such endpoint") })
	if cfg.Static != nil {
		files := http.FileServerFS(cfg.Static)
		s.mux.Handle("/", s.tokenCookie(noCacheHTML(files)))
	}
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// ── access ─────────────────────────────────────────────────────────────────────

// guard rejects /api/ requests without the token (when one is configured).
func (s *Server) guard(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.Token != "" && !s.authorized(r) {
			fail(w, 401, "unauthorized", "Open the workbench with ?token=… once, or send Authorization: Bearer …")
			return
		}
		h(w, r)
	}
}

func (s *Server) authorized(r *http.Request) bool {
	got := ""
	if a := r.Header.Get("Authorization"); strings.HasPrefix(a, "Bearer ") {
		got = strings.TrimPrefix(a, "Bearer ")
	} else if c, err := r.Cookie("jigcad_token"); err == nil {
		got = c.Value
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.Token)) == 1
}

// tokenCookie turns /?token=T into a cookie and a redirect, so the token leaves the address bar.
func (s *Server) tokenCookie(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if t := r.URL.Query().Get("token"); t != "" && s.cfg.Token != "" {
			if subtle.ConstantTimeCompare([]byte(t), []byte(s.cfg.Token)) == 1 {
				http.SetCookie(w, &http.Cookie{Name: "jigcad_token", Value: t, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
			}
			q := r.URL.Query()
			q.Del("token")
			u := *r.URL
			u.RawQuery = q.Encode()
			http.Redirect(w, r, u.String(), http.StatusSeeOther)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// noCacheHTML keeps browsers from holding a stale index.html across rebuilds (the bundles are not hashed).
func noCacheHTML(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		next.ServeHTTP(w, r)
	})
}

// ── models ─────────────────────────────────────────────────────────────────────

func (s *Server) models(w http.ResponseWriter, _ *http.Request) {
	out := map[string]any{"available": false, "models": []sample.Model{}, "tiers": s.cfg.Tiers,
		"modelTiers": []string{"quick", "default", "complex"}, "maxRounds": s.rounds(),
		"maxPromptBytes": MaxPromptBytes, "tools": map[string]int{"maxCount": MaxTools}}
	if s.cfg.Sample != nil {
		out["available"] = true
		out["models"] = s.cfg.Sample.Models()
	}
	writeJSON(w, 200, out)
}

func (s *Server) rounds() int {
	if s.cfg.MaxRounds <= 0 {
		return sample.DefaultRounds
	}
	return min(s.cfg.MaxRounds, sample.MaxRounds)
}

// ── one call ───────────────────────────────────────────────────────────────────

// start runs one call: POST /api/sample {input, modelTier, model?, effort?, tools?} → text/event-stream of
// call, text, thinking, tool, result or error events.
func (s *Server) start(w http.ResponseWriter, r *http.Request) {
	if s.cfg.Sample == nil {
		fail(w, 503, "sampling_disabled", "This server has no model backend (see jigcad serve --help)")
		return
	}
	var in struct {
		Input     json.RawMessage `json:"input"`
		ModelTier string          `json:"modelTier"`
		Model     string          `json:"model"`
		Effort    string          `json:"effort"`
		Tools     []sample.Tool   `json:"tools"`
	}
	if err := readJSON(w, r, &in, MaxPromptBytes+1<<20); err != nil {
		fail(w, 400, "invalid_request", "Send {input, modelTier, …}")
		return
	}
	if in.ModelTier == "" || in.ModelTier == "inherit" {
		in.ModelTier = "default"
	}
	req := sample.Request{CallID: "jc" + randomID(), Input: in.Input, Tools: in.Tools,
		Options: sample.Options{ModelTier: in.ModelTier, Model: in.Model, Effort: in.Effort}, MaxRounds: s.rounds()}
	if err := sample.ValidateRequest(req); err != nil {
		code := "invalid_request"
		if strings.Contains(err.Error(), "exceeds") {
			code = "prompt_too_large"
		}
		fail(w, 400, code, err.Error())
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		fail(w, 500, "unsupported", "Streaming unsupported")
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	c := &call{cancel: cancel, tools: map[string]chan sample.ToolResult{}}
	s.add(req.CallID, c)
	defer s.remove(req.CallID)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	var mu sync.Mutex
	send := func(typ string, data any) {
		mu.Lock()
		defer mu.Unlock()
		_ = writeSSE(w, typ, data)
		flusher.Flush()
	}
	send("call", map[string]string{"call": req.CallID})

	started := time.Now()
	var usage sample.Usage
	var toolUses atomic.Int32 // tools of one round run in parallel
	var outcome string
	emit := func(e sample.Event) {
		switch e.Type {
		case "text", "thinking":
			send(e.Type, map[string]string{"text": e.Text, "delta": e.Delta})
		case "usage":
			if e.Usage != nil { // kept in the server log, never sent to the page
				usage.Input += e.Usage.Input
				usage.Output += e.Usage.Output
				usage.Model = e.Usage.Model
			}
		case "result":
			outcome = "ok"
			send("result", e.Result)
		case "error":
			if e.Error != nil {
				outcome = e.Error.Code
			}
			send("error", e.Error)
		}
	}
	execute := func(tctx context.Context, e sample.Event) (sample.ToolResult, error) {
		ch := s.waitTool(c, e.ToolCallID)
		defer s.takeTool(c, e.ToolCallID)
		toolUses.Add(1)
		send("tool", map[string]any{"use": e.ToolCallID, "name": e.Name, "input": e.Input})
		t := time.NewTimer(toolWait)
		defer t.Stop()
		select {
		case res := <-ch:
			return res, nil
		case <-t.C:
			return sample.ToolResult{Value: json.RawMessage(`"The page tool did not answer in time"`), IsError: true}, nil
		case <-tctx.Done():
			return sample.ToolResult{}, tctx.Err()
		}
	}
	err := s.cfg.Sample.Sample(ctx, req, emit, execute)
	if err != nil && ctx.Err() == nil {
		outcome = "upstream_error"
		send("error", map[string]string{"code": "upstream_error", "message": "The model backend failed"})
		s.cfg.Log.Printf("sample %s: backend: %v", req.CallID, err)
	}
	if ctx.Err() != nil && outcome == "" {
		outcome = "cancelled"
	}
	s.cfg.Log.Printf("sample %s tier=%s model=%s asked=%q tools=%d in=%d out=%d ms=%d outcome=%s",
		req.CallID, in.ModelTier, usage.Model, in.Model, toolUses.Load(), usage.Input, usage.Output,
		time.Since(started).Milliseconds(), outcome)
}

// toolResult takes a tool's result: POST /api/sample/{call}/tools/{use} {value, isError}.
func (s *Server) toolResult(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Value   json.RawMessage `json:"value"`
		IsError bool            `json:"isError"`
	}
	if err := readJSON(w, r, &in, MaxToolResultBytes+1<<10); err != nil || len(in.Value) > MaxToolResultBytes {
		fail(w, 400, "invalid_request", "A tool result is {value, isError} of at most 32 KB")
		return
	}
	var ch chan sample.ToolResult
	if c := s.get(r.PathValue("call")); c != nil {
		ch = s.takeTool(c, r.PathValue("use"))
	}
	if ch == nil {
		fail(w, 404, "not_found", "No such tool use waiting")
		return
	}
	if len(in.Value) == 0 {
		in.Value = json.RawMessage("null")
	}
	ch <- sample.ToolResult{Value: in.Value, IsError: in.IsError}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// cancel stops a call: POST /api/sample/{call}/cancel.
func (s *Server) cancel(w http.ResponseWriter, r *http.Request) {
	if c := s.get(r.PathValue("call")); c != nil {
		c.cancel()
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// ── the call registry ──────────────────────────────────────────────────────────

func (s *Server) add(id string, c *call) { s.mu.Lock(); s.calls[id] = c; s.mu.Unlock() }
func (s *Server) remove(id string)        { s.mu.Lock(); delete(s.calls, id); s.mu.Unlock() }
func (s *Server) get(id string) *call     { s.mu.Lock(); defer s.mu.Unlock(); return s.calls[id] }

// waitTool registers a tool use and returns the channel its result arrives on.
func (s *Server) waitTool(c *call, use string) chan sample.ToolResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	ch := make(chan sample.ToolResult, 1)
	c.tools[use] = ch
	return ch
}

// takeTool removes a tool use; only the first taker gets the channel.
func (s *Server) takeTool(c *call, use string) chan sample.ToolResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	ch := c.tools[use]
	delete(c.tools, use)
	return ch
}

// ── wire helpers ───────────────────────────────────────────────────────────────

func writeSSE(w io.Writer, typ string, data any) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", typ, raw)
	return err
}

func readJSON(w http.ResponseWriter, r *http.Request, v any, limit int) error {
	return json.NewDecoder(http.MaxBytesReader(w, r.Body, int64(limit))).Decode(v)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func randomID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
