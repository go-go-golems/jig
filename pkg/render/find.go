package render

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
)

// BundleName is Candela's engine bundle in the workbench's built files; candela-rt loads it with --bundle.
const BundleName = "candela-core.js"

// EnvBinary names the candela-rt binary for --render auto.
const EnvBinary = "JIGCAD_CANDELA_RT"

var (
	// ErrOff is Find's answer to --render off.
	ErrOff = errors.New("rendering on candela-rt is off (--render off)")
	// ErrNotFound means --render auto found no binary, the common case: rendering stays in the browser.
	ErrNotFound = errors.New("no candela-rt binary (put it next to jigcad or on PATH, set " + EnvBinary + ", or pass --render <path>)")
)

// selfDir is the directory of the running jigcad binary, symlinks resolved: a release unpacks candela-rt beside it.
// A variable so tests can point it elsewhere.
var selfDir = func() string {
	p, err := os.Executable()
	if err != nil {
		return ""
	}
	if r, err := filepath.EvalSymlinks(p); err == nil {
		p = r
	}
	return filepath.Dir(p)
}

// Find resolves --render to a binary's absolute path. "off" or empty gives ErrOff; "auto" gives $JIGCAD_CANDELA_RT
// when set, else a candela-rt next to the jigcad binary, else candela-rt from PATH, else ErrNotFound; anything else
// is a path (or a name looked up on PATH).
// A binary that is named, by the flag or the variable, and cannot be used is another error.
func Find(mode string) (string, error) {
	switch mode {
	case "", "off":
		return "", ErrOff
	case "auto":
		if p := os.Getenv(EnvBinary); p != "" {
			return lookup(p, "$"+EnvBinary)
		}
		if d := selfDir(); d != "" {
			if p, err := exec.LookPath(filepath.Join(d, "candela-rt")); err == nil {
				return filepath.Abs(p)
			}
		}
		p, err := exec.LookPath("candela-rt")
		if err != nil {
			return "", ErrNotFound
		}
		return filepath.Abs(p)
	default:
		return lookup(mode, "--render")
	}
}

func lookup(path, from string) (string, error) {
	p, err := exec.LookPath(path)
	if err != nil {
		var e *exec.Error
		if errors.As(err, &e) {
			err = e.Err
		}
		return "", fmt.Errorf("%s %s: %w", from, path, err)
	}
	return filepath.Abs(p)
}

// extract copies candela-core.js out of fsys into a new temporary directory, which cleanup removes.
func extract(fsys fs.FS) (string, func(), error) {
	dir, err := os.MkdirTemp("", "jigcad-candela-")
	if err != nil {
		return "", nil, err
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	path := filepath.Join(dir, BundleName)
	if err := copyOut(fsys, path); err != nil {
		cleanup()
		return "", nil, err
	}
	return path, cleanup, nil
}

func copyOut(fsys fs.FS, path string) error {
	in, err := fsys.Open(BundleName)
	if err != nil {
		return err
	}
	defer func() { _ = in.Close() }()
	out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}
