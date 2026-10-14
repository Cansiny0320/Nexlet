export const pages = [
  {
    path: '/',
    className: 'home-page',
    title: 'Nexlet — 常用工具，随叫随到',
    description:
      'Nexlet 是面向 Windows 和 macOS 的桌面工具箱。搜索应用、管理剪贴板、逐行计算，使用 JSON 等开发工具。直接下载 Nexlet 预览版。',
  },
  {
    path: '/download/',
    className: 'download-page',
    title: '下载 Nexlet — Windows 与 macOS 预览版',
    description:
      '下载 Nexlet：Windows x64 便携 EXE、macOS Apple Silicon 与 Intel DMG。查看安装步骤、版本说明与权限要求。',
  },
  {
    path: '/plugins/',
    className: 'plugins-page',
    title: '插件开发 — Nexlet Plugin API v1',
    description:
      '用 HTML、CSS、JavaScript 和 Nexlet Plugin API v1 创建桌面插件。了解独立存储、剪贴板文本、外部链接与沙箱，查看可运行示例。',
  },
] as const;
