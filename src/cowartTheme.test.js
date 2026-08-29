import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COWART_THEME_STORAGE_KEY,
  getCowartThemeLabel,
  nextCowartThemePreference,
  readCowartThemePreference,
  resolveCowartColorScheme,
  writeCowartThemePreference
} from './cowartTheme.js'

test('主题偏好默认跟随系统并忽略损坏数据', () => {
  const storage = new Map([[COWART_THEME_STORAGE_KEY, '{broken']])
  const adapter = {
    getItem(key) {
      return storage.get(key) ?? null
    }
  }

  assert.equal(readCowartThemePreference(adapter), 'system')
})

test('主题偏好按跟随系统、白天、黑夜循环并全局保存', () => {
  const storage = new Map()
  const adapter = {
    getItem(key) {
      return storage.get(key) ?? null
    },
    setItem(key, value) {
      storage.set(key, value)
    }
  }

  assert.equal(nextCowartThemePreference('system'), 'light')
  assert.equal(nextCowartThemePreference('light'), 'dark')
  assert.equal(nextCowartThemePreference('dark'), 'system')

  writeCowartThemePreference('dark', adapter)
  assert.equal(readCowartThemePreference(adapter), 'dark')
})

test('跟随系统优先使用 Codex 宿主主题，再回退操作系统', () => {
  assert.equal(resolveCowartColorScheme('system', { hostTheme: 'dark', systemDark: false }), 'dark')
  assert.equal(resolveCowartColorScheme('system', { hostTheme: null, systemDark: true }), 'dark')
  assert.equal(resolveCowartColorScheme('light', { hostTheme: 'dark', systemDark: true }), 'light')
})

test('主题按钮为简体、繁体和英文提供可访问名称', () => {
  assert.equal(getCowartThemeLabel('dark', 'zh-CN'), '主题：黑夜')
  assert.equal(getCowartThemeLabel('light', 'zh-TW'), '主題：白天')
  assert.equal(getCowartThemeLabel('system', 'en-US'), 'Theme: System')
})
