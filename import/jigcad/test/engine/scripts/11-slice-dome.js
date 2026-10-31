// A dome paperweight with a cavity: layers are level sets; cusp height t·|cos θ|.
const weight = j.part('weight').material(j.material('PLA'))
  .revolve(j.sketch('q', { on: j.plane.XZ }).arc('a', { center: [0, 0], start: [40, 0], end: [0, 40] })
    .line('l1', 'a.end', [0, 0]).line('l2', [0, 0], 'a.start').profiles(), j.axis.Z, turn(1), { id: 'dome' })
  .revolve(j.sketch('cav', { on: j.plane.XZ }).polyline('p', [[0, 3], [15, 3], [15, 13], [0, 28]], { closed: true }).profiles(),
    j.axis.Z, turn(1), { op: 'cut', id: 'cavity' })
return j.print('weight', { printer: j.printer('mk4'), parts: [weight] }).orient('+Z').slice({ layer: mm(0.2) })
