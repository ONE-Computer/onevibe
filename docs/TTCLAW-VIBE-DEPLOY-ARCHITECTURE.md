# TTClaw vibe-deploy architecture study

## Why this matters to ONEVibe

The experiment in `/Users/gini/tt-deploy-mcp/` demonstrates a safer product shape for deploying agent-authored applications:

```text
Human request
  -> agent edits a managed workspace
  -> validate source and manifest
  -> authenticate/preflight
  -> create immutable preview plan
  -> external human or VTI Wallet approval
  -> broker builds a locked non-root image
  -> broker deploys staging and returns a job ID
  -> agent polls the job and verifies health, revision, logs, and browser behavior
```

The important boundary is that the agent is a workspace author and deployment planner, not an Azure principal. The broker is the only component allowed to use Azure and registry authority. Approval is a separate action bound to the exact plan; it is not a chat button or a model decision.

## Observed control-plane contracts

The current experiment exposes a narrow host-only MCP rather than an Azure CLI wrapper:

| Stage | TTClaw experiment | ONEVibe translation |
| --- | --- | --- |
| Workspace | Fixed templates, allowlisted repository imports, dedicated per-app directories | One durable conversation workspace inside a ONEComputer sandbox; deployment source is an explicit export, never a host mount |
| Validation | `tt_app_validate` checks manifest shape, lockfiles, symlinks, source quotas, credential patterns, runtime and auth posture | `onevibe_app_validate` checks the exported app contract, dependency lock, health endpoint, auth mode, egress, artifact provenance, and sandbox boundary |
| Auth preflight | `tt_app_auth_preflight` checks Entra/Cloudflare readiness and exact-email policy | `onevibe_app_auth_preflight` checks external identity/policy configuration before any deploy plan is eligible |
| Preview | `tt_app_preview` records source hash, runtime, target, auth, secret references, resource attachments, and a 30-minute expiry | `onevibe_app_preview` produces a content-addressed deployment plan with conversation ID, workspace revision, source digest, image policy, environment, ingress, egress, identity policy, and risk summary |
| Approval | Local operator CLI approves or revokes the exact plan outside MCP | VTI Wallet signs the exact action/target/limits/expiry; the web UI only displays the pending decision and receipt |
| Build | `tt_app_build` queues a broker-side ACR build and later records an immutable digest | Broker builds a reproducible, non-root image from the approved source digest; the digest becomes an evidence-bound artifact |
| Deploy | `tt_app_deploy_staging` queues a host-side deployment job and requires the approved plan plus matching build artifact | A deployment broker applies only the approved digest to a staging target; no agent-supplied Azure command, registry, role, or resource creation is accepted |
| Progress | `tt_job_status` exposes queued/running/succeeded/failed state | Durable ONEVibe job events stream into the task timeline and Computer rail; retries are idempotency-keyed and ambiguity fails closed |
| Verification | `tt_app_status`, `tt_app_revisions`, `tt_app_logs`, and bounded health checks verify the result | Health, revision, logs, browser checks, source digest, image digest, and approval receipt are all attached to one deployment evidence chain |

## Security patterns worth carrying forward

1. **Broker capability sandbox.** The host broker exposes named operations with typed schemas. It does not expose arbitrary `az`, shell, Dockerfiles, role grants, container exec, or resource creation.
2. **Managed workspace and source boundary.** Source is copied from a bounded workspace after validation. The scanner rejects symlinks, credential filenames, common credential patterns, generated dependency trees, oversized files, and unknown manifest fields.
3. **Immutable plan.** The plan includes the source SHA-256, runtime, health path, target environment, ingress, scaling, auth policy, secret references, resource attachments, and expiry. A source or policy change requires a new plan and new approval.
4. **External approval.** The agent cannot approve its own plan. The approval proof is separate from the browser and is checked again at build/deploy time. For ONEVibe, the durable target is an OpenVTC/VTI Wallet receipt rather than a local boolean.
5. **Reference-only secrets.** The experiment passes Key Vault references and identity references, never secret values. Auth credentials remain broker/provider managed and must not enter prompts, task files, plans, logs, or browser payloads.
6. **Auth before invitation.** The exact lower-case email allowlist is deployed and verified before the broker sends an invitation. Health is the only unauthenticated path; the application gateway strips spoofable identity headers and injects only verified identity.
7. **Fail-closed data attachments.** Declaring a resource or secret is not network enforcement. The experiment rejects those deployments until host egress enforcement is explicitly configured. ONEVibe should retain that distinction and show it in the preview risk surface.
8. **Non-root image and locked dependencies.** The broker owns the Dockerfile, uses locked package installation, runs as a non-root user, and records the resulting image digest. Agent-authored Dockerfiles should not be accepted as deployment authority.
9. **Bounded observability.** Logs are redacted and tail-bounded; revisions are broker-recorded; there is no container shell. Long operations return a job ID and must be polled instead of blocking the MCP request.
10. **Brain/Azure separation.** The private agent brain is not mounted into the deployed app. Only a bounded, versioned projection crosses the boundary. The projection must contain the minimum approved context, never raw memory, credentials, or an unauthenticated tunnel.

## ONEVibe target architecture

ONEVibe should split the Manus-like product into two planes:

```text
                         external approval plane
                    VTI Wallet / OpenVTC receipt
                                  |
                                  v
ONEVibe UI  <->  ONEVibe API  <->  deployment broker  <->  Azure staging
     |             |               (host/service only)       |
     |             |                                         v
     |             +--> durable task/evidence chain     app gateway
     |                                                   (Entra/Access)
     v
ONEComputer sandbox
  Claude / OpenClaw / NanoClaw / Codex
  source, tests, preview, PPTX, browser evidence
```

The sandbox may author an app, run bounded validation, and produce a deployment proposal. It must not receive Azure credentials or a general deployment tool. The broker consumes a declared export and the external approval receipt. The web UI can render plan details and status but cannot forge approval or directly call the broker's privileged routes.

### Recommended deployment lifecycle

1. `create_deploy_intent`: bind the task, conversation, project, sandbox lease, actor, and requested environment.
2. `export_workspace`: produce a bounded source manifest and digest from the sandbox; exclude `.claude/`, `.onevibe-*`, inputs, evidence, and credentials.
3. `validate`: run manifest, dependency, health, auth, egress, and source-boundary checks.
4. `preview`: create an immutable plan and risk summary; record its digest in the task evidence chain.
5. `request_wallet_approval`: create an external approval request containing exact target, source digest, limits, expiry, and actor.
6. `await_wallet_receipt`: accept only a valid receipt bound to the plan digest and current lease generation.
7. `build`: broker builds the approved source into a non-root image and records the image digest.
8. `deploy_staging`: broker submits an idempotent job for the approved image digest only.
9. `poll_job`: stream queued/running/succeeded/failed transitions with safe retry and ambiguity handling.
10. `verify`: check health, revision, logs, browser behavior, auth boundary, and digest correspondence.
11. `publish_receipt`: attach URL, revision, source/image digests, verification results, approval receipt, and limitations to the same durable task.

## Deliberate differences from the experiment

The TTClaw broker is a strong reference, not a drop-in dependency:

- Its JSON state file and local CLI approval are suitable for a controlled POC, but ONEVibe needs transactional persistence, wallet signatures, replay-safe receipts, and multi-operator audit.
- Its fixed Azure Container Apps target is useful for staging web apps. ONEVibe's first sandbox target remains a conversation-scoped ONEComputer development sandbox; production acceptance still requires the attested microVM work in `ONE-226`.
- Its host-side `git clone` allowlist is appropriate for a separate deployment broker. ONEVibe should not let a sandbox clone arbitrary repositories or receive GitHub credentials; imports must remain server-side and policy-bound.
- Its `TT_DEPLOY_EGRESS_ENFORCED=1` switch is intentionally a fail-closed capability gate, not proof of a network policy. ONEVibe must preserve that distinction in both code and UX.
- Its `tt_app_auth_preflight` supports Entra Easy Auth and Cloudflare Access. ONEVibe should make external OpenVTC/VTI identity the north-star authorization layer while retaining enterprise integrations such as Entra/Intune/DLP as explicit adapters or future policy inputs.

## Linear work to add

Create a dedicated deployment-control-plane issue under the ONEVibe project with these acceptance gates:

- no Azure/registry credentials in the sandbox or browser;
- source export is bounded, digestible, and excludes runtime/evidence internals;
- validation and auth preflight are read-only and deterministic;
- preview is immutable, expires, and includes source/policy/target digests;
- external VTI Wallet approval is required and bound to the exact plan;
- build/deploy accepts only the approved source/image digest;
- asynchronous jobs are durable, idempotency-keyed, and observable;
- staging health/auth/browser verification attaches to one evidence chain;
- failed, expired, revoked, or ambiguous operations fail closed and leave no unowned deployment.

This work is downstream of the stable conversation/ONEComputer E2E spine but should be designed now so the UI does not grow a second, browser-authoritative deployment system.
