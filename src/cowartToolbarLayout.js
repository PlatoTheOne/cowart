export const COWART_TOOLBAR_LAYOUT_VERSION = 1
export const COWART_TOOLBAR_LAYOUT_STORAGE_KEY = 'cowart.toolbar-layout.v1'

/**
 * 把持久化布局收敛成“每个已知工具只出现一次”的稳定状态。
 * 新工具默认进入隐藏区，避免升级后打乱用户已经排好的底部工具栏。
 */
export function normalizeCowartToolbarLayout({ allToolIds, defaultVisibleIds, storedLayout }) {
  const allIds = uniqueStrings(allToolIds)
  const knownIds = new Set(allIds)

  if (!isStoredLayout(storedLayout)) {
    const visible = uniqueStrings(defaultVisibleIds).filter((id) => knownIds.has(id))
    const visibleIds = new Set(visible)
    return {
      version: COWART_TOOLBAR_LAYOUT_VERSION,
      visible,
      hidden: allIds.filter((id) => !visibleIds.has(id))
    }
  }

  const seen = new Set()
  const takeKnownIds = (ids) =>
    uniqueStrings(ids).filter((id) => {
      if (!knownIds.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })

  const visible = takeKnownIds(storedLayout.visible)
  const hidden = takeKnownIds(storedLayout.hidden)
  hidden.push(...allIds.filter((id) => !seen.has(id)))

  return { version: COWART_TOOLBAR_LAYOUT_VERSION, visible, hidden }
}

/** 将一个工具移动到目标区域的指定插入位置，不允许复制或丢失。 */
export function moveCowartToolbarTool(layout, { toolId, to, index }) {
  if (to !== 'visible' && to !== 'hidden') return layout

  const visible = layout.visible.filter((id) => id !== toolId)
  const hidden = layout.hidden.filter((id) => id !== toolId)
  const target = to === 'visible' ? visible : hidden
  const insertionIndex = Math.min(Math.max(Number(index) || 0, 0), target.length)
  target.splice(insertionIndex, 0, toolId)

  return {
    version: COWART_TOOLBAR_LAYOUT_VERSION,
    visible,
    hidden
  }
}

/** 根据我们自己的放置区几何计算插入位置，不读取 tldraw 私有 DOM。 */
export function getCowartToolbarInsertionIndex(rects, pointer, orientation) {
  const items = Array.isArray(rects) ? rects.filter(isValidRect) : []
  if (orientation === 'horizontal') {
    const index = items.findIndex((rect) => pointer.x < (rect.left + rect.right) / 2)
    return index === -1 ? items.length : index
  }

  for (let rowStart = 0; rowStart < items.length; ) {
    const rowBottom = items[rowStart].bottom
    let rowEnd = rowStart + 1
    while (rowEnd < items.length && items[rowEnd].top < rowBottom) rowEnd++

    if (pointer.y <= rowBottom) {
      for (let index = rowStart; index < rowEnd; index++) {
        if (pointer.x < (items[index].left + items[index].right) / 2) return index
      }
      return rowEnd
    }
    rowStart = rowEnd
  }

  return items.length
}

/** 从同一个 Widget origin 的 localStorage 读取布局，因此所有项目共享一份偏好。 */
export function loadCowartToolbarLayout(storage, options) {
  let storedLayout = null
  try {
    const raw = storage?.getItem?.(COWART_TOOLBAR_LAYOUT_STORAGE_KEY)
    storedLayout = raw ? JSON.parse(raw) : null
  } catch {
    storedLayout = null
  }
  return normalizeCowartToolbarLayout({ ...options, storedLayout })
}

/** storage 被禁用时静默降级；工具栏本身仍然可以继续使用。 */
export function saveCowartToolbarLayout(storage, layout) {
  try {
    storage?.setItem?.(COWART_TOOLBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Codex host 或浏览器策略可能禁用 storage；此时只保留当前会话状态。
  }
}

function isStoredLayout(layout) {
  return Boolean(layout && Array.isArray(layout.visible) && Array.isArray(layout.hidden))
}

function uniqueStrings(values) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).filter((value) => {
    if (typeof value !== 'string' || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function isValidRect(rect) {
  return Boolean(
    rect &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.right) &&
      Number.isFinite(rect.bottom)
  )
}
