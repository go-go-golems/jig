# Writing interface copy

The workbench's words are short, exact and in the program's own vocabulary. They tell a person what a thing is, what a control does, and what just happened, in that order of priority. Every example below is copy from the app.

## Names

- **Views** are one capitalised word: Notes, Docs, Book, Code, Agent, Reference, Stage, Graph, IR, Traces, Events, Params, Experiments. Each has an about, a lowercase phrase with no full stop: "what this preset is about", "physics and maths, one topic each", "the textbook: Kickflips from First Principles", "the library, editable", "a coding agent with an eval tool", "the API, one page", "the drafting sheet you skate on", "dataflow between systems by phase", "the compiled program as text", "signals and states over time", "tricks, pops, bails, errors", "every parameter, live", "parameter sweeps, headless".
- **Program objects** keep their ids and kinds exactly: `pop/pop` is a system, `recognizer/height` a signal, `pop/snap` a param. Write ids in the code face; never translate them into prose names in a control.
- **Parameters** show the label written in the code (lowercase, says what it does: "tail snap (nose-up spin the slam starts)", "rider take-off speed") followed by the id's last segment.
- **Presets** are code plus title: "B-01 Flatground", "D-03 Onion skins and chronophotographs".

## Controls

- Buttons and menu titles are sentence case, a verb or the thing they make: "Run", "Square up", "Clear", "Reset all", "Save", "Stop", "Export project", "Revert all edits", "Record 20 s of autopilot", "Replay the recording", "Score depth-order strategies…".
- A label that opens a menu ends with ▾ ("Files ▾", "Export ▾", "Show 4 ▾"); one that opens a file picker or a second step ends with … ("Import project…", "Load clip…").
- Toggles name the mode: "Track", "Follow", "Freeze", "Edit", "Changed (3)".
- Every icon button and most buttons have a `title` that says what happens in a full phrase, with its shortcut: "Recompile the library; the world keeps its state (Ctrl+Enter)", "Step 1/120 s (Shift: 12 steps)", "Reset the world (keeps the code)", "Turn the sheet with the rider's heading", "Stop scrolling (the simulation keeps running)".
- Menu items carry a lowercase description of the result: "files, notes and settings as .json", "back to B-01 as published", ".epub for Apple Books, Kobo, Calibre and other readers", "a fresh world from this preset's code, run headlessly: the same clip every time".
- Placeholders say what to type, lowercase: "search the shelf", "search the book", "filter lines", "add a trace: filter signals and states", "new file, e.g. skate/grind.js", "save as my preset: title".

## Explanations

A view explains itself in one `.lbl` sentence in its toolbar, and a menu in a closing note:

- "Live: a change takes effect on the next step. Edit the code to change a default."
- "Dataflow: systems by phase, edges carry the states and signals one writes and another reads. Dashed edges: the reader runs before the writer in the step, so it sees last step's value."
- "Experiments are exported from experiments.js: many headless runs, each a fresh world."
- "Drag a tab to move it; drop it on a tile's edge to split. The layout is kept in this browser."
- "Links that drive the workbench become plain text outside it."

Say the mechanism, not a reassurance. "the world keeps its state" tells a person what Run will not destroy.

## Numbers

- A unit after every quantity, separated by a space: "4.29 m/s", "0.08 m", "160 N", "15 rad/s", "0.49 s", "20 s". Angles in the code's own unit.
- Clocks two decimals ("5.66"), event times three ("2.525"), inspector values three, parameter values as many as they need up to four.
- Thousands separators on scores ("1,059"). A missing value is "—".
- Several related numbers in one line are joined by " · " ("flip · shove · wrap" with "-0.01 · 0.01 · 0.00"; "16 systems · 15 signals · 42 states"). A multiplier uses × ("combo ×2", "1×", "0.25×").
- Status in numbers: "compiled in 7.6 ms · hot: kept 37 states, 4 bodies, 12 system locals, 7 expression states".

## Messages

- **Confirmations** in the past tense, a few words: "Copied", "Saved as U-01", "Back to the preset as published", "Imported B-01-flatground.json".
- **Errors** name the thing, then what went wrong, then what to do: "pop/pop stopped at 2.53 s: … Fix it and press Run (the world resumes), or Reset."; "Saving files is not available here: kickflips-from-first-principles.md was copied to the clipboard instead"; "Nothing recorded yet: turn Record on and let the stage run".
- **Lookups that fail** say exactly what was asked for, lowercase: "no chapter 99", "no trace recognizer/hight", "no file skate/grid.js", "unknown lab link …".
- **Empty states** say what will be here and how to get it: "No traces pinned. Type above to add one, or click *pin trace* in the inspector. Every signal and every numeric state is recorded for the last 20 s, pinned or not."; "This preset has no experiments. Add `experiments.js` exporting `Experiment.from(…)` values."; "Nothing on the shelf matches."; "No chapter mentions that."; "An empty tile. Open a view:".
- **Unavailable features** say so and keep the rest working: "Claude is not available here, so the agent is off. Everything else in the workbench works."

## Never

Exclamation marks, emoji, "please", "oops", "simply", "just", jokes, marketing words, title case in sentences, or a message that blames the person.
