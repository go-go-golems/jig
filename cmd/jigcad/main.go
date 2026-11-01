// Command jigcad serves the jigcad workbench and its agent's model backend.
//
//	jigcad serve [--listen 127.0.0.1:8787] [--dist import/jigcad/dist] [--token T]
//
// Model calls go through Pi's agent directory (~/.pi/agent: models, credentials) with geppetto's providers/pi;
// the default tiers use lunaroute (quick and default: glm-5.3-flash, complex: deepseek-4.1-flash).
package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/go-go-golems/jig/import/jigcad"
	"github.com/go-go-golems/jig/pkg/sample"
	"github.com/go-go-golems/jig/pkg/sample/gepp"
	"github.com/go-go-golems/jig/pkg/server"
	"github.com/spf13/cobra"
)

type serveFlags struct {
	listen, dist, piDir, token string
	quick, def, complex        string
	maxRounds                  int
	noModels                   bool
}

func main() {
	root := &cobra.Command{Use: "jigcad", Short: "The jigcad CAD workbench and its agent backend", SilenceUsage: true}
	root.AddCommand(serveCmd())
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func serveCmd() *cobra.Command {
	f := serveFlags{}
	c := &cobra.Command{
		Use:   "serve",
		Short: "Serve the workbench and the agent's model calls (POST /api/sample)",
		Long: `Serve the workbench's built files and the agent's model backend.

The agent panel calls POST /api/sample; the server runs model rounds through Pi's agent directory and asks the
page to run each eval tool call. Credentials stay in Pi's files on this machine. The server binds 127.0.0.1 by
default; set --token (or JIGCAD_TOKEN) before listening on another address, then open /?token=… once.`,
		RunE: func(cmd *cobra.Command, _ []string) error { return serve(cmd.Context(), f) },
	}
	fl := c.Flags()
	fl.StringVar(&f.listen, "listen", "127.0.0.1:8787", "address to listen on")
	fl.StringVar(&f.dist, "dist", "", "the workbench's built files (default: embedded copy, else ./import/jigcad/dist)")
	fl.StringVar(&f.piDir, "pi-agent-dir", "", "Pi's agent directory (default: $PI_CODING_AGENT_DIR or ~/.pi/agent)")
	fl.StringVar(&f.quick, "model-quick", "lunaroute/glm-5.3-flash", "model of the quick tier (provider/id[:thinking])")
	fl.StringVar(&f.def, "model-default", "lunaroute/glm-5.3-flash", "model of the default tier")
	fl.StringVar(&f.complex, "model-complex", "lunaroute/deepseek-4.1-flash", "model of the complex tier")
	fl.IntVar(&f.maxRounds, "max-rounds", sample.DefaultRounds, fmt.Sprintf("model rounds per agent turn (at most %d)", sample.MaxRounds))
	fl.StringVar(&f.token, "token", os.Getenv("JIGCAD_TOKEN"), "require this token on /api/ (env JIGCAD_TOKEN)")
	fl.BoolVar(&f.noModels, "no-models", false, "serve the workbench without a model backend")
	return c
}

func serve(ctx context.Context, f serveFlags) error {
	if f.maxRounds < 1 || f.maxRounds > sample.MaxRounds {
		return fmt.Errorf("--max-rounds must be between 1 and %d", sample.MaxRounds)
	}
	if host, _, err := net.SplitHostPort(f.listen); err == nil && f.token == "" && !loopback(host) {
		return fmt.Errorf("--listen %s is not a loopback address: set --token (or JIGCAD_TOKEN) so others cannot spend the Pi credentials", f.listen)
	}
	static, where, err := staticFiles(f.dist)
	if err != nil {
		return err
	}
	tiers := map[string]string{"quick": f.quick, "default": f.def, "complex": f.complex}
	cfg := server.Config{Static: static, Tiers: tiers, MaxRounds: f.maxRounds, Token: f.token}
	if !f.noModels {
		dir := f.piDir
		if dir == "" {
			dir = os.Getenv("PI_CODING_AGENT_DIR")
		}
		if dir == "" {
			home, _ := os.UserHomeDir()
			dir = filepath.Join(home, ".pi", "agent")
		}
		b, err := gepp.New(gepp.Config{AgentDir: dir, Tiers: tiers})
		if err != nil {
			return fmt.Errorf("model backend (Pi agent directory %s): %w (or pass --no-models)", dir, err)
		}
		defer b.Close()
		cfg.Sample = b
		for _, m := range b.Models() {
			if m.Tier != "" {
				log.Printf("tier %-8s %s/%s", m.Tier, m.Provider, m.ID)
			}
		}
	}
	srv := &http.Server{Addr: f.listen, Handler: server.New(cfg), ReadHeaderTimeout: 10 * time.Second}
	ln, err := net.Listen("tcp", f.listen)
	if err != nil {
		return err
	}
	log.Printf("jigcad serving %s on http://%s/ (models: %v, max rounds %d)", where, ln.Addr(), cfg.Sample != nil, f.maxRounds)

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil && !errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	return nil
}

// staticFiles picks the workbench's files: --dist, the embedded copy, or ./import/jigcad/dist.
func staticFiles(dir string) (fs.FS, string, error) {
	switch {
	case dir != "":
	case jigcad.Dist != nil:
		return jigcad.Dist, "the embedded workbench", nil
	default:
		dir = filepath.Join("import", "jigcad", "dist")
	}
	if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
		return nil, "", fmt.Errorf("no workbench at %s (build it with `node build.mjs` in import/jigcad, or pass --dist)", dir)
	}
	return os.DirFS(dir), dir, nil
}

func loopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
