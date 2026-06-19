# 文档一致性审计清单

> **何时触发**：`python scripts/audit.py check` 报告发现后，或每 ~20 次任务 / 每月主动执行一次。
> **角色**：本文件由 Agent 读取并填写。

## 1. 机械检查结果复核

运行 `python scripts/audit.py check`，对每个非 OK 项逐条复核。

- [ ] 死链：AGENTS.md 指针是否仍然有效？
- [ ] 行数警告：AGENTS.md 超过 200 行？如有内容可下沉，执行下沉。
- [ ] 同步断裂：运行 `python scripts/agent_links.py repair` 修复。
- [ ] 出生档案：`docs/initialization.md` 是否存在？缺失则从 git log / 当前状态重建。

## 2. 关键设计决策仍成立？

本项目为单文件用户脚本，无 `docs/overview.md`。由 Agent 判断：
- [ ] 脚本的核心架构（XHR/Fetch 拦截 + Web Audio hook + DOM 扫描）是否仍适合当前目标平台？
- [ ] 是否需要记录新的设计决策？

## 3. 未记录的重要变更

- [ ] 浏览 CHANGELOG 最近 ~30 天：`python scripts/changelog.py recent --days 30`
- [ ] `git log --oneline --since="1 month ago"` 中是否有被遗漏的重大改动？

## 4. 完工

- [ ] 审计期间的修改已通过 `python scripts/agent_links.py check`
- [ ] 审计结果写入 CHANGELOG
- [ ] 将审计日期记录到本文件末尾的"审计记录"中

## 审计记录
