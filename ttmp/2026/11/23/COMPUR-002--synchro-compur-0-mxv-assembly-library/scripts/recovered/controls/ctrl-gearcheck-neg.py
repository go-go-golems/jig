import ctypes as C, math as m, subprocess,json
from pathlib import Path
s=next(Path('import/jigcad/content/presets').glob('M-11*/compur.parts.js')).read_text()
iv=s.split('const pinion =')[1].split('function involute',1)[1].split('  const P = { m:')[0]
module=2*(21.7-0.05)/145
fn='function involute'+iv
sector,pinion=json.loads(subprocess.check_output(['node','-e',fn+f'const a=involute({module},127,[0,0],43,3,68); console.log(JSON.stringify([[...a,[6.5369,16.1794],[17.4261,0.9133]], involute({module},18,[0,0],13)]))']))
lib=C.CDLL('libgeos_c.so.1'); ptr=C.c_void_p
for name,args,out in [('initGEOS',[ptr,ptr],None),('GEOSGeomFromWKT',[C.c_char_p],ptr),('GEOSIntersection',[ptr,ptr],ptr),('GEOSArea',[ptr,C.POINTER(C.c_double)],C.c_int),('GEOSDistance',[ptr,ptr,C.POINTER(C.c_double)],C.c_int),('GEOSGeom_destroy',[ptr],None)]:
 f=getattr(lib,name); f.argtypes=args;f.restype=out
lib.initGEOS(None,None)
def polygon(points,angle,x=0,y=0):
 c=m.cos(m.radians(angle));s=m.sin(m.radians(angle))
 pts=[(x+c*u-s*v,y+s*u+c*v) for u,v in points]
 wkt='POLYGON(('+','.join(f'{x} {y}' for x,y in pts+[pts[0]])+'))'
 return lib.GEOSGeomFromWKT(wkt.encode())
max_area=0;min_gap=9
for i in range(381):
 a=-i/20
 l=polygon(sector,a);r=polygon(pinion,-a*127/18,15.8704,14.7994)
 intersect=lib.GEOSIntersection(l,r);area=C.c_double();dist=C.c_double()
 assert intersect and lib.GEOSArea(intersect,C.byref(area)) and lib.GEOSDistance(l,r,C.byref(dist))
 max_area=max(area.value,max_area);min_gap=min(dist.value,min_gap)
 for t in (intersect,l,r):lib.GEOSGeom_destroy(t)
print(f'Max intersection {max_area:.9f} mm²; min polygon distance {min_gap:.6f} mm; 381 samples from 0 to -19°')
