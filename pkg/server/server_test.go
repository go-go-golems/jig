package server

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/go-go-golems/jig/pkg/sample"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fake asks the page for one eval tool call, then answers with the tool's result.
type fake struct{ got chan sample.Request }

func (f *fake) Models() []sample.Model {
	return []sample.Model{{Provider: "lunaroute", ID: "glm-5.3-flash", Tier: "default"}}
}
func (f *fake) Close() error { return nil }
func (f *fake) Sample(ctx context.Context, r sample.Request, emit func(sample.Event), execute sample.ExecuteTool) error {
	if f.got != nil {
		f.got <- r
	}
	emit(sample.Event{Type: "text", Text: "Let me look.", Delta: "Let me look."})
	if len(r.Tools) == 0 {
		emit(sample.Event{Type: "result", Result: &sample.Result{Text: "no tools", ModelTierApplied: r.Options.ModelTier}})
		return nil
	}
	res, err := execute(ctx, sample.Event{Type: "tool", ToolCallID: "use1", Name: "eval", Input: json.RawMessage(`{"code":"1+1"}`)})
	if err != nil {
		emit(sample.Event{Type: "error", Error: &sample.Failure{Code: "cancelled", Message: "cancelled"}})
		return nil
	}
	emit(sample.Event{Type: "usage", Usage: &sample.Usage{Input: 10, Output: 3, Model: "lunaroute/glm-5.3-flash"}})
	emit(sample.Event{Type: "result", Result: &sample.Result{Text: "The answer is " + string(res.Value), ModelTierApplied: r.Options.ModelTier}})
	return nil
}

type event struct {
	typ  string
	data map[string]any
}

// events reads SSE events from body onto a channel.
func events(t *testing.T, body io.Reader) <-chan event {
	ch := make(chan event, 16)
	go func() {
		defer close(ch)
		sc := bufio.NewScanner(body)
		var typ string
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, "event: "):
				typ = line[7:]
			case strings.HasPrefix(line, "data: "):
				var d map[string]any
				_ = json.Unmarshal([]byte(line[6:]), &d)
				ch <- event{typ, d}
			}
		}
	}()
	return ch
}

func next(t *testing.T, ch <-chan event) event {
	t.Helper()
	select {
	case e, ok := <-ch:
		require.True(t, ok, "stream ended early")
		return e
	case <-time.After(5 * time.Second):
		t.Fatal("no event")
		return event{}
	}
}

func quiet() *log.Logger { return log.New(io.Discard, "", 0) }

const body = `{"input":[{"role":"user","content":"what is 1+1?"}],"modelTier":"complex",
  "tools":[{"name":"eval","description":"run code","inputSchema":{"type":"object","properties":{"code":{"type":"string"}}}}]}`

func TestToolRoundTrip(t *testing.T) {
	f := &fake{got: make(chan sample.Request, 1)}
	ts := httptest.NewServer(New(Config{Sample: f, MaxRounds: 20, Log: quiet()}))
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/sample", "application/json", strings.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
	ch := events(t, resp.Body)

	call := next(t, ch)
	require.Equal(t, "call", call.typ)
	id := call.data["call"].(string)
	req := <-f.got
	assert.Equal(t, 20, req.MaxRounds)
	assert.Equal(t, "complex", req.Options.ModelTier)

	assert.Equal(t, "text", next(t, ch).typ)
	tool := next(t, ch)
	require.Equal(t, "tool", tool.typ)
	assert.Equal(t, "eval", tool.data["name"])
	assert.Equal(t, map[string]any{"code": "1+1"}, tool.data["input"])

	r, err := http.Post(ts.URL+"/api/sample/"+id+"/tools/use1", "application/json", strings.NewReader(`{"value":"2","isError":false}`))
	require.NoError(t, err)
	assert.Equal(t, 200, r.StatusCode)
	r.Body.Close()

	res := next(t, ch)
	require.Equal(t, "result", res.typ, "usage events are not forwarded")
	assert.Equal(t, `The answer is "2"`, res.data["text"])
	u := res.data["usage"].(map[string]any)
	assert.EqualValues(t, 10, u["input"])
	assert.EqualValues(t, 3, u["output"])
	assert.EqualValues(t, 1, u["rounds"])
	assert.EqualValues(t, 1, u["toolCalls"])
	assert.Equal(t, "lunaroute/glm-5.3-flash", u["model"])

	// The tool use is gone once answered.
	r, err = http.Post(ts.URL+"/api/sample/"+id+"/tools/use1", "application/json", strings.NewReader(`{"value":"2"}`))
	require.NoError(t, err)
	assert.Equal(t, 404, r.StatusCode)
	r.Body.Close()
}

func TestCancelWhileToolWaits(t *testing.T) {
	ts := httptest.NewServer(New(Config{Sample: &fake{}, Log: quiet()}))
	defer ts.Close()
	resp, err := http.Post(ts.URL+"/api/sample", "application/json", strings.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()
	ch := events(t, resp.Body)
	id := next(t, ch).data["call"].(string)
	next(t, ch) // text
	require.Equal(t, "tool", next(t, ch).typ)
	r, err := http.Post(ts.URL+"/api/sample/"+id+"/cancel", "application/json", nil)
	require.NoError(t, err)
	r.Body.Close()
	e := next(t, ch)
	assert.Equal(t, "error", e.typ)
	assert.Equal(t, "cancelled", e.data["code"])
	assert.NotNil(t, e.data["usage"], "error events carry usage too")
}

func TestRejectsBeforeStreaming(t *testing.T) {
	ts := httptest.NewServer(New(Config{Sample: &fake{}, Log: quiet()}))
	defer ts.Close()
	for _, tc := range []struct{ body, code string }{
		{`{"input":[{"role":"assistant","content":"x"}]}`, "invalid_request"},
		{`{"input":"` + strings.Repeat("x", MaxPromptBytes+1) + `"}`, "prompt_too_large"},
		{`not json`, "invalid_request"},
	} {
		r, err := http.Post(ts.URL+"/api/sample", "application/json", strings.NewReader(tc.body))
		require.NoError(t, err)
		var out struct{ Error struct{ Code string } }
		require.NoError(t, json.NewDecoder(r.Body).Decode(&out))
		r.Body.Close()
		assert.Equal(t, 400, r.StatusCode)
		assert.Equal(t, tc.code, out.Error.Code)
	}
}

func TestNoBackend(t *testing.T) {
	ts := httptest.NewServer(New(Config{Log: quiet()}))
	defer ts.Close()
	r, err := http.Get(ts.URL + "/api/sample/models")
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.NewDecoder(r.Body).Decode(&m))
	r.Body.Close()
	assert.Equal(t, false, m["available"])
	r, err = http.Post(ts.URL+"/api/sample", "application/json", strings.NewReader(body))
	require.NoError(t, err)
	r.Body.Close()
	assert.Equal(t, 503, r.StatusCode)
}

func TestTokenAndStatic(t *testing.T) {
	static := fstest.MapFS{"index.html": {Data: []byte("<!doctype html>jigcad")}}
	ts := httptest.NewServer(New(Config{Sample: &fake{}, Static: static, Token: "s3cret", Tiers: map[string]string{"default": "lunaroute/glm-5.3-flash"}, Log: quiet()}))
	defer ts.Close()

	r, err := http.Get(ts.URL + "/api/sample/models")
	require.NoError(t, err)
	r.Body.Close()
	assert.Equal(t, 401, r.StatusCode)

	req, _ := http.NewRequest("GET", ts.URL+"/api/sample/models", nil)
	req.Header.Set("Authorization", "Bearer s3cret")
	r, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.NewDecoder(r.Body).Decode(&m))
	r.Body.Close()
	assert.Equal(t, true, m["available"])
	assert.Equal(t, map[string]any{"default": "lunaroute/glm-5.3-flash"}, m["tiers"])
	assert.EqualValues(t, sample.DefaultRounds, m["maxRounds"])

	// ?token= sets the cookie and redirects to the clean address.
	noFollow := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	r, err = noFollow.Get(ts.URL + "/?token=s3cret")
	require.NoError(t, err)
	r.Body.Close()
	assert.Equal(t, http.StatusSeeOther, r.StatusCode)
	assert.Equal(t, "/", r.Header.Get("Location"))
	var cookie *http.Cookie
	for _, c := range r.Cookies() {
		if c.Name == "jigcad_token" {
			cookie = c
		}
	}
	require.NotNil(t, cookie)

	req, _ = http.NewRequest("GET", ts.URL+"/api/sample/models", nil)
	req.AddCookie(cookie)
	r, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	r.Body.Close()
	assert.Equal(t, 200, r.StatusCode)

	r, err = http.Get(ts.URL + "/")
	require.NoError(t, err)
	b, _ := io.ReadAll(r.Body)
	r.Body.Close()
	assert.Contains(t, string(b), "jigcad", "static files need no token")
}
