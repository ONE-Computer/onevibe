import { Bot, Brain, CheckCircle2, Code2, FileSearch, Globe, Mail, Table2, XCircle, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import type { RuntimeMcpConfig, RuntimeProviderState } from '../types'
import type { SkillOption } from '../lib/api'

const AGENT_SKILLS = [
  { id: 'web_research', icon: Globe, label: 'Web research', description: 'Search the web, read pages, and synthesise findings into a report.' },
  { id: 'code_review', icon: Code2, label: 'Code review', description: 'Analyse a codebase, find bugs, and suggest improvements.' },
  { id: 'document_summarizer', icon: FileSearch, label: 'Document summarizer', description: 'Extract key points from long documents, PDFs, or meeting notes.' },
  { id: 'data_analysis', icon: Table2, label: 'Data analysis', description: 'Explore a dataset, generate charts, and surface insights.' },
  { id: 'email_drafting', icon: Mail, label: 'Email drafting', description: 'Draft professional emails from a brief or thread context.' },
]

const PROVIDER_LABELS: Partial<Record<string, string>> = {
  demo: 'Demo sandbox',
  claude_sdk: 'Claude Agent SDK',
  codex: 'Codex runtime',
  agentcore: 'AWS AgentCore',
  onecomputer: 'ONEComputer sandbox',
  remote: 'Remote runtime',
  a2a: 'A2A Agent',
  kimi: 'Kimi Code',
}

type Props = {
  providers: RuntimeProviderState[]
  mcpConfigs: RuntimeMcpConfig[]
  catalog: SkillOption[]
}

export const Capabilities = ({ providers, mcpConfigs, catalog }: Props) => {
  const installedSkills = catalog.filter((s) => s.source === 'builtin' || s.installed)

  return <section className="capabilities-view">
    <header>
      <div>
        <span className="task-kicker">What the agent can do</span>
        <h1>Capabilities</h1>
        <p>Connected runtimes, tools, and the skills available for your agent to use.</p>
      </div>
      <Zap size={28} />
    </header>

    <div className="capabilities-section">
      <h2><Bot size={16} /> Runtimes</h2>
      <p className="capabilities-section-desc">Agent execution environments available for tasks.</p>
      <div className="capabilities-grid">
        {providers.map((p) => <motion.article layout key={p.id} className={`capability-card ${p.available ? 'available' : 'unavailable'}`}>
          <div className="capability-card-header">
            {p.available
              ? <CheckCircle2 size={15} className="capability-status-ok" />
              : <XCircle size={15} className="capability-status-err" />}
            <strong>{PROVIDER_LABELS[p.id] ?? p.label}</strong>
          </div>
          <p className="capability-card-desc">{p.detail || p.boundary}</p>
          {p.capabilities.length > 0 && <div className="capability-tags">
            {p.capabilities.slice(0, 4).map((c) => <span key={c}>{c}</span>)}
          </div>}
        </motion.article>)}
        {providers.length === 0 && <p className="capabilities-empty">No runtimes configured.</p>}
      </div>
    </div>

    {mcpConfigs.length > 0 && <div className="capabilities-section">
      <h2><Globe size={16} /> MCP tools</h2>
      <p className="capabilities-section-desc">External tool servers connected to the agent.</p>
      <div className="capabilities-grid">
        {mcpConfigs.map((cfg) => <motion.article layout key={cfg.id} className="capability-card available">
          <div className="capability-card-header">
            <CheckCircle2 size={15} className="capability-status-ok" />
            <strong>{cfg.name}</strong>
          </div>
          <p className="capability-card-desc">{cfg.command} {cfg.args.join(' ')}</p>
        </motion.article>)}
      </div>
    </div>}

    <div className="capabilities-section">
      <h2><Brain size={16} /> Agent skills</h2>
      <p className="capabilities-section-desc">Workflow templates that guide the agent through common tasks.</p>
      <div className="capabilities-grid">
        {AGENT_SKILLS.map(({ id, icon: Icon, label, description }) => {
          const installed = installedSkills.find((s) => s.id === id)
          return <motion.article layout key={id} className="capability-card available">
            <div className="capability-card-header">
              <Icon size={15} />
              <strong>{installed?.title ?? label}</strong>
            </div>
            <p className="capability-card-desc">{installed?.summary ?? description}</p>
            <div className="capability-card-footer">
              <button className="capability-run-btn" disabled aria-label={`Run ${label} (coming soon)`}>Run</button>
            </div>
          </motion.article>
        })}
      </div>
    </div>
  </section>
}
