# States, errors and feedback

The workbench runs a live program, so it is often in a state worth showing: edited and not yet run, compiling, stopped by an exception, recording, waiting for a long job. Each state has one place and one look.

## Where each kind of feedback goes

| situation | where | look |
|---|---|---|
| the program compiled | the build pill ("ok", counts), the editor footer ("compiled in 7.6 ms · hot: kept …") | ink |
| the program does not compile | the pill ("2 errors", accent), the Code tab's badge (accent count), the error line (accent number, sel wash), the diagnostics list, the footer ("does not compile: …") | accent |
| a warning from the compiler | the gutter number bold ink, a "!" row in the diagnostics, a plain toast | ink (errors get the red toast) |
| the running program threw | the clock (" stopped" in accent), the pill ("stopped"), a banner on the stage (Form Skate Stage) with the system, time, message and source | accent |
| unsaved edits | " •" after the file, "edited" after the preset title, Run turns primary | ink fill |
| something finished | a toast ("Copied", "Saved as U-01") | ink |
| something failed | a red toast for 5.2 s, or a `.fail` row inside the view when the failure belongs to it ("experiments.js does not load: …") | accent |
| a long job | a Meter with Stop in its row; "Exporting…" in the button's label; a blinking square in a busy pill | ink |
| a selection | a 2px accent inset bar on the row; the node's accent outline in the graph | accent |
| nothing to show | an ink-2 sentence saying what to do | ink-2 |

## Rules

- **Red is earned.** Accent marks an error, a bail or the current selection. If two different things are red at once, one of them should not be.
- **Errors carry their place.** A diagnostic shows `file:line` and opens it on click; the runtime banner names the system and the time ("pop/pop stopped at 2.53 s: …") and opens the source.
- **Recover in place.** After an exception the world stops at that step; fixing the code and pressing Run resumes from the same moment. Say so in the message ("Fix it and press Run (the world resumes), or Reset.").
- **Do not block.** No modal dialogs and no confirmations: destructive actions are undoable (Revert all edits brings the preset back) or say what they remove in their description ("removes your saved preset").
- **Busy without spinners.** Progress is a Meter fed by the job, or a 6px square blinking in steps (0.8 s), never a spinner.
- **Disabled, not hidden,** when the reason is temporary (Run on other experiments while one runs, Replay before anything is recorded), at 40% opacity; hidden when the control can never apply here (Delete on a built-in preset).
- **Offline features degrade with a sentence.** When saving files or Claude is unavailable, say so and offer what still works ("…was copied to the clipboard instead").
