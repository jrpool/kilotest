---
date: 2026-07-02
status: accepted
---

# Internal testing

## Context and problem

Internal testing creates a tradeoff between speed of development and risk of debugging effort. Under what conditions should internal testing be required?

## Considered options

Make testing a prerequisite for any:

- push to an origin feature branch
- merge to the origin main branch

Any required testing must take place automatically upon a request to perform the merging or pushing action. The choice of test-triggering mechanisms is a tactical decision.

## Decision

Require testing only before merges to the origin main branch, because:

- Merges to the origin main branch are infrequent, so mandatory testing before them is not burdensome.
- The risk of failure is excessive if the deployed server is permitted to relaunch with code of an untested main branch.
- Mandatory testing before pushes to the origin of a feature branch would deter routine pushes that protect the local code from accidental deletion.
- The absence of a local-branch testing requirement still allows developers to perform voluntary testing of any local branches at any time.

Although this decision governs only mandatory testing, developers are advised to precede any merge to an origin feature branch with voluntary testing unless they have not yet corrected known bugs in it.

### Confirmation

To confirm that the implementation is correct, try to merge a defective origin feature branch to the origin main branch. Verify that testing is automatically performed and the merge is prevented by a test failure.
