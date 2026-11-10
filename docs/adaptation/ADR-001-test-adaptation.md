# ADR-20261110-001 · 目标宿主测试 fixture 的最小迁移

- 状态：提议；明灯提交于2026-11-10；Chief和判官尚未签字。
- 适配目标：仅 dsh 0.2.2-rc.1 @ fcc0ad4。N组 rc.3仅为对照。
- 关联：《技术方案卡》、《评测协议 v1.4》。

## 背景

协议冻结原始809项测试；Chief同时明确要求把与目标宿主不匹配的测试随代码迁移。原始N组保持源码和测试零产品改动，A组的宿主fixture需要受审查的最小变更，否则会把宿主API失配误当业务回归，或反过来通过删断言掩盖差异。

## 提议决策

仅审查以下A组变化，不修改N组或比较器：

- [模型测试](../../tests/role-models.spec.ts)：移除 ModelSelectionRef；以真实 SessionProjectionRegistry、modelSelectionProjectionDefinition、AgentModel 和单参 installModelSelection 接线。保留角色默认、手工切换、在途固定、恢复和无效路由的业务断言；记录每个旧测试名到新测试名的一一对应。
- [面板 fixture](../../tests/fixtures/panel-server.ts)与[部署测试](../../tests/panel-deployment.spec.tsx)：删除mode；只读用ready+writable=false，不可用另用unavailable。原文案与禁用断言保留。
- [运行测试](../../tests/runtime.spec.ts)：只把指定事件的sessionId构造成品牌ID，不改事件名称、payload值和断言。
- 新增history/HTTP增量用例放入单独文件；若既有mock曾直接提供inspect，只将其接线成真实events页结构，必须另报精确diff给判官，不在本ADR中给任意测试修改授权。

判官审核每项diff与业务断言映射，按协议决定原始冻结集分母如何记账，并把排除项与替代用例全部列出。变更测试不能直接算作“原809项未经改变全过”；不得改compare脚本、全局skip或降低阈值来获得通过。

## 备选与影响

不迁移fixture会保留与目标不存在的API耦合；把全部测试改成mock或修改oracle会失去等价证明。选择仅迁移A组宿主接线，业务断言保持并增加真实projection覆盖。该决策不修改dsh本体，不授权改变业务、权限或持久化语义。

## 回滚和验收

保存原测试SHA、精确diff、旧新测试名映射及每条断言。未获判官认可的变更不得计入已通过结果；失败时还原该fixture补丁并修复适配层，保留未通过记录。最终效果结论由判官签字，Chief审批交付。

## 判官审核结论（2026-11-10）

**范围结论：原则批准；逐条 diff 未提交前，任何迁移都不算“已签”，不得计入 809 分母的通过数。**

审核依据：8c32a9d 的 `tests/role-models.spec.ts`、`tests/fixtures/panel-server.ts:461`、`tests/panel-deployment.spec.tsx:108`、`tests/runtime.spec.ts:1692` 原文，以及本 ADR 的改动描述。

### 逐项裁定

| ADR 项 | 裁定 | 条件 |
| --- | --- | --- |
| `role-models.spec.ts` 改真实 projection + `AgentModel` + 单参 `installModelSelection` | **有条件批准** | 四条行为断言必须逐条保留：①角色初始路由=角色模型且不写宿主默认；②手工选择只影响后续步骤、在途步骤固定；③恢复会话（header/selection 两种）不重新 resolve；④宿主未设时继承宿主、不可用路由在写 selection 前抛错。允许改装配，禁止把 `resolve`/`flush` 改成永远返回预期值的桩；若 projection 表达不了“宿主默认”，必须用真实宿主持久化状态构造，不许 mock 成断言值。 |
| `panel-server.ts` 删 `mode`（`fakeForm` 快照） | **批准** | fixture 自身无断言，`mode:'host'` 仅是类型必需字段；删字段即可，`writable` 参数语义不变。 |
| `panel-deployment.spec.tsx:108` 的 `mode:'memory'` 场景 | **有条件批准** | 原组合 `mode:memory + status:unavailable + writable:false` 断的是“浏览器只读”。目标状态机下 `unavailable` 会先命中 `deploymentUnavailable`，所以必须拆成两段：`status:'ready', writable:false` → `deploymentReadOnly` 且控件禁用；`unavailable` → `deploymentUnavailable` 且控件禁用。**两段都要保留**，不许只留一段。该用例的“只读不 mutate”断言必须保留。 |
| `runtime.spec.ts:1692` 事件 `sessionId` 包品牌 `SessionId` | **批准** | 只加 `SessionId(...)` 包装；事件名、payload 值、断言一律不动。 |
| 新增 history/HTTP 用例放单独文件 | **批准** | 计入 G1，不计入 809 分母；禁止改既有 809 用例来“顺带”覆盖 history。 |
| 既有 mock 若直接造 `inspect`，只接线成真实 `events` 页结构 | **另行报批** | 本 ADR 不给该授权。提交精确 diff + 断言对照后单独签。 |

### 打回线（触线即 P0-5）
- 删除或弱化任一 `expect` 行为断言、改断言语义；
- 新增 `.skip` / `.only` / `.todo`，或删除用例；
- 把真实校验改成永远返回预期值的 mock；
- 改 `compare-vitest.mjs`、白名单或阈值来获得通过；
- 未提交 diff 就宣称“已按 ADR 迁移”。

### 提交模板（001 每条迁移一行）
`旧用例名 → 新用例名 | 文件 | 原 expect 行 → 新 expect 行 | 理由 | 对应 G1 编号`；附原测试 SHA 与精确 diff。

- 判官签字：判官 / 2026-11-10（范围批准，逐条 diff 待签）
- Chief 审批：待批
- 状态：本附录生效后，ADR 正文“判官尚未签字”作废，以本节为准。

## 第 4 个源码改动点（CTO 2026-11-10 追认）

- **文件**：`src/deployment.ts:13`
- **原**：`s.string().pattern(/^\//)` —— `stateDir` 只接受 POSIX 绝对路径
- **新**：`s.string().pattern(/^(\/|[A-Za-z]:[\\/]|\\\\)/u)` —— 接受 `/…`、`C:\…`、`C:/…`、`\\host\share…`；拒绝相对路径、`C:state`（驱动器相对）、单个 `\`
- **原因**：Windows 上 `stateDir: C:/…` 校验失败，插件无法激活，是 stage 4 唯一硬阻塞；属平台必需修复，不是扩大范围
- **影响面**：仅 DSH 配置校验层，无运行时行为变化，模型可见面（prompt/tool/transcript）不变
- **测试**：`tests/deployment.spec.ts` 新增「accepts every absolute state path form and rejects relative or drive-relative ones」（4 accept / 5 reject）。该文件在 Windows 上因 `symlinkSync EPERM` 整体登记 ENV-WIN，故另用 `config-path-check.ts` 直接断言：`RESULT failures=0`
- **记账**：方案卡写 3 个 src 点，实际 4 个；本条即账外项的登记，避免“说 3 改 4”
