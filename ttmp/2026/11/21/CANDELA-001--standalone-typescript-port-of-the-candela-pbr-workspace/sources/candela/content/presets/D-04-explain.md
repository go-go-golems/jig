---
id: D-04
title: Explain and the IR
group: Diagnostics
about: The same scene three ways: the code, the IR text (one line per node, shared nodes marked), and the DAG — with resolved units and defaults.
tries: Which nodes are shared, and why does that matter for compile time?|Explain the camera exposure in one sentence
docs: architecture, grammar
focus: ir
---
# Explain and the IR

A scene value is a **DAG**: nodes are components, edges are "uses". Because builders are immutable, the same node can be used many times; the IR prints it once and marks the reuse.

- **IR** — the DAG as indented text, values with units, defaults marked;
- **Graph** — the same DAG laid out in layers; shared nodes in red;
- **Console → Explain** — what the compiler decided: defaults filled in, exposures computed, kernels deduplicated.

The agent reads the same three when you ask it *why*.
