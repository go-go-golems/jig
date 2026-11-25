// Resolved orthographic framing in world units, independent of output size.
export function captureCamera(cam) {
  if (!cam || cam.basis || cam.sketch) throw Error('Choose a 3D Stage view first');
  return { target: [...cam.T], yaw: cam.yaw, pitch: cam.pitch, height: cam.H / cam.s };
}

export function savedView(cameras, name, pixels, zoom = 1) {
  if (!Object.hasOwn(cameras, name)) throw Error('Unknown saved camera: ' + name);
  const c = cameras[name];
  if (!Array.isArray(c?.target) || c.target.length !== 3 || !c.target.every(Number.isFinite) ||
      !Number.isFinite(c.yaw) || !Number.isFinite(c.pitch) || !Number.isFinite(c.height) || c.height <= 0)
    throw Error('Invalid saved camera: ' + name);
  return { name: 'front', yaw: c.yaw, pitch: c.pitch, target: [...c.target], pan: [0,0],
    scale: pixels / c.height * zoom, zoom: 1, sketch: null };
}
