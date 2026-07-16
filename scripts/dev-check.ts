import { readFileSync } from 'node:fs'

const fromDotEnv = () => {
  try {
    return Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
      return match ? [[match[1]!, match[2]!.replace(/^['"]|['"]$/g, '')]] : []
    }))
  } catch {
    return {}
  }
}

const env = { ...fromDotEnv(), ...process.env }
const hasLiteLLM = Boolean(env.ONEVIBE_LITELLM_URL && env.ONEVIBE_LITELLM_API_KEY)
const hasOneComputer = Boolean(env.ONECOMPUTER_API_URL && env.ONECOMPUTER_SERVICE_TOKEN)
const hasRemote = Boolean(env.ONEVIBE_RUNTIME_URL)

if (!hasLiteLLM && !hasOneComputer && !hasRemote) {
  console.warn('[ONEVibe] No governed runtime configured.')
  console.warn('[ONEVibe] Set ONEVIBE_LITELLM_URL and ONEVIBE_LITELLM_API_KEY for the default local path.')
  console.warn('[ONEVibe] The app will remain available for explicitly labelled simulation mode only.')
} else {
  const routes = [hasLiteLLM && 'LiteLLM', hasOneComputer && 'ONEComputer', hasRemote && 'remote'].filter(Boolean).join(', ')
  console.log(`[ONEVibe] Governed runtime configuration detected: ${routes}`)
}
