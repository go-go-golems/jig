import numpy as np, math, time
def f(x,y,z):
    cube = np.maximum(np.maximum(abs(x),abs(y)),abs(z)) - 10
    ball = np.sqrt(x*x+y*y+z*z) - 13
    rods = np.minimum(np.minimum(np.sqrt(x*x+y*y), np.sqrt(y*y+z*z)), np.sqrt(x*x+z*z)) - 5
    return np.maximum(np.maximum(cube, ball), -rods)
exact = 3868.845
for h in [2, 1, 0.5, 0.25, 0.125, 0.1]:
    t=time.time()
    n = int(round(20/h))
    c = (np.arange(n) + 0.5)*h - 10   # cell centres inside the cube
    vol = 0.0
    cnt = 0
    for zi in c:
        X, Y = np.meshgrid(c, c, indexing='ij')
        Z = np.full_like(X, zi)
        cnt += int((f(X,Y,Z) <= 0).sum())
    vol = cnt*h**3
    cells = n**3
    print(f"h={h}: n={n} cells={cells} ({cells/8/1024:.1f} KiB as bits) inside={cnt} vol={vol:.2f} err={vol-exact:+.2f} ({(vol-exact)/exact*100:+.3f}%) {time.time()-t:.1f}s")
