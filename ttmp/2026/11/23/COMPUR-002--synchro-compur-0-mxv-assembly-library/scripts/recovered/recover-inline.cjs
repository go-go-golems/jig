// node recover-inline.cjs OUTDIR ROLE COMPUR-SESSION.jsonl
// Reads only literal commands and browser callbacks. Session contents are never executed.
const fs = require('node:fs')
const path = require('node:path')
const acorn = require('acorn')

const [out, role, input] = process.argv.slice(2)
if (!input || !['lead', 'timing', 'blades', 'controls'].includes(role)) {
  throw Error('Expected an output directory, a Compur role, and its session JSONL')
}
const stop = Date.parse('2026-11-24T04:00:00Z')
fs.mkdirSync(out, { recursive: true })

function literal(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked
}

function* walk(node) {
  if (!node || typeof node !== 'object') return
  yield node
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) yield* walk(child)
    } else if (value?.type) yield* walk(value)
  }
}

const bodies = new Set()
let index = 0
function save(body, ext, timestamp) {
  if (bodies.has(body)) return
  bodies.add(body)
  const name = role + '-' + timestamp.slice(11,19).replaceAll(':','') + '-' +
    String(++index).padStart(2, '0') + '.' + ext
  const value = body.replace(/[ \t]+$/gm, '').trimEnd() + '\n'
  const dest = path.join(out, name)
  if (fs.existsSync(dest) && fs.readFileSync(dest,'utf8') !== value) {
    throw Error('Conflicting existing script ' + name)
  }
  fs.writeFileSync(dest, value)
}

for (const line of fs.readFileSync(input, 'utf8').split('\n').filter(Boolean)) {
  const e = JSON.parse(line)
  if (Date.parse(e.timestamp) >= stop || e.type !== 'response_item') continue
  const p = e.payload
  if (p.type !== 'custom_tool_call' || p.name !== 'exec') continue
  const ast = acorn.parse(p.input,{ecmaVersion:'latest',sourceType:'module'})
  for (const n of walk(ast)) {
    const s = literal(n)
    if (!s) continue
    if (p.input.includes('browser_run_code_unsafe') && /^async page =>/.test(s)) {
      save(s, 'browser.js', e.timestamp)
      continue
    }
    // Only shell-executed Python and Node heredocs. A cat heredoc for a preset
    // or document created a separate project artifact already retained by Git.
    const here = /(?:^|[;&|])\s*(?:python3?\s+-|node(?:\s+--input-type=module)?(?:\s+-)?)\s*<<\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm
    for (const match of s.matchAll(here)) {
      save(match[2], /\bnode\b/.test(match[0].split('\n')[0]) ? 'mjs' : 'py', e.timestamp)
    }
  }
}
console.log(role + ': ' + index + ' unique inline script bodies')
