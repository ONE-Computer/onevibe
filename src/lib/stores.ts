import { create } from 'zustand'
import { fallbackSkillCatalog, normalizeSelectedSkillIds } from './api'
import type { AuthSessionState } from './auth'
import type { TaskSkill } from '../types'

export type AppView = 'agent' | 'schedules' | 'skills' | 'library' | 'computers' | 'appearance' | 'homepage'

export const viewFromLocation = (): AppView => {
  if (typeof window === 'undefined') return 'agent'
  const value = new URLSearchParams(window.location.search).get('view')
  return value === 'schedules' || value === 'skills' || value === 'library' || value === 'computers' || value === 'appearance' || value === 'homepage' ? value : 'agent'
}

const taskFromLocation = () => typeof window === 'undefined' ? null : window.location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1] ?? null

const initialSidebarOpen = () => {
  if (typeof window === 'undefined') return true
  const taskRoute = /^\/tasks\/[^/]+$/.test(window.location.pathname)
  return !window.matchMedia('(max-width: 1250px)').matches || !taskRoute
}

const initialSkills = (): TaskSkill[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem('onevibe.selected-skill-ids')
    return normalizeSelectedSkillIds(raw ? JSON.parse(raw) as unknown : [], fallbackSkillCatalog)
  } catch {
    return []
  }
}

const initialPreferredModel = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage.getItem('onevibe.selected-model') ?? undefined
  } catch {
    return undefined
  }
}

type UiStore = {
  view: AppView
  activeTaskId: string | null
  activeProjectId: string
  sidebarOpen: boolean
  mobileInspectorOpen: boolean
  notificationsOpen: boolean
  backendOffline: boolean
  retryingBackend: boolean
  setView: (view: AppView) => void
  setActiveTaskId: (taskId: string | null) => void
  setActiveProjectId: (projectId: string) => void
  setSidebarOpen: (open: boolean | ((current: boolean) => boolean)) => void
  setMobileInspectorOpen: (open: boolean) => void
  setNotificationsOpen: (open: boolean | ((current: boolean) => boolean)) => void
  setBackendOffline: (offline: boolean) => void
  setRetryingBackend: (retrying: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  view: viewFromLocation(), activeTaskId: taskFromLocation(), activeProjectId: 'project_onevibe',
  sidebarOpen: initialSidebarOpen(), mobileInspectorOpen: false, notificationsOpen: false,
  backendOffline: false, retryingBackend: false,
  setView: (view) => set({ view }), setActiveTaskId: (activeTaskId) => set({ activeTaskId }), setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  setSidebarOpen: (open) => set((state) => ({ sidebarOpen: typeof open === 'function' ? open(state.sidebarOpen) : open })),
  setMobileInspectorOpen: (mobileInspectorOpen) => set({ mobileInspectorOpen }),
  setNotificationsOpen: (open) => set((state) => ({ notificationsOpen: typeof open === 'function' ? open(state.notificationsOpen) : open })),
  setBackendOffline: (backendOffline) => set({ backendOffline }), setRetryingBackend: (retryingBackend) => set({ retryingBackend }),
}))

type ComposerStore = {
  selectedSkills: TaskSkill[]
  creating: boolean
  preferredModel?: string
  setSelectedSkills: (skills: TaskSkill[] | ((current: TaskSkill[]) => TaskSkill[])) => void
  setCreating: (creating: boolean) => void
  setPreferredModel: (model: string | undefined) => void
}

export const useComposerStore = create<ComposerStore>((set) => ({
  selectedSkills: initialSkills(), creating: false, preferredModel: initialPreferredModel(),
  setSelectedSkills: (skills) => set((state) => ({ selectedSkills: typeof skills === 'function' ? skills(state.selectedSkills) : skills })),
  setCreating: (creating) => set({ creating }),
  setPreferredModel: (model) => {
    try {
      if (model) window.localStorage.setItem('onevibe.selected-model', model)
      else window.localStorage.removeItem('onevibe.selected-model')
    } catch { /* localStorage may be unavailable; selection stays in memory */ }
    set({ preferredModel: model })
  },
}))

type SessionStore = {
  authState?: AuthSessionState
  authLoading: boolean
  setAuthState: (authState: AuthSessionState | undefined) => void
  setAuthLoading: (authLoading: boolean) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  authLoading: true,
  setAuthState: (authState) => set({ authState }), setAuthLoading: (authLoading) => set({ authLoading }),
}))
