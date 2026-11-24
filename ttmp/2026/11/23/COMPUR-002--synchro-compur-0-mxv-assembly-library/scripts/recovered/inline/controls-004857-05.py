import json,collections
for b in json.load(open('/tmp/ctrl-meta.json')):
 if b['c'] in ('blade1','bladePlate'):
  print(b['c'],collections.Counter((f['meta'].get('process'),f['meta'].get('kind')) for f in b['faces']))
  for f in b['faces'][:9]:print(f['id'],f['meta'])
