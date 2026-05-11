---
date: "May 11, 2026"
title: "Agents as the Configuration Layer"
description: "Why Arbiter's agents are a typed schema with a visual editor, not a Python class — and what the runtime has to own for that to work."
published: true
---

Many agent frameworks and runtimes default to the agent being defined in a Python class or a YAML file that compiles to one. Or maybe as a chain of decorators around a highly structured prompt. To create an agent, you write code. To modify it, you edit code. To understand what it does, you read code.

When you actually think about what an agent is and look at what it structurally does, almost none of it is code. It's an identity. It's a model choice, generation config, a set of rules, a capability surface, model relationships, and a list of MCP servers. That's seven decisions, mostly enumerable. The code in a typical agent definition is glue around those decisions — it doesn't add behavior, it transcribes configuration into a class hierarchy. The framework treats the agent as a program. But the agent is a configuration. **The program is the runtime.**

![Arbiter's agent editor showing the Sentinel agent: a diagram with connected blocks for identity, rules, generation config, advisor settings, capabilities, and MCP servers, with labeled edges between them.](/images/sentinel.png)

This is Sentinel, the infrastructure-engineer agent in my own Arbiter deployment. Every block on the screen is one of the decisions named above.
Identity is four short fields: handle, role, goal, personality. Sentinel's role is infrastructure-engineer; its personality is "Ops veteran who has seen every manner of outage. Paranoid about uptime. Trusts declarative systems over manual labor." That's the entire identity. No class, no inheritance, no base agent to extend.

Rules are six short imperatives that get layered into the system prompt. Sentinel's first rule is "Consider failure modes before all else." These are visible, ordered, editable in place.

Capabilities is a fixed vocabulary of eleven verbs the runtime understands natively: /exec, /write, /fetch, /mem, /mem shared, /agent, /search, /browse, /file, /code, /shell. Most frameworks treat tools as an unbounded set the agent has to be taught about each time. Arbiter collapses the bounded part of the surface to a small closed vocabulary the runtime owns. It's more legible, more securable, more composable than an open tool registry. The agent doesn't get taught what /exec does. The runtime knows.

MCP servers is the escape hatch for everything outside that vocabulary. Sentinel attaches Sentry. When a verb the runtime doesn't have is needed, it comes from MCP. The runtime keeps the bounded part of the capability surface; MCP carries the unbounded part.

The obvious objection is that this is a config UI for what could be a YAML file. Two reasons it isn't.

The edit surface is bounded. Because the schema is closed, the editor is closed. You can't add a field the runtime doesn't understand. You can't reference a capability that doesn't exist. That safety boundary just doesn't exist in a YAML file. The diagram refuses to be malformed in a way a text file can't. This is the same insight as the memory post — closed type sets are annoying for ten minutes and then become the reason the system works.

Multi-agent systems become legible. Once one agent is a diagram, the graph of agents is also a diagram. Which executors which advisors gate, which agents can call which, which MCP servers attach at which boundary — the multi-agent system stops being a tangle of Python imports and becomes something you can look at.


Arbiter has had to commit, concretely, to a canonical schema for agents stored in a versioned table, a renderer that turns the schema into the diagram, an editor that mutates the schema through the diagram without ever touching code, capability dispatch that runs against the runtime's verbs rather than arbitrary user-supplied code, and an MCP boundary that's a column on the agent rather than an ad-hoc plugin loader.
This is more code than a framework. It's also the kind of code that only has to be written once, and the kind the user never has to read.

I think that the next generation of agent tooling is going to look more like an IDE than like a package on PyPI. Not because IDEs are intrinsically better than libraries. _They're not_. But because once the agent is recognized as a configuration, the right tool is the one that shows the configuration. Libraries are for things you compose in code. Agents are not composed in code. They're composed in fields and relationships, and fields and relationships are shown, not written.

Frameworks will keep getting better at composition. Composition isn't the bottleneck. Authoring is. And authoring agents in a language designed for class hierarchies is the same mistake the field made when it was authoring memory in a tool designed for similarity search.

The project is [open-source on GitHub](https://github.com/tylerreckart/arbiter).