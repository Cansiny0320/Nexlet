# i18n 发布验收

2026-10-16，Asia/Shanghai。用户已授权 push、部署及发布新版。

## 桌面 Release

- 正式版本：[Nexlet v0.2.24](https://github.com/Cansiny0320/Nexlet/releases/tag/v0.2.24)，已公开、非 prerelease，公开 latest API 返回该版本。
- 标签源码：`db3e5d5f3d966463e3e04dfff6e5b457ebf89683`。
- [GitHub Actions 38772726049](https://github.com/Cansiny0320/Nexlet/actions/runs/38772726049) 全部成功。正式文件由 CI 构建。
- Windows x64、macOS Intel、macOS Apple Silicon、Linux x64、Linux arm64 的类型检查、单元测试、打包与 packaged smoke 均通过；Windows 便携版 smoke 通过。
- 单元测试 63 个文件、462 项。Windows 集成测试 107 项通过、17 项按平台或环境条件跳过。
- 共 21 个 Release 附件。下载 `SHA256SUMS.txt`，其中 20 个文件的 SHA-256 与 GitHub 上传资产 digest 一致。四份 `latest*.yml` 的版本、文件引用与大小均匹配发布资产。
- 对 8 个公开安装文件执行匿名下载 HEAD 检查，均为 HTTP 200，长度与 Release 元数据一致。

先前 `v0.2.23` 未公开发布。首次 CI 暴露了两个本次迁移引起的问题：打包 smoke 使用中文控件定位，但未显式设置语言；文件浏览器的中文按钮多出空格。修正后使用新标签 `v0.2.24` 验收，未移动或覆盖旧标签。打包 smoke 通过真实持久化设置选择中文；应用默认跟随系统的行为保持不变。

## 插件

合入远端新增的自动发布流程后，候选目录生成保留 manifest 的可选 `locales` 字段。版本、下载 URL 和发布基线由现有 CI 自动更新。

| 插件 | 版本 |
| --- | --- |
| 便笺 / Notes | 1.1.0 |
| 字数统计 / Word Count | 1.1.0 |
| 翻译 / Translate | 1.2.0 |
| Ctool | 1.1.0 |

- 实现提交：`f31aed7410ba1caafb092caf67631ccc52fe6d31`。
- [插件 CI 38771382957](https://github.com/Cansiny0320/Nexlet-plugins/actions/runs/38771382957) 成功，公开 Release 与市场目录均已更新。
- 市场发布提交：`2e88939bf4e6a59473ffdc398cea8e82f32c9580`。
- 合并后本地 37 项插件测试、10 项 Ctool 测试通过，全部插件构建和打包通过。
- 四个公开 `.nexlet` 包均已实际下载，SHA-256、manifest 版本及本地化元数据均与公开记录一致。
- 使用这些公开包、临时用户目录和本次宿主构建完成安装与三语切换，输入保留、系统 locale 含义不变。Ctool 繁体仍按设计回退上游简体。

## 官网

- 正式地址：[nexlet.cansiny0320.chatgpt.site](https://nexlet.cansiny0320.chatgpt.site)。访问范围保持 public。
- GitHub 官网提交：`6f0f3b54ff6bde269da3fc268d0fde8c2c99aee2`。
- Sites 源码提交：`0c23e30f8226770c600afa35d472b375de2fc277`。
- 两份源码 tree 均为 `35dc67d88eba7ac2152f3196b914a36d31738d01`。
- Sites 第 7 版：`appgprj_6acbbb32d78881919f324dcdf9ee6640~appgver_a78abe0975608191985f151cd140e6fa`。
- 部署：`appgdep_6ad108a61a648191ab16057552f494eb`，状态 `succeeded`，时间 2026-10-16 01:09:26 +08:00。
- 保存的 archive content hash：`sha256:9758ec887a3ed5079ef0ec6a9af6788e2662e0cb0a07f5acb3a956c20ea918b1`，64 个文件。
- 中文原路径、英文 `/en/`、繁体 `/zh-Hant/` 共 9 个页面；无 JavaScript 下载兜底也已同步到 0.2.24。仅在 Release 公开且下载可用后部署。
- `pnpm verify`、`pnpm format:check` 通过，18 项单元测试、14 项本地构建产物浏览器测试通过。修复预览 CLI 子进程残留后，浏览器测试命令正常结束，临时预览进程已关闭。
- 线上首轮 14 项中 13 项通过，1 项在页面等待客户端加载时超时。相同失败用例定向复查通过；另做一次真实网络诊断，语言切换及 18 个语言页面 / 宽度组合全部通过，浏览器脚本错误和失败网络请求均为空。最初超时未复现，未将未经证实的原因归为产品修复。

线上验证命令：

```sh
SITE_URL=https://nexlet.cansiny0320.chatgpt.site node --test --test-concurrency=1 tests/releases.browser.mjs tests/site.browser.mjs tests/i18n.browser.mjs
SITE_URL=https://nexlet.cansiny0320.chatgpt.site node --test --test-name-pattern='language links retain' tests/i18n.browser.mjs
```

## 已知验证边界

附加执行 `tests/filesearch-mac.spec.ts` 时，双击 `Calculator.app` 后测试预期仍可操作原结果的“打开所在文件夹”按钮，但现有行为进入应用目录。该用例在原始基线 `65b1287` 的独立临时源码副本中同样失败（1 通过、1 失败、1 未运行），相关目录激活逻辑未被本次修改。保留此既有问题，没有扩展修复范围。

本次没有替换用户日常安装的 Nexlet。桌面原生能力的发布证据来自五平台 CI packaged smoke；本地打包仅用于定位和验证测试语言配置。Google 真实联网翻译仍为可选测试，没有作为本次发布验收结论。
