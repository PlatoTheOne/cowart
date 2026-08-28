import {
  MobileStylePanel,
  PORTRAIT_BREAKPOINT,
  TldrawUiButtonIcon,
  TldrawUiMenuContextProvider,
  TldrawUiOrientationProvider,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiRow,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  ToggleToolLockedButton,
  useBreakpoint,
  useEditor,
  usePassThroughWheelEvents,
  useReadonly,
  useTldrawUiComponents,
  useTranslation,
  useValue
} from 'tldraw'
import { useEffect, useRef, useState } from 'react'

import {
  COWART_TOOLBAR_LAYOUT_STORAGE_KEY,
  getCowartToolbarInsertionIndex,
  loadCowartToolbarLayout,
  moveCowartToolbarTool,
  normalizeCowartToolbarLayout,
  saveCowartToolbarLayout
} from './cowartToolbarLayout.js'

const COWART_TOOLBAR_LONG_PRESS_MS = 300
const COWART_TOOLBAR_POPOVER_ID = 'cowart toolbar overflow'

/**
 * 可跨项目共享布局的 Cowart 工具栏。Interface 只接收工具 ID、默认可见项和渲染函数。
 */
export function CowartDraggableToolbar({ toolIds, defaultVisibleIds, renderTool }) {
  const editor = useEditor()
  const msg = useTranslation()
  const breakpoint = useBreakpoint()
  const isReadonlyMode = useReadonly()
  const { ActionsMenu, QuickActions } = useTldrawUiComponents()
  const activeToolId = useValue('cowart current tool id', () => editor.getCurrentToolId(), [editor])
  const toolbarRef = useRef(null)
  const visibleRegionRef = useRef(null)
  const hiddenRegionRef = useRef(null)
  const dragSessionRef = useRef(null)
  const suppressNextClickRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [dragUi, setDragUi] = useState(null)
  const [layout, setLayout] = useState(() =>
    loadCowartToolbarLayout(getCowartToolbarStorage(), { allToolIds: toolIds, defaultVisibleIds })
  )

  usePassThroughWheelEvents(toolbarRef)

  useEffect(() => {
    setLayout((current) =>
      normalizeCowartToolbarLayout({
        allToolIds: toolIds,
        defaultVisibleIds,
        storedLayout: current
      })
    )
  }, [defaultVisibleIds, toolIds])

  useEffect(() => {
    function handleStorage(event) {
      if (event.key !== COWART_TOOLBAR_LAYOUT_STORAGE_KEY) return
      setLayout(
        loadCowartToolbarLayout(getCowartToolbarStorage(), {
          allToolIds: toolIds,
          defaultVisibleIds
        })
      )
    }

    globalThis.window?.addEventListener('storage', handleStorage)
    return () => globalThis.window?.removeEventListener('storage', handleStorage)
  }, [defaultVisibleIds, toolIds])

  useEffect(() => {
    const doc = editor.getContainerDocument()
    function handleKeyDown(event) {
      if (event.key === 'Escape' && dragSessionRef.current?.active) cancelDragSession()
    }

    doc.addEventListener('keydown', handleKeyDown, true)
    return () => {
      doc.removeEventListener('keydown', handleKeyDown, true)
      clearLongPressTimer()
    }
  }, [editor])

  /** 开始长按计时；计时期间的轻微移动不会取消拖动。 */
  function handlePointerDown(toolId, event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    clearLongPressTimer()

    const element = event.currentTarget
    try {
      element.setPointerCapture?.(event.pointerId)
    } catch {
      // 自动化或受限 host 可能不允许显式捕获；wrapper 事件仍可完成拖动。
    }
    const session = {
      active: false,
      drop: null,
      element,
      pointerId: event.pointerId,
      point: { x: event.clientX, y: event.clientY },
      timer: null,
      toolId
    }
    dragSessionRef.current = session
    session.timer = globalThis.window?.setTimeout(() => activateDragSession(session), COWART_TOOLBAR_LONG_PRESS_MS)
  }

  /** 长按满足后打开隐藏区，并开始渲染浮动预览与放置反馈。 */
  function activateDragSession(session) {
    if (dragSessionRef.current !== session) return
    session.active = true
    setIsOpen(true)
    updateDragPosition(session, session.point)
  }

  /** 指针被 wrapper 捕获后，鼠标和触控共用同一条拖动路径。 */
  function handlePointerMove(event) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    session.point = { x: event.clientX, y: event.clientY }
    if (!session.active) return
    event.preventDefault()
    updateDragPosition(session, session.point)
  }

  /** 在有效区域落下时移动工具；无效区域只取消，不改变持久化布局。 */
  function handlePointerUp(event) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const wasActive = session.active
    const drop = session.drop
    finishDragSession(session, wasActive)

    if (wasActive) {
      event.preventDefault()
      event.stopPropagation()
      if (drop) {
        setLayout((current) => {
          const next = moveCowartToolbarTool(current, {
            toolId: session.toolId,
            to: drop.region,
            index: drop.index
          })
          saveCowartToolbarLayout(getCowartToolbarStorage(), next)
          return next
        })
      }
    }
  }

  function handlePointerCancel(event) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    finishDragSession(session, session.active)
  }

  /** 阻止长按拖动结束后产生的合成 click，普通短按仍交给原工具按钮处理。 */
  function handleClickCapture(event) {
    if (!suppressNextClickRef.current) return
    suppressNextClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  function updateDragPosition(session, point) {
    const drop = resolveDrop(point, session.toolId)
    session.drop = drop
    setDragUi({ drop, point, toolId: session.toolId })
  }

  /** 只读取 Cowart 自己声明的两个区域，不依赖 tldraw 内部 DOM 结构。 */
  function resolveDrop(point, toolId) {
    const regions = [
      { element: hiddenRegionRef.current, name: 'hidden', orientation: 'grid' },
      { element: visibleRegionRef.current, name: 'visible', orientation: 'horizontal' }
    ]

    for (const region of regions) {
      if (!region.element) continue
      const regionRect = region.element.getBoundingClientRect()
      if (!containsPoint(regionRect, point)) continue

      const itemElements = [...region.element.querySelectorAll('[data-cowart-tool-wrapper="true"]')].filter(
        (element) => element.dataset.cowartToolId !== toolId
      )
      const rects = itemElements.map((element) => element.getBoundingClientRect())
      const index = getCowartToolbarInsertionIndex(rects, point, region.orientation)
      return {
        index,
        marker: createDropMarker(regionRect, rects, index, region.orientation),
        region: region.name
      }
    }
    return null
  }

  function finishDragSession(session, suppressClick) {
    globalThis.window?.clearTimeout(session.timer)
    try {
      if (session.element.hasPointerCapture?.(session.pointerId)) {
        session.element.releasePointerCapture?.(session.pointerId)
      }
    } catch {
      // pointer 已由浏览器释放时无需额外处理。
    }
    if (suppressClick) {
      suppressNextClickRef.current = true
      globalThis.window?.setTimeout(() => {
        suppressNextClickRef.current = false
      }, 0)
    }
    dragSessionRef.current = null
    setDragUi(null)
  }

  function cancelDragSession() {
    const session = dragSessionRef.current
    if (!session) return
    finishDragSession(session, session.active)
  }

  function clearLongPressTimer() {
    const session = dragSessionRef.current
    if (session?.timer) globalThis.window?.clearTimeout(session.timer)
  }

  const showQuickActions =
    editor.options.actionShortcutsLocation === 'menu'
      ? false
      : editor.options.actionShortcutsLocation === 'toolbar'
        ? true
        : breakpoint < PORTRAIT_BREAKPOINT.TABLET

  return (
    <TldrawUiOrientationProvider orientation="horizontal" tooltipSide="top">
      <div ref={toolbarRef} className="tlui-main-toolbar tlui-main-toolbar--horizontal cowart-custom-toolbar">
        <div className="tlui-main-toolbar__inner">
          <div className="tlui-main-toolbar__left">
            {!isReadonlyMode && (
              <div className="tlui-main-toolbar__extras">
                {showQuickActions && (
                  <TldrawUiToolbar
                    orientation="horizontal"
                    className="tlui-main-toolbar__extras__controls"
                    label={msg('actions-menu.title')}
                  >
                    {QuickActions && <QuickActions />}
                    {ActionsMenu && <ActionsMenu />}
                  </TldrawUiToolbar>
                )}
                <ToggleToolLockedButton activeToolId={activeToolId} />
              </div>
            )}

            <TldrawUiToolbar
              orientation="horizontal"
              className="tlui-main-toolbar__tools cowart-custom-toolbar__tools"
              label={msg('tool-panel.title')}
            >
              <TldrawUiRow
                ref={visibleRegionRef}
                className={`cowart-custom-toolbar__visible ${
                  dragUi?.drop?.region === 'visible' ? 'is-drop-target' : ''
                }`}
                data-cowart-toolbar-region="visible"
                data-testid="cowart-toolbar-visible"
              >
                <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
                  {layout.visible.map((toolId) => (
                    <CowartDraggableTool
                      key={toolId}
                      region="visible"
                      toolId={toolId}
                      onClickCapture={handleClickCapture}
                      onPointerCancel={handlePointerCancel}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      {renderTool(toolId)}
                    </CowartDraggableTool>
                  ))}
                </TldrawUiMenuContextProvider>
              </TldrawUiRow>

              <TldrawUiPopover
                id={COWART_TOOLBAR_POPOVER_ID}
                open={isOpen}
                onOpenChange={(nextOpen) => {
                  if (dragSessionRef.current?.active && !nextOpen) return
                  setIsOpen(nextOpen)
                }}
              >
                <TldrawUiPopoverTrigger>
                  <TldrawUiToolbarButton
                    title={msg('tool-panel.more')}
                    type="tool"
                    className="tlui-main-toolbar__overflow cowart-custom-toolbar__more"
                    data-testid="tools.more-button"
                  >
                    <TldrawUiButtonIcon icon="chevron-up" />
                  </TldrawUiToolbarButton>
                </TldrawUiPopoverTrigger>
                <TldrawUiPopoverContent side="top" align="center">
                  <TldrawUiToolbar
                    ref={hiddenRegionRef}
                    orientation="grid"
                    className={`tlui-main-toolbar__overflow-content cowart-custom-toolbar__hidden ${
                      dragUi?.drop?.region === 'hidden' ? 'is-drop-target' : ''
                    }`}
                    data-cowart-toolbar-region="hidden"
                    data-testid="cowart-toolbar-hidden"
                    label={msg('tool-panel.more')}
                    onClick={() => {
                      if (!suppressNextClickRef.current && !dragSessionRef.current?.active) setIsOpen(false)
                    }}
                  >
                    <TldrawUiMenuContextProvider type="toolbar-overflow" sourceId="toolbar">
                      {layout.hidden.map((toolId) => (
                        <CowartDraggableTool
                          key={toolId}
                          region="hidden"
                          toolId={toolId}
                          onClickCapture={handleClickCapture}
                          onPointerCancel={handlePointerCancel}
                          onPointerDown={handlePointerDown}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                        >
                          {renderTool(toolId)}
                        </CowartDraggableTool>
                      ))}
                    </TldrawUiMenuContextProvider>
                  </TldrawUiToolbar>
                </TldrawUiPopoverContent>
              </TldrawUiPopover>
            </TldrawUiToolbar>
          </div>

          {breakpoint < PORTRAIT_BREAKPOINT.TABLET_SM && !isReadonlyMode && (
            <div className="tlui-main-toolbar__tools tlui-main-toolbar__mobile-style-panel">
              <MobileStylePanel />
            </div>
          )}
        </div>
      </div>

      {dragUi && (
        <>
          <div
            aria-hidden="true"
            className="cowart-toolbar-drag-preview"
            data-testid="cowart-toolbar-drag-preview"
            style={{ left: dragUi.point.x + 12, top: dragUi.point.y + 12 }}
          >
            <TldrawUiToolbar
              orientation="horizontal"
              className="cowart-toolbar-drag-preview__toolbar"
              label={msg('tool-panel.title')}
            >
              <TldrawUiMenuContextProvider type="toolbar" sourceId="cowart-toolbar-drag-preview">
                {renderTool(dragUi.toolId)}
              </TldrawUiMenuContextProvider>
            </TldrawUiToolbar>
          </div>
          {dragUi.drop?.marker && (
            <div
              aria-hidden="true"
              className={`cowart-toolbar-drop-marker cowart-toolbar-drop-marker--${dragUi.drop.region}`}
              data-testid="cowart-toolbar-drop-marker"
              style={dragUi.drop.marker}
            />
          )}
        </>
      )}
    </TldrawUiOrientationProvider>
  )
}

/** 为任意 tldraw 工具增加统一的长按拖动外壳，不改变工具本身的 click interface。 */
function CowartDraggableTool({
  children,
  onClickCapture,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  region,
  toolId
}) {
  return (
    <div
      className="cowart-draggable-tool"
      data-cowart-tool-id={toolId}
      data-cowart-tool-wrapper="true"
      data-testid={`cowart-tool-slot-${region}-${toolId}`}
      onClickCapture={onClickCapture}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancelCapture={onPointerCancel}
      onPointerDownCapture={(event) => onPointerDown(toolId, event)}
      onPointerMoveCapture={onPointerMove}
      onPointerUpCapture={onPointerUp}
    >
      {children}
    </div>
  )
}

function containsPoint(rect, point) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

function getCowartToolbarStorage() {
  try {
    return globalThis.window?.localStorage ?? null
  } catch {
    return null
  }
}

/** 生成非纯颜色的固定定位插入标记：横向为竖线，网格为空时为轮廓框。 */
function createDropMarker(regionRect, rects, index, orientation) {
  if (rects.length === 0) {
    return {
      height: Math.max(regionRect.height - 8, 32),
      left: regionRect.left + regionRect.width / 2 - 1.5,
      top: regionRect.top + 4,
      width: 3
    }
  }

  const reference = rects[Math.min(index, rects.length - 1)]
  const placeAfterLast = index >= rects.length
  if (orientation === 'horizontal') {
    return {
      height: Math.max(regionRect.height - 8, 28),
      left: placeAfterLast ? reference.right + 2 : reference.left - 4,
      top: regionRect.top + 4,
      width: 3
    }
  }

  return {
    height: Math.max(reference.height, 28),
    left: placeAfterLast ? reference.right + 2 : reference.left - 3,
    top: reference.top,
    width: 3
  }
}
