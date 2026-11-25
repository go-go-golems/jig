import { useState } from 'preact/hooks';
import { Menu, useHost } from '../common.jsx';
import { CAMERAS_FILE, namedEntries, writeEntry } from '../../render/shot-files.js';

export function SavedCameras({host, element}) {
  useHost(host, ['files']);
  const [name, setName] = useState('');
  let cameras;
  try { cameras = namedEntries(host.files, CAMERAS_FILE); }
  catch (error) { return <span role="alert">{error.message}</span>; }
  const key = name.trim();
  const action = fn => {
    try {
      const stage = element.current.jigStage;
      fn(stage);
    } catch (error) { host.toast(error.message, 'bad'); }
  };
  return <Menu label="Cameras ▾" ariaLabel="Saved cameras" btnClass="btn sm">
    <label>Camera name <input aria-label="Camera name" value={name} onInput={e=>setName(e.currentTarget.value)} /></label>
    <button data-keep disabled={!key} onClick={()=>action(stage=>writeEntry(host,CAMERAS_FILE,key,stage.captureCamera()))}>
      {Object.hasOwn(cameras,key) ? 'Update camera' : 'Save camera'}</button>
    {Object.keys(cameras).map(id=><button key={id} onClick={()=>action(stage=>{
      stage.recallCamera(cameras,id);
      setName(id);
    })}>{id}</button>)}
    {Object.hasOwn(cameras,key) && <button data-keep onClick={()=>action(()=>{
      writeEntry(host,CAMERAS_FILE,key,undefined); setName('');
    })}>Remove camera</button>}
  </Menu>;
}
