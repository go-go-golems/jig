// Run from the repository root. Test light coverage on the actual CAD mesh.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve('import/jigcad')
const output = resolve(process.argv[2] ?? '/tmp/compur-report-figs')
mkdirSync(output, { recursive: true })
const preset = resolve(root, 'content/presets/CP-02-shutter-blades')
register(pathToFileURL(resolve(root, 'test/engine/loader.mjs')))
const worker = await import(pathToFileURL(resolve(root, 'src/engine/worker.js')))
await worker.handle({ id: 0, op: 'init' })
const read = file => readFileSync(resolve(preset, file), 'utf8')

function topTriangles(bodies) {
  const triangles = []
  for (const body of bodies.filter(b => /^blade[1-5]\//.test(b.id))) {
    const { positions, indices } = body.mesh
    const m = body.transform
    const vertex = index => {
      const x = positions[index * 3], y = positions[index * 3 + 1]
      return [m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13]]
    }
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = Array.from(indices.subarray(i, i + 3), vertex)
      if (side(a, b, c) > 1e-8) triangles.push([a, b, c])
    }
  }
  return triangles
}

function side(a, b, p) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
}

for (const angle of [0, 3.7, 7.4]) {
  const files = {
    'script.js': read('script.js').replace('const stroke = 0', 'const stroke = ' + angle),
    'compur.parts.js': read('compur.parts.js'),
  }
  const { program, error } = await worker.handle({
    id: 1, op: 'compile', entry: 'script.js', files, options: {}
  })
  assert.ok(program?.ok, JSON.stringify(error ?? program?.diagnostics))
  assert.equal(program.summary.bodies, 8, 'one connected solid per component')
  const triangles = topTriangles(program.bodies)
  const outerRadius = Math.max(...triangles.flat().map(([x, y]) => Math.hypot(x, y)))
  assert.ok(outerRadius <= 27.45, 'blade leaves exceed their chamber radius')
  const leaves = program.bodies.filter(b => /^blade[1-5]\//.test(b.id)).map(b => topTriangles([b]))
  writeFileSync(resolve(output, 'triangles-' + angle + '.json'), JSON.stringify(leaves))
  let samples = 0, covered = 0
  for (let x = -12.5; x <= 12.5; x += 0.125) {
    for (let y = -12.5; y <= 12.5; y += 0.125) {
      if (x*x + y*y > 12.5**2) continue
      samples++
      if (triangles.some(([a, b, c]) => [side(a, b, [x,y]), side(b, c, [x,y]),
          side(c, a, [x,y])].every(v => v >= -1e-8))) covered++
    }
  }
  if (angle === 0) assert.equal(covered, samples)
  else if (angle === 7.4) assert.equal(covered, 0)
  else assert.ok(covered > 0 && covered < samples)
  writeFileSync(resolve(output, 'coverage-' + angle + '.json'), JSON.stringify({covered, samples}))
  console.log(angle + ' degrees, ' + covered + ' of ' + samples + ' rays blocked; outer radius ' + outerRadius.toFixed(3) + ' mm')
}
