#!/usr/bin/env python3
"""verify-numbers.py: recompute the numbers claimed in jig's example `// →` comments.

Every check names an example file (by its number prefix), a pattern that finds the line and captures
the claimed value, a short description, and a value recomputed from inputs stated in the examples.
Line numbers and claimed values are read from the files at run time, so checks survive edits that move
lines, and a corrected number is picked up without touching this script.

Pattern language (everything else is literal; a run of spaces matches any run of whitespace):
    @N  the claimed number (captured)        @X  any number (not captured)
    @S  the claimed text (captured, lazy)    ~   any text (lazy)
A pattern that starts with 're:' is a raw regular expression in which only @N, @X and @S are expanded.

Status
    PASS     equal at the digits shown in the comment
    NEAR     within 1 % but not equal at the shown digits (counts as a pass unless --strict)
    FAIL     off by more than 1 %, or wrong at the shown digits for a check marked strict
    MISSING  the pattern no longer matches any line (the example changed; update the check)

Skipped on purpose: illustrative numbers (timings, print times, hashes, cache hit rates that need the
whole trace, Monte Carlo draws, masses from unstated infill models, text and logo areas).

Usage: python3 tools/verify-numbers.py [--dir EXAMPLES] [--strict] [--problems]
Exit status: 0 if every check passes, 1 if any check is FAIL or MISSING (or NEAR with --strict).
Standard library only.
"""

import argparse
import glob
import math
import os
import re
import signal
import sys

pi, sqrt, sin, cos, tan, atan, atan2 = math.pi, math.sqrt, math.sin, math.cos, math.tan, math.atan, math.atan2
rad, deg = math.radians, math.degrees

# ── Shared inputs, each stated in the examples ───────────────────────────────────────────────────────
LW, LAYER, NOZZLE = 0.45, 0.2, 0.4                     # 01: the fdm04 context (lw, layer, nozzle in mm)
FIT = dict(press=0.05, snug=0.10, slide=0.20, free=0.30, printInPlace=0.40)   # 16: j.fit.classes() defaults
HOLECOMP = 0.10                                        # 16/14: default hole compensation (mm, on Ø)
RHO = dict(PLA=1.24, PETG=1.27, ABS=1.04)              # 17: material library, g/cm³
PLA_USD_KG = 22.0                                      # 17/01: PLA price
FIL_AREA = pi * (1.75 / 2) ** 2                        # 17: filament cross-section, mm²
INSERT_M3_HOLE = (4.0, 6.7)                            # 14: heat-set insert M3x5.7 hole Ø × depth, mm


def hole(nominal, cls):
    """14: modelled Ø = nominal + 2·c(class) + holeComp (uncalibrated defaults from 16)."""
    return nominal + 2 * FIT[cls] + HOLECOMP


def rounded_rect(w, h, r):
    return w * h - (4 - pi) * r * r


def circ_strip(a, r):
    """∫_{−a}^{a} √(r² − y²) dy."""
    return a * sqrt(r * r - a * a) + r * r * math.asin(a / r)


def phi(z):
    return 0.5 * (1 + math.erf(z / sqrt(2)))


# ── Pattern compiler and file access ─────────────────────────────────────────────────────────────────
NUM = r"[-−+]?\d+(?:'\d{3})*(?:\.\d+)?(?:e[-−]?\d+)?"
_TOKENS = {'@N': '(' + NUM + ')', '@X': '(?:' + NUM + ')', '@S': '(.+?)', '~': '.*?'}


def compile_pattern(pat):
    if pat.startswith('re:'):
        rx = pat[3:]
        for k in ('@N', '@X', '@S'):
            rx = rx.replace(k, _TOKENS[k])
        return re.compile(rx)
    out, i = [], 0
    while i < len(pat):
        if pat.startswith(('@N', '@X', '@S'), i):
            out.append(_TOKENS[pat[i:i + 2]]); i += 2
        elif pat[i] == '~':
            out.append(_TOKENS['~']); i += 1
        elif pat[i].isspace():
            while i < len(pat) and pat[i].isspace():
                i += 1
            out.append(r'\s+')
        else:
            out.append(re.escape(pat[i])); i += 1
    return re.compile(''.join(out))


class Sources:
    def __init__(self, folder):
        self.folder, self.cache = folder, {}

    def lines(self, prefix):
        if prefix not in self.cache:
            hits = sorted(glob.glob(os.path.join(self.folder, prefix + '-*.js')))
            if not hits:
                raise FileNotFoundError(f'no example {prefix}-*.js in {self.folder}')
            with open(hits[0], encoding='utf-8') as fh:
                self.cache[prefix] = (os.path.basename(hits[0]), fh.read().splitlines())
        return self.cache[prefix]

    def find(self, prefix, pat, occurrence=1):
        """Return (line number, match) of the occurrence-th line matching pat, or (None, None)."""
        rx = compile_pattern(pat)
        seen = 0
        for no, text in enumerate(self.lines(prefix)[1], 1):
            m = rx.search(text)
            if m:
                seen += 1
                if seen == occurrence:
                    return no, m
        return None, None


SRC = None   # set in main()


def num(s):
    return float(s.replace("'", '').replace('−', '-'))


def decimals(s):
    s = s.replace("'", '').lower().split('e')[0]
    return len(s.split('.')[1]) if '.' in s else 0


def claimed(prefix, pat):
    """The number a pattern captures in an example, for checks that build on another stated value."""
    no, m = SRC.find(prefix, pat)
    if m is None:
        raise LookupError(f'{prefix}: pattern not found: {pat}')
    return num(m.group(1))


def line_of(prefix, literal):
    for no, text in enumerate(SRC.lines(prefix)[1], 1):
        if literal in text:
            return no
    raise LookupError(f'{prefix}: no line contains {literal!r}')


def text_of(prefix, literal):
    for text in SRC.lines(prefix)[1]:
        if literal in text:
            return text
    raise LookupError(f'{prefix}: no line contains {literal!r}')


# ── Checks ───────────────────────────────────────────────────────────────────────────────────────────
CHECKS = []


def chk(f, pat, desc, value, parse=None, strict=False, cmp='eq', occurrence=1):
    CHECKS.append(dict(f=f, pat=pat, desc=desc, value=value, parse=parse, strict=strict, cmp=cmp,
                       occurrence=occurrence))


TICK = lambda s: s.strip() == '✓'
INTSET = lambda s: set(int(x) for x in re.findall(r'\d+', s))

# 01 · units ───────────────────────────────────────────────────────────────────────────────────────
c01 = 12 + 0.25 * 25.4
chk('01', "const c = a.add(b)~→ @N mm", "12 mm + 0.25 in", c01)
chk('01', "c.mul(2).sub(cm(1))~→ @N mm", "2·c − 1 cm", 2 * c01 - 10)
chk('01', "c.to('in')~→ @N in", "c in inches", c01 / 25.4)
chk('01', "mm(40).mul(mm(25))~→ @N mm²", "40 × 25", 40 * 25)
chk('01', "area.mul(mm(30))~→ @N mm³", "1000 mm² × 30 mm", 1000 * 30)
chk('01', "vol.mul(density)~→ @N g", "30 cm³ × 1.24 g/cm³", 30 * 1.24)
chk('01', "mass.mul(price).to('usd')~→ @N usd", "37.2 g × 22 usd/kg", 30 * 1.24 * 0.022)
chk('01', "to mm² (L²) at 01-units-dimensions.js:@N'", "line of the failing mm(3).add(area) call",
    lambda: line_of('01', 'mm(3).add(area)'))
chk('01', "deg(30).add(rad(Math.PI / 6))~→ @N°", "30° + π/6 rad", 30 + deg(pi / 6))
chk('01', "turn(0.25).to('deg')~→ @N°", "0.25 turn", 90)
chk('01', "j.q.sin(deg(30))~→ @N", "sin 30°", sin(rad(30)))
chk('01', "wall.resolve(fdm04)~→ @N mm", "3 lw at 0.45", 3 * 0.45)
chk('01', "wall.resolve(fdm06)~→ @N mm", "3 lw at 0.68", 3 * 0.68)
chk('01', "bbox(0.05).resolve~→ @N mm", "0.05 × 120 mm diagonal", 0.05 * 120)
chk('01', "sides.resolve(fdm04)~→ @N mm", "6 lw + 0.5 nozzle at fdm04", 6 * 0.45 + 0.5 * 0.4)
chk('01', "sides.resolve(fdm06)~→ @N mm", "6 lw + 0.5 nozzle at fdm06", 6 * 0.68 + 0.5 * 0.6)
chk('01', "sturdy.resolve(fdm04)~→ @N mm", "max(3·0.45, 1.2)", max(1.35, 1.2))
chk('01', "sturdy.resolve({ lw: mm(0.25)~→ @N mm", "max(3·0.25, 1.2)", max(0.75, 1.2))
chk('01', "const t = minute(95)~→ @N min", "95 min + 1 h", 155)
chk('01', "t.mul(rate).add(cost)~→ @N usd", "155 min × 0.05 usd/min + material cost",
    155 * 0.05 + 30 * 1.24 * 0.022)

# 02 · params (fdm04: wall = 3 lw = 1.35 mm) ───────────────────────────────────────────────────────
W02 = 3 * LW
chk('02', "→ { value: @N mm, expr: 'screw_d * 2 + wall'", "boss_d = screw_d·2 + wall", 3 * 2 + W02)
chk('02', "floor @N mm params wall + 0.2 mm", "floor = wall + 0.2", W02 + 0.2)
chk('02', "boss_d @N mm params screw_d * 2 + wall", "boss_d (L2 dump)", 3 * 2 + W02)
chk('02', "inner_w @N mm params w - 2 * wall", "inner_w = 60 − 2·wall", 60 - 2 * W02)
chk('02', "S.param('inner_w')~value: @N mm", "inner_w for S (w = 40)", 40 - 2 * W02)
chk('02', "configs.tray-4 (table row @N)", "row of tray-4 in the CSV", 1 + ['tray-2', 'tray-3', 'tray-4'].index('tray-4'))
chk('02', "= 120 mm − 2·2 mm = @N mm", "inner_w for tray-3 with wall 2", 120 - 2 * 2)
chk('02', "configs.tray-3 (table row @N)", "row of tray-3 in the CSV", 1 + ['tray-2', 'tray-3', 'tray-4'].index('tray-3'))
chk('02', "P2.metric('cacheHitRate')~→ @N", "cached share of the L4 trace shown above it",
    lambda: (lambda t: t.count('true') / (t.count('true') + t.count('false')))(
        text_of('02', "['feature:body', ")))
chk('02', "P2.param('boss_d').value~→ @N mm", "boss_d with screw_d = 4", 4 * 2 + W02)

# 03 · transforms ──────────────────────────────────────────────────────────────────────────────────
def rz(p, a):
    a = rad(a)
    return [p[0] * cos(a) - p[1] * sin(a), p[0] * sin(a) + p[1] * cos(a), p[2]]


v03 = [30, 20, 0]
n03 = math.hypot(30, 20)
chk('03', "const v = q.sub(p)~→ vec(@S) mm", "q − p", v03)
chk('03', "p.add(v)~→ pt(@S) mm", "p + v", [40, 20, 5])
chk('03', "v.norm()~→ @N mm", "|v|", n03)
chk('03', "v.unit()~→ dir(@S)", "v / |v|", [30 / n03, 20 / n03, 0])
chk('03', "p.add(v.mul(0.5))~→ pt(@S) mm", "p + v/2", [25, 10, 5])
chk('03', "j.dir('+X').angleTo(v)~→ @N°", "atan(20/30)", deg(atan2(20, 30)))
chk('03', "rz30.then(right20).apply(j.pt(10, 0, 0))~→ pt(@S)", "rotate 30°, then +20 x",
    (lambda q: [q[0] + 20, q[1], q[2]])(rz([10, 0, 0], 30)))
chk('03', "right20.then(rz30).apply(j.pt(10, 0, 0))~→ pt(@S)", "+20 x, then rotate 30°", rz([30, 0, 0], 30))
chk('03', "rz30.then(rz45).apply(j.pt(10, 0, 0))~→ pt(@S)", "rotate 30° then 45°", rz(rz([10, 0, 0], 30), 45))
chk('03', "j.tx.rotate(j.axis.Z, deg(75)).apply(j.pt(10, 0, 0))~→ pt(@S)", "rotate 75°", rz([10, 0, 0], 75))
chk('03', "rz30.pow(12)~(@N · 30° = one turn)", "360° / 30°", 360 / 30)
chk('03', "turn(0.25)).apply(j.pt(10, 0, 0))~→ pt(@S)", "rotate a quarter turn", rz([10, 0, 0], 90))
chk('03', "mx.apply(j.pt(12, 3, 4))~→ pt(@S)", "mirror in YZ", [-12, 3, 4])
chk('03', "mx.det~→ @N", "det diag(−1, 1, 1)", -1)
chk('03', "shrinkComp.apply(j.pt(100, 0, 0))~→ pt(@S)", "scale 1.006", [100.6, 0, 0])
chk('03', "is canonicalised to offset(@N))", "offset 10 + 15", 10 + 15)
chk('03', "frame: { origin: (@S) mm, z: '+X' }", "centre of the right wall, w = 80, h = 30", [80 / 2, 0, 30 / 2])
chk('03', "seat.apply(j.pt(0, 0, 0))~→ pt(@S)", "lid origin on the 30 mm rim", [0, 0, 30])
chk('03', "→ { tx: move(@S) mm, via: 'joint closed", "rigid mate onto the rim", [0, 0, 30])

# 04 · sketch DOF ──────────────────────────────────────────────────────────────────────────────────
ENT04 = 4 + 4 + 5 + 5
chk('04', "→ { dof: @N, status: 'under', entities:", "s0: 18 entity DOF − 4 coincidences × 2", ENT04 - 8)
chk('04', "a2 5] = @N, equations", "entity DOF 4 + 4 + 5 + 5", ENT04)
chk('04', "4 coincident × 2 = @N }", "coincidence equations", 4 * 2)
chk('04', "// dof @N: two centres (4) and two radii (2)", "s1 = 10 − 4 tangents", 10 - 4)
chk('04', "// dof @N: position (2), length, radius", "s2 = 6 − equal − horizontal", 6 - 2)
chk('04', "dim('a1', 5) // dof @N", "s3 = 4 − fix(2) − length − radius", 4 - 4)
chk('04', "[s0, s1, s2, s3].map~→ [@S]", "DOF sequence", [10, 6, 4, 0])
chk('04', "→ { dof: @N, status: 'fully', entityDOF", "s3: 18 − rank 18", 18 - 18)
chk('04', "entityDOF: @N, equations", "entity DOF", ENT04)
chk('04', "equations: @N, rank", "8 + 4 + 1 + 1 + 2 + 1 + 1", 8 + 4 + 1 + 1 + 2 + 1 + 1)
chk('04', "rank: @N }", "full rank", ENT04)
chk('04', "(it measures @N mm)", "tangency gap 2r", 2 * 5)
chk('04', "driven: true, value: @N mm }", "driven gap 2r", 2 * 5)
chk('04', "a2 arc 5 Σ @N", "L3 entities Σ", ENT04)
chk('04', "radius (1) Σ @N", "L3 equations Σ", 18)
chk('04', "message: '@N DOF remain'", "s1 DOF", 6)
chk('04', "['a1', @N], ['a2', @X]]", "free DOF of a1 (centre 2 + radius)", 3)
chk('04', "['a1', @X], ['a2', @N]]", "free DOF of a2 (centre 2 + radius)", 3)
chk('04', "j.compile(twoParts).sketch('slot').dof~→ @N", "rigid slot + free circle", 0 + 3)
chk('04', "length(l1): @N mm }", "a1 centre x 52 − a2 centre x 0", 52 - 0)
chk('04', "moved the whole slot up @N mm", "drag y 9 − 5", 9 - 5)

# 05 · regions ─────────────────────────────────────────────────────────────────────────────────────
TAG_OUTER = rounded_rect(60, 24, 4)
A05, B05 = 40 * 20, pi * 12 ** 2
CAPS05 = 144 * math.acos(10 / 12) - 10 * sqrt(144 - 100)          # disk segment beyond |y| = 10
I05 = B05 / 2 - CAPS05                                             # A ∩ B: half disk minus the clipped caps
SLOT05 = 30 * 6 + pi * 3 ** 2                                      # slot (−15,0)–(15,0), width 6
SLOT_IN_B = circ_strip(3, 12) - 5 * 6 + pi * 3 ** 2 / 2            # slot ∩ B: strip x ≥ 20 − √(144 − y²) to 15, plus the right cap
chk('05', "// @N − @X − @X", "outer 60 × 24, r 4", TAG_OUTER)
chk('05', "// @X − @N − @X", "hole r 3", pi * 9)
chk('05', "loops: 3, area: @N mm² }", "outer − hole − window 30 × 12", TAG_OUTER - pi * 9 - 360)
chk('05', "id: 'island', loops: 1, area: @N mm²", "island 10 × 4", 40)
chk('05', "{ center: true })~// area @N mm²", "A = 40 × 20", A05)
chk('05', "// area @N mm², centred", "B = π·12²", B05)
chk('05', "A.intersect(B).area()~→ @N mm²", "half disk − caps beyond |y| = 10", I05)
chk('05', "(half disk @N −", "half of π·12²", B05 / 2)
chk('05', "two clipped caps @N)", "segment 144·acos(10/12) − 10·√44", CAPS05)
chk('05', "A.union(B).area()~→ @N mm²", "A + B − A∩B", A05 + B05 - I05)
chk('05', "A.subtract(B).area()~→ @N mm²", "A − A∩B", A05 - I05)
chk('05', "B.subtract(A).area()~→ @N mm²", "B − A∩B", B05 - I05)
chk('05', "A.subtract(B).subtract(C).area()~→ @N mm²", "A − A∩B − (slot outside B)", A05 - I05 - (SLOT05 - SLOT_IN_B))
chk('05', "@X − @N of slot outside B", "slot area − slot∩B", SLOT05 - SLOT_IN_B)
chk('05', "A.offset(mm(2)).area()~→ @N mm²", "Steiner 800 + 120·2 + π·2²", A05 + 120 * 2 + pi * 4)
chk('05', "A.offset(mm(-2)).area()~→ @N mm²", "36 × 16", 36 * 16)
chk('05', "A.offset(mm(2)).offset(mm(-2)).area()~→ @N mm²", "closing of a convex region", A05)
chk('05', "A.offset(mm(-2)).offset(mm(2)).area()~→ @N mm²", "800 − 4·(1 − π/4)·2²", A05 - 4 * (1 - pi / 4) * 4)
chk('05', "const r = lw(0.5)~// @N mm", "0.5 lw", 0.5 * LW)
chk('05', "lost.area().div(logo.area())~→ @N", "3.1 / 212.6", 3.1 / 212.6)
chk('05', "(@N % of the logo", "3.1 / 212.6 in %", 100 * 3.1 / 212.6)
chk('05', "< 1 lw (@N mm)", "1 lw", LW)
chk('05', "< 3 layer (@N mm)", "3 layers", 3 * LAYER)
chk('05', "size ≥ @N mm in 'Inter Regular'", "3 mm × 0.45 / 0.33 (stroke scales with size)", 3 * LW / 0.33)
chk('05', "depth ≥ @N mm", "3 layers", 3 * LAYER)
chk('05', "→ { dof: @N, status: 'under', note: 'rim 3", "rim 3 + logo 3 − concentric 2", 3 + 3 - 2)

# 06 · extrude and revolve ─────────────────────────────────────────────────────────────────────────
PLATE06 = 80 * 50 - 4 * (1 - pi / 4) * 4 ** 2 - 4 * pi * 1.7 ** 2
TOP06 = 30 - 2 * 20 * tan(rad(10))
chk('06', "P.metric('volume')~→ @N mm³", "(80·50 − corners − 4 holes) · 4", PLATE06 * 4)
chk('06', "P.metric('mass')~→ @N g", "volume × 1.27 g/cm³", PLATE06 * 4 * RHO['PETG'] / 1000)
chk('06', "tan 10° = @N mm", "30 − 2·20·tan 10°", TOP06)
chk('06', "A₁ = @N", "top side²", TOP06 ** 2)
chk('06', "F.metric('volume')~→ @N mm³", "frustum h/3·(A₀ + A₁ + √(A₀A₁))",
    20 / 3 * (900 + TOP06 ** 2 + sqrt(900 * TOP06 ** 2)))
chk('06', "centroid at x = @N", "(23 + 27) / 2", (23 + 27) / 2)
chk('06', "j.compile(ring).metric('volume')~→ @N mm³", "2π · 25 · 40", 2 * pi * 25 * 40)
chk('06', "j.compile(quarter).metric('volume')~→ @N mm³", "π/2 · 25 · 40", pi / 2 * 25 * 40)
chk('06', "staged.residual.mass~→ h ↦ @N g/mm", "ρ · area(R)", RHO['PETG'] / 1000 * PLATE06)
chk('06', "staged.residual.mass(mm(6))~→ @N g", "ρ · area(R) · 6", RHO['PETG'] / 1000 * PLATE06 * 6)

# 07 · CSG ─────────────────────────────────────────────────────────────────────────────────────────
BALL07 = 4 / 3 * pi * 13 ** 3
ROUND07 = BALL07 - 6 * pi * 3 ** 2 * (3 * 13 - 3) / 3
ROD07, BI07, TRI07 = pi * 5 ** 2 * 20, 16 * 5 ** 3 / 3, 8 * (2 - sqrt(2)) * 5 ** 3
BORE07 = pi * 1.7 ** 2 * (30 - 22)
HOLDER07 = 50 * 30 * 5 + pi * 36 * 25 + pi * 36 * 30 - pi * 1.7 ** 2 * 8 - BORE07
chk('07', "{ center: true })~// @N mm³", "cube 20³", 20 ** 3)
chk('07', "j.sphere(mm(13))~// @N mm³", "4/3·π·13³", BALL07)
chk('07', "rounded.volume()~→ @N mm³", "ball − 6 caps of height 3", ROUND07)
chk('07', "die.volume()~(3·@N −", "rod r 5 × 20", ROD07)
chk('07', "die.volume()~− 3·@N +", "Steinmetz 16r³/3", BI07)
chk('07', "die.volume()~+ @N)", "tricylinder 8(2 − √2)r³", TRI07)
chk('07', "die.volume()~→ @N mm³", "rounded − (3 rods − 3 bicylinders + tricylinder)", ROUND07 - (3 * ROD07 - 3 * BI07 + TRI07))
chk('07', "cube.union(ball).volume()~→ @N mm³", "8000 + ball − cube∩ball", 8000 + BALL07 - ROUND07)
chk('07', "→ { S: 1, G: @N, residual", "6 openings into one cavity → genus 6 − 1", 2 * 3 - 1)
chk('07', "→ { faces: @N, edges: @X, vertices", "faces of a block", 6)
chk('07', "edges: @N, vertices", "edges of a block", 12)
chk('07', "vertices: @N, volume", "vertices of a block", 8)
chk('07', "volume: @N mm³, note: 'coplanar", "20 × 10 × 10", 20 * 10 * 10)
chk('07', "coplanar faces merged (@N pairs)", "side faces around the shared face", 4)
chk('07', "(move c2 by (@N, @X, 0))", "overlap 1 lw", -LW)
chk('07', "features: 5, volume: @N mm³ }", "base + post + spare − pilot − bore", HOLDER07)
chk('07', "= base @N +", "50 × 30 × 5", 50 * 30 * 5)
chk('07', "π·6²·25 (@N)", "post above the base", pi * 36 * 25)
chk('07', "π·6²·30 (@N)", "spare post", pi * 36 * 30)
chk('07', "− pilot @N", "π·1.7²·8", pi * 1.7 ** 2 * 8)
chk('07', "− bore @N", "π·1.7²·(30 − 22): the bore pokes out of the post", BORE07)

# 09 · fillets and shells ──────────────────────────────────────────────────────────────────────────
R09 = 72000 - 4 * (1 - pi / 4) * 25 * 30
C09 = R09 - (56 * 36 - 4 * (1 - pi / 4) * 9) * 28
PER09 = 2 * (56 + 36) - 8 * 3 + 2 * pi * 3            # inner rim: 56 × 36 with r 3 corners
CH09 = 0.6 ** 2 / 2
RIB09 = 1.6 * 56 * (25 - 2)
radius09 = lambda length: 3 if length > 35 else 2      # the per-edge lambda, convex edges
chk('09', "mm(30), { id: 'body' })~// @N mm³", "60 × 40 × 30", 60 * 40 * 30)
chk('09', "R.metric('volume')~→ @N mm³", "72'000 − 4·(1 − π/4)·5²·30", R09)
chk('09', "exceeds @N mm on 4 edges", "30 mm side / 2", 30 / 2)
chk('09', "r ≤ @N mm (a full round end)", "30 mm side / 2", 30 / 2)
chk('09', "keeps a @N mm flat", "30 − 2 × 14.9", 30 - 2 * 14.9)
chk('09', "['body/side[base.r.top] ∩ body/end', @N mm", "lambda on a 60 mm edge", radius09(60))
chk('09', "['body/side[base.r.right] ∩ body/end', @N mm", "lambda on a 40 mm edge", radius09(40))
chk('09', "∩ body/side[base.r.right]', @N mm", "lambda on a 30 mm vertical edge", radius09(30))
chk('09', "the lowest @N mm of the 3 mm round", "r(1 − cos 45°)", 3 * (1 - cos(rad(45))))
chk('09', "C.metric('volume')~→ @N mm³", "71'356 − (56 × 36 − corners) × 28", C09)
chk('09', "innerCornerRadius: @N mm (= 5 − 2)", "5 − 2", 5 - 2)
chk('09', "innerCornerRadius~→ @N mm", "max(5 − 6, 0)", max(5 - 6, 0))
chk('09', "+ 1.6 × 56 × @N (rib)", "rib from z 25 down to the 2 mm floor", 25 - 2)
chk('09', "− @N mm² × @X mm (inner-rim", "0.6 × 0.6 / 2 chamfer section", CH09)
chk('09', "mm² × @N mm (inner-rim chamfer)", "inner rim length, 56 × 36, r 3", PER09)
chk('09', "j.compile(sorted).metric('volume')~→ @N mm³", "15'125 + rib − chamfer", C09 + RIB09 - CH09 * PER09)
chk('09', "rib 1.6 mm = @N lw", "1.6 / 0.45", 1.6 / LW)

# 10 · patterns ────────────────────────────────────────────────────────────────────────────────────
def hex_points(pitch, rings):
    pts = []
    for a in range(-rings, rings + 1):
        for b in range(-rings, rings + 1):
            if max(abs(a), abs(b), abs(a + b)) <= rings:
                pts.append((a * pitch + b * pitch / 2, b * pitch * sqrt(3) / 2))
    return pts


HEX10 = hex_points(6, 5)
VENT10 = sum(1 for x, y in HEX10 if math.hypot(x, y) <= 22 + 1e-9)
WEB10 = 2.7 * LW
chk('10', "'7mm', '@Nmm']", "last bit: 1 + 1·7", 1 + 7)
chk('10', "→ ['@Nmm', …", "first bore 1 mm + 2 × free 0.30 + holeComp 0.10 (j.fit.hole default chain, 16)",
    hole(1, 'free'))
chk('10', "non-congruent; @N hole solves", "count 8", 8)
chk('10', "gx.times(gy).count~→ @N", "4 × 3", 4 * 3)
chk('10', "feature('pegs').count~→ @N", "4 × 3", 4 * 3)
chk('10', "24 steps of @N°", "360 / 24", 360 / 24)
chk('10', "partial arc of @N° steps", "120 / (5 − 1)", 120 / (5 - 1))
chk('10', "|D₆| = @N", "2 · 6", 12)
chk('10', "feature('fins').count~→ @N", "|D₆|, trivial stabiliser", 12)
chk('10', "feature('spokes').count~→ @N", "12 / |Stab| 2", 12 // 2)
chk('10', "// web @N mm on a 0.45 mm line width", "2.7 lw", WEB10)
chk('10', "r = across-flats / 2 = @N mm", "(6 − web) / 2", (6 - WEB10) / 2)
chk('10', "3·5·6 + 1 = @N centres", "hex lattice points within 5 rings", len(HEX10))
chk('10', "feature('vent').count~→ @N", "lattice points within 22 mm", VENT10)
chk('10', "feature('vent').filtered~→ @N", "91 − kept", len(HEX10) - VENT10)
chk('10', "// → @N mm²   = π·26²", "π·26² − 55 × (√3/2)·4.8² (as written)", pi * 26 ** 2 - VENT10 * sqrt(3) / 2 * 4.8 ** 2)
chk('10', "=  @N − @X  (open area", "π·26²", pi * 26 ** 2)
chk('10', "=  @X − @N  (open area", "55 hexagons, 4.8 across flats", VENT10 * sqrt(3) / 2 * 4.8 ** 2)
chk('10', "(open area @N %", "open / disk", 100 * VENT10 * sqrt(3) / 2 * 4.8 ** 2 / (pi * 26 ** 2))
chk('10', "lw(2) = @N mm", "2 lw", 2 * LW)
chk('10', "instance 3 (@N°, y", "90° + 3 · 60°", 90 + 3 * 60)
chk('10', "y = @N mm) starts off", "32 · sin 270°", 32 * sin(rad(270)))

# 11 · sweeps and threads ──────────────────────────────────────────────────────────────────────────
c11 = 6 / (2 * pi)
L11 = 5 * 2 * pi * sqrt(10 ** 2 + c11 ** 2)
tau11 = c11 / (10 ** 2 + c11 ** 2)
chk('11', "c = 6/2π = @N mm", "pitch / 2π", c11)
chk('11', "+ 0.955²) = @N mm", "5 · 2π·√(r² + c²)", L11)
chk('11', "τ = 0.955 / @N =", "r² + c²", 10 ** 2 + c11 ** 2)
chk('11', "/ 100.9 = @N /mm", "τ = c/(r² + c²)", tau11)
chk('11', "√100.9 = @N rad", "∫ τ ds = τ·L", tau11 * L11)
chk('11', "rad = @N°", "∫ τ ds in degrees", deg(tau11 * L11))
chk('11', "→ { kind: 'rmf', totalTwist: @N°, note", "RMF twist on the helix", deg(tau11 * L11))
chk('11', "drifts @N° per turn", "twist / 5 turns", deg(tau11 * L11) / 5)
chk('11', "crest: @N mm (P/8)", "1.75 / 8", 1.75 / 8)
chk('11', "root: @N mm (P/4)", "1.75 / 4", 1.75 / 4)
chk('11', "layersPerPitch: @N, flankFromVertical: 60°", "1.75 / 0.2", 1.75 / LAYER)
chk('11', "crest: @N mm (0.366·P)", "0.366 × 3", 0.366 * 3)
chk('11', "layersPerPitch: @N, flankFromVertical: 75°", "3 / 0.2", 3 / LAYER)
chk('11', "crest is about @N line widths", "1.10 / 0.45", 0.366 * 3 / LW)
chk('11', "0.2·tan 60° = @N mm", "layer · tan 60°", LAYER * tan(rad(60)))
chk('11', "0.2·tan 75° = @N mm", "layer · tan 75°", LAYER * tan(rad(75)))
chk('11', "major: @N mm (D4 12.5 + 2 × 0.2)", "12.5 + 2 × slide", 12.5 + 2 * FIT['slide'])
chk('11', "minor: @N mm (D1 9 + 2 × 0.2)", "9 + 2 × slide", 9 + 2 * FIT['slide'])
chk('11', "flankGap: @N mm per side (slide", "slide class", FIT['slide'])
chk('11', "lw(4), { id: 'walls' })~// @N mm walls", "4 lw", 4 * LW)
chk('11', "j.inspect.section(duct, j.plane.XY).area~→ @N mm²", "60·20 − (4 − π)·3²", rounded_rect(60, 20, 3))
chk('11', "mm(50))).area~→ @N mm²", "π·17.5²", pi * 17.5 ** 2)
chk('11', "(π·17.5²): @N % less flow area", "1 − 962/1192", 100 * (1 - pi * 17.5 ** 2 / rounded_rect(60, 20, 3)))
chk('11', "maxAngle: @N° }", "atan((30 − 17.5)/50)", deg(atan((30 - 17.5) / 50)))
chk('11', "over 50 mm: atan(@N/50)", "30 − 17.5", 30 - 17.5)
chk('11', "atan(12.5/50) = @N°", "atan(12.5/50)", deg(atan(12.5 / 50)))

# 12 · fields ──────────────────────────────────────────────────────────────────────────────────────
chk('12', "ball.at(j.pt(0, 0, 0))~→ @N mm", "|p| − 10 at the centre", 0 - 10)
chk('12', "ball.at(j.pt(15, 0, 0))~→ @N mm", "|p| − 10", 15 - 10)
chk('12', "pod.at(j.pt(0, 0, 8))~→ @N mm", "min(ball −10, slab 8 − 3)", min(-10, 8 - 3))
chk('12', "const seam = j.pt(@N, 0, 3)", "√(10² − 5²)", sqrt(75))
chk('12', "√(10² − 5²) = @N)", "√75", sqrt(75))
chk('12', "// → [@S]      the deviation", "−k/4 for k = 4, 2, 1, 0.1, 0", [-k / 4 for k in (4, 2, 1, 0.1, 0)])
chk('12', "// @N mm at the hole → 0.6 mm far away", "0.6 + 1.0·e⁰", 0.6 + 1.0)
chk('12', "relativeDensity: [@N %, @X %]", "3.09 · 0.6 / 8", 100 * 3.09 * 0.6 / 8)
chk('12', "relativeDensity: [@X %, @N %]", "3.09 · 1.6 / 8", 100 * 3.09 * 1.6 / 8)
chk('12', "voxel: lw(0.5) })~// @N mm", "0.5 lw", 0.5 * LW)
chk('12', "voxel lw(2) = @N mm", "2 lw", 2 * LW)
chk('12', "note: 'bricks @N: @X re-meshed, @X cached'", "214 re-meshed + 1'322 cached", 214 + 1322)
chk('12', "(e^{−4} < @N %)", "e^−4 in % is below the bound", 100 * math.exp(-4), cmp='lt')

# 13 · mesh ────────────────────────────────────────────────────────────────────────────────────────
V13, F13 = 24100, 48200
chk('13', "selfIntersections: 0, eulerChar: @N, genus: @X }", "χ = V − F/2", V13 - F13 / 2)
chk('13', "selfIntersections: 0, eulerChar: @X, genus: @N }", "g = (2 − χ)/2", (2 - (V13 - F13 / 2)) / 2)
chk('13', "= 24'100 − @N + 48'200", "E = 3F/2", 3 * F13 / 2)
chk('13', "+ 48'200 = @N = 2 − 2g", "V − E + F", V13 - 3 * F13 / 2 + F13)
chk('13', "so g = @N.", "(2 − χ)/2", 1)
chk('13', "a 40 × @N × 45 mm block", "desk + 2·jaw", 25 + 2 * 10)
chk('13', "// z from 4 to @N", "4 − 45", 4 - 45)
chk('13', "// y @N…", "6.25 − 37.5/2", 6.25 - 37.5 / 2)
chk('13', "…@N, z", "6.25 + 37.5/2", 6.25 + 37.5 / 2)
chk('13', ", z @N…", "−18.5 − 25/2", -18.5 - 25 / 2)
chk('13', ", z @X…@N", "−18.5 + 25/2", -18.5 + 25 / 2)
chk('13', "into the @N mm lower jaw", "gap bottom −31 − (−41)", -31 - (-41))
chk('13', "lw(0.25) = @N mm", "0.25 lw", 0.25 * LW)
chk('13', "j.compile(light).mesh().faces~→ @N", "0.2 × 48'200", 0.2 * F13)
chk('13', ", genus: @N, eulerChar: @X }", "outer genus 1 + inner genus 1, joined by the drain", 1 + 1)
chk('13', ", genus: @X, eulerChar: @N }", "2 − 2g", 2 - 2 * 2)
chk('13', "saved: @N %", "1 − 11.2/38.4", 100 * (1 - 11.2 / 38.4))
chk('13', "→ { bodies: 1, faces: @N, fitted", "30 + 9 + 2", 30 + 9 + 2)

# 14 · joints and hardware ─────────────────────────────────────────────────────────────────────────
eps14 = lambda L, t, y: 1.5 * t * y / L ** 2
chk('14', "lw(4), { id: 'walls' })~// @N mm walls", "4 lw", 4 * LW)
chk('14', "hole: Ø4.0 × @N mm (insert 5.7", "5.7 + 1.0", 5.7 + 1.0)
chk('14', "boss: Ø@N mm (4.0 + 2·lw(3))", "4.0 + 2·1.35", 4.0 + 2 * 3 * LW)
chk('14', "M.feature('through').modelled~→ Ø@N mm", "3 + 2 × slide + holeComp", hole(3, 'slide'))
chk('14', "slot: @N × @X mm (AF 5.5", "5.5 + 2 × 0.2", 5.5 + 0.4)
chk('14', "slot: @X × @N mm (AF 5.5", "2.4 + 0.4", 2.4 + 0.4)
chk('14', "strain: @N (1.5·1.6·1.0/12²)", "1.5·t·y/L²", eps14(12, 1.6, 1.0))
chk('14', "permissibleDeflection: @N mm", "0.67·ε·L²/t", 0.67 * 0.025 * 144 / 1.6)
chk('14', "ratio: @N }", "strain / 0.025", eps14(12, 1.6, 1.0) / 0.025)
chk('14', "// → @N   (peak strain / allowable)", "strain / 0.025", eps14(12, 1.6, 1.0) / 0.025)
chk('14', "'ε = @N % > 2.5 %", "1.5·1.6·1.0/8²", 100 * eps14(8, 1.6, 1.0))
chk('14', "length ≥ @N mm at t = 1.6 mm", "√(1.5·t·y/ε)", sqrt(1.5 * 1.6 * 1.0 / 0.025))
chk('14', "thickness ≤ @N mm at L = 8 mm", "ε·L²/(1.5·y)", 0.025 * 64 / 1.5)
chk('14', "thickness: @N mm (2 layers)", "2 layers", 2 * LAYER)
chk('14', "gap: @N mm, bendRadius", "lid at x 31 − base end 30", 31 - 30)
chk('14', "socket: @N × @X mm at 15°", "20 + 2 × slide", 20 + 2 * FIT['slide'])
chk('14', "socket: @X × @N mm at 15°", "6 + slide", 6 + FIT['slide'])
chk('14', "pocket: Ø@N × 3.2 mm", "6 + 2 × press + holeComp (the rule in this file's Model)", hole(6, 'press'))
chk('14', "z: 1.0–@N mm", "1.0 + 3.2", 1.0 + 3.2)
chk('14', "afterLayer: @N, z: 4.2 mm", "4.2 / 0.2", 4.2 / LAYER)
chk('14', "(4.2 / 0.2 = @N;", "4.2 / 0.2", 4.2 / LAYER)
chk('14', "layer @N bridges the pocket", "21 + 1", 4.2 / LAYER + 1)
chk('14', "hole: Ø@N × 5.5 mm", "3 + 2 × press + holeComp", hole(3, 'press'))
chk('14', "frame: { origin: [0, 0, @N], z: '+Z' }", "case height", 20)

# 15 · assemblies ──────────────────────────────────────────────────────────────────────────────────
WALL15 = 4 * LW
RING15 = 60 * 40 - (60 - 2 * WALL15) * (40 - 2 * WALL15)
chk('15', "M: 6·(2 − 1 − 1) + 1 = @N }", "Grübler, 1 revolute", 6 * (2 - 1 - 1) + 1)
chk('15', "M: 6·(2 − 1 − 2) + 2 = @N }", "Grübler, 2 revolutes", 6 * (2 - 1 - 2) + 2)
chk('15', "redundant: @N,", "solver 1 − Grübler −4", 1 - (6 * (2 - 1 - 2) + 2))
chk('15', "all @N constraints of h2", "6 − 1 for a revolute", 6 - 1)
chk('15', "2·12.5 − 12 = @N mm", "closed lid rim height", 2 * 12.5 - 12)
# rounded-rectangle ring: outer 60 × 40 with r 3; inner offset by the wall, corner radius 3 − wall
RING15R = (60 * 40 - (4 - pi) * 3 ** 2) - ((60 - 2 * WALL15) * (40 - 2 * WALL15) - (4 - pi) * (3 - WALL15) ** 2)
chk('15', "(wall ring ≈ @N mm² with r 3", "rounded wall ring (r 3 outside, r 3 − wall inside)", RING15R)
chk('15', "corners × @N mm overlap", "15 − 13", 15 - 13)
chk('15', "sweptInterference: @N mm³, first", "rounded wall ring × 2 mm", RING15R * 2)
chk('15', "(@N mm³)'", "rounded wall ring × 2 mm", RING15R * 2)
chk('15', "(h_base + h_lid) / 2 = @N mm", "(15 + 12) / 2", (15 + 12) / 2)
chk('15', "shorten the lid by @N mm", "12 − (2·12.5 − 15)", 12 - (2 * 12.5 - 15))
chk('15', "Q.param('axisZ')~→ { value: @N mm", "(15 + 12) / 2", 13.5)
chk('15', "minClearance: @N mm (knuckle gaps", "printInPlace class", FIT['printInPlace'])
chk('15', "x through (0, 0, @N), 180°)", "axis height", 13.5)
chk('15', "bbox: [[@S]] mm", "lid x ±30, y 2…42, z 0…12 rotated 180° about x at z 13.5",
    [-30, -42, 2 * 13.5 - 12, 30, -2, 2 * 13.5 - 0])

# 16 · fit and stacks ──────────────────────────────────────────────────────────────────────────────
HOLES16 = [(6.10, 5.91), (6.20, 6.01), (6.30, 6.11), (6.40, 6.21), (6.50, 6.31),
           (6.60, 6.41), (6.70, 6.51), (6.80, 6.61), (6.90, 6.72), (7.00, 6.82)]
OUT16 = ['no-fit', 'no-fit', 'press', 'snug', 'slide', 'slide', 'free', 'free', 'loose', 'loose']
PIP16 = ['fused', 'fused', 'stiff', 'free', 'free', 'free', 'loose']
PIN16 = 6.04


def fit16():
    xs, ys = [h[0] for h in HOLES16], [h[1] for h in HOLES16]
    n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    a = sxy / sxx; b = my - a * mx
    ssr = sum((y - a * x - b) ** 2 for x, y in zip(xs, ys))
    return a, b, 1 - ssr / syy, sqrt(ssr / (n - 2))


A16, B16, R2_16, SD16 = fit16()
CLS16 = {k: (HOLES16[OUT16.index(k)][1] - PIN16) / 2 for k in ('press', 'snug', 'slide', 'free')}
CLS16['printInPlace'] = [0.2 + i * 0.05 for i in range(7)][PIP16.index('free')]
WC16 = 0.15 + 0.10 + 0.08
RSS16 = sqrt(0.15 ** 2 + 0.10 ** 2 + 0.08 ** 2)
chk('16', "value: 'Ø @N mm', chain: ['pin", "3 + 2 × slide + holeComp (defaults)", hole(3, 'slide'))
chk('16', "holes: 'Ø @N … @X mm", "6 + 2 × 0.05", 6 + 2 * 0.05)
chk('16', "holes: 'Ø @X … @N mm", "6 + 2 × 0.50", 6 + 2 * 0.50)
chk('16', "hole: { a: @N, b:", "least-squares slope", A16)
chk('16', "b: @N mm, r2", "least-squares intercept", B16)
chk('16', "r2: @N, residualSD", "r² of the fit", R2_16)
chk('16', "residualSD: @N mm", "residual SD (n − 2 dof; n gives 0.0029)", SD16)
chk('16', "pinOversize: @N mm", "6.04 − 6.00", PIN16 - 6.00)
for k16 in ('press', 'snug', 'slide', 'free', 'printInPlace'):
    chk('16', "classes: {~" + k16 + ": @N mm", f"{k16}: first row with that outcome", CLS16[k16])
chk('16', "slide: (6.31 − 6.04) / 2 = @N mm", "(6.31 − 6.04) / 2", (6.31 - 6.04) / 2)
chk('16', r"re:\{ value: 'Ø @N mm',\s*$", "(3 + 2·0.135 − b) / a", (3 + 2 * CLS16['slide'] - B16) / A16)
chk('16', "'= @N mm actual target'", "3 + 2 × 0.135", 3 + 2 * CLS16['slide'])
chk('16', "/ @X = @N mm']", "(3.27 − b) / a", (3 + 2 * CLS16['slide'] - B16) / A16)
chk('16', "default press hole @N mm prints", "3 + 2 × press + holeComp", hole(3, 'press'))
chk('16', "− 0.252 = @N mm: it would not", "a · 3.20 + b", A16 * hole(3, 'press') + B16)
chk('16', "(3.00 + @N + 0.252)", "2 × 0.035", 2 * CLS16['press'])
chk('16', "calibrated press:~= @N mm.", "(3 + 0.07 − b) / a", (3 + 2 * CLS16['press'] - B16) / A16)
chk('16', "j.fit.gap('slide').resolve~→ @N mm", "calibrated slide", CLS16['slide'])
chk('16', "j.fit.hole(mm(3), 'press').resolve~→ @N mm", "(3 + 0.07 − b) / a", (3 + 2 * CLS16['press'] - B16) / A16)
chk('16', "(target 4 − 2·0.035 = @N,", "4 − 2 × 0.035", 4 - 2 * CLS16['press'])
chk('16', "j.fit.pin(mm(4), 'press').resolve~→ @N mm", "4 − 0.07 − 0.04 oversize", 4 - 2 * CLS16['press'] - 0.04)
chk('16', "lidGap.worstCase()~nominal: @N mm", "56 − 55.4 − 0", 56 - 55.4)
chk('16', "lidGap.worstCase()~range: [@N, @X] mm", "0.60 − Σ|t|", 0.6 - WC16)
chk('16', "lidGap.worstCase()~range: [@X, @N] mm", "0.60 + Σ|t|", 0.6 + WC16)
chk('16', "Σ|tᵢ| = @N mm", "0.15 + 0.10 + 0.08", WC16)
chk('16', "lidGap.rss()~range: [@N, @X] mm", "0.60 − RSS", 0.6 - RSS16)
chk('16', "lidGap.rss()~range: [@X, @N] mm", "0.60 + RSS", 0.6 + RSS16)
chk('16', "sigma: @N mm", "RSS / 3", RSS16 / 3)
chk('16', "0.08²) = @N = 3σ", "√(0.15² + 0.10² + 0.08²)", RSS16)
chk('16', "the gap is half: @N mm nominal", "0.60 / 2", 0.6 / 2)
chk('16', "calibrated free class of @N mm", "calibrated free", CLS16['free'])
chk('16', "P(gap < @N mm)", "2 × 0.235", 2 * CLS16['free'])
chk('16', "≈ @N %: a few lids", "Φ((0.47 − 0.60)/σ)", 100 * phi((2 * CLS16['free'] - 0.6) / (RSS16 / 3)))
chk('16', "g.lt(mm(0.47)))~→ @N", "Φ((0.47 − 0.60)/σ), the analytic value", phi((0.47 - 0.6) / (RSS16 / 3)))

# 17 · materials, mass, inspect ────────────────────────────────────────────────────────────────────
V17 = 40 * 40 * 20
WALLS17 = 4 * 40 * 20 * 3 * LW - 4 * (3 * LW) ** 2 * 20
SKINS17 = (40 - 2 * 3 * LW) ** 2 * (4 + 5) * LAYER
INFILL17 = 0.15 * (40 - 2 * 3 * LW) ** 2 * (20 - (4 + 5) * LAYER)
VP17 = WALLS17 + SKINS17 + INFILL17
M17 = VP17 * RHO['PLA'] / 1000
SOLID = "→ { volume: @X mm³, mass: @X g, filamentLength: @X m, cost: @X usd }"
PRINT = "→ { volume: @X mm³, mass: @X g, filamentLength: @X m, cost: @X usd,"


def nth(pat, i):
    """Replace the i-th @X in pat by @N."""
    parts = pat.split('@X')
    return '@X'.join(parts[:i + 1]) + '@N' + '@X'.join(parts[i + 1:]) if i < len(parts) - 1 else pat


chk('17', nth(SOLID, 0), "40 × 40 × 20", V17)
chk('17', nth(SOLID, 1), "32 cm³ × 1.24", V17 * RHO['PLA'] / 1000)
chk('17', nth(SOLID, 2), "V / (π·0.875²) in m", V17 / FIL_AREA / 1000)
chk('17', nth(SOLID, 3), "mass × 22 usd/kg", V17 * RHO['PLA'] / 1000 * PLA_USD_KG / 1000)
chk('17', nth(PRINT, 0), "walls + skins + infill", VP17)
chk('17', nth(PRINT, 1), "V_print × 1.24", M17)
chk('17', nth(PRINT, 2), "V_print / (π·0.875²) in m", VP17 / FIL_AREA / 1000)
chk('17', nth(PRINT, 3), "mass × 22 usd/kg", M17 * PLA_USD_KG / 1000)
chk('17', "walls: @N mm³,", "160 × 20 × 1.35 − 4 corner overlaps 1.35² × 20", WALLS17)
chk('17', "// @N mm perimeter", "4 × 40", 4 * 40)
chk('17', "× 20 mm × @N mm, less corner", "3 lw", 3 * LW)
chk('17', "skins: @N mm³,", "(40 − 2.7)² × 9 × 0.2", SKINS17)
chk('17', "(40 − @N)² × 9 layers", "2 × 3 lw", 2 * 3 * LW)
chk('17', "× @N layers × 0.2 mm", "4 bottom + 5 top", 4 + 5)
chk('17', "infill: @N mm³ }", "0.15 × 37.3² × (20 − 1.8)", INFILL17)
chk('17', "0.15 × @N² ×", "40 − 2.7", 40 - 2 * 3 * LW)
chk('17', "(20 − @N)", "9 layers × 0.2", 9 * LAYER)
chk('17', "(π · @N²)", "1.75 / 2", 1.75 / 2)
chk('17', "(π · 0.875²) = @X / @N =", "π·0.875²", FIL_AREA)
chk('17', "/ @X = @N mm", "10'476 / (π·0.875²)", 10476 / FIL_AREA)
chk('17', "// → @N g, @X g, @X g", "V_print × 1.24 (PLA)", VP17 * RHO['PLA'] / 1000)
chk('17', "// → @X g, @N g, @X g", "V_print × 1.27 (PETG)", VP17 * RHO['PETG'] / 1000)
chk('17', "// → @X g, @X g, @N g", "V_print × 1.04 (ABS)", VP17 * RHO['ABS'] / 1000)
chk('17', "cheapPla), { walls: 3, infill: 0.15 }).cost~→ @N usd", "13.0 g × 17 usd/kg", M17 * 17 / 1000)
chk('17', "lw(2) = @N mm", "2 lw", 2 * LW)
chk('17', "nozzle(1) = @N mm", "1 nozzle", NOZZLE)
chk('17', "→ { area: @N mm², faces: [", "ledge 240 + lip 60", (52 - 40) * 20 + 3 * 20)
chk('17', "'ledge/bottom', theta: 90°, area: @N mm²", "(52 − 40) × 20", (52 - 40) * 20)
chk('17', "// x 40–@N; the lip", "lip starts at x 52", 52)
chk('17', "covers the last @N mm", "55 − 52", 55 - 52)
chk('17', "'lip/bottom', theta: 90°, area: @N mm²", "3 × 20", 3 * 20)
chk('17', "span: @N mm, length: @X mm", "tunnel width", 12)
chk('17', "span: @X mm, length: @N mm, max", "tunnel length along Y", 20)
chk('17', "z: @X mm, area: @N mm², at: 'lip'", "3 × 20", 3 * 20)
chk('17', "(wedge/bottom: θ = @N°", "atan(15/15) from vertical", deg(atan2(55 - 40, 25 - 10)))
chk('17', "→ { area: @N mm², regions: 1 }", "40 × 20 + 0.6 × 20", 40 * 20 + 0.6 * 20)

# 18 · orientation ─────────────────────────────────────────────────────────────────────────────────
# Support inside a horizontal round hole: columns under the part of the bore steeper than 45°,
# down to the bore's lower wall: 2·∫ √(r² − x²) dx over |x| ≤ r·sin 45° = r²(1 + π/2), times the depth.
hole_support = lambda d, depth: (d / 2) ** 2 * (1 + pi / 2) * depth
D18 = lambda: claimed('18', "clearance M4 free → Ø @N mm")      # the screw Ø as this file states it
CABLE18 = hole_support(8, 5)
SCREWS18 = lambda: 2 * hole_support(D18(), 5)
chk('18', "total height @N", "5 + 40", 5 + 40)
chk('18', ").area~→ @N mm²: the same face", "90° of arc × 5 deep", 4 * pi / 2 * 5)
chk('18', "(@N mm of arc × 5 mm deep)", "r · π/2, r = 4", 4 * pi / 2)
chk('18', "→ bed contact @N mm² → height", "+Y face: 60·5 + 60·40 − the Ø8 cable hole in it", 60 * 5 + 60 * 40 - pi * 4 ** 2)
chk('18', "→ height @N mm',", "+Y extent", 30)
chk('18', "dir: '+Y', supportVolume: 0, bedContact: @N mm²", "+Y face: 60·5 + 60·40 − Ø8 cable hole", 60 * 5 + 60 * 40 - pi * 4 ** 2)
chk('18', "dir: '+Y'~height: @N mm", "+Y extent", 30)
chk('18', "dir: '+Z', supportVolume: @N mm³", "cable hole Ø8 × 5: r²(1 + π/2)·5", CABLE18)
chk('18', "dir: '+Z'~bedContact: @N mm²", "60 × 30 − 2 through screw holes (Ø as this file states it)",
    lambda: 60 * 30 - 2 * pi * (D18() / 2) ** 2)
chk('18', "dir: '+Z'~height: @N mm", "+Z extent", 45)
chk('18', "dir: '+X', supportVolume: @N mm³", "cable + 2 screw holes, all horizontal", lambda: CABLE18 + SCREWS18())
chk('18', "dir: '+X'~bedContact: @N mm²", "30·5 + 5·40", 30 * 5 + 5 * 40)
chk('18', "dir: '+X'~height: @N mm", "+X extent", 60)
chk('18', "(tree; grid would be @N)", "1500 mm² × 40 mm", (60 * 30 - 60 * 5) * 40)
chk('18', "dir: '-Z'~bedContact: @N mm²", "top of the upright 60 × 5", 60 * 5)
chk('18', "dir: '-Z'~height: @N mm", "−Z extent", 45)
chk('18', "+X 71 min 0.05 @N", "71 + 40 × 0.05", 71 + 40 * 0.05)
chk('18', "+Y 52 min 0.60 @N", "52 + 40 × 0.60", 52 + 40 * 0.60)
chk('18', "+Z 58 min 0.80 @N", "58 + 40 × 0.80", 58 + 40 * 0.80)
chk('18', "+X costs @N min", "71 − 52", 71 - 52)
chk('18', "for @N less risk", "0.60 − 0.05", 0.60 - 0.05)
chk('18', "19 / 0.55 = @N min", "19 / 0.55", 19 / 0.55)
chk('18', "F.metrics()~bedContact: @N mm²", "30·5 + 5·40", 30 * 5 + 5 * 40)
chk('18', "F.metrics()~height: @N mm", "+X extent", 60)
chk('18', "→ @N mm³  (1500 mm² × 40 mm)", "1500 × 40", 1500 * 40)
chk('18', "(@N mm² × 40 mm)", "60 × 30 − 60 × 5 (base underside not over the upright)", 60 * 30 - 60 * 5)
chk('18', "(1500 mm² × @N mm)", "45 − 5", 45 - 5)
chk('18', "+Y: support @N mm³ (2 round screw holes)", "2 × r²(1 + π/2)·5, Ø as stated", SCREWS18)
chk('18', "beats +Z @N mm³", "cable hole", CABLE18)
chk('18', "+X @N mm³' }", "cable + screws", lambda: CABLE18 + SCREWS18())
chk('18', "clearance M4 free → Ø @N mm", "4 + 2 × free + holeComp (rule of 14, defaults of 16)", hole(4, 'free'))

# 19 · split and plates ────────────────────────────────────────────────────────────────────────────
def rect_fits(p, q, A, B, step=0.02):
    for i in range(int(90 / step) + 1):
        t = rad(i * step)
        w, h = p * cos(t) + q * sin(t), p * sin(t) + q * cos(t)
        if (w <= A and h <= B) or (w <= B and h <= A):
            return True
    return False


def fits_any(dims, bed):
    a, b, c = dims
    return any(h <= bed[2] and rect_fits(p, q, bed[0], bed[1])
               for p, q, h in ((a, b, c), (a, c, b), (b, c, a)))


FOOT19 = 190 * 140 + 130 * 140 + 6 * 40 * 40 + 3 * 4 * 12
chk('19', "'320 × 140 × @N mm does not fit", "H 40 + feet 1.5", 40 + 1.5)
chk('19', "the bed diagonal is @N mm)", "√(250² + 210²)", math.hypot(250, 210))
chk('19', "mm @S 250 × 210 × 220 mm in any orientation", "fits in some orientation (rotations in the bed plane too)?",
    fits_any((320, 140, 41.5), (250, 210, 220)), parse=lambda s: {'does not fit': False, 'fits': True}.get(s.strip()))
chk('19', "both pieces fit (130 and @N ≤ 250)", "320 − 130", 320 - 130)
chk('19', "two walls 2 × 3 × @N =", "H − floor", 40 - 3)
chk('19', "= @N + @X = @X mm²", "140 × 3", 140 * 3)
chk('19', "= @X + @N = @X mm²", "2 × 3 × 37", 2 * 3 * 37)
chk('19', "= @X + @X = @N mm²", "seam area", 140 * 3 + 2 * 3 * 37)
chk('19', "S.metric('seamArea')~→ @N mm²", "seam area", 140 * 3 + 2 * 3 * 37)
chk('19', "dowel needs 4 + 2 × @N = @X mm", "2 lw", 2 * LW)
chk('19', "dowel needs 4 + 2 × @X = @N mm", "4 + 2 × 0.9", 4 + 2 * 2 * LW)
chk('19', "(feet are at x 10–20 and @N–@X)", "mirror of x 20 about x 160", 2 * 160 - 20)
chk('19', "(feet are at x 10–20 and @X–@N)", "mirror of x 10 about x 160", 2 * 160 - 10)
chk('19', "'dowel × 3'], utilisation: @N }", "(190·140 + 1600 + 3·48) / 52'500", (190 * 140 + 1600 + 3 * 48) / (250 * 210))
chk('19', "'bin × 5'], utilisation: @N }", "(130·140 + 5·1600) / 52'500", (130 * 140 + 5 * 1600) / (250 * 210))
chk('19', "130 + 5 + 190 = @N mm", "side by side", 130 + 5 + 190)
chk('19', "140 + 5 + 140 = @N >", "stacked", 140 + 5 + 140)
chk('19', "→ { footprints: @N mm²", "Σ footprints", FOOT19)
chk('19', "bedArea: @N mm²", "250 × 210", 250 * 210)
chk('19', "bedArea: @X mm², plates: @N }", "⌈Σ A / A_bed⌉", math.ceil(FOOT19 / (250 * 210)))
chk('19', "Σ A = @N + ", "190 × 140", 190 * 140)
chk('19', "Σ A = @X + @N + ", "130 × 140", 130 * 140)
chk('19', "6 × @N + 3 × @X", "40 × 40", 40 * 40)
chk('19', "+ 3 × @N = ", "dowel 4 × 12 lying down", 4 * 12)
chk('19', "= @N mm² → ⌈", "Σ footprints", FOOT19)
chk('19', "⌉ = @N:", "⌈54'544 / 52'500⌉", math.ceil(FOOT19 / (250 * 210)))
chk('19', "'TPU-95A': '@N feet'", "foot × mirror × mirror", 1 * 2 * 2)
chk('19', "swaps: @N (label on tray.b", "3 layers × 2", (0.6 / LAYER) * 2)
chk('19', "(label on tray.b: @N layers × 2 swaps", "0.6 / 0.2", 0.6 / LAYER)

# 20 · slicing ─────────────────────────────────────────────────────────────────────────────────────
DOME20 = 2 / 3 * pi * 40 ** 3
CAV20 = pi * 15 ** 2 * 10 + pi * 15 ** 2 * 15 / 3
INS20 = 3 * pi * (INSERT_M3_HOLE[0] / 2) ** 2 * INSERT_M3_HOLE[1]


def area20(z, inserts=True):
    a = pi * (40 ** 2 - z * z)
    if 3 <= z <= 13:
        a -= pi * 15 ** 2
    elif 13 < z <= 28:
        a -= pi * (28 - z) ** 2
    if inserts and z < INSERT_M3_HOLE[1]:
        a -= 3 * pi * (INSERT_M3_HOLE[0] / 2) ** 2
    return a


SUM20 = sum(area20((k + 0.5) * LAYER) * LAYER for k in range(200))
TT20 = 2 / 0.3                                          # adaptive: t = min(0.3, 2/z) switches at z = 6.67
chk('20', "= @N − @X − @X = @X mm³", "⅔π·40³", DOME20)
chk('20', "= @X − @N − @X = @X mm³", "π·15²·10 + ⅓π·15²·15", CAV20)
chk('20', "= @X − @X − @N = @X mm³", "3 insert holes Ø4.0 × 6.7", INS20)
chk('20', "= @X − @X − @X = @N mm³", "dome − cavity − insert holes", DOME20 - CAV20 - INS20)
chk('20', "P.layers.length~→ @N", "40 / 0.2", 40 / LAYER)
chk('20', "k: 0, z: [0, 0.2] mm, area: @N mm²", "π(40² − 0.1²) − 3 insert holes Ø4.0 (14)", area20(0.1))
chk('20', "k: 0~holes: @N }", "3 inserts", 3)
chk('20', "k: 15, z: [@N, @X] mm", "15 × 0.2", 15 * LAYER)
chk('20', "k: 15~area: @N mm²", "π(40² − 3.1²) − π·15² − 3 insert holes", area20(3.1))
chk('20', "k: 15~holes: @N }", "3 inserts + cavity", 4)
chk('20', "→ @N mm³   against the exact", "Σ area·0.2 over the 200 layers (areas as at k = 0 and 15)", SUM20, strict=True)
chk('20', "against the exact @N mm³", "dome − cavity − 3 insert holes Ø4.0 × 6.7 (14)", DOME20 - CAV20 - INS20, strict=True)
chk('20', "→ { layers: @N, cuspMax: @X mm, cuspMean", "40 / 0.2", 40 / LAYER)
chk('20', "cuspMax: @N mm, cuspMean", "t · max|cos θ|", LAYER * 1)
chk('20', "cuspMean: @N mm", "t · ½", LAYER / 2)
chk('20', "mean(z / R) = @N mm", "0.2 · ½", LAYER / 2)
chk('20', r"re:→ \{ layers: @N, cuspMax: @X mm, printTime: @X min \}\s*$", "6.67/0.3 + (40² − 6.67²)/4",
    TT20 / 0.3 + (40 ** 2 - TT20 ** 2) / 4)
chk('20', "0.3 mm up to z = @N mm", "2 / 0.3", TT20)
chk('20', "from 6.7 to 40 = @N + @X = @X", "6.67 / 0.3", TT20 / 0.3)
chk('20', "from 6.7 to 40 = @X + @N = @X", "∫ z/2 dz, 6.67…40", (40 ** 2 - TT20 ** 2) / 4)
chk('20', "from 6.7 to 40 = @X + @X = @N", "adaptive layer count", TT20 / 0.3 + (40 ** 2 - TT20 ** 2) / 4)
chk('20', r"re:→ \{ layers: @N, cuspMax: @X mm, printTime: @X min \}\s+the same", "40 / 0.05", 40 / 0.05)
chk('20', "quality, @N× the time", "760 / 300", 760 / 300)
chk('20', "→ [@N mm, @X mm]   cavity floor", "cavity floor z", 3)
chk('20', "→ [@X mm, @N mm]   cavity floor", "cavity roof start z", 13)
chk('20', "(k = @N, z = 13.0 mm)", "layers below z = 13", TT20 / 0.3 + (13 ** 2 - TT20 ** 2) / 4)
chk('20', "k = 53: @N layers of 0.3 mm", "6.67 / 0.3", TT20 / 0.3)
chk('20', "from 6.7 to 13 = @N adaptive", "∫ z/2 dz, 6.67…13", (13 ** 2 - TT20 ** 2) / 4)

# 21 · compiler ────────────────────────────────────────────────────────────────────────────────────
# Open box (shelled, top open): outer bottom + 4 outer walls + rim + floor + 4 inner walls.
F21, E21, V21, L21 = 1 + 4 + 1 + 1 + 4, 12 + 12, 8 + 8, (1 + 4 + 1 + 1 + 4) + 1
chk('21', "hinge.clearance = @N mm", "calibrated printInPlace (16)", CLS16['printInPlace'])
chk('21', "base: 4 lines, @N → 0 DOF", "4 lines × 4 − 4 coincidences × 2", 4 * 4 - 4 * 2)
chk('21', "box/body1: @N faces", "open box faces", F21)
chk('21', "faces · @N edges", "outer 12 + inner 12", E21)
chk('21', "edges · @N vertices", "outer 8 + inner 8", V21)
chk('21', "vertices · @N loops", "one loop per face, two on the rim", L21)
chk('21', "16 − 24 + 11 − 1 − 2 = @N", "V − E + F − (L − F) − 2(S − G)", V21 - E21 + F21 - (L21 - F21) - 2 * (1 - 0))
chk('21', "· @N layers × 0.2 mm", "box h 30 / 0.2", 30 / LAYER)
chk('21', "'@N/150 layers recomputed", "label depth 0.6 / 0.2", 0.6 / LAYER)

# 35 · bracket ─────────────────────────────────────────────────────────────────────────────────────
sigma35 = lambda t, g: 100 * (120 - g) / (20 * t ** 2 / 6)
T35 = [5 + 0.5 * i for i in range(9)]
min_t35 = lambda g: min(t for t in T35 if sigma35(t, g) <= 45 / 2.5)
chk('35', "j.plane.offset(j.plane.YZ, mm(@N)))", "8 + g", 8 + 90)
chk('35', "→ { area: @N mm², centroid", "20 × 7.5", 20 * 7.5)
chk('35', "centroid: [@X, 0, @N]", "100 − 7.5/2", 100 - 7.5 / 2)
chk('35', "I: @N mm⁴", "20 · 7.5³ / 12", 20 * 7.5 ** 3 / 12)
chk('35', "top: @N mm³", "I / (t/2) = b·t²/6", 20 * 7.5 ** 2 / 6)
chk('35', "bottom: @N mm³", "b·t²/6", 20 * 7.5 ** 2 / 6)
chk('35', "→ { sigmaArm: @N MPa }", "100 N · (120 − 90) / 187.5", sigma35(7.5, 90))
chk('35', "M = 100 N · @N mm =", "120 − 90", 120 - 90)
chk('35', "· 30 mm = @N N·mm", "100 × 30", 100 * 30)
chk('35', "3000 / 187.5 = @N MPa", "3000 / 187.5", 3000 / 187.5)
chk('35', "safety factor 45 / 16 = @N", "45 / 16", 45 / 16)
chk('35', "safety factor of @N instead", "25 / 16", 25 / 16)
chk('35', "instead of @N. Same", "45 / 16", 45 / 16)
chk('35', "layerStrengthRisk: 0.03, sigmaArm: @N MPa }", "σ at t 7.5, g 90", sigma35(7.5, 90))
chk('35', "mass: @X g, filament: @N m", "43.2 g / 1.27 g/cm³ / (π·0.875²) (17)",
    lambda: claimed('35', "printTime: 2 h 06 min, mass: @N g") / RHO['PETG'] * 1000 / FIL_AREA / 1000)
chk('35', "lte(j.q('@N MPa'))", "45 / 2.5", 45 / 2.5)
chk('35', "//   1 @N mm 75 mm", "smallest t on the grid with σ ≤ 18 MPa at g 75", min_t35(75))
chk('35', "9.0 mm 75 mm @N MPa", "4500 / (20·9²/6)", sigma35(9, 75))
chk('35', "@N N·mm / (20 · 9² / 6)", "100 × (120 − 75)", 100 * (120 - 75))
chk('35', "//   2 @N mm 90 mm", "smallest t on the grid with σ ≤ 18 MPa at g 90", min_t35(90))
chk('35', "7.5 mm 90 mm @N MPa", "3000 / 187.5", sigma35(7.5, 90))
chk('35', "@N N·mm / 187.5 mm³", "100 × (120 − 90)", 100 * (120 - 90))
chk('35', "8.0 mm 90 mm @N MPa", "3000 / (20·8²/6)", sigma35(8, 90))
chk('35', "9.0 mm 60 mm @N MPa", "6000 / (20·9²/6)", sigma35(9, 60))
chk('35', "→ { points: @N, compiled", "9 thicknesses × 3 gussets", len(T35) * 3)

# 70 · planetary gearbox ───────────────────────────────────────────────────────────────────────────
def assemblable(zs, zp, n):
    return (2 * zs + 2 * zp) % n == 0 and (zs + zp) * sin(pi / n) > zp + 2 and zs >= 10


FEAS70 = sum(1 for zs in range(9, 19) for zp in range(9, 31) for n in (3, 4, 5) if assemblable(zs, zp, n)) * 3
A70 = 1.5 * (12 + 18) / 2
chk('70', "space.size~→ @N", "10 · 22 · 3 · 3", 10 * 22 * 3 * 3)
chk('70', "= @N · @X · 3 · 3", "zs 9…18", 18 - 9 + 1)
chk('70', "= @X · @N · 3 · 3", "zp 9…30", 30 - 9 + 1)
chk('70', "feasible.size~→ @N", "assemblable (zs, zp, n) × 3 modules", FEAS70)
chk('70', "//   1 12 18 @N 3", "zr = 12 + 2·18", 12 + 2 * 18)
chk('70', "//   1 12 18 48 3 1.5 mm @N", "1 + 48/12", 1 + 48 / 12)
chk('70', "//   1 12 18 48 3 1.5 mm @X @S @X mm²", "(12, 18, 3) assemblable", assemblable(12, 18, 3), parse=TICK)
chk('70', "//   1 12 18 48 3 1.5 mm @X ✓ @N mm²", "1.5 × 12", 1.5 * 12)
chk('70', "//   2 12 18 48 4 1.5 mm @X @S @X mm²", "(12, 18, 4) assemblable", assemblable(12, 18, 4), parse=TICK)
chk('70', "//   2 12 18 48 4 1.5 mm @X ✓ @N mm²", "1.5 × 12", 1.5 * 12)
chk('70', "//   3 12 18 48 3 1.25 mm @X ✓ @N mm²", "1.25 × 12", 1.25 * 12)
chk('70', "//   4 12 18 48 4 1.25 mm @X ✓ @N mm²", "1.25 × 12", 1.25 * 12)
chk('70', "centreDistance: @N mm = 1.5 · (12 + 18) / 2", "m(zs + zp)/2", A70)
chk('70', "centreDistance: @N mm = 1.5 · (48 − 18) / 2", "m(zr − zp)/2", 1.5 * (48 - 18) / 2)
chk('70', "formula: 3·(@N − 1)", "ring, sun, carrier + 3 planets", 3 + 3)
chk('70', "− 2·@N − @X =", "input, output + 3 pins", 2 + 3)
chk('70', "− 2·@X − @N =", "2 meshes per planet", 2 * 3)
chk('70', "= @N, solver: 1", "3·(6 − 1) − 2·5 − 6", 3 * (6 - 1) - 2 * 5 - 6)
chk('70', "solver: 1, redundant: @N,", "1 − (−1)", 1 - (3 * (6 - 1) - 2 * 5 - 6))
chk('70', "(12 + 48)/3 = @N ∈ ℤ", "(12 + 48) / 3", (12 + 48) / 3)
chk('70', "output = input / @N)", "1 + 48/12", 1 + 48 / 12)
chk('70', "(13 + @N)/3", "zr = 13 + 2·18", 13 + 2 * 18)
chk('70', "/3 = @N is not an integer", "(13 + 49) / 3", (13 + 49) / 3)
chk('70', "fix: 'n = @N, or", "smallest n that assembles zs 13, zp 18",
    min(n for n in range(2, 6) if assemblable(13, 18, n)))
chk('70', "z_s ∈ {@S} with z_p = 18", "zs in 9…18 that assemble with zp 18, n 3",
    {zs for zs in range(9, 19) if assemblable(zs, 18, 3)}, parse=INTSET)
chk('70', "one full period: @N sun turns", "ratio 1 + 48/12", 1 + 48 / 12)
chk('70', "ratioMeasured: @N,", "1 + 48/12", 1 + 48 / 12)
chk('70', "'bridges @N mm over", "carrier disc Ø 2·(a + 7)", 2 * (A70 + 7))
chk('70', "mm over a @N mm gap'", "disc sits layer(2) above the gears", 2 * LAYER)
chk('70', "filament: 61 g, cost: @N usd", "61 g × 22 usd/kg (17)", 61 * PLA_USD_KG / 1000)


# ── Runner ───────────────────────────────────────────────────────────────────────────────────────────
def fmt(v):
    if isinstance(v, bool) or isinstance(v, (set, str)):
        return str(sorted(v) if isinstance(v, set) else v)
    if isinstance(v, (list, tuple)):
        return '[' + ', '.join(fmt(x) for x in v) + ']'
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    digits = 2 if abs(v) >= 100 else 4 if abs(v) >= 0.01 else 6
    return f'{v:.{digits}f}'.rstrip('0').rstrip('.')


def compare_num(text, value, strict):
    c = num(text)
    diff = abs(c - value)
    if diff <= 0.5 * 10 ** (-decimals(text)) + 1e-9 * max(1.0, abs(c)):
        return 'PASS'
    if not strict and diff <= 0.01 * max(abs(value), abs(c)):
        return 'NEAR'
    return 'FAIL'


ORDER = {'PASS': 0, 'NEAR': 1, 'FAIL': 2, 'MISSING': 3, 'ERROR': 3}


def run_check(ch):
    no, m = SRC.find(ch['f'], ch['pat'], ch['occurrence'])
    if m is None:
        return 'MISSING', None, '', ''
    text = m.group(1)
    try:
        value = ch['value']() if callable(ch['value']) else ch['value']
    except Exception as err:                     # a dependency moved: report, don't crash
        return 'ERROR', no, text, f'{type(err).__name__}: {err}'
    if ch['parse'] is not None:
        return ('PASS' if ch['parse'](text) == value else 'FAIL'), no, text, fmt(value)
    if ch['cmp'] == 'lt':
        return ('PASS' if value < num(text) else 'FAIL'), no, text, f'{fmt(value)} < {text}'
    if isinstance(value, (list, tuple)):
        parts = re.findall(NUM, text)
        if len(parts) != len(value):
            return 'FAIL', no, text, fmt(value)
        worst = max((compare_num(p, v, ch['strict']) for p, v in zip(parts, value)), key=ORDER.get)
        return worst, no, text, fmt(value)
    return compare_num(text, value, ch['strict']), no, text, fmt(value)


def main():
    global SRC
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--dir', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'examples'),
                    help='folder with the NN-*.js examples (default: ../examples next to this script)')
    ap.add_argument('--strict', action='store_true', help='treat NEAR (rounding-level) mismatches as failures')
    ap.add_argument('--problems', action='store_true', help='print only rows that are not PASS')
    args = ap.parse_args()
    SRC = Sources(os.path.abspath(args.dir))
    if hasattr(signal, 'SIGPIPE'):                     # let `| head` close the pipe quietly
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)

    rows = []
    for ch in CHECKS:
        status, no, claim, comp = run_check(ch)
        rows.append((status, f"{ch['f']}:{no if no else '?'}", claim, comp, ch['desc']))

    w_loc = max(len(r[1]) for r in rows)
    w_cl = min(14, max(len(r[2]) for r in rows))
    w_co = min(16, max(len(r[3]) for r in rows))
    print(f"{'STATUS':<7} {'FILE:LINE':<{w_loc}}  {'CLAIMED':>{w_cl}}  {'COMPUTED':>{w_co}}  DESCRIPTION")
    for status, loc, claim, comp, desc in rows:
        if args.problems and status == 'PASS':
            continue
        print(f"{status:<7} {loc:<{w_loc}}  {claim:>{w_cl}}  {comp:>{w_co}}  {desc}")

    count = {k: sum(1 for r in rows if r[0] == k) for k in ORDER}
    print()
    print(f"{len(rows)} checks: {count['PASS']} pass, {count['NEAR']} near (within 1 %, not at the shown digits), "
          f"{count['FAIL']} fail, {count['MISSING'] + count['ERROR']} missing/error")
    bad = count['FAIL'] + count['MISSING'] + count['ERROR'] + (count['NEAR'] if args.strict else 0)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
