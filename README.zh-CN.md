[English](README.md) | **简体中文**

<!-- badges 占位：npm 包发布后自动生效，发布前 404 属正常 -->
[![npm version](https://img.shields.io/npm/v/opencode-cordon.svg)](https://www.npmjs.com/package/opencode-cordon)
[![node](https://img.shields.io/node/v/opencode-cordon.svg)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenCode 2](https://img.shields.io/badge/OpenCode-2.2.x-1f2937)](#兼容性与路线图)

# opencode-cordon

**给 OpenCode 2 的权限警戒线：声明式策略 + 可审计的决策日志。**

> *Declarative permission policy with a tamper-evident audit trail for OpenCode 2.*

cordon 挂在 OpenCode 2 的 permission 判定上：用一份 `.opencode/cordon.jsonc` 决定哪些操作要更严，把每一次决定写进 JSONL，随时能生成一份自包含的 HTML 审计报告。它**只收紧、不放宽**——装错了最坏是"太严"，不会是"静默放开"。

## 为什么做这个

三条公开证据，按强度排序：

1. **凭据泄露不是假设。** 2026-10-17 的 HN 帖「OpenCode Hacked: User credentials leaked」拿到 **977 分 / 185 评论**（[HN 50133401](https://news.ycombinator.com/item?id=50133401)）；仓库里 [#46745](https://github.com/anomalyco/opencode/issues/46745) 记录 Bedrock / SAP 插件把存储的 API key 写进 `process.env`，泄露给每个子进程。
2. **官方至今没有沙箱。** [#2242「Is there a way to sandbox the agent?」](https://github.com/anomalyco/opencode/issues/2242) 从 2025-08 挂到现在仍然 open，**106 评论 / 👍82**。OpenCode 2.0 砍掉了 LSP、会话分享等一批功能，沙箱始终没做；权限仍然只是核心配置里的粗粒度开关。
3. **现有工具都只解决一个点。** 权限判定类插件全部在 40★ 以下：opencode-auto-permissions 38★、opencode-permission-reviewer 20★、opencode-warden 16★；该方向最高星的 opencode-vibeguard 有 217★，但 2026-03 就停更了。**没有一个同时做「策略引擎 + 审计留痕」**（数据见 [`docs/research/scout-tooling.md`](docs/research/scout-tooling.md) §2.4）。

## 它是什么

- **一层 permission 判定**：挂在 OpenCode 2 的 `ctx.permission.hook("evaluate")` 上做收紧。插件是 server part（`Plugin.define`），不 patch 核心、不 fork、不改 OpenCode 自身的 permission 配置。
- **一份声明式策略**：`.opencode/cordon.jsonc` 里写规则，按 `action` / `tool` / `path` / `command` / `agent` 匹配，跟着仓库走、能 diff、能 review。
- **一条决策日志**：每次 permission 判定、工具调用、命令创建写成 JSONL，`cordon audit` 汇总成单文件 HTML。
- **一个零依赖 CLI**：`check` / `evaluate` / `audit` / `init` / `redact`，离线可跑，退出码稳定，能直接进 CI。

## 它不是什么

- **不是沙箱。** 不做进程隔离、不做网络隔离、不拦系统调用。它只作用于 OpenCode 的 permission 决策与工具/命令事件；你绕过 OpenCode 直接在终端里跑的东西，它看不到。
- **不是原生 permission 的替代。** cordon 只收紧，原生 deny 永远是 deny（见[只收紧，不放宽](#只收紧不放宽)）。想放宽只能改 OpenCode 自己的 permission 配置。
- **不是 secrets manager / DLP 产品。** `redact` 是基于规则的最佳努力，不是完整的 PII 分类器。最稳的做法仍然是用规则把密钥路径直接挡在上下文之外。
- **不是密码学意义上的防篡改日志。** `tamper-evident` 在这里指：每条决策绑定明确的 `rule` + `reason`、远程命令只存 sha256、敏感值默认脱敏、日志只追加。有本地写权限的人仍然可以改删文件——那部分属于外部日志收集和文件权限的职责。
- **不是 V1 兼容层。** 1.18.x 上没有对应的 permission 钩子。
- **不是「把每个 ask 丢给模型审一遍」那种插件。** 判定是本地规则、确定性的，不花 token、不引入网络调用。

完整的威胁模型和漏洞报告流程见 [SECURITY.md](SECURITY.md)。

## 安装

插件侧需要 **OpenCode 2.2.x**；CLI 和插件运行时需要 **Node ≥ 20**（ESM，零运行时依赖）。

```bash
# 1) 装插件：写进 opencode 配置，OpenCode 下次启动时加载
opencode plugin add opencode-cordon

# 2) 装 CLI（也可以直接 npx，不装）
npm install -g opencode-cordon     # 之后可以用简写 cordon
npx opencode-cordon --version
```

只想要策略校验和审计报告，不挂插件也能用：CLI 不依赖运行中的 OpenCode。

## 5 分钟快速开始

```bash
# 1. 在当前项目落一份策略（默认 balanced）
npx opencode-cordon init
# → 写入 .opencode/cordon.jsonc

# 2. 校验策略。0 = 通过，2 = 无效
npx opencode-cordon check

# 3. 试几条判定，看退出码
npx opencode-cordon evaluate --action shell --command "rm -rf ./build"       # 20 = deny
npx opencode-cordon evaluate --action shell --command "git push origin main" # 10 = ask
npx opencode-cordon evaluate --action shell --command "npm test"             #  0 = allow / 无命中
npx opencode-cordon evaluate --action read  --path .env.local                # 20 = deny
```

PowerShell 里看 `$LASTEXITCODE`，bash / zsh 里看 `$?`。判定和退出码是稳定的，可以直接写进 CI 当策略测试。

```bash
# 4. 跑一段 OpenCode 会话（插件会把决策写进 .opencode/cordon/audit.jsonl），然后：
npx opencode-cordon audit --html report.html --open
```

`audit` 默认读 `.opencode/cordon/audit.jsonl`，按 `decision` / `rule` / `action` / `agent` 汇总，生成一个自包含的单文件 HTML（无外链资源，可以直接发给别人）。CI 里用 `--json`。

## 策略文件

两个位置，同一格式：

| 位置 | 用途 |
|---|---|
| `.opencode/cordon.jsonc` | 项目内策略，跟仓库走、进 code review |
| `~/.config/opencode/cordon.jsonc` | 全局策略，跨项目复用 |

策略文件里没写 `preset` 时，按 `balanced` 的 preset 规则求值；**完全没有策略文件时插件保持空闲（不猜规则，只打一行日志）**。JSONC 允许注释和尾逗号。

```jsonc
{
  "version": 1,
  "preset": "balanced",            // balanced（默认）| strict | relaxed
  "audit": {
    "enabled": true,
    "path": ".opencode/cordon/audit.jsonl",
    "redact": true,
    "commandHash": true            // 远程命令只存 sha256，不存明文
  },
  "rules": [
    {
      "id": "no-destructive",
      "effect": "deny",            // deny | ask | allow
      "match": { "action": "shell", "command": "rm -rf *" },
      "reason": "destructive shell command"
    },
    {
      "id": "ask-push",
      "effect": "ask",
      "match": { "action": "shell", "command": "git push*" },
      "reason": "pushing needs a human"
    },
    {
      "id": "protect-env",
      "effect": "deny",
      "match": { "action": "read|edit|write", "path": "**/.env*" },
      "reason": "secrets never enter the context"
    }
  ]
}
```

### 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | number | 目前固定 `1` |
| `preset` | string | `balanced`（默认）/ `strict` / `relaxed` |
| `audit.enabled` | boolean | 是否写审计日志 |
| `audit.path` | string | 日志路径，默认 `.opencode/cordon/audit.jsonl` |
| `audit.redact` | boolean | 敏感值脱敏，默认开 |
| `audit.commandHash` | boolean | 远程命令只存 sha256，不存明文 |
| `rules` | array | 用户规则，先于 preset 规则求值 |

### 规则字段

| 字段 | 说明 |
|---|---|
| `id` | 规则标识，会落进审计日志的 `rule` 字段；同一份策略里唯一 |
| `effect` | `deny` / `ask` / `allow`。**`allow` 表示"这里不收紧"，不会覆盖原生的 ask / deny** |
| `match.action` | action glob，可用 `a\|b` 写多个，如 `shell`、`read\|edit\|write` |
| `match.tool` | `action` 的别名，按工具名匹配，如 `edit`、`bash` |
| `match.path` | 路径 glob，支持 `**`，如 `**/.env*` |
| `match.command` | 命令 glob，`*` 可跨空格，如 `git push*` |
| `match.agent` | agent id glob，如 `build`、`*plan*` |
| `reason` | 给人看的理由，原样写进审计日志 |

`match` 里多个字段是 **AND**：全部命中才算命中。

### glob 规则

- `*` 匹配任意非路径分隔符字符；命令匹配里 `*` 可以跨空格；
- `**` 跨目录；
- `?` 匹配单个字符；
- 大小写不敏感（Windows 上尤其重要）。

### 求值顺序

1. 用户 `rules` 按数组顺序求值；
2. 再求值 `preset` 规则；
3. **第一个命中的规则生效**（用户规则天然优先于 preset）；
4. 都没有命中 = **不碰原生判定**。

注意 `allow` 的语义：它只表示"这一步 cordon 不收紧"，不会把原生的 ask / deny 降级；但按"首个命中生效"，它会跳过同一份策略里后面的 preset 规则。想让 preset 兜底，就别在靠前的用户规则里写 `allow`。

### preset

| preset | 行为 |
|---|---|
| `balanced`（默认） | 拦密钥路径 + 危险删除 + 提权命令；`git push` / `webfetch` 问一句 |
| `strict` | 在 balanced 之上：写 / 编辑一律 ask，shell 默认 ask |
| `relaxed` | 只拦密钥路径与不可逆删除 |

## CLI

| 命令 | 作用 | 主要参数 | 退出码 |
|---|---|---|---|
| `cordon check` | 校验策略（语法 + 字段 + glob） | `--policy <file>` `--json` | `0` 通过；`2` 无效 |
| `cordon evaluate` | 离线跑一次判定 | `--action <a>`（必填）`--command <cmd>` `--path <p>`（可多次）`--agent <id>` `--policy <file>` `--json` | `0` allow / 无命中；`10` ask；`20` deny |
| `cordon audit` | 汇总 JSONL + 生成自包含 HTML | `--log <file>` `--html <out>` `--open` `--json` | `0` 成功；失败非 0 |
| `cordon init` | 写 `.opencode/cordon.jsonc` | `--preset <name>`（balanced / strict / relaxed）`--force` | `0` 成功；失败非 0 |
| `cordon redact` | 密钥 / PII 脱敏到 stdout | `--stdin` 或 `<file>` | `0` 成功；失败非 0 |
| `cordon --version` | 版本号 | — | `0` |

`cordon` 是 `opencode-cordon` 的简写，两者完全等价。`redact` 可以直接接管道：

```bash
cat .env | cordon redact --stdin > .env.redacted
```

## 审计日志

默认写 `.opencode/cordon/audit.jsonl`，追加式，一行一个事件。字段：

| 字段 | 出现事件 | 说明 |
|---|---|---|
| `ts` | 全部 | 时间戳 |
| `event` | 全部 | `decision` / `tool` / `shell` |
| `sessionID` | 全部 | OpenCode 会话 id |
| `agent` | 全部 | 触发的 agent |
| `action` | decision | permission action |
| `tool` | tool | 工具名 |
| `decision` | decision | `allow` / `ask` / `deny` |
| `rule` | decision | 命中的规则 id；没命中则空 |
| `reason` | decision | 规则里的 `reason` |
| `paths` | 全部 | 涉及路径（默认脱敏） |
| `commandHash` | shell | 命令的 sha256（`audit.commandHash` 打开时） |
| `status` | tool | 工具执行结果状态 |

敏感值默认脱敏；只需要命令指纹的场景打开 `commandHash`，明文就不会落盘。

## 审计报告

`cordon audit --html report.html` 产出单个 HTML 文件：按 decision / rule / action / agent 汇总，附最近的决定列表；没有外部 CSS / JS / 字体，适合随工单、事故复盘或 PR 附件一起传。

> 截图占位：示例报告在 [`docs/demo/audit.html`](docs/demo/audit.html)，浏览器直接打开即可。正式截图（`docs/demo/audit-report.png`）补进来后替换本段。

## 兼容性与路线图

0.1.0 已完成 **OpenCode 2.2.5 真机回归**（2026-11-03）：在 `--auto` 自动放行的模式下，`.env` 读取被 cordon 从原生 `ask` 收紧为 `deny`，`rm -rf ./scratch` 从原生 `allow` 收紧为 `deny`，两次判定都写进了 JSONL，`scratch/keep.txt` 原样保留。证据见 [`docs/REGRESSION.md`](docs/REGRESSION.md)。

| OpenCode | cordon 插件 | cordon CLI |
|---|---|---|
| 2.2.x | ✅ 目标版本（`Plugin.define` / server part），2026-11-03 真机实测通过 | ✅ |
| 2.0 – 2.1 | ❌ 未适配（server part 自 2.2 起可用） | ✅ |
| 1.18.x（V1） | ❌ V1 没有对应的 permission 钩子 | ✅ 独立可用 |

| 版本 | 内容 |
|---|---|
| 0.1.0（当前） | 策略引擎、JSONL 审计、`check` / `evaluate` / `audit` / `init` / `redact`；57 个测试；2.2.5 真机回归通过 |
| 下一步 | TUI 面板（用 `session.panel` 展示最近决策与规则命中） |
| 之后 | 审计完整性校验（哈希链）、策略模板 / 团队分发 |

明确不做的：沙箱、网络隔离、V1 兼容层、把判定交给 LLM。

本包零运行时依赖（ESM，Node ≥ 20）；开发时测试用 `node --test test/guard.test.mjs test/plugin.test.mjs`。

## 安全与威胁模型

### 只收紧，不放宽

cordon 的判定是对原生 permission 结果的单向修改：

| cordon 判定 | 原生 allow | 原生 ask | 原生 deny |
|---|---|---|---|
| 无命中 / `allow` | allow | ask | deny |
| `ask` | ask | ask | deny |
| `deny` | deny | deny | deny |

规则写错、策略文件被覆盖、插件升级出 bug——最坏结果是"该放行的被问了 / 被拦了"，不会是"该拦的被静默放行"。想真正放宽，只能改 OpenCode 的原生 permission 配置。

### 明确不在范围内

- 进程 / 网络隔离（需要 bwrap、容器、microVM 那类外部沙箱；两者可以叠加）；
- OpenCode 之外的操作（其他终端、IDE、CI）；
- secrets 的存储与轮换；
- 完整的 PII / DLP 分类；
- 防住一个有本地写权限、铁了心改审计文件的人。

策略文件本身也是普通文件：agent 如果有写权限，它一样能改 `.opencode/cordon.jsonc`。把它纳入 code review，或者用 cordon 自己的规则保护起来：

```jsonc
{ "id": "protect-policy", "effect": "deny",
  "match": { "action": "edit|write|read", "path": ".opencode/cordon*" },
  "reason": "policy is edited by humans only" }
```

完整威胁模型与漏洞报告流程见 [SECURITY.md](SECURITY.md)。

## 证据与致谢

- HN「OpenCode Hacked: User credentials leaked」**977 分 / 185 评论**（2026-10-17）：https://news.ycombinator.com/item?id=50133401
- issue #2242「Is there a way to sandbox the agent?」open，**106 评论 / 👍82**：https://github.com/anomalyco/opencode/issues/2242
- issue #46745——Bedrock / SAP 把 key 写进 `process.env`，泄露给子进程：https://github.com/anomalyco/opencode/issues/46745
- 生态与竞品数据：[`docs/research/scout-tooling.md`](docs/research/scout-tooling.md) §2.4 / §3 / §4 G1；视觉方向为什么不做：[`docs/research/scout-visual.md`](docs/research/scout-visual.md) §0 / §7（状态栏、token 面板已被官方内建和 20+ 个插件占满）。
- 思路参考：opencode-vibeguard（脱敏）、opencode-permission-reviewer（每条判定落 JSONL）。
- OpenCode 团队和 V2 插件 API。

## License

[MIT](LICENSE)
