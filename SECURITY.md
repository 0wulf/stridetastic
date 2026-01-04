# Security Policy

## Supported versions
Security fixes target the `main` branch. If you discover a vulnerability, please report it before opening a public issue.

## Reporting a vulnerability
- Please open a private GitHub Security Advisory for this repo (Security tab → Report a vulnerability).
- Include: description, steps to reproduce, impact, logs/traces, and any mitigation ideas.

Do not disclose publicly until we agree on a timeline as a grace period.

## Scope and responsible use
STRIDEtastic is for authorized research and defensive testing only. When testing, ensure you have explicit permission for any networks, MQTT brokers, radios, or RF spectrum you touch. Do not include real secrets or private data in sample captures or PRs.

## Handling secrets and data
- Never commit credentials, private keys, or real PSKs.
- Use `.env.template` as a guide for local env vars.

## Patch process
1. We reproduce and assess severity.
2. We develop a fix on a private branch if warranted.
3. We ship patches to `main` and publish a release note if the issue is user-impacting.
