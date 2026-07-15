import { BarChart3, BookOpen, Check, FileText, Globe2, LayoutTemplate, Presentation, ShieldCheck, Sparkles, TestTube2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { TaskSkill } from '../types'

const skills: Array<{ id: TaskSkill; title: string; detail: string; icon: typeof Sparkles }> = [
  { id: 'research', title: 'Research', detail: 'Evidence, uncertainty, and source discipline', icon: BookOpen },
  { id: 'web_build', title: 'Web build', detail: 'Responsive, accessible product surfaces', icon: Globe2 },
  { id: 'slides', title: 'Slides', detail: 'Narrative decks and speaker notes', icon: Presentation },
  { id: 'data_analysis', title: 'Data analysis', detail: 'Decision story with stated limits', icon: BarChart3 },
  { id: 'document', title: 'Document', detail: 'Portable briefs and structured writing', icon: FileText },
  { id: 'product_design', title: 'Product design', detail: 'Interaction hierarchy and clear states', icon: LayoutTemplate },
  { id: 'security_review', title: 'Security review', detail: 'Untrusted input and governed actions', icon: ShieldCheck },
  { id: 'browser_testing', title: 'Browser testing', detail: 'Rendered-flow validation guidance', icon: TestTube2 },
]

type Props = { selected: TaskSkill[]; onToggle: (skill: TaskSkill) => void }

export const SkillsLibrary = ({ selected, onToggle }: Props) => <section className="skills-view">
  <header><div><span className="task-kicker">Explicit agent capability guides</span><h1>Skills</h1><p>Choose up to four working guides for new tasks. Skills shape the agent’s method and are captured in evidence; they do not grant tools, data access, or approval authority.</p></div><Sparkles size={28} /></header>
  <div className="skills-grid">{skills.map((skill) => { const Icon = skill.icon; const active = selected.includes(skill.id); return <motion.button layout key={skill.id} className={active ? 'active' : ''} onClick={() => onToggle(skill.id)}><Icon size={18} /><div><strong>{skill.title}</strong><span>{skill.detail}</span></div>{active && <Check size={16} />}</motion.button> })}</div>
  <p className="skills-footnote">{selected.length}/4 selected · selected guides apply to future tasks from the composer.</p>
</section>
