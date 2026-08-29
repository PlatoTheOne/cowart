export const COWART_THEME_STORAGE_KEY = 'cowart.theme-preference.v1'

const COWART_THEME_PREFERENCES = ['system', 'light', 'dark']
const COWART_THEME_LABELS = {
  'zh-CN': {
    system: '主题：跟随系统',
    light: '主题：白天',
    dark: '主题：黑夜'
  },
  'zh-TW': {
    system: '主題：跟隨系統',
    light: '主題：白天',
    dark: '主題：黑夜'
  },
  en: {
    system: 'Theme: System',
    light: 'Theme: Light',
    dark: 'Theme: Dark'
  }
}

/**
 * 判断输入是否为 Cowart 支持的主题偏好。
 */
function isCowartThemePreference(value) {
  return COWART_THEME_PREFERENCES.includes(value)
}

/**
 * 读取 Cowart 的全局主题偏好。
 */
export function readCowartThemePreference(storage = globalThis.localStorage) {
  try {
    const stored = JSON.parse(storage?.getItem(COWART_THEME_STORAGE_KEY) ?? 'null')
    return stored?.version === 1 && isCowartThemePreference(stored.preference)
      ? stored.preference
      : 'system'
  } catch (_error) {
    return 'system'
  }
}

/**
 * 保存 Cowart 的全局主题偏好。
 */
export function writeCowartThemePreference(preference, storage = globalThis.localStorage) {
  if (!isCowartThemePreference(preference)) return
  try {
    storage?.setItem(
      COWART_THEME_STORAGE_KEY,
      JSON.stringify({ version: 1, preference })
    )
  } catch (_error) {
    // 本地存储不可用时只保留当前会话状态，不阻断画布操作。
  }
}

/**
 * 返回主题按钮的下一个偏好。
 */
export function nextCowartThemePreference(preference) {
  const currentIndex = COWART_THEME_PREFERENCES.indexOf(preference)
  return COWART_THEME_PREFERENCES[(currentIndex + 1) % COWART_THEME_PREFERENCES.length]
}

/**
 * 将主题偏好解析为实际的明暗配色。
 */
export function resolveCowartColorScheme(preference, { hostTheme, systemDark } = {}) {
  if (preference === 'light' || preference === 'dark') return preference
  if (hostTheme === 'light' || hostTheme === 'dark') return hostTheme
  return systemDark ? 'dark' : 'light'
}

/**
 * 返回适合当前语言的主题按钮名称。
 */
export function getCowartThemeLabel(preference, locale = 'zh-CN') {
  const normalizedLocale = String(locale).toLowerCase()
  const messages = normalizedLocale.startsWith('zh-tw') || normalizedLocale.startsWith('zh-hk')
    ? COWART_THEME_LABELS['zh-TW']
    : normalizedLocale.startsWith('zh')
      ? COWART_THEME_LABELS['zh-CN']
      : COWART_THEME_LABELS.en
  return messages[preference] ?? messages.system
}
