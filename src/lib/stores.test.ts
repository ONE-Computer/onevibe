import { describe, expect, it } from 'vitest'
import { useComposerStore, useUiStore } from './stores.js'

describe('ONEVibe Zustand stores', () => {
  it('supports functional UI transitions without replacing server data ownership', () => {
    const ui = useUiStore.getState()
    ui.setSidebarOpen(false)
    ui.setSidebarOpen((current) => !current)
    ui.setActiveTaskId('task_store_test')
    expect(useUiStore.getState().sidebarOpen).toBe(true)
    expect(useUiStore.getState().activeTaskId).toBe('task_store_test')
  })

  it('persists composer state through the dedicated store', () => {
    useComposerStore.getState().setCreating(true)
    useComposerStore.getState().setSelectedSkills(['document'])
    expect(useComposerStore.getState().creating).toBe(true)
    expect(useComposerStore.getState().selectedSkills).toEqual(['document'])
    useComposerStore.getState().setCreating(false)
    useComposerStore.getState().setSelectedSkills([])
  })
})
