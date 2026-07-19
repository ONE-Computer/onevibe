import path from 'node:path'

/**
 * Returns `target` relative to `root` when `target` is confined beneath `root`
 * (`root` itself included, yielding ''), otherwise undefined.
 */
export const relativePathWithin = (root: string, target: string): string | undefined => {
  const relative = path.relative(root, target)
  return !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : undefined
}
