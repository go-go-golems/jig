import { oc } from './lib.mjs';
const keys = Object.keys(oc).filter(k => /^(BRep_Tool|BRepTools|BRepCheck|TopExp|TopTools|BRepAdaptor|ShapeAnalysis|BRepLib|Geom2d|BRepAlgoAPI|BOPAlgo|BRepFilletAPI|TopoDS|BRepGProp|ShapeFix|ShapeUpgrade|Bnd|BRepBndLib|IntTools|BOPDS|BRepClass|TopOpe|Precision|GeomAbs|TopAbs|BRepBuilderAPI|BRepPrimAPI|GeomAdaptor|Geom_|IntPatch|GeomInt|BRepExtrema|BRepAlgo|BRepFeat|BRepOffset|BRepMesh|BRepTopAdaptor|BOPTools)/.test(k));
console.log(keys.join(' '));
