"""Plot the CAD-solved trajectories in the same head coordinates."""
from pathlib import Path
import csv
import matplotlib.pyplot as plt

sources = Path(__file__).resolve().parents[1] / "sources"
with (sources / "upper-head-cycle.tsv").open() as stream:
    rows = list(csv.DictReader(stream, delimiter="\t"))
fig, ax = plt.subplots(figsize=(5, 7), layout="constrained")
for name, label, color in [("eye", "Thread take-up eye", "#ad582b"),
                            ("needle", "Needle tip", "#376283")]:
    x = [float(row[name + "_x_mm"]) for row in rows]
    z = [float(row[name + "_z_mm"]) for row in rows]
    ax.plot(x, z, color=color, label=label)
    ax.scatter(x[::9], z[::9], color=color, s=15)
ax.axhline(0, color="grey", linewidth=1, label="Plate surface")
ax.set(aspect="equal", xlabel="Lateral X (mm)", ylabel="Height Z (mm)",
       title="Singer upper head · estimated geometry")
ax.grid(alpha=0.2)
ax.legend(loc="center left", bbox_to_anchor=(0, 0.48))
fig.savefig(sources / "solved-paths.png", dpi=150)
