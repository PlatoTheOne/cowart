import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('cowart-toolbar-visible')).toBeVisible()
})

test('短按选择工具，长按可在底部和隐藏区之间移动并跨页面持久化', async ({ page, context }) => {
  const secondPage = await context.newPage()
  await secondPage.goto('/?project=second')
  await expect(secondPage.getByTestId('cowart-tool-slot-visible-eraser')).toBeVisible()

  const textSlot = page.getByTestId('cowart-tool-slot-visible-text')
  await textSlot.getByRole('button').click()
  await expect(textSlot.getByRole('button')).toHaveAttribute('aria-pressed', 'true')

  const eraserSlot = page.getByTestId('cowart-tool-slot-visible-eraser')
  await beginMouseLongPress(page, eraserSlot)
  await expect(page.getByTestId('cowart-toolbar-drag-preview')).toBeVisible()

  const hiddenRegion = page.getByTestId('cowart-toolbar-hidden')
  await expect(hiddenRegion).toBeVisible()
  await moveMouseToCenter(page, hiddenRegion)
  await page.mouse.up()

  await expect(page.getByTestId('cowart-tool-slot-hidden-eraser')).toBeVisible()
  await expect(page.getByTestId('cowart-tool-slot-visible-eraser')).toHaveCount(0)
  await secondPage.getByTestId('tools.more-button').click()
  await expect(secondPage.getByTestId('cowart-tool-slot-hidden-eraser')).toBeVisible()

  await page.reload()
  await page.getByTestId('tools.more-button').click()
  await expect(page.getByTestId('cowart-tool-slot-hidden-eraser')).toBeVisible()

  const hiddenEraser = page.getByTestId('cowart-tool-slot-hidden-eraser')
  await beginMouseLongPress(page, hiddenEraser)
  await moveMouseToCenter(page, page.getByTestId('cowart-toolbar-visible'))
  await page.mouse.up()
  await expect(page.getByTestId('cowart-tool-slot-visible-eraser')).toBeVisible()
  await secondPage.close()
})

test('长按前移动仍进入拖动，Escape 取消后布局不变', async ({ page }) => {
  const drawSlot = page.getByTestId('cowart-tool-slot-visible-draw')
  const box = await drawSlot.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 4)
  await page.waitForTimeout(340)
  await expect(page.getByTestId('cowart-toolbar-drag-preview')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('cowart-toolbar-drag-preview')).toHaveCount(0)
  await page.mouse.up()
  await expect(page.getByTestId('cowart-tool-slot-visible-draw')).toBeVisible()
})

test('触控长按可以把底部工具拖入隐藏区', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:43218/')
  await expect(page.getByTestId('cowart-toolbar-visible')).toBeVisible()
  const source = page.getByTestId('cowart-tool-slot-visible-draw')
  const sourceBox = await source.boundingBox()
  expect(sourceBox).not.toBeNull()
  const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 }

  await source.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 21,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y
  })
  await source.dispatchEvent('pointermove', {
    pointerType: 'touch',
    pointerId: 21,
    buttons: 1,
    clientX: start.x + 8,
    clientY: start.y + 4
  })
  await page.waitForTimeout(340)
  await expect(page.getByTestId('cowart-toolbar-drag-preview')).toBeVisible({ timeout: 1000 })

  const hiddenBox = await page.getByTestId('cowart-toolbar-hidden').boundingBox()
  expect(hiddenBox).not.toBeNull()
  await source.dispatchEvent('pointermove', {
    pointerType: 'touch',
    pointerId: 21,
    buttons: 1,
    clientX: hiddenBox.x + hiddenBox.width / 2,
    clientY: hiddenBox.y + hiddenBox.height / 2
  })
  await source.dispatchEvent('pointerup', {
    pointerType: 'touch',
    pointerId: 21,
    button: 0,
    buttons: 0,
    clientX: hiddenBox.x + hiddenBox.width / 2,
    clientY: hiddenBox.y + hiddenBox.height / 2
  })
  await expect(page.getByTestId('cowart-tool-slot-hidden-draw')).toBeVisible()
  await context.close()
})

test('全部工具隐藏后仍能通过更多入口拖回底部', async ({ page }) => {
  await page.getByTestId('tools.more-button').click()
  const allToolIds = await page.locator('[data-cowart-tool-wrapper="true"]').evaluateAll((elements) =>
    elements.map((element) => element.dataset.cowartToolId)
  )
  await page.evaluate((hidden) => {
    window.localStorage.setItem(
      'cowart.toolbar-layout.v1',
      JSON.stringify({ version: 1, visible: [], hidden })
    )
  }, allToolIds)
  await page.reload()

  await expect(page.getByTestId('tools.more-button')).toBeVisible()
  await page.getByTestId('tools.more-button').click()
  const hiddenSelect = page.getByTestId('cowart-tool-slot-hidden-select')
  await beginMouseLongPress(page, hiddenSelect)

  const visibleRegion = page.getByTestId('cowart-toolbar-visible')
  const visibleBox = await visibleRegion.boundingBox()
  expect(visibleBox).not.toBeNull()
  expect(visibleBox.width).toBeGreaterThanOrEqual(40)
  await moveMouseToCenter(page, visibleRegion)
  await page.mouse.up()
  await expect(page.getByTestId('cowart-tool-slot-visible-select')).toBeVisible()
})

test('主题可在跟随系统、白天和黑夜之间切换并跨项目共享', async ({ page, context }) => {
  const themeToggle = page.getByTestId('cowart-theme-toggle')
  await expect(themeToggle).toHaveAttribute('data-theme-preference', 'system')

  await themeToggle.click()
  await expect(themeToggle).toHaveAttribute('data-theme-preference', 'light')
  await expect.poll(() => page.evaluate(() => window.__cowartEditor.getColorMode())).toBe('light')

  await themeToggle.click()
  await expect(themeToggle).toHaveAttribute('data-theme-preference', 'dark')
  await expect.poll(() => page.evaluate(() => window.__cowartEditor.getColorMode())).toBe('dark')

  const secondPage = await context.newPage()
  await secondPage.goto('/?project=theme-shared')
  await expect(secondPage.getByTestId('cowart-theme-toggle')).toHaveAttribute('data-theme-preference', 'dark')
  await expect.poll(() => secondPage.evaluate(() => window.__cowartEditor.getColorMode())).toBe('dark')
  await secondPage.close()

  await themeToggle.click()
  await expect(themeToggle).toHaveAttribute('data-theme-preference', 'system')
})

test('宿主重新显示画布时主动校准 tldraw viewport', async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.__cowartEditor
    const original = editor.updateViewportScreenBounds.bind(editor)
    window.__cowartViewportRecoveryCalls = 0
    editor.updateViewportScreenBounds = (...args) => {
      window.__cowartViewportRecoveryCalls += 1
      return original(...args)
    }
    window.dispatchEvent(new CustomEvent('openai:set_globals', {
      detail: { globals: { displayMode: 'fullscreen' } }
    }))
  })

  await expect.poll(
    () => page.evaluate(() => window.__cowartViewportRecoveryCalls),
    { timeout: 400, intervals: [40] }
  ).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => window.__cowartEditor.getViewportScreenBounds().width)).toBeGreaterThan(0)
})

test('真实鼠标短按标注按钮会进入标注工具', async ({ page }) => {
  const annotationSlot = page.getByTestId('cowart-tool-slot-visible-cowart-annotation')
  const box = await annotationSlot.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.up()

  await expect.poll(() => page.evaluate(() => window.__cowartEditor.getCurrentToolId())).toBe('cowart-annotation')
  await expect(annotationSlot.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
})

test('标注从目标点指向松开点，并在箭头尖外侧编辑关联的红色文字', async ({ page }) => {
  const drag = await page.evaluate(() => {
    const editor = window.__cowartEditor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.user.updateUserPreferences({ colorScheme: 'dark' })
    editor.setCurrentTool('cowart-annotation')
    const start = editor.pageToScreen({ x: 220, y: 260 })
    const end = editor.pageToScreen({ x: 520, y: 400 })
    return { start, end }
  })

  await page.mouse.move(drag.start.x, drag.start.y)
  await page.mouse.down()
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 8 })
  await page.mouse.up()

  await expect.poll(() => page.evaluate(() => {
    const editor = window.__cowartEditor
    const shapes = editor.getCurrentPageShapes()
    const arrow = shapes.find((shape) => shape.meta?.cowartAnnotationArrow === true)
    const text = shapes.find((shape) => shape.meta?.cowartAnnotationText === true)
    if (!arrow || !text) return null

    const arrowEnd = {
      x: arrow.x + arrow.props.end.x,
      y: arrow.y + arrow.props.end.y
    }
    const dragVector = {
      x: arrow.props.end.x - arrow.props.start.x,
      y: arrow.props.end.y - arrow.props.start.y
    }
    const textVector = {
      x: text.x - arrowEnd.x,
      y: text.y - arrowEnd.y
    }
    const screenOffset = Math.hypot(textVector.x, textVector.y) * editor.getZoomLevel()
    const outwardDot = dragVector.x * textVector.x + dragVector.y * textVector.y

    return {
      arrowColor: arrow.props.color,
      arrowEnd: arrow.props.end,
      arrowId: arrow.id,
      arrowStart: arrow.props.start,
      arrowTextId: arrow.meta?.cowartAnnotationTextId,
      arrowheadEnd: arrow.props.arrowheadEnd,
      editingShapeId: editor.getEditingShapeId(),
      outwardDot,
      screenOffset,
      textArrowId: text.meta?.cowartAnnotationArrowId,
      textColor: text.props.color,
      textId: text.id
    }
  })).not.toBeNull()

  const annotation = await page.evaluate(() => {
    const editor = window.__cowartEditor
    const shapes = editor.getCurrentPageShapes()
    const arrow = shapes.find((shape) => shape.meta?.cowartAnnotationArrow === true)
    const text = shapes.find((shape) => shape.meta?.cowartAnnotationText === true)
    const arrowEnd = { x: arrow.x + arrow.props.end.x, y: arrow.y + arrow.props.end.y }
    const textVector = { x: text.x - arrowEnd.x, y: text.y - arrowEnd.y }
    return {
      arrowColor: arrow.props.color,
      arrowEnd: arrow.props.end,
      arrowId: arrow.id,
      arrowStart: arrow.props.start,
      arrowTextId: arrow.meta?.cowartAnnotationTextId,
      arrowheadEnd: arrow.props.arrowheadEnd,
      editingShapeId: editor.getEditingShapeId(),
      outwardDot: arrow.props.end.x * textVector.x + arrow.props.end.y * textVector.y,
      screenOffset: Math.hypot(textVector.x, textVector.y) * editor.getZoomLevel(),
      textArrowId: text.meta?.cowartAnnotationArrowId,
      textColor: text.props.color,
      textId: text.id
    }
  })

  expect(annotation.arrowStart).toEqual({ x: 0, y: 0 })
  expect(annotation.arrowEnd.x).toBeGreaterThan(0)
  expect(annotation.arrowEnd.y).toBeGreaterThan(0)
  expect(annotation.arrowheadEnd).toBe('arrow')
  expect(annotation.outwardDot).toBeGreaterThan(0)
  expect(annotation.screenOffset).toBeGreaterThanOrEqual(16)
  expect(annotation.screenOffset).toBeLessThanOrEqual(28)
  expect(annotation.arrowColor).toBe('red')
  expect(annotation.textColor).toBe('red')
  expect(annotation.arrowTextId).toBe(annotation.textId)
  expect(annotation.textArrowId).toBe(annotation.arrowId)
  expect(annotation.editingShapeId).toBe(annotation.textId)

  await page.keyboard.type('我的')
  await expect.poll(() => page.evaluate((textId) => {
    const text = window.__cowartEditor.getShape(textId)
    return JSON.stringify(text?.props?.richText ?? {}).includes('我的')
  }, annotation.textId)).toBe(true)
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => window.__cowartEditor.getCurrentToolId())).toBe('cowart-annotation')
})

test('图片拖动优先吸附图片目标，并在松开后清除参考线', async ({ page }) => {
  const dragPoints = await page.evaluate(() => {
    const editor = window.__cowartEditor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createAssets([
      {
        id: 'asset:moving-image',
        type: 'image',
        typeName: 'asset',
        props: {
          name: 'moving.svg',
          src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%2300e013"/%3E%3C/svg%3E',
          w: 100,
          h: 100,
          mimeType: 'image/svg+xml',
          isAnimated: false
        },
        meta: {}
      },
      {
        id: 'asset:target-image',
        type: 'image',
        typeName: 'asset',
        props: {
          name: 'target.svg',
          src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23ffffff"/%3E%3C/svg%3E',
          w: 100,
          h: 100,
          mimeType: 'image/svg+xml',
          isAnimated: false
        },
        meta: {}
      }
    ])
    editor.createShapes([
      {
        id: 'shape:moving-image',
        type: 'image',
        x: 100,
        y: 400,
        props: { w: 100, h: 100, assetId: 'asset:moving-image' }
      },
      {
        id: 'shape:target-image',
        type: 'image',
        x: 300,
        y: 100,
        props: { w: 100, h: 100, assetId: 'asset:target-image' }
      },
      {
        id: 'shape:target-geo',
        type: 'geo',
        x: 298,
        y: 260,
        props: { w: 100, h: 100, geo: 'rectangle' }
      }
    ])
    editor.setCurrentTool('select')
    editor.select('shape:moving-image')
    editor.zoomToFit({ immediate: true })
    const start = editor.pageToScreen({ x: 150, y: 450 })
    const end = editor.pageToScreen({ x: 348, y: 450 })
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } }
  })

  await page.mouse.move(dragPoints.start.x, dragPoints.start.y)
  await page.mouse.down()
  await page.mouse.move(dragPoints.end.x, dragPoints.end.y, { steps: 8 })

  await expect.poll(() => page.evaluate(() => window.__cowartEditor.snaps.getIndicators().length)).toBeGreaterThan(0)
  await expect.poll(() =>
    page.evaluate(() => window.__cowartEditor.getShapePageBounds('shape:moving-image').x)
  ).toBe(300)

  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.__cowartEditor.snaps.getIndicators().length)).toBe(0)
})

test('桌面和移动工具栏保持可用且控制台无新增错误', async ({ page, browser }, testInfo) => {
  const desktopErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') desktopErrors.push(message.text())
  })
  await page.reload()
  await page.getByTestId('tools.more-button').click()
  await expect(page.getByTestId('cowart-toolbar-hidden')).toBeVisible()
  const desktopScreenshot = testInfo.outputPath('cowart-toolbar-desktop.png')
  await page.screenshot({ path: desktopScreenshot })
  await testInfo.attach('cowart-toolbar-desktop', {
    path: desktopScreenshot,
    contentType: 'image/png'
  })
  expect(desktopErrors).toEqual([])

  const mobileContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  })
  const mobilePage = await mobileContext.newPage()
  const mobileErrors = []
  mobilePage.on('console', (message) => {
    if (message.type() === 'error') mobileErrors.push(message.text())
  })
  await mobilePage.goto('http://127.0.0.1:43218/')
  await expect(mobilePage.getByTestId('tools.more-button')).toBeVisible()
  const mobileScreenshot = testInfo.outputPath('cowart-toolbar-mobile.png')
  await mobilePage.screenshot({ path: mobileScreenshot })
  await testInfo.attach('cowart-toolbar-mobile', {
    path: mobileScreenshot,
    contentType: 'image/png'
  })
  expect(mobileErrors).toEqual([])
  await mobileContext.close()
})

async function beginMouseLongPress(page, locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 3)
  await page.waitForTimeout(340)
}

async function moveMouseToCenter(page, locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
}
