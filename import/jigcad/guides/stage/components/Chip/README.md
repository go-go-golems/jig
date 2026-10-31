# Chip

Small square tags in the stage's top-left corner: who is riding, recording, replay, and a lower-case hint.

**Provide** markup inside `.skate-stage`: `<div class="chip-row"><button class="chip on">Autopilot</button><span class="chip rec">● REC 12 s</span><span class="chip ghost">click the stage, then ↑ to push</span></div>`.

- `.chip`: Plex 10 px, weight 600, capitals tracked 0.08em, 1 px `st-ink` border, 5 × 8 px padding.
- `.on` fills it with `st-ink`; `.rec` turns it `st-rec`; `.on.rec` fills it `st-rec` (REPLAY); `.ghost` is a quiet hint in `st-muted` with an `st-major` border.
- The row sits 12 px from the corner, 6 px gaps, and ignores the pointer except on the chips themselves.
- Do use a button chip only when clicking does something (AUTOPILOT / YOU toggles the autopilot).
