# AgentPanel

The whole agent panel as it fills one tile of the workbench: threads, settings, off banner, log and composer, top to bottom.

```html
<div class="tabbody col agent-panel">
  <div class="threads">…</div>          <!-- ThreadTabs -->
  <div class="agent-set">…</div>        <!-- AgentSettings -->
  <div class="agent-off">…</div>        <!-- OffBanner, only when the agent cannot run -->
  <div class="agent-log">…</div>        <!-- EmptyState, or UserMessage and AgentMessage turns -->
  <div class="composer">…</div>         <!-- Composer -->
</div>
```

**You provide** a container with a height; the panel is a flex column and only the log scrolls.

- The log has 12px 16px padding and 14px between turns, scrolls on its own (`overscroll-behavior: contain`) and jumps to the bottom on every update.
- The bars are separated by single rules: `hair` under the threads, `rule` under the settings, `hair` over the composer.
- The panel never sets its own width; it takes the tile's. At 518px wide the settings bar wraps to two rows.
