import { RemoteRuntimeAdapter } from './remote-runner.js'

/**
 * AgentCore's model/runtime boundary is remote. The endpoint must be deployed
 * with LiteLLM routing enabled; ONEVibe never supplies AWS or first-party
 * model credentials to this adapter.
 */
export class AgentCoreRuntimeAdapter extends RemoteRuntimeAdapter {
  constructor(endpoint: string, bearerToken?: string) {
    super(endpoint, bearerToken, 'agentcore', 'agentcore')
  }
}
