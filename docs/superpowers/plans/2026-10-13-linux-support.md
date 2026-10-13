# Linux support implementation

已批准 spec: ../specs/2026-10-13-linux-support.md

1. `src/main/linux-desktop.ts`, `catalog.ts`, `index.ts`: XDG 目录/desktop 条目/图标与安全启动。测试覆盖优先级、隐藏覆盖、本地化、环境过滤和参数边界。
2. `linux-platform.ts`, `platform.ts`, `clipboard.ts`, `linux-startup.ts`, `startup.ts`: 文件 URI 格式、X11 回贴验证、Wayland 降级、用户自启动与回读。测试临时目录、空格/百分号路径、缺依赖、目标变化。
3. `linux-search.ts`, `everything.ts`, `Settings.tsx`: 有界可取消文件名遍历，保持已有结果授权机制。测试真实临时文件、范围、超限、取消。
4. `update-transport.ts`, `updater.ts`, `index.ts`, `UpdatePanel.tsx`: AppImage 更新与 deb 下载入口，按平台架构选择资产。验证不选错平台/架构。
5. `package.json`, `.github/workflows/release.yml`, `scripts/prepare-update-metadata.mjs`, `scripts/release-checksums.mjs`, `scripts/smoke-package.mjs`, README: 双架构产物、元数据与 Linux Xvfb smoke。
6. 验证：Node 24 下 focused Vitest、npm run typecheck、npm test、npm run build、git diff --check；Linux 容器中安装依赖、编译打包、Xvfb smoke。构建产生 dist/release/.tmp，容器拉取访问外网但不发布资源。若现有并行工作导致 baseline 失败，仅报告不改无关逻辑。

## 风险与回滚
Wayland portal/后台剪贴板由桌面控制，需真实桌面验证；AppImage 可能需要 FUSE 或解包运行。仅 Linux 平台分支启用新增能力。回滚仅撤销本任务增量，参考 .tmp/linux-support-baseline，不覆盖并行改动。CI 远端执行和发布不在本次授权内。

## 完成情况

六项任务已完成。本地双架构四个安装包已生成，Linux arm64 AppImage/deb X11 smoke 通过；具体结果与未覆盖环境见 `docs/validation/linux-support-2026-10-13.md`。新增 `scripts/package-linux.mjs` 校验并补齐跨架构 koffi 依赖，新增 `scripts/smoke-linux.mjs` 验证原生集成。未执行 Git 收尾或远端发布。
