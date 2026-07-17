export type Locale = 'en' | 'zh'

const en = {
  // Nav
  newTask: 'New task',
  skills: 'Skills',
  library: 'Library',
  computers: 'Computers',
  appearance: 'Appearance',
  scheduled: 'Scheduled',
  // Home
  greetingMorning: 'Good morning.',
  greetingAfternoon: 'Good afternoon.',
  greetingEvening: 'Good evening.',
  greetingLate: 'Working late.',
  composerPlaceholder: 'How can I help you today?',
  // Actions
  startTask: 'Start task',
  saveChanges: 'Save changes',
  saving: 'Saving…',
  resetBase: 'Reset base',
  testRuntime: 'Test runtime',
  testAgain: 'Test again',
  testing: 'Testing…',
  // States
  noRuntimesConfigured: 'No runtimes configured. Set ONEVIBE_LITELLM_URL in your .env file to connect a model provider.',
  noTasksYet: 'No tasks yet',
  noSkillsInstalled: 'No skills installed',
  noLibraryItems: 'Nothing saved to Library yet',
  noSchedules: 'No scheduled tasks',
  // Runtime
  runtimeRegistry: 'Runtime registry',
  connectivityChecks: 'Connectivity checks',
  // Errors
  unableToLoad: 'Unable to load',
  // Shared
  cancel: 'Cancel',
  close: 'Close',
  version: 'Version',
  loading: 'Loading…',
} as const

const zh: Record<keyof typeof en, string> = {
  newTask: '新建任务',
  skills: '技能',
  library: '资料库',
  computers: '运行环境',
  appearance: '外观设置',
  scheduled: '定时任务',
  greetingMorning: '早上好。',
  greetingAfternoon: '下午好。',
  greetingEvening: '晚上好。',
  greetingLate: '还在加班。',
  composerPlaceholder: '今天有什么我可以帮你的？',
  startTask: '开始任务',
  saveChanges: '保存更改',
  saving: '保存中…',
  resetBase: '重置为默认',
  testRuntime: '测试运行环境',
  testAgain: '重新检测',
  testing: '检测中…',
  noRuntimesConfigured: '未配置运行环境。请在 .env 中设置 ONEVIBE_LITELLM_URL 以连接模型提供商。',
  noTasksYet: '暂无任务',
  noSkillsInstalled: '暂未安装技能',
  noLibraryItems: '资料库暂无内容',
  noSchedules: '暂无定时任务',
  runtimeRegistry: '运行环境注册表',
  connectivityChecks: '连通性检测',
  unableToLoad: '加载失败',
  cancel: '取消',
  close: '关闭',
  version: '版本',
  loading: '加载中…',
}

const dictionaries: Record<Locale, Record<I18nKey, string>> = { en, zh }

export type I18nKey = keyof typeof en

export function t(key: I18nKey, locale: Locale): string {
  return (dictionaries[locale] as Record<string, string>)[key] ?? (en as Record<string, string>)[key]
}

export { en, zh }
