// Package jigcad holds the workbench's built files for the Go server. Build them with `node build.mjs`; build the
// server with `-tags embed` to compile dist/ into the binary (see embed.go). Without the tag, Dist is nil and
// `jigcad serve` reads the files from --dist.
package jigcad

import "io/fs"

// Dist is the built workbench (index.html, app.js, worker.js, jig_compute.wasm, occt/, fonts/), or nil.
var Dist fs.FS
