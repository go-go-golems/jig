import cmath,math
p=14.0835+11.528j;c=15.8704+14.7994j
for n in range(13):
 a=n*7.7/12*math.pi/180;s=cmath.phase(p*cmath.exp(1j*a)-c)-cmath.phase(p-c)
 v=c+(p*cmath.exp(1j*(a+math.radians(72)))-c)*cmath.exp(-1j*s)
 print(round(v.real,2),round(v.imag,2),round(abs(v),2),round(math.degrees(cmath.phase(v)),1))
