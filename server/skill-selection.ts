import type { SkillInstallationRecord } from './persistence/index.js'
import { skillPackManifestFor, skillPacksFromInstallations } from './skill-packs.js'
import type { EventInput, Task } from './types.js'

export const skillSelectionEventFor = (provider: Task['provider'], skills: Task['skills'], installations: readonly SkillInstallationRecord[] = []): EventInput => {
  const simulated = provider === 'demo'
  return {
    type: 'activity_delta', lane: 'control', label: simulated ? 'Skill packs recorded for simulation' : 'Versioned skill packs selected',
    content: simulated
      ? `${skills.length} immutable skill pack${skills.length === 1 ? '' : 's'} recorded for this demo turn. Demo mode does not execute or materialize skill content.`
      : `${skills.length} immutable skill pack${skills.length === 1 ? '' : 's'} selected for this turn. The adapter owns materialization of this pinned set; selection grants no new permission.`,
    payload: { skills: skillPackManifestFor(skills, skillPacksFromInstallations(installations)), permissionChange: false, materialization: simulated ? 'not_executed_demo' : 'adapter_owned' },
  }
}
