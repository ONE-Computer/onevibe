import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

async function listV2ModuleCss(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.module.css'))
    .map((entry) => path.join(entry.parentPath, entry.name))
}

describe('presentation token boundary', () => {
  it('keeps the obfuscated --theme-color-*/--theme-effect-* system deleted', async () => {
    const [indexCss, defaultCss] = await Promise.all([
      readFile(path.join(root, 'src', 'index.css'), 'utf8'),
      readFile(path.join(root, 'src', 'theme', 'default.css'), 'utf8'),
    ])
    expect(indexCss).not.toMatch(/--theme-(?:color|effect)-/)
    expect(defaultCss).not.toMatch(/--theme-(?:color|effect)-/)
  })

  it('keeps the canonical semantic token layer in src/theme/default.css', async () => {
    const defaultCss = await readFile(path.join(root, 'src', 'theme', 'default.css'), 'utf8')
    expect(defaultCss).toContain('--font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;')
    expect(defaultCss).toContain('--radius-asymmetric:')
    expect(defaultCss).toContain('--surface-canvas:')
    expect(defaultCss).toContain('--accent:')
    expect(defaultCss).toContain('[data-theme="light"]')
  })

  it('keeps V2 CSS modules free of raw literals (tokens only)', async () => {
    const modules = await listV2ModuleCss(path.join(root, 'src', 'v2'))
    for (const file of modules) {
      const css = stripComments(await readFile(file, 'utf8'))
      const rel = path.relative(root, file)
      expect(css, rel).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(css, rel).not.toMatch(/(?:rgba?|hsla?)\([^)]*\)/)
      expect(css, rel).not.toMatch(/font-size\s*:[^;}]*(?<![-\w])[0-9]+(?:\.[0-9]+)?px\b/)
      expect(css, rel).not.toMatch(/!important\b/)
    }
  })
})
