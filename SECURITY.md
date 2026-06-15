# Security Policy

This repository is under active development. If you believe you have found a
security vulnerability, please report it privately and do not open a public
GitHub issue with exploit details.

Issue tracking: [#98](https://github.com/NeonButrfly/tichuml/issues/98)

## Supported Versions

Security fixes are applied to the current `main` branch.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| older commits / forks | No |

## Reporting a Vulnerability

Please send a private report through one of these channels:

1. GitHub Security Advisories for this repository, if available.
2. A private message to the repository owner with:
   - a summary of the issue
   - affected files, scripts, or runtime surfaces
   - reproduction steps
   - expected impact
   - proof-of-concept details only as needed to reproduce safely
   - any suggested mitigation

If you are unsure whether something is security-sensitive, report it privately
first.

## What To Include

Useful reports usually include:

- the commit SHA or branch tested
- whether the issue affects local development, CI, the backend, telemetry, ML,
  or deployment scripts
- any required environment variables, configuration, or credentials scope
- whether the issue allows data exposure, code execution, privilege escalation,
  or service disruption

## Response Expectations

We will aim to:

1. Acknowledge receipt.
2. Reproduce and assess severity.
3. Prepare a fix or mitigation on `main`.
4. Coordinate public disclosure after the fix is available when appropriate.

## Scope Notes

This repo includes application code, backend services, telemetry pipelines, ML
tooling, and deployment scripts. Please report vulnerabilities involving any of
the following privately:

- secret handling
- authentication or authorization gaps
- unsafe script behavior
- insecure defaults
- dependency or supply-chain concerns
- backend request or data-exposure flaws
- CI or automation misconfiguration with security impact

For non-sensitive bugs, continue to use normal GitHub issues.
