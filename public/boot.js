(() => {
  try {
    const saved = localStorage.getItem('onevibe-theme')
    const preference = ['light', 'dark', 'system'].includes(saved) ? saved : 'light'
    const theme = preference === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.themePreference = preference
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0b0d0c' : '#f5f7f5'
  } catch { /* Use the dark CSS default when storage is unavailable. */ }
})()
