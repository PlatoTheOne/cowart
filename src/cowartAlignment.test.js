import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearCowartImageAlignment,
  findCowartImageAlignment,
  isCowartImageDrag,
  syncCowartImageAlignment
} from './cowartAlignment.js'

const movingBounds = { x: 96, y: 210, w: 100, h: 80 }

test('图片候选在阈值内时优先于距离更近的非图片候选', () => {
  const result = findCowartImageAlignment({
    movingBounds,
    threshold: 5,
    targets: [
      { id: 'shape:text', type: 'text', bounds: { x: -4, y: 20, w: 100, h: 40 } },
      { id: 'shape:image', type: 'image', bounds: { x: 0, y: 0, w: 100, h: 80 } }
    ]
  })

  assert.equal(result.nudge.x, 4)
  assert.equal(result.matches.x.targetId, 'shape:image')
  assert.equal(result.matches.x.targetType, 'image')
})

test('没有合适图片候选时回退到其他画布元素', () => {
  const result = findCowartImageAlignment({
    movingBounds,
    threshold: 5,
    targets: [
      { id: 'shape:image', type: 'image', bounds: { x: -20, y: 0, w: 100, h: 80 } },
      { id: 'shape:geo', type: 'geo', bounds: { x: -2, y: 20, w: 100, h: 40 } }
    ]
  })

  assert.equal(result.nudge.x, 2)
  assert.equal(result.matches.x.targetId, 'shape:geo')
})

test('左右边、水平中心、上下边和垂直中心都可参与吸附', () => {
  const target = { id: 'shape:image', type: 'image', bounds: { x: 200, y: 300, w: 120, h: 90 } }
  const cases = [
    [{ x: 197, y: 500, w: 40, h: 30 }, { x: 3, y: 0 }],
    [{ x: 318, y: 500, w: 40, h: 30 }, { x: 2, y: 0 }],
    [{ x: 257, y: 500, w: 120, h: 30 }, { x: 3, y: 0 }],
    [{ x: 500, y: 297, w: 40, h: 30 }, { x: 0, y: 3 }],
    [{ x: 500, y: 388, w: 40, h: 30 }, { x: 0, y: 2 }],
    [{ x: 500, y: 342, w: 40, h: 90 }, { x: 0, y: 3 }]
  ]

  for (const [bounds, expectedNudge] of cases) {
    const result = findCowartImageAlignment({ movingBounds: bounds, targets: [target], threshold: 5 })
    assert.deepEqual(result.nudge, expectedNudge)
  }
})

test('超出屏幕换算后的阈值时不吸附也不生成参考线', () => {
  const result = findCowartImageAlignment({
    movingBounds,
    threshold: 3,
    targets: [{ id: 'shape:image', type: 'image', bounds: { x: 0, y: 0, w: 100, h: 80 } }]
  })

  assert.deepEqual(result.nudge, { x: 0, y: 0 })
  assert.deepEqual(result.guides, [])
})

test('同时命中横纵轴时输出两条 tldraw points 参考线', () => {
  const result = findCowartImageAlignment({
    movingBounds: { x: 97, y: 97, w: 100, h: 100 },
    threshold: 5,
    targets: [{ id: 'shape:image', type: 'image', bounds: { x: 0, y: 0, w: 100, h: 100 } }]
  })

  assert.deepEqual(result.nudge, { x: 3, y: 3 })
  assert.equal(result.guides.length, 2)
  assert.ok(result.guides.every((guide) => guide.type === 'points'))
  assert.ok(result.guides.every((guide) => guide.points.length === 2))
})

test('只有 translating 状态且全部选中对象都是图片时启用', () => {
  assert.equal(isCowartImageDrag({ isTranslating: true, selectedTypes: ['image'] }), true)
  assert.equal(isCowartImageDrag({ isTranslating: true, selectedTypes: ['image', 'image'] }), true)
  assert.equal(isCowartImageDrag({ isTranslating: true, selectedTypes: ['image', 'text'] }), false)
  assert.equal(isCowartImageDrag({ isTranslating: false, selectedTypes: ['image'] }), false)
  assert.equal(isCowartImageDrag({ isTranslating: true, selectedTypes: [] }), false)
})

test('控制器按缩放换算阈值、移动图片并写入 tldraw 参考线', () => {
  const calls = { clear: 0, indicators: [], nudges: [] }
  const selectedShape = { id: 'shape:moving', type: 'image' }
  const targetShape = { id: 'shape:target', type: 'image' }
  const editor = {
    isIn: (state) => state === 'select.translating',
    getSelectedShapes: () => [selectedShape],
    getSelectedShapeIds: () => [selectedShape.id],
    getSelectionPageBounds: () => ({ x: 96, y: 210, w: 100, h: 80 }),
    getCurrentPageShapes: () => [selectedShape, targetShape],
    getShapePageBounds: (id) =>
      id === targetShape.id ? { x: 0, y: 0, w: 100, h: 80 } : { x: 96, y: 210, w: 100, h: 80 },
    getZoomLevel: () => 2,
    nudgeShapes: (ids, nudge) => calls.nudges.push({ ids, nudge }),
    snaps: {
      clearIndicators: () => calls.clear++,
      setIndicators: (indicators) => calls.indicators.push(indicators)
    }
  }

  const result = syncCowartImageAlignment(editor, { thresholdScreenPx: 10 })

  assert.equal(result.active, true)
  assert.deepEqual(calls.nudges, [{ ids: ['shape:moving'], nudge: { x: 4, y: 0 } }])
  assert.equal(calls.clear, 1)
  assert.equal(calls.indicators.at(-1).length, 1)
})

test('控制器在非图片拖动或离开 translating 状态时只清空参考线', () => {
  for (const scenario of [
    { translating: true, selectedType: 'text' },
    { translating: false, selectedType: 'image' }
  ]) {
    let cleared = 0
    const editor = {
      isIn: () => scenario.translating,
      getSelectedShapes: () => [{ id: 'shape:selected', type: scenario.selectedType }],
      snaps: {
        clearIndicators: () => cleared++,
        getIndicators: () => [{ id: 'cowart-x-test', type: 'points', points: [] }]
      }
    }

    assert.deepEqual(syncCowartImageAlignment(editor), { active: false })
    assert.equal(cleared, 1)
  }
})

test('清理逻辑只移除 Cowart 参考线，不干扰 tldraw 原生吸附提示', () => {
  let cleared = 0
  const editor = {
    snaps: {
      getIndicators: () => [{ id: 'native-snap', type: 'points', points: [] }],
      clearIndicators: () => cleared++
    }
  }

  assert.equal(clearCowartImageAlignment(editor), false)
  assert.equal(cleared, 0)

  editor.snaps.getIndicators = () => [{ id: 'cowart-x-shape-100', type: 'points', points: [] }]
  assert.equal(clearCowartImageAlignment(editor), true)
  assert.equal(cleared, 1)
})
