import assert from "node:assert/strict";
import test from "node:test";

import { inlineWidget } from "./widget-resource.mjs";

test("全屏 Cowart 桥关闭内容自适应尺寸上报", () => {
  const html = inlineWidget({
    html: "<!doctype html><html><head></head><body></body></html>",
    appVersion: "0.0.0-test",
    initialDisplayMode: "fullscreen",
  });
  const bridge = html.match(/<script id="cowartMcpHostBridge">([\s\S]*?)<\/script>/)?.[1] ?? "";

  assert.match(bridge, /\{ autoResize: false \}/);
  assert.doesNotMatch(bridge, /sendSizeChanged\(/);
  assert.doesNotMatch(bridge, /notifyResize/);
});
