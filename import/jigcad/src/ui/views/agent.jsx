// Agent: mounts AgentPanel({ host }) from src/agent/panel.jsx (Form Skate Agent); an empty state until it exists.
import { useEffect, useState } from 'preact/hooks';
import { loadAgent } from '../modules.js';

export function AgentView({ host }) {
  const [mod, setMod] = useState(null);
  useEffect(() => { let alive = true; loadAgent().then(m => alive && setMod(m)); return () => { alive = false; }; }, []);
  if (!mod) return <div class="tabbody col"><p class="empty padded">Loading the agent…</p></div>;
  if (!mod.AgentPanel) return (
    <div class="tabbody col">
      <div class="scroll">
        <p class="empty padded">{mod.error
          ? <>The agent panel failed to load: {String(mod.error.message || mod.error)}. Everything else in the workbench works.</>
          : <>The agent is not part of this build yet (<code>src/agent/panel.jsx</code>). Everything else in the workbench works.</>}</p>
      </div>
    </div>
  );
  const Panel = mod.AgentPanel;
  return <div class="tabbody col agentview"><Panel host={host} /></div>;
}
