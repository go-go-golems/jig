import cmath,math
c=15.8704+14.7994j
for r in [12.5,10,8,6]:
 for angle in [122,124,128,134,138,140]:
  p=r*cmath.exp(1j*math.radians(angle-72))
  po=c+(p-c)*cmath.exp(-1j*math.radians(36.7))
  print(r,angle,round(abs(po),2),end='|')
 print()
