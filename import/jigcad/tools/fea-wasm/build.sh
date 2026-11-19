#!/usr/bin/env bash
# Build the two WebAssembly modules jig's stress check (j.fea) runs:
#
#   ccx.mjs + ccx.wasm        CalculiX 2.22 (GPL-2.0), translated with f2c, SPOOLES direct solver
#   tetgen.mjs + tetgen.wasm  TetGen 1.6.0 (AGPL-3.0), the tetrahedral mesher
#
# Both are wasm32, single-threaded, ES modules (MODULARIZE + EXPORT_ES6) that run in a browser
# worker and in Node 22, so the engine tests can solve real decks. Copy the four files to
# import/jigcad/vendor/fea/.
#
# CalculiX goes through Virtastic/freecad-web's pipeline (LGPL-2.1 build scripts: F90 -> F77
# rewriting, f2c, SPOOLES, ARPACK, LAPACK), pinned to a known commit. freecad-web builds wasm64;
# this script swaps its toolchain/env.sh for a wasm32 one and edits the module's link line,
# nothing else.
#
# Usage, on Ubuntu 24.04 (or any Linux with the tools below):
#   bash build.sh [OUT_DIR]                       # default OUT_DIR: ./fea-wasm-out
# On macOS or Windows, run it in a container:
#   docker run --rm -v "$PWD":/w -w /w ubuntu:24.04 bash build.sh /w/fea-wasm-out
#
# Needs: git curl tar unzip bzip2 patch make python3 gcc (the f2c translator is a host tool),
# node (for the smoke test, optional). Inside a bare container the script installs them.
# Takes 20-60 minutes, most of it translating and compiling CalculiX's ~1000 Fortran files.
set -euo pipefail

OUT="$(mkdir -p "${1:-$PWD/fea-wasm-out}" && cd "${1:-$PWD/fea-wasm-out}" && pwd)"
WORK="$(mkdir -p "${WORK:-$PWD/fea-wasm-build}" && cd "${WORK:-$PWD/fea-wasm-build}" && pwd)"
FCWEB_REV=b81991456fdf26f5d3869fbed1ea7e8eccdfb666   # Virtastic/freecad-web, 2026-11-06
TETGEN_REV=b19b98eaeb4dc447bc3ecdfcf4ee1ab2fab1edce  # pyvista/tetgen, src/ is TetGen 1.6.0
EMSDK_VERSION=6.0.9                                  # what freecad-web's pipeline is built with

say() { printf '\n== %s\n' "$*"; }

# ---- tools --------------------------------------------------------------------------------
if [ "$(id -u)" = 0 ] && command -v apt-get >/dev/null && ! command -v gcc >/dev/null; then
  say "installing build tools (bare container)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq build-essential git curl ca-certificates tar unzip bzip2 xz-utils patch \
    python3 cmake nodejs >/dev/null
fi
miss=""
for t in git curl tar unzip bzip2 patch make python3 gcc perl; do command -v "$t" >/dev/null || miss="$miss $t"; done
[ -z "$miss" ] || { echo "missing tools:$miss" >&2; exit 1; }

# ---- freecad-web at the pinned commit --------------------------------------------------------
say "freecad-web $FCWEB_REV"
FC="$WORK/freecad-web"
if [ ! -d "$FC/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/Virtastic/freecad-web "$FC"
fi
git -C "$FC" checkout -q -f "$FCWEB_REV"

# ---- emsdk inside it (its scripts source $ROOT/emsdk/emsdk_env.sh) ----------------------------
say "emsdk $EMSDK_VERSION"
if [ ! -d "$FC/emsdk" ]; then git clone --depth 1 https://github.com/emscripten-core/emsdk "$FC/emsdk"; fi
( cd "$FC/emsdk" && ./emsdk install "$EMSDK_VERSION" >/dev/null && ./emsdk activate "$EMSDK_VERSION" >/dev/null )

# ---- a wasm32 toolchain/env.sh in place of freecad-web's wasm64 one ----------------------------
cat > "$FC/toolchain/env.sh" <<'ENV'
# jig: freecad-web's env.sh, retargeted at wasm32 (no -m64, no wasm EH).
export ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
source "$ROOT/emsdk/emsdk_env.sh" >/dev/null 2>&1
export DW="$ROOT/deps/wasm"
export EMCC_CFLAGS="${JIG_EMCC_CFLAGS:-}"
if emcc -dM -E -x c /dev/null 2>/dev/null | grep -q __wasm64__; then
  echo "[env] FATAL: emcc targets wasm64; this build wants wasm32" >&2
  return 1 2>/dev/null || exit 1
fi
echo "[env] emcc: $(emcc --version 2>/dev/null | head -1) (wasm32)"
ENV

# C has no exceptions; dropping -fwasm-exceptions keeps the module free of any EH feature, so it
# loads in every browser and in Node 22 without flags.
perl -pi -e 's/-fwasm-exceptions\s*//g' "$FC"/build-libf2c-weh.sh "$FC"/build-spooles-weh.sh \
  "$FC"/build-arpack-weh.sh "$FC"/build-ccx-weh.sh "$FC"/build-ccx-module-weh.sh
# The module's link line: an ES module (.mjs), a wasm32 memory ceiling (4 GiB, not 16).
perl -pi -e 's#-o "\$OUT/ccx\.js"#-o "\$OUT/ccx.mjs" -sEXPORT_ES6=1#; s#-sMAXIMUM_MEMORY=17179869184#-sMAXIMUM_MEMORY=4294967296#; s#ls -la "\$OUT/ccx\.js"#ls -la "\$OUT/ccx.mjs"#' \
  "$FC/build-ccx-module-weh.sh"
grep -q 'ccx.mjs' "$FC/build-ccx-module-weh.sh" || { echo "the link-line edit did not apply" >&2; exit 1; }

# ---- sources (the same tarballs freecad-web's build-ccx.yml fetches) ---------------------------
say "sources"
cd "$FC"
mkdir -p deps/src/{ccx,spooles,f2c,arpack,lapack}
if [ ! -f deps/src/ccx/ccx_2.22/src/ccx_2.22.c ]; then
  curl -fsSL -o /tmp/ccx.tar.bz2 http://www.dhondt.de/ccx_2.22.src.tar.bz2
  tar xjf /tmp/ccx.tar.bz2 -C deps/src/ccx --strip-components=2
fi
if [ ! -d deps/src/spooles/SPOOLES.2.2/A2 ]; then
  mkdir -p deps/src/spooles/SPOOLES.2.2
  curl -fsSL -o /tmp/spooles.tgz https://netlib.org/linalg/spooles/spooles.2.2.tgz
  tar xzf /tmp/spooles.tgz -C deps/src/spooles/SPOOLES.2.2
fi
if [ ! -f deps/src/f2c/libf2c/f2c.h0 ]; then
  curl -fsSL -o /tmp/libf2c.zip https://www.netlib.org/f2c/libf2c.zip
  mkdir -p deps/src/f2c/libf2c && unzip -q -o /tmp/libf2c.zip -d deps/src/f2c/libf2c
fi
if [ ! -f deps/src/f2c/src/main.c ]; then
  curl -fsSL -o /tmp/f2csrc.tgz https://netlib.org/f2c/src.tgz
  tar xzf /tmp/f2csrc.tgz -C deps/src/f2c
fi
if [ ! -d deps/src/arpack/arpack-ng-3.9.1 ]; then
  curl -fsSL -o /tmp/arpack.tar.gz https://github.com/opencollab/arpack-ng/archive/refs/tags/3.9.1.tar.gz
  tar xzf /tmp/arpack.tar.gz -C deps/src/arpack
fi
if [ ! -d deps/src/lapack/lapack-3.12.0 ]; then
  curl -fsSL -o /tmp/lapack.tar.gz https://github.com/Reference-LAPACK/lapack/archive/refs/tags/v3.12.0.tar.gz
  tar xzf /tmp/lapack.tar.gz -C deps/src/lapack
fi

say "CalculiX patches"
( cd deps/src/ccx/ccx_2.22
  for pf in "$FC"/patches/ccx-*.patch; do
    if patch -p1 --dry-run --force --silent < "$pf" >/dev/null 2>&1; then patch -p1 --silent < "$pf"; echo "  applied $(basename "$pf")"
    elif patch -p1 -R --dry-run --force --silent < "$pf" >/dev/null 2>&1; then echo "  already applied $(basename "$pf")"
    else echo "$(basename "$pf") does not apply" >&2; exit 1; fi
  done )

say "f2c translator (host)"
( cd deps/src/f2c/src && cp makefile.u makefile && \
  make -s CC=gcc CFLAGS="-O2 -std=gnu89 -w -Wno-implicit-function-declaration -Wno-return-type" f2c )

say "libf2c, SPOOLES, ARPACK"
bash build-libf2c-weh.sh
bash build-spooles-weh.sh
bash build-arpack-weh.sh

say "libccx (f77ify -> f2c -> emcc, the long step)"
FCWEB_CCX_PTHREADS=0 bash build-ccx-weh.sh
if [ -s build-ccx-weh/UNCONVERTED.txt ]; then
  echo "  routines stubbed (expected: e_c3d_us45, slavintmortar, slavintpoints; none used by j.fea):"
  sed 's|.*/||; s/^/    /' build-ccx-weh/UNCONVERTED.txt
fi

say "ccx module"
FCWEB_CCX_PTHREADS=0 bash build-ccx-module-weh.sh
cp play-gui/ccx.mjs play-gui/ccx.wasm "$OUT/"

# ---- TetGen ----------------------------------------------------------------------------------
say "TetGen $TETGEN_REV"
TG="$WORK/tetgen"
if [ ! -d "$TG/.git" ]; then git clone --filter=blob:none --no-checkout https://github.com/pyvista/tetgen "$TG"; fi
git -C "$TG" checkout -q -f "$TETGEN_REV"
source "$FC/emsdk/emsdk_env.sh" >/dev/null 2>&1
# The command-line program, not TETLIBRARY: errors end in exit(), never a C++ throw, so the module
# needs no exception support. The engine calls callMain(['-pq1.414aAQ...', 'in.smesh']) on a fresh
# instance per mesh and reads in.1.node / .ele / .face back from the in-memory file system.
em++ -O2 -w "$TG/src/tetgen.cxx" "$TG/src/predicates.cxx" -o "$OUT/tetgen.mjs" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=TetgenModule \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=4294967296 -sSTACK_SIZE=8MB \
  -sENVIRONMENT=web,worker,node

# ---- smoke test: a one-element tension test against F/(EA), and a TetGen run -------------------
if command -v node >/dev/null; then
  say "smoke test (node $(node --version))"
  cat > "$OUT/smoke.mjs" <<'JS'
import CcxModule from './ccx.mjs';
import TetgenModule from './tetgen.mjs';
const quiet = { print: () => {}, printErr: () => {} };
const ccx = await CcxModule(quiet);
const deck = `*NODE, NSET=NALL
1,0,0,0
2,1,0,0
3,1,1,0
4,0,1,0
5,0,0,1
6,1,0,1
7,1,1,1
8,0,1,1
*ELEMENT, TYPE=C3D8, ELSET=EALL
1,1,2,3,4,5,6,7,8
*MATERIAL, NAME=STEEL
*ELASTIC
210000., 0.3
*SOLID SECTION, ELSET=EALL, MATERIAL=STEEL
*BOUNDARY
1,1,3
4,1,1
4,3,3
5,1,2
8,1,1
*STEP
*STATIC
*CLOAD
2,1,250.
3,1,250.
6,1,250.
7,1,250.
*NODE PRINT, NSET=NALL
U
*END STEP
`;
ccx.FS.writeFile('/job.inp', deck);
ccx.FS.chdir('/');
let rc;
try { rc = ccx.ccall('fcweb_ccx_run', 'number', ['string'], ['job']); }
catch (e) { if (e && e.name === 'ExitStatus') rc = e.status; else throw e; }
const dat = ccx.FS.readFile('/job.dat', { encoding: 'utf8' });
const ux = Math.max(...dat.split('\n').map((l) => l.trim().split(/\s+/)).filter((f) => f.length === 4 && /^\d+$/.test(f[0])).map((f) => +f[1]));
const want = 1000 / 210000;
console.log(`ccx: rc ${rc}, ux ${ux.toExponential(5)} mm, F/(EA) ${want.toExponential(5)} mm`);
if (!(Math.abs(ux / want - 1) < 1e-6)) { console.error(dat); process.exit(1); }
const tg = await TetgenModule(quiet);
tg.FS.writeFile('/cube.node', '8 3 0 0\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\n5 0 0 1\n6 1 0 1\n7 1 1 1\n8 0 1 1\n');
tg.callMain(['-Q', 'cube.node']);
const ele = tg.FS.readFile('/cube.1.ele', { encoding: 'utf8' }).trim().split('\n')[0];
console.log(`tetgen: ${ele.split(/\s+/)[0]} tetrahedra in a cube`);
JS
  ( cd "$OUT" && node smoke.mjs )
fi

( cd "$OUT" && sha256sum ccx.mjs ccx.wasm tetgen.mjs tetgen.wasm > SHA256SUMS && cat > VERSIONS <<EOF
ccx         CalculiX 2.22 (GPL-2.0), freecad-web $FCWEB_REV pipeline, wasm32, single-threaded, SPOOLES
tetgen      TetGen 1.6.0 (AGPL-3.0), pyvista/tetgen $TETGEN_REV src/
emscripten  $(emcc --version | head -1)
EOF
)
say "done: $OUT"
ls -la "$OUT"
