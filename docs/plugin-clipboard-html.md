# 读取剪贴板 HTML

Nexlet 0.2.36 新增 `nexlet.clipboard.readHTML(): Promise<string | null>`，沿用 `apiVersion: 1` 和现有 `clipboard.read` 权限。插件应检测能力，而不是假设所有 SDK v1 宿主均支持。

```ts
const html = typeof nexlet.clipboard.readHTML === 'function'
  ? await nexlet.clipboard.readHTML()
  : null;
```

返回系统剪贴板第一个 `text/html` 表示的完整 UTF-8 文本；没有 HTML 时返回 `null`，空 HTML 返回空字符串。HTML Blob 超过 2 MiB 时拒绝，避免截断后破坏表格或标签。权限检查在读取剪贴板之前执行，不访问剪贴板历史，不改变原内容。

返回内容不可信，不能直接插入活动文档。插件需清理标签、属性和 CSS，阻止脚本、事件、外部图片和其他资源加载。Excel 的 HTML 表格可用于重建单元格样式和合并关系；纯文本应使用已有 `readText()`，旧宿主也可通过用户粘贴事件获取 HTML。

调用 `readText()` 和 `readHTML()` 是两次读取，不保证来自同一剪贴板版本。需要一致数据时应从同一个 HTML 结果解析完整内容，不将两次读取的内容混合。`readHTML()` 不返回 Office 自定义格式或图表对象。

公开类型位于 `src/shared/plugin-api.ts`；通过 `node scripts/sync-plugin-sdk.mjs` 同步插件仓库。回归测试位于 `tests/plugin-clipboard-html.test.ts`。
