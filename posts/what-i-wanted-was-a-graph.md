---
date: "May 3, 2026"
title: "What I Wanted Was a Graph"
description: "Why Arbiter's agent memory is a typed graph in SQLite, not a vector store — and how it hit 74.4% R@1 on LongMemEval with no embeddings."
published: true
---

In the few years I've been working with AI systems, the consistent frustration has been memory. Agents can find chunks that are *related* to a query but rarely the chunks that *answer* it. Each turn looks competent in isolation, but the system as a whole has no memory in the only sense that matters: the ability to act consistently with what it already knows.

What I've come to understand in building [Arbiter](https://github.com/tylerreckart/arbiter) is that *similarity* and *recall* are fundamentally different operations. When an agent asks "what from our last research session on archaic human gene flow contradicts my current findings," it's not looking for things semantically near the word "archaic." It's looking for the specific findings, in the specific conversation, recorded at a specific time. For all their benefits, embeddings just get you to the neighborhood. The neighborhood is not the address.

I wanted to walk from a project node to the references that informed it, and from those references to the conclusions derived from them. I wanted to know which facts were still true, which had been retired, and what the agent believed at any specific point in time. I wanted to ask "what's already covered in this area" and get an answer that depended on graph density, not vector neighborhood density.

What I wanted, it turned out, was a graph.

## What's actually in it

Arbiter's memory layer is two SQLite tables. Entries are typed nodes. Relations are directed labeled edges between them. Both schemas are deliberately closed.

Nodes have one of six types: `project`, `reference`, `learning`, `feedback`, `context`, `user`. The agent doesn't get to invent new types. When it writes a new entry, it has to commit to what kind of thing it is. This is annoying for about ten minutes and then becomes the reason the system works—the type forces the agent to think about what role this entry plays in the broader graph, not just what it says.

Edges have one of five relations: `relates_to`, `refines`, `contradicts`, `supersedes`, `supports`. When the agent learns that an earlier conclusion was wrong, it doesn't rewrite the entry. It adds a `supersedes` edge from the new entry to the old one. The old entry stays in the graph, with its history intact, but future queries can filter superseded content out—or surface both with the relationship between them.

Memory entries also carry two timestamp columns: `valid_from` and `valid_to`. The first is set at insert. The second starts null and gets stamped when the entry is invalidated—soft-deleted by an explicit command, not removed from the table.

The world changes. A "user prefers dark mode" entry stops being true the day they switch themes. A "Q3 rollout plan" entry stops being load-bearing the day Q3 ends. The temptation is to delete these. The problem with deleting them is that "what did the agent believe last week" is a real audit question, and deletion makes it unanswerable. The problem with editing them in place is that the entry's text might still describe a real-but-historical decision someone needs to read.

Soft-delete via a validity window solves both. Default reads filter to active rows, so the agent's path of least resistance respects the temporal boundary. Historical reads pass `as_of=<epoch>` and get the active set as it stood at that moment. Concurrent reads don't race the deletion because nothing is being deleted. Idempotent invalidation means the agent can retry without checking state first.

```sql
-- "what did the agent believe at the start of last quarter?"
SELECT * FROM memory_entries
WHERE tenant_id = ?
  AND valid_from <= ?  -- as_of timestamp
  AND (valid_to IS NULL OR valid_to > ?);
```

The window is half-open: at the exact invalidation moment the row drops from the active view; one second earlier, it's there. The kind of detail that doesn't matter until it does.

## The numbers

I ran [LongMemEval](https://github.com/xiaowu0162/LongMemEval) against Arbiter—500 questions over roughly 247K conversational turns. R@K is the fraction of questions where at least one ground-truth turn appears in the top K results.

| Variant            | R@1   | R@5   | R@10  | p50      |
|--------------------|------:|------:|------:|---------:|
| `bm25`             | 14.2% | 35.2% | 42.0% |   149 ms |
| `graduated`        | 49.4% | 81.4% | 88.6% |    57 ms |
| `rerank` (haiku)   | 72.6% | 90.4% | 91.6% |  1637 ms |
| `rerank` (cascade) | 74.4% | 90.4% | 92.0% |  3235 ms |

`bm25` is the FTS5 layer alone. `graduated` adds the conversation-scoped first pass with tenant-wide fallback—same retrieval primitive, layered scoping. `rerank (haiku)` adds an LLM reorder of the top 25 candidates. `rerank (cascade)` does a Haiku cull followed by a Sonnet refine over the survivors.

For comparison: independent benchmarks put [Zep at 63.8% and Mem0 at 49.0% on LongMemEval](https://atlan.com/know/zep-vs-mem0/) overall accuracy. [Supermemory reports 85.4%.](https://blog.supermemory.ai/best-memory-apis-stateful-ai-agents/) Those are different metrics from R@K—accuracy includes the answer-generation step on top of retrieval—so the comparison is apples-to-oranges in the strict sense, but the order of magnitude says something.

## Circling back to embeddings

Arbiter has no embedding pipeline. No vector index. No chunking strategy. No similarity threshold to tune. No reranking model loaded into memory. No background job to re-embed when the model changes. No re-indexing when the schema migrates. The deployment is a single 1.7MB binary and a SQLite file.

Skipping embeddings seems like a constraint. It turns out to be the thing that made the system small enough to reason about and fast enough to use. [MemPalace](https://github.com/mempalace/mempalace), for comparison, requires at least 300MB on disk for its embedding model alone—Arbiter's binary is 176 times smaller. The graph structure does the work that embeddings were supposed to do, and it does it with less infrastructure and more legibility. When the agent retrieves the wrong thing, the retrieval path is six lines of SQL—I can read it, understand why, and fix the query. When an embedding system retrieves the wrong thing, the answer is "the cosine distance was higher to a different chunk," which is true and not actionable.

I'm not claiming that vector search is wrong. I'm claiming that when the questions are about specific things in specific conversations at specific times, the graph fits better. The embedding-first systems get high marks on benchmarks designed around fuzzy semantic recall. They struggle on benchmarks that test for temporal reasoning, fact supersession, and cross-session continuity, which are the things agents actually need.

R@K results are the confirmation, not the argument. My argument is that an agent's memory should be shaped like the questions it's going to ask, and the questions agents ask are mostly about identity, time, and structure. Those have always been graph problems.

The project is [open-source on GitHub](https://github.com/tylerreckart/arbiter). The bench harness is at `bench/longmemeval/`—run it yourself.