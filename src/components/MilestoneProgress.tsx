import { useMemo, useState } from 'react'
import { Check, ChevronDown, Circle, LoaderCircle } from 'lucide-react'
import { t, type I18nKey, type Locale } from '../lib/i18n'
import { milestonesFor, type MilestoneView } from '../lib/milestones'
import type { RuntimeEvent } from '../types'

const PHASE_LABEL_KEYS: Record<string, I18nKey> = {
  understand: 'milestoneUnderstand',
  gather: 'milestoneGather',
  draft: 'milestoneDraft',
  finalize: 'milestoneFinalize',
}

const milestoneLabel = (milestone: MilestoneView, locale: Locale) => {
  const key = PHASE_LABEL_KEYS[milestone.id]
  return key ? t(key, locale) : milestone.label
}

const MilestoneIcon = ({ status }: { status: MilestoneView['status'] }) => {
  if (status === 'done') return <Check size={12} />
  if (status === 'active') return <LoaderCircle className="spin" size={12} />
  return <Circle size={10} />
}

// Task milestone strip at the top of the side panel (P9-26). Milestones come
// from an explicit milestone_set when the runtime publishes one, otherwise
// they are derived from the run's event stream. Collapses like the tool
// group: grid-template-rows, content inert while closed, motion only when the
// user allows it.
export const MilestoneProgress = ({ events, locale = 'en' }: { events: readonly RuntimeEvent[]; locale?: Locale }) => {
  const milestones = useMemo(() => milestonesFor(events), [events])
  const [open, setOpen] = useState(true)
  if (milestones.length === 0) return null
  const done = milestones.filter((milestone) => milestone.status === 'done').length
  return (
    <section className={`milestone-progress${open ? ' open' : ''}`} aria-label={t('taskProgress', locale)}>
      <button type="button" className="milestone-progress-header" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>{t('taskProgress', locale)}</span>
        <em>{done} / {milestones.length}</em>
        <ChevronDown size={12} />
      </button>
      <div className="milestone-progress-window">
        <div className="milestone-progress-window-inner" inert={!open || undefined}>
          <ol className="milestone-progress-list">
            {milestones.map((milestone) => (
              <li key={milestone.id} className={milestone.status}>
                <span className="milestone-progress-icon" aria-hidden="true"><MilestoneIcon status={milestone.status} /></span>
                <span className="milestone-progress-label">{milestoneLabel(milestone, locale)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
