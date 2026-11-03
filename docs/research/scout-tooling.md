# opencode 工具链类开源项目调研（scout-tooling）

> 调研员：scout-tooling｜数据快照：**2026-11-03 约 11:40（UTC+8）**
> 本机 opencode 现状：`@opencode/cli` 最新版 **2.2.5**（npm registry `latest`，2026-11-03 抓取）；`anomalyco/opencode` **224,142 star / 3,747 open issue / pushed 2026-11-03**
> 数据来源：GitHub REST API（带 token，`/search/repositories`、`/repos/{o}/{r}`、`/repos/{o}/{r}/readme`、`/search/issues`、`/repos/.../issues/{n}`）；`opencode.ai/docs/ecosystem`（经 r.jina.ai 转 markdown）；`awesome-opencode` README（raw）；npm registry；HN Algolia API。
> 原始数据落盘：`opencode-new-plugin/research/raw/`（`search-b1..b5.json`、`meta-a..d.json`、`issues.json`、`issue-search.json`、`awesome-list.json`、`readmes/*.md`）。**日志中没有打印/落盘任何 token。**
> 上一份调研（`opencodepluggin/opencode-社区动向-2026-10-19.md`）已读，本文只做增量，并在 §1.3 修正其中 3 条已过期的事实。

---

## 0. 一分钟结论

1. **工具链赛道整体"草创 + 碎片"**：除了 auth 类（antigravity 10,994★）和编排类（oh-my-openagent 70,633★），其余每个方向都是 2–200★ 的小项目群，**没有单点 >1,000★ 的 opencode 原生运维工具**。
2. **V2 造成一次"工具链断代"**：官方 ecosystem 页 31 个插件里 **10 个已停更 ≥200 天**（最久 327 天），且页面本身不带任何 V2 标注；社区工具绝大多数仍按 V1 的 `~/.cache/opencode/packages` / 旧 schema 工作。
3. **最强需求证据在安全侧**：HN「OpenCode Hacked: User credentials leaked」**977 分 / 185 评论**（2026-10-17，Console 泄露第三方 provider key，约 1.4% Console 用户），叠加 issue **#2242 沙箱（open，106 评论 / 👍82）**——而权限生态里最强的工具只有 38★，**没人做"策略引擎 + 审计留痕"**。
4. **会话/DB 运维是被低估的空位**：V2 换 schema 后，#55282（`opencode.db` 687MB、单 cell 占 77.9%，open）与 #53971（V1→V2 迁移丢消息，`severity:high`，open）都还没有对应产品；现有工具最强 `ocman` 仅 21★、`ocdb-clean` 32★ 且 7 月停更。
5. **V1→V2 插件迁移工具 = 0**：搜索 `opencode migration v1 v2` 命中 0 个仓库；官方只给文档页和双入口写法，issue #48365 仍 open（"V1 plugins unloadable with no migration path"）。这是唯一"官方承认缺、社区完全空白"的方向，但市场窄、API 变动快（2.0.32→2.2.5 仅 3 周）。

---

## 1. 盘面基线（2026-11-03）

### 1.1 opencode 自身

| 指标 | 值 | 说明 |
|---|---|---|
| 仓库 | `anomalyco/opencode` | 2026-11-03 pushed，open issue 3,747 |
| star | 224,142 | 10-19 时约 217,000，两周 +7k |
| 最新版本 | **2.2.5**（`@opencode/cli`） | 10-16 还是 2.0.32；**2.5 周内从 2.0.32 走到 2.2.5**（迁移工具极易过期） |
| 官方插件 CLI | `opencode plugin add/list/check/update/remove` | 由 `opencode-mercato` README 的安装命令 `opencode plugin opencode-mercato` 侧证 |

### 1.2 HN 侧热度（Algolia API，非二手转述）

| 故事 | ID | 分 / 评论 | 日期 |
|---|---|---|---|
| OpenCode Hacked: User credentials leaked | 50133401 | **977 / 185** | 2026-10-17 |
| OpenCode 2.0 | 50094994 | **890 / 397** | 2026-10-14 |
| Annoying and alarming things about OpenCode | 48978112 | 420 / 289 | 2026-07-20 |
| Unauthenticated RCE in OpenCode | 46581095 | 432 / 142 | 2026-01-11 |
| Claude Code sends 33k tokens…OpenCode 7k（token 效率） | 48883275 | 706 / 395 | 2026-07-12 |

> 「Hacked」事件的公开报道口径：Console 侧凭据泄露，影响约 **1.4% 的 Console 用户**，第三方 provider API key 需轮换（[Mallory](https://mallory.ai/stories/01a14c98-6fb4-7ccc-919b-bfaa7b87209e)、[ID Tech](https://idtechwire.com/ai-update-opencode-breach-puts-users-ai-provider-keys-at-risk/)）。仓库内对应安全 issue 例：**#46745** "amazon-bedrock and sap-ai-core write stored API keys into process.env, leaking them to every child process"。

### 1.3 对 10-19 文档的三处事实修正

| 项 | 10-19 文档 | 本次实测（11-03） |
|---|---|---|
| `awesome-opencode` | 「最后 push 2026-07-03，已 3.5 个月未更新」 | **pushed 2026-11-02，已恢复更新**（10,846★，11 open issue）；但内容仍以 V1 插件为主 |
| HN 2.0 帖热度 | 886 分 / 105 评论 | **890 分 / 397 评论**（评论数当时被截断） |
| #33356（db 13GB+） | open，长期未解 | **已 closed**（47 评论）——但同期 #55282 仍 open（687MB / 77.9% 单 cell），说明是"被 60 天机器人关掉/部分缓解"，不是彻底解决 |

---

## 2. 六个检索面的项目清单

> 列定义：**V2**=`明确 V2 / 双版本 / V1 时代（未声明）`，依据是 README 自述（`@opencode/plugin`、`Plugin.define`、"OpenCode V2"字样）；`pushed` 为 GitHub `pushed_at`。

### 2.1 插件管理 / registry / 迁移 / 脚手架

| 项目 | ★ | pushed | 做什么 | V2 | 判断 / 竞品 |
|---|---|---|---|---|---|
| [kdcokenny/ocx](https://github.com/kdcokenny/ocx) | 982 | 2026-09-29（默认分支最后提交 09-28，`feat!: Streamline OCX for OpenCode V2 #272`） | 扩展管理器 + 可移植 isolated profiles + registries + `ocx migrate` | **V2（OCX 3，需 opencode ≥2.0.3）** | 生态里唯一"正经扩展管理器"，但**5 周无提交**；V1 用户被要求留在 `ocx@2.0.15` |
| [ThomasSanna/opencode-mercato](https://github.com/ThomasSanna/opencode-mercato) | 1 | 2026-08-17 | V2 专属 TUI 内 marketplace（plugins/MCP/skills/themes/agents，`/mercato`，信任评分、安装 diff、回滚 journal） | **明确 V2** | 设计最完整，但 **1★ / 1 open issue**，等于无人用 |
| [NikiforovAll/opencode-marketplace](https://github.com/NikiforovAll/opencode-marketplace) | 12 | 2026-02-06 | CLI marketplace | V1 时代 | 停更 9 个月，事实死亡 |
| [Mirrowel/opencode-souk](https://github.com/Mirrowel/opencode-souk) | 5 | 2026-06-01 | 替换内置插件管理器的 TUI marketplace | V1 时代 | 停更 5 个月 |
| [juliendf/opencode-registry](https://github.com/juliendf/opencode-registry) | 8 | 2026-09-25 | curated registry（组件发现/生命周期） | 未声明 | 太小 |
| [gzb1128/opencode-plugin](https://github.com/gzb1128/opencode-plugin) | 2 | 2026-09-23 | 把 Claude Code plugin marketplace 搬进 OpenCode | 未声明 | 太小 |
| [wntic/ocm](https://github.com/wntic/ocm) | 2 | 2026-09-26 | 从任意 git repo 装 skills/agents/commands/MCP | 未声明 | 太小 |
| [zenobi-us/opencode-plugin-template](https://github.com/zenobi-us/opencode-plugin-template) | 72 | 2026-01-12 | **插件模板/脚手架** | V1 时代 | **已 archived**（唯一稍有名气的模板已死） |
| [MYCF711/magpie-plugin-scaffold](https://github.com/MYCF711/magpie-plugin-scaffold) | 4 | 2026-11-02 | V2 provider 插件模板，"all nine hooks implemented" | 明确 V2 | 目前**唯一可用的 V2 脚手架**，4★ |
| [anomalyco/opencode-plugin-lane](https://github.com/anomalyco/opencode-plugin-lane) | 13 | 2026-10-14 | 官方 V2 插件示例（worktree strategy） | 明确 V2 | 官方样例，非工具 |
| [ciaranRoche/morpheus](https://github.com/ciaranRoche/morpheus) | 2 | 2026-05-27 | Claude Code plugin → OpenCode 格式迁移 CLI | V1 时代 | 与"V1→V2"无关，停更 |
| [xhluca/session-migrate](https://github.com/xhluca/session-migrate) | 168 | 2026-10-19 | **跨 18 个 harness 迁移会话**（含 OpenCode 2.0 专用 docs） | 双版本 | 活跃、13 open issue，是"会话迁移"最强项目 |
| [sim590/opencode-session-migrate](https://github.com/sim590/opencode-session-migrate) | 5 | 2026-10-24 | V2-only TUI 插件：跨 project 重挂父级 / 救回孤儿 session | 明确 V2 | **已 archived**（作者放弃） |

**关键结论：V1→V2 插件迁移工具 = 0 个。** 搜索 `opencode v2 plugin`（500 hits，全是新插件）、`opencode migrate`（41 hits，全是"会话/配置跨工具迁移"）、`opencode migration v1 v2`（**0 hits**），没有任何把 V1 插件实现改成 V2 的 codemod/兼容层。官方只有文档页 `migrate-v1` 与"同一入口双导出"的运行时兼容写法。

### 2.2 配置 / 环境 / 多实例 / profiles / 配置同步

| 项目 | ★ | pushed | 做什么 | V2 | 判断 |
|---|---|---|---|---|---|
| [neiii/bridle](https://github.com/neiii/bridle) | 441 | 2026-11-01 | 跨 harness（Claude Code/OpenCode/Goose/Amp/Copilot/Crush）统一配置管理 + profiles + 装 skills/agents | 未声明 | **该方向事实赢家，但发散了多 harness**，opencode 只是其一 |
| [icysaintdx/OpenCode-Config-Manager](https://github.com/icysaintdx/OpenCode-Config-Manager) | 388 | 2026-04-28 | 可视化配置管理（OCCM） | V1 时代 | 停更 6 个月 |
| [iHildy/opencode-synced](https://github.com/iHildy/opencode-synced) | 169 | 2026-09-23 | 插件形式做**跨机器全局配置同步** | **双版本（v1 ≥1.18.29 / v2 ^2.0.0）** | 方向内最对口的活跃项目 |
| [alvarosanchez/ocp](https://github.com/alvarosanchez/ocp) | 41 | pushed 2026-11-03（**默认分支最后提交 2026-06-19**） | profile 存在 git 仓库里的 CLI（opencode config profiles） | README 有 V2 节 | 半停滞：pushed 靠分支/依赖刷，主体 6 月停 |
| [keh4l/opencode-config-tool](https://github.com/keh4l/opencode-config-tool) | 43 | 2026-02-07 | opencode.json 可视化桌面配置 | V1 时代 | 事实死亡 |
| [nicepkg/vsync](https://github.com/nicepkg/vsync) | 63 | 2026-01-27 | 跨工具同步 MCP/skills/agents/commands | V1 时代 | 事实死亡 |
| [leolaurindo/opencode-profile-router](https://github.com/leolaurindo/opencode-profile-router) | 4 | 2026-10-15 | 多 auth profile + config/data 隔离 | **明确 V2** | 新但极小 |
| [Portauw/caddie](https://github.com/Portauw/caddie) | 13 | 2026-10-12 | 跨工具 skill profile 管理 | 未声明 | 小 |
| [kdcokenny/tweakoc](https://github.com/kdcokenny/tweakoc) | 11 | 2026-02-26 | 生成/分享 OCX harness profile 的 web 向导 | V1 时代 | **已 archived** |
| [fariello/ocman](https://github.com/fariello/ocman) | 21 | 2026-10-13 | DB+配置+系统维护 CLI/TUI（见 2.3） | 未声明 | 活跃，但只 21★ |
| 多实例/水平扩展：[ssyhape-pixel/opencode-scale](https://github.com/ssyhape-pixel/opencode-scale) | 115 | 2026-03-30 | 水平扩展 OpenCode Server（Temporal workflow） | V1 时代 | 停更 7 个月 |

**结论**：profiles / 配置同步已被 `ocx`(982★, 停滞) + `bridle`(441★, 跨工具) + `opencode-synced`(169★) 覆盖，**不是一个空位**；但"多实例/多 daemon 编排"与"2.0 企业配置优先级（Console 集中配置）"仍无人做。

### 2.3 会话 / 数据库运维（清理、膨胀、导出、备份、迁移、搜索）

| 项目 | ★ | pushed | 做什么 | V2 | 判断 |
|---|---|---|---|---|---|
| [fariello/ocman](https://github.com/fariello/ocman) | 21 | 2026-10-13 | DB 清理（删行 + 删 session-diff 文件 + VACUUM，报告回收字节）、orphan 清理、ZIP 备份/回滚、sidecar 审计日志、崩溃会话 LLM 压缩、Textual TUI、`ocman.toml` | 未声明（未核实 V2 schema） | **该方向做得最深**，但 21★；README 直接对标 `ocgc`：2.9GB→1.9GB vs ocgc 2.9GB→2.8GB |
| [chncaesar/opencode-db-clean](https://github.com/chncaesar/opencode-db-clean) | 32 | 2026-07-23 | PyPI `ocdbc`：freelist 分析 + 安全 `VACUUM`（备份/完整性检查/auto_vacuum） | V1 时代（`~/.local/share/opencode/opencode.db`） | 停更 3.5 个月；solve 的是"空闲页"不是"事件表膨胀" |
| [ocgc](https://pypi.org/project/ocgc/)（仅 PyPI，无 GitHub 主仓） | - | v0.1.0 | OpenCode Garbage Collector | 未核实 | 被 ocman README 点名"回收不干净" |
| [neuronalism/opencode-session-manager-cli](https://github.com/neuronalism/opencode-session-manager-cli) | 6 | 2026-09-24 | 树状 session 导出/导入 | 未声明 | 小 |
| [intellectronica/opencode-convodump](https://github.com/intellectronica/opencode-convodump) | 20 | 2026-02-08 | 每会话导出 Markdown | V1 时代 | 停更 9 个月 |
| [jjserenity/opencode-chat-export](https://github.com/jjserenity/opencode-chat-export) | 9 | 2026-06-02 | MCP 导出聊天到 Markdown | V1 时代 | 停更 |
| [heimoshuiyu/opencode-history-plugin](https://github.com/heimoshuiyu/opencode-history-plugin) | 3 | 2026-05-25 | 搜索/浏览本地 SQLite 历史 | V1 时代 | 死亡 |
| [Microck/opencode-session-backup](https://github.com/Microck/opencode-session-backup) | 2 | 2026-10-22 | 备份 session 到 Google Drive | 未声明 | 极小 |
| [nandoblanco/opencode-local-backup](https://github.com/nandoblanco/opencode-local-backup) | 2 | 2026-10-29 | 编辑前自动快照 + 保留策略 | 未声明 | 极小 |
| 跨工具查看器（只读，不写库）：[jazzyalex/agent-sessions](https://github.com/jazzyalex/agent-sessions) 932★/11-03、[jerrywu001/cc-sessions-viewer](https://github.com/jerrywu001/cc-sessions-viewer) 412★、[ccpopy/cc-sessions](https://github.com/ccpopy/cc-sessions) 280★、[ssanaullahrais/Chat-Vault](https://github.com/ssanaullahrais/Chat-Vault) 82★ | — | — | 读 opencode SQLite 展示/搜索 | 部分明确支持 2.x | **"看"已饱和，"修/清/兜底"空** |
| 会话搜索：[joeyism/opencode-history-search](https://github.com/joeyism/opencode-history-search) 130★(7-19 停更)、[JosXa/opencode-recall](https://github.com/JosXa/opencode-recall) 3★(11-02)、[bojackduy/opencode-telescope](https://github.com/bojackduy/opencode-telescope) 4★ | — | — | 关键词/正则/语义搜索历史 | 未声明 | 已有 4+ 实现 → **不是空位** |

**结论**：V2 换 schema 后，**"安全清理 + 迁移前备份 + 完整性校验 + 回收报告"没有 V2 版本的产品**；社区注意力都在"只读查看器"，没人写库。

### 2.4 权限 / 安全 / 审计（沙箱、脱敏、permission、成本配额）

| 项目 | ★ | pushed | 做什么 | V2 | 判断 |
|---|---|---|---|---|---|
| [inkdust2021/opencode-vibeguard](https://github.com/inkdust2021/opencode-vibeguard) | 217 | 2026-03-01 | 密钥/PII → 占位符脱敏后再发 LLM，本地还原（官方 ecosystem 收录） | V1 时代 | **停更 8 个月**，却是该方向最高星 |
| [boxpositron/envsitter-guard](https://github.com/boxpositron/envsitter-guard) | 84 | 2026-11-03 | 阻止 agent 读/改 `.env*`，只暴露 key 指纹 | **明确 V2**（README 引 v2 docs） | 活跃、单点、窄 |
| [isanchez31/opencode-sandbox-plugin](https://github.com/isanchez31/opencode-sandbox-plugin) | 69 | 2026-09-20 | 用 `@anthropic-ai/sandbox-runtime` 沙箱化 agent 执行的命令 | 未声明（V1 era） | 唯一"插件内沙箱"，停更 6 周 |
| [hueyexe/opencode-auto-permissions](https://github.com/hueyexe/opencode-auto-permissions) | 38 | 2026-09-17 | 模型驱动 permission 审核（stable + V2） | **双版本** | 该方向最高星，仍 <40★ |
| [comsysto/opencode-sandbox](https://github.com/comsysto/opencode-sandbox) | 24 | 2026-09-11 | docker + mise 沙箱 | 外部包装 | — |
| [didvc/opencode-bwrap](https://github.com/didvc/opencode-bwrap) | 23 | 2026-10-22 | bubblewrap 把 opencode 关进 cwd | 外部包装 | 只能防文件越界 |
| [warc0s/opencode-permission-reviewer](https://github.com/warc0s/opencode-permission-reviewer) | 20 | 2026-11-03 | 每个 `ask` 交给 tool-free 模型审：allow/deny/escalate；**每审一条写 JSONL 审计**；V1+V2 | **双版本（实测 1.19.5 / 2.1.3）** | 最接近"审计"，仍 20★、5 open issue |
| [toreuyar/opencode-warden](https://github.com/toreuyar/opencode-warden) | 16 | 2026-10-24 | 拦截 tool call 检测 secret / 脱敏 / 安全评估 | 双版本 | 小 |
| [yusufipk/opencode-safeguard](https://github.com/yusufipk/opencode-safeguard) | 5 | 2026-09-19 | "LLM jury"：allow/deny/escalate + 可见裁决 | 明确 V2 | 小 |
| [mellena1/opencode-auto-mode](https://github.com/mellena1/opencode-auto-mode) | 5 | 2026-09-23 | LLM 驱动权限自动模式 | V2 | 小 |
| [chrisbarrett/may-i](https://github.com/chrisbarrett/may-i) | 5 | 2026-09-27 | 更好的 permissions 系统 | 未声明 | 小 |
| OS 级沙箱（**不依赖 opencode 插件 API**）：[madarco/agentbox](https://github.com/madarco/agentbox) 566★/10-07、[navikt/cplt](https://github.com/navikt/cplt) 141★/11-03、[pullrun/pullrun](https://github.com/pullrun/pullrun) 134★/10-22、[holtwick/bx-mac](https://github.com/holtwick/bx-mac) 107★/10-14、[inoio/agents-sandbox](https://github.com/inoio/agents-sandbox) 83★/11-03、[stacklok/brood-box](https://github.com/stacklok/brood-box) 79★/11-03、[daytona/integrations](https://github.com/daytona/integrations) 6★（官方 ecosystem） | — | — | microVM/容器/macOS sandbox 包住整个进程 | 与 V1/V2 无关 | **外部沙箱赛道很挤**，但都解决不了"V2 工具由 daemon 后台执行、外层沙箱失效"（10-19 文档 HN 结论） |
| 无任何"permission 审计 / 合规报表 / 配额硬上限"产品 | — | — | — | — | **空位** |

**结论**：权限类插件数量多（≥8 个）但**全部 <40★、功能单点、无人整合**；没有策略引擎（YAML/OPA 式）、没有审计日志形态的产品、没有成本/配额硬闸。而需求侧有 HN 977 分的安全事件 + #2242（106 评论/👍82）+ #10416「OpenCode is not private by default?」（closed，👍65）+ #46745（key 写进 `process.env` 泄给子进程）。

### 2.5 技能 / MCP / agent 配置管理（含 skills-doctor 同质化标注）

| 项目 | ★ | pushed | 做什么 | 与 skills-doctor 关系 |
|---|---|---|---|---|
| [xyiqq/skilldoctor](https://github.com/xyiqq/skilldoctor) | 11 | 2026-08-16 | **唯一正面竞品**：`lint` / `audit`（危险指令）/ `compat`（6 harness：Claude Code/Cursor/Codex/OpenCode/Gemini/Copilot）/ `fix` / `score` / `scan` | **同质化**：同为"skill 质量门禁"，但**无 token 预算、无 per-step 成本、无 shadowed 重复检测**；仅 11★ 且停更 2.5 个月 |
| [zenobi-us/opencode-skillful](https://github.com/zenobi-us/opencode-skillful) | 317 | 2026-02-13 | skill 懒加载 | **已 archived**；互补（加载器 ≠ 审计器） |
| [joshuadavidthomas/opencode-agent-skills](https://github.com/joshuadavidthomas/opencode-agent-skills) | 287 | 2026-10-28 | 动态发现/加载 skills（project/user/plugin 目录） | 互补 |
| [aihaipeng/opencode-skills-tui](https://github.com/aihaipeng/opencode-skills-tui) | 49 | 2026-10-23 | TUI 侧边栏：浏览 skills、加载状态、预览 SKILL.md | 互补（可视化，不做成本） |
| [Portauw/caddie](https://github.com/Portauw/caddie) | 13 | 2026-10-12 | 跨工具 skill profile 管理 | 弱重叠（管理 ≠ 审计） |
| [kylezantos/skill-distillery](https://github.com/kylezantos/skill-distillery) | 56 | 2026-07-01 | 创建/审计 skills | 弱重叠，停更 4 个月 |
| [nano-step/eval-harness](https://github.com/nano-step/eval-harness) | 14 | 2026-09-30 | skill 行为回归（4 类漂移归因、6 字段 FAIL schema、$ 成本上限、CI） | 互补（回归 ≠ 静态审计），但 **29 open issue** |
| [grimoire-rs/grimoire](https://github.com/grimoire-rs/grimoire) | 15（API 404，未核实） | — | 跨工具 AI-agent 配置包管理器（skills/rules/agents/MCP） | 外围 |
| [beixiyo/ai-sync](https://github.com/beixiyo/ai-sync) 9★、[ATLAS-DEV78423/AgentBridge](https://github.com/ATLAS-DEV78423/AgentBridge) 1★ 等 | — | 2026-10 | 跨工具迁移 commands/skills/instructions/MCP | 外围 |

**结论**：skills-doctor 的「skill 审计 / token 预算」**没有强竞品**（唯一同类 11★ 且缺 token 维度），但也说明**该品类天花板低**——不建议新仓库再做一遍纯 skill lint；建议把它作为"安全/审计控制面"的一个子模块复用，而不是新仓库主线。

### 2.6 评测 / 可观测 / token·成本

| 项目 | ★ | pushed | 做什么 | V2 | 判断 |
|---|---|---|---|---|---|
| [ccusage/ccusage](https://github.com/ccusage/ccusage) | **19,306** | 2026-11-03 | 本地 JSONL 统计 token/成本（`npx ccusage`） | 未核实原生 OpenCode 支持 | **该赛道绝对巨头**；OpenCode 侧靠下游（`cobra91/better-ccusage` 92★ 明确列 OpenCode） |
| [junhoyeo/tokscale](https://github.com/junhoyeo/tokscale) | 5,793 | 2026-11-02 | 跨 agent token 统计 + 全球排行榜 | 未声明 | 第二巨头，91 open issue；有 OpenCode 绑定插件 `stevejkang/opencode-tokscale` 5★（双版本） |
| [Javis603/token-monitor](https://github.com/Javis603/token-monitor) | 3,527 | 2026-11-03 | 桌面小组件：48+ agent 的 token/成本/限额 | 未声明 | 跨工具，阅读器形态 |
| [cytostack/openwolf](https://github.com/cytostack/openwolf) | 2,400 | 2026-10-20 | 项目记忆 + harness transcript token 记账 | 未声明 | — |
| [mikehasa/agentacct](https://github.com/mikehasa/agentacct) | 756 | 2026-10-03 | 按任务拆解 agent 做了什么、花了多少 | 未声明 | 60 open issue |
| [slkiser/opencode-quota](https://github.com/slkiser/opencode-quota) | **1,078** | 2026-11-03 | OpenCode 配额 + token 使用，零上下文污染；支持 OpenCode Go / Cursor / Copilot | 未声明（活跃） | **opencode 原生最高星**，说明"配额面板"是真需求 |
| [Hotakus/opencode-visual-cache](https://github.com/Hotakus/opencode-visual-cache) | 315 | 2026-09-30 | TUI 侧边栏：实时 **cache 命中率** | 双版本（区分 V1/V2 缓存路径） | 细分需求被验证 |
| [ramtinJ95/opencode-tokenscope](https://github.com/ramtinJ95/opencode-tokenscope) | 282 | 2026-07-29 | token 用量/成本分析 | V1 时代 | 停更 3 个月 |
| [DEVtheOPS/opencode-plugin-otel](https://github.com/DEVtheOPS/opencode-plugin-otel) | 150 | 2026-10-06 | OpenTelemetry OTLP 导出（对齐 Claude Code 监控信号） | **V2 only** | 23 open issue，是最正经的 trace 插件 |
| [nmdra/opencode-cache-stats](https://github.com/nmdra/opencode-cache-stats) | 27 | 2026-10-26 | `/cache-stats` 弹窗：命中率/分模型/分 subagent/成本 | **明确 V2** | 新 |
| [xrmghost-maintainer/opencode-telemetry](https://github.com/xrmghost-maintainer/opencode-telemetry) | 7 | 2026-10-28 | 本地持续 telemetry（token/tool/skill） | 双版本 | 极小 |
| 评测：[akitaonrails/llm-coding-benchmark](https://github.com/akitaonrails/llm-coding-benchmark) 371★、[minghinmatthewlam/openbench](https://github.com/minghinmatthewlam/openbench) 137★、[richardodliu/OpenCodeEval](https://github.com/richardodliu/OpenCodeEval) 52★、[DasDigitaleMomentum/opencode-agent-evaluator](https://github.com/DasDigitaleMomentum/opencode-agent-evaluator) 14★、[jlongster/openeval](https://github.com/jlongster/openeval) 3★（官方 jlongster） | — | — | opencode 上的 eval/benchmark | 未声明 | **碎片＋官方自己也在做（harbor/openeval）**，商业价值低 |

**结论**：token/成本这块**已被跨工具巨头吃掉**（ccusage 19k★、tokscale 5.8k★），opencode 原生侧只剩"配额面板"（quota 1,078★）与"缓存命中率"（visual-cache 315★）两个已成立的小切口；**trace/OTel 是半空位**（唯一 150★ 且 23 open issue）。

---

## 3. 官方 ecosystem 页 31 个插件逐条审计

> 页面：<https://opencode.ai/docs/ecosystem>（11-03 抓取；结构为 **31 插件 + 10 项目 + 2 agents**，**全页无一处 V2 标注**）。
> 「停更」= `pushed_at` 距今 ≥200 天；「可疑」= 90–200 天。

| # | 插件 | ★ | pushed | 状态 | V2 | 竞品/备注 |
|---|---|---|---|---|---|---|
| 1 | opencode-daytona（daytona/integrations） | 6 | 2026-11-03 | 活跃 | 未声明 | 厂商仓库，社区 adoption≈0；沙箱类外部竞品很多 |
| 2 | opencode-helicone-session | 16 | 2025-12-11 | **停更 327 天** | V1 时代 | 无竞品、无人用 |
| 3 | opencode-type-inject（nick-vi/type-inject） | 144 | 2026-10-22 | 活跃 | **双版本** | 独有功能，无明显竞品 |
| 4 | opencode-openai-codex-auth | **2,207** | 2026-01-09 | **停更 298 天** | V1 时代 | **强竞品区**：被 antigravity/gemini/claude-auth 抢食，最大 star 却最烂尾 |
| 5 | opencode-gemini-auth | 1,775 | 2026-09-23 | 活跃 | 未声明 | 与 #4 #6 互相竞品 |
| 6 | opencode-antigravity-auth | **10,994** | 2026-10-28 | 活跃 | 未声明 | **该品类绝对赢家**（4 open issue）→ 强竞品，勿入 |
| 7 | opencode-dynamic-context-pruning | 4,461 | 2026-09-25 | 可疑（39 天） | **明确 V2 CLI 安装** | **80 open issue**；已有 V2 重写 fork `arafays/opencode-dcp` 10★；另有跨工具巨头 `mksglu/context-mode` 33,297★ → 强竞品 |
| 8 | opencode-vibeguard | 217 | 2026-03-01 | **停更 247 天** | V1 时代 | 安全脱敏方向最高星，但已死 |
| 9 | opencode-websearch-cited | 249 | 2026-03-22 | **停更 226 天** | V1 时代 | 被 tavily(10★)/firecrawl(105★)/`guotree/opencode-search-plugin`(V2) 替代 |
| 10 | opencode-pty | 609 | 2026-10-02 | 活跃 | 未声明 | 42 open issue，功能独特 |
| 11 | opencode-shell-strategy | 138 | 2026-08-03 | 可疑（92 天） | 未声明 | 单一 skill/规则型，替代品多 |
| 12 | opencode-wakatime | 207 | 2026-09-27 | 活跃 | **双版本** | vendor 集成，独占 |
| 13 | opencode-md-table-formatter | 384 | 2026-02-21 | **停更 255 天** | V1 时代 | 小工具，可被一次性 skill 替代 |
| 14 | opencode-morph-fast-apply | 172 | 2026-11-01 | 活跃 | **明确 V2** | 与 #15 同厂商竞品 |
| 15 | opencode-morph-plugin（morphllm 官方） | 91 | 2026-09-08 | 活跃 | 未声明 | 与 #14 内耗：厂商自己的仓库反而更弱 |
| 16 | oh-my-opencode（已改名 `code-yeongyu/oh-my-openagent`） | **70,633** | 2026-11-03 | 活跃 | 未声明 | **编排类巨头，2,122 open issue**；生态页链接已过期（改名未更新）→ 编排/子 agent 已饱和 |
| 17 | opencode-notifier | 861 | 2026-11-01 | 活跃 | 未声明 | **通知类饱和**（另有多家 notifier/notifications/notify） |
| 18 | opencode-zellij-namer | 66 | 2025-12-20 | **停更 318 天** | V1 时代 | 已死 |
| 19 | opencode-supermemory | 1,651 | 2026-11-03 | 活跃 | 未声明 | 记忆类**强竞品**（另有 tickernelz/opencode-mem 1,812★、数十个记忆项目） |
| 20 | @plannotator/opencode | 9,828 | 2026-11-03 | 活跃 | 未声明 | 计划评审类**巨头**，正面撞车 |
| 21 | @openspoon/subtask2 | 257 | 2026-02-01 | **停更 275 天** | V1 时代 | 编排类老项目，被 #16 吞掉 |
| 22 | opencode-scheduler | 512 | 2026-02-23 | **停更 253 天** | V1 时代 | 无 V2 替代，需求仍在但项目死 |
| 23 | opencode-conductor | 133 | 2026-03-02 | **停更 246 天** | V1 时代 | 工作流类，死亡 |
| 24 | micode | 509 | 2026-10-26 | 活跃 | 未声明 | 工作流类活跃 |
| 25 | octto | 530 | 2026-10-18 | 活跃 | 未声明 | 头脑风暴 UI，无竞品 |
| 26 | opencode-sentry-monitor | 53 | 2026-03-20 | **停更 228 天** | V1 时代 | 被 `opencode-plugin-otel`(150★, V2) 取代 |
| 27 | opencode-firecrawl | 105 | 2026-10-21 | 活跃 | 明确 V2 docs | vendor 集成 |
| 28 | opencode-jfrog-plugin | 1 | 2026-11-02 | 活跃 | 未声明 | vendor 占位，0 traction |
| 29 | opencode-goal-plugin | 287 | 2026-11-03 | 活跃 | **双版本**（`src/v2-bridge.js`） | 需求强（#27167 👍157）但已 closed → 该需求被官方/多个插件满足，饱和 |
| 30 | opencode-tavily | 10 | 2026-10-26 | 活跃 | **双版本** | 与 firecrawl/websearch-cited 竞品 |
| 31 | opencode-supabase | 42 | 2026-10-30 | 活跃 | **双版本** | vendor 集成 |

### 3.1 这 31 个的结论

- **有强竞品、不要进**：auth 复用（#4/#5/#6，antigravity 10,994★）、编排/子 agent（#16 70,633★、#21、#23）、记忆（#19 + 数十家）、通知（#17）、计划评审（#20 9,828★）、上下文压缩（#7 4,461★ + context-mode 33,297★）、worktree（生态外 kdcokenny 725★ + 官方 lane）。
- **看起来有、其实烂尾（≥200 天停更）**：**#2 helicone(327d)、#4 codex-auth(298d)、#18 zellij(318d)、#21 subtask2(275d)、#13 md-table(255d)、#22 scheduler(253d)、#8 vibeguard(247d)、#23 conductor(246d)、#26 sentry(228d)、#9 websearch-cited(226d)** —— **10/31 ≈ 32%**。其中 #4 是"2,207★ 但已死"，#22 是"需求仍 open、项目已死"。
- **无竞品的真空白（生态页内有、但没人补）**：permission/审计（页面只收了 vibeguard 一个且已死）、DB/session 运维（0 个）、插件发现/管理（页面只在 Projects 里放了 ocx）、LSP（0 个，官方 2.0 已砍 LSP）。
- **页面本身没跟上 V2**：31 个里明确写 V2 的只有 5–6 个；`awesome-opencode` 已恢复更新（11-02）但同样未按 V2 重排。

---

## 4. 有需求证据、但没人做好的方向（4 个）

### G1 权限/安全控制面：策略引擎 + 审计留痕 + 脱敏（**最强证据**）

- **证据**
  - HN「OpenCode Hacked: User credentials leaked」**977 分 / 185 评论**（2026-10-17）；公开报道称 Console 泄露第三方 provider key、影响约 1.4% Console 用户（[Mallory](https://mallory.ai/stories/01a14c98-6fb4-7ccc-919b-bfaa7b87209e)）。
  - issue **#2242**「Is there a way to sandbox the agent?」**open，106 评论 / 👍82 / 89 reactions**（2025-08-25 起，全仓最热的安全类 issue）。
  - issue **#46745**「amazon-bedrock and sap-ai-core write stored API keys into `process.env`, leaking them to every child process」。
  - issue **#10416**「OpenCode is not private by default?」（closed，👍65）；**#239**「Implement permissions in TUI」（closed，👍43）；**#7006**「`permission.ask` plugin hook is defined but not triggered」（closed，👍25）。
  - HN 2.0 帖（890 分）与 10-19 文档记录的吐槽："插件新增的工具不遵守 permission"、"V2 工具改由后台 daemon 执行，外层 sandbox 失效"、"热重载无禁用开关"。
- **现状竞品**：全是 <40★ 单点插件（auto-permissions 38★、permission-reviewer 20★、warden 16★、safeguard 5★），**无策略 DSL、无审计报表、无统一 gate**；外部沙箱（agentbox 566★ 等）是进程级，拿不到结构化 permission 事件。
- **能否只靠插件**：✅ 能。V2 提供 `permission.evaluate`、`permission.assert`、`tool.execute.before/after`、`shell.create.before`、`ctx.event.subscribe`、TUI 插件，可覆盖"判定 → 拦截 → 留痕 → 可视化"全链。
- **工作量**：中，MVP 2–3 周（策略 YAML + evaluate 拦截 + JSONL 审计 + `/audit` TUI 面板 + 工具输出脱敏）。
- **复用 skills-doctor**：高——规则引擎（多规则/严重级/逐条解释）、报告渲染、`lint/audit/fix` 三命令结构、CI 用法几乎同构；token 报告组件可改成"每次 permission 决策的价格/时延"。

### G2 V2 会话/DB 运维：安全清理 + 迁移前备份 + 完整性校验

- **证据**
  - issue **#55282**「`opencode.db` at ~687 MB with **77.9% of the file in a single `session.revert` cell**」**open**（2026-10-14，`reproduced`）。
  - issue **#33356**「Unbounded growth of the `event` table: `opencode.db` reaches 13GB+」47 评论（现 closed，但属机器人/部分缓解；同类 #41175(👍8)、#48641、#55282 仍在）。
  - V1→V2 迁移丢数据：**#53971**（open，`severity:high`，`reproduced`，"migration silently drops legacy messages missing required fields"）、**#51144**（open，`reproduced`，path=NULL 会话消失）、#50551/#53450（已 closed）。
  - 需求侧还有 HN「Annoying and alarming things about OpenCode」420 分 / 289 评论。
- **现状竞品**：`ocman` 21★（最完整，但未声明 V2）、`ocdbc` 32★（7 月停更、V1 路径）、`ocgc` 仅 PyPI 0.1.0；跨工具查看器（agent-sessions 932★ 等）**只读不写库** → 清理/备份/校验是空白。
- **能否只靠插件**：✅ 大部分可以。清理/备份/校验本质是读写 SQLite 文件，可用 TUI 插件 + 打包 CLI；但"VACUUM 时独占写"需要引导用户停 daemon（可用 `shell.create.before`/提示解决）。
- **工作量**：小-中，MVP 1–2 周（analyze 只读报告 → backup → vacuum → orphan 清理 → 迁移前 snapshot/rollback），主要是**逆向 V2 schema** 与安全默认。
- **复用 skills-doctor**：很高——"扫描 → 诊断 → 修复（dry-run/apply）→ 报告"就是 skills-doctor 的骨架，可复用 CLI、报告、退出码、CI 集成。

### G3 V1→V2 插件迁移 / 兼容层（**唯一官方承认缺、社区零覆盖**）

- **证据**
  - issue **#48365**「beta: V1 plugins unloadable with no migration path, custom commands unreachable headless」**open**（2026-09-10）。
  - 官方口径（2.0 博客）：1.0 插件在 2.0 **完全不运行**、无自动 shim，只提供文档迁移表；官方迁移页 `opencode.ai/v2/docs/build/plugins/migrate-v1/`。
  - 生态侧：31 个官方收录插件 **10 个 ≥200 天停更**，基本是 V1 时代产物；`ocx` 把 V1 用户留在 `ocx@2.0.15`，官方模板 `zenobi-us/opencode-plugin-template` 已 archived。
  - 检索面：`opencode migration v1 v2` **0 结果**；相关只有 `morpheus`(2★, Claude→OpenCode 插件迁移) 与 `session-migrate`(168★, 会话迁移)，**没有插件 API 迁移工具**。
- **现状竞品**：无。
- **能否只靠插件**：部分。`codemod/CLI`（AST/regex 改写 `server()`→`setup()`、zod tool → JSON Schema、hook 名映射、`plugin`→`plugins`）不需要运行在 opencode 里；但"迁移后自检"可做成插件（加载即报告兼容性）。
- **工作量**：中，3–4 周；难点是 **V2 API 仍在快速演化**（2.0.32→2.2.5 仅 3 周），需跟版本建规则库。
- **复用 skills-doctor**：高——"静态扫描 → 规则命中 → 自动修复建议 → 打分"完全同构；skills-doctor 的规则库/报告/`--fix` 机制可直接改成"V1→V2 迁移检查器"。
- **风险**：市场窄（用户不直接感知；买单的是插件作者），且 2.0 尚未稳定；建议作为"附加能力"，不做主线。

### G4（半空位，不建议单独做）插件发现 / 分发索引

- 证据：issue **#28696**「[FEATURE]: Plugin/Agent/Skills/etc marketplace」**open，👍38**（2026-05-21）；**#47345**「expose the plugin manager as a `/plugins` slash command」（closed）；官方无 registry/marketplace，`ocx` 5 周无提交、`mercato` 1★。
- 但：官方已有 `opencode plugin add/list/check/update/remove`（安装体验不差），`awesome-opencode` 恢复更新、`opencode.cafe` 在运营，**纯索引价值有限**；建议并入 G1/G3 作为分发渠道，而非主线。

### 另外两个"看着像空位、其实不是"

- **会话内搜索 / TUI 搜索**（#4714 open，👍66）：已有 4+ 实现（opencode-history-search 130★、recall、telescope、agent-sessions），且只读查看器扎堆 → **不要做**。
- **LSP 回补**（官方 2.0 砍 LSP 工具/诊断，InfoQ 报道；`christensenjairus/opencode-v2-lsp-support` 15★ 在尝试）：官方口径是"用项目自带 lint/typecheck"，方向与官方背道而驰，风险高。

---

## 5. 建议：三个最值得做的方向（按证据强度排序）

### 🥇 1. permission / security control plane（策略 + 审计 + 脱敏），V2 插件
- **一句话**：给 2.0 装一个"可审计的 permission 层"——YAML 策略 + `permission.evaluate` 强制判定 + 每条决策落 JSONL + TUI `/audit` + 工具输出脱敏。
- **最强证据**：HN 977 分安全事件（Console key 泄露）+ #2242（106 评论/👍82）+ #46745（key 泄漏给子进程）+ 竞品全部 <40★、无审计形态。
- **MVP（2–3 周）**：`policy.yaml`（allow/deny/ask + 路径/命令/网络规则）→ `permission.evaluate` 拦截 → 审计 JSONL（含 remote 命令只存 SHA-256）→ `/audit` TUI 面板 → secret redaction（复用 vibeguard 思路，但它已死）。
- **复用 skills-doctor**：规则引擎 / 报告 / `lint-audit-fix` 结构 / CI / token 报告组件。
- **风险**：官方可能把 permission 做成核心（但 #2242 挂了 15 个月未动，短期风险低）；必须同时支持 V1 双入口以免丢存量用户。

### 🥈 2. V2 session/DB ops（analyze → backup → vacuum → migrate-verify）
- **一句话**：2.0 数据库的"体检 + 抢救 + 兜底"工具，重点是 **V2 schema 的孤儿行 / `session.revert` 巨型 cell / session-diff 文件**，以及 V1→V2 迁移前后的快照与校验。
- **最强证据**：#55282（open，687MB/77.9% 单 cell）、#33356（13GB+，47 评论）、#53971（open，`severity:high`，迁移丢消息）、#51144（open，`reproduced`）。
- **MVP（1–2 周）**：只读 `analyze`（表/列/孤儿/最大 cell 排行）→ `backup`（zip + 校验和）→ `clean`（dry-run/apply + VACUUM）→ `verify`（迁移后 session/message 数量与引用完整性对账）。
- **复用 skills-doctor**：几乎照搬"扫描→诊断→修复→报告"骨架与 CLI 退出码体系。
- **风险**：官方可能内建（#33356 已 close → 需持续观察 2.2.x 是否真修）；DB schema 变动快，要做版本探测与降级。

### 🥉 3. V1→V2 plugin migration toolkit（codemod + compat checker）
- **一句话**：把 V1 插件实现自动改写成 V2（`Plugin.define + setup`、tool schema、hook 映射），并给出"这个插件在 2.x 能不能跑"的兼容评分。
- **最强证据**：#48365 open（"V1 plugins unloadable with no migration path"）、官方无 shim、生态 31 个收录插件 10 个 ≥200 天停更、`opencode migration v1 v2` **0 结果**。
- **MVP（3–4 周）**：规则库（API 映射表 + 破坏性变更）→ 扫描报告 → `--fix` codemod → 迁移后 smoke test 生成器。
- **复用 skills-doctor**：规则库/报告/打分/`--fix` 机制同构，可视为"skills-doctor 方法论换个对象"。
- **风险**：V2 API 演化快（2.0.32→2.2.5 仅 3 周），市场窄（买单方是插件作者）；建议作为方向 1/2 的**引流/品牌配件**，单独做主仓库风险偏高。

**排序理由**：方向 1 有最强、最新、最大的外部证据（HN 977 分安全事件）且与 skills-doctor 技术复用最高；方向 2 需求持续（两个 open issue + 数据丢失 `severity:high`）且竞品最弱（21★/32★ 且停更）；方向 3 是唯一"官方承认、社区零覆盖"的确定性空位，但市场与稳定性风险最高。

---

## 6. 未核实与局限

- **未核实**：`ccusage` 是否原生解析 OpenCode 数据（只见下游 `better-ccusage` / `opencode-tokscale` 明确支持）；`ocgc` 的代码仓库（仅 PyPI 0.1.0）；`grimoir-rs/grimoire`（GitHub API 404，可能改名/私库，stars 15 来自搜索结果）；`ocman`/`ocdbc` 是否兼容 V2 新 schema（README 未声明 V2，且路径仍写 V1 的 `~/.local/share/opencode`）；`opencode-scale` 的现状。
- **口径**：star / pushed 为 GitHub API 抓取值（2026-11-03 约 11:00–11:40）；`pushed_at` 会被任意分支/依赖刷新时代替，故对 `ocx`（默认分支 09-28）、`ocp`（默认分支 06-19）额外标注了默认分支最后提交。
- **V1/V2 判定**基于 README 自述（关键词 `@opencode/plugin`、`Plugin.define`、"OpenCode V2"、双入口），**未逐个跑安装验证**；标"未声明"的项目可能仍能跑 V2。
- GitHub 搜索限流（search 30/min）导致分页未穷举，热门榜为按 star 排序的抽样；issue 搜索按评论数排序，故榜单被 mega-thread（如 #59387）挤占，已人工剔除噪声。
- 官方 ecosystem 页未版本化，31 个数量为 11-03 页面实际行数。
- HN 数据来自 Algolia API（points / num_comments 为抓取时值，会随时间上涨）。
