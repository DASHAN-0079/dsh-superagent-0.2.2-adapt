# stage5 等价性 · 门禁报告（L1 完成，L2 阻塞）

- 判官：2026-11-10
- 对象：A = superagent 8c32a9d + 适配补丁（10 文件改动）+ dsh 0.2.2-rc.1（fcc0ad4）
- 对照：N = superagent 8c32a9d 零改动 + dsh 0.2.1-rc.3（1f81c047fc）
- 状态：**L1 完成；L2 等 `native.json`；L3/L4 受 Windows 边界限制**。结论：尚无 P0/P1 判定，未出总结论。

## L1 接口层（已完成，判据：零未批准变化）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| patch 行（5 个 entry：dsh-superagent / -github / -feishu / worker-preset / router-preset） | `git diff --numstat 8c32a9d -- cordis.patch.yml` | 空 → 未改 |
| 19 工具名与 schema | `git diff --numstat 8c32a9d -- src/app/tools/main.ts src/app/tools/executor.ts` | 空 → 未改 |
| store 键名与 schema | `git diff --numstat 8c32a9d -- src/app/store.ts` | 空 → 未改 |
| 包导出 | `git diff --numstat 8c32a9d -- src/index.ts` + package.json `exports` 深比较 | 空；`exports 相同: true` |
| `dsh.bundle` / `dsh.client.inject` / `scripts` / `files` | package.json 结构化比较 | 四项全 `true` |
| package.json 变更范围 | 规范化所有版本值后深比较 | 唯一差异键 = `engines`（`dsh: ^0.2.1-alpha.2` → `^0.2.2-rc.1`，即计划的锁定）；其余 49/49 行都是版本声明 |
| HTTP 契约 | `src/app/http.ts` 10 行 diff | 唯一变化：端口未绑定 → 500 + 固定日志（已签 G1-08..09）；路由表、`sameOrigin`、`x-orchestrator-request` 未动 |

结论：**L1 无未批准变化**。superagent 对外的接口面（工具、patch、导出、store、路由）与 N 一致；版本声明与 Windows `stateDir` 校验（第 4 点，CTO 已追认）属已批准 `D_adapt`。
证据：`package.json` 493 行结构化比较输出 `版本以外的差异键: ["engines"]`、`exports/bundle/client/scripts/files 全 true`；三个 numstat 空。

## L2 行为层（N 数据已到，判官独立复核）

**结论：零回归，失败集完全一致。** N = 1197（1155 过 / 42 失败），A = 1197（1155 过 / 42 失败，G1 8 条未计入本次）。判官用 `compare-vitest.mjs` 独立比对：**失败集 42=42、集合差为空、differing = 0**。

| 项 | 判官复核 | 结果 |
| --- | --- | --- |
| 用例总数 | `native.json` / `adapted.json` `numTotalTests` | 均 1197；判官比对器早期会把 `cards.spec.ts` 一条重复标题压成 1196，已修（按出现次序编号），现分母 1197 与声明一致 |
| N 零改动 | 判官用 `git archive 8c32a9d src tests` 解包后逐文件 SHA256 对照 `g0/native-manifest.json` | 176/176 一致，0 缺失、0 哈希不符；清单内无 `session-history.ts`（未跟踪新文件没混进 N） |
| 环境同口径 | 元数据 | node `v24.21.0`、pnpm `11.28.5`、宿主 `dsh-v0.2.1-rc.3`(1f81c047fc)、`--pool=forks --maxWorkers=2`、`NODE_OPTIONS=--max-old-space-size=7168` |
| 失败集 | 两份 JSON 逐条取 failed | 按文件完全相同：`service-script` 15、`environment` 7、`sources` 6、`deployment` 5、`commands` 4、`docs` 3、`runtime` 1、`store` 1 |

### 42 条失败逐条定性（依据 failureMessages，不靠猜）

| 原因 | 条数 | 证据 |
| --- | --- | --- |
| Windows 无符号链接权限 | 8 | `EPERM: operation not permitted, symlink …`（deployment 5、environment 2、environment×1 git config） |
| POSIX 命令不存在 | 23 | `env/sh/echo/gh/lark-cli ENOENT`、`sleep EINVAL`、`code 9009`（cmd 找不到）、tmux |
| Windows 路径/引号语义 | 3 | `git config` 断言 `file:"C:\…` vs `file:C:\…`（runtime 1 + environment 1）、文件模式 `[438,438] vs [448,384]`（store 1） |
| Windows `relative()` 反斜杠 | 2 | `docs` 的模块表、测试表：`expected [ 'src\admission.ts', …(110) ]` |
| NSIS 等 | 0 | — |
| 既有文档编号链接违规（与 OS 无关） | 1 | `docs`「links numbered documents only to earlier」24 处违规 |
| **合计** | **42** | 41 条 `ENV-WIN` + 1 条 `BASELINE-RED`，**0 条回归** |

### 那条翻转的原因（Chief 点名，已查清并复核）

根因：**N rig 少拷了 `LICENSE`**。`README.md` 两处 `[MIT](LICENSE)` 解析不到 → `resolves every local link` 在 N 失败；A 仓库根有 `LICENSE`（8c32a9d 跟踪，blob `df5ef0e`）所以通过。

判官独立复核：在 N rig 里用 `node --require <shim> vitest run tests/docs.spec.ts --pool=threads` 重跑 → `resolves every local link` **passed**；同一次里模块表/测试表仍失败（Windows 反斜杠），与定性一致。001 补 `LICENSE` 后 N 由 1154/43 变为 1155/42，与 A 同数。
定性：**N rig 布局缺陷（环境）**，不是 A 侧增益、不是行为差异；按 `N-RIG-DEFECT` 登记，不计回归。

### A 侧正式门禁

`compat-sa/adapted.json` 是加 8 条用例**之前**的（1197）。正式门禁要求 A 用 **1206** 条跑（1197 + 8 `session-history` + 1 `deployment` 路径用例）并带 `--g-only "session-history.spec.ts"` 与 `--g-only "deployment.spec.ts::configuration schema accepts every absolute state path form and rejects relative or drive-relative ones"`（分母仍 1197）。

### 判官本机跑 A 的结果：**无效，不能当门禁**（沙箱伪影，已查清）

判官用了绕法（`.mjs` 配置 + `cacheDir` 指向工作区 + `--pool=threads`）成功产出 `g0/adapted-1205.json`：`total 1206 / pass 1158 / fail 48`。比对出 5 条 `N=passed A=failed` 和 1 条未登记新增，看起来像回归，**但全部是判官沙箱造成的假失败**：

| 伪差异 | 失败原因 | 判定 |
| --- | --- | --- |
| `environment.spec` 5 条（askpass / 凭据设置名 / ticket 目录检查 ×2 / rebase 环境） | `Error: spawn EPERM`（`child_process.spawn` 被沙箱拒） | 沙箱伪影 |
| `deployment.spec::configuration schema accepts every absolute state path form…` | `EPERM: symlink`（该文件 fixture 建符号链接） | 沙箱伪影 + 同时是未登记 G1 |

原因：判官沙箱禁止 `child_process` 起子进程，`--pool=forks` 也会因此起不来，只能退到 `--pool=threads`；而 N 那份是 001 在放开权限的环境跑的，子进程可用。**两次运行环境不同，按我自己的规则就不能互为证据。**

### 正式 A 数据由 001 出（同机同权限，与 N 同参数）

```powershell
$env:NODE_OPTIONS="--max-old-space-size=7168"
pnpm exec vitest run --reporter=json --outputFile="<team-workspace>\g0\adapted-final.json" --pool=forks --maxWorkers=2
```

判官收到后执行：
```powershell
node 评测\scripts\compare-vitest.mjs --native g0\native.json --adapted g0\adapted-final.json `
  --g-only "session-history.spec.ts" `
  --g-only "deployment.spec.ts::configuration schema accepts every absolute state path form and rejects relative or drive-relative ones"
```
期望：`R0 分母 N 1197 / A(扣除 G1 9) 1197`、`未归因差异 0`、`A 缺用例 0`。**在该 JSON 落地前，L2 的正式结论仍是“预结论（1197 子集已 0 差异）”。**

### N rig 环境处置（必须进正文，影响可复现性）

1. `ui-sidebar-documentpreview` 的 `xlsx` 0.20.3 只存在于 sheetjs CDN（npm 上已撤，最高 0.18.5），**永远装不上**；N rig 换 0.18.5 + 1 行 ambient 声明。这是宿主环境处置，不改 superagent。
2. N rig 只构建 host 全量 + superagent 测试实际用到的 8 个 client 包（`tsc -b` 0 错误、7 个 bundle exit 0），**不是 10 gate 全绿**；`ui-slots` 无 bundle 脚本，把 `lib/types` 的 JS 提升到 `lib/`。
3. 结论：N rig 是「测试可跑的等价环境」，不是「完整发布构建」。任何“N 构建通过”的表述必须带这两条限定。

## L3 UI / L4 持久化（边界须写入结论）

- **Windows 上 N 无法启动**：`src/deployment.ts` 旧校验只认 `/^\//`，`C:/…` 直接拒绝 → 插件激活失败。这是第 4 个改动的由来（CTO 已追认，待 ADR 登记 + 四类路径用例）。
- 因此「真机 N vs 真机 A」的 UI/持久化对照在本机不可能执行。N 侧 UI/持久化证据只能来自测试层（L2）与源码级对照；A 侧真机证据已有（3082 监听、面板 200、state API 200、七部件 ready、`repositoryUnset` 为预期）。
- 结论必须写明：**L3/L4 的 A/B 在 Windows 上是“A 真机 + N 测试层/源码”，不是双真机对照**，不得表述为已做双真机验证。

## 待输入（缺一不出总结论）

1. `native.json` + 元数据：node/pnpm 版本、rc.3 tag、完整命令行、`src+tests` SHA256 清单。
2. ADR 第 4 点登记 + 四类路径用例（POSIX `/x`、`C:\x`、`C:/x`、UNC、非法拒绝）。
3. 001 补的「非空页/多页/缺口」transcript 用例落库后的测试名清单（用于并入 G1-01..05）。

## 四层等价结论（判官签字，2026-11-11 凌晨）

**正式数据**：N `g0/native.json` 1197（1155 过 / 42 失）；A `compat-sa/adapted-1205.json` 1206（1163 过 / 43 失）＝1197 基线 + 9 条 G1（8 条 `session-history` 实跑全绿 + 1 条 `deployment` 路径用例）。
**正式比对**：`compare-vitest.mjs --g-only "session-history.spec.ts" --g-only "deployment.spec.ts::configuration schema accepts every absolute state path form and rejects relative or drive-relative ones"` → **R0 分母 1197 / A 扣除 G1 后 1197，一致 1197，差异 0，未归因 0，exit 0**。

| 层 | 结论 | 证据 | 强度 |
| --- | --- | --- | --- |
| L1 接口 | **等价** | patch 行、19 工具名/schema、store 键、包导出、`dsh.bundle`/`client.inject` numstat 全空或深比较相等；唯一变化=端口未绑定 500、版本声明锁 0.2.2-rc.1、Windows `stateDir` 校验（均已追认） | 强等价 |
| L2 行为 | **等价** | 1197 条逐条一致、差异 0；42 条失败两侧完全相同（41 `ENV-WIN` + 1 `BASELINE-RED`）；G1 9 条单列（8 条实跑 pass，1 条 `ENV-WIN` 由直连脚本 4 accept/5 reject 替代判定） | 强等价 |
| L3 UI | **条件等价** | A 真机：3082 监听、面板 200、`state` API 200、七部件 ready、`repositoryUnset` 为预期；N 在 Windows 起不来，无第二真机。等价依据=1197 内 `panel-*` / `client` / `controls` DOM 断言逐条一致 | A 真机 + N 测试层，**非双真机** |
| L4 持久化 | **条件等价** | `store`/`migration` 用例在 1197 内一致（store 1 条失败为 Windows 文件模式，N 同错）；N↔A 数据副本互读未在 Windows 真机执行（N 不可启动），stateDir 布局由测试层覆盖 | A 真机 + N 测试层，**非双真机** |

### 判官结论（直报 CTO）
- **P0 = 0，P1 = 0。** 适配版在 L1/L2 与原生**强等价**；L3/L4 为**条件等价**（A 真机 + N 测试层），原因是 Windows 上原生版无法启动（`deployment.ts` 旧 `/^\//` 校验），这是平台事实，不是本次适配引入。
- **通过门禁**（在下列边界内）：等价性结论适用于「superagent 测试触达的宿主代码 + 本机 Windows 环境」；不得表述为“双真机四层全过”。
- 三条不计入等价判定的待办：① `history_read` 原文恢复属 A 类产品缺口（两 tag 均未实现），归下一阶段；② 分页读取成本/页数未测（只有功能正确性）；③ 真机 L3/L4 双跑需 POSIX 或能启动 rc.3 的环境。

签字：判官 / 2026-11-11
