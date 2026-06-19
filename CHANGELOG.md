# CHANGELOG

## 2026-06-19

### 初始化 Agent 文档体系

#### 变更内容
- 建立 agent-first 文档结构：AGENTS.md（含同步副本 CLAUDE.md / GEMINI.md）+ docs/CURRENT.md + docs/audit-checklist.md + CHANGELOG.md；配置 scripts/changelog.py、scripts/agent_links.py、scripts/audit.py；设置 .githooks/pre-commit 质量门控。小型项目规模——单文件 userscript，无 plans/ / STRUCTURE.md / .agent/memory/。

---

<!--
说明：
- 日期节倒序，最新在前。日期格式 `## YYYY-MM-DD`，可附冒号 + 标题。
- 同一天的多次修改合并到同一个日期节，用 `###` 区分主题。
- 写入前不要读全文，用 `python scripts/changelog.py titles/show/add/recent` 查看标题树、局部读取、追加和近期浏览。
- 当前工作状态写在 docs/CURRENT.md；CHANGELOG 只记录历史变更。
-->
