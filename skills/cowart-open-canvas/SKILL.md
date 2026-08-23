---
name: cowart-open-canvas
description: Open or refresh the native Cowart canvas. Whenever the user explicitly invokes Cowart or any Cowart skill applies, load the cowart_mcp MCP server and call its render_cowart_canvas_widget tool before any other Cowart work.
---

# Cowart Open Canvas

The actual canvas-opening capability is the `cowart_mcp` MCP server and its `render_cowart_canvas_widget` tool. This skill documents the orchestration; it is not the implementation that renders the canvas. Treat an explicit `@Cowart` invocation as sufficient reason to load `cowart_mcp`, even when the remaining user text is short or ambiguous. Do not begin other Cowart work until `render_cowart_canvas_widget` has opened or refreshed the native canvas for the active project.

## Workflow

1. Ensure the `cowart_mcp` MCP server is loaded or discoverable and that its `render_cowart_canvas_widget` tool is available. The host may expose the complete tool name as `mcp__cowart_mcp__render_cowart_canvas_widget`. Call the tool to open or refresh the canvas as a native Codex widget. Pass the user's active Codex workspace as `projectDir`; do not pass the Cowart plugin repository directory.

```json
{
  "projectDir": "/absolute/path/to/user/codex-project"
}
```

The tool returns `openai/outputTemplate: ui://widget/cowart/canvas.html`, which tells Codex to render the widget directly. Do not start `scripts/start-canvas.sh` or open a localhost URL for normal use.

2. Confirm the widget opens for the user. The canvas data is stored in the active project:

```text
canvas/pages/<page-id>/cowart-canvas.json
canvas/pages/<page-id>/assets/
```

3. If the MCP tool is not visible in the current turn, use tool discovery for Cowart widget/render capabilities and retry within the same task after an explicit Cowart canvas invocation. Do not claim that a new task is required merely because one turn did not expose the tool. Only suggest a new Codex task when the plugin was just installed or upgraded and the MCP schema is still unavailable after discovery and an explicit retry.

## Constraints

Do not launch the old local web service, inspect canvas files, run builds, check storage layout, take screenshots, or perform other validation steps unless opening the widget fails or the user explicitly asks for those checks. The `scripts/start-canvas.sh` path is now only a local-development fallback.
