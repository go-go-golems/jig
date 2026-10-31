import numpy as np
P=[(0,0),(50,2),(47,31),(2,29)]
# lines i: a=P[i], b=P[i+1]
x0=[]
for i in range(4):
    a=P[i]; b=P[(i+1)%4]; x0+= [a[0],a[1],b[0],b[1]]
x0=np.array(x0,float)
def idx(l,k): return 4*l+k  # k: 0 ax 1 ay 2 bx 3 by
rows=[];rhs=[]
def row(d,v=0.0):
    r=np.zeros(16)
    for (i,c) in d: r[i]+=c
    rows.append(r); rhs.append(v)
# coincidences: line i end = line i+1 start
for i in range(4):
    j=(i+1)%4
    row([(idx(i,2),1),(idx(j,0),-1)]); row([(idx(i,3),1),(idx(j,1),-1)])
row([(idx(0,0),1)],0); row([(idx(0,1),1)],0)   # fix p.1.start
row([(idx(0,3),1),(idx(0,1),-1)])  # horizontal p.1
row([(idx(1,2),1),(idx(1,0),-1)])  # vertical p.2
row([(idx(2,3),1),(idx(2,1),-1)])
row([(idx(3,2),1),(idx(3,0),-1)])
A=np.array(rows); b=np.array(rhs)
print('rank',np.linalg.matrix_rank(A))
x=x0-np.linalg.pinv(A)@(A@x0-b)
print(x.reshape(4,4))
print('change norm', np.linalg.norm(x-x0))
