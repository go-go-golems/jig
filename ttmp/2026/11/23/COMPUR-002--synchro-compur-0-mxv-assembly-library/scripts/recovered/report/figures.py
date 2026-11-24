import json
import sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
from matplotlib.collections import PolyCollection
from shapely.geometry import Polygon
from shapely.ops import unary_union
d=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/compur-report-figs')
ref=Path(sys.argv[2]) if len(sys.argv)>2 else Path('/tmp/compur-mec/compur/book')
j=json.loads((ref/'data/plate2.json').read_text())
fig, ax=plt.subplots(figsize=(6,6.2))
ax.imshow(plt.imread(ref/'web'/j['img']),cmap='gray')
o=j['housing']['c']; p=j['pinion']
ax.add_patch(Circle(o,j['housing']['R'],fill=False,ec='#087388',lw=2))
ax.plot([o[0],p[0]],[o[1],p[1]],color='#b74014',lw=2.8)
for point,label,xy in [(o,'Housing center',(40,35)),(p,'Pinion 517',(45,-27))]:
    ax.scatter(*point,s=40,c='#b74014',edgecolors='white')
    ax.annotate(label,point,xytext=xy,textcoords='offset points',ha='center',fontsize=11,bbox=dict(boxstyle='round,pad=.28',fc='white',ec='#bbb'),arrowprops=dict(arrowstyle='-',color='#5d6266'))
ax.set_axis_off()
fig.savefig(d/'compur-pivot-measurement.jpg',dpi=175,bbox_inches='tight',pad_inches=.05)
plt.close(fig)
fig,axs=plt.subplots(1,3,figsize=(11.4,4.5))
colors=['#28546b','#387084','#568b97','#79a5a9','#a3beb4']
for ax,angle in zip(axs,['0','3.7','7.4']):
    coverage=json.loads((d/('coverage-'+angle+'.json')).read_text())
    leaves=json.loads((d/('triangles-'+angle+'.json')).read_text())
    for i,tri in enumerate(leaves):
        ax.add_collection(PolyCollection(tri,facecolors=colors[i],edgecolors=colors[i],linewidth=.22))
        shape=unary_union([Polygon(t) for t in tri]); polys=list(shape.geoms) if shape.geom_type=='MultiPolygon' else [shape]
        for poly in polys:
            x,y=poly.exterior.xy; ax.plot(x,y,color='#244249',lw=.6)
    ax.add_patch(Circle((0,0),12.5,fill=False,ls='--',lw=1.4,ec='#b13e14',zorder=4))
    ax.set(xlim=(-27.6,27.6),ylim=(-27.6,27.6),aspect='equal',title=angle+'° ring stroke',xlabel=f"{coverage['covered']:,} / {coverage['samples']:,} rays blocked")
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_visible(False)
fig.subplots_adjust(left=.01, right=.99, bottom=.13, top=.90, wspace=.05)
fig.savefig(d/'compur-blade-stroke.png',dpi=150,facecolor='white',bbox_inches='tight',pad_inches=.12)
