# dsh-superagent × dsh 0.2.2-rc.1 兼容性错误清单

- 主 R：牛马001（平台轨道）　日期：2026-11-10
- 对象：`dsh-superagent-prototype` @ 8c32a9d（声明 dsh ^0.2.1-alpha.2）→ `eta-dsh` @ fcc0ad4（dsh 0.2.2-rc.1）
- 阶段：群目标 stage 1「拿到兼容性硬证据」——本文件为交付物
- 范围：**只做 typecheck，未改任何代码**（两个仓库均无改动，`git status` 干净）

## 1. 结论

**不兼容，但改造量小。** 全量 `tsc --noEmit`（src + tests）共 **11 个错误**，归为 **7 个根因**（其中 src 侧 4 个根因、6 条报错；tests 侧 3 个根因、5 条报错）。

- 没有一条属于「vendored 版本漂移」：`cordis 4.1.0` / `schemastery 3.19.0` 在两处声明差异上未产生类型错误（见 §6）。
- 真正的破坏全部来自 **0.2.2 的接口演进**：一个方法被删（`SessionController.inspect`）、一个字段被删（`ConfigFormSnapshot.mode`）、一个导出被改名（`ModelSelectionRef`）、两处签名收窄（`webServer.port` 变可选、`installModelSelection` 变单参）、一处 id 品牌类型收紧（`agent-preset/selected`）。
- 编译层面属于「全部报错」而非「部分降级」：当前源码在 0.2.2 下**无法通过 tsc**，因此也无法产物构建、无法安装为 bundle。

## 2. 方法与可复现命令

两套环境都跑过。**权威清单来自单一 cordis 副本的 rig**，理由见 §7。

### 2.1 权威 rig（单一 cordis/schemastery 副本 = 真实安装图）

把源码只读复制到可写区，用 tsconfig `paths` 把 25 个 `@deepseek-ai/*` 依赖直接映射到 eta-dsh 已构建的 `lib/types/*.d.ts`，第三方类型取 eta-dsh 已安装版本。不装依赖、不改代码。

```powershell
pwsh -NoProfile -File C:\Users\yoyok\.dsh\bot\workspace\compat-sa\run-compat-typecheck.ps1
```

输出（2026-11-10 22:5x 实跑）：

```
== src: 6 errors (exit 2)  -> compat-sa\typecheck-src.log
== full: 11 errors (exit 2) -> compat-sa\typecheck-full.log
```

脚本链：`setup-compat.ps1`（复制源码 + 唯一一个类型替身）→ `gen-tsconfig.ps1`（生成 96 条 paths 映射）→ tsc 两次（src / src+tests）。

### 2.2 对照 rig（CTO 的 `eta-dsh/superagent-compat`，`workspace:*` 真装）

```powershell
cd C:\Users\yoyok\.vscode\VSCodeProjects\eta-dsh
pnpm exec tsc -p superagent-compat/tsconfig.json --noEmit --pretty false
```

- 依赖修好前（compat 装了两份 cordis）：`exit 2, 131 errors`，绝大多数是 `Property 'webServer'/'sessionPersistence'/'agents'/'sessionController' does not exist on type 'Context'` 的假阳性，原因见 §7。
- 依赖修好后（compat 的 cordis 指向 `vendor/cordis` 4.1.0，与 dsh 各包同源，单副本）：

```
EXIT=2  ERRORS=11  src=6  tests=5
-> compat-sa\typecheck-chief-compat-rerun.log   （与 §3 清单逐条一致）
```

两条独立路径（paths 映射 rig / 真装 workspace rig）产出**同样的 11 条**，文件、行号、报错原文全同 —— 这是本清单可信的主要证据。

### 2.3 环境替身（已隔离、可审计，不掩盖问题）

- `@types/proper-lockfile` 不在 eta-dsh 依赖图里，用 `compat-types/proper-lockfile.d.ts` 顶上（src 只用到 `lockSync`）。
- tests 的 `vitest` 用 eta-dsh 的 4.1.11（项目锁的是 4.1.8）。这把 63 个「找不到 vitest」连带出的隐式 any 全部消掉；剩余差异见 §5「工具链噪音」。

## 3. 错误清单（逐条）

### A 类：API 不存在 / 被删除或改名（5 条）

| # | 位置 | 报错原文 | 0.2.2 证据 | 修复方向 |
|---|---|---|---|---|
| A1 | `src/app/resources.ts:115` | `error TS2339: Property 'inspect' does not exist on type 'SessionController'.` | `packages/api/session-controller/lib/types/index.d.ts:203` 只有 `events(request: SessionPageRequest, signal: AbortSignal): Promise<SessionEventsPage>`；全仓 d.ts 已无 `SessionController.inspect` | 改 `events()`。地址从裸 `SessionId` 变成 `SessionAddress`：`{ kind: 'session', sessionId }`（`types.d.ts` `SessionAddress`）。`SessionEventsPage.records/events` 形状需按 `SessionEventsPage extends SessionPage` 核对 |
| A2 | `src/client/deployment.tsx:49` | `error TS2339: Property 'mode' does not exist on type 'ConfigFormSnapshot<Record<string, unknown>>'.` | `packages/client/ui-settings/lib/types/client/config-form-types.d.ts:6-30`，字段只剩 `status/value/base/user/revision/writable`；git `23c29d067a`（2026-10-09「persist authenticated browser preferences on the Host」）删掉了 `mode: 'host' \| 'memory'` | `memory` 模式已从模型里消失（远程浏览器偏好也持久化到 Host）。`snapshot?.mode === 'memory'` 应改判 `snapshot.writable`/`status === 'unavailable'`；注意该行 `editable` 已含 `writable`，条件可合并 |
| A3 | `tests/fixtures/panel-server.ts:461` | `error TS2353: Object literal may only specify known properties, and 'mode' does not exist in type 'ConfigFormSnapshot<Record<string, unknown>>'.` | 同 A2 | 删 fixture 里的 `mode` 字段；read-only 用 `writable: false` 表达 |
| A4 | `tests/panel-deployment.spec.tsx:108` | `error TS2353: Object literal may only specify known properties, and 'mode' does not exist in type 'Partial<ConfigFormSnapshot<Record<string, unknown>>>'.` | 同 A2 | 同上 |
| A5 | `tests/role-models.spec.ts:4` | `error TS2724: '"@deepseek-ai/dsh-agent"' has no exported member named 'ModelSelectionRef'. Did you mean 'ModelSelection'?` | `packages/core/agent/lib/types/index.d.ts:13` 只导出 `AgentModel, modelSelectionProjectionDefinition, installModelSelection`；已无 `ModelSelectionRef`，`ModelSelection` 仍在 `types.d.ts:69` | 删掉 `ModelSelectionRef` 导入；角色模型装配已改为 projection（`modelSelectionProjectionDefinition`），fixture 需重写为投影语义，不只是改名 |

### B 类：签名 / 类型变了（3 条）

| # | 位置 | 报错原文 | 0.2.2 证据 | 修复方向 |
|---|---|---|---|---|
| B1 | `src/app/http.ts:237` | `error TS2345: Argument of type 'number \| undefined' is not assignable to parameter of type 'number'.` | `packages/host/webserver/lib/types/index.d.ts:170-171`：`get port(): number \| undefined`，注释「or `undefined` before `listen` binds」 | `sameOrigin(req, ctx.webServer.port)` 收窄：处理器执行时端口已 bind，取值后判空，空则 503/500；或改走 `webServer.url`（未 bind 时抛错，语义更明确） |
| B2 | `tests/role-models.spec.ts:19` | `error TS2554: Expected 1 arguments, but got 2.` | `packages/core/agent/lib/types/model-selection.d.ts:56`：`installModelSelection(agentCtx: Context): () => void` | 第二参（`ModelSelectionRef` host）不再接受；fixture 去掉 host 对象，改用 projection 状态断言 |
| B3 | `tests/runtime.spec.ts:1692` | `error TS2769: No overload matches this call.` | `packages/preset/agent-preset-registry/lib/types/types.d.ts:68`：`'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void` | 事件参数已收紧为品牌类型 `SessionId`，测试里传的 `string` 需 `SessionId(...)` 包一层 |

### C 类：同一根因的级联（3 条，不单独计根因）

| # | 位置 | 报错原文 | 根因 |
|---|---|---|---|
| C1 | `src/app/resources.ts:284`（两处：col 52、col 59） | `error TS7006: Parameter 'event' implicitly has an 'any' type.` / `Parameter 'index' implicitly has an 'any' type.` | A1：`inspect` 不存在 → `transcript()` 返回 `any` → `flatMap` 回调参数失去上下文类型 |
| C2 | `src/app/resources.ts:289` | `error TS7006: Parameter 'event' implicitly has an 'any' type.` | 同上；`map(event => ...)` 的参数来自 `any` |

> 结论：src 侧真正需要改的是 **4 个点**（A1、A2、B1，加上给 A1 补齐类型后的级联自动消失），不是 6 个。

## 4. 影响评估

| 级别 | 项 | 说明 |
|---|---|---|
| P0（阻断） | A1 `inspect` 删除 | 主编排上下文资源读取路径（`ticket/<id>/transcript`、`/message/<n>`）整体失效；不修则 transcript 读不出来 |
| P0（阻断） | A2 `mode` 删除 | 部署页配置表单在 0.2.2 下类型不成立；连带 2 个测试 fixture |
| P1 | B1 `port` 可选 | 同源校验的端口取值需判空，否则行为可能变成「永远 403」或崩溃；属于安全相关路径，必须显式处理 |
| P2（测试侧） | A5/B2/B3 | 仅测试与 fixture；但 `installModelSelection` 从「装 host」改成「投影」是模型路由语义变化，改造时要回归角色模型行为 |

**对「装起来跑」的直接影响**：src 不通过 = `tsdown` 构建不出 `lib/`，bundle 无法安装。所以 stage 2 的「安装跑通」必须先修完 src 侧 3 个点。

## 5. 环境噪音（不计入缺口清单）

1. `@types/proper-lockfile` 缺失 → 用本地替身（§2.3）。这是 devDependency 安装问题，不是 API 破坏。
2. tests 的 `vitest` 4.1.8 → 4.1.11：在未映射 vitest 时产生 63 个 TS2307 + 158 个隐式 any；映射后只剩 §3 的 5 条 tests 错误，无一条指向 vitest API 变化。**测试 DSL 未受影响**。
3. 早期一次跑出 `tests/cards.spec.ts:111` 的 `never` 报错，是 vitest 未映射时的连带产物，映射后消失。

## 6. vendored 版本漂移：本清单中零命中

- `cordis 4.0.5-alpha.1`（superagent 声明）vs `4.1.0`（eta-dsh vendor）：**未产生一条错误**。
- `schemastery 3.18.5-alpha.1` vs `3.19.0`：**未产生一条错误**。
- 需要纠正一个流传中的判断：**`cordis 4.1.0` 里 `Volatile` 没有消失**。`vendor/cordis/lib/types/index.d.ts:16` 有 `export type { Volatile, VolatileSnapshot } from '@deepseek-ai/cosmokit'`，`vendor/cosmokit/lib/types/volatile.d.ts:7` 定义 `interface Volatile<T>`；`packages/client/ui-settings/src/index.ts:4` 正是从 cordis 导入 `Volatile`。所以「4.1.0 删了 Volatile」不成立，不能作为破坏点写进方案卡。
- 漂移的真正风险不在类型，而在**运行时行为**：本清单只证明「类型层面没被这两处漂移打到」，不能证明运行时无行为差异。这需要 stage 3 的安装/运行验证与判官的四层等价判定来兜。

## 7. 关键环境问题：CTO 的 compat workspace 装了**两份 cordis**

证据（同日实测，2026-11-10 22:29-22:35）：

```
pnpm-lock.yaml（superagent-compat 段）
  '@deepseek-ai/cordis':        specifier: 4.0.5-alpha.1   version: 4.0.5-alpha.1
  '@deepseek-ai/schemastery':   specifier: link:../vendor/schemastery
superagent-compat\node_modules\@deepseek-ai\cordis          -> .pnpm/@deepseek-ai+cordis@4.0.5-alpha.1  （registry 版本）
superagent-compat\node_modules\@deepseek-ai\dsh-tools\node_modules\@deepseek-ai\cordis -> 4.1.0  （vendor）
superagent-compat\node_modules\@deepseek-ai\schemastery     -> eta-dsh\vendor\schemastery （3.19.0，单副本，正常）
```

后果：dsh 各包声明 `"@deepseek-ai/cordis": "workspace:~"` → 解析到 vendor 4.1.0；compat 包装了 registry 的 4.0.5-alpha.1。`Context` 的 service 注入增强（`declare module '@deepseek-ai/cordis'`）只作用于各自那份 cordis，于是 compat 包里 `ctx.webServer`/`ctx.sessionController`/`ctx.agents`/`ctx.sessionPersistence` 全部「不存在」，再级联出 `'session/event'` 不在 `keyof Events`、`vi.fn` 参数隐式 any 等——**131 个错误里约 120 个是假的**。

根因要说清楚：**eta-dsh 的 `pnpm-workspace.yaml` 的 `overrides` 只有 cosmokit 和 schemastery，没有 cordis**。所以「cordis 保留 4.0.5-alpha.1、靠根目录 overrides 链到 vendor 4.1.0」这条机制对 cordis 并不成立；schemastery 那半条是成立的（确实链到了 vendor 3.19.0）。

且当前状态是**锁文件/安装树落后于 package.json**：

```
superagent-compat\package.json  mtime 22:31:47  -> cordis 已改为 workspace:*
node_modules 链建好时间          22:28:56        -> 但仍是 4.0.5-alpha.1
```

两条修法（都要 CTO 拍板，我没动 eta-dsh 任何文件）：

- 方案甲（推荐，零配置改动）：package.json 既然已经是 `workspace:*`，直接在 eta-dsh 根目录重跑一次 `pnpm install --frozen-lockfile=false`，让 cordis 链到 vendor 4.1.0；然后重跑 §2.2 命令，132 条假阳性应消失、剩下的应与我这份权威清单重合。
- 方案乙：在 `pnpm-workspace.yaml` 的 `overrides` 加 `'@deepseek-ai/cordis': 'link:vendor/cordis'` 再 install。注意这会改动隔离基线 eta-dsh 的工作区配置（是否算「改 dsh 本体」，按纪律由 CTO 判定）。

在重装之前，**请勿使用 `pnpm exec tsc -p superagent-compat/tsconfig.json` 的输出做缺口统计或验收依据**。

### 7.1 已复核（同日 22:4x）

compat 的 `@deepseek-ai/cordis` 已指向 `eta-dsh\vendor\cordis`（4.1.0），两份变一份后重跑：

```
pnpm exec tsc -p superagent-compat/tsconfig.json --noEmit --pretty false
EXIT=2  ERRORS=11  src=6  tests=5   (compat-sa\typecheck-chief-compat-rerun.log)
```

假阳性全部消失，余下 11 条与 §3 逐条一致。**双副本问题已闭环。**

## 8. 复现与门禁建议

```powershell
# 权威清单（单副本 cordis）
pwsh -NoProfile -File C:\Users\yoyok\.dsh\bot\workspace\compat-sa\run-compat-typecheck.ps1
# 单测（需先装依赖，当前受沙箱限制不可写 superagent 仓库）
# pnpm -C C:\Users\yoyok\.vscode\VSCodeProjects\dsh-superagent-prototype test
```

建议判官门禁先用 `src` 程序作为「编译等价」基线：改造后 src 必须 0 错误；tests 允许并行修，但不作为门禁前置条件。

## 9. 未做 / 待办

- 未改代码，未安装依赖（沙箱禁止写入两个仓库），未跑单测、未构建 `lib/`、未安装 bundle。
- 未对 0.2.1-rc.3 原生基线做同口径 typecheck（等 CTO 的 A/B 环境就绪）——所以「这 11 条是新增破坏」目前是相对 `dsh 0.2.2-rc.1` 声明的判断，不是相对 0.2.1 基线的增量 diff。
- 下一步（stage 2，待方案卡定接口骨架后）：A1 的 `events()` 请求形状、A2 的只读判定口径、B1 端口判空策略，三个点都需要明灯先把接口契约定死再动手。
