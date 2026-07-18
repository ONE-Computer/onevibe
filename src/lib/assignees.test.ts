import { describe, expect, it } from 'vitest'
import { activeAgentRuns, distinctActiveRuns, distinctAgents, elapsedSeconds, formatAssignees, formatElapsed, HUMAN_ASSIGNEE, matchesAgentFilter, matchesRunFilter, parseAssignees, toggleAssignee } from './assignees'

describe('parseAssignees', () => {
  it('returns an empty list for missing or blank values', () => {
    expect(parseAssignees(undefined)).toEqual([])
    expect(parseAssignees(null)).toEqual([])
    expect(parseAssignees('')).toEqual([])
  })

  it('splits comma-separated ids, trims whitespace, and dedupes', () => {
    expect(parseAssignees('codex, human ,codex')).toEqual(['codex', 'human'])
  })
})

describe('formatAssignees', () => {
  it('returns undefined for an empty selection so the field can be cleared', () => {
    expect(formatAssignees([])).toBeUndefined()
    expect(formatAssignees(['', '  '])).toBeUndefined()
  })

  it('joins unique ids in order, covering the agent+human "both" case', () => {
    expect(formatAssignees(['codex', HUMAN_ASSIGNEE, 'codex'])).toBe('codex,human')
  })
})

describe('toggleAssignee', () => {
  it('adds a missing assignee and removes an existing one', () => {
    expect(toggleAssignee('codex', HUMAN_ASSIGNEE)).toBe('codex,human')
    expect(toggleAssignee('codex,human', HUMAN_ASSIGNEE)).toBe('codex')
  })

  it('returns undefined when the last assignee is removed', () => {
    expect(toggleAssignee('codex', 'codex')).toBeUndefined()
  })
})

describe('board filter predicates', () => {
  it('matches any assignee including human, with "all" passing everything', () => {
    expect(matchesAgentFilter({ assignedAgent: 'codex,human' }, 'codex')).toBe(true)
    expect(matchesAgentFilter({ assignedAgent: 'codex,human' }, HUMAN_ASSIGNEE)).toBe(true)
    expect(matchesAgentFilter({ assignedAgent: 'codex' }, 'kimi')).toBe(false)
    expect(matchesAgentFilter({ assignedAgent: undefined }, 'all')).toBe(true)
  })

  it('collects distinct agent runtimes excluding the human assignee', () => {
    const tasks = [{ assignedAgent: 'codex,human' }, { assignedAgent: 'kimi' }, { assignedAgent: undefined }, { assignedAgent: 'codex' }]
    expect(distinctAgents(tasks)).toEqual(['codex', 'kimi'])
  })

  it('matches exact run ids and collects distinct active sessions', () => {
    expect(matchesRunFilter({ activeRunId: 'run_abc' }, 'run_abc')).toBe(true)
    expect(matchesRunFilter({ activeRunId: 'run_abc' }, 'run_other')).toBe(false)
    expect(matchesRunFilter({ activeRunId: undefined }, 'all')).toBe(true)
    expect(distinctActiveRuns([{ activeRunId: 'run_b' }, { activeRunId: 'run_a' }, { activeRunId: undefined }, { activeRunId: 'run_b' }])).toEqual(['run_a', 'run_b'])
  })
})

describe('activeAgentRuns', () => {
  const base = { id: 'task_1', title: 'Build report', updatedAt: '2026-07-18T09:00:00.000Z' }

  it('lists running tasks with an agent assignee, oldest run first', () => {
    const tasks = [
      { ...base, id: 'task_new', status: 'running' as const, assignedAgent: 'codex', updatedAt: '2026-07-18T09:05:00.000Z' },
      { ...base, id: 'task_old', status: 'running' as const, assignedAgent: 'kimi,human', updatedAt: '2026-07-18T09:01:00.000Z' },
    ]
    const runs = activeAgentRuns(tasks)
    expect(runs.map((run) => run.taskId)).toEqual(['task_old', 'task_new'])
    expect(runs[0]).toMatchObject({ title: 'Build report', agents: ['kimi'], startedAt: '2026-07-18T09:01:00.000Z' })
  })

  it('excludes settled, unassigned, and human-only tasks', () => {
    const tasks = [
      { ...base, status: 'completed' as const, assignedAgent: 'codex' },
      { ...base, status: 'running' as const, assignedAgent: undefined },
      { ...base, status: 'running' as const, assignedAgent: HUMAN_ASSIGNEE },
    ]
    expect(activeAgentRuns(tasks)).toEqual([])
  })
})

describe('elapsed time', () => {
  it('computes whole seconds clamped at zero and tolerates invalid dates', () => {
    const now = Date.parse('2026-07-18T09:10:42.000Z')
    expect(elapsedSeconds('2026-07-18T09:00:00.000Z', now)).toBe(642)
    expect(elapsedSeconds('2026-07-18T09:20:00.000Z', now)).toBe(0)
    expect(elapsedSeconds('not-a-date', now)).toBe(0)
  })

  it('formats seconds, minutes, and hours', () => {
    expect(formatElapsed(42)).toBe('42s')
    expect(formatElapsed(185)).toBe('3m 05s')
    expect(formatElapsed(3725)).toBe('1h 02m')
    expect(formatElapsed(-5)).toBe('0s')
  })
})
