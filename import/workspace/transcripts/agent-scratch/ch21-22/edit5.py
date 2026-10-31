p='/home/claude/jigcad/content/book/21-blends-offsets-shells.md'
s=open(p).read()
a="With `d2` or `angle`, a chamfer is asymmetric, and `d` is measured on the edge's first face in name order (caps last, then alphabetical), so a loop of edges is cut consistently."
b="With `d2` or `angle` a chamfer is asymmetric, `d` measured on the edge's first face in name order, so a loop of edges is cut consistently."
assert a in s; s=s.replace(a,b); open(p,'w').write(s); print(len(s.encode()))
