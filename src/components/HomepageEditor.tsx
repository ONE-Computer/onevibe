import { AlertTriangle, Check, FileEdit, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, getTenantTheme, putTenantTheme, resetTenantTheme } from '../lib/api'
import type { TenantThemeConfig, TenantThemeSummary } from '../types'

type Props = { summaries: TenantThemeSummary[]; persistent: boolean; onChanged: () => void }
type HomePageConfig = NonNullable<TenantThemeConfig['homePage']>
type FeatureCard = NonNullable<NonNullable<TenantThemeConfig['homePage']>['featureCards']>[number]
type FeatureField = 'title' | 'description'

const emptyHome: HomePageConfig = { announcementBannerVisible: false, featureCards: [] }

const configForEditor = (config: TenantThemeConfig): TenantThemeConfig => ({
  ...config,
  homePage: {
    ...emptyHome,
    ...config.homePage,
    featureCards: [...(config.homePage?.featureCards ?? [])],
  },
})

const unavailable = (message: string) => <section className="homepage-editor-view"><header><div><span className="task-kicker">Owner controls</span><h1>Homepage</h1><p>{message}</p></div><FileEdit size={28} /></header><div className="homepage-editor-empty"><ShieldCheck size={20} /><strong>Owner-scoped theme store not configured</strong><span>Configure Postgres and an organization-owner session before editing tenant content.</span></div></section>

export const HomepageEditor = ({ summaries, persistent, onChanged }: Props) => {
  const [selectedTenantId, setSelectedTenantId] = useState(summaries[0]?.tenantId ?? '')
  const detail = useQuery({ queryKey: ['theme', 'detail', selectedTenantId], queryFn: () => getTenantTheme(selectedTenantId), enabled: Boolean(selectedTenantId), retry: false })
  const [draft, setDraft] = useState<TenantThemeConfig>()
  const [savedVersion, setSavedVersion] = useState(0)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (detail.data) {
      setDraft(configForEditor(detail.data.config))
      setSavedVersion(detail.data.version ?? 0)
      setNotice(undefined)
      setError(undefined)
    }
  }, [detail.data])

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Homepage configuration is not loaded')
      return putTenantTheme(draft.tenantId, savedVersion, draft)
    },
    onSuccess: (result) => {
      setDraft(configForEditor(result.config))
      setSavedVersion(result.version ?? savedVersion + 1)
      setNotice('Homepage content saved to the owner-scoped theme store.')
      setError(undefined)
      onChanged()
    },
    onError: (reason) => setError(reason instanceof ApiError && reason.status === 409 ? 'This theme changed elsewhere. Reload it before saving.' : reason instanceof Error ? reason.message : 'Unable to save homepage content.'),
  })

  const reset = useMutation({
    mutationFn: () => resetTenantTheme(selectedTenantId, savedVersion),
    onSuccess: (result) => {
      setDraft(configForEditor(result.config))
      setSavedVersion(result.version ?? savedVersion + 1)
      setNotice('Homepage content reset to the base presentation.')
      setError(undefined)
      onChanged()
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'Unable to reset homepage content.'),
  })

  const updateHome = (patch: Partial<NonNullable<TenantThemeConfig['homePage']>>) => setDraft((current) => current ? { ...current, homePage: { ...emptyHome, ...current.homePage, ...patch } } : current)
  const updateCard = (index: number, field: FeatureField, value: string) => setDraft((current) => {
    if (!current) return current
    const cards = [...(current.homePage?.featureCards ?? [])]
    const card = cards[index]
    if (!card) return current
    cards[index] = { ...card, [field]: value }
    return { ...current, homePage: { ...emptyHome, ...current.homePage, featureCards: cards } }
  })
  const updateCardAccent = (index: number, accent: FeatureCard['accent']) => setDraft((current) => {
    if (!current) return current
    const cards = [...(current.homePage?.featureCards ?? [])]
    const card = cards[index]
    if (!card) return current
    cards[index] = { ...card, accent }
    return { ...current, homePage: { ...emptyHome, ...current.homePage, featureCards: cards } }
  })
  const addCard = () => setDraft((current) => {
    if (!current) return current
    const cards = [...(current.homePage?.featureCards ?? [])]
    if (cards.length >= 6) return current
    cards.push({ title: 'New capability', description: 'Describe what this workspace helps your team do.', accent: 'brand' })
    return { ...current, homePage: { ...emptyHome, ...current.homePage, featureCards: cards } }
  })
  const removeCard = (index: number) => setDraft((current) => current ? { ...current, homePage: { ...emptyHome, ...current.homePage, featureCards: (current.homePage?.featureCards ?? []).filter((_, cardIndex) => cardIndex !== index) } } : current)

  if (!persistent || summaries.length === 0) return unavailable('No persisted tenant theme is available in this local workspace. Homepage mutations require the Postgres-backed, authenticated organization-owner boundary; this screen never simulates a save.')
  if (detail.error) return unavailable(`The server did not authorize or return the selected tenant homepage. ${detail.error instanceof Error ? detail.error.message : 'No local draft was created.'}`)
  if (detail.isLoading || !draft) return <section className="homepage-editor-view"><header><div><span className="task-kicker">Owner controls</span><h1>Homepage</h1><p>Loading the server-authoritative homepage configuration…</p></div><FileEdit size={28} /></header></section>

  const home = draft.homePage ?? emptyHome
  const cards = home.featureCards ?? []
  return <section className="homepage-editor-view"><header><div><span className="task-kicker">Owner controls · typed content only</span><h1>Homepage</h1><p>Edit bounded hero copy, announcements, and feature cards. Arbitrary HTML, scripts, iframes, and untrusted icon names are not part of this surface.</p></div><FileEdit size={28} /></header><div className="homepage-editor-toolbar"><label>Tenant<select value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)}>{summaries.map((summary) => <option key={summary.tenantId} value={summary.tenantId}>{summary.tenantId} · v{summary.version}</option>)}</select></label><span>Version {savedVersion}</span></div><form className="homepage-editor-form" onSubmit={(event) => { event.preventDefault(); setNotice(undefined); save.mutate() }}><section><h2>Hero</h2><label>Headline<input value={home.heroHeadline ?? ''} maxLength={180} placeholder="Leave blank to use the default greeting" onChange={(event) => updateHome({ heroHeadline: event.target.value || undefined })} /></label><label>Subheadline<textarea value={home.heroSubheadline ?? ''} maxLength={600} rows={3} placeholder="A short, bounded description of the workspace" onChange={(event) => updateHome({ heroSubheadline: event.target.value || undefined })} /></label><label>Primary CTA label<input value={home.heroCtaLabel ?? ''} maxLength={120} placeholder="Optional label shown in the typed homepage config" onChange={(event) => updateHome({ heroCtaLabel: event.target.value || undefined })} /></label></section><section><div className="homepage-section-heading"><h2>Announcement</h2><label className="homepage-checkbox"><input type="checkbox" checked={home.announcementBannerVisible ?? false} onChange={(event) => updateHome({ announcementBannerVisible: event.target.checked })} /> Visible</label></div><label>Announcement text<input value={home.announcementBannerText ?? ''} maxLength={240} onChange={(event) => updateHome({ announcementBannerText: event.target.value || undefined })} /></label><label>Announcement link<input value={home.announcementBannerUrl ?? ''} maxLength={512} placeholder="Same-origin path or HTTPS URL" onChange={(event) => updateHome({ announcementBannerUrl: event.target.value || undefined })} /></label></section><section><div className="homepage-section-heading"><div><h2>Feature cards</h2><span>Up to six cards in this editor; accent is allow-listed.</span></div><button type="button" className="homepage-add-card" disabled={cards.length >= 6} onClick={addCard}><Plus size={13} /> Add card</button></div><div className="homepage-cards">{cards.map((card, index) => <article key={`${index}:${card.title}`}><header><span>Card {index + 1}</span><button type="button" aria-label={`Remove feature card ${index + 1}`} onClick={() => removeCard(index)}><Trash2 size={13} /></button></header><label>Title<input value={card.title} maxLength={120} onChange={(event) => updateCard(index, 'title', event.target.value)} /></label><label>Description<textarea value={card.description} maxLength={360} rows={3} onChange={(event) => updateCard(index, 'description', event.target.value)} /></label><label>Accent<select value={card.accent} onChange={(event) => updateCardAccent(index, event.target.value as FeatureCard['accent'])}><option value="brand">Brand</option><option value="neutral">Neutral</option><option value="success">Success</option><option value="warning">Warning</option></select></label></article>)}{cards.length === 0 && <p className="homepage-empty-cards">No feature cards configured.</p>}</div></section><footer><button type="submit" disabled={save.isPending || reset.isPending}><Save size={13} />{save.isPending ? 'Saving…' : 'Save homepage'}</button><button type="button" className="homepage-secondary" disabled={save.isPending || reset.isPending} onClick={() => reset.mutate()}><RotateCcw size={13} /> Reset base</button></footer>{notice && <p className="homepage-notice"><Check size={13} />{notice}</p>}{error && <p className="homepage-error"><AlertTriangle size={13} />{error}</p>}</form></section>
}
