p='/home/claude/jigcad/content/book/22-brep-to-triangles.md'
s=open(p).read()
rep=[
("for a vector field $F$, $\\int_V \\nabla \\cdot F\\,dV = \\oint_S F \\cdot n\\,dA$.",
 "for a vector field $F$, the integral of $\\nabla \\cdot F$ over a solid equals the flux of $F$ through its boundary surface $S$, $\\int \\nabla \\cdot F\\,dV = ∮ F \\cdot n\\,dA$."),
("V = \\frac{1}{3}\\oint_S x \\cdot n\\,dA ,", "V = \\frac{1}{3} ∮ x \\cdot n\\,dA ,"),
("| $I_{xx}$ | 214,221.328 | 214,186.272 | 214,216.498 |", "| inertia about x | 214,221.328 | 214,186.272 | 214,216.498 |"),
("| $I_{zz}$ | 405,641.224 | 405,636.861 | 405,640.746 |", "| inertia about z | 405,641.224 | 405,636.861 | 405,640.746 |"),
("and $I_{zz}$, dominated by the plate's flat sides,", "and the inertia about z, dominated by the plate's flat sides,"),
]
for a,b in rep:
    assert a in s, a[:70]
    s=s.replace(a,b)
open(p,'w').write(s)
p='/home/claude/jigcad/content/book/21-blends-offsets-shells.md'
s=open(p).read()
a="- Shells and drafts have closed-form volumes for prismatic parts, and the kernel matches them to six decimals.\n"
assert a in s; s=s.replace(a,"- Shells and drafts of prismatic parts have closed-form volumes; the kernel matches them.\n")
open(p,'w').write(s); print(len(s.encode()))
