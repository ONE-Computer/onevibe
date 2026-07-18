export type EpicFilter = 'all' | string

export type EpicScopedItem = { epicLabel?: string }

export const distinctEpics = (items: readonly EpicScopedItem[]): string[] => {
  const labels = new Set<string>()
  for (const item of items) {
    const label = item.epicLabel?.trim()
    if (label) labels.add(label)
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

export const matchesEpicFilter = (item: EpicScopedItem, filter: EpicFilter): boolean =>
  filter === 'all' || item.epicLabel === filter
