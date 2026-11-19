# DSH 工具原文分页与选择性压缩

适用宿主为 DeepSeek Harness 0.2.2-rc.5。剪枝时在工具输出的首尾之间写入原始事件号和字符偏移。生成会话摘要时，宿主沿替换关系定位当前会话中的原始事件，从中选取片段。摘要也可以引用上一次摘要。原事件仍由 DSH 会话日志保存。

## 安装到 headless 配置

在本目录运行 `npm pack`，然后执行 `dsh plugin --profile headless add ./dsh-evidence-pages-0.1.0.tgz`。启动时加 `--patch ./preset/headless.patch.yml`，或把这份补丁的行追加到所选 profile 的 cordis.patch.yml。用 `dsh --profile headless --patch ./preset/headless.patch.yml --dump-config` 检查启用的 evidence-page-compaction、evidence-page-pruner 和 evidence-page-reader 三行。原生两行应为 disabled。卸载前移除这份补丁，然后执行 `dsh plugin --profile headless remove dsh-evidence-pages`。

Web 或 SuperAgent 的 Agent preset 在隔离组内注册压缩服务。在目标 preset 的 plugins 内把原有 compaction-basic 和 tool-result-pruner 两行的 name 分别改为 `dsh-evidence-pages/engine` 和 `dsh-evidence-pages/pruner`，保留原配置和隔离组。在可用 tools 的 Agent 作用域注册 `dsh-evidence-pages` 一次。仅安装顶层 bundle 对这些隔离组的服务没有替换作用。

## 决策职责

| DSH_EVIDENCE_POLICY | 每个长工具结果的处理 |
|---|---|
| pointer | 留下原事件引用 |
| rule | 选择与前序任务词汇、错误或标识符线索匹配的一页 |
| jevos（默认） | 向 System One choice 接口提交候选，由模型直接选一页 |
| glm | 使用当前 Agent 配置的模型，通过宿主 compaction 路由直接选一页 |

Jevos 默认使用本机 `http://127.0.0.1:18017/v1/systemone` 和 `jevos-v5`。可设置 `DSH_EVIDENCE_JEV_URL`、`DSH_EVIDENCE_JEV_MODEL`、`DSH_EVIDENCE_JEV_KEY`。配置外部地址意味着会向该地址发送候选原文与其前序用户任务。选页失败会使用宿主摘要。

每个文本片段最多 256 个 Unicode 码点。每个长事件最多给选择器 12 页候选，长于 12 页时结合均匀位置与词汇排名选取，最终保留一页。选择器输入中的 task 取自当时已出现的用户文本（最后 800 码点）。这是一项按事件限额的策略，整段摘要没有固定 token 数。宿主仍检查摘要是否足以缩短历史。输入含图像、身份对应失败、压缩收益不足时走原生路径。原生摘要的空间允许时附上原文引用。

## 读取

工具调用示例 `evidence_page({seq: 17, charOffset: 256, budget: 1200})`。seq 必须属于执行该工具的当前会话，类型为最初追加的工具结果或已有的压缩摘要。输出第一行给出当前位置、总码点数和下一页位置，后面是原文。budget 包括页头，范围 96 到 8192；next 为减号表示已到结尾。日志被删除后不能用引用重建数据。读取多个文本块时，工具结果按原顺序拼接，摘要块之间用换行分隔。

## 宿主回归

在具备对应 rc.5 包的环境运行 `npm install` 和 `npm test`。回归用到宿主 Session、TokenMeter、实际剪枝及 compactRegion，检查中段标识符、两次摘要、重放、Unicode 分页和会话隔离。准确率应另用同一公开任务、相同候选和预算的端到端测评验证。
