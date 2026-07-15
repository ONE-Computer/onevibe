import { Laptop, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '../hooks/useTheme'

const nextTheme: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

export const ThemeToggle = () => {
  const { preference, resolvedTheme, setPreference } = useTheme()
  const Icon = preference === 'system' ? Laptop : resolvedTheme === 'dark' ? Moon : Sun
  const next = nextTheme[preference]

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label={`Theme: ${preference}. Switch to ${next} theme`}
      title={`Theme: ${preference} · switch to ${next}`}
      onClick={() => setPreference(next)}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}
