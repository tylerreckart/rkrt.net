---
date: "July 20, 2026"
title: "Do Agents Dream of Vector Sheep?"
description: "Arbiter’s asynchronous Dreaming feature lets AI agents consolidate memory, synthesize raw facts, and learn from operational mistakes while offline."
published: true
---

One observation I’ve made as I have delved into [harness development](https://github.com/tylerreckart/arbiter) is that if you interact with an agent for long enough, you’ll hit a fundamental limitation: the agent’s memory accumulates raw facts much faster than it builds *structure* from those facts. Arbiter’s memory was built as a [relational, temporal graph](https://rkrt.net/posts/what-i-wanted-was-a-graph/). Even with explicit linkages, this largely still ends up being true in the current implementation.

Right now, most agents only learn if they consolidate information *inside* an active turn. This is the cognitive equivalent of organizing a library while simultaneously answering questions at the front desk. Connections are missed. Conversation-pinned context rarely promotes itself into durable, global understanding. The agent remembers *what* happened, but struggles to build a structural understanding of *why* it matters.

Building on the concept of [dreaming](https://platform.claude.com/docs/en/managed-agents/dreams "dreaming") that Anthropic built on top of Claude, I have been working on a first-party dreaming mechanism built into Arbiter’s native runtime. It’s an asynchronous cycle where Arbiter introspects away from the user. On a scheduled basis, it reviews its own memory and recent run history to make connections it missed during waking hours.

During a dream state, Arbiter doesn’t just read data; it synthesizes it into architectural connections. Redundant facts are merged. Outdated concepts are superseded. Most importantly, isolated, conversation-local insights are elevated into overarching `learning` entries that improve Arbiter and allow it to tailor itself to the user over time. 

It shifts a database of disjointed strings into a structured map of genuine understanding.

## A Subconscious for the Sub-Conscious

In a normal waking state, if an agent repeatedly fails to use a tool correctly, those errors live in the request logs. Unless a human operator intervenes, that friction dies with the session. The agent is doomed to repeat the same loop warning tomorrow.

During a dream, Arbiter aggregates these failed patterns. It reviews its own mistakes, analyzes the context of the tool failures, and synthesizes actionable insights. It quite literally learns from its mistakes offline, ensuring it wakes up equipped to handle the task correctly the next time.

The future of autonomous agents isn't just about how accurately they can generate tokens in the moment. It's about how they compound their knowledge over time without requiring constant human hand-holding. 

As I use and develop Arbiter, my goal is for it to become a system that wakes up just a little bit smarter than it was the day before. This is a step in that direction.

Arbiter is open source and available on [GitHub](https://github.com/tylerreckart/arbiter).