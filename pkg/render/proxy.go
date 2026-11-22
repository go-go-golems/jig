package render

import (
	"encoding/json"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// ServeRT proxies the page's WebSocket (GET /rt) to the child, adding the child's token. It answers 503 when the
// child is not up, and 403 to a browser on another origin.
func (s *Sidecar) ServeRT(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		fail(w, http.StatusForbidden, "forbidden_origin", "Open /rt from the workbench's own origin")
		return
	}
	s.mu.Lock()
	p, st := s.proxy, s.st
	s.mu.Unlock()
	if p == nil {
		msg := "candela-rt is " + string(st.State)
		if st.Reason != "" {
			msg += ": " + st.Reason
		}
		fail(w, http.StatusServiceUnavailable, "rt_unavailable", msg)
		return
	}
	p.ServeHTTP(w, r)
}

// capabilities is the answer of GET /api/render/capabilities.
type capabilities struct {
	RT       bool   `json:"rt"` // /rt is proxied to a running candela-rt
	State    State  `json:"state"`
	Reason   string `json:"reason"`
	Restarts int    `json:"restarts"`
}

// ServeCapabilities answers GET /api/render/capabilities: {rt, state, reason, restarts}. The GPU's details come
// from candela-rt's own hello over /rt.
func (s *Sidecar) ServeCapabilities(w http.ResponseWriter, _ *http.Request) {
	st := s.Status()
	writeJSON(w, http.StatusOK, capabilities{RT: st.State == StateUp, State: st.State, Reason: st.Reason, Restarts: st.Restarts})
}

// newProxy forwards requests to the child at addr: the path becomes "/", and the query gets the child's token in
// place of any the client sent. The jigcad token (cookie or bearer) stays here. ReverseProxy keeps the Upgrade
// headers of a WebSocket handshake and splices the two connections after the child's 101.
func newProxy(addr, token string, logger *log.Logger) *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(&url.URL{Scheme: "http", Host: addr})
			q := pr.In.URL.Query()
			q.Set("token", token)
			pr.Out.URL.Path, pr.Out.URL.RawPath, pr.Out.URL.RawQuery = "/", "", q.Encode()
			pr.Out.Header.Del("Cookie")
			pr.Out.Header.Del("Authorization")
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			logger.Printf("render: proxying /rt: %v", err)
			fail(w, http.StatusBadGateway, "rt_unreachable", "candela-rt did not answer")
		},
	}
}

// sameOrigin refuses a browser's cross-site WebSocket: browsers send cookies with one but no CORS check guards it,
// so the Origin, when present, must be this server.
func sameOrigin(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return true
	}
	u, err := url.Parse(o)
	return err == nil && strings.EqualFold(u.Host, r.Host)
}

// writeJSON and fail answer as package server does: {"error": {"code", "message"}}.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}
