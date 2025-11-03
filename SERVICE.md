# Service

This document describes one deployment of Kilotest as a web service.

## Host

The host of the service is a [Vultr](https://www.vultr.com) Cloud Compute virtual machine named `jpdev` with the IPV4 address 140.82.50.126.

The server operating system is Ubuntu LTS 22.04.

Kilotest is installed at `/opt/jpdev/kilotest` on the server.

The server has a `sudo`-capable non-root user named `linuxuser`, which is the owner of the project directory and files.

## Process management

The service is managed with PM2 on the server. The PM2 configuration is tracked in the repository as `pm2.config.js`, although PM2 is not installed on the client.

When the PM2 configuration is changed, restart PM2 with:

```
pm2 kill
pm2 start pm2.config.js --env production
```

## Keepalive

The SSH configuration on both the server and the local client is customized so that connections will be kept alive longer than the default. This customization is performed in `/etc/ssh/sshd_config` on the server and in `~/.ssh/config` on the client. The customized variables are `ClientAliveInterval` on the server, and `ServerAliveInterval`, `ServerAliveCountMax`, and `TCPKeepAlive` within `Host <ip.address>` on the client.

## Internet domain

The domain name `kilotest.com` is registered with [Porkbun](https://porkbun.com) for this application.

## DNS Configuration

The DNS records for `kilotest.com` are configured as follows:

### TTL

The TTL value in each case is 3600 (1 hour).

1. **A Record**
   - **Type**: A
   - **Name**: @
   - **Value**: 140.82.50.126

2. **AAAA Record** (if applicable)
   - **Type**: AAAA
   - **Name**: @
   - **Value**: [Your IPv6 address] (if applicable)

3. **CNAME Record** (optional for www)
   - **Type**: CNAME
   - **Name**: www
   - **Value**: kilotest.tools

4. **MX Record** (for email forwarding)
   - **Type**: MX
   - **Name**: kilotest.com
   - **Value**: fwd1.porkbun.com or fwd2.porkbun.com
   - **Priority**: [Set priority, e.g., 10]

5. **TXT Records** (for domain validation)
   - **Type**: TXT
   - **Name**: _acme-challenge.kilotest.com
   - **Value**: validation token provided by Porkbun or Let’s Encrypt

6. **ALIAS Record**
   - **Type**: ALIAS
   - **Name**: www.kilotest.com
   - **Value**: kilotest.com

### Notes

- Ensure that all records are correctly configured and propagated.
- The A record points to the server's IP address, allowing users to access the Kilotest service via `kilotest.tools`.
- The MX record is set up for email forwarding using Porkbun's forwarding services.
- The TXT records are used for domain validation with Let's Encrypt, ensuring that SSL certificates can be issued for your domain.
- The ALIAS record is optional and can be adjusted based on your specific requirements.

## Request management

Requests to `https://kilotest.com` are directed to the IPV4 address of the Kilotest service.

When requests arrive, they are mapped by Caddy, acting as a reverse proxy, to port 3000.

Caddy also manages request and response encryption by subscribing to a periodically renewed Let’s Encrypt certificate and redirecting any `http` request to a corresponding `https` request.
