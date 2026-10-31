// title: A law for fillets
// Drop the (4/3)πr³ term from want and run: the law fails with a case.
const steiner = (a, b, c, r) => a * b * c + 2 * r * (a * b + b * c + c * a)
  + Math.PI * r * r * (a + b + c) + 4 / 3 * Math.PI * r ** 3
const block = ({ w, d, h, r }) => j.part('block')
  .extrude(j.region.rect(w, d), h, { id: 'body' })
  .fillet(j.sel.edges(), r, { id: 'round' })
const law = j.law('fillet.steiner',
  rnd => {
    const w = 5 + rnd() * 40, d = 5 + rnd() * 40, h = 2 + rnd() * 20
    return { w, d, h, r: (0.05 + rnd() * 0.35) * Math.min(w, d, h) }
  },
  ({ w, d, h, r }) => {
    const got = j.compile(block({ w, d, h, r })).metric('volume').value
    const want = steiner(w - 2 * r, d - 2 * r, h - 2 * r, r)
    return { ok: Math.abs(got - want) <= 1e-6 * want, got, want }
  },
  { justifies: 'kernel test of fillets', source: 'Steiner' })
const [res] = j.laws.check([law], { n: 5, seed: 7 })
if (!res.ok) throw new Error(JSON.stringify(res.counterexample))
return block({ w: 30, d: 20, h: 10, r: 3 })
