import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('presentation token boundary', () => {
  it('keeps raw colors, effects, radii, and font families in the canonical token source', async () => {
    const [indexCss, timelineCss, defaultCss] = await Promise.all([
      readFile(path.join(root, 'src', 'index.css'), 'utf8'),
      readFile(path.join(root, 'src', 'timeline.css'), 'utf8'),
      readFile(path.join(root, 'src', 'theme', 'default.css'), 'utf8'),
    ])
    const productionCss = `${indexCss}\n${timelineCss}`.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(productionCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(productionCss).not.toMatch(/(?:rgba?|hsla?)\([^)]*\)/)
    expect(productionCss).not.toMatch(/border-radius\s*:[^;}]*(?<![-\w])[0-9]+(?:\.[0-9]+)?px\b/)
    expect(productionCss).not.toMatch(/\b(?:Inter|system-ui|ui-sans-serif|sans-serif|monospace)\b/)
    expect(defaultCss).toContain('--font-ui: Inter, ui-sans-serif, system-ui, sans-serif;')
    expect(defaultCss).toContain('--radius-asymmetric:')
  })
})

