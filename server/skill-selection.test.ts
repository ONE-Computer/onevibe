import { describe, expect, it } from 'vitest'
import { skillSelectionEventFor } from './skill-selection.js'

describe('skill selection truthfulness', () => {
  it('marks demo skills as recorded but not executed', () => {
    const event = skillSelectionEventFor('demo', ['document'])
    expect(event.label).toBe('Skill packs recorded for simulation')
    expect(event.content).toContain('does not execute or materialize')
    expect(event.payload.materialization).toBe('not_executed_demo')
  })

  it('leaves provider-owned materialization to the selected adapter', () => {
    const event = skillSelectionEventFor('claude_sdk', ['document'])
    expect(event.label).toBe('Versioned skill packs selected')
    expect(event.payload.materialization).toBe('adapter_owned')
    expect(event.content).toContain('adapter owns materialization')
  })
})
