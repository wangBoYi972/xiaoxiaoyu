/**
 * 编辑器模型登记表
 * ────────────────────────────────────────────────────────────
 * 为什么需要它：
 *   1. Monaco 的 model 是「一个文件一份」，挂在 `monaco.Uri.file(path)` 上。
 *      不 dispose 就是内存泄漏（模型 + 撤销栈都留着）。
 *   2. 但也不能在组件卸载时 dispose —— 切标签页会卸载 FileEditor，
 *      那样撤销历史和未保存内容就全没了。
 *   所以：卸载不销毁，**关标签页时**才销毁。
 *
 * 这个模块刻意不 import monaco：TabBar 只是关个标签，
 * 不应该因此把 5MB 的 monaco 拉进它的 chunk。
 */

/** path → 销毁函数（由 FileEditor 注册） */
const disposers = new Map<string, () => void>();

/** path → 已保存时的 Monaco alternativeVersionId（用来判断脏标记） */
const savedAltVersionId = new Map<string, number>();

export function registerModel(path: string, dispose: () => void) {
  disposers.set(path, dispose);
}

export function unregisterModel(path: string) {
  disposers.delete(path);
}

/**
 * 关闭文件时调用：销毁模型、清掉脏标记记录。
 * 找不到对应模型也没关系（比如文件还没被打开过）。
 */
export function disposeModelFor(path: string) {
  const dispose = disposers.get(path);
  if (dispose) {
    try {
      dispose();
    } catch {
      // 销毁失败不该阻断关标签
    }
    disposers.delete(path);
  }
  savedAltVersionId.delete(path);
}

export function disposeAllModels() {
  for (const path of Array.from(disposers.keys())) disposeModelFor(path);
}

export function getSavedAltVersionId(path: string): number | undefined {
  return savedAltVersionId.get(path);
}

export function setSavedAltVersionId(path: string, id: number) {
  savedAltVersionId.set(path, id);
}
