import { K, oc } from './base.mjs';
const r = x => x;
const circ = new oc.gp_Circ(K.ax2([0,0,0],[0,0,1],null, r), 10);
const edge = new oc.BRepBuilderAPI_MakeEdge(circ).Edge();
console.log(Object.getOwnPropertyNames(oc.BRep_Tool).filter(k => !k.startsWith('_')));
let h;
try { h = oc.BRep_Tool.Curve(edge, 0, 0); console.log('curve', h, typeof h); } catch (e) { console.log('err', e.message); }
const gcurve = h.returnValue;
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(gcurve)).filter(k=>!k.startsWith('_')).slice(0,60).join(' '));
for (const pt of ['Convert_TgtThetaOver2', 'Convert_QuasiAngular', 'Convert_RationalC1', 'Convert_Polynomial']) {
  try {
    const hb = oc.GeomConvert.CurveToBSplineCurve(gcurve, oc.Convert_ParameterisationType[pt]);
    const b = hb.get ? hb.get() : hb;
    const poles = [], w = [], kn = [], mu = [];
    for (let i = 1; i <= b.NbPoles(); i++) { const p = b.Pole(i); poles.push([p.X(), p.Y()].map(v => +v.toFixed(4))); w.push(+b.Weight(i).toFixed(6)); }
    for (let i = 1; i <= b.NbKnots(); i++) { kn.push(+b.Knot(i).toFixed(6)); mu.push(b.Multiplicity(i)); }
    console.log(pt, 'deg', b.Degree(), 'poles', b.NbPoles(), 'rational', b.IsRational(), 'periodic', b.IsPeriodic());
    console.log('  poles', JSON.stringify(poles)); console.log('  weights', JSON.stringify(w)); console.log('  knots', JSON.stringify(kn), 'mult', JSON.stringify(mu));
    // check radius at samples
    let maxe = 0; const f = b.FirstParameter(), l = b.LastParameter();
    for (let k = 0; k <= 1000; k++) { const p = b.Value(f + (l - f) * k / 1000); maxe = Math.max(maxe, Math.abs(Math.hypot(p.X(), p.Y()) - 10)); }
    console.log('  max |r-10|', maxe, 'range', f, l);
  } catch (e) { console.log(pt, 'err', e.message ?? e); }
}
