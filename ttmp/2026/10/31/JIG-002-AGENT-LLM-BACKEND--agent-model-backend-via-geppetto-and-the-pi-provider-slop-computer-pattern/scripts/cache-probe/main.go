// cache-probe runs one multi-round tool call per tier through the gepp backend and prints each round's usage, to
// see whether the provider reports prompt-cache hits. Point --pi-agent-dir at a copy of ~/.pi/agent whose provider
// base URL goes through a logging proxy (plain HTTP on loopback needs pi.WithLocalProviders, enabled here).
//
//	go run ./ttmp/…/scripts/cache-probe --pi-agent-dir DIR --reference import/jigcad/src/agent/reference.md
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/go-go-golems/geppetto/pkg/steps/ai/providers/pi"
	"github.com/go-go-golems/jig/pkg/sample"
	"github.com/go-go-golems/jig/pkg/sample/gepp"
)

func main() {
	dir := flag.String("pi-agent-dir", "", "Pi agent directory")
	refPath := flag.String("reference", "import/jigcad/src/agent/reference.md", "agent reference (the cached prefix)")
	tiers := flag.String("tiers", "default,complex", "tiers to probe")
	local := flag.Bool("local", true, "allow plain-HTTP/loopback provider URLs (for a logging proxy)")
	flag.Parse()
	ref, err := os.ReadFile(*refPath)
	if err != nil {
		panic(err)
	}
	var opts []pi.Option
	if *local {
		opts = append(opts, pi.WithLocalProviders())
	}
	b, err := gepp.New(gepp.Config{AgentDir: *dir, Options: opts,
		Tiers: map[string]string{"quick": "lunaroute/glm-5.3-flash", "default": "lunaroute/glm-5.3-flash", "complex": "lunaroute/deepseek-4.1-flash"}})
	if err != nil {
		panic(err)
	}
	schema := json.RawMessage(`{"type":"object","properties":{"code":{"type":"string"}},"required":["code"]}`)
	prompt := string(ref) + "\n---\nThis is a protocol test. Call the eval tool exactly four times, one call per message, " +
		"with code `return n` for n = 1, 2, 3, 4 in order. After the fourth result, reply with the word done."
	input, _ := json.Marshal([]map[string]string{{"role": "user", "content": prompt}})
	for _, tier := range strings.Split(*tiers, ",") {
		round := 0
		emit := func(e sample.Event) {
			switch {
			case e.Type == "usage" && e.Usage != nil:
				round++
				fmt.Printf("%s round %d: input %d cacheRead %d cacheWrite %d output %d (%s)\n", tier, round,
					e.Usage.Input, e.Usage.CacheRead, e.Usage.CacheWrite, e.Usage.Output, e.Usage.Model)
			case e.Type == "result":
				fmt.Printf("%s result: %q\n", tier, e.Result.Text)
			case e.Type == "error":
				fmt.Printf("%s error: %s\n", tier, e.Error.Code)
			}
		}
		exec := func(context.Context, sample.Event) (sample.ToolResult, error) {
			return sample.ToolResult{Value: json.RawMessage(`"value: ok"`)}, nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		req := sample.Request{CallID: "probe-" + tier, Input: input, Options: sample.Options{ModelTier: tier},
			Tools: []sample.Tool{{Name: "eval", Description: "Run an async JavaScript function body.", InputSchema: schema}}, MaxRounds: 8}
		if err := b.Sample(ctx, req, emit, exec); err != nil {
			fmt.Printf("%s backend error: %v\n", tier, err)
		}
		cancel()
	}
}
