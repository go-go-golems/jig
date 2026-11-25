// Read-only preview of an assembly study. The Stage owns the camera and meshes.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { projectShot } from '../../render/shot-editor.js';
import { useHost } from '../common.jsx';
import { advanceStudy, presentationSample } from '../study-samples.js';

const PREVIEW_MS = 4000;

export function StudyPlayback({ host, program, renderStudy }) {
  const studies = program.assembly.studies;
  const names = Object.keys(studies).filter(name => studies[name].rows?.length);
  const [selected, select] = useState(null);
  const name = names.includes(selected) ? selected : names[0];
  if (!name) return null;
  return <div class="toolbar studyplayback">
    {names.length > 1
      ? <select aria-label="Motion study" value={name} onChange={e => select(e.currentTarget.value)}>
        {names.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      : <span class="lbl">Study · {name}</span>}
    <TrackControls renderStudy={renderStudy} key={name} host={host} program={program} study={studies[name]} />
  </div>;
}

function TrackControls({ host, program, study, renderStudy }) {
  useHost(host, ['files']);
  const projectKeys = host.files.get('shots.json'), cameras = host.files.get('cameras.json');
  const [track, setTrack] = useState(null);
  const [row, setRow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  const clock = useRef(0), current = useRef(0);
  // The live checkbox lets the user change repetition while the clock runs.
  const loop = useRef(null);
  const config = host.preset?.presentation;
  const presentation = config?.study === study.name ? config : null;
  const intro = presentation ? presentationSample(0).intro : 0;
  const last = study.rows.length - 1 + intro;

  function pause() {
    cancelAnimationFrame(clock.current);
    clock.current = 0;
    setPlaying(false);
  }
  function exit() {
    pause();
    host.emit('studyPreview', null);
    setPreview(false);
    current.current = track?.rows[0] ?? 0;
    setRow(current.current);
    setMessage('');
  }

  useLayoutEffect(() => {
    let live = true;
    setTrack(null);
    setMessage('');
    setPreview(false);
    setPlaying(false);
    current.current = 0;
    setRow(0);
    const valid = () => live && host.program === program && !host.compiling;
    host.call('studyTrack', { name: study.name }).then(result => {
      if (!valid()) return;
      const indices = new Map();
      if (result.rows[0] === 0) {
        for (let r = 0; r < intro; r++) indices.set(r, 0);
      }
      result.rows.forEach((r, i) => indices.set(r + intro, i));
      const rows = [...indices.keys()];
      const playable = rows.some((r, i) => i > 0 && r === rows[i - 1] + 1);
      setTrack({ ...result, rows, indices, playable });
      current.current = rows[0] ?? 0;
      setRow(current.current);
      if (!indices.size) setMessage('No reachable samples');
    }).catch(error => { if (valid()) setMessage(error.message); });
    const hidden = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      live = false;
      cancelAnimationFrame(clock.current);
      host.emit('studyPreview', null);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [host, program, study]);

  function frameAt(index) {
    const sample = track.indices.get(index);
    if (sample === undefined) throw Error('Unreachable study sample: '+index);
    const frame = presentation && presentationSample(index);
    const pose = {};
    for (const [id, matrices] of Object.entries(track.T)) {
      const matrix = matrices.subarray(sample * 16, sample * 16 + 16);
      const offset = presentation?.offsets[id];
      if (frame?.spread && offset) {
        pose[id] = matrix.slice();
        for (let axis = 0; axis < 3; axis++) pose[id][12 + axis] += offset[axis] * frame.spread;
      } else pose[id] = matrix;
    }
    return { pose, row: study.rows[frame ? frame.source : index], drive: study.drive,
      componentNameOpacity: presentation?.fadeComponentNames ? frame.spread : undefined, offsets: presentation?.offsets };
  }
  useLayoutEffect(() => {
    if (!track?.playable) return;
    const seconds = presentation ? last / 24 : PREVIEW_MS / 1000;
    let shot, shotError;
    try { shot = projectShot({...study,seconds},host.files,program.assembly.components); }
    catch (e) { shotError = e.message; }
    renderStudy.current = {
      name: study.name, shot, authoredShot: study.shot, shotError, frameAt, rows: track.rows, last,
      complete: track.rows.length === last + 1,
      seconds,
      cyclic: !!presentation,
      currentRow: () => current.current,
      pause,
    };
    return () => { renderStudy.current = null; };
  }, [track, program, study, projectKeys, cameras]);

  function show(index) {
    const sample = track.indices.get(index);
    if (sample == null) {
      setMessage('Unreachable at ' + driveLabel(index));
      return false;
    }
    host.emit('studyPreview', frameAt(index));
    current.current = index;
    setRow(index);
    setPreview(true);
    setMessage('');
    return true;
  }
  function driveLabel(index) {
    const frame = presentation && presentationSample(index);
    if (frame?.label) return frame.label + ' · ' + Math.round(frame.spread * 100) + '%';
    const value = study.rows[frame ? frame.source : index]?.x;
    return value == null ? '' : +value.toFixed(3) + (study.unit === 'mm' ? ' mm' : '°');
  }
  function play() {
    if (playing) { pause(); return; }
    const start = current.current === last && !loop.current.checked ? track.rows[0] : current.current;
    if (!show(start)) return;
    const began = performance.now();
    let previousStep = 0;
    setPlaying(true);
    function tick(now) {
      if (host.program !== program || host.compiling) { pause(); return; }
      const elapsed = Math.max(0, now - began);
      const step = Math.floor(presentation ? elapsed * 24 / 1000 : elapsed * last / PREVIEW_MS);
      const repeat = loop.current.checked;
      const next = advanceStudy(track.indices, current.current, step - previousStep, last, repeat);
      previousStep = step;
      if (next.row !== current.current) show(next.row);
      if (next.gap != null) {
        setMessage('Unreachable at ' + driveLabel(next.gap));
        pause();
      } else if (!repeat && next.row === last) pause();
      else clock.current = requestAnimationFrame(tick);
    }
    clock.current = requestAnimationFrame(tick);
  }
  return <>
    {track?.rows.length > 0 && !track.playable
      ? <button class="btn sm" onClick={() => show(current.current)}>Show pose</button>
      : <button class="btn sm" aria-label={playing ? 'Pause' : 'Play'}
        disabled={!track?.playable} onClick={play}>{playing ? 'Ⅱ Pause' : '▶ Play'}</button>}
    {track?.playable && <label><input type="checkbox" defaultChecked={!!presentation} ref={loop} /> Loop</label>}
    <input type="range" aria-label="Study sample" aria-valuetext={driveLabel(row)}
      min={0} max={last} step={1} value={row} disabled={!track?.rows.length}
      onInput={e => { const n = +e.currentTarget.value; pause(); if (!show(n)) e.currentTarget.value = current.current; }} />
    <output>{driveLabel(row)}</output>
    {preview && <button class="btn sm" onClick={exit}>Exit preview</button>}
    {message && <span role="status">{message}</span>}
  </>;
}
