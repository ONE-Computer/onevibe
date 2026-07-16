import { describe, expect, it } from 'vitest'
import { formatIssueTable, parseArgs, priorityName } from './linear-cli.js'

describe('linear helper CLI', () => {
  it('parses positional commands and value/boolean flags', () => {
    expect(parseArgs(['node', 'linear-cli.ts', 'issues', '--project', 'project-id', '--json'])).toEqual({
      command: 'issues', positionals: [], flags: { project: 'project-id', json: true },
    })
  })

  it('keeps issue output compact and readable', () => {
    expect(priorityName(1)).toBe('Urgent')
    expect(formatIssueTable([{ identifier: 'ONE-223', title: 'UX', priority: 3, state: { name: 'In Progress' }, url: 'https://linear.app/onecomputer/issue/ONE-223' }])).toContain('ONE-223\tIn Progress\tMedium\tUX')
  })
})
