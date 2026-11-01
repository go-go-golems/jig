// usage-proxy forwards to lunaroute and logs only the `usage` objects (and the model) of streamed responses.
// No headers, prompts or credentials are logged.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

type scan struct {
	r   io.ReadCloser
	buf bytes.Buffer
	out *log.Logger
}

func (s *scan) Read(p []byte) (int, error) {
	n, err := s.r.Read(p)
	s.buf.Write(p[:n])
	for {
		line, e := s.buf.ReadString('\n')
		if e != nil {
			s.buf.Reset()
			s.buf.WriteString(line)
			break
		}
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data: {") {
			continue
		}
		var m map[string]any
		if json.Unmarshal([]byte(line[6:]), &m) == nil && m["usage"] != nil {
			u, _ := json.Marshal(map[string]any{"model": m["model"], "usage": m["usage"]})
			s.out.Println(string(u))
		}
	}
	return n, err
}
func (s *scan) Close() error { return s.r.Close() }

func main() {
	target, _ := url.Parse("https://gw.lunaroute.com")
	out := log.New(os.Stdout, "", log.Ltime)
	p := httputil.NewSingleHostReverseProxy(target)
	d := p.Director
	p.Director = func(r *http.Request) { d(r); r.Host = target.Host }
	p.FlushInterval = -1
	p.ModifyResponse = func(resp *http.Response) error {
		out.Printf("status %d %s", resp.StatusCode, resp.Request.URL.Path)
		resp.Body = &scan{r: resp.Body, out: out}
		return nil
	}
	log.Fatal(http.ListenAndServe("127.0.0.1:9911", p))
}
