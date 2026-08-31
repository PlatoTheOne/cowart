import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const COWART_PREFERENCES_VERSION = 1;
const COWART_THEME_PREFERENCES = new Set(["system", "light", "dark"]);
const writeQueues = new Map();

/** 返回不带项目数据的全局空偏好，null 用于识别并迁移旧版 localStorage。 */
export function emptyCowartPreferences() {
  return {
    version: COWART_PREFERENCES_VERSION,
    toolbarLayout: null,
    themePreference: null,
  };
}

/** 解析稳定的 Codex 插件数据路径；测试可以传入独立文件避免污染真实配置。 */
export function resolveCowartPreferencesPath(options = {}) {
  if (options.filePath) return options.filePath;
  if (process.env.COWART_PREFERENCES_PATH) return process.env.COWART_PREFERENCES_PATH;
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  return join(codexHome, "plugins", "data", "cowart", "preferences.json");
}

/** 读取并校验全局偏好；文件不存在、损坏或版本不兼容时安全回退。 */
export async function readCowartPreferences(options = {}) {
  const filePath = resolveCowartPreferencesPath(options);
  try {
    return sanitizeCowartPreferences(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return emptyCowartPreferences();
  }
}

/**
 * 分字段合并偏好并原子落盘。串行队列避免多个已打开画布同时写文件时互相截断。
 */
export async function updateCowartPreferences(patch, options = {}) {
  const filePath = resolveCowartPreferencesPath(options);
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const stored = await readCowartPreferences({ filePath });
      const next = applyCowartPreferencesPatch(stored, patch);
      await writeCowartPreferencesAtomically(filePath, next);
      return next;
    });
  writeQueues.set(filePath, current);
  try {
    return await current;
  } finally {
    if (writeQueues.get(filePath) === current) writeQueues.delete(filePath);
  }
}

/** 只接受已知字段，旧标签页更新主题时不会覆盖工具栏，反之亦然。 */
function applyCowartPreferencesPatch(current, patch) {
  const next = { ...current, version: COWART_PREFERENCES_VERSION };
  if (Object.hasOwn(patch ?? {}, "toolbarLayout")) {
    const toolbarLayout = sanitizeToolbarLayout(patch.toolbarLayout);
    if (toolbarLayout) next.toolbarLayout = toolbarLayout;
  }
  if (Object.hasOwn(patch ?? {}, "themePreference") && COWART_THEME_PREFERENCES.has(patch.themePreference)) {
    next.themePreference = patch.themePreference;
  }
  return next;
}

/** 把磁盘内容收敛到当前版本，避免非法结构进入 Widget。 */
function sanitizeCowartPreferences(value) {
  if (!value || value.version !== COWART_PREFERENCES_VERSION) return emptyCowartPreferences();
  return {
    version: COWART_PREFERENCES_VERSION,
    toolbarLayout: sanitizeToolbarLayout(value.toolbarLayout),
    themePreference: COWART_THEME_PREFERENCES.has(value.themePreference)
      ? value.themePreference
      : null,
  };
}

/** 工具 ID 只保存字符串；具体新增、删除和去重继续由前端布局归一化处理。 */
function sanitizeToolbarLayout(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.visible) || !Array.isArray(value.hidden)) {
    return null;
  }
  if (![...value.visible, ...value.hidden].every((toolId) => typeof toolId === "string")) return null;
  return {
    version: 1,
    visible: [...value.visible],
    hidden: [...value.hidden],
  };
}

/** 同目录临时文件加 rename，保证进程中断时不会留下半截 JSON。 */
async function writeCowartPreferencesAtomically(filePath, preferences) {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(
    directory,
    `.preferences-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
