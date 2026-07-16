import { BarChart3, BookOpen, Check, FileText, Globe2, LayoutTemplate, Presentation, ShieldCheck, Sparkles, TestTube2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { fallbackSkillCatalog, type SkillOption } from '../lib/api'
import type { TaskSkill } from '../types'

const icons: Record<TaskSkill, typeof Sparkles> = {
  research: BookOpen,
  web_build: Globe2,
  slides: Presentation,
  data_analysis: BarChart3,
  document: FileText,
  product_design: LayoutTemplate,
  security_review: ShieldCheck,
  browser_testing: TestTube2,
}

type Props = { catalog?: readonly SkillOption[]; selected: TaskSkill[]; onToggle: (skill: TaskSkill) => void }

export const SkillsLibrary = ({ catalog = fallbackSkillCatalog, selected, onToggle }: Props) => <section className="skills-view">
  <header><div><span className="task-kicker">Explicit agent capability guides</span><h1>Skills</h1><p>Choose up to four working guides for new tasks. Skills shape the agent’s method and are captured in evidence; they do not grant tools, data access, or approval authority.</p></div><Sparkles size={28} /></header>
  <div className="skills-grid">{catalog.map((skill) => { const Icon = icons[skill.id] ?? Sparkles; const active = selected.includes(skill.id); return <motion.button layout key={skill.id} className={active ? 'active' : ''} onClick={() => onToggle(skill.id)}><Icon size={18} /><div><strong>{skill.title}</strong><span>{skill.summary}</span></div>{active && <Check size={16} />}</motion.button> })}</div>
  <p className="skills-footnote">{selected.length}/4 selected · selected guides apply to future tasks from the composer.</p>
</section>
