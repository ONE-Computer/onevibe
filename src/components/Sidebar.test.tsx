import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { Sidebar } from './Sidebar'
import { ThemeContext, type ThemeContextValue } from '../lib/theme'
import type { ConversationSummary } from '../types'

const themeContext: ThemeContextValue = {
  config: null,
  source: 'base',
  customized: false,
  isLoading: false,
  error: null,
  refresh: async () => undefined,
}

const conversation = (overrides: Partial<ConversationSummary>): ConversationSummary => ({
  id: 'task_plain',
  title: 'Plain task',
  status: 'completed',
  provider: 'demo',
  mode: 'chat',
  projectId: 'project_default',
  messageCount: 0,
  createdAt: '2026-07-18T09:00:00.000Z',
  updatedAt: '2026-07-18T09:00:00.000Z',
  ...overrides,
})

const epicConversations: ConversationSummary[] = [
  conversation({ id: 'task_sso', title: 'Wire up SSO login', epicId: 'epic_platform', epicLabel: 'Platform', updatedAt: '2026-07-18T09:03:00.000Z' }),
  conversation({ id: 'task_export', title: 'Export usage CSV', epicId: 'epic_growth', epicLabel: 'Growth', updatedAt: '2026-07-18T09:02:00.000Z' }),
  conversation({ id: 'task_plain', title: 'Fix sidebar scroll', updatedAt: '2026-07-18T09:01:00.000Z' }),
]

const baseProps: ComponentProps<typeof Sidebar> = {
  view: 'agent',
  conversations: epicConversations,
  activeTaskId: null,
  onNewTask: () => {},
  onClose: () => {},
  onSelectTask: () => {},
  hasMoreConversations: false,
  loadingMoreConversations: false,
  onLoadMoreConversations: async () => {},
  projects: [],
  activeProjectId: '',
  onSelectProject: () => {},
  onCreateProject: async () => {},
  onAttachProjectFile: async () => {},
  onRemoveProjectFile: async () => {},
  onUpdateProjectFile: async () => {},
  onRestoreProjectFile: async () => ({ content: '', contentHash: '' }),
  onUpdateProjectContext: async () => {},
  onOpenSkills: () => {},
  onOpenLibrary: () => {},
  onOpenSchedules: () => {},
  onOpenComputers: () => {},
  onOpenBoard: () => {},
  onOpenAppearance: () => {},
  onOpenHomepage: () => {},
  onOpenArtefacts: () => {},
  onOpenCapabilities: () => {},
  skillCount: 0,
  onSignOut: async () => {},
}

const renderSidebar = (props: Partial<ComponentProps<typeof Sidebar>> = {}) =>
  renderToStaticMarkup(<ThemeContext.Provider value={themeContext}><Sidebar {...baseProps} {...props} /></ThemeContext.Provider>)

describe('Sidebar epic breadcrumbs (P12-04)', () => {
  it('renders the epic breadcrumb chip above the task title for epic tasks only', () => {
    const html = renderSidebar()
    expect(html.match(/epic-chip/g)?.length).toBe(2)
    const chipAt = html.indexOf('epic-chip')
    expect(chipAt).toBeGreaterThan(-1)
    expect(chipAt).toBeLessThan(html.indexOf('Wire up SSO login'))
    const plainRowAt = html.indexOf('Fix sidebar scroll')
    expect(html.lastIndexOf('epic-chip')).toBeLessThan(plainRowAt)
  })

  it('renders epic filter pills with All epics as the default selection', () => {
    const html = renderSidebar()
    expect(html).toContain('epic-filter-row')
    expect(html).toContain('All epics')
    expect(html).toContain('epic-filter-pill active')
    expect(html).toContain('Platform')
    expect(html).toContain('Growth')
  })

  it('hides the epic filter row when no conversation has an epic', () => {
    const html = renderSidebar({ conversations: [conversation({})] })
    expect(html).not.toContain('epic-filter-row')
    expect(html).not.toContain('epic-chip')
  })
})
