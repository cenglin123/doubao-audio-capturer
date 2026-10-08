# AI 协作规范

> 本文件会被 AI 框架自动加载并始终驻留在上下文中，因此必须保持精简。
> 只放行为规则和信息指针，不放可从代码或其他文档获取的事实描述。
> 本文件是 AI 协作文档的唯一入口（2026-10-08 起退役 CLAUDE.md / GEMINI.md 同步副本与 agent_links.py，见 CHANGELOG）。

## 项目概述

豆包音频下载助手 —— Tampermonkey 用户脚本，捕获豆包网页版 (doubao.com) 中的 TTS 音频数据。单文件 userscript，无构建系统，通过 GitHub raw URL 分发。

## 信息导航

- 当前任务状态：[docs/CURRENT.md](docs/CURRENT.md)
- 变更记录：[CHANGELOG.md](CHANGELOG.md)
- 文档一致性审计：[docs/audit-checklist.md](docs/audit-checklist.md)

**省略声明**：本文件未包含 STRUCTURE.md / overview.md / api.md / deployment.md / pitfalls.md / plans/ / .agent/memory/（项目为单文件用户脚本，无需多层级文档结构和记忆系统）。

## 行为规则

### Compact 恢复（上下文压缩后强制执行）

若你的上下文中包含 "continued from a previous conversation"（compact 恢复信号），在继续任何实质性工作前：

1. 读取 `docs/CURRENT.md` — 确认当前任务状态
2. 上述步骤完成前，**禁止执行写操作、禁止做出有副作用的判断**

### 硬约束（不可违反）

- **不碰构建产物**：本项目无构建产物目录，userscript 直接通过 GitHub raw URL 分发。
- **完工必检**：任务完成后必须执行末尾的"完工检查清单"，不可跳过，不可先回复用户再补。
- **不修改许可证**：LICENSE 文件不可更改（MIT）。

### 默认偏好（有充分理由可偏离）

- **先读后改**：修改任何文件前先读取，理解现有逻辑再动手。
- **风格跟随**：跟随已有 JS 代码风格（`'use strict'`、函数声明优先、`async/await`），不引入新范式。
- **Occam**：如无必要，勿增实体；新增文件、字段、脚本、规则或流程前，先确认它解决的具体问题。
- **Bitter Lesson**：通用方法优于硬编码先验；优先复用模型能力，谨慎增加关键词规则和提前分类。
- **模式匹配**：单会话能完成的小任务用直接执行模式；涉及跨模块、预计改动超过 5 个文件、或可能跨会话完成的任务，走计划→审计→拍板→执行→验收闭环。
- **任务启动先读 CURRENT.md**：接到新任务时，先读取 `docs/CURRENT.md`。若存在未完成的上下文（任务状态非"无"），向用户确认是继续还是覆盖。
- **验证尽量换视角**：高风险改动优先由新上下文或 reviewer 视角复查，不把"执行者自检"等同于"已验证"。

## 代码风格

- 语言：JavaScript（ES6+），Tampermonkey userscript
- 缩进：4 空格
- 注释：中文注释，`//` 行注释优先
- 变量：`camelCase`，常量 `UPPER_SNAKE_CASE`
- 函数：`function` 声明优先于箭头函数（顶层函数）

## 测试要求

本项目无自动化测试套件。改动后手动验证：
1. 在 Tampermonkey 中加载 `doubao-audio-capture.user.js`
2. 访问 https://www.doubao.com/ 触发语音对话
3. 使用"一键获取"验证捕获 → 合并 → 下载完整流程
4. 确认控制台无报错

## 提交规范

使用 Conventional Commit 风格：`feat:` / `fix:` / `chore:` / `docs:` 等。

**及时提交**：完成一个功能阶段后主动暂存源码文件并提交，避免 diff 膨胀。

**PR 要求**：说明改了什么、为什么改；列出影响范围；关联相关 issue（如有）。

## 文档维护原则

**核心理念：只记代码里读不出来的东西。** 目录结构、模块职责、函数签名等可从代码直接获取的内容不写入文档。

1. **不重复**：同一信息只在最合适的位置出现一次。
2. **不展开实现细节**：CSS 断点、具体字段列表等可从代码直接获取的内容，一句话概括 + 指向源文件即可。
3. **可从代码/git 推导的不写**：文件路径、函数签名、参数默认值等会随代码变化的细节，优先让读者查看源码。

**CHANGELOG 规则**

4. 日期节倒序排列，最新在前；同一天的多次修改合并到同一个日期节。
5. 写入 CHANGELOG.md 前**不要读全文**；使用 `python scripts/changelog.py titles --limit 5` 查看标题树，`python scripts/changelog.py show --date YYYY-MM-DD` 读取局部内容，`python scripts/changelog.py add --title "..." --body "..."` 追加条目。
6. 当前任务状态写入 `docs/CURRENT.md`，不要写进 CHANGELOG。
7. 只写"改了什么、为什么改"，不贴代码。

**定期审计**

8. 每 ~20 次任务或每月，运行 `python scripts/audit.py check` 做机械检查。如发现问题项，读取 `docs/audit-checklist.md` 按清单逐项裁决。审计完成后将结果写入 CHANGELOG。

## 完工检查清单

文档是跨会话协作的唯一记忆。**每次编辑任务完成后，必须逐项走完以下清单，再向用户报告完成。**

- [ ] **验证**：改动是否仍能正常工作？在 Tampermonkey 中确认脚本加载无误，无 JS 语法错误。
- [ ] **复查视角**：如果这是高风险或跨模块任务，是否至少经过一次新的 reviewer 视角复查？
- [ ] **CHANGELOG.md**：是否值得记录？如是，用 `python scripts/changelog.py add ...` 插入。
- [ ] **跳过条件**：纯格式修改、注释修改、同一会话内已记录的变更，可跳过文档更新步骤（但验证步骤不可跳过）。
