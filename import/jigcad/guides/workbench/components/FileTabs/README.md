# FileTabs

The open files of the Code view as tabs in the code face, with a • for unsaved edits, then the Files menu and Run.

## Use

`.toolbar.filebar` > `.filetabs` > `.ftab` (one per open file). The active file is ink and bold with a 1 px ink underline; others are ink-2. A file with edits shows " •" after its path. The × (`.x`, 50% opacity) closes a tab when more than one is open. After a spacer: `Files ▾` (every file of the library with its line count and "· edited"; a new-file field; Revert; Delete in accent) and Run with ⌘↵, primary when anything is dirty.

## Markup

```html
<div class="toolbar filebar">
  <div class="filetabs">
    <span class="ftab"><button>main.js</button><button class="x" aria-label="close main.js">×</button></span>
    <span class="ftab on"><button>skate/motors.js •</button><button class="x" aria-label="close skate/motors.js">×</button></span>
  </div>
  <span class="sp"></span>
  <div class="rel"><button class="btn">Files ▾</button></div>
  <button class="btn primary">Run <kbd>⌘↵</kbd></button>
</div>
```

## Do and don't

- Do show paths relative to the library root (skate/motors.js), never absolute.
- Don't truncate a path in the middle; the strip scrolls sideways instead.
