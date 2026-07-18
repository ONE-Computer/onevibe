import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X } from 'lucide-react'
import { t, type Locale } from '../lib/i18n'
import { useSidePanelStore } from '../lib/stores'

// Contextual right panel. It stays width-collapsed until a thinking block
// publishes its reasoning trace, then slides open next to the conversation.
export const SidePanel = ({ locale = 'en' }: { locale?: Locale }) => {
  const content = useSidePanelStore((state) => state.content)
  const closePanel = useSidePanelStore((state) => state.closePanel)
  const open = content !== null
  return (
    <aside className={`side-panel${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="side-panel-inner" inert={!open || undefined}>
        <header className="side-panel-header">
          <strong>{t('reasoningTrace', locale)}</strong>
          <button type="button" className="icon-button" aria-label={t('closePanel', locale)} title={t('closePanel', locale)} onClick={closePanel}><X size={14} /></button>
        </header>
        <div className="side-panel-body">
          {content && <div className="aui-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content.text}</ReactMarkdown></div>}
        </div>
      </div>
    </aside>
  )
}
