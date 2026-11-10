# G0 原生基线环境（001 提供）

- 日期：2026-11-10
- 目标：为 N/A 等价比对提供 rc.3 宿主上的 `native.json` 与可复现环境说明
- 结论：**N = 1197 条 / 1155 过 / 42 失败**；与 A（同口径、扣 G1 前）逐用例比对 **0 差异**

## 1. 环境构成

| 项 | 值 |
|---|---|
| 宿主 | eta-dsh tag `dsh-v0.2.1-rc.3`（commit `1f81c047fc`），`git archive` 展开到 `g0/host-0.2.1` |
| 原生源码 | superagent `8c32a9d` 零改动，位于 `g0/host-0.2.1/superagent-native`（宿主 workspace 成员） |
| 接线 | `link-host.mjs` 把 25 个 `@deepseek-ai/*` 依赖改成 `workspace:*`，`missingInEtaDsh: []` |
| 零改动证明 | `src`+`tests` 共 176 文件与 8c32a9d 归档逐文件 SHA256 **0 差异**（`g0/native-manifest.json`） |
| node / pnpm | `v24.21.0` / `11.28.5` |
| 命令 | `pnpm exec vitest run --reporter=json --outputFile=native.json --pool=forks --maxWorkers=2`，`NODE_OPTIONS=--max-old-space-size=7168` |
| 结果 | `g0/native.json`（1197 total / 1155 passed / 42 failed） |

## 2. 环境处置（两条，必须按正文口径登记）

### 2.1 `xlsx@0.20.3` 永远装不上 → 换 `0.18.5` + 一行 ambient 声明

- 事实：`ui-sidebar-documentpreview` 的 devDep 写的是 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`。SheetJS 已把包从 npm 撤下（npm 上 `xlsx` 停在 0.18.5），而本机到 `cdn.sheetjs.com` 的 TLS 连接直接失败（`SSL connection could not be established`）。
- 处置（只动 N rig 的宿主副本，不动 superagent 源码）：该包 devDep 改 `xlsx@0.18.5`（npm 可获取），并加 `src/client/types-cpexcel.d.ts`：
  `declare module 'xlsx/dist/cpexcel.full.mjs'` —— 该包唯一用到的是把 codepage bundle 传给 `set_cptable`，声明缺省即可。
- 为什么必须这么做：不做这一步，client 编译 gate 直接失败（`xlsx` / `xlsx/dist/cpexcel.full.mjs` TS2307），整条构建链断在这里；而该包与 superagent 的代码路径无关。

### 2.2 N rig 不是 10 gate 全绿构建：host 全量 + 8 个 client 包

- 构建到 client 编译 gate 时，失败点落在 `ui-sidebar-documentpreview`（第三方类型缺口，见 2.1），后续 `client bundle` / `web build` 被 skip。
- 因此 N rig 的实际构建范围是：
  - **host**：`tsc -b tsconfig.host.json` 通过（host gates 4 项 pass，superagent 依赖的 23 个 host 包均有 `lib/index.js`）；
  - **client**：只构建 superagent 测试实际 import 的 8 个包（`dsh-client-locale`、`ui-renderer`、`ui-settings`、`ui-layout`、`ui-sidebar`、`ui-workspace`、`ui-slots`、`ui-plugin-manager`），`tsc -b` 0 错误、7 个 `bundle` exit 0；
  - `ui-slots` 没有 bundle 脚本、全局 client bundle 又被 skip，故把 `lib/types/` 下 tsc 产物提升到 `lib/`，使 `lib/index.js` 存在。
- **影响边界**：N 的 oracle 只覆盖 superagent 测试所触达的宿主代码；未被构建的 client 包（如 documentpreview、web frontend）不在 N 证据范围内。这一条要写进最终结论，不能当作 10 gate 全绿。

## 3. 关于那 1 条“翻转”的归因（已查明并修掉）

首轮比对里 `docs.spec.ts::resolves every local link` 在 N=failed、A=passed。原因**不是 A 改好了链接，而是 N rig 少拷了 `LICENSE`**：

- N rig 的 `README.md` 有两处 `[MIT](LICENSE)`，`LICENSE` 未随源码复制 → 链接解析失败；
- 补 `LICENSE` 后该用例在 N 通过，N 变为 **1155 过 / 42 失败**，与 A 完全一致；
- 这条登记为 **N rig 布局缺陷（环境）**，不计入 A 侧增益。

复现命令：

```powershell
# N rig 内
pnpm exec vitest run tests/docs.spec.ts   # 补 LICENSE 前：3 failed；补后：resolves every local link 通过
```

## 4. 给判官的使用说明

- 分母以 N 运行时数为准（1197）；A 侧须用 1205 条重跑并加 `--g-only "session-history.spec.ts"`。
- N 与 A 必须同机、同 node/pnpm、同 CLI 参数（本轮已对齐：node 24.21.0 / pnpm 11.28.5 / `--pool=forks --maxWorkers=2` / heap 7168）。
- 失败集合会随 spawn/symlink/tmux 环境漂移，比对按用例名逐条，不按计数。
