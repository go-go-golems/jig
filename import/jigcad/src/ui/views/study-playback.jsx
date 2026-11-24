// Read-only preview of an assembly study. The Stage owns the camera and meshes.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { advanceStudy } from '../study-samples.js';

const PREVIEW_MS = 4000;

export function StudyPlayback({ host, program }) {
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
    <TrackControls key={name} host={host} program={program} study={studies[name]} />
  </div>;
}

function TrackControls({ host, program, study }) {
  const [track, setTrack] = useState(null);
  const [row, setRow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  const clock = useRef(0), current = useRef(0);
  const last = study.rows.length - 1;

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
      const indices = new Map(result.rows.map((r, i) => [r, i]));
      const playable = result.rows.some((r, i, rows) => i > 0 && r === rows[i - 1] + 1);
      setTrack({ ...result, indices, playable });
      current.current = result.rows[0] ?? 0;
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

  function show(index) {
    const sample = track.indices.get(index);
    if (sample == null) {
      setMessage('Unreachable at ' + driveLabel(index));
      return false;
    }
    const pose = {};
    for (const [id, matrices] of Object.entries(track.T)) {
      pose[id] = matrices.subarray(sample * 16, sample * 16 + 16);
    }
    host.emit('studyPreview', { pose, row: study.rows[index], drive: study.drive });
    current.current = index;
    setRow(index);
    setPreview(true);
    setMessage('');
    return true;
  }
  function driveLabel(index) {
    const value = study.rows[index]?.x;
    return value == null ? '' : +value.toFixed(3) + (study.unit === 'mm' ? ' mm' : '°');
  }
  function play() {
    if (playing) { pause(); return; }
    const start = current.current === last ? track.rows[0] : current.current;
    if (!show(start)) return;
    const began = performance.now();
    setPlaying(true);
    function tick(now) {
      if (host.program !== program || host.compiling) { pause(); return; }
      const elapsed = Math.max(0, now - began);
      const target = Math.min(last, start + Math.floor(elapsed * last / PREVIEW_MS));
      const next = advanceStudy(track.indices, current.current, target);
      if (next.row !== current.current) show(next.row);
      if (next.gap != null) {
        setMessage('Unreachable at ' + driveLabel(next.gap));
        pause();
      } else if (target === last) pause();
      else clock.current = requestAnimationFrame(tick);
    }
    clock.current = requestAnimationFrame(tick);
  }
  return <>
    {track?.rows.length > 0 && !track.playable
      ? <button class="btn sm" onClick={() => show(current.current)}>Show pose</button>
      : <button class="btn sm" aria-label={playing ? 'Pause' : 'Play'}
        disabled={!track?.playable} onClick={play}>{playing ? 'Ⅱ Pause' : '▶ Play'}</button>}
    <input type="range" aria-label="Study sample" aria-valuetext={driveLabel(row)}
      min={0} max={last} step={1} value={row} disabled={!track?.rows.length}
      onInput={e => { const n = +e.currentTarget.value; pause(); if (!show(n)) e.currentTarget.value = current.current; }} />
    <output>{driveLabel(row)}</output>
    {preview && <button class="btn sm" onClick={exit}>Exit preview</button>}
    {message && <span role="status">{message}</span>}
  </>;
}
