# ONEVibe architecture

## Product intent

ONEVibe copies the high-leverage Manus interaction model—persistent tasks, visible plans, streaming work, code/files/preview, and portable artifacts—while making the security boundary explicit and delegating trust to ONEComputer and OpenVTC.

```text
Browser (task UX only)
  -> ONEVibe API / durable event timeline
      -> Runtime adapter
          -> Local demo runner OR provider-neutral AgentCore backend
      -> Workspace adapter
          -> Local confined directory OR ONEComputer sandbox API
      -> Policy adapter
          -> ONEComputer Rust gateway / policy service
      -> Approval adapter
          -> OpenVTC Trust Task -> separate VTI Wallet
      -> Evidence adapter
          -> local hash chain OR OpenVTC evidence service / SIEM
```

## Contract borrowed from the AgentCore harness

ONEVibe preserves the harness's provider-neutral run statuses, event lanes, and event types. A run has exactly one ordered event stream. Provider-native messages are retained in payload metadata where permitted, while the UI consumes normalized events such as `assistant_text_delta`, `tool_call_started`, `artifact_created`, and `approval_requested`.

## Security reuse from ONEComputer

Production adapters are intentionally external seams:

- sandbox lifecycle and desktop access from ONEComputer's sandbox service;
- outbound HTTP/tool enforcement from the real Rust gateway;
- strictest-wins organization/project/personal/runtime policy;
- broker-custodied short-lived credentials;
- OpenVTC Trust Tasks and external VTI Wallet proof;
- tamper-evident evidence export.

No sibling source tree is imported at runtime. This keeps the OSS repo buildable and forces explicit versioned contracts.

## Current vertical slice

The local slice proves the UX and contract:

1. create a task;
2. stream a generated five-step plan;
3. show activity/tool events;
4. write a small website into a confined workspace;
5. preview and inspect files;
6. request external approval for publication;
7. withhold publication and complete safely;
8. verify the event hash chain.

It does not claim VM isolation, egress enforcement, real wallet signatures, or cloud runtime execution.
