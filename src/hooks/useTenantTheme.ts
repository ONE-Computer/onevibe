import { useContext } from 'react'
import { ThemeContext } from '../lib/theme'

export const useTenantTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTenantTheme must be used inside ThemeProvider')
  return context
}
