# Nexlet

接近 uTools 操作习惯的桌面工具箱。首页使用最近 / 固定图标网格，搜索包含应用、系统快捷方式及插件指令，没有市场精选。

## 运行

Windows 可直接运行 `release/Nexlet-0.1.0-Windows-x64.exe`。便携包每次启动会解压运行环境，首次启动稍慢；关闭主窗口后保留托盘，右键托盘选择退出。

开发环境需要 Node.js 24+ 和 npm；CI 使用 `.node-version` 指定的 Node.js 24 LTS。当前工程使用 Electron 44 的异步剪贴板 API，不兼容旧版 Electron 的同步调用方式。

```powershell
npm ci
npm start
```

默认 `Alt+Space` 唤起。若 uTools 等应用已占用，Nexlet 会提示冲突；在右上角头像的设置中改成 `Ctrl+Alt+Space`。不会修改其他应用的快捷键。

## 已实现

- 应用启动：扫描 Windows 开始菜单、桌面的 `.lnk` / `.url` 和已注册 Windows 应用；macOS 扫描 Applications 中的 `.app`。设置中可添加目录。支持中文、拼音和首字母，右键固定到首页。
- 剪贴板：后台记录文本、图片和文件，提供搜索、分类、收藏、复制、外部回贴、独立窗口和悬浮中转。Ctrl/Cmd 或 Shift 多选，文本按选择顺序用换行合并，文件按路径去重。文件历史保存路径，不复制原文件。
- 计算稿纸：逐行计算，多稿纸自动保存；Enter 把结果带入下一行，点击结果复制。Ctrl/Cmd+B 添加备注，Ctrl/Cmd+N 新建。支持颜色、锁定、重命名、删除和复制整张稿纸图片。
- 常用工具：JSON 格式化 / 压缩、时间戳、URL / Base64、UUID、网页快捷方式。
- 插件：导入本地 ZIP 或加载开发目录，独立窗口和独立存储，安装时确认系统能力，支持启停和卸载。使用 Nexlet 自有 API，不兼容 uTools 插件 API。
- 文件输入：将文件拖入主窗口，或粘贴图片，可收进剪贴板视图。
- 系统 / 浅色 / 深色主题；托盘、快捷键唤起与窗口置顶。

计算器支持 `+ - * / ^ %`、括号、`pi / e` 和常见函数。百分号表示除以 100；三角函数使用弧度。计算器使用有复杂度限制的表达式解析器，不执行 JavaScript。查看 `src/shared/calculator.ts` 和对应测试了解完整边界。

## 数据与平台

设置里的“打开数据目录”可找到 `nexlet.sqlite`、`images` 和 `plugins`。Windows 默认在 `%APPDATA%/Nexlet`，macOS 默认在 `~/Library/Application Support/Nexlet`。备份时先退出程序，再复制整个目录。数据以本机可读形式保存，不自动上传；未加入账号、云同步或遥测。

剪贴板默认保留 500 条非收藏记录、30 天；收藏记录不自动清理。暂停记录后仍可查看已有历史。合并复制只支持纯文本或文件组合；图片须单独操作。

自动回贴需要先在目标应用中按快捷键唤起 Nexlet。目标窗口不存在、焦点未恢复或权限不足时会明确报错，内容仍可手动粘贴。macOS 还需要用户在系统设置中授予辅助功能权限。

Windows 已执行本机运行和集成验证。macOS 的应用扫描、剪贴板文件格式、目标应用恢复和权限检查已实现，但此 Windows 工作区没有完成 Mac 真机验证、签名或公证。Linux 仅有基础界面，文件剪贴板及自动回贴未实现。

## 插件开发

在“插件管理 → 加载开发目录”选择 `examples/hello-nexlet`，确认权限后搜索“示例便笺”。示例自动保存文本，并在用户点击时复制文本。

详细 API 和打包规则见 [插件 SDK](docs/plugin-sdk.md)。外部插件运行在 Electron sandbox 中，不能直接访问 Node.js、宿主 IPC 或网络；系统能力必须在 manifest 声明并获安装确认。

## 检查与打包

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run package:win
```

在 Mac 上构建通用架构 DMG：

```sh
npm ci
npm run package:mac
```

`test:e2e` 在 `.tmp` 创建独立用户目录，截图放在 `test-results`；测试会暂时使用系统剪贴板并恢复测试前可读取的文本、HTML、图片或文件列表。原生回贴单独验证，需要测试编辑器保持前台，不能同时操作其他窗口：

```powershell
$env:NEXLET_NATIVE_PASTE='1'
npx playwright test -g '启动器、快捷方式检索与真实启动'
Remove-Item Env:NEXLET_NATIVE_PASTE
```

原生测试首先核对前台窗口的进程 ID，只向自己的测试编辑器发送粘贴。常规集成测试不依赖桌面焦点，但仍会真实启动一个自动关闭的测试编辑器快捷方式。

Windows 包未做代码签名；macOS 正式分发前需要 Apple 签名、公证和真机验证。

## CI 与发版

[Build and Release](https://github.com/Cansiny0320/Nexlet/actions/workflows/release.yml) 在提交 `main`、创建 PR、推送 `v*` 标签或手动运行时执行。Windows x64、macOS Intel 和 Apple Silicon 分别在原生 runner 上运行类型检查、单元测试、打包和实际启动检查；Windows 另运行完整桌面集成用例和便携 EXE 启动检查。

普通提交与手动运行只上传 Actions artifacts，保留 14 天。安装包全部通过检查后会生成 `SHA256SUMS.txt`。macOS CI 包使用 ad-hoc 签名，没有 Developer ID 签名或公证；自动回贴和系统授权流程仍需真机验收。

发版时，先更新 `package.json` 与 `package-lock.json` 的同一版本，提交并推送，然后创建匹配的标签：

```sh
npm version 0.1.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release 0.1.1"
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

标签版本不一致会立即失败。成功后 CI 创建包含三个安装包、示例插件和校验文件的 **Release 草稿**；审核附件及说明后手动发布。重跑可以更新同一草稿，已发布版本不会被覆盖。无需额外 GitHub PAT，发布 job 使用仓库自带的 `GITHUB_TOKEN`；仅该 job 获得 `contents: write`。

工作流配置见 [release.yml](.github/workflows/release.yml)，发行说明模板见 [release-notes.md](docs/release-notes.md)。当前没有配置应用自动更新。

具体测试范围、产物校验值及平台限制见 [验证记录](docs/validation.md)。界面截图位于 `docs/screenshots`。
