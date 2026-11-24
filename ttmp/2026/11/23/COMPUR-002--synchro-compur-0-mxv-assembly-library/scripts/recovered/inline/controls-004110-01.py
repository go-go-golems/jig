from pathlib import Path
import json
for id,title,about in [
('04','Cocking and release','Study the setting ring, pinion, cam and release foot on their bearings.'),
('05','Front controls','Inspect the seated speed cam, setting ring and retaining plate.'),
('06','Flash contact study','Inspect the two-lever flash contact stack from the 00-MXV course photographs.')]:
 d=next(Path('.').glob('CP-'+id+'-*'))
 (d/'meta.json').write_text(json.dumps(dict(id='CP-'+id,title=title,group='Synchro-Compur',order=int(id),difficulty='advanced',about=about,view='axo',overlays='shadows,grid',tries='Inspect the plan view | Inspect the stack from the side'),indent=2)+'\n')
