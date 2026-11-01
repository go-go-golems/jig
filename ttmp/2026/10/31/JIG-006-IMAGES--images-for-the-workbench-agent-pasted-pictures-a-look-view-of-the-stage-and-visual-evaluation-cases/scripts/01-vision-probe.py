#!/usr/bin/env python3
"""Vision probe (JIG-006 §2): send a known JPEG to lunaroute directly and through jigcad serve.

usage: python3 01-vision-probe.py IMAGE.jpg [--serve http://127.0.0.1:8787/] [--direct]
The lunaroute key is read from ~/.pi/agent/models.json and never printed.
"""
import base64, json, sys, urllib.request, os

Q = ("List every shape in the image with its colour and position (left/right, top/bottom), and any digit "
     "you can read. If you cannot see an image, say NO IMAGE.")

def direct(b64, models):
    key = json.load(open(os.path.expanduser('~/.pi/agent/models.json')))['providers']['lunaroute']['apiKey']
    for model in models:
        body = {"model": model, "max_tokens": 400, "messages": [{"role": "user", "content": [
            {"type": "text", "text": Q}, {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64}}]}]}
        req = urllib.request.Request('https://gw.lunaroute.com/v1/chat/completions', json.dumps(body).encode(),
                                     {'content-type': 'application/json', 'authorization': 'Bearer ' + key})
        r = json.load(urllib.request.urlopen(req, timeout=120))
        print('direct', model, 'prompt_tokens', r.get('usage', {}).get('prompt_tokens'), '|',
              (r['choices'][0]['message'].get('content') or '').replace('\n', ' ')[:400])

def serve(b64, base, tiers):
    for tier in tiers:
        body = {"input": Q, "modelTier": tier, "images": [{"mimeType": "image/jpeg", "data": b64}]}
        req = urllib.request.Request(base + 'api/sample', json.dumps(body).encode(), {'content-type': 'application/json'})
        typ = None
        for raw in urllib.request.urlopen(req, timeout=180):
            line = raw.decode().strip()
            if line.startswith('event: '): typ = line[7:]
            elif line.startswith('data: ') and typ in ('result', 'error'):
                e = json.loads(line[6:])
                print('serve', tier, typ, e.get('usage', {}).get('input'), '|', (e.get('text') or e.get('message') or '').replace('\n', ' ')[:400])

if __name__ == '__main__':
    img = sys.argv[1]
    b64 = base64.b64encode(open(img, 'rb').read()).decode()
    if '--direct' in sys.argv: direct(b64, ['glm-5.3-flash', 'deepseek-4.1-flash'])
    base = sys.argv[sys.argv.index('--serve') + 1] if '--serve' in sys.argv else 'http://127.0.0.1:8787/'
    serve(b64, base, ['default', 'complex'])
