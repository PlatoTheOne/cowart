const AXIS_ANCHORS = {
  x: [
    ['left', (bounds) => bounds.x],
    ['center', (bounds) => bounds.x + bounds.w / 2],
    ['right', (bounds) => bounds.x + bounds.w]
  ],
  y: [
    ['top', (bounds) => bounds.y],
    ['center', (bounds) => bounds.y + bounds.h / 2],
    ['bottom', (bounds) => bounds.y + bounds.h]
  ]
}

/**
 * 只有“正在平移且所有选中对象均为图片”时才允许 Cowart 图片吸附接管拖动。
 */
export function isCowartImageDrag({ isTranslating, selectedTypes }) {
  return Boolean(
    isTranslating &&
      Array.isArray(selectedTypes) &&
      selectedTypes.length > 0 &&
      selectedTypes.every((type) => type === 'image')
  )
}

/**
 * 计算图片拖动的最佳横纵轴吸附结果。图片候选始终优先，随后才比较距离。
 */
export function findCowartImageAlignment({ movingBounds, targets, threshold }) {
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : 0
  const safeTargets = Array.isArray(targets) ? targets.filter(hasValidTarget) : []
  const xMatch = findBestAxisMatch('x', movingBounds, safeTargets, safeThreshold)
  const yMatch = findBestAxisMatch('y', movingBounds, safeTargets, safeThreshold)
  const nudge = {
    x: xMatch?.delta ?? 0,
    y: yMatch?.delta ?? 0
  }

  return {
    nudge,
    matches: { x: xMatch ?? null, y: yMatch ?? null },
    guides: createSnapGuides(movingBounds, safeTargets, xMatch, yMatch, nudge)
  }
}

/**
 * 在一次 pointer move 后同步图片吸附。Interface 只依赖 tldraw Editor 的公开读取、移动与 snaps 能力。
 */
export function syncCowartImageAlignment(editor, { thresholdScreenPx = 6 } = {}) {
  const selectedShapes = editor.getSelectedShapes?.() ?? []
  const active = isCowartImageDrag({
    isTranslating: editor.isIn?.('select.translating') === true,
    selectedTypes: selectedShapes.map((shape) => shape?.type)
  })

  if (!active) {
    clearCowartImageAlignment(editor)
    return { active: false }
  }
  editor.snaps?.clearIndicators?.()

  const movingBounds = toPlainBounds(editor.getSelectionPageBounds?.())
  const selectedIds = new Set(editor.getSelectedShapeIds?.() ?? selectedShapes.map((shape) => shape.id))
  const targets = (editor.getCurrentPageShapes?.() ?? [])
    .filter((shape) => !selectedIds.has(shape.id) && editor.isShapeHidden?.(shape) !== true)
    .map((shape) => ({
      id: shape.id,
      type: shape.type,
      bounds: toPlainBounds(editor.getShapePageBounds?.(shape.id))
    }))
    .filter(hasValidTarget)

  const zoom = Math.max(Number(editor.getZoomLevel?.()) || 1, Number.EPSILON)
  const alignment = findCowartImageAlignment({
    movingBounds,
    targets,
    threshold: Math.max(0, thresholdScreenPx) / zoom
  })

  if (alignment.nudge.x !== 0 || alignment.nudge.y !== 0) {
    editor.nudgeShapes?.([...selectedIds], alignment.nudge)
  }
  if (alignment.guides.length > 0) {
    editor.snaps?.setIndicators?.(alignment.guides)
  }

  return { active: true, ...alignment }
}

/** 只移除 Cowart 生成的指标；tldraw 其他工具自己的吸附提示必须保留。 */
export function clearCowartImageAlignment(editor) {
  const indicators = editor.snaps?.getIndicators?.() ?? []
  const remaining = indicators.filter((indicator) => !String(indicator?.id).startsWith('cowart-'))
  if (remaining.length === indicators.length) return false

  if (remaining.length > 0) {
    editor.snaps?.setIndicators?.(remaining)
  } else {
    editor.snaps?.clearIndicators?.()
  }
  return true
}

function findBestAxisMatch(axis, movingBounds, targets, threshold) {
  if (!isValidBounds(movingBounds)) return null

  const candidates = []
  for (const target of targets) {
    for (const [movingAnchor, readMoving] of AXIS_ANCHORS[axis]) {
      const movingValue = readMoving(movingBounds)
      for (const [targetAnchor, readTarget] of AXIS_ANCHORS[axis]) {
        const targetValue = readTarget(target.bounds)
        const delta = targetValue - movingValue
        if (Math.abs(delta) > threshold) continue

        candidates.push({
          axis,
          delta,
          coordinate: targetValue,
          movingAnchor,
          targetAnchor,
          targetId: target.id,
          targetType: target.type,
          targetPriority: target.type === 'image' ? 0 : 1
        })
      }
    }
  }

  candidates.sort(compareCandidates)
  const best = candidates[0]
  if (!best) return null

  const { targetPriority: _targetPriority, ...match } = best
  return match
}

function compareCandidates(left, right) {
  return (
    left.targetPriority - right.targetPriority ||
    Math.abs(left.delta) - Math.abs(right.delta) ||
    String(left.targetId).localeCompare(String(right.targetId)) ||
    left.movingAnchor.localeCompare(right.movingAnchor) ||
    left.targetAnchor.localeCompare(right.targetAnchor)
  )
}

function createSnapGuides(movingBounds, targets, xMatch, yMatch, nudge) {
  const guides = []
  const shifted = {
    ...movingBounds,
    x: movingBounds.x + nudge.x,
    y: movingBounds.y + nudge.y
  }

  if (xMatch) {
    const target = targets.find((item) => item.id === xMatch.targetId)
    if (target) {
      guides.push({
        id: `cowart-x-${xMatch.targetId}-${xMatch.coordinate}`,
        type: 'points',
        points: [
          { x: xMatch.coordinate, y: Math.min(shifted.y, target.bounds.y) },
          {
            x: xMatch.coordinate,
            y: Math.max(shifted.y + shifted.h, target.bounds.y + target.bounds.h)
          }
        ]
      })
    }
  }

  if (yMatch) {
    const target = targets.find((item) => item.id === yMatch.targetId)
    if (target) {
      guides.push({
        id: `cowart-y-${yMatch.targetId}-${yMatch.coordinate}`,
        type: 'points',
        points: [
          { x: Math.min(shifted.x, target.bounds.x), y: yMatch.coordinate },
          {
            x: Math.max(shifted.x + shifted.w, target.bounds.x + target.bounds.w),
            y: yMatch.coordinate
          }
        ]
      })
    }
  }

  return guides
}

function hasValidTarget(target) {
  const bounds = target?.bounds
  return Boolean(
    target &&
      typeof target.id === 'string' &&
      typeof target.type === 'string' &&
      isValidBounds(bounds)
  )
}

function isValidBounds(bounds) {
  return Boolean(
    bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.w) &&
      Number.isFinite(bounds.h)
  )
}

function toPlainBounds(bounds) {
  if (!bounds) return null
  return {
    x: Number(bounds.x),
    y: Number(bounds.y),
    w: Number(bounds.w ?? bounds.width),
    h: Number(bounds.h ?? bounds.height)
  }
}
