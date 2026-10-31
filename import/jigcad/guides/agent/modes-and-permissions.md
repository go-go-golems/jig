# Modes and permissions

The settings bar under the threads holds three segmented controls: **Mode**, **Model** and **Thinking**. All three are saved in the browser (`agentSettings`) and apply to the next step or turn.

## Mode

| option | value | tooltip | composer meta line | what happens to a step |
|---|---|---|---|---|
| Auto | `auto` | runs each step | steps run as they come | runs at once |
| Ask | `ask` | you approve each step | you approve each step | opens with its code and waits for **Run this step** or **Decline** |
| Read-only | `read` | no edits | read-only | runs with the guarded scope: editing code, notes or params throws |

The instructions tell the model about both restrictive modes: *In Ask mode the person approves each eval; in Read-only mode edits are refused: say what you would change instead.*

### Ask

While a step waits, its box and dot turn `accent`, the dot blinks, the time slot reads **waiting for you**, and the box is open so the code can be read before it runs.

- **Run this step** resolves the wait with `true`; the step runs as in Auto.
- **Decline** resolves it with `false`. The step is marked failed with the result *The person declined this step.*, and Claude receives: *Declined by the person. Ask what they want instead, or explain the change without running it.*
- **Stop** aborts the whole call. A waiting step resolves as declined.

### Read-only

`files.write`, `files.edit`, `run`, `reset`, `setParam` and `setNotes` throw, and so do `game.setParam`, `game.set`, `game.add`, `game.edit` and `game.reset`; `lab` is the guarded scope too, and `game.paramValues` comes back as a copy. Code can still drive and knock the live world (`perform`, `step`, `world.applyImpulse`). Present Read-only as protection against an accidental edit, never as a sandbox.

## Model and Thinking

| Model option | `modelTier` sent |
|---|---|
| Fast | `quick` |
| Balanced | `default` (the default) |
| Deep | `complex` |

| Thinking option | `effort` sent |
|---|---|
| Auto | nothing (the default) |
| Low | `low` |
| Med | `medium` |
| High | `high` |

The page never names a model. Per the `sample` contract, `effort` applies where the platform runs the chosen tier with thinking and is otherwise ignored.

## When Claude is not available

On mount the panel asks for the capability once. If it resolves `null`, the off banner appears above the log and Send and the suggestions are disabled. If a later call fails with one of the codes below, the banner appears with that code's sentence. The rest of the workbench keeps working. The banner always starts with **The agent is off here.** and then gives one of these:

| cause | sentence |
|---|---|
| no capability at load | Claude is not available in this view, so the agent cannot run. Everything else in the workbench works. |
| no capability when sending | Claude is not available here, so the agent is off. Everything else in the workbench works. |
| `not_granted` | Claude is not allowed for this page. You can allow it from the artifact’s permissions. |
| `sampling_disabled` | Claude is not available for this account. |
| `not_declared` | This page no longer asks for Claude. |
| `capability_disabled` | Claude is unavailable in this view. |
| `tools_unavailable` | This view cannot run the agent’s tool. |
| `capability_removed` | This app version cannot run the agent. |

The same sentence is also left as a note on the turn that failed.

## When a turn ends early

Other outcomes become a note under the turn, in `ink-2` at `fs-xs`. A turn with a note and no text gets the error class, and its **Agent** label turns `accent`.

| outcome | note |
|---|---|
| Stop (`cancelled`) | Stopped. |
| `rate_limited` | Too many requests just now; try again in a little while. |
| `prompt_too_large` | The conversation is too long. Start a new thread. |
| `refused` | Claude declined this request. (Any streamed text is cleared.) |
| the answer was truncated | The answer hit the length limit. |
| anything else | Interrupted: *the error's message or code* |

The panel never retries on its own. Whatever text had streamed before a failure stays on screen, except after `refused`.

## Consent and cost

The page declares the `sample` capability. The viewer is asked for consent at the first call; a call draws on the viewer's own Claude usage, every tool round is another request, and calls with tools are never cached. That is why the agent runs only when the person presses Send, clicks a suggestion or sends a prepared `lab:ask` question.
