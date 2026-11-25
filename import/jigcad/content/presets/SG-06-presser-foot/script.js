const presser = await importPartFile('presser.parts.js')
// 0 rests on the plate; footGauge is the midpoint of the service gauge.
const lift = presser.footGauge
return presser.mount(j.assembly('Singer 44S presser-foot lift'), lift)
