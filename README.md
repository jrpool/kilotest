# Kilotest

An ensemble testing service with a focus on accessibility

## Features

This application uses an ensemble of 11 tools to test public web pages for accessibility and conformity to HTML standards.

In Dev mode, it asks the user for a URL and then runs all the tests of the tools, totaling about 1000 tests, on that page. In typically about 2 minutes, it gets 11 reports, one from each tool, and combines them into a single standardized report telling the user which issues were reported and which tools reported them.

In Screen mode, it asks the user for 2 to 5 URLs and then runs the tests of a subset of the tools, totaling about 340 tests, on those pages. In typically about half a minute per page, it gets one report per tool per page, derives a preliminary estimate of the relative over-all qualities of the pages, and reports those relative estimates.

To learn why Kilotest uses an ensemble of tools, instead of only one tool, see:
- [How to run a thousand accessibility tests](https://medium.com/cvs-health-tech-blog/how-to-run-a-thousand-accessibility-tests-63692ad120c3)
- [Testaro: Efficient Ensemble Testing for Web Accessibility](https://arxiv.org/abs/2309.10167)
- [Accessibility Metatesting: Comparing Nine Testing Tools](https://arxiv.org/abs/2304.07591)

Bottom line: Using an ensemble of tools for testing web accessibility usually discovers many more issues than using only one tool.

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

To use the service, visit `localhost:3000`, enter a description and the URL of a page that you want to test, and click the “Test” button.

### Deployment

This service is deployable as a non-containerized application on a Debian stable, Ubuntu LTS, Windows, or macOS server.

### Contributing

Contributions are welcome! You can use GitHub issues to initiate discussions and propose changes. If you want to contribute code, please fork the repository and create a pull request.
