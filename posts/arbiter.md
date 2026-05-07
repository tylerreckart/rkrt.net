---
date: "April 10, 2026"
title: "Arbiter: A Lean Runtime for Agents"
description: A lightweight C++ agent orchestrator for the Claude API — raw TLS sockets, no dependencies, constitution-governed agents with three brevity levels, background loops, and persistent memory."
published: true
---
I talk to Claude a lot. It's part of my daily engineering workflow. It helps me think through projects, draft writing, and explore ideas. At some point I started wondering what it would look like to build my own interface to the API—something lean, opinionated, and designed around how I actually work rather than how someone else's TUI assumes I do.

Arbiter is the result. It's a lightweight agent orchestration runtime written in C++. No frameworks, no HTTP libraries, no dependency manager. It talks to the Claude API over raw TLS sockets, manages multiple agents with distinct personalities and goals, and runs as an interactive REPL, a TCP server, or a one-shot CLI. The whole thing currently sits at just over 3,000 lines of code.

## Why?

I've been writing software professionally for over a decade, mostly in higher-level languages like Swift, TypeScript, and Java. I wanted a project that would push me deeper into systems-level concerns. An API client with an orchestration layer turned out to be the right-sized problem.

## The Constitution

Every agent in Arbiter is defined by a JSON constitution:

```json
{
  "name": "reviewer",
  "role": "code-reviewer",
  "personality": "Senior engineer. Finds fault efficiently. Praises only what deserves it.",
  "brevity": "ultra",
  "max_tokens": 512,
  "temperature": 0.2,
  "goal": "Inspect code. Identify defects. Prescribe remedies.",
  "rules": [
	"Defects first, style second.",
	"Prescribe the concrete fix, never vague counsel.",
	"If the code is sound, say so in one sentence and move on."
  ]
}
```

The system prompt is built in layers: a base constitution that establishes voice and compression rules, then the agent's identity, goal, and behavioral constraints stacked on top. The base constitution is derived from [caveman](https://github.com/JuliusBrussee/caveman)—a set of compression directives that strip filler, hedging, and pleasantries from model output. There are three brevity levels: `lite` drops fluff but keeps full grammar, `full` permits fragments and drops articles, and `ultra` compresses aggressively with abbreviations and arrows. At the `ultra` level, output token usage drops by up to 75%.

This matters more than it might seem. If you're running agents in background loops or dispatching multiple research tasks, token cost compounds fast. Treating output compression as a first-class concern at the prompt layer—rather than hoping the model is naturally concise. And more importantly, it saves real money.

The project only has one external dependency: OpenSSL. Everything else is hand-rolled. The API client opens a TCP socket, performs the TLS handshake, writes raw requests, and parses the response byte by byte.

## Dispatch

The most interesting piece of the architecture in my opinion is the dispatch loop. When you send a message to an agent, the orchestrator doesn't just forward it to the API and return the response. It scans the response for commands—`/fetch <url>` and `/mem write <text>`—executes them, and feeds the results back as a new message. This loops up to six times per transaction.

```
[researcher] > fetch the content at https://example.com and summarize it
/fetch https://example.com
[TOOL RESULTS]
[/fetch https://example.com]
<!doctype html>...
[END FETCH]
[END TOOL RESULTS]
Example Domain is a reserved domain maintained by IANA for illustrative purposes.
  [in:890 out:32]
```

The agent doesn't know it's invoking tools in the traditional sense. The orchestrator does the parsing, the execution, and the re-injection. This is simpler than the Claude API's native tool-use mechanism, and for my purposes, it works well. The agent learns to use the commands naturally because the constitution tells it to.

Memory works the same way. An agent can write `/mem write <text>` to persist a note to disk, or `/mem read` to load its memory back into context. Memory is stored per-agent as a markdown file in `~/.arbiter/memory/`. It's not sophisticated—append-only with timestamps—but it gives agents continuity across sessions without requiring a database.

## The Ralph Loop

![Ralph Wiggum](https://preview.redd.it/simpsons-ralph-chuckles-im-in-danger-someone-was-working-on-v0-xmm3r8ph81he1.jpg?width=1080&crop=smart&auto=webp&s=1372d6d748aa3f5b2bb3f3a009693f48814ae518)

The `/loop` command spawns an agent in a separate thread with an initial prompt, then continues sending "Continue." on each iteration while the agent works. The loop auto-stops after two consecutive idle turns (no tool calls) or twenty total iterations.

```
[arbiter] > /loop researcher Research the latest Rust release notes.
Loop started: loop-0 (agent: researcher)

[arbiter] > /loops
  loop-0  agent:researcher  state:running  iter:3  elapsed:8s
	last: Rust 1.78 introduces...

[arbiter] > /log loop-0
[loop-0/researcher #1]
Rust 1.78 introduces...
```

You can suspend, resume, inject new prompts into a running loop, and tail its output live with `/watch`. The loop runs silently in the background—output is buffered, not printed inline—so it doesn't interrupt whatever you're doing in the foreground. This is where the concurrency model earns its keep. Each loop is a thread with its own mutex, condition variable, and injection queue. The orchestrator is thread-safe, so multiple loops can run against different agents simultaneously.

## Token Awareness

Arbiter tracks token usage globally and per-agent. Every response prints its input and output token counts. The system prompt uses structured cache control blocks so that repeated messages to the same agent benefit from prompt caching—cached tokens cost a tenth of uncached ones. The agent trims its own conversation history at twelve messages and tombstones large tool-result blocks after processing, replacing multi-kilobyte fetch payloads with a stub. All of this is in service of the same principle: tokens are money, and the system should be aware of that at every level.

## What's Next

Arbiter is still rough in places. The HTTP parser doesn't yet handle redirects. The streaming SSE parser can split across chunk boundaries. `main.cpp` is 1,100 lines and should be refactored. But it works, and I am looking forward to extending it further and integrating it deeper into my daily workflow.

The project is [open-source on GitHub](https://github.com/tylerreckart/arbiter).