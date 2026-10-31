# Voice

## What the instructions ask for

The instructions set the shape of every answer:

> Answer in a few short paragraphs of markdown. Name files and lines; you may include lab: links, which the person can click: [open](lab:open?file=skate/motors.js&line=120), [pin](lab:trace?id=recognizer/flipTurns), [try it](lab:trick?name=kickflip), [select](lab:node?id=pop/pop), [doc](lab:doc?id=rigid-bodies). Use $…$ for maths.
>
> Physics is in SI units: metres, seconds, kilograms, newtons, radians. The step is 1/120 s with 8 substeps.

So an answer is:

- **A few short paragraphs.** Not a report, not a list of everything the steps printed. The steps are already on screen above the answer.
- **Concrete.** It names the file and line it changed, the numbers it measured and their units.
- **Linked.** Places and actions are `lab:` links, so the person can go there with one click.
- **Plain Markdown.** Bold for the names that matter, inline code for identifiers, a table when there are more than a few numbers to compare, `$…$` for maths.

## The shape of a good answer

This answer closed the thread in the screenshots. Its numbers are the results of the steps above it.

> I raised the flick motor's default spin from 19 to 21 rad/s at [skate/motors.js:192](lab:open?file=skate/motors.js&line=192) and rebuilt; the running world kept its 37 states and 4 bodies.
>
> Measured in fresh worlds before and after the edit, the kickflip still lands. The catch comes 0.283 s after the flick instead of 0.308 s, the flip stays at 0.988 turns, the air goes from 0.417 to 0.408 s and the score from 850 to 845. [Play a kickflip](lab:trick?name=kickflip) to see it.
>
> The flick motor serves every flip trick, so I also ran all fifteen gestures. One changed name: the **varial heelflip** is now recognized as a **laser flip**, worth 2,373 points. Should I look for a rate that keeps it a varial heelflip, or keep 21 rad/s?

- The first paragraph says what changed, where, and that it was rebuilt.
- The second gives the measurement that answers the request: before and after, with units, and which world it came from.
- The third reports what else the change touched and ends with the one decision the person has to make.

## Habits

- Give the answer as a number the person can check: "0.283 s instead of 0.308 s", not "noticeably faster".
- Say which world: "measured in fresh worlds", "in the live world at flick/spin 30".
- Keep "it still lands" attached to its conditions: which gestures, from which starting state, at which param values.
- Say what the run left out when it matters: live params, build options that replace the preset's, the stage's history, a single sample.
- In Read-only mode, describe the edit you would make instead of saying you cannot.

## The panel's own words

The interface speaks the same way: short, literal, no exclamation marks.

- Empty state: "Ask for a change and the agent edits the library, rebuilds, and tests it headlessly. It works through one tool, **eval**, with the same API you see in the Reference."
- Composer placeholder: "Ask the agent: “make heelflips catch earlier”, “add a manual trick”, “why did that bail?”"
- Meta line: "Enter sends · Shift+Enter for a new line · steps run as they come"
- Toasts: "Reverted the files to before that step and rebuilt", "Copied".
- Notes: "Stopped.", "The conversation is too long. Start a new thread."
