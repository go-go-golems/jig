#!/bin/bash
# one preset: OptiX with built-in spheres vs custom primitives, same seed; prints the displayed difference
id=$1; O=build/tmp/sphsweep; mkdir -p $O
for v in custom builtin; do ./build/rt/candela-rt render $id --backend optix --size 320x180 --spp 64 --spheres $v --out $O --name $id-$v > $O/$id-$v.log 2>&1 || { echo "$id $v FAILED: $(tail -2 $O/$id-$v.log | tr '\n' ' ')"; exit 0; }; done
echo "$id $(npx tsx scripts/compare-pfm.ts $O/$id-custom.pfm $O/$id-builtin.pfm 2>&1 | grep -o 'displayed 8×8 blocks: RMSE [0-9.]* %')"
