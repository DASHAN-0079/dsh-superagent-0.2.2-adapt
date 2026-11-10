# Stage 4 安装并跑通（001 主R）

- 日期：2026-11-10
- 隔离 home：`<isolated-dsh-home>`（未触碰 `<original-dsh-home>`）
- 目标宿主：eta-dsh @ fcc0ad4（dsh 0.2.2-rc.1，源码模式启动）
- 结论：**profile 安装成功并启动，面板可访问；运行时错误码为 0**（只有首次部署未配 GitHub 仓库的 `repositoryUnset`，属预期 setup 状态）

## 1. 安装路径（不走 registry）

0.2.2-rc.1 的 `@deepseek-ai/*` 未发布 npm，profile 的 `pnpm install` 解析不到 peer。按 CTO 给定方案，profile 依赖全部用 `link:` 指向真实目录（realpath 与宿主同一份，满足 G1-10 单实例）：

`<isolated-dsh-home>\profiles\superagent\package.json`

```json
"dependencies": {
  "dsh-superagent": "link:C:/…/eta-dsh/superagent-compat",
  "@deepseek-ai/cordis": "link:C:/…/eta-dsh/vendor/cordis",
  "@deepseek-ai/schemastery": "link:C:/…/eta-dsh/vendor/schemastery",
  "@deepseek-ai/dsh-llm": "link:C:/…/eta-dsh/packages/llm/llm",
  "@deepseek-ai/dsh-scope": "link:C:/…/eta-dsh/packages/core/scope"
},
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-superagent"] } }
```

profile 内 `pnpm install`：

```
+ @deepseek-ai/cordis 4.1.0 <- …\vendor\cordis
+ @deepseek-ai/dsh-llm 0.2.2-rc.1 <- …\packages\llm\llm
+ @deepseek-ai/dsh-scope 0.2.2-rc.1 <- …\packages\core\scope
+ @deepseek-ai/schemastery 3.19.0 <- …\vendor\schemastery
+ dsh-superagent 0.1.0 <- …\eta-dsh\superagent-compat
Done in 243ms
```

Bundle 构建（compat 树，源码同步自真实仓库后）：`pnpm exec tsdown` → `Build complete in 3630ms`，exit 0。

## 2. profile 配置

`profiles/superagent/cordis.patch.yml`：

```yaml
- id: webserver
  config: { host: 127.0.0.1, port: 3082 }
- id: dsh-superagent
  config: { stateDir: <isolated-dsh-home>/state/superagent }
```

## 3. 启动结果

```
dsh web: http://127.0.0.1:3082/?token=<token>
```

- 启动日志**无** `did not activate`、无 `ValidationError`（此前 stateDir 因 `/^\//` 校验失败，见 §5）。
- 监听：`Get-NetTCPConnection -LocalPort 3082 -State Listen` → 1 条，`127.0.0.1:3082`。
- 面板：`GET http://127.0.0.1:3082/?token=…` → **HTTP 200**，40994 bytes。
- `GET /orchestrator/api/state`（带 `x-orchestrator-request: 1` 与同源 Host/Origin）→ **HTTP 200**：

```json
setup: { "machine": { "stateDir": "<isolated-dsh-home>/state/superagent", … },
         "problem": { "place": "github", "code": "repositoryUnset", "detail": "The GitHub Source names no repository." } }
load:  { "running": 0, "queued": 0, "maxWorkers": 3 }
paused: false
health: runtime=paused(setupPending), github=paused(setupPending),
        relay/notice/launch/delivery/assessment/reply/evals=ready
```

`repositoryUnset` 是全新部署未配 GitHub 仓库时**预期**的 setup 状态（等价于 status 脚本 exit 3「runs and waits for setup」），不是运行时错误。

## 4. status 脚本：POSIX-only，Windows 不可用（ENV-WIN）

```
python scripts/dsh-superagent status
→ ModuleNotFoundError: No module named 'fcntl'   (exit 1)
```

脚本 `import fcntl`（POSIX 文件锁）且依赖 tmux，Windows 上跑不了。按群约束登记 `ENV-WIN`，替代判定用 §3 三项（监听 / 面板 200 / state 的 `setup.problem` + `health`）。**未为了本地变绿去改这个脚本。**

## 5. 新增的第 4 个源码适配点（需 CTO/明灯追认）

`src/deployment.ts:13` 原为 `s.string().pattern(/^\//)`——`stateDir` 只接受 POSIX 绝对路径，Windows 的 `C:/…` 被拒，插件无法激活（stage 4 的唯一硬阻塞）。改为：

```ts
const absolute = (description: string) => s.string().pattern(/^(\/|[A-Za-z]:[\\/]|\\\\)/u)…
```

影响面仅配置校验：接受 POSIX `/…`、Windows `C:\`/`C:/…`、UNC `\\host…`，不改变运行时行为。属方案卡「3 个 src 点」之外的第 4 点，在此单列请追认。

## 6. 测试接线迁移（判官 M6/M7）

- `tests/fixtures/host.ts`：controller mock `inspect: vi.fn(async () => ({ events: [] }))` → `events: vi.fn(async () => ({ cursor: 0, records: [], hasMore: false }))`（真实页形状）。
- `tests/tools.spec.ts:348`：mock 改 `events`，返回 `{ cursor: 0, hasMore: false, records: [{ type: 'event', event: { type: 'assistant/message', seq: 0, time: 0, data: { message: … } } }] }`；`preview`、`message/0` 断言原样保留。

typecheck（src+tests）：**0 错误**（`compat-sa/stage4-01-full.log`）。

## 7. 待补 / 未完成

- 判官要求的「非空页 / 多页 / 缺口」单独用例尚未新增；M6 空页 mock 不能替代这三类覆盖。
- 本机 vitest 复跑时 V8 OOM（1197 用例 + jsdom），已改用更高堆重试；结果见后续消息。
- `repo → compat` 已按文件同步（src/tests/docs/package.json/README）。
