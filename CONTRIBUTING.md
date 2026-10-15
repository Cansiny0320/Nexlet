[简体中文](CONTRIBUTING.md) · [繁體中文](CONTRIBUTING.zh-Hant.md) · [English](CONTRIBUTING.en.md)

# 参与 Nexlet

欢迎提交问题、修复和插件。涉及新功能或数据变化时，先说明使用场景、预期行为与兼容性，再开始大范围实现。

## 开发检查

使用 Node.js 24+，执行 `npm ci`，通过 `npm start` 启动。提交前运行 `npm run typecheck`、`npm test`；桌面行为改动还需在 Windows 运行 `npm run test:e2e`。测试通过不代表所有平台的系统权限流程都已验证，请在 PR 中写明实际平台和范围。

不要提交 `node_modules`、用户数据库、剪贴板、临时测试目录或私人文件。网站产物由 `website/` 自己的规则管理。不要用真实个人数据作为测试夹具或截图。

## 实现约定

- 宿主系统能力集中在 `src/main`，界面只通过受限 preload 调用。
- 外部插件的 manifest、权限、来源和路径边界必须在宿主验证。
- 先确认缺陷根因，优先增加能证明用户行为的回归测试。
- 复用现有类型与 helper，避免将无关重构混入功能提交。
- 修改数据格式时兼容旧数据，说明迁移和回滚方式。
- 同步维护三语言，保留用户内容和标识，遵循 [i18n 说明](docs/i18n.md)。

插件可向 [Nexlet-plugins](https://github.com/Cansiny0320/Nexlet-plugins) 提交，协议见 [Plugin API v1](docs/plugin-sdk.md)。

提交的代码按本项目 MIT 许可证提供；引入第三方组件时保留其原许可证。
