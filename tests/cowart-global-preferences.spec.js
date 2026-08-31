import { expect, test } from '@playwright/test'

/**
 * 给页面挂入最小 Cowart MCP 桥。两个隔离浏览器上下文共用 Node 侧偏好，模拟跨对话打开。
 */
async function installPreferenceBridge(page, preferenceState, projectDir) {
  await page.exposeBinding('__cowartTestCallServerTool', async (_source, request) => {
    if (request.name === 'get_cowart_canvas_state') {
      return {
        structuredContent: {
          snapshot: null,
          viewState: null,
          storage: 'test',
          preferences: preferenceState.value
        }
      }
    }
    if (request.name === 'save_cowart_preferences') {
      preferenceState.value = {
        ...preferenceState.value,
        ...request.arguments.preferences,
        version: 1
      }
      return { structuredContent: { preferences: preferenceState.value } }
    }
    return { structuredContent: { ok: true, storage: 'test' } }
  })
  await page.addInitScript(({ targetProjectDir }) => {
    window.openai = { toolOutput: { projectDir: targetProjectDir } }
    window.cowartMcp = {
      callServerTool(request) {
        return window.__cowartTestCallServerTool(request)
      }
    }
  }, { targetProjectDir: projectDir })
}

test('不同 origin 的隔离浏览器存储仍共享工具栏和主题偏好', async ({ page }) => {
  const preferenceState = {
    value: { version: 1, toolbarLayout: null, themePreference: null }
  }
  await installPreferenceBridge(page, preferenceState, 'D:/projects/shared')
  await page.addInitScript(() => {
    if (location.hostname !== '127.0.0.1') return
    localStorage.setItem('cowart.toolbar-layout.v1', JSON.stringify({
      version: 1,
      visible: ['cowart-annotation', 'text'],
      hidden: ['select', 'hand', 'ai-image', 'ai-draft', 'ai-slides', 'asset', 'draw', 'eraser', 'arrow']
    }))
    localStorage.setItem('cowart.theme-preference.v1', JSON.stringify({ version: 1, preference: 'dark' }))
  })
  await page.goto('http://127.0.0.1:43218/')
  await expect(page.getByTestId('cowart-toolbar-visible')).toBeVisible()
  await expect.poll(() => preferenceState.value.themePreference).toBe('dark')
  await expect.poll(() => preferenceState.value.toolbarLayout?.visible).toEqual(['cowart-annotation', 'text'])

  await page.goto('http://localhost:43218/?project=second-origin')
  await expect(page.getByTestId('cowart-toolbar-visible')).toBeVisible()
  await expect(page.getByTestId('cowart-tool-slot-visible-cowart-annotation')).toBeVisible()
  await expect(page.getByTestId('cowart-tool-slot-visible-text')).toBeVisible()
  await expect(page.getByTestId('cowart-tool-slot-visible-select')).toHaveCount(0)
  await expect(page.getByTestId('cowart-theme-toggle')).toHaveAttribute('data-theme-preference', 'dark')
})

test('普通箭头、文字和方框每次启动默认使用红色', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('cowart-toolbar-visible')).toBeVisible()

  const colors = await page.evaluate(() => {
    const editor = window.__cowartEditor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShapes([
      { id: 'shape:default-arrow', type: 'arrow', x: 80, y: 80, props: { end: { x: 120, y: 60 } } },
      { id: 'shape:default-text', type: 'text', x: 80, y: 180, props: { richText: { type: 'doc', content: [] } } },
      { id: 'shape:default-box', type: 'geo', x: 80, y: 260, props: { geo: 'rectangle', w: 120, h: 80 } }
    ])
    return ['shape:default-arrow', 'shape:default-text', 'shape:default-box']
      .map((id) => editor.getShape(id)?.props?.color)
  })

  expect(colors).toEqual(['red', 'red', 'red'])
})
