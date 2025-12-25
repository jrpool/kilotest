# Service

This document describes one deployment of Kilotest as a web service.

## Host

The host of the service is a [Vultr](https://www.vultr.com) Cloud Compute High Frequency virtual machine named `jpdev` with the IPV4 address 149.28.208.106. The host has 1 vCPU, 2MB of RAM, and 64GB NVMe of storage.

The server operating system is Ubuntu LTS 22.04.

Kilotest is installed at `/opt/jpdev/kilotest` on the server.

The server has a `sudo`-capable non-root user named `linuxuser`, which is the owner of the project directory and files.

Connection to the host is made with `ssh linuxuser@kilotest.com`. Periodically the server requires password authentication in addition to public key authentication. The password is available in the server details on the Vultr web console, after the administrator logs in via GitHub.

## Process management

The service is managed with PM2 on the server (not on the local development host). The PM2 configuration is tracked in the repository as `pm2.config.js`.

When the PM2 configuration or environment is changed, restart PM2 with:

```text
pm2 restart kilotest --update-env
pm2 save
```

The server configuration has been tuned for improved performance. The file edited for this purpose is `/etc/default/zramswap`.

This enables `zram` and decreases the amount of disk swapping.

When Kilotest leverages Testaro to run a job, Testaro uses Playwright to create headless browsers. They are destroyed automatically when no longer needed, and the last ones are typically destroyed within a minute after the end of a job. Thus, neither Testaro nor Kilotest attempts to kill them when a job ends.

## Keepalive

The SSH configuration on both the server and the local client is customized so that connections will be kept alive longer than the default. This customization is performed in `/etc/ssh/sshd_config` on the server and in `~/.ssh/config` on the client. The customized variables are `ClientAliveInterval` on the server, and `ServerAliveInterval`, `ServerAliveCountMax`, and `TCPKeepAlive` within `Host <ip.address>` on the client.

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

### Kilotest service

Reliance on the default Vultr DNS resolvers has caused erratic failures. Therefore, the service has been configured to use specific DNS resolvers.

These commands disabled cloud-init network management:

```bash
sudo mkdir -p /etc/cloud/cloud.cfg.d
printf "network: {config: disabled}\n" | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
```

The following `/etc/netplan/01-dns.yaml` file with `root` as owner and groupwas created and given permissions 600. It custom-configures network management and specifies the DNS resolvers of APNIC Research and Development and Google LLC.

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
curl -sv https://example.com/ -o /dev/null```

## Request management

Requests to `https://kilotest.com` are received on port 443 and processed by Caddy, which forwards them via HTTP to the application at `localhost:3000`. Caddy manages TLS via Let’s Encrypt. Any request to `http://kilotest.com` is received on port 80, and Caddy redirects it to an `https` request. Caddy forwards `https` requests to the [local server](http://localhost:3000), where it is processed by the Kilotest service.

Caddy also manages request and response encryption by subscribing to a periodically renewed Let’s Encrypt certificate.

This Caddy configuration is maintained and tracked in `/etc/caddy/Caddyfile`:

```javascript
kilotest.com {
  # Enable Zstandard and Gzip compression of responses.
  encode zstd gzip
  # Reverse proxy all requests to localhost:3000.
  reverse_proxy localhost:3000 {
    # Improve SSE latency.
    flush_interval -1
  }
}
```

This configuration prevents the granular reporting of Testaro from being buffered, so the updates reach the browser without delay.

## Version management

When a new version of the `kilotest` package has been published, the service can be updated as follows:

1. Connect to the server: `ssh linuxuser@kilotest.com`
1. Navigate to the package root: `cd /opt/jpdev/kilotest`
1. Fetch and merge the new version: `git pull`
1. Update the dependencies: `npm update`
1. Update the Playwright browsers: `npx playwright install`
1. Restart the service: `pm2 restart kilotest`

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

### Browser privileges

Kilotest uses Testaro to run jobs, and Testaro in turn uses Playwright to launch and control headless browsers, most commonly `chromium`. Those browsers navigate to web pages that are tested by the tools that Testaro integrates. Two tools, `ibm` and `qualWeb`, under some conditions launch their own browsers via Puppeteer as a dependency to perform their tests. Playwright, too, uses Puppeteer to launch browsers. The `puppeteer.launch` method by default configure its `chromium` browsers in sandboxes, but some hosts prohibit sandboxed browsers. For example, the Vultr Cloud Compute host contains by default a file `/etc/sysctl.d/99-kilotest-userns.conf` with the content `kernel.unprivileged_userns_clone = 0`, which prohibits sandboxed browsers.

One modification that overcomes this prohibition on the Vultr Cloud Compute host is to explicitly permit Puppeteer to launch non-sandboxed browsers:

- For the `ibm` tool, this is done in the `aceconfig.js` file, of which a copy has been created at the root of the Kilotest project. That file defines a `module.exports` object with a `puppeteerArgs` property, and, if its array value includes `--no-sandbox`, then a `chromium` browser launched by `puppeteer` within that tool will not be sandboxed.
- For the `qualWeb` tool, this is done in the `tests/qualweb.js` file, where the `qualWeb.start` method is called with an options argument whose `args` array property includes `'--no-sandbox'`.

Non-sandboxed browsers are less secure than sandboxed ones, particularly when there is no restriction on who can use the service and what web pages they can test with it. Therefore, the above modification introduces some risk. An alternative modification is to permit browsers to be sandboxed. For the `ibm` and `qualWeb` tools, the omission of the above-described `'--no-sandbox'` arguments does this. On the Vultr Cloud Compute host, this requires explicit operating-system permission. These commands achieve that:

```bash
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
echo "kernel.apparmor_restrict_unprivileged_userns = 0" | sudo tee /etc/sysctl.d/99-kilotest-userns.conf
```

This makes the `/etc/sysctl.d/99-kilotest-userns.conf` file content `kernel.unprivileged_userns_clone = 1`.
