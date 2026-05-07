---
date: "May 5, 2026"
title: "Who Watches the Agent?"
description: ""
published: true
---

Agents get things wrong. Wrong in the way that takes a human ten minutes to notice and an hour to unwind. The tool call returned an empty result and the agent inferred success. The retrieval pulled the wrong document and the agent summarized it anyway. The subtask hit a malformed response and the agent looped, each iteration further from the original goal.
 
These aren't model-quality failures. Frontier models don't have them at meaningfully lower rates than mid-tier ones. They're structural failures — and they share a common shape. The agent doing the work is usually the agent deciding whether the work is going well.
 
This is the AI equivalent of letting a contractor sign off on their own inspection.
 
This isn't a model capability problem. You can prompt a model to be self-critical and it will be, in the same way an enthusiastic intern can be told to double-check their work and will, mostly. What you can't do with a prompt is create the structural separation that makes oversight robust under load. Judgment under load is qualitatively different from execution under load. Asking one entity to do both is the failure mode, not the prompt.
 
In my own work building orchestration frameworks, I've landed on a structural foundation. One model — the *executor* — does the work. It has tool access, a narrow mandate, and a context window full of the messy detail of getting things done. A second model — the *advisor* — watches. The advisor has a different prompt, a different (smaller, cleaner) context, and the authority to escalate, redirect, or halt the executor mid-task.
 
Two models, two roles. The executor cannot mark its own work complete without the advisor's assent. The advisor cannot do the work itself.
 
The IC writes the code; the reviewer doesn't. The trader places the order; the desk has veto power. These structures exist because separating execution from judgment is the only known way to keep complex systems from failing silently. The advisor pattern is my attempt to implement the agent-runtime version of the same insight.

A library exposing `Agent` and `Graph` primitives can't make you separate execution from judgment any more than a Python library can make you write thread-safe code. You can put a `Critic` class in the framework, document it, name it suggestively — and people will use it as a fancy logger, or skip it entirely, or have the executor invoke it and ignore the response. The enforcement has to live below the API. The runtime has to *own* the message bus, the lifecycle, and the escalation path. The executor has to be unable to mark itself complete; that authority has to be held by something the executor cannot bypass.
 
You wouldn't run a multi-process system where any process could mark its own work complete and exit. You'd have a scheduler. You wouldn't let a process decide its own resource limits. You'd have a kernel. The advisor is the runtime analogue of supervised execution. It's not a feature of the agent layer; it's the property of the system that makes the agent layer trustworthy.

## What this looks like in practice
 
I've been building [Arbiter](https://github.com/tylerreckart/arbiter) as one answer to this. The architecture has the executor/advisor split as a runtime primitive, not an abstracted convention. Executors run with full tool access and a task-scoped context. The advisor runs concurrently with a different system prompt, sees the executor's tool calls and outputs but not its full reasoning trace, and can issue three signals: *continue*, *redirect with guidance*, *halt and escalate to the user*. The executor cannot return a final result without an advisor *continue* on the terminating step. Not all agents and tasks need this pattern, though. Arbiter's agent schema allows for executor/advisor pairs to be defined per-agent along with defined roles and capabilities.
 
Most advisor interventions aren't catching outright errors; they're catching the executor narrowing its interpretation of the task in a way the original prompt didn't authorize. "You're now solving a slightly different problem than the user asked about" is the advisor's most common output, and it's the kind of correction that's nearly impossible to get from a self-supervising loop.
 
The meta-question — who watches the advisor — has a less satisfying answer than I'd like. Right now: the user does, at the escalation boundary. The advisor's job is to surface decisions to the human at the right granularity, not to be infallible itself. Recursion all the way down isn't the answer; what you want is for the system to fail loudly to the human rather than quietly to itself, and the advisor's structural role is to make loud failure the default.
 
## Conclusion
 
The bet underneath all of this is that agent runtimes are going to look more like operating systems than like libraries — that the interesting work over the next few years is in the layer below the agent, not the layer above it. The frameworks will keep getting better at composition. But composition isn't the bottleneck. Trust is. And trust comes from structure.
 
Self-supervising agents are a local maximum. They work well enough that the field has converged on them, and they fail in ways that are easy to dismiss as model-quality issues that the next checkpoint will fix. They won't. The next model will be smarter and just as confidently wrong about harder problems.