# 启动与 macOS 剪贴板性能验证

工具按需加载和 macOS 剪贴板变更检测已实现。主要收益是减少首页加载代码，以及避免剪贴板内容不变时反复解码图片。整机启动耗时改善有限；首次打开 JSON 工具增加约 17 ms。以下是本地源码构建的结果，未安装或发布本次改动。

## 对比结果

启动每个版本测量 10 次；资源场景每个版本测量 3 轮，每轮稳定 2 秒后采样 12 次、间隔 500 ms。启动取 10 次中位数；内存取每轮均值的中位数。

| 指标 | 优化前 | 优化后 | 变化 |
| --- | ---: | ---: | ---: |
| 新进程启动到首页可见且搜索框可用 | 744.21 ms | 721.98 ms | -22.23 ms（-3.0%） |
| 首页进程总 RSS | 459.13 MiB | 451.71 MiB | -7.42 MiB（-1.6%） |
| 窗口隐藏时进程总 RSS | 458.07 MiB | 451.14 MiB | -6.93 MiB（-1.5%） |
| 剪贴板保留 2560×1440 图片时进程总 RSS | 501.48 MiB | 466.53 MiB | -34.95 MiB（-7.0%） |
| JSON 编辑场景进程总 RSS | 491.12 MiB | 490.60 MiB | 基本持平 |
| 首页 renderer JS heap | 5.33 MiB | 3.73 MiB | -30.0% |
| 图片剪贴板场景主进程 CPU | 10.22% | 1.04% | -89.8% |
| 内容不变时，每轮约 6 秒的剪贴板内容读取次数 | 9 次 | 0 次 | 无重复内容读取 |
| 首页入口 JS，未压缩字节 | 817,909 B | 250,569 B | -69.4% |
| 首次打开 JSON 工具 | 15.6 ms | 32.9 ms | +17.3 ms |
| 同进程再次打开 JSON 工具 | 2.8 ms | 3.3 ms | +0.5 ms |

启动范围为优化前 695.92–796.52 ms，优化后 596.92–874.76 ms，明显重叠，不能据此宣称启动速度有稳定、显著提升。首次打开 JSON 的范围为 14.8–17.2 ms 和 30.8–115.3 ms；按需加载把部分初始化成本移到了首次使用。

资源样本的每轮 RSS 均值范围：

| 场景 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 首页 | 457.78–465.32 MiB | 451.70–458.55 MiB |
| 隐藏 | 458.02–465.60 MiB | 450.65–460.82 MiB |
| 图片 | 498.50–507.79 MiB | 466.42–473.87 MiB |
| JSON | 490.87–507.55 MiB | 407.72–491.08 MiB |

JSON 有一轮较低的 RSS，报告仍保留所有原始样本并使用三轮中位数，不把单次低值作为收益。图片场景主进程 private memory 从 98.17 MiB 降至 72.10 MiB；首页此项约为 56.43→55.80 MiB。

## 实现

- `src/renderer/App.tsx`：Launcher 保持立即加载，工具、设置及插件面板使用模块级 `React.lazy`。导航通过 `useTransition` 显示加载状态，避免已有 Suspense 边界在首次切换时引入额外等待。
- `src/renderer/ToolBoundary.tsx`：工具加载失败可以返回首页；独立窗口必须等工具实际挂载、恢复任务完成后才确认交接。移除原先固定 50 ms 的确认计时，目标失败时保留源工具及草稿。
- `src/main/mac-pasteboard.ts` 和 `src/main/platform.ts`：复用现有 Koffi，按需读取 `NSPasteboard.changeCount`，复用 ClipboardService 的 sequence 快速路径。每次调用使用 autorelease pool；桥接失败后返回 null，降级到原有内容轮询，并只记录一次警告。

未改变隐藏窗口生命周期、数据库策略、轮询间隔和唤起逻辑；没有新增依赖。Windows 的原有 sequence 实现保留，未进行 Windows 或 Intel Mac 实机验证。

## 环境与方法

- Apple M3 Pro，36 GiB RAM，arm64，macOS 26.5.2（25F84）。驱动 Node 24.19.0，Electron 44.7.0，Chromium 152.0.7977.130。
- 基线是 `b807c092d3539aebce74107430cc47076394c72a`（0.2.6）。初始工作区包含其他任务尚未完成的更新器改动、类型检查失败，因此改用已提交源码冻结对照；初始快照仍保留，未修复无关内容。
- `.tmp/performance-2026-10-12/before` 与 `after` 使用同一套已安装依赖；已断言生产源码仅上述 4 个文件不同，after 的这些文件与最终工作区一致。每个构建的主进程、renderer 入口和 lock SHA256 已保存。
- 两个版本各预热一次，随后交替执行 before/after，每次新进程和空白隔离数据目录。没有清空 OS 文件缓存，因此这是暖文件缓存条件下的新进程启动，不能等同安装包冷启动。启动数值包含相同 Playwright 驱动开销；renderer ready 的观测时间只是上界，不是 FCP。
- `NEXLET_TEST_MODE=1` 关闭托盘及全局快捷键，资源测试显式启动真实剪贴板轮询。等待应用目录扫描完成；图片是固定 2560×1440 BGRA 图案，JSON 使用固定 200 条记录。没有强制 GC。
- RSS 是 `app.getAppMetrics()` 返回 PID 的 OS RSS 求和，可能重复计算共享页；它不等同 Activity Monitor 的唯一物理内存。剪贴板保护进程不计入应用 RSS。CPU 是主进程 `process.cpuUsage()` 增量除以实际墙钟时间，100% 对应一个逻辑核。
- 每轮已检查采集成功、对应 text/image 历史实际存在、采样期间测试剪贴板未改变。优化后 3 轮首页场景均验证真实系统写入使 changeCount 改变；所有内容不变场景在稳定后读取次数均为 0。

## 验证

最终工作区 HEAD 为 `b21f67c06692bde340847ba6fcd00adff9669974`，包含同期其他功能；本次 4 个生产文件增量在该工作区集成验证。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 27 个文件、150 项测试通过 |
| `npm run build` | 通过，最终工作区首页入口约 250.59 kB |
| `npx playwright test tests/lazy-tools.spec.ts tests/alignment.spec.ts tests/window-behavior.spec.ts` | 15 通过、2 项系统焦点断言失败 |
| 未优化基线重复两项焦点用例 | 同样 2 项失败，窗口可见但 `isFocused()` 为 false |
| `git diff --check` | 通过 |

4 项新增 lazy E2E 和 10 项 alignment E2E 均在最终工作区通过：包含首次/重复打开、失败返回首页、延迟加载不能提前确认交接、目标失败保留草稿，以及 JSON、编码、稿纸、剪贴板和文件搜索的窗口恢复。新增 8 项 unit 覆盖原生桥接延迟初始化、0 序号、失败降级、强制采集、采集中发生变化、失败重试及隐私标记。

两项焦点失败在未优化基线同步复现；本次没有修改对应主进程唤起代码，保留为验证限制。随后恢复启动安装版时，系统工具明确报告 Mac 已锁定、无法自动解锁，支持焦点失败受到运行环境影响的判断，但未直接记录测试失败瞬间的锁屏状态。

早期快照的整组 E2E 还曾在插件加载取消用例中收到 `ERR_FAILED` 而非预期“取消”。最终工作区该项通过；未优化基线针对该项重复 10 次均通过。该偶发失败未能稳定复现，未修改与本次优化无关的插件加载代码。

## 测试清理与限制

首次资源试跑因 macOS 重新编码 PNG、按压缩字节比较产生误判，跳过了剪贴板恢复。已从测试前最近一条 Nexlet 历史恢复 1600×1200 图像并验证像素一致，但最初剪贴板的附加原生格式无法确认。本次最终资源测试修正为像素校验，先将全部可读格式保存在独立保护进程及权限 0600 的恢复文件中；结束后确认 `restored and read-back verified`，再删除该文件。首轮试跑数据不纳入上表。

如果再次测量，应先正常退出已安装 Nexlet，避免测试内容进入用户历史；完成后重新启动原来的安装版。脚本在用户剪贴板有更新时保留更新内容及恢复文件，不强行覆盖。

本轮已尝试恢复启动原安装版，但因 Mac 锁定被系统工具阻止，已通知用户解锁或自行打开。没有安装本次优化构建。

## 证据与复现

- 完整原始样本和最终源码 SHA256：[startup-clipboard-performance-2026-10-12.json](./startup-clipboard-performance-2026-10-12.json)。包含全部 20 次启动、24 轮资源采样及每轮 12 次明细，没有用户剪贴板内容。
- 本地冻结目录及完整基线清单：`.tmp/performance-2026-10-12/`；此目录被 Git 忽略。
- 基准脚本：`scripts/benchmark-performance.mjs`，要求两个目录已经构建完成。不要在采样时并行执行构建或测试。

```sh
node scripts/benchmark-performance.mjs \
  --before=.tmp/performance-2026-10-12/before \
  --after=.tmp/performance-2026-10-12/after \
  --stage=startup --runs=10 \
  --output=.tmp/performance-2026-10-12/startup-results.json

node scripts/benchmark-performance.mjs \
  --before=.tmp/performance-2026-10-12/before \
  --after=.tmp/performance-2026-10-12/after \
  --stage=resources --resource-runs=3 \
  --output=.tmp/performance-2026-10-12/resource-results.json
```
