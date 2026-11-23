# charts for the vault report "Candela on NVIDIA" (data: CANDELA-002 diary steps 16, evidence various/16-*)
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
OUT = "/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/22/_assets/"
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e1"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "figure.facecolor": SURF, "axes.facecolor": SURF})

def frame(ax):
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    ax.spines["left"].set_color(GRID); ax.spines["bottom"].set_color(GRID)
    ax.tick_params(length=0)

# 1. register limit
fig, ax = plt.subplots(figsize=(8, 4.2), dpi=200)
regs, ms = [128, 168, 200, 255], [2864, 1474, 831, 749]   # 128: mean of 2821 and 2907 ms
ax.grid(axis="y", color=GRID, linewidth=0.8); ax.set_axisbelow(True)
ax.axhline(973, color=INK2, linewidth=1.2, linestyle=(0, (4, 3)))
ax.text(262, 1040, "plain CUDA kernel (155 registers): 973 ms", color=INK2, fontsize=10, ha="right")
ax.plot(regs, ms, color=BLUE, linewidth=2, marker="o", markersize=8, markeredgecolor=SURF, markeredgewidth=2, zorder=3)
for r, m in zip(regs, ms):
    below = m < 1000
    ax.annotate(f"{m:,} ms", (r, m), textcoords="offset points", xytext=(0, -20 if below else 11), ha="center", color=INK, fontsize=10)
ax.set_xticks(regs); ax.set_xticklabels(["128\n(OptiX default)", "168", "200", "255"])
ax.set_ylim(0, 3300); ax.set_xlim(118, 265)
ax.set_xlabel("OptixModuleCompileOptions::maxRegisterCount"); ax.set_ylabel("render time (ms)")
frame(ax)
fig.suptitle("K-09 on the OptiX target: render time against the register limit", x=0.02, ha="left", fontsize=13, color=INK, fontweight="bold")
ax.set_title("960×540, 256 samples per pixel, motion blur off · WebGPU takes 5,201 ms", loc="left", fontsize=10, color=INK2)
fig.tight_layout(); fig.savefig(OUT + "candela-nvidia-register-limit.png", facecolor=SURF); plt.close(fig)

# 2. speedup over WebGPU
presets = ["B-01\none sphere", "K-09\n34 meshes", "X-02\n10,000 spheres", "V-04\nvolumetric cloud"]
web = [516, 5201, 14829, 8110]; cuda = [141, 973, 2001, 4671]; optix = [422, 741, 1144, 8295]
sc = [w / c for w, c in zip(web, cuda)]; so = [w / o for w, o in zip(web, optix)]
fig, ax = plt.subplots(figsize=(8, 4.4), dpi=200)
import numpy as np
x = np.arange(len(presets)); w = 0.36
ax.grid(axis="y", color=GRID, linewidth=0.8); ax.set_axisbelow(True)
b1 = ax.bar(x - w / 2 - 0.01, sc, w, color=BLUE, label="CUDA (NVRTC, Candela's BVH)", edgecolor=SURF, linewidth=2)
b2 = ax.bar(x + w / 2 + 0.01, so, w, color=AQUA, label="OptiX (RT cores, 255 registers)", edgecolor=SURF, linewidth=2)
for bars, vals in ((b1, sc), (b2, so)):
    for b, v in zip(bars, vals):
        ax.annotate(f"{v:.2f}×" if v < 1.05 else f"{v:.1f}×", (b.get_x() + b.get_width() / 2, v), textcoords="offset points", xytext=(0, 4), ha="center", color=INK, fontsize=10)
ax.axhline(1, color=INK2, linewidth=1.2, linestyle=(0, (4, 3)))
ax.text(-0.62, 1.15, "WebGPU = 1×", color=INK2, fontsize=10, ha="left")
ax.set_xlim(-0.65, 3.5); ax.set_xticks(x); ax.set_xticklabels(presets); ax.set_ylabel("speed-up over WebGPU (Dawn)"); ax.set_ylim(0, 14.5)
ax.legend(frameon=False, loc="upper left", bbox_to_anchor=(0.02, 1.0), labelcolor=INK)
frame(ax)
fig.suptitle("The same path tracer on three targets, one GPU", x=0.02, ha="left", fontsize=13, color=INK, fontweight="bold")
ax.set_title("960×540, 256 samples per pixel · --backend auto picks CUDA for B-01 and V-04, OptiX for K-09 and X-02", loc="left", fontsize=10, color=INK2)
fig.tight_layout(); fig.savefig(OUT + "candela-nvidia-speedup.png", facecolor=SURF); plt.close(fig)
print("ok")
