// Strips active/injected content from SVG markup before it is rendered anywhere
// (server-side logo validation, or client-side after a remote logo fetch):
// <script> and <foreignObject> blocks, inline event-handler attributes (onload,
// onerror, ...), javascript:/data: URI payloads in href/src, and <use> references
// to an external (cross-origin) document. This is a best-effort regex removal
// pass, not a full SVG parser — it is applied defensively in addition to the
// existing MIME/size/integrity checks, not as a substitute for them.
const STRIP_SVG_BLOCKS = [
  /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi,
  /<\s*foreignObject\b[^>]*>[\s\S]*?<\s*\/\s*foreignObject\s*>/gi,
]
const STRIP_SVG_ATTRIBUTES = [
  // Inline event handlers such as onload/onerror/onclick.
  /\son[a-z]+\s*=\s*"[^"]*"/gi,
  /\son[a-z]+\s*=\s*'[^']*'/gi,
  /\son[a-z]+\s*=\s*[^\s>]+/gi,
  // href/xlink:href/src that carry scriptable or unsafe URL payloads.
  /\s(?:xlink:)?(?:href|src)\s*=\s*"\s*(?:javascript|data):[^"]*"/gi,
  /\s(?:xlink:)?(?:href|src)\s*=\s*'\s*(?:javascript|data):[^']*'/gi,
  /\s(?:xlink:)?(?:href|src)\s*=\s*(?:javascript|data):[^\s>]*/gi,
]
const STRIP_EXTERNAL_USE = /<\s*use\b[^>]*\s(?:xlink:)?href\s*=\s*"(?:https?:)?\/\/[^"]*"[^>]*\/?\s*>/gi
const STRIP_EXTERNAL_USE_SINGLE = /<\s*use\b[^>]*\s(?:xlink:)?href\s*=\s*'(?:https?:)?\/\/[^']*'[^>]*\/?\s*>/gi

export const sanitizeSvg = (content: string): string => {
  let sanitized = content
  for (const pattern of STRIP_SVG_BLOCKS) sanitized = sanitized.replace(pattern, '')
  for (const pattern of STRIP_SVG_ATTRIBUTES) sanitized = sanitized.replace(pattern, '')
  sanitized = sanitized.replace(STRIP_EXTERNAL_USE, '').replace(STRIP_EXTERNAL_USE_SINGLE, '')
  return sanitized
}
