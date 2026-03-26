# Kilotest

An ensemble testing service with a focus on accessibility

## Features

This application uses an ensemble of 11 tools to test public web pages for standards conformity, usability, and accessibility.

The testing paradigm employed by Kilotest is discussed in these papers:

- [How to run a thousand accessibility tests](https://medium.com/cvs-health-tech-blog/how-to-run-a-thousand-accessibility-tests-63692ad120c3)
- [Testaro: Efficient Ensemble Testing for Web Accessibility](https://arxiv.org/abs/2309.10167)
- [Accessibility Metatesting: Comparing Nine Testing Tools](https://arxiv.org/abs/2304.07591)

Kilotest acts as a server with human users (such as you) and with one or more testing agents that obtain jobs from Kilotest and do the actual testing. Those agents are instances of the [Testaro](https://www.npmjs.com/package/testaro) package.

An active production instance of Kilotest may require multiple testing agents to handle the load, because testing one web page typically takes about 3 minutes and agents test only one page at a time.

## Getting started locally with 1 testing agent

### Installation

In the steps below, hosts `T` and `K` may be the same host or two different hosts. Host `T` can be a Debian stable, Ubuntu LTS, Windows, or macOS host. Host `K` can be any server host that can run the latest LTS version of Node.js. If hosts `T` and `K` differ, then they must be open to `https` traffic and host `K` must permit `https` requests from host `T`.

1. Clone the [Testaro project](https://github.com/jrpool/testaro) into a new directory on host `T`.
1. In that directory, install the Testaro dependencies: `npm install`.
1. Update the Testaro dependencies and rebuild: `npm run deps`.
1. Clone the Kilotest repository into a new directory on host `K`.
1. In that directory, install the Kilotest dependencies: `npm install`.
1. Copy the `env.testaro` file from the `kilotest` directory to `.env` in the `testaro` directory and replace the `__placeholder__` values in `.env` with actual values.
1. Copy the `env.example` file in the `kilotest` directory to a new `.env` file in the same directory and replace the `__placeholder__` values in `.env` with actual values.

### Usage

1. In the `testaro` directory, make Testaro start listening for jobs: `node call netWatch true nn true`, where `nn` is the number of seconds to wait between checks for new jobs.
1. In the `kilotest` directory, start the Kilotest service: `node index`.

### Contributing

Contributions are welcome! You can use GitHub issues to initiate discussions and propose changes. If you want to contribute code, please fork the repository and create a pull request.

## Making Kilotest a service

See the `SERVICE.md` file for instructions on how to make Kilotest a service.
