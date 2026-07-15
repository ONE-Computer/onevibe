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
- A ONEComputer sandbox is not presented as gateway-enforced unless `ONECOMPUTER_GATEWAY_ENFORCED=true` is explicitly configured after deployment verification.

## Promotion gates

Before production, replace or verify:

1. local workspace with a disposable VM/microVM or approved ONEComputer sandbox;
2. unrestricted host networking with gateway-enforced default-deny egress;
3. local JSON persistence with authenticated database/object storage;
4. local bearer/HMAC wallet service with OpenVTC Trust Task delivery and asymmetric signed-proof verification;
5. unsigned local evidence with externally anchored OpenVTC evidence receipts;
6. unauthenticated local API with enterprise identity, tenant isolation, CSRF protection, rate limits, and authorization;
7. generic iframe preview with authenticated, non-indexed, time-limited isolated origins and strict Permissions Policy.
