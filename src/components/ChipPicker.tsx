import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import type { BoardStatus, TaskPriority } from '../types'
import { t, type Locale } from '../lib/i18n'
import { boardStatusLabelKey } from '../lib/board-metadata'

const BOARD_STATUSES: BoardStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'cancelled']
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low']

// Pickers render inside clickable board cards/rows: every click must stop
// propagation so the card's own onOpenTask never fires from a picker action.
const stop = (event: SyntheticEvent) => event.stopPropagation()

const useDismissOnOutsidePointer = (open: boolean, close: () => void) => {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])
  return ref
}

type StatusProps = { value: BoardStatus; onSelect: (status: BoardStatus) => void; locale: Locale }

export const StatusChipPicker = ({ value, onSelect, locale }: StatusProps) => {
  const [open, setOpen] = useState(false)
  const ref = useDismissOnOutsidePointer(open, () => setOpen(false))
  return (
    <span ref={ref} className="chip-picker" onClick={stop} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <button
        type="button"
        className="status-chip"
        data-status={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('setStatus', locale)}
        onClick={() => setOpen((current) => !current)}
      >
        <i aria-hidden="true" /> {t(boardStatusLabelKey[value], locale)} <ChevronDown size={9} />
      </button>
      {open && (
        <span className="chip-picker-menu" role="listbox" aria-label={t('setStatus', locale)}>
          {BOARD_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="option"
              aria-selected={status === value}
              className="chip-picker-option"
              onClick={() => { onSelect(status); setOpen(false) }}
            >
              <i data-status={status} aria-hidden="true" /> {t(boardStatusLabelKey[status], locale)}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

type PriorityProps = { value: TaskPriority | null; onSelect: (priority: TaskPriority | null) => void; locale: Locale }

export const PriorityChipPicker = ({ value, onSelect, locale }: PriorityProps) => {
  const [open, setOpen] = useState(false)
  const ref = useDismissOnOutsidePointer(open, () => setOpen(false))
  return (
    <span ref={ref} className="chip-picker" onClick={stop} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <button
        type="button"
        className={`priority-chip${value ? '' : ' priority-chip-none'}`}
        data-priority={value ?? undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('setPriority', locale)}
        onClick={() => setOpen((current) => !current)}
      >
        {value ?? t('noPriority', locale)} <ChevronDown size={9} />
      </button>
      {open && (
        <span className="chip-picker-menu" role="listbox" aria-label={t('setPriority', locale)}>
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className="chip-picker-option"
            onClick={() => { onSelect(null); setOpen(false) }}
          >
            {t('noPriority', locale)}
          </button>
          {PRIORITIES.map((priority) => (
            <button
              key={priority}
              type="button"
              role="option"
              aria-selected={priority === value}
              className="chip-picker-option"
              onClick={() => { onSelect(priority); setOpen(false) }}
            >
              {priority}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
