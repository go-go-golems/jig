import json,pathlib
for folder,id,title,about,tries in [
 ('CP-03-speed-escapement','CP-03','Speeds escapement','Retard lever, inertia weight, compound train and pallet in the mechanism plate.','Inspect the shared post | Identify the star wheel and pallet'),
 ('CP-07-delayed-action','CP-07','V delayed-action cartridge','Sectioned study of the self-timer input clutch, return spring and pallet lock.','Find the clutch spring | Inspect the locking lever at the pallet')]:
 p={'id':id,'title':title,'group':'Compur','order':int(id[-2:]),'difficulty':'advanced','about':about,'view':'axo','overlays':'shadows,grid','tries':tries}
 pathlib.Path(folder,'meta.json').write_text(json.dumps(p,indent=2)+'\n')
