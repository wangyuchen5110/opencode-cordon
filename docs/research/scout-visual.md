# OpenCode 生态调研（视觉 / 交互 / 可用性方向）

> **数据快照**：2026-11-03 11:10–12:40（UTC+8）
> **方法**：GitHub REST API（已认证，token 仅存在于进程内存，未打印、未落盘）+ `r.jina.ai` 读官方文档 / V2 `CHANGELOG.md` + 公开 npm `package.json` 判定 V1/V2
> **范围**：只回答「和 opencode 相关、偏视觉/交互/可用性，且哪些方向还没被做透」
> **面向**：给 `wangyuchen5110` 新开「opencode 插件」仓库做选题
> **红线遵守**：只在本目录写文件；未 git、未建仓、未安装任何东西

---

## 0. 一分钟结论

1. **「看见 token」这条赛道已经死了。** 本次检索到 **20+ 个** opencode 状态栏/侧边栏/token 插件仓库（多数 0–35★，头部 Hotakus/opencode-visual-cache 315★），而官方 V2 **已经内建** per-response `t/s`（#5374 关闭为 completed）与 token 用量显示（#13003 completed），Desktop 还有 Context tab。**不要再做状态栏、token 计数、上下文进度条。**
2. **V2 原生 TUI 插件生态真实存在但极薄**：本次确认 **约 11 个** V2 原生（`@opencode/plugin` ≥ 2.x）第三方 TUI 插件仓库，其中一半 ≤ 30★。官方 ecosystem 页（31 插件 + 10 项目）**至今零个 TUI 插件**。
3. **最强"已验证但没人赢"的三块**：① TUI 里的**插件画廊/发现**（#28696 挂 21 个重复 issue、45 表情、零官方 registry；已有两个 TUI 版尝试——Mercato 1★ 停在 2026-08、Souk 5★ 停在 2026-05，最大竞品仅 12★，**有人试过、没人赢**）；② **会话回放 → 可分享 HTML**（官方 2026-10-15 下线 `/share`；Claude Code 侧 claude-replay **853★**，opencode 原生侧最大 **8★**）；③ **`session.panel` 会话结构地图**（子 agent 树 + 工具时间线 + 成本，`/tree` 被官方判 not planned 但 API 现在能做）。
4. **有两个"官方刚开门、几乎没人进"的新面**：V2.2 的 **Desktop GUI 插件 API**（#59469，2026-10 才加，#43132 仍在要）与 **TUI `session.panel` 面板槽**（宿主管尺寸/全屏，插件只管内容）。
5. **会话内搜索（#4714）做不了，别硬做。** 官方 bot 2026-10-29 原话：*"a plugin can read the session's messages, but it has no way to scroll the session view to a match or highlight it"*。它缺的是 TUI 内核原语（`scrollTo` / `highlight`），不是插件创意。

---

## 1. 口径修正：本地 10-19 文档已部分过期

先对齐事实，避免拿旧结论做判断。以下为本次实测（2026-11-03）：

| 项 | `opencode-社区动向-2026-10-19.md` 里写的 | 今天实测 | 影响 |
|---|---|---|---|
| 最新版本 | v2.0.32（2026-10-16） | **v2.2.5（2026-10-30）**，已发 2.1 / 2.2 两条线 | 有两批新能力（见 §2 表 A 备注） |
| #6152 session context 用量 | open，24 评论 / 👍142 | **closed / completed**（2026-10-20，24 评论 / 👍142 / ❤️9） | 「上下文可见」在核心侧已被认领，插件只能做补充 |
| #4714 TUI 会话内搜索 | open，39 评论 | **open，45 评论**（👍66 / ❤️7，最后活跃 2026-10-31），官方 bot 明确「插件做不了」 | 见 §8 |
| #6330 通用 UI intent 通道 | open，21 评论 | **closed / not_planned**（2026-10-30，bot 判「写的是 V1」） | 见 §8 |
| awesome-opencode | 10,654★，最后 push 2026-07-03，停更 3.5 月 | **10,846★，pushed 2026-11-01**，仍在更新（但 V1/V2 收录混杂） | 可当索引，不能当权威 |
| ecosystem 页 | 约 31 插件 + 10 项目 | **仍是 31 + 10**，且 **0 个 V2 TUI 插件** | 官方榜单未按 V2 重写 |
| 2.0 插件能力 | transforms + hooks | 另加 **TUI 侧**：slots / routes / tabs / `session.panel` / 自定义 dialog / keymap layer / markdown 渲染器 / theme tokens | 视觉插件的技术前提已就绪 |

**新增的关键事实（官方 changelog，V2）**：

- v2.2.0：`Add GUI plugin APIs for toasts, dialogs, notifications, tabs, composer controls, and custom UI.`（PR #59469）；`Add custom composer-pill popovers for GUI plugins.`（#59437）
- v2.2.3：`TUI plugins require OpenTUI 0.8`（ScrollBox façade 变更、`RenderContext` 需 `clock`）→ **破坏性变更，插件必须锁 OpenTUI 版本**
- v2.1.0：TUI 侧边栏支持 todo；会话归档恢复（#53759）
- v2.0.30：**TUI 内置 `/diff` 半屏 diff 查看器**（#47152）；`Remove the retired session-sharing backend and unavailable /share command`（#55716）

---

## 2. 表 A：V2 原生 TUI 视觉插件（今天真正在跑的那一小撮）

> 判定方式：读仓库 `package.json`，依赖 `@opencode/plugin` ≥ 2.x / `@opencode/theme` 2.x / `@opentui/*` 0.5+ 即视为 V2 原生；仅依赖 `@opencode-ai/plugin` 1.x 的归表 B。

| 仓库 | ★ | 最后 push | 做什么 | 为什么有意思 | 形态 | 是否已被占位 |
|---|---|---|---|---|---|---|
| [Hotakus/opencode-visual-cache](https://github.com/Hotakus/opencode-visual-cache) | 315 | 2026-09-30 | token **缓存命中率**实时侧边栏 | 全生态同类**最高星**；中文作者 + 双语 README，气质最接近你的目标项目 | V1+V2 双兼容（`@opencode/plugin>=2.0` + `@opencode-ai/plugin@1.18`） | 已是该细分头部；另有 [nmdra/opencode-cache-stats](https://github.com/nmdra/opencode-cache-stats) 27★、[zhumengzhu/opencode-cache-hit](https://github.com/zhumengzhu/opencode-cache-hit) 36★ |
| [Hotakus/opencode-subagent-magazine](https://github.com/Hotakus/opencode-subagent-magazine) | 136 | 2026-10-08 | 子 agent 实时监控侧边栏 | 把后台 subagent 变成可看的"杂志页" | V1+V2 双兼容 | 半占位：[madsoftwaredev/opencode-plugins](https://github.com/madsoftwaredev/opencode-plugins) 6★ 有 subagent sidebar |
| [streetturtle/opencode-better-sidebar](https://github.com/streetturtle/opencode-better-sidebar) | 67 | 2026-10-19 | **5 个**V2 侧边栏小插件包：context 进度条 / 会话 token / AI recap / 打开目录 / 当前 prompt | 直接把 #6152 的诉求做成插件；`opencode plugin add @streetturtle/...` 一键装；README 有截图 | V2 TUI 插件**包**（要求 2.0+） | **context 进度条被它占位**；但每个都极轻，整合层仍空 |
| [ishaksebsib/opencode-tree](https://github.com/ishaksebsib/opencode-tree) | 107 | 2026-05-12 | TUI 树视图 | 高星但**停在 V1** | V1 独占（`@opencode-ai/plugin@1.14.48`） | 迁移机会（见表 B） |
| [aihaipeng/opencode-dir-tree-tui](https://github.com/aihaipeng/opencode-dir-tree-tui) | 27 | 2026-10-10 | 文件树侧边栏 + Git 状态 + 快捷操作 | 中文作者，V2 原生 | V2 | 与 ishaksebsib 同题，V2 侧先手 |
| [aihaipeng/opencode-skills-tui](https://github.com/aihaipeng/opencode-skills-tui) | 49 | 2026-10-22 | 浏览 skills / 已加载状态 / 预览 `SKILL.md` | **和你的 skills-doctor 直接同域** | V2（`@opencode/plugin@2.0.16`） | 有占位但只做"浏览"，无体检/计量 |
| [Mark1708/opencode-agents-sidebar](https://github.com/Mark1708/opencode-agents-sidebar) | 23 | 2026-10-21 | 在 TUI 里浏览已配置 agents | 把"配置了什么"变可见 | V2（`@opencode/plugin@2.0.32`） | 同题竞品 [aihaipeng/opencode-skills-tui] 但对象不同 |
| [lkonga/opencode-retitle](https://github.com/lkonga/opencode-retitle) | 118 | 2026-10-24 | `/retitle` 交互式重命名会话；`prompt.footer.status` 转圈 | README 明写「V2 一等公民（`./v2`）+ V1 兼容」，是**双版本工程范本** | V2 主 + V1 兼容 | 单点功能，无竞品 |
| [nmdra/opencode-cache-stats](https://github.com/nmdra/opencode-cache-stats) | 27 | 2026-10-26 | `/cache-stats` 弹窗：总命中率 + 每模型 + 每 subagent + 成本 | 用 dialog + JSX，视觉完成度参考 | V2（`@opencode/theme@2.1.4`） | 缓存细分 |
| [parthkhxndelwal/bee-gee](https://github.com/parthkhxndelwal/bee-gee) | 40 | 2026-09-25 | V2 TUI **首页像素壁纸** | 纯装饰但证明"首页可编程" | V2 | 纯玩具位，无竞品 |
| [rashidrazak/opencode-status-line](https://github.com/rashidrazak/opencode-status-line) | 35 | 2026-11-02 | V2 状态行：context / cache / 流式速度 / 成本 / 耗时 | 最新一波 V2 状态行 | V2（`@opencode/plugin@latest`） | 状态行**严重拥挤**（见 §5） |
| [madsoftwaredev/opencode-plugins](https://github.com/madsoftwaredev/opencode-plugins) | 6 | 2026-11-01 | 后台 subagent / 子 agent 侧栏 / ESLint 反馈 | 跟着 2.2.5 走的最新个人插件集 | V2（`@opencode/plugin@2.2.5`） | 与 Hotakus 部分重叠 |
| [kitlangton/opencode-plugins](https://github.com/kitlangton/opencode-plugins) | 18 | 2026-09-18 | **核心成员**（kitlangton，2,151 commits）的个人 V2 插件集 | 学 V2 惯用写法的第一手样例 | V2（`@opentui/solid@0.5.1`） | 参考实现，非产品 |
| [floze-the-genius/opencode-status-signals](https://github.com/floze-the-genius/opencode-status-signals) | 22 | 2026-09-18 | 用**主题切换**表达会话状态（started / question / permission / error） | 思路巧：不碰终端，改 opencode 主题 | V2（靠原生主题系统） | 无竞品 |
| [daemon1s/opencode-deepseek-chan](https://github.com/daemon1s/opencode-deepseek-chan) | 17 | 2026-09-20 | Desktop 动画视频背景 + 玻璃拟态主题 | 唯一"桌面端视觉改造"样本 | Desktop 主题（非插件） | 无竞品但受众窄 |

**小结**：V2 原生第三方 TUI 插件 ≈ **11 个仓库**，其中 5 个 ≤ 30★。数量少、质量参差、**没有一个做成"整合产品"**。

---

## 3. 表 B：V1 遗留的视觉插件（= 现成的迁移机会）

> 这些仓库有 star、有需求，但**停在 V1**（依赖 `@opencode-ai/plugin@1.x`），在 2.x 上完全不运行。官方明确没有自动迁移工具。

| 仓库 | ★ | 最后 push | 做什么 | 状态判定 | 迁移价值 |
|---|---|---|---|---|---|
| [anomalyco/oc-plugin-rainbow](https://github.com/anomalyco/oc-plugin-rainbow) | 90 | 2026-04-10 | **官方组织**出的「主题感知彩虹后处理」 | V1 独占（`@opentui/core@0.1.97`） | 最讽刺的一条：官方自己的视觉插件都停在 V1，V2 侧**主题后处理全空** |
| [psinetron/opencode-visualiser](https://github.com/psinetron/opencode-visualiser) | 180 | 2026-10-30 | 把日志变成 **2D 像素办公室**，看 agent 工作/摸鱼/庆祝 | V1（`@opencode-ai/plugin@1.16`），仍在维护但跑不了 V2 | 话题性最强的视觉项目，V2 版几乎没有（bee-gee 只做壁纸） |
| [ishaksebsib/opencode-tree](https://github.com/ishaksebsib/opencode-tree) | 107 | 2026-05-12 | TUI 树视图 | V1 | 已有 aihaipeng 的 V2 竞品，价值下降 |
| [kkugot/opencode-theme-studio](https://github.com/kkugot/opencode-theme-studio) | 32 | 2026-03-23 | 主题**实时预览编辑器** | 无 `package.json`（V1 时代） | V2 主题=theme tokens，做"主题工作室"的窗口仍在 |
| [oorestisime/opencode-diffs](https://github.com/oorestisime/opencode-diffs) | 15 | 2026-02-25 | 用 `@pierre/diffs` 看 opencode diff | V1（`@opencode-ai/plugin@1.2.5`） | 官方 v2.0.30 已内建 `/diff`，此项基本作废 |
| [Yotsuki2213/OpenCode-Glance](https://github.com/Yotsuki2213/OpenCode-Glance) | 13 | 2026-08-12 | TUI **悬浮指令面板**（中文） | 无 `package.json` | 中文用户向的"面板形态"参考 |

---

## 4. 表 C：会话浏览 / 搜索 / 导出 / 分享 / 回放 / 时间线 / diff

> 共同规律：**全部是外部 app 或跨工具聚合**，没有一个是"opencode TUI 内的会话浏览器"。而且多数是 2026-10~11 的新仓库 —— 说明这波需求正在爆发。

| 仓库 | ★ | 最后 push | 做什么 | 形态 | 备注 |
|---|---|---|---|---|---|
| [backnotprop/plannotator](https://github.com/backnotprop/plannotator) | 9,828 | 2026-11-03 | 计划/diff 的可视化标注 + 私有分享，官方 ecosystem 收录 `@plannotator/opencode` | opencode **插件** + 外部 UI | 这赛道**最大赢家**，Apache-2.0；证明"评审可视化"能到万星 |
| [persiyanov/herdr-reviewr](https://github.com/persiyanov/herdr-reviewr) | 964 | 2026-10-31 | 终端侧栏里看 agent diff、按行评论回传给 agent | 外部 TUI pane | 与 opencode 平级使用 |
| [jazzyalex/agent-sessions](https://github.com/jazzyalex/agent-sessions) | 932 | 2026-11-02 | macOS 本地会话浏览 + **全文搜索** + 时间线 + resume | 外部 app | 只读 SQLite |
| [es617/claude-replay](https://github.com/es617/claude-replay) | 853 | 2026-10-31 | 把会话转成**可分享 HTML 回放**（Claude Code / Codex / Gemini / **OpenCode**…） | 外部 CLI | **会话分享下线后的最强替代品形态**，见 §7-候选 2 |
| [waynesutton/opensync](https://github.com/waynesutton/opensync) | 413 | 2026-10-04 | 云同步仪表盘 + 语义搜索 opencode/Claude Code 会话 | Web | 走 SaaS 路线 |
| [jerrywu001/cc-sessions-viewer](https://github.com/jerrywu001/cc-sessions-viewer) | 412 | 2026-11-02 | 跨工具会话查看器 + skills 管理 + token | 外部 app | 功能大杂烩 |
| [nicosuave/memex](https://github.com/nicosuave/memex) | 301 | 2026-11-02 | transcript 搜索 + resume + 用量追踪 | 外部 CLI | 跨工具 |
| [ccpopy/cc-sessions](https://github.com/ccpopy/cc-sessions) | 280 | 2026-11-02 | 中文会话管理（Windows/Linux/macOS/SSH） | 外部 app | 中文生态已有玩家 |
| [luoyuctl/agenttrace](https://github.com/luoyuctl/agenttrace) | 154 | 2026-11-02 | Rust TUI 审计：成本 / token / 延迟 / 失败 / diff / 报告 | 外部 TUI | 单二进制 |
| [TaewoooPark/Agent-Blackbox](https://github.com/TaewoooPark/Agent-Blackbox) | 81 | 2026-11-02 | 把每次运行回放成 **live session map** | 外部 app | "会话地图"形态的验证 |
| [remorses/critique](https://github.com/remorses/critique) | 1,286 | 2026-11-02 | 审 git 变更的 TUI + 网站 | 外部 | OpenTUI 系 |
| [tomasz-tomczyk/crit](https://github.com/tomasz-tomczyk/crit) | 1,266 | 2026-11-02 | 浏览器里审 plan/diff/artifact，注释回传；带 opencode **v1+v2** 插件 | 外部 UI + 插件 | MIT，本地单二进制 |
| [shuv1337/oc-manager](https://github.com/shuv1337/oc-manager) | 42 | 2026-02-05 | OpenTUI 里检查/过滤/清理 opencode 元数据 | 外部 TUI | 存储膨胀痛点（#33356） |
| [AbdoKnbGit/opencode-replay](https://github.com/AbdoKnbGit/opencode-replay) | 8 | 2026-05-24 | "Replay Studio" 会话回放 | 外部 | **注意：opencode 原生回放最大只有 8★** |
| [ramtinJ95/opencode-replay](https://github.com/ramtinJ95/opencode-replay) | 4 | 2026-01-03 | CLI 回放/复习会话 | 外部 CLI | 同上 |
| [codedthinking/opencode-replay](https://github.com/codedthinking/opencode-replay) | 0 | 2026-06-16 | 带动画/音频/场景标记的 HTML 回放 | 外部 | 想法对，执行弱 |
| [ioidj/opencode-playback](https://github.com/ioidj/opencode-playback) | 0 | 2026-10-30 | 回放对话并重建 workspace 快照 | 外部 | 最新一次尝试，0★ |

**结论**：会话"读"这一层被外部 app 抢光了（且多为跨工具）；**"把会话变成可分发的视觉产物"这一层在 opencode 侧完全没有赢家**。

---

## 5. 表 D：上下文 / token / 成本可视化（**饱和 + 官方正在内建**）

> 必须区分两类：「**省 token**」（transforms/pruning）与「**看见 token**」（可视化）。前者有 4k★ 头部，后者是红海。

| 仓库 | ★ | 最后 push | 类别 | 做什么 | 判断 |
|---|---|---|---|---|---|
| [Tarquinen/opencode-dynamic-context-pruning](https://github.com/Tarquinen/opencode-dynamic-context-pruning) | 4,461 | 2026-09-25 | 省 | 动态裁剪过期 tool output | 官方 ecosystem 收录，头部 |
| [ranxianglei/opencode-acp](https://github.com/ranxianglei/opencode-acp) | 278 | 2026-10-23 | 省 | 模型驱动的上下文裁剪（中文） | 省赛道第二梯队 |
| [slkiser/opencode-quota](https://github.com/slkiser/opencode-quota) | 1,078 | 2026-11-03 | 看 | 配额/用量，宣称不污染上下文 | 看赛道最高星 |
| [opgginc/opencode-bar](https://github.com/opgginc/opencode-bar) | 324 | 2026-10-08 | 看 | token 用量追踪 | |
| [Hotakus/opencode-visual-cache](https://github.com/Hotakus/opencode-visual-cache) | 315 | 2026-09-30 | 看 | 缓存命中率侧栏 | 视觉完成度最高 |
| [ramtinJ95/opencode-tokenscope](https://github.com/ramtinJ95/opencode-tokenscope) | 282 | 2026-07-29 | 看 | 会话 token/成本分析 | |
| [Cateds/opencode-stats](https://github.com/Cateds/opencode-stats) | 79 | 2026-08-04 | 看 | 终端统计仪表盘 | |
| [streetturtle/opencode-better-sidebar](https://github.com/streetturtle/opencode-better-sidebar) | 67 | 2026-10-19 | 看 | 侧栏 context 进度条 + 会话 token | V2 |
| [zhumengzhu/opencode-cache-hit](https://github.com/zhumengzhu/opencode-cache-hit) | 36 | 2026-10-30 | 看 | 缓存命中 + 成本 + 子会话 | |
| [rashidrazak/opencode-status-line](https://github.com/rashidrazak/opencode-status-line) | 35 | 2026-11-02 | 看 | V2 状态行 | |
| [nmdra/opencode-cache-stats](https://github.com/nmdra/opencode-cache-stats) | 27 | 2026-10-31 | 看 | `/cache-stats` 弹窗 | |
| 另有 ≥10 个 `opencode-statusline` 类仓库 | 0–35 | 2026-06 ~ 11 | 看 | `opencode-statusline` / `ocstatusline` / `-statusline-plugins`… | **0–35★ 的碎片化红海** |

**官方侧同时在内建**（这条最关键）：

- #5374「show tokens / second」→ **closed / completed**（👍112，2026-10-01）；#49380 明写 "The TUI has a built-in per-response `t/s` in the assistant footer"
- #13003「Display token usage information in the TUI」→ **closed / completed**（👍55）
- #6152「Session context usage」→ **closed / completed**（2026-10-20，👍142）；Desktop 已有 **Context tab**（bug #55046、提案 #57898 都围绕它）
- #8619「Native StatusLine Hook for Plugins」→ not planned；但 V2 用 **`home.footer.status` / `prompt.footer.status` / `sidebar.footer` 槽位**达成了同一目的

> **判断：视觉方向不要从这里切。** 唯一残余空间是"**归属可视化**"——#6152 评论里 AvatarGanymede 说的 *"I really need this feature to judge my skill and mcp costs"*（谁在吃上下文：skill 还是 MCP schema 还是 tool output）。这块连 Desktop 的 Context tab 都还没做细。

---

## 6. 表 E：相邻生态可抄的点子

| 仓库 | ★ | 最后 push | 做什么 | 对 opencode 的启发 |
|---|---|---|---|---|
| [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) | **29,085** | 2026-11-02 | Claude Code 插件：**常驻输入框下方**的 HUD（上下文用量 / 限流 / 活跃工具 / 运行中的 agent / todo 进度） | **本报告最强的需求外部证据**：一个"状态整合层"能到 2.9 万星。opencode 无同构整合层 |
| [sirmalloc/ccstatusline](https://github.com/sirmalloc/ccstatusline) | 13,497 | 2026-11-02 | 高度可定制状态行（powerline 支持） | Claude Code 状态行生态的头部；opencode 侧对应物只有 1★ 的 [amirlehmam/ocstatusline](https://github.com/amirlehmam/ocstatusline) |
| [Haleclipse/CCometixLine](https://github.com/Haleclipse/CCometixLine) | 3,523 | 2026-11-01 | Rust 写的状态行 | 状态行能卷到 3.5k★ |
| [Owloops/claude-powerline](https://github.com/Owloops/claude-powerline) | 1,174 | 2026-11-02 | vim 风 powerline | 视觉风格可借 |
| [ccusage/ccusage](https://github.com/ccusage/ccusage) | 19,306 | 2026-11-03 | `npx ccusage` 跨工具 token 账单 | "看账单"已被占；但它是外部 CLI，V2 内建后价值下降 |
| [junhoyeo/tokscale](https://github.com/junhoyeo/tokscale) | 5,793 | 2026-11-02 | token 追踪 + 全球排行榜 | 社交玩法（排行榜）可借 |
| [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) | 28,658 | 2026-11-03 | Ghostty 系 macOS 终端：垂直 tab + 通知给 AI agent | 终端层抢"agent 可见性"；opencode 只能在 TUI 层做 |
| [anomalyco/opentui](https://github.com/anomalyco/opentui) | 13,701 | 2026-11-02 | TUI 库（opencode 的渲染底座） | V2 TUI 插件就是 OpenTUI + SolidJS，**组件可以直接抄** |
| [shadcn-labs/termcn](https://github.com/shadcn-labs/termcn) | 1,219 | 2026-10-07 | Ink/OpenTUI 组件库（shadcn 风） | 视觉素材来源 |
| [tuiparts/tuiparts](https://github.com/tuiparts/tuiparts) | 269 | 2026-10-29 | OpenTUI 原语 + 可编辑 recipe | 同上 |
| [msmps/awesome-opentui](https://github.com/msmps/awesome-opentui) | 408 | 2026-10-14 | OpenTUI 资源榜 | 找现成视觉样例 |
| [remorses/termcast](https://github.com/remorses/termcast) | 342 | 2026-09-01 | 把 Raycast 扩展变成 TUI | "终端里的扩展市场"形态参考（见候选 1） |

**可抄的三条**：① claude-hud 的「常驻 HUD」信息架构；② ccstatusline 的「可配置分段 + powerline」；③ cmux 的「垂直 tab + 谁在等你」注意力模型。openTUI 组件生态已足够，视觉不需要从零画。

---

## 7. 被验证但没人做的交互层空白（5 个候选）

> 排序 = 我的推荐度。每条给：痛点证据（issue 号/赞数/评论数）→ 插件可行性（V2 hooks/transforms/TUI API 够不够）→ 工作量 → 视觉卖点。

### 候选 1 ★★★ TUI 内的「插件画廊 / 发现」— 纯插件可做，两个前人已熄火

**痛点证据（结构性 + issue 双重）**

- [#28696「Plugin/Agent/Skills/etc marketplace」](https://github.com/anomalyco/opencode/issues/28696)：**open**，2026-05-21 创建，11 评论、**45 表情**，正文自己列了 **21 个重复 issue**（#7467 / #23800 / #18697 / #3087 / #16012 / #28383 / #7716 / #8386 / #10968 / #12309 / #9353 / #3471 / #3207 / #1849 / #6347 / #6013…）。这是全仓"重复度最高"的需求之一。
- 官方 ecosystem 页实测仍是 **31 插件 + 10 项目，0 个 V2 TUI 插件**（本次 fetch 核实）；`awesome-opencode` 10,846★ 但 V1/V2 混杂、无能力标签。
- 本次检索到 **20+ 个** 状态栏类插件，彼此完全不可见 —— 供给过剩下的发现成本问题。
- V2 现成入口只有 `opencode plugin add <包名>` 和 `ctrl+p → "Install Plugin"`（streetturtle README 实证），**必须自己知道包名**。

**插件可行性：够，且不需要上游改动。** TUI 插件今天就有：`ui.router.register()`（自定义路由页）、`ui.dialog.show()`（自定义 JSX 弹窗）、`ui.slot()`、`keymap.layer()`（`/plugins` 命令 + 快捷键）、`context.client`（拉 npm registry / GitHub raw 索引）、`context.storage`（收藏/忽略列表）。索引可以先做静态 JSON 放仓库/Pages。

**工作量：小–中（3–5 天 MVP）**：索引 JSON（50–100 条，标注 V1/V2、能力标签、截图 URL）→ 卡片列表 + 详情页（README 摘要 + GIF）→ 一键写入 `opencode.json`/`cli.json` → 提示重载。V1 条目给"不可用/需迁移"标。

**视觉卖点**：终端里的"应用商店"卡片墙 + 截图/GIF 预览 + 能力标签筛选（TUI / 安全 / 记忆 / 视觉 / 省 token）+ 已装/可升级角标。**截图即传播**，且天然给自己后续插件带量。

**竞品（补查，必须点名）** —— 这条不是无人区，是「试过、没赢」：

| 竞品 | ★ | 最后 push | 形态 | 为什么没起来 |
|---|---|---|---|---|
| [ThomasSanna/opencode-mercato](https://github.com/ThomasSanna/opencode-mercato) | **1** | 2026-08-17 | **V2 TUI 插件**：在 TUI 弹窗里浏览 opencode.cafe + awesome-opencode + 官方 ecosystem 聚合目录，装/启停/升级/降级 | 方向完全正确，但只有 1★、八月后没动 |
| [Mirrowel/opencode-souk](https://github.com/Mirrowel/opencode-souk) | 5 | 2026-05-31 | 替换内置插件管理器的 TUI 市场，合并多来源、看来源再写配置 | 五月停更，V1 时代 |
| [NikiforovAll/opencode-marketplace](https://github.com/NikiforovAll/opencode-marketplace) | 12 | 2026-02-06 | CLI：从本地目录 / GitHub URL 装插件 | CLI、非视觉、二月停 |
| [juliendf/opencode-registry](https://github.com/juliendf/opencode-registry) | 8 | 2026-09-24 | 59 个组件的策展 registry + CLI | Python CLI、非 TUI |
| [ocx](https://github.com/kdcokenny/ocx) | — | 活跃 | 官方 ecosystem 收录的扩展管理器（profile 隔离） | 管理强、发现弱（无画廊） |
| `ctrl+p → "Install Plugin"` | — | 内置 | 单包名输入 | 必须自己知道包名 |

> **判断**：需求被反复验证（21 个重复 issue）但**没有一个赢家**（最大 12★，且都不是"视觉化的画廊"）。突破口不是"再做一次目录"（Mercato/Souk 已经证明目录不够），而是 **策展质量 + 截图/GIF 预览 + 能力标签 + 与体检（skills-doctor）联动** —— 这恰好是你已有两个 skills-doctor 仓库能复用的部分。

---

### 候选 2 ★★★ 会话回放 →「可分享的 HTML / GIF」— share 下线后的正位

**痛点证据**

- 官方 2026-10-15 **v2.0.30 移除** session-sharing 后端与 `/share`（changelog: `Remove the retired session-sharing backend and unavailable /share command`，#55716）；v1.19.1 亦写 "Session sharing has been discontinued"。
- [#4714](https://github.com/anomalyco/opencode/issues/4714) 里官方 bot（2026-10-29）给的唯一 workaround 就是：*"run `/export` and search the exported transcript in your editor"* —— **能力退化到文本文件**。
- 相邻验证：[es617/claude-replay](https://github.com/es617/claude-replay) **853★**（把 Claude Code / Codex / Gemini / **OpenCode** 会话转成 HTML 回放）。
- opencode 原生侧尝试全是散兵：[AbdoKnbGit/opencode-replay](https://github.com/AbdoKnbGit/opencode-replay) 8★、[ramtinJ95/opencode-replay](https://github.com/ramtinJ95/opencode-replay) 4★、[codedthinking/opencode-replay](https://github.com/codedthinking/opencode-replay) 0★、[ioidj/opencode-playback](https://github.com/ioidj/opencode-playback) 0★ —— **有需求，无赢家**。

**插件可行性：够。** V2 server part 能读会话与消息（`ctx.session` / `client.message.list`），可生成自包含 HTML（内联 CSS、折叠 tool 调用、成本小计），写文件；TUI part 加 `/replay` 命令 + 提示路径/打开浏览器（若 TUI 侧不能 spawn，就走 server part 或 rpc）。不需要任何 TUI 内核原语。

**工作量：中（5–8 天）**：HTML 模板 + 数据脱敏（路径/密钥/token）+ 工具调用折叠 + 每轮成本条 + 暗色主题；再加 `--gif` 需要截图管线（后置）。

**视觉卖点**：单文件 HTML = 可双击看、可发推、可贴 HN、可做 GitHub Pages；对"分享工作流"这件事是**直接替代官方下线功能**。差异化点相对 claude-replay：opencode 原生一键、脱敏默认开、含 token/成本时间轴、TUI 内触发。

**竞品**：claude-replay（跨工具、已支持 opencode，853★）是唯一强敌；另外 [plannotator](https://github.com/backnotprop/plannotator) 9,828★ 占了"评审分享"而不是"会话回放"。

---

### 候选 3 ★★☆ `session.panel` 会话结构地图（子 agent 树 + 工具时间线 + 成本）

**痛点证据**

- [#22067「/tree command for visual session navigation」](https://github.com/anomalyco/opencode/issues/22067)：**closed / not_planned**，**35 表情**（2026-04-11 → 2026-10-14），需求被"计划外"关掉而不是被满足。
- [#4714](https://github.com/anomalyco/opencode/issues/4714)：45 评论全程在要"在会话里定位/跳转"，最后停在"缺 `scrollTo` / `highlight` 原语"（2026-10-31 评论给了明确方案）。
- 外部验证：[TaewoooPark/Agent-Blackbox](https://github.com/TaewoooPark/Agent-Blackbox) 81★（live session map）、[jazzyalex/agent-sessions](https://github.com/jazzyalex/agent-sessions) 932★（timeline）、[Hotakus/opencode-subagent-magazine](https://github.com/Hotakus/opencode-subagent-magazine) 136★、[luoyuctl/agenttrace](https://github.com/luoyuctl/agenttrace) 154★。

**插件可行性：够 —— 前提是「不进 transcript」。** V2 官方文档已有 `session.panel` 槽位：`context.ui.slot({ append: "session.panel", … })` + `context.ui.panel.open("acme.map")`，宿主管尺寸/焦点/全屏；数据侧 `data.session.list/root/family/cost/status` + `message.list` + `pending.list` 都在。**这不等于 #4714 的会话内搜索**（那个明确做不到），是在独立面板里重画结构。

**工作量：中（5–7 天）**：树/时间线渲染 + 成本聚合 + 失败高亮 + 点击跳到对应 session 或 `/diff`。

**视觉卖点**：一棵"agent 树 + 每步工具条 + 子会话成本 + 红色失败点"的地图；窄终端自动全屏（宿主已内置）。这是终端里第一次能"看见运行结构"。

**竞品**：Hotakus 子 agent 侧栏（136★，只监控当前子 agent，无树无成本归集）、streetturtle `session-tokens`、CodeNomad 的 timeline（外部客户端）。

---

### 候选 4 ★★☆ Desktop GUI 插件（V2.2 刚开的门，第三方≈0）

**痛点证据**

- V2.2.0 changelog（2026-10 内）：`Add GUI plugin APIs for toasts, dialogs, notifications, tabs, composer controls, and custom UI.`（#59469）；`Add custom composer-pill popovers for GUI plugins.`（#59437）。
- [#43132「Plugin UI surface for the web/desktop app, mirroring the TUI plugin API」](https://github.com/anomalyco/opencode/issues/43132)：**open**，👍/表情 **17**，2026-08-17 创建、**2026-10-28 仍在更新** —— 说明桌面/web 侧与 TUI 侧仍有落差。
- 官方文档 `/build/plugins/gui` 定位是 *"Add panels, commands, settings pages, and native integrations to OpenCode Desktop"*。

**插件可行性**：够但**实验性**（导出名 `./gui-experimental`，需 Electron Desktop）。TUI 侧完全做不了，只能 Desktop。

**工作量：大（10 天+）**：GUI 生命周期 + 接 Desktop 打包 + 死锁版本（2.2.x 每次 breaking）。

**视觉卖点**：真正的像素级 UI，不受 80 列限制；可做"任务看板 / 成本仪表盘 / 评审面板"。**竞争几乎为零**，是最长的护城河，但也是最快的翻车点。

**竞品**：Desktop 自带 Context tab、side panel、Extensions 侧栏；第三方 ≈ 0。

---

### 候选 5 ★☆☆ 统一 HUD 整合层（验证最强，但已拥挤，不推荐首选）

**痛点证据**：[claude-hud](https://github.com/jarrodwatts/claude-hud) **29,085★** —— 常驻 HUD 显示 context / 限流 / 活跃工具 / 运行中 agent / todo。opencode 侧对应物是**散的**：`t/s` 与 token 官方已内建（#5374 / #13003 completed），第三方 20+ 个 0–35★ 状态栏 + Hotakus 315★ + streetturtle 67★。

**插件可行性**：够（`prompt.footer.status` / `home.footer.status` / `sidebar.footer` / `session.panel`）。

**工作量：小（3–4 天）**。

**视觉卖点**：powerline 一行 / 多行 HUD。

**竞品**：太多，且官方正在内建 → 只有在"多会话 + 多 subagent + 多订阅额度（OpenCode Go / Cursor / GitHub Copilot / DeepSeek）聚合"上做整合才有意义。

---

### 明确建议「不要做」（本次调研的负面结论）

| 方向 | 理由 |
|---|---|
| 单点状态栏 / statusline | 20+ 竞品、0–35★ 碎片化；官方已有 `footer` 槽位，随时被内建 |
| token 计数 / 上下文进度条 | 官方 #5374 / #13003 / #6152 三项 completed，Desktop 有 Context tab |
| 通知 / 声音提醒 | 本地文档已判定饱和（notificator/notifier/notify） |
| 会话内搜索 / transcript 高亮 | 官方 bot 2026-10-29 明确「TUI 插件做不了」，缺内核原语（#4714） |
| diff 查看器 | 官方 v2.0.30 已内建半屏 `/diff`；外部还有 herdr-reviewr 964★ / plannotator 9.8k★ |
| 「省 token」类 pruning | Tarquinen 4,461★ 已垄断 + 官方 compaction 持续加强 |

---

## 8. 三个指定 issue 的专项核对

### #6152 — Session context usage（👍142）

- [issues/6152](https://github.com/anomalyco/opencode/issues/6152)：**closed / completed**，`closed_at=2026-10-20T00:51:24Z`，closer=`neriousy`；24 评论、👍142、❤️9（合计 154 反应）。
- 2026-06-23 被 `simonklee` 标记 **marked_as_duplicate**（API 未返回重复目标 issue 号）。
- 24 条评论无一条说明关闭原因；最后一条社区评论是 2026-10-09（"Why OpenCode core developers don't consider this?"）。
- 同一时间线出现两条关键 cross-reference：`Desktop 2.0 must ship built-in session metrics (tokens/sec + cache hit rate) — no UI plugin path exists`（2026-09-29）与 `desktop: Context tab hides system prompt...`（[#55046](https://github.com/anomalyco/opencode/issues/55046)，2026-10-13，仍 open）→ **Desktop 确实有 Context tab**。
- 我的判断（**标为待实测**）：Desktop 侧上下文明细已落地；**TUI 侧是否已有 `/context` 未证实** —— 我在 `packages/tui/src` 里用 code search 没找到 context 命令（`context path:packages/tui/src/commands` 命中 0），但路径可能不准。**建议你在装了 2.x 的机器上 `ctrl+p` 搜 "context" 复核一次**，这决定候选「归属可视化」是否仍成立。

### #4714 — TUI 会话内搜索（45 评论）

- [issues/4714](https://github.com/anomalyco/opencode/issues/4714)：**open**，2025-11-24 创建，**45 评论 / 👍66 / ❤️7**，最后活跃 **2026-10-31**、`updated_at=2026-10-31`。
- 官方 bot（2026-10-29）原话：**"The v2 TUI doesn't have this yet."** + **"This can't be built as a TUI plugin yet. A plugin can read the session's messages, but it has no way to scroll the session view to a match or highlight it."**
- 社区把 UX 都谈完了，卡在"代码放哪"：曾尝试 #4898（Ctrl+F）、#34297（dialog）、#36526（内联 Ctrl+R）、#53589（**v1 PR 已拿到 LGTM，随 v1 分支关闭**）；`moritzWa` 已把实现移植到 v2 fork（2026-10-22，附 demo gif），并公开问"要 native 还是先加插件 API"。
- 2026-10-31 的收口建议（balabommablock-cpu）：**只需要两个原语** —— `scrollTo(messageID, partID, line?)` 与 `highlight(ranges)/clearHighlights()`；有了它们，搜索可作为内置插件发布，还顺带解决"跳到上一条提问/上一条错误/书签"。
- **结论**：这是"上游 PR + 插件"的方向，不是纯第三方插件能闭环的。**如果愿意投上游，这是全仓性价比最高的一个 PR**（需求明确、实现已存在、只差两个原语）。

### #6330 — 给插件的通用 UI intent 通道（23 评论）

- [issues/6330](https://github.com/anomalyco/opencode/issues/6330)：**closed / not_planned**（2026-10-30，bot），标签 `pending close` / `triaging`；23 评论、👍11、❤️15。
- 关闭理由（bot 原话）：*"This was written against OpenCode v1 … the files it references … are v1 code."* + *"v2 (`@opencode/cli`) already has a built-in `question` tool, built on a shared form primitive in core, plus form fields in the plugin integration API"* + *"a separate GUI plugin API with dialog definitions"*，并邀请"如果 v2 仍缺，就开新 issue 描述 v2 的缺口"。
- 讨论中留下的真实诉求（值得抄进你的设计）：① **HITL 原语**（阻塞式提问）已被内置 `question` 工具吃掉；② **自定义 UI 渲染**（插件画自己的面板）→ V2 已由 TUI slots/routes/dialogs + GUI plugin API 部分满足；③ 「插件状态消息不该进模型上下文」（mirsella 2026-07-05）→ 对应 V2 的 toast/slot 而非 `session.synthetic`。
- **结论**：**V1 时代的"UI intent 通道"已被 V2 的 slots/routes/dialog/panel API 事实上替代**。你要做视觉插件，直接用 V2 的 `ui.*` API，不要等这个 issue。**但它证明了一件事：社区对"插件能画 UI"的需求是 2025-12 就提出的、被讨论了 10 个月**——现在门开了，做的人极少。

---

## 9. 落地建议（结合你已有的两个 skills-doctor 仓库）

| 路径 | 做什么 | 为什么适合你 | 首版范围 |
|---|---|---|---|
| **A. 先做「插件画廊」（推荐首发）** | TUI 插件：`/plugins` 打开卡片墙，按能力筛选、看截图、一键装/升级；索引里给每条标 V1/V2 | 你已有"体检/审计"心智（skills-doctor），画廊是天然的**分发入口**，能给自己带量；纯插件、无需上游；中文/双语 README 是你的既有优势 | 50 条精选索引 + 卡片/详情 + 一键写入 + "V1 不可用"提示 |
| **B. 再做「会话回放 HTML」** | `/replay` → 自包含 HTML（工具折叠 + 每轮成本 + 脱敏） | 官方把 `/share` 砍了，需求真空；产物可视、可传播，最符合"视觉"标签；7 天能闭环 | 单会话 HTML + 脱敏 + 暗色主题 |
| **C. 押注「会话地图」面板** | `session.panel` 里画 agent 树 + 工具时间线 + 成本 | 差异化最深、技术门槛最高、竞品最弱；但依赖 2.2.x panel API 稳定度 | 只读地图 + 点击跳 session |

**共同风险与对策**（来自 changelog 实证）：

- V2 每版都可能 breaking：2.2.3 强制 **OpenTUI 0.8**（ScrollBox 变 façade、`RenderContext` 需 `clock`）；2.2.0 改 SDK/事件/插件契约；2.1.0 改 replay data 命名。
  → **锁 `@opencode/plugin` 到 minor、CI 跑 2.x 最新版、README 写清兼容矩阵**。
- V2 与 V1 用户群分裂（你本机是 1.18.4，V1 线）。要么像 [lkonga/opencode-retitle](https://github.com/lkonga/opencode-retitle) 那样做「V2 主 + V1 兼容」双入口，要么明确只支持 2.x。
- 官方要求 UI/核心功能先设计评审 → 视觉插件走"外围能力"最容易过。

---

## 10. 方法与局限

- **数据来源**：GitHub REST API（`/search/repositories`、`/search/issues`、`/search/code`、`/repos/{o}/{r}`、`/issues/{n}`、`/issues/{n}/comments`、`/issues/{n}/timeline`、`/contents/package.json`、`/readme`）+ `r.jina.ai` 转写的 `opencode.ai/v2/docs/*`、`raw.githubusercontent.com` 的 V2 `CHANGELOG.md`、`awesome-opencode` README。
- **token 处理**：按指示用 `git credential fill` 取，仅在 PowerShell 进程内存在，**未打印、未写入任何文件**。
- **限流**：命中 1 次 search 403（`opencode+sidebar` 查询），已跳过；其余批量查询均成功（search 30/min，core 5000/h）。
- **数字口径**：★ 与 `pushed_at` 为 2026-11-03 快照；`pushed_at` 可能仅来自 README/bot 提交，**不等于功能活跃**。issue 的 `r=` 为「表情反应总数」（含 👍❤️🎉 等），文中已区分。
- **V1/V2 判定**：以仓库 `package.json` 依赖 `@opencode/plugin`（V2）vs `@opencode-ai/plugin`（V1）为准；无 `package.json` 的仓库标"未取/未知"。
- **未做实测**：本机 opencode 为 1.18.4（V1），**所有 V2 行为结论均来自官方文档/changelog/bot 回复，未在真机复现**。
- **待复核清单**：① TUI 是否已有 `/context`（#6152 关闭原因无文字说明）；② `session.panel` 从哪个 2.x 版本起可用（文档未标版本）；③ GUI 插件 API 是否已脱离 `experimental`；④ #6152 的 duplicate 目标 issue 号（API 未返回）。

---

## 附：一键打开（证据入口）

**官方**

- 仓库：<https://github.com/anomalyco/opencode> ・ V2 changelog：<https://opencode.ai/changelog>
- 插件总览：<https://opencode.ai/v2/docs/build/plugins>
- **TUI 插件 API（视觉方向必读）**：<https://opencode.ai/v2/docs/build/plugins/cli>（slots / routes / `session.panel` / dialogs / keymap / markdown renderer / theme tokens）
- GUI 插件：<https://opencode.ai/v2/docs/build/plugins/gui>
- 生态页（31 插件 + 10 项目）：<https://opencode.ai/docs/ecosystem>

**聚合站**

- awesome-opencode：<https://github.com/awesome-opencode/awesome-opencode>（10,846★，pushed 2026-11-01，V1/V2 混杂）
- opencode.cafe：<https://opencode.cafe/>
- awesome-opentui：<https://github.com/msmps/awesome-opentui>
