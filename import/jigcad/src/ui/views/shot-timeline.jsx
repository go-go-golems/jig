import { useRef, useState } from 'preact/hooks';
import { CAMERAS_FILE, SHOTS_FILE, namedEntries, writeEntry } from '../../render/shot-files.js';
import { validateTimeline } from '../../render/shot-editor.js';

function KeyProperties({value, apply}) {
  const [text, setText] = useState(null), [error, setError] = useState('');
  return <details class="shot-properties"><summary>All key properties</summary>
    <textarea aria-label="Shot key properties" rows="6" value={text ?? JSON.stringify(value,null,2)}
      onInput={e=>setText(e.currentTarget.value)} />
    <button class="btn sm" disabled={text === null} onClick={()=>{
      try { const next=JSON.parse(text); if (apply(next)) {setText(null); setError('');} }
      catch (e) {setError(e.message);}
    }}>Apply key properties</button>
    {error && <span role="alert">{error}</span>}
  </details>;
}

export function ShotTimeline({host, study, keys, components, row, seek, preview, disabled}) {
  const [selected, select] = useState(0), [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const rail = useRef(null), pointer = useRef(null);
  const time = (row ?? study.currentRow()) * study.seconds / study.last;
  const key = keys[selected];
  const scrub = t => seek(Math.round(t / study.seconds * study.last));
  const change = (next, index) => {
    try {
      const value = validateTimeline(next,study,host.files,components);
      const t = next[index]?.time;
      select(Math.max(0,value.findIndex(k => k.time === t)));
      setError(''); setDirty(true); preview(value);
      if (t != null) scrub(t);
      return true;
    } catch (e) { setError(e.message); return false; }
  };
  const edit = patch => change(keys.map((k,i)=>i === selected ? {...k,...patch} : k),selected);
  const pick = i => { select(i); scrub(keys[i].time); };
  const save = () => {
    try {
      writeEntry(host,SHOTS_FILE,study.name,validateTimeline(keys,study,host.files,components));
      setDirty(false); setError(''); host.toast('Shot timeline saved');
    } catch (e) { setError(e.message); }
  };
  let cameraNames = [];
  try { cameraNames = Object.keys(namedEntries(host.files,CAMERAS_FILE)); } catch { /* shown by validation */ }
  return <details class="shot-timeline">
    <summary>Shot timeline{dirty ? ' · unsaved' : ''}</summary>
    <fieldset disabled={disabled}>
      <div ref={rail} class="shot-ruler" aria-label="Shot keys"
        onPointerMove={e=>{
          if (pointer.current === null || e.pointerId !== pointer.current) return;
          const r = rail.current.getBoundingClientRect();
          const seconds = Math.round(1000 * study.seconds * Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)))/1000;
          edit({time:seconds});
        }}
        onPointerUp={()=>{pointer.current=null;}} onLostPointerCapture={()=>{pointer.current=null;}}>
        {[0,1,2,3,4].map(i=><span class="shot-tick" style={{left:i*25+'%'}} key={i}>
          {+(i*study.seconds/4).toFixed(2)} s</span>)}
        <i class="shot-playhead" style={{left:100*time/study.seconds+'%'}} />
        {keys.map((k,i)=><button class={'shot-key'+(i===selected?' on':'')} key={i}
          aria-label={'Shot key at '+k.time+' seconds'} title={k.time+' s · '+Object.keys(k).slice(1).join(', ')}
          style={{left:100*k.time/study.seconds+'%'}} onClick={()=>pick(i)}
          onPointerDown={e=>{e.preventDefault(); pick(i); pointer.current=e.pointerId; rail.current.setPointerCapture(e.pointerId);}} />)}
      </div>
      {key && <><label>Key time (s) <input type="number" min="0" max={study.seconds} step="0.001" value={key.time}
        onChange={e=>edit({time:e.currentTarget.valueAsNumber})} /></label>
        {['surface','edges','annotations'].map(channel=><label key={channel}>{channel}
          <input aria-label={'Key '+channel} type="number" min="0" max="1" step="0.05" value={key[channel] ?? ''}
            onChange={e=>{
              const next = {...key};
              if (!e.currentTarget.value) delete next[channel]; else next[channel]=e.currentTarget.valueAsNumber;
              change(keys.map((k,i)=>i===selected ? next : k),selected);
            }} /></label>)}
        <label>Camera cut <select value={key.view?.camera ?? ''} onChange={e=>edit({view:e.currentTarget.value ? {camera:e.currentTarget.value} : 'stage'})}>
          <option value="">Stage / authored composition</option>{cameraNames.map(name=><option key={name}>{name}</option>)}
        </select></label>
        <KeyProperties key={key.time} value={key} apply={value=>change(keys.map((k,i)=>i===selected ? value : k),selected)} />
      </>}
      <button class="btn sm" disabled={keys.some(k=>Math.abs(k.time-time)<1e-8)} onClick={()=>
        change([...keys,{time,surface:1}],keys.length)}>Add key at playhead</button>
      <button class="btn sm" disabled={keys.length < 2} onClick={()=>change(keys.filter((k,i)=>i!==selected),0)}>Remove key</button>
      <button class="btn sm" disabled={!dirty} onClick={save}>Save timeline</button>
      {(dirty || study.shotError || study.shot !== study.authoredShot || host.files.has(SHOTS_FILE)) && <button class="btn sm" onClick={()=>{
        try {
          writeEntry(host, SHOTS_FILE, study.name, undefined);
          setError('');
        } catch (e) {
          setError('Previewing authored keys. Repair shots.json in Code before saving. ' + e.message);
        }
        preview(study.authoredShot ?? []); setDirty(false); select(0);
      }}>Restore authored keys</button>}
      {error && <span role="alert">{error}</span>}
    </fieldset>
  </details>;
}
