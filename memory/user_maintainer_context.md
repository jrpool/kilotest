---
type: user
name: Kilotest maintainer profile
description: Maintainer is the sole contributor until now and assigns a high probability to maintainership passing to others within 3 years, so prioritizes legibility for future maintainers.
---

# Kilotest maintaitenance strategy

## Primary goal

Make the codebase forkable and maintainable by future discoverers who have no prior knowledge of the project. Legibility for a cold reader outweighs any speed or terseness optimization.

## Working style

- Major refactorings for architectural improvement are acceptable.
- Responsibility can be shared between the maintainer and AI agents, with ultimate maintainer responsibility.
- Delegation of discretion to AI agents is expected to increase gradually as its benefits are demonstrted.
- Correctness should be promoted by a combination of:
  - Type constraints
  - Comprehensive tests
  - Nonduplication of code
  - Separation of concerns
  - Focused purposes of functions and modules
  - Thorough documentation
