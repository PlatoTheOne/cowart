import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COWART_TOOLBAR_LAYOUT_STORAGE_KEY,
  getCowartToolbarInsertionIndex,
  loadCowartToolbarLayout,
  moveCowartToolbarTool,
  normalizeCowartToolbarLayout,
  saveCowartToolbarLayout
} from './cowartToolbarLayout.js'

const allToolIds = ['select', 'hand', 'image', 'draw', 'eraser', 'text']
const defaultVisibleIds = ['select', 'hand', 'image']

test('首次使用时保留默认底部工具并把其余工具放进隐藏区', () => {
  assert.deepEqual(
    normalizeCowartToolbarLayout({ allToolIds, defaultVisibleIds, storedLayout: null }),
    {
      version: 1,
      visible: ['select', 'hand', 'image'],
      hidden: ['draw', 'eraser', 'text']
    }
  )
})

test('读取偏好时去重、过滤已删除工具，并把新增工具追加到隐藏区', () => {
  const layout = normalizeCowartToolbarLayout({
    allToolIds,
    defaultVisibleIds,
    storedLayout: {
      version: 1,
      visible: ['eraser', 'select', 'eraser', 'removed'],
      hidden: ['text', 'hand']
    }
  })

  assert.deepEqual(layout.visible, ['eraser', 'select'])
  assert.deepEqual(layout.hidden, ['text', 'hand', 'image', 'draw'])
})

test('支持底部与隐藏区之间移动以及两区内部排序', () => {
  let layout = normalizeCowartToolbarLayout({ allToolIds, defaultVisibleIds, storedLayout: null })

  layout = moveCowartToolbarTool(layout, { toolId: 'hand', to: 'hidden', index: 1 })
  assert.deepEqual(layout.visible, ['select', 'image'])
  assert.deepEqual(layout.hidden, ['draw', 'hand', 'eraser', 'text'])

  layout = moveCowartToolbarTool(layout, { toolId: 'eraser', to: 'visible', index: 1 })
  assert.deepEqual(layout.visible, ['select', 'eraser', 'image'])

  layout = moveCowartToolbarTool(layout, { toolId: 'image', to: 'visible', index: 0 })
  assert.deepEqual(layout.visible, ['image', 'select', 'eraser'])

  layout = moveCowartToolbarTool(layout, { toolId: 'text', to: 'hidden', index: 0 })
  assert.deepEqual(layout.hidden, ['text', 'draw', 'hand'])
})

test('允许把全部工具隐藏，但不会丢失任何工具', () => {
  let layout = normalizeCowartToolbarLayout({ allToolIds, defaultVisibleIds, storedLayout: null })
  for (const toolId of [...layout.visible]) {
    layout = moveCowartToolbarTool(layout, {
      toolId,
      to: 'hidden',
      index: layout.hidden.length
    })
  }

  assert.deepEqual(layout.visible, [])
  assert.deepEqual(new Set(layout.hidden), new Set(allToolIds))
})

test('所有项目使用同一个版本化 storage key 保存和读取布局', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
  const expected = { version: 1, visible: ['text'], hidden: ['select', 'hand', 'image', 'draw', 'eraser'] }

  saveCowartToolbarLayout(storage, expected)
  assert.ok(values.has(COWART_TOOLBAR_LAYOUT_STORAGE_KEY))
  assert.deepEqual(
    loadCowartToolbarLayout(storage, { allToolIds, defaultVisibleIds }),
    expected
  )
})

test('损坏或不可用的 storage 自动回退，不阻断画布打开', () => {
  const brokenStorage = {
    getItem: () => '{broken json',
    setItem: () => {
      throw new Error('blocked')
    }
  }

  const layout = loadCowartToolbarLayout(brokenStorage, { allToolIds, defaultVisibleIds })
  assert.deepEqual(layout.visible, defaultVisibleIds)
  assert.doesNotThrow(() => saveCowartToolbarLayout(brokenStorage, layout))
})

test('根据底部横向工具和隐藏网格的指针位置计算插入点', () => {
  const horizontalRects = [
    { left: 0, top: 0, right: 40, bottom: 40 },
    { left: 50, top: 0, right: 90, bottom: 40 }
  ]
  assert.equal(getCowartToolbarInsertionIndex(horizontalRects, { x: 60, y: 20 }, 'horizontal'), 1)
  assert.equal(getCowartToolbarInsertionIndex(horizontalRects, { x: 100, y: 20 }, 'horizontal'), 2)

  const gridRects = [
    { left: 0, top: 0, right: 40, bottom: 40 },
    { left: 50, top: 0, right: 90, bottom: 40 },
    { left: 0, top: 50, right: 40, bottom: 90 },
    { left: 50, top: 50, right: 90, bottom: 90 }
  ]
  assert.equal(getCowartToolbarInsertionIndex(gridRects, { x: 60, y: 20 }, 'grid'), 1)
  assert.equal(getCowartToolbarInsertionIndex(gridRects, { x: 10, y: 60 }, 'grid'), 2)
  assert.equal(getCowartToolbarInsertionIndex(gridRects, { x: 100, y: 100 }, 'grid'), 4)
})
