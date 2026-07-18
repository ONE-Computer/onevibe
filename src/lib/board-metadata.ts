import type { BoardStatus, RunStatus } from '../types'
import type { I18nKey } from './i18n'

// BoardStatus is user-managed metadata; when unset the column derives from the
// runtime-owned RunStatus. Active states stay in in_progress so a task never
// falls back to todo while work is underway.
export const boardStatusFor = (runStatus: RunStatus, boardStatus: BoardStatus | undefined): BoardStatus => {
  if (boardStatus) return boardStatus
  switch (runStatus) {
    case 'running':
    case 'waiting_for_approval':
    case 'waiting_for_user_input': return 'in_progress'
    case 'completed': return 'done'
    case 'failed': return 'blocked'
    case 'cancelled': return 'cancelled'
    default: return 'todo'
  }
}

export const boardStatusLabelKey: Record<BoardStatus, I18nKey> = {
  todo: 'boardTodo',
  in_progress: 'boardInProgress',
  done: 'boardDone',
  blocked: 'boardBlocked',
  cancelled: 'boardCancelled',
}
