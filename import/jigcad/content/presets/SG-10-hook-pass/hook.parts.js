// Local Z=0 on these parts is the top of the rotary hook ring.
// G25 and M25 are distinct in the Singer parts book. The rotary cup
// turns around the restrained, removable bobbin case.
const tipRadius = 15
const axis = () => j.frame({})
const xy = (region, z) => region.on(j.plane.offset(j.plane.XY, mm(z)))
const circle = (r, at = [0, 0]) => j.region.circle(r, { at })
const annulus = (ro, ri) => circle(ro).subtract(circle(ri))
const radians = a => a * Math.PI / 180
const degs = a => a * 180 / Math.PI
const polar = (r, angle) =>
  [-r * Math.sin(radians(angle)), r * Math.cos(radians(angle))]
function ringSector(id, outer, inner, start, end, z) {
  const on = j.plane.offset(j.plane.XY, mm(z))
  return j.sketch(id, {on})
    .arc('outer', {center:[0,0],
      start:polar(outer,start), end:polar(outer,end)})
    .arc('inner', {center:[0,0],
      start:polar(inner,start), end:polar(inner,end)})
    .line('startEdge','outer.start','inner.start')
    .line('endEdge','outer.end','inner.end').profiles()
}
function rotaryHolder(pointZ) {
  // The lip has an opening ahead of the beak. Its projecting point is
  // a vertex on the tapered end of the upper land (0.12 mm tip thickness).
  const beak = j.region.polygon([polar(tipRadius, 0), polar(16.65, -17),
    polar(16.65, -31), polar(15.5, -31), polar(16.15, -17)])
  return j.part('G25 rotary holder and hook point')
    .material(j.material('steel')).color('#b6a47e')
    .extrude(xy(circle(3.4), -21), mm(6), {id:'driveSpindle'})
    .extrude(xy(circle(16.7), -15), mm(1.1), {id:'cupFloor'})
    .extrude(ringSector('openWall',16.7,15.5,-312,-19,-13.9),
      mm(12.8), {id:'openCupWall'})
    .extrude(ringSector('upperRim',16.7,15.5,-300,-36,-1.1),
      mm(1.1), {id:'ringDatum'})
    .extrude(ringSector('pointBase',16.65,15.5,-37,-20,-1.1),
      mm(1.1+pointZ+0.06), {id:'beakRoot'})
    .extrude(xy(beak, pointZ-0.06), mm(0.12), {id:'point'})
    .port('axis', axis())
    .port('point', j.frame({origin:j.pt(0,tipRadius,pointZ)}))
}
function bobbinCase() {
  const window = j.region.rect(3.3,8,{at:[5,-11]})
  const rim = annulus(12.15,10.95).subtract(window)
  return j.part('M25 removable shuttle hook (bobbin case)').color('#536675')
    .extrude(xy(annulus(12.15,2.7),-13.55),mm(0.85),{id:'caseFloor'})
    .extrude(xy(rim,-12.7),mm(12.5),{id:'slottedCaseWall'})
    .extrude(ringSector('caseFlange',14.55,11.5,70,264,-1.7),
      mm(1.3),{id:'positioningFlange'})
    .cut(xy(window,-1.71),mm(1.32),{id:'threadExit'})
    .port('axis',axis())
}
function bobbin() {
  // Singer specifies a clear plastic Class 15. The opaque CAD tint shows
  // the section. Overall diameter and height use Singer's nominal envelope.
  const rim = annulus(10.5,3.05).subtract(circle(0.9,[7.9,0]))
  return j.part('M41 Class 15 bobbin · 270 006084009').color('#83b9c1')
    .extrude(xy(rim,-12.55),mm(1),{id:'bottomFlange'})
    .extrude(xy(annulus(4.0,3.05),-11.55),mm(10),{id:'hub'})
    .extrude(xy(rim,-1.55),mm(1),{id:'topFlange'})
    .port('axis',axis())
}
function setup(parts) {
  // Same representative maximum-width gate amplitude as SG-08. The
  // right-hand extremum is held over this short rising-stroke window.
  const swing = degs(Math.atan(3 / 73)), a = radians(swing)
  const slide = phase => parts.pose(phase, swing).slide
  let lo = -15, hi = 15
  for(let i=0; i<50; i++) {
    const l=lo+(hi-lo)/3, h=hi-(hi-lo)/3
    if(slide(l)<slide(h)) hi=h
    else lo=l
  }
  const bottom = (lo+hi)/2
  lo=bottom; hi=90
  for(let i=0; i<50; i++) {
    const mid=(lo+hi)/2
    if(slide(mid)-slide(bottom)<3.5) lo=mid
    else hi=mid
  }
  const pass=(lo+hi)/2
  const ringZ=-4 // estimated depth below needle plate
  const { eyeTop, buttToEye, scarfMid, scarfBack } = parts.needleDatums
  // Needle shank origin lies 30 mm down the bar from the drive stud.
  // Set the straight-stitch BDC butt 28.5 mm above the ring (service §3-10).
  const registration=ringZ+28.5-(parts.pose(0,0).stud[1]-30+eyeTop+buttToEye)
  const stud=parts.pose(bottom,swing).stud
  const needleStart = [stud[0]+30*Math.sin(a), 0,
    stud[1]-30*Math.cos(a)+registration]
  const pointX=needleStart[0]-(3.5+scarfMid)*Math.sin(a)
  const pointZ=needleStart[2]+(3.5+scarfMid)*Math.cos(a)-ringZ
  // Choose the midpoint of the separately specified right-side gap band.
  // The center of the vertical bobbin shaft is on the plate X centerline.
  const axisY=scarfBack+0.075-Math.sqrt(tipRadius**2-pointX**2)
  const passTurn=-degs(Math.asin(pointX/tipRadius))
  function at(phase) {
    return { lift:mm(slide(phase)-slide(bottom)),
      rotate:deg(passTurn+2*(phase-pass)) }
  }
  function assembly(phase=pass) {
    const needleFrame=j.frame({origin:j.pt(...needleStart),
      x:j.dir(Math.cos(a),0,Math.sin(a)), z:j.dir(-Math.sin(a),0,Math.cos(a))})
    const base=parts.plate().port('axis',j.frame({origin:j.pt(0,axisY,ringZ)}))
      .port('needleLine',needleFrame)
    return j.assembly('Singer 44S hook pass')
      .add('plate',base,{ground:true}).add('holder',rotaryHolder(pointZ))
      .add('bobbinCase',bobbinCase()).add('bobbin',bobbin())
      .add('needle',parts.needle())
      .joint('rotate',j.joint.revolute(),'plate:axis','holder:axis')
      .joint('caseSeat',j.joint.fixed(),'plate:axis','bobbinCase:axis')
      .joint('bobbinSeat',j.joint.fixed(),'plate:axis','bobbin:axis')
      .joint('lift',j.joint.slider(),'plate:needleLine','needle:slideAxis')
      .measure('Bar rise (mm)', m => m.joint('lift'))
      .measure('Point minus scarf X (mm)', m =>
        m.point('holder', [0,tipRadius,pointZ])[0] -
        m.point('needle', [0,scarfBack,scarfMid])[0])
      .measure('Point minus scarf Y (mm)', m =>
        m.point('holder', [0,tipRadius,pointZ])[1] -
        m.point('needle', [0,scarfBack,scarfMid])[1])
      .params(at(phase))
  }
  return {assembly, at, pass, bottom, ringZ, registration}
}
return { setup, rotaryHolder, bobbinCase, bobbin }
