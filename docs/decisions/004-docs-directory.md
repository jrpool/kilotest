---
date: 2026-06-30
status: accepted
---

# `docs` directory

## Context and problem

The project began with several files of planning documentation at the root and is now acquiring ADRs as well. Where should all those documents be located?

## Considered options

- Minimal change: Create a `docs/decisions` directory for ADRs but leave the planning documents at the root.
- Maximal coherence: Create a `docs` directory for all of those documents, with ADRs in a `decisions` subdirectory.

## Decision

Maximal coherence, because it substantially simplifies navigation for people perusing the filesystem, and its cost is only revising a few links in documentation and README.

### Confirmation

To confirm the correctness of the implementation, find all internal links in the codebase and verify that each link to a file that is now in the `docs` directory has the current file location as its destination.
