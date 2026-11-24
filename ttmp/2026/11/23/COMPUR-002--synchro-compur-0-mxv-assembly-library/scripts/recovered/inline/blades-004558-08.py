s=open('/tmp/jig-blade/check.mjs').read().replace("['CP-08-diaphragm','diaphragm.parts.js',[0],'return iris']","").replace("ret+'.interference()'","ret")
a=s.index(' console.log(d,angle')
s=s[:a]+''' const tris=[]
 for(const b of r.program.bodies.filter(b=>b.id.startsWith('blade')&&!b.id.startsWith('bladePlate'))){
  const {positions:p,indices}=b.mesh, m=b.transform
  for(let i=0;i<indices.length;i+=3){
   const t=Array.from(indices.subarray(i,i+3),n=>[m[0]*p[3*n]+m[4]*p[3*n+1]+m[12],m[1]*p[3*n]+m[5]*p[3*n+1]+m[13]])
   if ((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0])>1e-8) tris.push(t)
  }
 }
 let samples=0,covered=0
 for(let x=-12.5;x<=12.5;x+=0.125)for(let y=-12.5;y<=12.5;y+=0.125){
  if(x*x+y*y>12.5**2)continue
  samples++
  if(tris.some(t=>t.every(([a,b],i)=>{let[c,d]=t[(i+1)%3];return (c-a)*(y-b)-(d-b)*(x-a)>=-1e-8}))) covered++
 }
 console.log(angle,covered,samples)
}}
'''
open('/tmp/jig-blade/optical.mjs','w').write(s)
