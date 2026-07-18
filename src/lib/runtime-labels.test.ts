import { describe, expect, it } from 'vitest'
import { stepLabel } from './runtime-labels'

describe('stepLabel', () => {
  it('maps bash to Running command', () => {
    expect(stepLabel('bash')).toBe('Running command')
  })

  it('maps file_read to Reading file', () => {
    expect(stepLabel('file_read')).toBe('Reading file')
  })

  it('maps file_write to Writing file', () => {
    expect(stepLabel('file_write')).toBe('Writing file')
  })

  it('maps web_search to Searching the web', () => {
    expect(stepLabel('web_search')).toBe('Searching the web')
  })

  it('maps browser to Browsing page', () => {
    expect(stepLabel('browser')).toBe('Browsing page')
  })

  it('maps screenshot to Browsing page', () => {
    expect(stepLabel('screenshot')).toBe('Browsing page')
  })

  it('maps think to Thinking', () => {
    expect(stepLabel('think')).toBe('Thinking')
  })

  it('maps unknown tools to Working', () => {
    expect(stepLabel('some_exotic_tool')).toBe('Working')
    expect(stepLabel('unknown')).toBe('Working')
  })

  it('is case-insensitive', () => {
    expect(stepLabel('BASH')).toBe('Running command')
    expect(stepLabel('File_Read')).toBe('Reading file')
  })

  it('maps shell to Running command', () => {
    expect(stepLabel('shell')).toBe('Running command')
  })

  it('maps grep to Searching files', () => {
    expect(stepLabel('grep')).toBe('Searching files')
  })

  it('maps git_commit to Committing changes', () => {
    expect(stepLabel('git_commit')).toBe('Committing changes')
  })
})
