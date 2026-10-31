import { oc } from './base.mjs';
const ks = Object.keys(oc);
console.log(ks.length);
console.log(ks.filter(k => /Class|State|Extrema_Ext|IntCurvesFace|DistShape|Convert|NurbsConvert|BSpline|Bezier|Interpolate|Unify|Fuse|Common|Cut\b|Mesh|Triangul|Poly_/.test(k)).join(' '));
