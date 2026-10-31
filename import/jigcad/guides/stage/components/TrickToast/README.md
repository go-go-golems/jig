# Trick toast

The scored trick, top right for 2.6 s: its name in large bold capitals and its measurements in Plex below.

**Provide** `<div class="tricktoast"><b>kickflip</b><span>flip 0.99 · shove 0.00 · air 0.42 s · +850</span></div>` inside `.skate-stage`; add `bad` and ` · bail` for a bail, and no score. Re-mount it (a new React key) for each trick so the animation restarts, and remove it after 2.6 s.

- Name: Arial 22 px bold, −0.01em, capitals; 18 px and 46 px from the top when the stage is 600 px wide or less.
- Detail: Plex 10.5 px in `st-muted`; wrap only appears when it is over 0.3 turns.
- Fades in over the first 8% and out over the last 18%; the preview pins it.
- Don't stack toasts: a new trick replaces the last one.
