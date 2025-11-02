# Service

This document describes one deployment of Kilotest as a web service.

## Keepalive

The SSH configuration on both the server and the local client is customized so that connections will be kept alive longer than the default. This customization is performed in `/etc/ssh/sshd_config` on the server and in `~/.ssh/config` on the client. The customized variables are `ClientAliveInterval` on the server, and `ServerAliveInterval`, `ServerAliveCountMax`, and `TCPKeepAlive` within `Host <ip.address>` on the client.
