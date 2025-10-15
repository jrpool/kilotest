# Kilotest

An ensemble testing service with a focus on accessibility

## Features

This service uses an ensemble of 11 tools to test any publicly connectable HTML URL for accessibility.

It asks you for a URL and then runs all the tests of the tools (totaling about 1000 tests) on it. In a few minutes, it gets 11 reports, one per tool, and combines them into a standardized report telling you which issues were reported and which tools reported them.

To learn why Kilotest uses an ensemble of tools instead of only one tool, see:
- [How to run a thousand accessibility tests](https://medium.com/cvs-health-tech-blog/how-to-run-a-thousand-accessibility-tests-63692ad120c3)
- [Testaro: Efficient Ensemble Testing for Web Accessibility](https://arxiv.org/abs/2309.10167)
- [Accessibility Metatesting: Comparing Nine Testing Tools](https://arxiv.org/abs/2304.07591)

## Getting started

### Prerequisites

- Node.js latest LTS version
- `npm`
- Git

### Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the service: `npm start`

### Usage

To use the service, visit `localhost:3000`, enter the URL you want to test, and click the “Test” button.

### Contributing

Contributions are welcome! You can use GitHub issues to initiate discussions and propose changes. If you want to contribute code, please fork the repository and create a pull request.
