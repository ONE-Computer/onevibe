import { describe, expect, it } from 'vitest'
import { workspaceLocationForTab, workspaceTabFromSearch } from './workspace-navigation'

describe('workspace navigation', () => {
  it('restores only recognized workspace surfaces', () => {
    expect(workspaceTabFromSearch('?tab=computer')).toBe('computer')
    expect(workspaceTabFromSearch('?tab=untrusted')).toBe('preview')
  })

  it('preserves Computer evidence references but clears them for unrelated surfaces', () => {
    const href = 'http://localhost:5173/tasks/task-1?tab=computer&rail=screenshot&event=evt-1'
    expect(workspaceLocationForTab(href, 'computer')).toBe('/tasks/task-1?tab=computer&rail=screenshot&event=evt-1')
    expect(workspaceLocationForTab(href, 'preview')).toBe('/tasks/task-1?tab=preview')
  })
})
