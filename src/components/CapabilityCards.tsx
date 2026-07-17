import { Hammer, Search, Zap } from 'lucide-react'
import { t, type I18nKey, type Locale } from '../lib/i18n'

type Capability = { icon: typeof Search; titleKey: I18nKey; descKey: I18nKey; promptKey: I18nKey }

const capabilities: Capability[] = [
  { icon: Search, titleKey: 'capResearchTitle', descKey: 'capResearchDesc', promptKey: 'capResearchPrompt' },
  { icon: Hammer, titleKey: 'capBuildTitle', descKey: 'capBuildDesc', promptKey: 'capBuildPrompt' },
  { icon: Zap, titleKey: 'capAutomateTitle', descKey: 'capAutomateDesc', promptKey: 'capAutomatePrompt' },
]

type Props = { locale?: Locale; onStart: (prompt: string) => void }

export const CapabilityCards = ({ locale = 'en', onStart }: Props) => <div className="capability-cards">{capabilities.map((capability) => { const Icon = capability.icon; return <button key={capability.titleKey} type="button" className="capability-card" onClick={() => onStart(t(capability.promptKey, locale))}><span className="capability-card-icon"><Icon size={16} /></span><strong>{t(capability.titleKey, locale)}</strong><small>{t(capability.descKey, locale)}</small></button> })}</div>
