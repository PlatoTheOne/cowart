import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  readCowartPreferences,
  updateCowartPreferences,
} from "./cowart-preferences.mjs";

/** 为每个测试建立独立偏好文件，避免触碰用户真实的 Codex 配置。 */
async function withPreferenceFile(run) {
  const directory = await mkdtemp(join(tmpdir(), "cowart-preferences-"));
  const filePath = join(directory, "preferences.json");
  try {
    await run(filePath);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("偏好文件不存在时返回可迁移的空全局偏好", async () => {
  await withPreferenceFile(async (filePath) => {
    assert.deepEqual(await readCowartPreferences({ filePath }), {
      version: 1,
      toolbarLayout: null,
      themePreference: null,
    });
  });
});

test("保存后可读取工具栏布局和主题，并使用原子 JSON 文件", async () => {
  await withPreferenceFile(async (filePath) => {
    const toolbarLayout = {
      version: 1,
      visible: ["text", "arrow"],
      hidden: ["select", "hand"],
    };
    const saved = await updateCowartPreferences(
      { toolbarLayout, themePreference: "dark" },
      { filePath },
    );

    assert.deepEqual(saved, { version: 1, toolbarLayout, themePreference: "dark" });
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), saved);
  });
});

test("损坏或非法偏好会安全回退，不阻断画布启动", async () => {
  await withPreferenceFile(async (filePath) => {
    await writeFile(filePath, "{broken", "utf8");
    assert.deepEqual(await readCowartPreferences({ filePath }), {
      version: 1,
      toolbarLayout: null,
      themePreference: null,
    });

    await writeFile(filePath, JSON.stringify({
      version: 99,
      toolbarLayout: { visible: ["text", 1], hidden: "bad" },
      themePreference: "sepia",
    }), "utf8");
    assert.deepEqual(await readCowartPreferences({ filePath }), {
      version: 1,
      toolbarLayout: null,
      themePreference: null,
    });
  });
});

test("分字段更新不会让旧标签页覆盖另一项新偏好", async () => {
  await withPreferenceFile(async (filePath) => {
    const toolbarLayout = {
      version: 1,
      visible: ["cowart-annotation"],
      hidden: ["select", "hand"],
    };
    await updateCowartPreferences({ themePreference: "light" }, { filePath });
    await updateCowartPreferences({ toolbarLayout }, { filePath });
    await updateCowartPreferences({ themePreference: "dark" }, { filePath });

    assert.deepEqual(await readCowartPreferences({ filePath }), {
      version: 1,
      toolbarLayout,
      themePreference: "dark",
    });
  });
});
