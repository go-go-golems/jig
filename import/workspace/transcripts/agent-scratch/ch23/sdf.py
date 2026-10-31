import numpy as np, math, time
a, b, c, r = 20.0, 20.0, 10.0, 2.0
ia, ib, ic = a - 2*r, b - 2*r, c - 2*r
steiner = ia*ib*ic + 2*r*(ia*ib + ib*ic + ic*ia) + math.pi*r*r*(ia+ib+ic) + 4/3*math.pi*r**3
print('closed form', repr(steiner))
half = np.array([ia/2, ib/2, ic/2])
def sdf(P):
    q = np.abs(P) - half
    outside = np.linalg.norm(np.maximum(q, 0), axis=-1)
    inside = np.minimum(np.max(q, axis=-1), 0)
    return outside + inside - r
for h in [1.0, 0.5, 0.25, 0.125, 0.0625]:
    t = time.time()
    xs = np.arange(-a/2 - 1 + h/2, a/2 + 1, h); ys = np.arange(-b/2 - 1 + h/2, b/2 + 1, h); zs = np.arange(-c/2 - 1 + h/2, c/2 + 1, h)
    n = len(xs)*len(ys)*len(zs)
    # count samples inside, slab by slab
    inside = 0
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    for z in zs:
        P = np.stack([X, Y, np.full_like(X, z)], axis=-1)
        inside += np.count_nonzero(sdf(P) < 0)
    v = inside * h**3
    print(f'h={h}: samples {n} ({n*4/2**20:.1f} MiB as float32), volume {v:.4f}, error {v - steiner:+.4f} ({100*(v-steiner)/steiner:+.3f} %), {time.time()-t:.2f} s')
print('--- partial volume from the distance: clamp(0.5 - f/h, 0, 1)')
for h in [1.0, 0.5, 0.25, 0.125]:
    xs = np.arange(-a/2 - 1 + h/2, a/2 + 1, h); ys = np.arange(-b/2 - 1 + h/2, b/2 + 1, h); zs = np.arange(-c/2 - 1 + h/2, c/2 + 1, h)
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    occ = 0.0
    for z in zs:
        P = np.stack([X, Y, np.full_like(X, z)], axis=-1)
        occ += np.clip(0.5 - sdf(P) / h, 0, 1).sum()
    v = occ * h**3
    print(f'h={h}: volume {v:.4f}, error {v - steiner:+.4f} ({100*(v-steiner)/steiner:+.4f} %)')
