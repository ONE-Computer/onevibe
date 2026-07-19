// V2 visual QA harness. Requires the dev server on :5173 (npm run dev:all).
// Usage: node scripts/v2-qa.mjs name=/path [name2=/path2 ...]
// Writes docs/qa-screenshots/v2-<name>-<desktop|mobile>-<dark|light>.png
import fs from 'node:fs'
import puppeteer from 'puppeteer'

const args = process.argv.slice(2)
if (!args.length) {
  console.error('usage: node scripts/v2-qa.mjs name=/path [name2=/path2 ...]')
  process.exit(1)
}

const BASE = process.env.V2_QA_BASE ?? 'http://localhost:5173'
const OUT_DIR = 'docs/qa-screenshots'
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
}
const THEMES = ['dark', 'light']
const SETTLE_MS = Number(process.env.V2_QA_SETTLE_MS ?? 1800)

fs.mkdirSync(OUT_DIR, { recursive: true })

const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
let failures = 0
for (const arg of args) {
  const sep = arg.indexOf('=')
  const name = arg.slice(0, sep)
  const path = arg.slice(sep + 1)
  if (!name || !path.startsWith('/')) {
    console.error(`bad target "${arg}" — expected name=/path`)
    failures += 1
    continue
  }
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const page = await browser.newPage()
      try {
        await page.setViewport(viewport)
        await page.evaluateOnNewDocument((t) => {
          try { window.localStorage.setItem('onevibe-theme', t) } catch { /* ignore */ }
        }, theme)
        await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 30000 })
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
        const out = `${OUT_DIR}/v2-${name}-${vpName}-${theme}.png`
        await page.screenshot({ path: out, fullPage: true })
        console.log(out)
      } catch (error) {
        failures += 1
        console.error(`FAILED ${name} ${vpName} ${theme}: ${error instanceof Error ? error.message : error}`)
      } finally {
        await page.close()
      }
    }
  }
}
await browser.close()
if (failures) process.exit(1)
