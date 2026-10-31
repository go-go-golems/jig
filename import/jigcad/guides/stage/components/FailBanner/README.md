# Fail banner

A red button bottom left of the stage when a system throws: what stopped, when, the message and the file and line; clicking opens that line.

**Provide** `<button class="ovl-box failbanner"><b>board/trucks stopped at 2.53 s:</b> message — skate/board.js:92. Fix it and press Run (the world resumes), or Reset.</button>`.

- Fill `accent`, text `on-accent` at 12 px, bold lead, 7 × 12 px padding, at most 560 px wide.
- The dark theme's pair is 3.51:1, under 4.5:1: keep the message short and the lead bold.
- Do say what to do next in the banner's last sentence.
- Don't use it for anything but a stopped runtime.
