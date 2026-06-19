# 初始化记录 — Agent 文档体系

## 基本信息

| 维度 | 结果 |
|------|------|
| 项目名称 | 豆包音频下载助手 |
| 项目类型 | Tampermonkey 用户脚本 |
| 核心文件 | `doubao-audio-capture.user.js`（单文件，~2800 行） |
| 技术栈 | JavaScript (ES6+), Tampermonkey API, lamejs CDN |
| 初始化日期 | 2026-06-19 |
| 规模选择 | 小型 |

## 第 0 步调查结果

1. **项目做什么**：捕获豆包网页版 (doubao.com) 中的 TTS 音频数据，支持主动/被动捕获、自动合并、暗黑模式
2. **技术栈**：纯 JavaScript userscript，运行在 Tampermonkey 沙箱，依赖 GM_* API（GM_setValue/getValue/download/xmlhttpRequest）
3. **硬约束**：单文件分发（GitHub raw URL），无构建系统，依赖 Tampermonkey 环境，必须嵌入 CDN lamejs
4. **已有文档**：README.md（人类面向）、PROMPT.md（开发提示）、.converge/（验收记录）
5. **AI Agent**：Claude Code（.claude/ 目录已存在）
6. **构建产物**：无
7. **测试**：无自动化测试套件
8. **协作倾向**：单 Agent 顺序推进
9. **常见任务**：功能修复、平台适配（如本次 WASM 解码重构适配）
10. **语言**：中文

## 创建的文档

| 文件 | 说明 |
|------|------|
| `AGENTS.md` | AI 协作规范（主副本） |
| `CLAUDE.md` | AGENTS.md 同步副本 |
| `GEMINI.md` | AGENTS.md 同步副本 |
| `CHANGELOG.md` | 变更记录 |
| `docs/CURRENT.md` | 当前任务状态 |
| `docs/audit-checklist.md` | 文档一致性审计清单 |
| `docs/initialization.md` | 本文件 — 出生档案 |
| `scripts/changelog.py` | CHANGELOG token-light 操作 |
| `scripts/agent_links.py` | 三文件同步检查与修复 |
| `scripts/audit.py` | 文档一致性机械检查 |
| `.githooks/pre-commit` | Pre-commit 质量门控 |

## 有意省略

- `STRUCTURE.md` — 单文件项目无需文档索引
- `docs/overview.md` — 设计决策记录在代码注释和 git log 中
- `docs/api.md` — 无 API
- `docs/deployment.md` — 无需部署（通过 GitHub raw URL 分发）
- `docs/pitfalls.md` — 环境陷阱记录在 PROMPT.md 中
- `docs/plans/` — 小型项目不建计划目录；复杂任务计划放在 `.converge/` 中
- `.agent/memory/` — 小型项目不建记忆目录

## 完成记录

### Reviewer-perspective 自检 (Step 8)

Subagent 只读 AGENTS.md，回答四个问题全部正确：
1. ✅ 项目做什么 — Tampermonkey 用户脚本，捕获豆包 TTS 音频
2. ✅ 不能改哪些文件 — LICENSE（不可改）、CLAUDE.md/GEMINI.md（脚本同步）
3. ✅ 任务完成做什么 — 完工检查清单：验证 → 复查 → CHANGELOG → 同步
4. ✅ 复杂任务去哪 — 先读 docs/CURRENT.md

结论：AGENTS.md 作为入口地图的信息传递能力已确认。

### 第 7 步自检结果

- [x] 所有文件已创建且路径正确
- [x] AGENTS.md / CLAUDE.md / GEMINI.md 同步一致（agent_links.py check → ok）
- [x] AGENTS.md 所有链接指向真实文件（无死链，已裁剪小型项目省略项）
- [x] README.md 已更新（新增 AI Agent 协作段）
- [x] docs/CURRENT.md 已创建
- [x] CHANGELOG.md 有初始化条目
- [x] audit.py check → clean（仅 SKIP memory，预期行为）
- [x] AGENTS.md 105 行，在 200 行限制内
- [x] 无 HTML 指导注释或 [方括号] 残留

## 完成时间

2026-06-19
