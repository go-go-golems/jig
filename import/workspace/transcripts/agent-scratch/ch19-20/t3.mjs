import { oc } from './lib.mjs';
for (const n of ['Tolerance','Degenerated','IsClosed','CurveOnSurface','Pnt','Range','SameParameter','Curve','Surface','Parameter','MaxTolerance','UVPoints','Continuity','HasContinuity']) {
  const f = oc.BRep_Tool[n]; console.log(n, f.$a ? Object.keys(f.$a) : f.length);
}
for (const n of ['OuterWire','UVBounds','OriEdgeInFace','IsReallyClosed','DetectClosedness','Map3DEdges']) { const f = oc.BRepTools[n]; console.log('BRepTools.'+n, f.$a ? Object.keys(f.$a) : f.length); }
// constructor overloads
for (const n of ['BRepAlgoAPI_BuilderAlgo','BRepAlgoAPI_Section','BRepAlgoAPI_Splitter','BRepAdaptor_Curve2d','BRepCheck_Analyzer','TopExp_Explorer','BRepAlgoAPI_Fuse','BRepFilletAPI_MakeFillet']) { const c = oc[n]; console.log('ctor '+n, c.prototype.constructor === c, Object.keys(c).join(',')); try { const reg = c.prototype; } catch {} }
