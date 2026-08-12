---
date: "Aug 12, 2026"
title: "The Reconciler"
description: "Stop treating LLMs like script runners. Why the future of reliable autonomous agents looks like a Kubernetes control loop enforcing state invariants."
published: true
---
The fundamental flaw in the current slate of LLMs and agent architecture built on top of it is how we as engineers have begun to treat the execution as an imperative sequence of actions rather than a declarative reconciliation of state. Reliable autonomous work doesn't come from teaching an LLM to follow a recipe. Arbiter's orchestration layer started with those assumptions. Right now, by and large we are trying to solve an architectural problem with better instructions. Deterministic operation comes from building a runtime that consistently evaluates state deltas, enforces strict invariants, and executes until _S<sub>actual</sub>_ converges with _S<sub>desired</sub>_.

The future of AI tooling isn't just larger context windows or more complex prompt harnessing. In my opinion it's the runtime itself that matters. It needs to treat model output as a _proposed_ state mutations instead of _actions_. When we shift from asking "what step comes next?" to "what invariant will reach the desired end-state?", agents transform from unpredictable chat scripts into reliable software primitives.

This problem has already been solved in software engineering. Kubernetes doesn't manage massive clusters by running imperative setup scripts; it runs a control loop. You declare a state, _S<sub>desired</sub>_ in a manifest, and the control plane continuously evaluates the difference between what _is_ and what _should be_:

_ΔS = S<sub>desired</sub> − S<sub>actual</sub>_

It doesn't care about how many iterations or intermediate mutations are required. Nor does it blindly execute commands. It executes only the operations that reduce _ΔS_, and halts automatically when convergence is reached.

When a runtime treats model output as a proposed mutation rather than an action, it flips the execution model entirely. Before a single tool call touches a file system, hits a database, or calls a remote API, the runtime will validate the proposed change against pre-conditions and non-negotiable invariants:
- __Pre-conditions:__ Is the target system currently in a valid state to accept this change?
- __Invariants__: Does this mutation breach system constraints?
- __Post-conditions:__ Did the mutation actually move _S<sub>actual</sub>_ closer to _S<sub>desired</sub>_?

If an invariant is violated or a post-condition fails, the mutation should be rejected, the transaction rolls back, and the state delta is re-evaluated. The model isn't asked to "try harder" inside a polluted chat log—the runtime cleanly resets to the last known valid checkpoint and seeks an alternative path to convergence via JIT agents and dynamic model routing.

Under this model, "done" is no longer an LLM self-reporting "I have completed the task." "Done" is a mathematical proof.