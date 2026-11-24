import json
j=json.load(open('/tmp/compur-mec/compur/book/data/plate2.json'))
print({k:v for k,v in j.items() if k not in ('housing','bore')})
