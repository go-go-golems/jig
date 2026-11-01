// Tool-image probe (JIG-006 §4): a tool whose result carries an image (the shapes JPEG) through jigcad serve; the
// model must describe the image, which it can only see if the tool-result image reached it.
//   node 02-tool-image-probe.mjs IMAGE.jpg [http://127.0.0.1:8788/]
import { readFileSync } from 'node:fs';
const ROOT = new URL('../../../../../../import/jigcad/', import.meta.url);
const { createHttpSample } = await import(new URL('src/host/sample-http.js', ROOT));
const { withImages } = await import(new URL('src/agent/evaltool.js', ROOT));
const data = readFileSync(process.argv[2]).toString('base64');
const base = process.argv[3] || 'http://127.0.0.1:8788/';
const tool = {
  name: 'eval', description: 'Runs code. look() returns a picture of the current view.',
  inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
  async execute(input) { return withImages('image 1: view, 512 × 384 px, attached after the tool results', [{ mimeType: 'image/jpeg', data }]); },
};
for (const tier of ['default', 'complex']) {
  const sample = createHttpSample(base);
  const r = await sample('Call eval with the code `return await look()`. Then list every shape in the picture it returns, with colour and position, and any digit. If no picture reached you, say NO IMAGE.', { tools: [tool], modelTier: tier });
  console.log(tier, r.usage?.input, r.usage?.rounds, '|', r.text.replace(/\s+/g, ' ').slice(0, 400));
}
