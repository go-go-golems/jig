---
id: X-02
title: Ten thousand spheres
group: GPU
about: A 100 × 100 grid of instances: the BVH keeps tracing logarithmic, and one material colours them all by instance.
tries: Make it 200 × 200 and watch the frame time|Animate the wave with fx.time
docs: gpu
---
# Ten thousand spheres

Ten thousand objects is nothing special for a BVH: a ray descends about $\log_2 10^4 \approx 13$ levels, testing a few boxes at each. The packing (median splits along the widest axis of the centroids) takes a few tens of milliseconds on the CPU each time the scene is packed; the scene data is ~1 MB of floats. Triangle meshes get a better tree — binned SAH, built once per definition — because their triangles do not move; see *A tray of fasteners*.

Heights come from JS at build time; colours from `p.instance.random` at render time. Check the stats in the status bar and the Console.
