# Service

This document describes one deployment of Kilotest as a web service.

## Host

The host of the service is a [Vultr](https://www.vultr.com) Cloud Compute High Frequency virtual machine named `jpdev` with the IPV4 address 149.28.208.106. The host has 1 vCPU, 2GB of RAM, and 64GB NVMe of storage.

The server operating system is Ubuntu LTS 22.04.

The server has a `sudo`-capable non-root user named `linuxuser`, which is the owner of the project directory and files.

Connection to the host is made with `ssh linuxuser@kilotest.com`. Periodically the server requires password authentication in addition to public key authentication. The password is available in the server details on the Vultr web console, after the administrator logs in via GitHub.

## Applications

Kilotest is installed at `/opt/jpdev/kilotest` on the server.

Any other application `xyz` can be installed at `/opt/jpdev/xyz` on the server. (Previously, the QAI tutorial application was deployed as a separate service at `/opt/jpdev/qai`; it has been integrated into Kilotest itself and no longer runs as a separate process, though the documentation structure remains generic to accommodate future independent applications should they be needed.)

## Process management

### Process manager

Kilotest is managed with [PM2](https://pm2.keymetrics.io) on the server (not on the local development host). The PM2 configuration is specified in the repository as `pm2.config.cjs` (CommonJS is required because PM2 loads configuration files with `require()`, which cannot load ES modules):

```javascript
module.exports = {
  apps: [
    {
      name: 'kilotest',
      // index.ts cannot be the PM2 script: its autostart guard (import.meta.main) is
      // false inside PM2's process container, so the server would never start.
      script: 'serve.ts',
      // PM2 maps the .ts extension to the bun interpreter, so node must be specified explicitly.
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      time: true,
      env: {
        NODE_ENV: 'production',
        BASE_PATH: '/',
        DEMO_SSE_DELAY_MS: '100'
      }
    }
  ]
};
```

When the PM2 configuration or environment is changed, restart PM2 with:

```text
pm2 restart kilotest --time --update-env
pm2 save
```

If the `script` entry point itself has changed, `pm2 restart` reuses the stored path and cannot pick up the new one; delete and recreate the process instead:

```text
pm2 delete kilotest
pm2 start pm2.config.cjs
pm2 save
```

The management of the PM2 logs is [documented by PM2](https://pm2.keymetrics.io/docs/usage/log-management/).

### Process tuning

The server configuration has been tuned for improved performance. The file edited for this purpose is `/etc/default/zramswap`:

```properties
# Compression algorithm selection
# speed: lz4 > zstd > lzo
# compression: zstd > lzo > lz4
# This is not inclusive of all that is available in latest kernels
# See /sys/block/zram0/comp_algorithm (when zram module is loaded) to see
# what is currently set and available for your kernel[1]
# [1]  https://github.com/torvalds/linux/blob/master/Documentation/blockdev/zram.txt#L86
ALGO=zstd

# Specifies the amount of RAM that should be used for zram
# based on a percentage the total amount of available memory
# This takes precedence and overrides SIZE below
PERCENT=75

# Specifies a static amount of RAM that should be used for
# the ZRAM devices, this is in MiB
#SIZE=256

# Specifies the priority for the swap devices. See swapon(2)
# for more details. Higher number = higher priority
# This should probably be higher than hdd/ssd swaps.
#PRIORITY=100
```

This enables `zram` and decreases the amount of disk swapping.

## Keepalive

The SSH configuration on the local client is customized so that connections will be kept alive longer than the default. This customization is performed in the `~/.ssh/config` file:

```ssh-config
Host kilotest.com 149.28.208.106
  HostName 149.28.208.106
  User linuxuser
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 60
  ServerAliveCountMax 3
  TCPKeepAlive yes
```

The corresponding server file `/etc/ssh/sshd_config` needs no customization.

## Internet domain

The domain name `kilotest.com` is registered with [Porkbun](https://porkbun.com) for use by this application.

## DNS Configuration

### kilotest.com

The DNS records for `kilotest.com` are configured as follows. In each case, `TTL` is set to 3600 (1 hour). (The Porkbun interface uses `kilotest.com` as a name where some others use `@`.)

1. **A**
   - **Host**: kilotest.com
   - **Answer**: 149.28.208.106

2. **AAAA** (if IPv6 is used)
   - **Host**: @
   - **Answer**: IPv6 address

3. **CNAME**
   - **Host**: www
   - **Answer**: kilotest.com

4. **MX** (for email forwarding)
   - **Host**: kilotest.com
   - **Answer**: fwd1.porkbun.com or fwd2.porkbun.com
   - **Priority**: 10 or 20, respectively

5. **TXT** (domain validation)
   - **Host**: _acme-challenge.kilotest.com
   - **Answers**: validation tokens provided by Porkbun ACME client

6. **TXT** (SPF for Porkbun-handled mail)
   - **Host**: kilotest.com
   - **Answer**: `v=spf1 include:_spf.porkbun.com ~all`

7. **MX and TXT** (Resend MAIL FROM domain; provides SPF alignment for Resend mail)
   - **Host**: send.kilotest.com
   - **Answers**: MX `feedback-smtp.us-east-1.amazonses.com` (priority 10); TXT `v=spf1 include:amazonses.com ~all`

8. **TXT** (Resend DKIM public key)
   - **Host**: resend._domainkey.kilotest.com
   - **Answer**: an RSA public key in `p=...` form, issued by Resend

9. **TXT** (DMARC policy)
   - **Host**: _dmarc.kilotest.com
   - **Answer**: `v=DMARC1; p=none;`

10. **TXT** (site verification)
    - **Host**: kilotest.com
    - **Answers**: `google-site-verification=...` and `smithery-verification=...` tokens issued by Google and Smithery

The DNS configuration as CSV:

```csv
DOMAIN,HOST,TYPE,ANSWER,TTL,PRIO
kilotest.com,kilotest.com,A,149.28.208.106,3600,0
kilotest.com,www.kilotest.com,CNAME,kilotest.com,3600,0
kilotest.com,kilotest.com,MX,fwd1.porkbun.com,3600,10
kilotest.com,kilotest.com,MX,fwd2.porkbun.com,3600,20
kilotest.com,send.kilotest.com,MX,feedback-smtp.us-east-1.amazonses.com,3600,10
kilotest.com,kilotest.com,TXT,"v=spf1 include:_spf.porkbun.com ~all",3600,0
kilotest.com,send.kilotest.com,TXT,"v=spf1 include:amazonses.com ~all",3600,0
kilotest.com,resend._domainkey.kilotest.com,TXT,"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDWjPkYLQ+xYcmMRODdXoXl7QTXK5TkhNQXjl5HcPvk1D5A5eqtjuw17lgZOQy1wiUq8BGId+Iq3BWO32kYTJo+lWMQJ8/Me4M0xQ0qaYPmtTJ9cQ8oyrFUuheu7T0MqTYEwYRbHwE74WkQSQTHnCx0Uy98pcXqOaucA3n1v3YkjQIDAQAB",3600,0
kilotest.com,_dmarc.kilotest.com,TXT,"v=DMARC1; p=none;",3600,0
kilotest.com,kilotest.com,TXT,google-site-verification=EnNe2chUyUaV645ENd3c6pHs1PZ_Zb3u5516HSirvrA,3600,0
kilotest.com,kilotest.com,TXT,smithery-verification=6a3a2327c26bc478be748041f340e14fa50c4386eea3b2692eeffda703b8b3f9,3600,0
kilotest.com,_acme-challenge.kilotest.com,TXT,GIzAHOFW416fHp7cuTkg4gvJDsyuPZvsPlSsnyViFLQ,3600,0
kilotest.com,_acme-challenge.kilotest.com,TXT,qQdIIiUSC76PvYuku-AxPsRPY-fJV7T7i3b8fimlFjU,3600,0
```

### Kilotest service

Reliance on the default Vultr DNS resolvers has caused erratic failures. Therefore, the service has been configured to use specific DNS resolvers.

These commands disabled `cloud-init` network management:

```bash
sudo mkdir -p /etc/cloud/cloud.cfg.d
printf "network: {config: disabled}\n" | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
```

The following `/etc/netplan/01-dns.yaml` file with `root` as owner and group was created and given permissions 600. It custom-configures network management and specifies the DNS resolvers of APNIC Research and Development and Google LLC.

```yaml
network:
  version: 2
  ethernets:
    enp1s0:
      dhcp4: true
      dhcp6: true
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
          - 2606:4700:4700::1111
          - 2001:4860:4860::8888
```

These commands applied and verified the configuration:

```bash
sudo netplan generate
sudo netplan apply
resolvectl status
dig +short A example.com
curl -sv https://example.com/ -o /dev/null
```

## Request management

Requests to `https://kilotest.com` are received on port 443 and processed by [Caddy](https://caddyserver.com/), which forwards them via HTTP to the application at `localhost:3000`. Caddy manages, provisions, and renews a TLS certificate via Let’s Encrypt. Any request to `http://kilotest.com` is received on port 80, and Caddy redirects it to an `https` request. Caddy forwards `https` requests to the [local server](http://localhost:3000), where it is processed by the Kilotest service.

The Caddy configuration is maintained and tracked in `/etc/caddy/Caddyfile`. Leading 2 spaces below represent 1 Tab character. Requests are forwarded to Kilotest on port 3000, which handles all paths including tutorial content and backward-compatibility redirects.

```caddyfile
# Configuration of the Caddy web server.
# Docs: https://caddyserver.com/docs/caddyfile.

kilotest.com {
  # Enable Zstandard and Gzip compression of responses.
  encode zstd gzip
  # Specify the only paths of forwardable requests. UptimeRobet uses HEAD.
  @allowedGET {
    method GET HEAD
    path /mcp / /index.html /robots.txt /openapi.yaml /openapi.json /swagger.yaml /swagger.json /api-docs /llms.txt /llms-full.txt /capability.md *.html* /fullReport.json/* /api/* /tutorialWeb/images/* /tutorialAI/images/* /qai /qai/comments /favicon.* /style.css /sitemap.xml
  }
  @allowedPOST {
    method POST
    path /mcp /requestRetest.html/* /requestTest.html /requestAction.html /reannotate.html /renewWCAG.html /ai0BalanceForm.html /expungeReportsForm.html /hideReportForm.html /metrics.html /pruneReportsForm.html /rewindReportsForm.html /showHiddenReportsForm.html /unhideReportForm.html /api/* /tutorialWebComment.html /tutorialAIComment.html /worker/job /worker/report
  }
  # Respond to OPTIONS requests.
  @allowedOPTIONS method OPTIONS
  handle @allowedOPTIONS {
    header {
      Access-Control-Allow-Origin *
      Access-Control-Allow-Methods GET,HEAD,POST,OPTIONS
      Access-Control-Allow-Headers Content-Type,Authorization
    }
    respond 204
  }
  # Forward any other GET, POST, or OPTIONS request, if allowed, to port 3000.
  handle @allowedGET {
    reverse_proxy localhost:3000 {
      # Improve SSE latency.
      flush_interval -1
    }
  }
  handle @allowedPOST {
    reverse_proxy localhost:3000 {
      # Improve SSE latency.
      flush_interval -1
    }
  }
  # Return not-found for any other request.
  handle {
    respond 404
  }
}
```

This configuration can be futher tightened if experience warrants.

The `flush_interval` setting prevents granular reporting by Testaro workers from being buffered, so the updates reach the browser without delay.

## Version management

When a new version of the `kilotest` package has been published, the service can be updated as follows:

1. Connect to the server: `ssh linuxuser@kilotest.com`
1. Navigate to the package root: `cd /opt/jpdev/kilotest`
1. Discard any locally altered lockfile: `git stash`
1. Delete the record of that discard: `git stash drop`
1. Fetch and merge the new version: `git pull`
1. Update the dependencies: `npm update`
1. Update the Playwright browsers: `npx playwright install`
1. Restart the service: `pm2 restart kilotest`

## Branch protection

The `main` branch on GitHub is protected to prevent direct pushes and to require a passing smoke test before any pull request can merge. The settings are configured in the GitHub repository as a ruleset under Settings > Branches > Branch protection rules.

The required settings are:

1. Require a pull request before merging.
1. Require status checks to pass before merging.
1. Add "Smoke Test" as a required status check.
1. Require branches to be up to date before merging.
1. Do not allow bypassing the above settings.

A copy of the ruleset is located at `docs/Smoke Test.json`.

The smoke-test check is defined in `.github/workflows/smoke-test.yml` and runs `smokeTest.js`, which sends HTTPS requests to all valid GET and POST paths on the deployed server and verifies that Caddy forwards each one to Kilotest rather than returning a bare 404.

When a pull request adds a new route to `index.js`, the Caddyfile at `/etc/caddy/Caddyfile` on the server must be updated to forward the new path before the pull request can merge. The workflow to follow is:

1. Add the new route to the `routes` constant and the dispatch chain in `index.js`.
1. Update the Caddyfile (`/etc/caddy/Caddyfile`) on the server to forward the new path.
1. Open or update the pull request.
1. The smoke test workflow runs and verifies that all paths, including the new one, are forwarded by Caddy.
1. If the Caddyfile was not updated, the smoke test reports a bare 404 for the new path, the required status check fails, and the pull request cannot merge.

## Smoke testing

A periodic GitHub Actions workflow runs smoke tests daily against the deployed service. This workflow is defined in `.github/workflows/periodic-smoke-tests.yml` and runs on a daily schedule at 14:14 UTC. It can also be triggered manually from the GitHub Actions interface.

The periodic smoke tests validate that the deployed Kilotest service is functioning correctly end-to-end, independent of code deployments. Code and infrastructure are deployed together, and this periodic check validates them independently. If a deployment introduces a regression—for example, a missing Caddyfile update or a broken route—the periodic tests will detect it within 24 hours.

The workflow checks all valid GET and POST paths by running `smokeTest.ts` against the deployed service at `kilotest.com`, verifying that Caddy forwards each path to Kilotest rather than returning a bare 404.

## Health monitoring

The deployment is monitored for external health and availability using [UptimeRobot](https://dashboard.uptimerobot.com/). The monitoring target is the site root `/`. UptimeRobot checks this target hourly with a `HEAD` request and sends an email alert to the maintainer in either of two cases:

- The response status code is 502 (Bad Gateway). This typically indicates that Caddy cannot reach the Kilotest application on `localhost:3000`, suggesting the application process has crashed or become unresponsive.
- The request times out (connection timeout). This suggests a network issue, a host down, or a severely degraded application.

UptimeRobot also sends a recovery message when the service recovers and a subsequent check succeeds after a prior failure.

This monitoring service requires `Caddyfile` to permit `HEAD` requests, not only `GET` requests, to the root path.

## Alerting

Kilotest sends email alerts to the maintainer when certain events occur during normal operation. This section describes when and how those alerts are configured and sent.

### When alerts are sent

Alerts are sent to the maintainer in the following conditions:

1. **Tutorial comment received**: When a user submits a comment on either the web tutorial page (`/tutorialWeb.html`) or the AI agent tutorial page (`/tutorialAI.html`), an alert is sent with subject `"New web tutorial comment received"` or `"New AI tutorial comment received"`.

2. **Annotations become obsolete**: The `/listTopIssues.html` page displays no individual report; it aggregates violation counts, across all stored reports (one per tested page, its latest only), into a single cross-report summary of the most frequently reported issues. To build that summary, Kilotest reads the `issueID` field that it previously wrote onto each violating standard instance during annotation, and looks that `issueID` up as a key in the current `testaro-issues` package's issue definitions. The alert fires only if that key is entirely absent, i.e., the issue that this violation was previously classified under has since been removed (or renamed to a different key) in `testaro-issues`. It does not fire, and this check cannot detect, a rule being *reclassified* to a different, still-existing issue; that broader discrepancy (any stored `issueID` that no longer matches what `testaro-issues` currently assigns the rule, whether because the issue vanished or because the rule was moved to a different issue) is instead surfaced separately, without an alert, on the `/reannotateForm.html` page, which lists both such "reclassified" rules and rules that remain wholly unclassified. Each violating instance is checked independently, so a single stored report can trigger this alert once per distinct missing issue ID it contains, and the alert body names one such issue ID at a time. Despite naming a specific issue, the alert does not point at a way to reannotate just that issue: Kilotest's only reannotation mechanism, reached via `/reannotateForm.html` and submitted at `/reannotate.html`, always re-annotates every standard instance of every currently stored report in one bulk operation (see `web/reannotate/index.ts`); there is no per-issue or per-report reannotation. The named issue ID is diagnostic detail only, telling the maintainer why reannotation is needed, not a parameter to a targeted fix.

3. **Unclassified rules violated**: When a Testaro report is received and annotated, Kilotest attempts to classify every rule violation by looking up each rule in the `testaro-issues` package, which Kilotest depends on (`testaro-issues` in `package.json`) but does not itself define. If a rule has no classification in the currently installed `testaro-issues` package (i.e., the rule has never been assigned to any issue), that rule is added to an `issuelessRules` list in the report, and an alert is sent with subject `"Kilotest: unclassified rules violated"`, listing which rules in which rule engines lack classifications. Because Kilotest can only look up classifications that `testaro-issues` already provides, it has no means to give such a violation an issue ID until `testaro-issues` is updated to supply one; the remedy is two-fold and cannot be done in Kilotest alone: first update `testaro-issues` to add the missing rule-to-issue mapping, then, once Kilotest's dependency on `testaro-issues` is updated to that new version, reannotate the stored reports (`/reannotateForm.html`, see item 2 above) so their violating instances of that rule are written with the new issue ID. The two packages currently share a maintainer, so coordinating the two steps is not an external obstacle, but both steps remain necessary.

4. **Unusable report received**: When a Testaro worker submits a report that Kilotest cannot parse or use (e.g., malformed data), an alert is sent with subject `"Kilotest: unusable report received"`, indicating which job produced the report and which worker submitted it.

5. **Requested full report unavailable**: When a user requests a full report via the API but the report cannot be retrieved (e.g., the report file is missing from disk), an alert is sent with subject `"Kilotest: requested full report unavailable"`, including details on which report was requested and why it could not be retrieved.

6. **Test request received via UI**: When a user submits a test request through the web interface, an alert is sent with subject `"Kilotest: new test request in the UI"` (via `/requestTest.html`) or `"Kilotest: new retest request in the UI"` (via `/requestRetest.html`), including the target URL, description, and the user's stated reason for the request. `test` and `retest` here are the only two literal values Kilotest passes as the request's type; they are hardcoded at each call site, not user-supplied.

7. **Test request received via API**: When a test request is submitted via the API, an alert is sent with subject `"Kilotest: new test request in the API"` (via the `requestTest` API operation) or `"Kilotest: new retest request in the API"` (via the `requestRetest` API operation), including the target URL, description, and the user's stated reason. A request is treated as a duplicate, and no alert is sent for it, only if a request already pending in `db/jobs/testRequests.json`, i.e., submitted but not yet manually approved by the maintainer into an actual job, for the same URL has the identical description; this check ignores the stated reason and the test-versus-retest distinction, and is not limited to a recent time window, it compares against every request still pending approval for that URL. Once the maintainer approves a pending request (turning it into a job via `/enqueue.html`), all pending requests for that URL are cleared, so this check cannot detect a duplicate against a request that has already been approved, is currently running, or has already completed; an identical request submitted after approval alerts again. The check and its dedup key are identical for the UI and API paths, since both funnel through the same underlying request-queuing function.

8. **MCP feature request received**: When a user submits a feature request via the MCP server's `requestFeature` tool, an alert is sent with subject `"MCP feature request received"`, including the text of the feature request.

9. **WAVE balance low**: When Kilotest detects that the account balance for the WAVE API service (used for accessibility testing) has fallen below a threshold, an alert is sent with subject `"Kilotest: WAVE balance low"`, indicating the number of credits remaining.

10. **AI service balance low**: When Kilotest detects that the account balance for an AI service account (such as Anthropic) has fallen below a threshold, an alert is sent with subject `"Kilotest: AI service [N] balance low"`, indicating the approximate remaining balance in dollars and the estimated cost per job.

### Alert configuration

Alerts are sent via the `sendAlert()` function in [alerts.ts](../alerts.ts), which requires five environment variables to be configured:

1. **`MANAGER_EMAIL`**: The email address to which alerts should be sent. This is typically the maintainer's email address.
2. **`ALERT_API_HOST`**: The hostname of the email delivery service. For Kilotest, this is configured to use [Resend](https://resend.com/), a transactional email service.
3. **`ALERT_API_PATH`**: The API endpoint path on the email delivery service. For Resend, this is typically `/emails` or similar, depending on the API version.
4. **`ALERT_API_KEY`**: An API key issued by the email delivery service for authentication. For Resend, this is the API key generated in the Resend dashboard.
5. **`ALERT_FROM`**: The sender email address for outgoing alerts. This must be a verified sender address on the email delivery service.

If any of these five variables is missing or empty at alert time, the alert is not sent. Instead, a warning message is logged to the console, and the application continues normal operation. The warning includes the alert subject and body so the maintainer can manually review what would have been sent.

### Resend integration

Kilotest uses [Resend](https://resend.com/) as its transactional email delivery service. Resend is configured through the environment variables above.

**Resend configuration for Kilotest**: `ALERT_API_HOST` and `ALERT_API_PATH` together identify the Resend API endpoint Kilotest posts to; `ALERT_API_KEY` is a Resend-issued API key; `ALERT_FROM` is the sender address Kilotest sends as. The live values of these environment variables are set in the server's `.env` file, not its PM2 configuration (see “Setting environment variables in production” below), and are not duplicated here.

### DNS configuration for Resend

Resend authenticates outgoing mail using DKIM, and mail receivers additionally consult SPF and DMARC records for the sending domain. The `kilotest.com` DNS zone (managed at [porkbun.com](https://porkbun.com/); see the DNS Configuration section above for the full record set) currently contains the following records relevant to Resend, confirmed live on 2026-09-17 by querying DNS directly and by inspecting the full headers of a delivered alert message:

1. **DKIM (DomainKeys Identified Mail)**
   - **Record type**: TXT (not a CNAME)
   - **Host**: `resend._domainkey.kilotest.com`
   - **Value**: an RSA public key in `p=...` form, issued by Resend for this domain.

2. **SPF (Sender Policy Framework)**
   - **Record types**: MX and TXT
   - **Host**: `send.kilotest.com` (a dedicated MAIL FROM subdomain, not the root domain)
   - **Values**: MX `feedback-smtp.us-east-1.amazonses.com` (priority 10) and TXT `v=spf1 include:amazonses.com ~all`
   - This pair is what Resend’s “Enable SPF” option creates. It makes Resend send with a MAIL FROM on `send.kilotest.com`, which aligns with the `kilotest.com` From domain under relaxed DMARC alignment. Because Resend sends through Amazon SES, the include target is `amazonses.com`, not `resend.com`. The separate root-domain TXT record `v=spf1 include:_spf.porkbun.com ~all` authorizes Porkbun’s servers for mail sent as `@kilotest.com` through Porkbun; SPF is evaluated against the MAIL FROM domain, so the root record plays no role in Resend authentication and needs no Resend mechanism.

3. **DMARC (Domain-based Message Authentication, Reporting and Conformance)**
   - **Record type**: TXT
   - **Host**: `_dmarc.kilotest.com`
   - **Value**: `v=DMARC1; p=none;`
   - The `p=none` policy is monitoring-only: it asks receivers to take no special action on mail that fails alignment, rather than quarantining or rejecting it. No `rua=` reporting address is configured, so no aggregate DMARC reports are being sent anywhere.

A delivered alert message inspected on 2026-09-17 confirms this configuration end to end: `spf=pass` with `smtp.mailfrom` on `send.kilotest.com`, `dkim=pass` with `d=kilotest.com` (`s=resend`), and `dmarc=pass` at both the Porkbun forwarding hop and the final mailbox. Any future change to Resend’s configuration (for example, rotating the DKIM key, adding a `rua=` reporting address to the DMARC record, or tightening the DMARC policy from `p=none` to `p=quarantine`) should be reflected here and in the DNS Configuration section’s CSV.

### Setting environment variables in production

The deployed `pm2.config.cjs` on the server (`/opt/jpdev/kilotest/pm2.config.cjs`) does not list any of the five alert variables in its `env` object; it matches the repository's own copy of that file, which contains only `NODE_ENV`, `BASE_PATH`, and `DEMO_SSE_DELAY_MS`. Alerting is nonetheless working in production, so the five alert variables are being supplied another way.

`index.ts` calls `dotenv.config({quiet: true})` at startup, which reads a `.env` file from the process's working directory (`/opt/jpdev/kilotest/.env`) and loads its contents into `process.env`, in addition to whatever PM2 itself already set. `.env` is listed in `.gitignore`, so it is never committed and exists only on the server; this is the actual mechanism supplying `MANAGER_EMAIL`, `ALERT_API_HOST`, `ALERT_API_PATH`, `ALERT_API_KEY`, and `ALERT_FROM` to the running process. Its expected contents, including these five variables, are documented by the repository's own [env.example](../env.example) (see also the setup instructions in the project [README](../README.md)); `env.example` already records `ALERT_API_HOST=api.resend.com` and `ALERT_API_PATH=/emails` as committed values (also confirmed live: a direct request to `https://api.resend.com/emails` returns `401 Unauthorized`, i.e., a real endpoint that requires an API key, not a routing failure), while `MANAGER_EMAIL`, `ALERT_API_KEY`, and `ALERT_FROM` are left as placeholders there, to be filled in per deployment with server-side secrets not recorded in this document.

To change any of the five alert variables:

1. Edit `/opt/jpdev/kilotest/.env` on the server directly.
2. Restart PM2 so the process starts fresh and `dotenv.config()` re-reads the file:

   ```bash
   pm2 restart kilotest --time --update-env
   pm2 save
   ```

### Troubleshooting

**Alerts are not being sent**:

1. Check that all five alert environment variables are set in `/opt/jpdev/kilotest/.env` on the server (not `pm2.config.cjs`, which does not carry them): `MANAGER_EMAIL`, `ALERT_API_HOST`, `ALERT_API_PATH`, `ALERT_API_KEY`, `ALERT_FROM`.
2. Check the PM2 logs for warning or error messages: `pm2 logs kilotest | grep -i alert`.
3. Verify that the Resend API key is valid and has not been revoked in the Resend dashboard.
4. Verify that the sender email address (`ALERT_FROM`) is verified in the Resend dashboard.
5. Verify that the DNS records (DKIM, SPF, DMARC) are correctly configured for `kilotest.com`.

**Alerts are bouncing or not reaching the maintainer**:

1. Check the Resend dashboard logs for delivery errors.
2. Verify that the `MANAGER_EMAIL` address is correct and actively monitored.
3. Check the maintainer's email spam folder; some email providers filter unfamiliar senders.
4. Verify DMARC, SPF, and DKIM records are correctly configured.

## Usage metrics

Kilotest records basic counts of how it is used, so the maintainer can answer questions such as whether the web UI or the MCP server is being used, and what classes of requests are made, without needing external tooling.

### What is recorded

`recordMetric(category, name)`, in `util.ts`, increments a count for a `(category, name)` pair and writes the result to `db/metrics.json`. It is called from three places:

- The generic `.html` GET dispatch in `index.ts`, once per successfully served web page, recorded under the `pageViews` category by page name (for example `tutorialWeb`, `listReports`), unless the page is a manager-only page (see "Manager page activity" below), in which case it is recorded there instead.
- The home page (`/` and `/index.html`), served by its own branch in `index.ts` rather than through the generic `.html` dispatch, recorded under `pageViews` as `index`.
- Each of the 8 MCP tool handlers in `mcp.ts`, once per successful tool call, recorded under the `mcpToolCalls` category by tool name (for example `listReports`, `requestTest`).
- The `/api/*` GET and POST service branches in `index.ts`, once per call, recorded under the `apiOperations` category by operation name.

`db/metrics.json` also stores a `since` time stamp, set when the file is first created, so the counts can be read as "since this date" rather than assumed to cover Kilotest's entire history. `getMetrics()` backfills any category absent from an existing `db/metrics.json` (for example one written before a category such as `managerActivity` existed), so an older file remains readable rather than causing every subsequent request to error.

#### Manager page activity

Every page linked from `/manage.html` (`enqueueForm.html`, `reannotateForm.html`, `pruneReportsForm.html`, `rewindReportsForm.html`, `expungeReportsForm.html`, `hideReportForm.html`, `showHiddenReportsForm.html`, `unhideReportForm.html`, `ai0BalanceForm.html`, `renewWCAGForm.html`, `metrics.html`), plus the POST-only action pages some of them submit to (`requestAction.html`, `reannotate.html`, `renewWCAG.html`), is excluded from `pageViews` and recorded instead under a separate `managerActivity` category, keyed by page name, with `ok` and `error` counts tracked separately.

This exclusion exists because manager pages reflect the maintainer operating Kilotest, not the usage the other three categories are meant to reveal. Tracking `ok` and `error` outcomes separately, rather than a single combined count, makes a spike of failed `authCode` submissions against a manager page visible as a possible sign of an attempted attack, a signal a combined count would hide.

#### Excluding the maintainer's own manual testing

The manager-page exclusion above only keeps the maintainer's use of manager-only pages out of `pageViews`; it does not, by itself, keep the maintainer's manual testing of *ordinary* pages (for example clicking through `tutorialWeb.html` or `listReports.html` after a deployment) from being counted as real usage. A separate mechanism addresses that: submitting a valid `authCode` on `/metrics.html` sets a cookie (`kilotestExclude`), valid for 30 days, whose value is a SHA-256 hash of `AUTH_CODE` rather than the code itself, so the secret is never placed in a long-lived browser cookie. Every subsequent request from that browser that carries a matching cookie is excluded from `pageViews` and `apiOperations` (not from `managerActivity`, which should keep counting regardless, since it exists to surface suspected abuse, including from the maintainer's own browser if its cookie were ever compromised).

A fixed or guessable cookie value was deliberately avoided: Kilotest's source is public, so anyone could otherwise read it and set the same cookie in their own browser to exclude themselves from metrics at no cost, defeating the feature. Hashing `AUTH_CODE` means only someone who has already proven they know the real code can derive the correct cookie value.

This mechanism has one known, accepted limitation: the very first request of a testing session, the one that submits the `authCode` and earns the cookie, is necessarily made before the cookie exists and so cannot itself be excluded (visible today as the `metrics` page's own `managerActivity` count, which is unaffected, since that page is a manager page regardless). This is treated as a small, one-time-per-session cost rather than something worth building retroactive correction for.

MCP tool calls are not currently covered by this cookie, since `mcp.ts`'s handlers do not receive the raw request needed to read it, and a maintainer manually driving MCP tools from a browser is a rare case; this is an explicit, narrower scope, left for a future iteration if it proves worth extending.

Requests from the periodic smoke test (`smokeTest.ts`) are not recorded: `index.ts`'s `handleRequest` intercepts any request bearing the `x-kilotest-smoke` header before any dispatch, route handler, or MCP tool call runs, so smoke-test traffic never reaches a `recordMetric` call site in the first place.

This is a small, initial feature set, not a complete observability solution: it counts requests by class and frequency, but does not record resource metrics (memory, storage, CPU; already available via `pm2 monit`, `free`, and `df`), per-event time-series data, or any caller identity (Kilotest's MCP transport is stateless and has no stable per-caller identifier).

### Viewing the metrics

The counts are displayed at `/metrics.html`, linked from `/manage.html`, as four tables: web page views, MCP tool calls, API operation calls, and manager page activity (successful and failed counts per manager page). Like the other self-submitting manager-power pages that display a form on GET (`/hideReportForm.html`, `/showHiddenReportsForm.html`, `/ai0BalanceForm.html`), a GET request always displays a form requesting an authorization code, since the maintainer following the `/manage.html` link has had no earlier opportunity to supply one; only a POST request (the form's own submission) either shows the counts, if the code matches the `AUTH_CODE` environment variable, or reports an error if it does not. This makes the data a manager-only capability for now, not because it is considered more sensitive than other manager-only data, but because it may later be made public, and starting restricted keeps that as a small, easily found reversal (dropping the `authCode` check in `web/metrics/index.ts`) rather than a rearchitecture.

A GET request's query string is never processed as a submission, even if it happens to contain a valid `authCode` (for example typed or pasted into the address bar): all 7 self-submitting manager pages (`ai0BalanceForm.html`, `expungeReportsForm.html`, `hideReportForm.html`, `metrics.html`, `pruneReportsForm.html`, `rewindReportsForm.html`, `showHiddenReportsForm.html`, plus `unhideReportForm.html`) take an explicit HTTP method argument and only act on a submission when that method is POST, so the same query-string parameters that a POST body carries are inert on GET. This closes a gap found during development: 5 of these pages had omitted `method="post"` from their HTML forms and were submitting via GET, and even after adding a POST option, the pages continued to also accept the identical action via GET until this method check was added.

Every manager-facing form and action page (the 7 self-submitting pages above, plus `enqueue.ts`, `reannotate.ts`, and `renewWCAG.ts`, the separate action pages that `enqueueForm.html`, `reannotateForm.html`, and `renewWCAGForm.html` submit to) reports the same generic message, "Invalid request", for any failed submission on its own POST, whether the cause is an invalid `authCode` or something else about the request. This is deliberate: naming the authorization code specifically would confirm to an attacker which part of a guessed submission was wrong, information a generic message withholds. The real reason is still available to the maintainer, both in the server log (`serveError` always logs the full error object) and, for authCode failures specifically, as a count in `/metrics.html`'s manager page activity table.

### Protecting the hidden report list

`unhideReportForm.html` lists every hidden report by the name of the page it reports on, so that a manager can choose one to unhide, but that same list is also the information a hidden report is meant to keep out of public view. To avoid disclosing it to anyone who simply requests the URL, `unhideReportForm.html` has no GET route at all; `index.ts`'s generic `.html` GET dispatch excludes it explicitly via a `noDirectGetPages` set, even though its `answer()` function is otherwise a self-submitting manager page like the others. It is reachable only as the response to a valid submission of a separate gate, `showHiddenReportsForm.html`: a bare form requesting an authorization code, with no other content, whose own GET route discloses nothing about hidden reports. On a valid code, `showHiddenReportsForm`'s POST handler renders `unhideReportForm`'s own page (the hidden-report list and its unhide form) as its response; on an invalid code, it returns the same generic error response as any other manager page's failed `authCode` check. `unhideReportForm.html` keeps its own POST route, since it remains self-submitting: each unhide action re-serves the form with the updated list, so a manager can unhide several reports in one sitting without returning to `showHiddenReportsForm.html` each time. The `/manage.html` link to this flow points at `showHiddenReportsForm.html` and reads "View the list of experimental reports", naming neither "hidden" nor "declassify", so that the link text itself does not hint that a restricted list exists.

#### Clearing the counts

`/metrics.html`'s form includes a "Clear counts" checkbox. Submitting the form with it checked (and a valid `authCode`) resets all four categories, and the `since` time stamp, to empty, then renders the (now empty) result as confirmation, alongside a "Counts cleared." message.

## Performance

The Cloud Compute host, in initial testing, took about 2.5 as long to process an example job as an Apple M2 Pro MacBook Pro with 16GB of memory. After tuning, the ratio was reduced to about 1.7.

The performances of several alternative host architectures were evaluated, and it was decided to migrate the initial host to a High Frequency compute instance. Any subsequent migration is straightforward if the destination root volume is at least as large as the originating one (64GB). The process is:

- Create a snapshot of `jpdev`.
- Deploy the new host using the snapshot.

To evaluate a new host before deciding to keep it, do this after deploying it:

1. Connect to it via SSH (`ssh linuxuser@<IP address>`).
1. Add a firewall rule permitting `http` connections to port 3000 (`sudo ufw allow 3000/tcp`).
1. Navigate with a browser to `http://<IP address>:3000/`.
1. Request the sample job.
1. Observe the elapsed time reported in the result basics.

Experimentation revealed that a high-frequency instance could decrease the elapsed-time ratio (compared with the MacBook Pro) to 1.3 to 1.5, and a dedicated instance could decrease it further to about 1.2. Swapping was found eliminated with 4GB of RAM, but that elimination had no significant impact on elapsed time.

## Security

### Report protection

Jobs and reports are not tracked, so there are no duplicates in any other copy of the repository. Jobs are typically ephemeral, but reports typically remain in existence until deemed obsolete and useless even for historical comparison. Therefore, reports risk deletion unless duplicates are made externally. Other files, including application code, dependencies, and `db/reportsExtract.json`, are not at risk, because they can be pushed from the local repository or regenerated.

Reports created on the deployed server are currently protected with an external archive at the [Cloudflare R2 object storage service](https://developers.cloudflare.com/r2/). On that service, the current Kilotest maintainer has an account, subscribes to the R2 service, has created two *buckets* named `kilotest-reports` and `kilotest-hidden-reports`, and has created an API token scoped to those buckets with object read-write permissions, access and secret access keys for S3 clients, and a restriction to the IPv4 and IPv6 addresses of the server.

The server host uses `rclone` for file synchronization with external storage locations. Two files on the server host enable `rclone` for use by Kilotest. One file is `/home/linuxuser/.config/rclone/rclone.conf`. Its content, with secrets replaced, is:

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = <access_key_id>
secret_access_key = <secret_access_key>
endpoint = https://<account_id>.r2.cloudflarestorage.com
acl = private
no_head = true
no_check_bucket = true
```

The other file is the `crontab` configuration file for `linuxuser`, which is managed with `crontab -e`. The commands in that file (shown with `crontab -l`) are:

```crontab
11 9 * * * /usr/bin/rclone copy /opt/jpdev/kilotest/db/hiddenReports r2:kilotest-hidden-reports/ -v --backup-dir r2:kilotest-hidden-reports-old/$(date +\%F) > /home/linuxuser/kilotest-to-r2.log 2>&1
12 9 * * * /usr/bin/rclone copy /opt/jpdev/kilotest/db/reports r2:kilotest-reports/ -v --backup-dir r2:kilotest-reports-old/$(date +\%F) >> /home/linuxuser/kilotest-to-r2.log 2>&1
```

This configuration every morning (UTC) copies reports to R2 as follows:

- Reports already on R2 are not copied again.
- Reports not yet on R2 are copied to it.
- Reports on R2 that differ from and are older than the same-name reports on the server are moved to the corresponding `-old` directory, and the newer reports are copied to R2.

Each daily copy operation is logged in `/home/linuxuser/kilotest-to-r2.log`. That file is replaced with a new one each day documenting only the operation on that day.

If restoration becomes necessary, the files can be copied in the opposite direction with:

```bash
/usr/bin/rclone copy r2:kilotest-reports /opt/jpdev/kilotest/db/restored-reports -v
/usr/bin/rclone copy r2:kilotest-hidden-reports /opt/jpdev/kilotest/db/restored-hidden-reports -v
```

After that the maintainer can inspect the original and restored directories and delete or move report files as needed. After that the `db/reportsExtract.json` file should be deleted, so it will be regenerated when next needed.

### Possible future Testaro integration

Kilotest uses Testaro to run jobs. In previous versions of Kilotest, Testaro was a dependency. It is currently not a dependency. Instead, Testaro instances are installed on one or more other hosts, and each instance polls Kilotest to ask for jobs to run.

In case Testaro again becomes a dependency of Kilotest, the notes below on security issues will be useful.

### Browser privileges

Testaro uses Playwright to launch and control headless browsers, often `chromium`. Those browsers navigate to web pages that are tested by the rule engines that Testaro integrates.

When Playwright (or Puppeteer) launches a `chromium` browser, in most environments it is [sandboxed](https://www.geeksforgeeks.org/ethical-hacking/what-is-browser-sandboxing/). Sandboxing is a security feature that prevents the browser from accessing potentially unsafe system resources. But in the Ubuntu Linux operating system that was installed on the Vultr Cloud Compute host a sandboxed browser requires an [unprivileged user namespace](https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces), and when Ubuntu was installed its configuration disallowed such namespaces. The file `/etc/sysctl.d/99-kilotest-userns.conf` with the content `kernel.apparmor_restrict_unprivileged_userns = 1` prohibited unprivileged user namespaces and thereby made sandboxed browsers unlaunchable.

#### Potential modification

One modification to cope with this prohibition on the Vultr Cloud Compute host would be to configure Playwright and Puppeteer to launch `chromium` non-sandboxed. In both cases, launch arguments `'--no-sandbox'` and `'--disable-setuid-sandbox'` are available to specify this.

- For Playwright, `'--no-sandbox'` and `'--disable-setuid-sandbox'` would be added to the arguments of `browserOptionArgs.push` in the Testaro `run.js` file.
- For the `qualWeb` rule engine, this would be done in the Testaro `tests/qualweb.js` file, where the `qualWeb.start` method is called with an options argument. Its `args` array property would include `'--no-sandbox'` and `'--disable-setuid-sandbox'`.
- The `ibm` rule engine, too, could launch a Puppeteer `chromium` browser, if page content instead of a Playwright page were passed to the `accessibilityChecker.getCompliance` method, or if the implementation of the rule engine were changed in the future. For anticipation of such a case, the Testaro `aceconfig.js` file, of which a copy has been created at the root of the Kilotest project, would be modified. That file defines a `module.exports` object with a `puppeteerArgs` property, and, `--no-sandbox` and `--disable-setuid-sandbox` would be added to its array value.

#### Current modification

However, non-sandboxed browsers are less secure than sandboxed ones, particularly when there is no restriction on who can use the service and what web pages they can test with it. Such restrictions are currently in place, but still permit testing of arbitrary web pages and may be relaxed in the future. Therefore, the potential modification described above would introduce nontrivial risk. An alternative solution was adopted instead. In it, the `chromium` configuration was left unchanged.

This solution required configuring the operating system of the Vultr Cloud Compute host to permit a sandboxed browser to be launched. This reconfiguration was performed with:

```bash
sudo sysctl -w kernel.unprivileged_userns_clone=1
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
sudo tee /etc/sysctl.d/99-kilotest-userns.conf >/dev/null <<'EOF'
kernel.unprivileged_userns_clone = 1
kernel.apparmor_restrict_unprivileged_userns = 0
EOF
sudo sysctl --system
```
