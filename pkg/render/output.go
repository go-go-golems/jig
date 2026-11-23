package render

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"log"
	"sync"
)

const (
	tailLines   = 3   // lines of the child's output kept for Status.Reason
	tailLineMax = 240 // bytes of each
)

// output logs a child's output line by line, prefixed "candela-rt: ", and keeps its last lines.
type output struct {
	log  *log.Logger
	mu   sync.Mutex
	last []string
}

// copy reads r until EOF. It keeps reading past overlong lines, so the child never blocks on a full pipe.
func (o *output) copy(r io.Reader) {
	br := bufio.NewReaderSize(r, 64<<10)
	for {
		line, err := br.ReadSlice('\n')
		if len(line) > 0 {
			o.line(line)
		}
		if err != nil && !errors.Is(err, bufio.ErrBufferFull) {
			return
		}
	}
}

func (o *output) line(b []byte) {
	b = bytes.TrimRight(b, "\r\n")
	if len(bytes.TrimSpace(b)) == 0 {
		return
	}
	o.log.Printf("candela-rt: %s", b)
	if len(b) > tailLineMax {
		b = append(b[:tailLineMax:tailLineMax], "…"...)
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	o.last = append(o.last, string(b))
	if len(o.last) > tailLines {
		o.last = o.last[len(o.last)-tailLines:]
	}
}

func (o *output) tail() []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]string(nil), o.last...)
}
