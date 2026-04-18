# Security Policy

## Supported scope

Parloir is currently maintained as a public, single-instance self-hostable OSS
application. Security fixes are prioritized on `main`.

At this stage:
- the current `main` branch is the supported security target
- older commits, stale branches, and local forks are not supported
- multi-instance or internet-scale hardening is best-effort unless explicitly
  documented in the repository

## Reporting a vulnerability

Please prefer GitHub's private vulnerability reporting for this repository when
it is available.

If private reporting is not available:
1. Do not post exploit details, secrets, or proof-of-concept payloads in a public issue.
2. Open a minimal issue asking for a private contact channel, or contact the
   repository maintainer through the contact methods listed on their GitHub profile.

Include:
- affected commit SHA or branch
- deployment mode
- reproduction steps
- impact assessment
- any suggested remediation

## Response expectations

This is an OSS project and response times are best-effort. The goal is to:
- acknowledge credible reports promptly
- reproduce and triage them
- ship fixes on `main`
- document any required operator action when a fix is released

## Out of scope

The following are generally out of scope unless they clearly lead to a real
security impact in the shipped app:
- purely theoretical issues without a plausible exploit path
- problems in unsupported forks or modified deployments
- missing multi-region / enterprise SaaS controls in this OSS repo
- reports that require public disclosure before maintainers have a chance to fix
