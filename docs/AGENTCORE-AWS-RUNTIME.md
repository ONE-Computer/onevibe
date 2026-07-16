# AgentCore AWS runtime study for ONEVibe

## Decision

ONEVibe may reuse the AgentCore harness's explicit Bedrock model/region configuration and its reliance on the standard AWS credential chain. It must not copy the harness's temporary cross-account Secrets Manager credentials into a retained sandbox environment, mount a host AWS profile, or assume AgentCore's execution-role injection exists in ONEComputer.

The production target is:

```text
host/cloud workload identity
  → ONEVibe credential broker outside the sandbox
  → STS AssumeRole with a Bedrock-only session policy
  → AWS container credential-provider endpoint
  → retained sandbox standard AWS credential chain
  → Claude Code / Agent SDK → Bedrock
```

## What the reference harness does

Deployment scripts create a `boto3.Session` from an explicit CLI profile or `AWS_PROFILE`, then call STS to verify the effective caller before building/deploying:

- `/Users/gini/Desktop/agentcore-claude-codex-runtime-harness/invgini-agentcore-runtimes/scripts-v2/build_and_push.py`
- `/Users/gini/Desktop/agentcore-claude-codex-runtime-harness/invgini-agentcore-runtimes/scripts-v2/deploy_runtime.py`

The normal AgentCore runtime receives temporary execution-role credentials from AgentCore. Claude inherits the standard AWS provider chain from its process environment; credentials are not arguments to `ClaudeAgentOptions`:

- `runtimes/claude-python/app/main.py`
- `runtimes/claude-python/app/session.py`
- `docs/AGENTCORE_SKILLS_ARCHITECTURE_20260712.md`

The optional cross-account workaround reads one Secrets Manager secret at process startup and writes its fields into `AWS_*` environment variables:

- `runtimes/claude-python/app/credential_bootstrap.py`
- `docs/CROSS_ACCOUNT_BEDROCK_SANDBOX.md`

That workaround does not refresh credentials and is unsuitable for retained ONEVibe sandboxes.

## Bedrock configuration worth reusing

The runtime separates the AgentCore control-plane region from the Bedrock model-serving region. Inside the runtime it sets:

- `CLAUDE_CODE_USE_BEDROCK=1`
- `AWS_REGION`
- `AWS_DEFAULT_REGION`
- an allowlisted Bedrock inference-profile/model ID
- Claude model selection variables

Claude Code also requires the minimum inference-profile discovery permissions in addition to invocation. A readiness check must perform a real signed request; cached SSO identity or a successful historical STS lookup is insufficient because refresh can still fail later.

## ONEVibe implementation contract

The sandbox launcher must start from an environment allowlist and remove inherited `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE`, `AWS_CONFIG_FILE`, and `AWS_SHARED_CREDENTIALS_FILE`. It must never mount `~/.aws`.

The sandbox receives only:

- `AWS_CONTAINER_CREDENTIALS_FULL_URI`
- `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE`
- `AWS_REGION`
- `AWS_DEFAULT_REGION`
- `CLAUDE_CODE_USE_BEDROCK=1`
- approved model/inference-profile configuration

The token file identifies one sandbox/lease generation; it contains no AWS credential, is read-only, mode `0400`, and is revoked when the lease is released or replaced.

The broker must authenticate that token, map it server-side to tenant/user/conversation/lease generation, assume only a Bedrock role with a restrictive session policy, return standard expiring container credentials, refresh before expiry, and reject sandbox-supplied role/account/region/model choices. Logs retain only safe metadata such as role alias, region, expiry, result category, and lease ID.

## Threat and failure gates

- Host `AWS_*` leakage can select the wrong account or widen authority.
- A mounted AWS directory exposes profiles and SSO caches to model-accessible tools.
- Static environment credentials in a retained sandbox both leak and expire without refresh.
- A shared unauthenticated broker lets one sandbox request another tenant's authority.
- Cached identity is not readiness; force a signed Bedrock request.
- Model entitlement, inference-profile, region, and signer-account mismatches must produce distinct sanitized errors.
- Retained sessions can outlive image/config changes; bind session continuity to lease ID and generation.

## POC boundary

The current Azure POC uses a scoped Anthropic-compatible relay token injected into the Claude process. That is sufficient to prove the conversation/sandbox/artifact spine, but not this production AWS credential design. Track short-lived secret injection under ONE-227 and implement the container-provider broker before production Bedrock promotion.

