import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ServerResponse } from 'node:http'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export const staticPathFor = (root: string, pathname: string) => {
  const decoded = decodeURIComponent(pathname)
  const relative = decoded === '/' ? '/index.html' : decoded
  const rootPath = path.resolve(root)
  const candidate = path.resolve(rootPath, `.${relative}`)
  if (candidate !== rootPath && !candidate.startsWith(`${rootPath}${path.sep}`)) return undefined
  return candidate
}

export const serveStatic = async (root: string, pathname: string, response: ServerResponse) => {
  if (pathname.startsWith('/api/')) return false
  let candidate: string | undefined
  try {
    candidate = staticPathFor(root, pathname)
  } catch {
    return false
  }
  if (!candidate) return false
  const indexPath = path.join(path.resolve(root), 'index.html')
  let filePath = candidate
  try {
    const metadata = await stat(filePath)
    if (!metadata.isFile()) filePath = indexPath
  } catch {
    filePath = indexPath
  }
  try {
    const content = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    })
    response.end(content)
    return true
  } catch {
    return false
  }
}
