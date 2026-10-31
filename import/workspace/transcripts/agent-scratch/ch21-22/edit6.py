p='/home/claude/jigcad/content/book/22-brep-to-triangles.md'
s=open(p).read()
a="is 0.099 mm inside the sphere: twice the setting.\n"
b=a+"""
```figure
// view: axo
return j.part('ball').add(j.sphere(mm(5)), { id: 'ball' })
```

**Figure 22.2.** A sphere of radius 5 mm. Meshed at the default deflection of 0.05 mm it holds 515.872 mm³ of its exact 523.599 mm³, and its largest triangles, near the equator, lie up to 0.099 mm inside the surface.
"""
assert s.count(a)==1; s=s.replace(a,b)
a="**Figure 22.2.** The filleted peg in a Ø5.3 mm collar"
assert a in s; s=s.replace(a,"**Figure 22.3.** The filleted peg in a Ø5.3 mm collar")
open(p,'w').write(s); print(len(s.encode()))
