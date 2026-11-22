package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/go-go-golems/jig/pkg/render"
	"github.com/go-go-golems/jig/pkg/render/rendertest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	rendertest.Main() // TestRenderWebSocket runs this binary as candela-rt
	os.Exit(m.Run())
}

func getAPI(t *testing.T, url string, header http.Header) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range header {
		req.Header[k] = v
	}
	r, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer r.Body.Close()
	var out map[string]any
	require.NoError(t, json.NewDecoder(r.Body).Decode(&out))
	return r.StatusCode, out
}

func errCode(out map[string]any) any {
	e, _ := out["error"].(map[string]any)
	return e["code"]
}

func TestRenderRoutesWithoutRenderer(t *testing.T) {
	static := fstest.MapFS{"index.html": {Data: []byte("<!doctype html>jigcad")}}
	ts := httptest.NewServer(New(Config{Static: static, Token: "s3cret", Log: quiet()}))
	defer ts.Close()
	bearer := http.Header{"Authorization": {"Bearer s3cret"}}

	code, out := getAPI(t, ts.URL+"/api/render/capabilities", nil)
	assert.Equal(t, 401, code, "capabilities sit behind the token")
	assert.Equal(t, "unauthorized", errCode(out))
	code, out = getAPI(t, ts.URL+"/rt", nil)
	assert.Equal(t, 401, code, "/rt sits behind the token")
	assert.Equal(t, "unauthorized", errCode(out))

	code, out = getAPI(t, ts.URL+"/api/render/capabilities", bearer)
	assert.Equal(t, 200, code, "the /api/ catch-all does not shadow the route")
	assert.Equal(t, false, out["rt"])
	assert.Equal(t, "off", out["state"])
	assert.NotEmpty(t, out["reason"])
	assert.EqualValues(t, 0, out["restarts"])

	code, out = getAPI(t, ts.URL+"/rt", bearer)
	assert.Equal(t, 503, code)
	assert.Equal(t, "rt_unavailable", errCode(out))

	code, out = getAPI(t, ts.URL+"/api/render/other", bearer)
	assert.Equal(t, 404, code)
	assert.Equal(t, "not_found", errCode(out))
	r, err := http.Post(ts.URL+"/api/render/capabilities", "application/json", nil)
	require.NoError(t, err)
	r.Body.Close()
	assert.Equal(t, 404, r.StatusCode, "only GET")
}

// TestRenderWebSocket opens the workbench with ?token=, then a WebSocket to /rt with the cookie that set, as a page
// does, through the server and the sidecar's proxy to a fake candela-rt.
func TestRenderWebSocket(t *testing.T) {
	dist := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dist, "index.html"), []byte("<!doctype html>jigcad"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dist, render.BundleName), []byte("// core"), 0o644))
	rt := render.New(render.Config{Mode: rendertest.Binary(t), DistDir: dist, Log: quiet()})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { defer close(done); rt.Run(ctx) }()
	defer func() { cancel(); <-done }()
	require.Eventually(t, func() bool { return rt.Status().State == render.StateUp }, 10*time.Second, 10*time.Millisecond)

	ts := httptest.NewServer(New(Config{Static: os.DirFS(dist), Token: "s3cret", Render: rt, Log: quiet()}))
	defer ts.Close()
	noFollow := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	r, err := noFollow.Get(ts.URL + "/?token=s3cret")
	require.NoError(t, err)
	r.Body.Close()
	var cookie string
	for _, c := range r.Cookies() {
		if c.Name == "jigcad_token" {
			cookie = c.Name + "=" + c.Value // as the browser sends it back
		}
	}
	require.NotEmpty(t, cookie)

	code, out := getAPI(t, ts.URL+"/api/render/capabilities", http.Header{"Cookie": {cookie}})
	assert.Equal(t, 200, code)
	assert.Equal(t, true, out["rt"])
	assert.Equal(t, "up", out["state"])

	addr := ts.Listener.Addr().String()
	conn, _, res, err := rendertest.Handshake(addr, "/rt", http.Header{"Origin": {"http://evil.example"}, "Cookie": {cookie}})
	require.NoError(t, err)
	_ = conn.Close()
	assert.Equal(t, 403, res.StatusCode, "a cross-site page cannot ride the cookie")
	conn, _, res, err = rendertest.Handshake(addr, "/rt", http.Header{"Origin": {ts.URL}})
	require.NoError(t, err)
	_ = conn.Close()
	assert.Equal(t, 401, res.StatusCode, "no cookie, no socket")

	conn, br, res, err := rendertest.Handshake(addr, "/rt", http.Header{"Origin": {ts.URL}, "Cookie": {cookie}})
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()
	require.Equal(t, http.StatusSwitchingProtocols, res.StatusCode)
	assert.True(t, strings.HasPrefix(res.Header.Get("X-Fake-Uri"), "/?token="), "the proxy adds candela-rt's token")
	assert.NotContains(t, res.Header.Get("X-Fake-Uri"), "s3cret", "and not jigcad's")
	_, err = conn.Write([]byte(`{"type":"hello"}`))
	require.NoError(t, err)
	got := make([]byte, len(`{"type":"hello"}`))
	_, err = io.ReadFull(br, got)
	require.NoError(t, err)
	assert.Equal(t, `{"type":"hello"}`, string(got))
}
