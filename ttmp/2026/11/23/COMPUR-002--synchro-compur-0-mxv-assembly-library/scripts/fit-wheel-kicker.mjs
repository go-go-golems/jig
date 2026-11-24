// From the Jig repository root: node <ticket>/scripts/fit-wheel-kicker.mjs
// Exact containment check for the home-pose straight extrusion pair in M-11.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve('import/jigcad')
const engine = name => import(pathToFileURL(resolve(root, 'src/engine', name)))
const { makeJ } = await engine('j.js')
const { frameOf } = await engine('adapt.js')
const { j, bare } = makeJ()
const source = readFileSync(resolve(root,
  'content/presets/M-11-synchro-compur/compur.parts.js'), 'utf8')
const parts = Function('j', 'mm', source)(j, bare.mm)

function extruded(id, featureId) {
  const feature = parts[id]().items.find(item => item.id === featureId)
  const [region, height] = feature.args
  const { origin, x, y } = frameOf(region.plane)
  if (x.join() !== '1,0,0' || y.join() !== '0,1,0' || origin[0] || origin[1] || height.value <= 0)
    throw Error('Expected a positive extrusion on an untranslated XY plane')
  return { shape: region.spec, low: origin[2], high: origin[2] + height.value }
}

const wheel = extruded('w1', 'wheel')
const pin = extruded('retard', 'kicker')
const pinion = extruded('w2', 'pinion')
if (pin.shape.op !== 'circle' || wheel.shape.op !== 'subtract' ||
    wheel.shape.a.op !== 'polygon' || wheel.shape.b.op !== 'circle')
  throw Error('Profiles have changed. Review the new containment conditions.')
const [cx, cy] = pin.shape.opts.at
const outline = wheel.shape.a.pts
let inside = false
let edgeGap = Infinity
for (const [i, [x, y]] of outline.entries()) {
  const [ex, ey] = outline[(i + 1) % outline.length]
  const dx = ex - x, dy = ey - y
  if (dx === 0 && dy === 0) continue
  if ((ey > cy) !== (y > cy) && cx < x + (cy - y) * dx / dy) inside = !inside
  const t = Math.max(0, Math.min(1,
    ((cx - x) * dx + (cy - y) * dy) / (dx * dx + dy * dy)))
  edgeGap = Math.min(edgeGap, Math.hypot(cx - x - t * dx, cy - y - t * dy))
}
const [bx, by] = wheel.shape.b.opts.at
const radius = pin.shape.r
const boreGap = Math.hypot(cx - bx, cy - by) - wheel.shape.b.r
if (!inside || Math.min(edgeGap, boreGap) < radius)
  throw Error('Pin disk is not entirely inside the wheel face; remeasure intersection.')
const depth = Math.max(0, Math.min(wheel.high, pin.high) - Math.max(wheel.low, pin.low))
const t = wheel.high - wheel.low
const fmt = n => n.toFixed(6)
console.log('Home pose. Distances in mm and volume in mm³.')
console.log('Pin disk edge clearance to tooth outline:', fmt(edgeGap - radius))
console.log('Pin disk edge clearance to wheel bore:', fmt(boreGap - radius))
console.log('Common thickness:', fmt(depth))
console.log('Shared volume:', fmt(depth * Math.PI * radius ** 2))
console.log('For wheel lower face L, positive engagement with pinion 2 requires')
console.log(fmt(pinion.low - t), '< L <', fmt(pinion.high))
console.log('At fixed XY, kicker clearance requires L below', fmt(pin.low - t),
            'or above', fmt(pin.high), '(equality gives face contact).')
