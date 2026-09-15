---
date: 2026-07-02
status: accepted
---

# Git workflow

## Context and problem

The project uses Git for version control and GitHub as the host of the origin repository. For simplicity, the process of revision and versioning should be consistent. What Git workflow should be chosen?

## Considered options

- Push to main: Merge feature branches into the main branch locally and then push the main branch to the origin.
- PR to main: Merge feature branches into the main branch at the origin by means of approval of pull requests, and never push from the local to the origin main branch.

In each case, the decision includes mandatory updates to the dependencies and mandatory internal testing before every push or merge to the origin main branch.

## Decision

PR to main, because:

- It is more secure. If pushes from the local to the origin main branch are permitted, a developer can bypass required prerequisites with the `--no-verify` flag.
- It is more team-friendly. Although initially there is only 1 developer, local main branches could diverge if other developers began to contribute, and pushes could conflict or lose changes.

### Confirmation

To confirm that the implementation is correct, try to push to the origin main branch and verify that the push attempt is rejected.
