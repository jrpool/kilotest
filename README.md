# Kilotest

An ensemble testing service with a focus on accessibility

## Features

This service uses an ensemble of 11 tools to test any public web page for accessibility.

It asks the user for a URL and then runs all the tests of the tools, totaling about 1000 tests, on that page. In a few minutes, it gets 11 reports, one from each tool, and combines them into a single standardized report telling the user which issues were reported and which tools reported them.

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

To use the service, visit `localhost:3000`, enter the URL you want to test, and click the “Test” button.

### Deployment

This service is deployable as a non-containerized application on a Debian stable, Ubuntu LTS, Windows, or macOS server.

### Contributing

Contributions are welcome! You can use GitHub issues to initiate discussions and propose changes. If you want to contribute code, please fork the repository and create a pull request.

## Future work

### Parallelization

Advice from gpt-5 mini:

This application currently calls, on line 149 of `index.js`, the `doJob`  method of `testaro/run`. That method calls numerous (typically 11) asynchronous functions, sequentially. It typically takes about 2 minutes for the `doJob` method to complete. I want to consider an alternative architecture in which `doJob` is called multiple times in parallel, once for each of the functions, and `requestHandler` continues execution after all ef tne promises returned by those calls are resolved. The idea is that the parallel execution would be faster than sequential execution. This would require `requestHandler` to construct from the multiple resolved values the same object (named `report`) that would have been returned by the original single call. I wonder whether execution would really occur in parallel or whether anything about the execution environment would limit or prevent such parallel execution and thus limit or nullify the benefit of such an architectural change.

Exploring CPU-intensive JavaScript options

For CPU-intensive JavaScript tasks like digesting and scoring, everything still runs single-threaded unless we use worker_threads or spawn processes. I recommend profiling to see how it performs and maybe prototyping parallel calls for independent functions while ensuring the report's construction is deterministic. We should use Promise.all for these parallel calls and avoid mutating shared structures. I'll also want to check if testaro functions can be safely parallelized. Network constraints and rate limiting are important considerations too.

Creating parallel task example

I need to provide an example code snippet that demonstrates running tasks in parallel using Promise.all and how to combine the results into a report. I should remember to format the modified index.js code block correctly using four backticks and add the filepath comment. The example should replace the doJob call with per-tool promises. While I'm not sure of the internal API for testaro, it seems doJob calls functions for each tool.

I could suggest running doJobForTool(tool) or creating individual jobs for each tool and merging reports afterward with the testilo/merge function.

Structuring parallel job scripts

To parallelize tasks per tool, I should create individual job scripts and call doJob for each one. Once I have the per-tool reports, I can combine the results using merge. However, I need to be careful not to reference unknown APIs, so I should focus on giving high-level guidance instead.

I'll provide example pseudocode that shows how to use Promise.all to generate reports and merge or process them afterward. Also, I need to remember to follow the developer instructions for formatting my code blocks correctly.

Illustrating the patch snippet

I need to create a small code snippet demonstrating how to map over tools to generate per-tool job scripts and call doJob for each one using Promise.all. Once I have the results, I’ll combine them into a report object, which might involve merging arrays or using the merge function.

I should be cautious, though—while testilo/merge was used to create jobs, it seems not suitable for merging reports. Since testaro returns a report object that aggregates results, I think concatenating the results from each report would make sense. I want to provide a pattern for using Promise.all and make sure to discuss any constraints around the environment to ensure isolation.

Explaining Node's concurrency model

Node.js allows for IO concurrency but not for CPU-bound tasks unless using child processes or worker_threads. The libuv threadpool has a size limitation of 4 by default for operations like file system access and DNS. I can increase this limit with UV_THREADPOOL_SIZE, but resource contention can occur if too many processes run.

Since Testaro may spawn heavy headless browsers, I recommend limiting concurrency using p-limit or queues, based on CPU cores and memory. For an example, I will provide a code skeleton showing how to map tools to jobs using Promise.all with concurrency limits, along with a code block to modify the relevant lines in index.js.

GitHub Copilot

Short answer

Parallelism helps only if most of doJob’s time is spent waiting on I/O, child processes, network calls, or other non‑JS blocking work. Node’s JS runs single‑threaded, so CPU‑bound work inside doJob will not execute in parallel unless you use worker_threads or separate processes. Also practical limits (browser instances, memory, libuv threadpool, external rate limits) can reduce/negate speedups.
Key points to decide

Is doJob mostly I/O/child-process work (e.g., hitting the network, spawning browsers/tools)? — Parallelize: likely large win.
Is doJob doing heavy JS computation (scoring/digesting) in the main thread? — Parallelizing at the call-site won’t speed up the JS parts; use worker_threads or spawn processes.
Does doJob have internal dependencies or shared mutable state? — If yes, you cannot safely run the internal steps in parallel unless you isolate them or replicate the behavior and then merge results.
Resource constraints: running many heavy tool runs concurrently can exhaust CPU, memory, file descriptors, or external service limits. Use a concurrency cap.
How Node concurrency works here (practical implications)

Async I/O and child processes overlap — Promise.all will run them in parallel (concurrent) from the event-loop perspective.
CPU-bound JS blocks the event loop; concurrent Promise-based calls won’t execute JS in parallel.
Some blocking ops use the libuv threadpool (fs, crypto by default) — threadpool default = 4; you can increase via UV_THREADPOOL_SIZE env var.
Spawned processes / Puppeteer instances run in the OS and do run in parallel, constrained by CPU/RAM.
Recommended approach

Profile / measure a typical doJob run and per-tool durations to confirm where the time goes.
If independent tool runs are possible, run per-tool jobs concurrently with a concurrency limit (e.g., 2..4 depending on machine).
Merge per-tool results into a single report using the same combining rules doJob would have used (you must implement or reuse that merge logic).
If heavy CPU work remains after aggregation, offload it to worker_threads or separate processes.
Example pattern (bounded parallelism using p-limit)

Install p-limit: npm install p-limit
Replace the single await doJob(job) with a mapped set of per-tool jobs run with a concurrency cap and then merge results.
Example skeleton patch (illustrative — you must adapt mergeReports() to the real report shape):

// ...existing code...
const pLimit = require('p-limit');
// ...existing code...
      // Perform the job and get the report from Testaro.
-        const report = await doJob(job);
+        // Parallelize per-tool runs with limited concurrency.
+        const specs = jobScript.specs || [];
+        const limit = pLimit(parseInt(process.env.JOB_CONCURRENCY || '3', 10));
+        const perToolPromises = specs.map(tool => limit(async () => {
+          // Build a job that runs only this tool.
+          const singleScript = script('jobScript', 'job script', 'default', {
+            type: 'tools',
+            specs: [tool]
+          });
+          const singleJob = merge(singleScript, jobBatch, '')[0];
+          return doJob(singleJob);
+        }));
+        const perToolResults = await Promise.all(perToolPromises);
+        // TODO: implement accurate merging of perToolResults to match doJob(job) output
+        const report = mergeReports(perToolResults);
+        // Example placeholder mergeReports: you must replace with correct logic.
+        function mergeReports(resultsArray) {
+          // naive concat of top-level arrays (adjust to actual report shape)
+          const merged = {};
+          for (const r of resultsArray) {
+            for (const k of Object.keys(r || {})) {
+              if (!merged[k]) merged[k] = [];
+              if (Array.isArray(r[k])) merged[k] = merged[k].concat(r[k]);
+              else merged[k] = r[k]; // heuristics — replace as needed
+            }
+          }
+          return merged;
+        }
 // ...existing code...

Tests and tuning

Start with concurrency = 1, 2, 3 and measure end‑to‑end time and system load; choose the sweet spot.
Watch memory and CPU; spawn fewer parallel heavy tasks on small machines.
If per-tool runs use Puppeteer/headless Chromium, you’ll likely want a small concurrency (1–3) because each instance is memory/CPU heavy.
If you want, I can:

Add a bounded-parallel implementation into your index.js using p-limit and a placeholder mergeReports, and
Add simple timing logs so you can profile per-tool durations and choose a concurrency level. Which would you prefer?
GPT-5 mini • 1x

### Temp

Recommended approach

Profile / measure a typical doJob run and per-tool durations to confirm where the time goes.
