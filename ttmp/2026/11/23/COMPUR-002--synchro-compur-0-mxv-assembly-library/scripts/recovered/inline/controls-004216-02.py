from pathlib import Path
p=Path('import/jigcad/content/presets/M-11-synchro-compur/compur.parts.js')
s=p.read_text()
a=s.index('const cam ='); b=s.index('const latch =',a)
block=s[a:b]
for old,new in [
("mm(10.1))), mm(4.65), { id: 'sleeve'", "mm(11.55))), mm(3.2), { id: 'sleeve'"),
("lug('openingLug', 11.7, openFace, openBack).profiles(), mm(0.8)", "lug('openingLug', 12.15, openFace, openBack).profiles(), mm(0.4)"),
("mm(11.7))), mm(0.8), { id: 'openingWeb'", "mm(12.15))), mm(0.4), { id: 'openingWeb'"),
("mm(11))), mm(1.5), { id: 'endPin'", "mm(11.55))), mm(1.1), { id: 'endPin'"),
("m: 0.3, z: 18", "m: cockingModule, z: 18"),
("m: 0.3, z: 127", "m: cockingModule, z: 127"),
("involute(P.m, P.z, P.axis)", "involute(P.m, P.z, P.axis, 13)"),
("const pinion =", "// Preserve the archive's animation ratio while allowing 0.05 mm of extra\n// centre distance. Phase the pinion gap towards the sector tooth at 43°.\nconst cockingModule = 2 * (21.7 - 0.05) / (127 + 18)\nconst pinion ="),
("127 teeth (module 0.3)", "127 nominal teeth"),
("j.region.circle(19.2).subtract", "j.region.circle(P.m * (P.z / 2 - 1.25)).subtract")]:
 assert block.count(old)==1,old
 block=block.replace(old,new)
p.write_text(s[:a]+block+s[b:])
for f in Path('import/jigcad/content/presets').glob('CP-0[456]-*/meta.json'):
 f.write_text(f.read_text().replace('"Synchro-Compur"','"Compur"'))
p=next(Path('import/jigcad/content/presets').glob('CP-04*/notes.md'))
s=p.read_text().replace("Inspect the setting geometry as an illustrative reconstruction.","The preset keeps the 127:18 ratio used by the recorded motion. It uses a common module of 0.29862 mm, giving 0.05 mm extra centre distance, lowers the annular blank to the tooth root and places a pinion gap opposite a sector tooth. This is a geometric clearance allowance.").replace("The supplied reconstruction uses","The archived reconstruction uses")
s=s.replace("[Open the complete shutter]", "The cam sleeve now starts 0.05 mm above the mechanism plate. The opening lug and web occupy Z 12.15–12.55 mm, between the top of the ring at 12.10 and the closing layer at 12.60. The opening stud reaches 12.70 mm. The arresting pin spans 11.55–12.65 mm and joins the closing web. These heights correct the archive's documented clashes within its reconstructed stack (book §13.5).\n\n[Open the complete shutter]")
p.write_text(s)
