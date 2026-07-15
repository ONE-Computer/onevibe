# Security model

## Trust boundaries

- **Browser:** untrusted presentation surface. It can create a request but cannot approve it.
- **ONEVibe API:** task coordinator and event authority; must authenticate users and minimize browser-visible data.
- **Agent runtime:** untrusted workload. It receives scoped capabilities, not ambient credentials.
- **ONEComputer gateway:** policy enforcement point for network, connector, package, and secret actions.
- **OpenVTC/VTI Wallet:** independent approval authority and private-key custody boundary.
- **Evidence plane:** append-only audit outside the mutable workload.

## Local-demo controls

- random server-generated task IDs;
- workspace path resolution checked against the configured root;
- no shell execution;
- no task/browser approval endpoint; the separate wallet namespace requires a server-held bearer credential;
- preview uses generated static files only;
- ordered events include `previousHash` and `eventHash`;
- runtime mode and non-production limitations are visible in the UI.
- local wallet decisions produce HMAC receipts for integration testing; the wallet secret is never serialized into task state or evidence.
- ONEComputer mode executes Claude through the sandbox API, rejects unsafe artifact paths, caps extraction at 100 files/10 MiB, and deletes the sandbox by default.
- ONEComputer-mode Claude journals remain in the disposable sandbox. ONEVibe stores only bounded projections of tool and transcript events after redacting credential-like fields; the raw `stream-json` journal is excluded from artifact extraction.
- A ONEComputer sandbox is not presented as gateway-enforced unless `ONECOMPUTER_GATEWAY_ENFORCED=true` is explicitly configured after deployment verification.
- Visual-runtime capture is pull-only: ONEVibe requests a sandbox-owned headless X11 PNG over the authenticated service channel, stores the resulting frame as evidence, and proxies it to the browser. It does not expose VNC, X11, Chrome DevTools Protocol, or sandbox tokens to the browser.
- Schedules are constrained to a 15-minute minimum and only dispatch ordinary task creation. They do not carry approval authority, bypass policy, or gain direct publication/connector credentials.
- Website references are user-supplied context, not server-side fetch instructions. Inputs are bounded and reject embedded userinfo and common secret query parameters; evidence records only origin/path while retaining the full reference in task storage for the user-authorized agent context.
- Task attachments are capped at four files/256 KiB each/1 MiB total, receive sanitized names, and are written only under the task `inputs/` directory. Evidence records names, paths, MIME types, and sizes—not file bytes. Agents are instructed to treat them as untrusted input.

## Promotion gates

Before production, replace or verify:

1. local workspace with a disposable VM/microVM or approved ONEComputer sandbox;
2. unrestricted host networking with gateway-enforced default-deny egress;
3. local JSON persistence with authenticated database/object storage;
4. local bearer/HMAC wallet service with OpenVTC Trust Task delivery and asymmetric signed-proof verification;
5. unsigned local evidence with externally anchored OpenVTC evidence receipts;
6. unauthenticated local API with enterprise identity, tenant isolation, CSRF protection, rate limits, and authorization;
7. generic iframe preview with authenticated, non-indexed, time-limited isolated origins and strict Permissions Policy.
8. visual capture with an attested microVM image, a private/loopback-only display and CDP endpoint, redaction before durable evidence storage, per-tenant retention, and explicit policy over when screenshots may be collected.
9. asynchronous sandbox provisioning that persists an ID before long bootstrap work and supports idempotent cancellation/deletion. A caller must never lose the ability to clean up an ephemeral provider resource after a timeout or disconnect.
