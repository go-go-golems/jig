---
id: agent
title: The agent
group: Start here
about: eval, screenshots, images in, and how it reasons about light
order: 23
---
# The agent

The **Agent** view is a chat with Claude that can work the workbench. It has two tools:

- **eval** runs JavaScript in the page with the whole Candela API in scope, plus the workbench: `files.read/edit`, `run()`, `diagnostics()`, `explain()`, `ir()`, `shader(find)`, `params()`, `setParam()`, live handles (`world.$('#key').power = 1500`), the viewport (`render.status()`, `render.waitSpp(64)`, `render.meter(x, y)`, `render.pick(x, y)`, `render.camera({ at, target })`) and the tests.
- **screenshot** captures the render — or the whole workbench — and sends the picture back to the agent at the start of its next round, so it can *look* at what it changed.

You can show it pictures too: **paste**, **drop** or attach an image — a reference photograph, a sketch, a screenshot of another renderer — and ask it to match the lighting or the material.

## Modes

**Auto** runs each step as it comes; **Ask** shows you each step's code and waits; **Read-only** refuses edits. Every step that changed files can be reverted.

## Connecting it

The agent calls the Anthropic API from this page with your own access: open **Connection** in the Agent view and
enter an API key (or the base URL of a proxy that adds one). It is stored in this browser only. **Model** picks
the tier — *Fast* (`claude-haiku-5-5`), *Balanced* and *Deep* (`claude-opus-5-5`, Deep thinking harder) — and each
tier's model id can be changed there. **Thinking** overrides how much effort the model spends.

## What it is good at

Diagnosing (it reads the codes and the hints), converting between photometric units, tuning by measurement (meter a point, adjust, meter again), and explaining the physics behind a preset. It works from the same reference you can read in the **Reference** view.
