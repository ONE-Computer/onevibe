import { describe, expect, it } from 'vitest'
import { staticPathFor } from './static-files.js'

describe('production static file boundary', () => {
  it('maps the root and SPA routes inside dist', () => {
    expect(staticPathFor('/srv/onevibe/dist', '/')).toBe('/srv/onevibe/dist/index.html')
    expect(staticPathFor('/srv/onevibe/dist', '/tasks/task_123')).toBe('/srv/onevibe/dist/tasks/task_123')
  })

  it('rejects traversal outside the production asset root', () => {
    expect(staticPathFor('/srv/onevibe/dist', '/../.env')).toBeUndefined()
    expect(staticPathFor('/srv/onevibe/dist', '/%2e%2e/%2eenv')).toBeUndefined()
  })
})
