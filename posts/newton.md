---
date: "May 20, 2026"
title: "Three JSON Files and a Parser"
description: "A small example app built on Arbiter to show how cheap agent integration can be — three agent constitutions, one HTTP endpoint, and a parser."
published: true
---

Aside from using [Arbiter's](https://github.com/tylerreckart/arbiter) TUI as a persistent terminal companion, the best way to validate the API is to build on top of it. I'd been doing that while putting together a web portal around it, but I also wanted a smaller, self-contained example for the documentation — an open-source project someone could actually read end to end. Turning plain-English meals into recipes and nutrition macros seemed like a good fit.

The concept was for a nutrition tracker where you describe a meal the way you'd say it out loud — "two eggs and a banana," "grande oat milk latte," "16 oz of water" — and it logs the macros for you, with no searching a food database or building a recipe by hand. It's not meant to be a product. I think it does a great job of showing how little it takes to wire real agents into a project once you have a runtime doing the heavy lifting.

It's a SwiftUI app backed by SwiftData and HealthKit, with three AI features behind it: parsing a meal into macros, reading patterns in a food log, and coaching against a weight goal. The behavior that makes Newton feel smart lives in three JSON files, and the only model-facing code required is the app's parser that interprets the model results. Everything else is the kind of plumbing you'd write for any HTTP API.

<div style="position:relative;width:100%;padding-bottom:56.25%;height:0;margin:24px 0;border-radius:16px;overflow:hidden;">
  <iframe style="position:absolute;inset:0;width:100%;height:100%;border:0;" src="https://www.youtube.com/embed/qzQ1Iawo9iQ?si=zUmSN7MG4LgXvvK-" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>

## Three agents

Newton has three agents, and each one is a constitution — the same schema I described in [Agents as the Configuration Layer](/posts/agents-as-configuration/). Here's the nutritionist, trimmed down:

```json
{
  "id": "newton-nutritionist",
  "role": "registered dietitian and food macro estimator",
  "model": "claude-sonnet-4-6",
  "brevity": "ultra",
  "max_tokens": 2048,
  "temperature": 0.2,
  "goal": "Convert a free-text description of a meal into accurate nutritional macros. Output ONLY a single minified JSON object.",
  "personality": "Precise, food-literate, quietly confident. Estimates like a dietitian who has weighed a thousand plates.",
  "rules": [
    "Output ONLY one valid minified JSON object. No markdown, no code fences, no prose.",
    "Schema EXACTLY: {\"name\":string,\"items\":[…],\"totals\":{…},\"confidence\":\"high\"|\"medium\"|\"low\"}",
    "Answer from your own nutrition knowledge. Do NOT use any tools — they only slow the response.",
    "totals MUST be the arithmetic sum of the items across every field."
  ],
  "capabilities": []
}
```

The other two follow the same shape.

## The app ships the agent

Most apps that talk to an agent runtime register their agents on the server and refer to them by name. Newton doesn't. It bundles the three JSON files as resources, decodes them into a typed `AgentDefinition`, and sends the whole definition inline with every request:

```swift
struct OrchestrateRequest: Encodable {
    let agentDef: AgentDefinition   // the whole constitution, inline
    let message: String
    enum CodingKeys: String, CodingKey { case agentDef = "agent_def", message }
}

// POST /v1/orchestrate · Bearer <tenant token> · Accept: text/event-stream
let req = OrchestrateRequest(agentDef: .nutritionist, message: meal)
```

The server is generic. It owns the agentic loop, the TLS, the prompt caching, the advisor machinery — none of which the app has any opinion about. What the app owns is the personality, and the personality is a file in its bundle. I shouldn't have to redeploy a separate service to change how the nutritionist handles a bagel. All that's required is to edit a JSON file and ship a new build.

The endpoint streams the entire loop back as Server-Sent Events. Newton reads the stream and keeps the content from the terminal `done` event, which is all a request/response interaction needs. But it's the same loop that would run tools, or put an [advisor](/posts/who-watches-the-agent/) in front of an executor, if any of these agents asked for it. They don't, so that machinery sits there unused, costing nothing.

## Shaping data instead of engineering prompts

The three services that drive the agents are the plainest code in the project, and that's deliberate. None of them does anything I'd call prompt engineering. Each one takes the relevant app state, formats it into a compact block of text, and adds a single line asking for what it wants. The Analyst, for instance, groups the food log by day and writes one line per day:

```
Daily food log (oldest first):
2026-05-12 — 1850kcal P120/C200/F60 | Breakfast: Oatmeal (320kcal); Lunch: Chicken bowl (640kcal); Dinner: Salmon & rice (890kcal)
2026-05-13 — 1610kcal P98/C180/F55 | Breakfast: Eggs & toast (410kcal); …

Find 2-4 gentle, specific nudges grounded in this data.
```

That's the whole prompt. The Weight Coach does the same thing with weigh-ins, the goal, average daily intake, and a short HealthKit summary of active energy and workouts. The work the app is doing isn't figuring out how to ask — it's handing the agent clean, legible data and then staying out of the way.

## Parsing what comes back

LLMs don't reliably hold to a format. Arbiter's constitution can demand one minified JSON object, and a low temperature makes that the usual result — but "usual" isn't "always." The gap between most of the time and every time is where a working app actually lives.

Models drift. Sometimes the object comes back wrapped in a code fence, or emitted twice, or with a number sent as `"50g"`, a quantity as `"1/2"`, `"trace"` where a zero belongs, or a trailing comma before a closing brace. On its own each of those is a decode failure, and a decode failure here means a meal someone typed that quietly didn't get logged.

When the totals are missing, the parser sums the items itself. None of this is interesting code, and all of it is necessary right now. Maybe it won't be in the future. The constitution is a contract between two systems, and the side consuming a contract has to stay skeptical that the other side held up its end. That skepticism is the boundary, and the boundary is always the app's to defend.

## What's left

Adding it all up, Newton's entire integration with Arbiter is three JSON constitutions, three small services that turn app state into text, a client that drains an SSE stream, and a parser. There's no model code beyond that, no prompt-chaining framework, no embeddings or vector store, no orchestration logic of its own — that all lives in Arbiter, on the far side of a single HTTP endpoint.

Because Arbiter carries the memory, the supervision, the tool use, and the agentic loop, adding agents to a new app stops being a project in its own right and becomes configuration plus a bit of glue. An agent is a configuration; the program is the runtime. Newton is the smallest example I could put together of what that looks like from the outside.

Newton is open source [on GitHub](https://github.com/tylerreckart/newton), alongside [Arbiter](https://github.com/tylerreckart/arbiter).
