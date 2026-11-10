# Stage 3 适配改造（001 主R）— 复审回补版

- 日期：2026-11-10（回补 S1–S3 后）
- 基线：superagent @ 8c32a9d（HEAD 未变）→ 目标宿主 dsh 0.2.2-rc.1（eta-dsh @ fcc0ad4）
- 状态：**代码改造完成、typecheck 全绿；`vitest` 由 CTO 在 compat 树跑出 1154 过 / 43 失败（分诊为 Windows 环境，`docs.spec` 模块表 1 条归我，已补）；`tsdown` build 未跑（沙箱只读，命令见 §6）**

## 1. 改动清单

| 文件 | 性质 | 说明 |
|---|---|---|
| `src/app/session-history.ts` | 新增 | 全量分页读取 + 三条不变量 + wire 数据校验（本轮按判官打回重写） |
| `src/app/resources.ts` | 修改 | `transcript()` 走 `sessionHistory()`，两处传 `read.signal` |
| `src/app/http.ts` | 修改 | `webServer.port` 可空：未绑定 → 500 + `logger.error`；已绑定异源仍 403 |
| `src/client/deployment.tsx` | 修改 | 去 `mode`；只读 = `status='ready' && !writable` |
| `docs/007-architecture.md` | 修改 | Modules 表登记 `src/app/session-history.ts`（docs.spec 模块表 1 条失败的原因） |
| `tests/fixtures/panel-server.ts` | 修改 | `fakeForm` 去 `mode` |
| `tests/panel-deployment.spec.tsx` | 修改 | 只读用例拆两段：`ready+writable:false` 与 `unavailable`，两段都断言提示 + 禁用 |
| `tests/role-models.spec.ts` | 修改 | `installModelSelection(ctx)` 单参 + `AgentModel` 真投影；保留四条行为断言 |
| `tests/runtime.spec.ts` | 修改 | `agent-preset/selected` 的 session 参数品牌化 |

`git diff --stat 8c32a9d`：8 文件 46 插入 19 删除 + 1 个未跟踪新文件。diff 存证：`研发流程/evidence/stage3/adaptation.diff`。

## 2. 回补：判官打回的 S1–S3 与 wire 校验

`session-history.ts` 现在的行为：

| 编号 | 要求 | 实现 |
|---|---|---|
| S1 | cursor 漂移必须抛错 | 首屏固定 `through = page.cursor`；后续页 `page.cursor !== through` → `HistoryIncomplete`（`history cursor moved from X to Y`） |
| S2 | 页内严格升序 | 逐对检查 `current <= previous` → `HistoryIncomplete`（`history is not ascending`） |
| S3 | 页间不得有缺口 | 向后翻页时要求 `本页最旧 + 1 === 上一页最新`（见下方说明），否则 `history gap` |
| — | 坏数据不得静默跳过/截断 | `durable()` 校验 `type`（非空字符串）、`seq`（非负安全整数）、`time`（有限数）、`data`（非 undefined），任一不合 → 抛错 |

**S3 的实现口径说明（一处需要判官确认的语义）**：判官原文写「新读到的 `oldest.seq` 必须等于上一页最小 seq 减 1」。这条在单事件页成立，但多事件页下应取**新页的最旧事件与上一页最旧事件**做边界比较：

```
第 2 页（较新）: seq 20,21,22      oldest=20
第 1 页（更旧）: seq 13..19        newest=19
要求：newest(旧页) === oldest(新页) - 1   即 19 === 20 - 1
```

实现的是这个边界等式（不假设 seq 从 0 起，也允许页内多事件）。若判官坚持逐字口径，请回一句，我改成「新页每个事件都必需 = 上一页 oldest - pageLength + i」的形式——两者在多事件页下等价，但前者更稳。

另外 `beforeSeq` 排他是协议实测口径（`beforeSeqExclusive=true`），因此 `before = oldest.seq` 不减一。

## 3. 测试迁移记账（判官模板）

| 旧用例名 → 新用例名 | 文件:行 | 原 expect → 新 expect | 理由 | G1 |
|---|---|---|---|---|
| `tells a dsh-superagent that is starting from a browser that cannot write...`（同名，内部拆段） | `tests/panel-deployment.spec.tsx:108` | `publish({mode:'memory',status:'unavailable',writable:false})` → `deploymentReadOnly`；**改为两段**：`{status:'ready',writable:false}` → `deploymentReadOnly`+disabled；`{status:'unavailable',writable:false}` → `deploymentUnavailable`+disabled | `mode` 删除，只读由 `writable` 表达；判官要求两段都留 | G1-06 |
| `lets a later explicit selection win without changing the in-flight assembled step` | `tests/role-models.spec.ts:38` | 原 `defineProperty(host,'current')` → 直接 `append('model/selection')`（原用例本就 append，仅删 host 变更） | `ModelSelectionRef` 删除、`installModelSelection` 单参 | G1-11（条件签，待真机绿） |
| `fakeForm` 快照（fixture） | `tests/fixtures/panel-server.ts:459` | 删除 `mode: 'host'` | 同上 | G1-06 |
| `selects its own preset again for a main Session or worker...` | `tests/runtime.spec.ts:1692` | `emit('agent-preset/selected', sessionId, preset)` → `SessionId(sessionId)` | 事件参数收紧为品牌 `SessionId` | G1-11 |

四条行为断言保留（未改断言）：初始路由=角色模型且不写宿主默认 / 手工选择只影响后续 / 恢复会话不重 resolve / 不可用路由写 selection 前抛错。`resolve`/`flush` 仍是真实 `vi.fn`。

## 4. 分母对齐：809 vs 1197

- **809** = `tests/**/*.spec.{ts,tsx}` 里 `it(` / `test(` 的**声明条数**（不含 `.each` 展开）。
- **1197** = vitest 运行时的**展开用例数**（`numTotalTests`），多出的 388 条来自 15 处 `it.each` 表格按行展开。
- 判据分母应用 **1197**；协议 v1.0 的 809 是声明数，属口径错误，建议判官在 v1.2 里改正。

复现：
```powershell
(Get-ChildItem tests -Recurse -Include *.spec.ts,*.spec.tsx | Select-String '^\s*(it|test)\(').Count   # 809
(Get-ChildItem tests -Recurse -Include *.spec.ts,*.spec.tsx | Select-String '^\s*it\.each\(').Count      # 15 处
# 1197 取自 CTO 的 vitest JSON 报告 numTotalTests（1154 过 + 43 失败）
```

## 5. typecheck 证据

| 步骤 | 日志 | 结果 |
|---|---|---|
| 改造三点后 | `compat-sa/stage3-03-src.log` | `SRC ERRORS=0` |
| 测试迁移后 | `compat-sa/stage3-04-src.log` / `stage3-04-full.log` | `SRC=0 FULL=0` |
| S1–S3 回补后 | `compat-sa/stage3-05-s1s3.log` | `SRC ERRORS=0` |

## 6. 未跑项：`tsdown` build

沙箱对本机两个目录只读（superagent 仓库、eta-dsh `superagent-compat`），`tsdown` 要写 `lib/`，因此我无法在本机跑。命令（在 compat 树内执行，写的是副本）：

```powershell
cd <dsh-workspace>/eta-dsh\superagent-compat
pnpm exec tsdown
```

跑完请把输出贴回，我记入 stage 3 收尾证据；若 tsdown 报缺 tsdown 依赖，说明 compat 树没装 superagent 的 devDeps，需要先 `pnpm install`。

## 7. N rig（G0）布局事实

- `<team-workspace>\g0\host-0.2.1`：eta-dsh @ `dsh-v0.2.1-rc.3`（1f81c047fc）tar 展开，16333 文件，14 个 symlink 条目未展开（全在 docs/snapshots，无源码）。
- `...\superagent-native`：8c32a9d 源码零改动副本，`link-host.mjs` 接线 25 个依赖全命中（`missingInEtaDsh: []`）。
- 安装状态：full install 撞 sheetjs CDN（已摘 `ui-sidebar-documentpreview` 的 `xlsx` devDep，与该包无关）+ pnpm `symlinkAllModules` 栈溢出；hoisted 重试仍在跑，未完成。**G0 未达成**，等安装与 `pnpm run build` 完成。
