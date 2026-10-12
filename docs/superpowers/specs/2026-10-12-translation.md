# 翻译插件设计（2026-10-12，已批准）

## 目标与范围
新增外部翻译插件：Google 免 Key 网页接口与可配置的 OpenAI-compatible Chat Completions。Google 接口已用公开样例验证可达，但不是官方稳定 API。宿主保留 sandbox/CSP，不直接放开 renderer 联网；增加按插件、按目标 origin 授权的 HTTP 桥接，以及插件隔离的加密密钥存储。

## 行为
- 双栏原文/译文，源语言自动检测、目标语言选择、引擎切换、复制、取消；Cmd/Ctrl+Enter 翻译。启动器带入文本但不自动外发。
- 首版非流式请求，单次最多 5000 Unicode 字符；LLM 配置 Base URL、API Key、模型名。远程地址限 HTTPS，本机 localhost/127.0.0.1/[::1] 支持 HTTP 以接入本地兼容服务。
- 用户主动请求时授权目标 origin（宿主可信对话框），按插件持久记录；拒绝任意重定向。无 Cookie/宿主认证凭据；限制请求/响应大小、并发数、超时；关闭、停用插件时取消请求。
- API Key 经系统 safeStorage 加密，普通配置只保存地址/模型等，不保存原文译文；加密不可用时密钥只留当前插件会话。独立密钥空间不允许跨插件读取，卸载选择清理数据时同时清理密钥和目标授权。
- Google 失败不自动外发到 LLM。输入、引擎、语言、配置变更或取消后旧响应不得覆盖新状态。鉴权、限流、网络、格式错误均可见。

## 结构
宿主新增 plugin-network.ts（请求校验、取消、容量和时限）、plugin-secrets.ts（加密与会话存储）；plugins.ts 负责原有调用者鉴权、权限和目标授权，preload 暴露 network/secrets API。翻译协议和 UI 留在 Nexlet-plugins/plugins/translate。扩展 plugin-validation/types、权限文案和 SDK。

## 验收
单元验证网络边界、生命周期取消、密钥隔离、协议解析；Electron 隔离用户目录验证插件导入、配置、翻译、复制、取消、旧响应失效、旧插件仍无法联网。Google 可用公开样例真实验证；LLM 无凭据时用本地兼容服务验证完整合同，不宣称真实供应商验证。

## 交付与限制
本地源码、SDK 文档、可导入 .nexlet 包。更新本地目录条目与最低宿主版本，不发布 Release。保留现有 renderer、website、其他文件搜索和插件测试改动。不 commit/push/发布。旧宿主不支持新权限，需升级宿主；为市场条目指定支持版本。回滚仅移除本次增量；历史密文无需主动清除。
