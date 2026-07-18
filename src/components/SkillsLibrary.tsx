import { BarChart3, BookOpen, Check, FileText, Globe2, LayoutTemplate, Presentation, ShieldCheck, Sparkles, TestTube2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { fallbackSkillCatalog, type SkillOption } from '../lib/api'
import type { BuiltInTaskSkill, TaskSkill } from '../types'

const icons: Partial<Record<BuiltInTaskSkill, typeof Sparkles>> = {
  research: BookOpen,
  web_build: Globe2,
  slides: Presentation,
  data_analysis: BarChart3,
  document: FileText,
  product_design: LayoutTemplate,
  security_review: ShieldCheck,
  browser_testing: TestTube2,
}

type Props = { catalog?: readonly SkillOption[]; selected: TaskSkill[]; onToggle: (skill: TaskSkill) => void; onInstall?: (skill: TaskSkill) => Promise<void>; onRemove?: (skill: TaskSkill) => Promise<void> }

export const SkillsLibrary = ({ catalog = fallbackSkillCatalog, selected, onToggle, onInstall, onRemove }: Props) => <section className="skills-view">
  <header><div><span className="view-eyebrow">Capability guides</span><h1>Skills</h1><p>Choose up to four working guides for new tasks. Skills shape the agent’s method and are captured in evidence; they do not grant tools, data access, or approval authority.</p></div><Sparkles size={28} /></header>
  <div className="skills-grid">{catalog.map((skill) => { const Icon = icons[skill.id as BuiltInTaskSkill] ?? Sparkles; const active = selected.includes(skill.id); const available = skill.source === 'builtin' || skill.installed; const locked = available && !active && selected.length >= 4; return <motion.article layout key={skill.id} className={active ? 'active' : ''}><button className="skill-select" type="button" onClick={() => onToggle(skill.id)} disabled={!available || locked} title={!available ? 'Install this marketplace guide before selecting it' : locked ? 'Remove a selected guide before adding another' : undefined}><Icon size={18} /><div><strong>{skill.title}</strong><span>{skill.summary}</span></div>{active && <Check size={16} />}</button><footer><span>{skill.source === 'marketplace' ? (skill.installed ? 'Installed from GitHub' : 'Marketplace') : 'Built in'}</span>{skill.source === 'marketplace' && (skill.installed ? <button type="button" className="skill-install-button" onClick={() => void onRemove?.(skill.id)}>Remove</button> : <button type="button" className="skill-install-button" onClick={() => void onInstall?.(skill.id)}>Install</button>)}</footer></motion.article> })}</div>
  <p className="skills-footnote">{selected.length}/4 selected · selected guides apply to future tasks from the composer.</p>
</section>
