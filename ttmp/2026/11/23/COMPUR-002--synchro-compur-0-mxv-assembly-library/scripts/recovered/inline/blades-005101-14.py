p='/tmp/jig-blade/optical.mjs'
s=open(p).read().replace("const tris=[]","const tris=[];let maxR=0").replace("if ((t[1]","for(const [x,y] of t) maxR=Math.max(maxR,Math.hypot(x,y))\n   if ((t[1]").replace("console.log(angle,covered,samples)","console.log(angle,covered,samples,maxR)")
open('/tmp/jig-blade/radii.mjs','w').write(s)
