export const workspaceTabs = ['dashboard', 'computer', 'observe', 'preview', 'visual', 'slides', 'design', 'database', 'assets', 'code', 'files', 'history', 'evidence', 'handoff', 'settings'] as const
export type WorkspaceTab = typeof workspaceTabs[number]

export const workspaceTabFromSearch = (search: string): WorkspaceTab => {
  const value = new URLSearchParams(search).get('tab')
  return workspaceTabs.includes(value as WorkspaceTab) ? value as WorkspaceTab : 'preview'
}

/** Keep the task route stable while selecting a review surface. */
export const workspaceLocationForTab = (href: string, tab: WorkspaceTab) => {
  const url = new URL(href)
  url.searchParams.set('tab', tab)
  if (tab !== 'computer') {
    url.searchParams.delete('event')
    url.searchParams.delete('rail')
  }
  return `${url.pathname}${url.search}${url.hash}`
}
