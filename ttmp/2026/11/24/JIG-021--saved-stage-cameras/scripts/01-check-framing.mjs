import assert from 'node:assert/strict';
import {captureCamera,savedView} from '../../../../../../import/jigcad/src/stage/saved-camera.js';
import {makeCam,viewCam,proj} from '../../../../../../import/jigcad/src/stage/camera.js';
import {normalizeShot,shotAt} from '../../../../../../import/jigcad/src/render/shot.js';
const original = makeCam(0.7,0.25,12,[8,-3,7],800,450);
const cameras = {Hook:captureCamera(original)};
const box = [[0,0,0],[40,40,40]];
for (const factor of [1,2]) {
  const cam = viewCam(savedView(cameras,'Hook',450*factor),box,800*factor,450*factor);
  for (const point of [[2,8,4],[-3,0,-1]]) {
    const actual=proj(cam,point), expected=proj(original,point);
    assert.ok(actual.every((v,i)=>Math.abs(v/factor-expected[i])<1e-8));
  }
}
assert.throws(()=>savedView(cameras,'missing',450),/Unknown/);
assert.deepEqual(shotAt(normalizeShot([{time:1,view:{camera:'Hook'}}],'test'),1).view,{camera:'Hook'});
console.log('Saved orthographic camera registration passed at both output sizes');
