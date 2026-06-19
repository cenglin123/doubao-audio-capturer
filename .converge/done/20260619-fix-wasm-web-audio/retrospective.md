# Retrospective · 20260619-fix-wasm-web-audio

## 收敛摘要

| 指标 | 值 |
|------|-----|
| 收敛对象 | `doubao-audio-capture.user.js` |
| 初始问题 | GitHub Issue #2: 豆包改用 WASM 解码后脚本捕获 WASM 二进制而非真实音频 |
| 总轮次 | 2 (评议模式) |
| 最终 verdict | 可执行 |
| 终止类型 | 终止-b（渐近通过：blocking 3→0） |
| blind_recheck | N/A（仅 2 轮，不触发盲审） |
| 设计审查 | 不触发（单文件 userscript，非系统边界场景） |

## 评议过程

### Round 1
- **Reviewer**: general-purpose agent (claude-code)
- **Verdict**: 阻断需修复（3 blocking issues）
  1. Blob URL 内存泄漏 (structural, executor_limit)
  2. WASM 防御覆盖不完整 (implementation, executor_limit)
  3. Web Audio hook 安装时序竞态 (structural, executor_limit)
- **Executor**: 修复全部 3 个问题

### Round 2
- **Reviewer**: general-purpose agent (claude-code)
- **Verdict**: 可执行（零阻断）
- escalated_issues: 3/3 resolved
- 4 non-blocking suggestions 记录在案

## Suggestion Issues 处置

| # | 描述 | 处置 |
|---|------|------|
| S1 | captureAudioFromMediaElement 诊断性警告不能阻止假条目进入 UI | 延后：不阻断功能正确性 |
| S2 | Web Audio 去重仍用 byteLength+time（未处理 R1 的反馈） | 延后：风险低，大多数 chunk 大小不同 |
| S3 | handleActiveClick 永久设置 autoMergeEnabled | 延后：已有的 UX 问题，非本次修复引入 |
| S4 | Blob URL 序列化进 GM 存储导致页面刷新后死链 | 延后：用户直观可见但非阻断 |
| S5 | Web Audio hook 硬编码 audio/mpeg | 延后（R1 suggestion） |
| S6 | isWasmBinary 中死代码 else 分支 | 延后（R1 suggestion） |
| S7 | 硬编码 Doubao DOM 选择器脆弱 | 延后（R1 antipattern） |

## Antipattern 巡查

| 反模式 | 发现轮次 | 处置 |
|--------|---------|------|
| archaeology_leftover | R1, R2 | 已有注释 `// 页面静音 (不太好用，后续继续开发)` — 非本次修改范围 |
| environment_lock-in | R1, R2 | Doubao 选择器耦合 — 平台变更时需单独处理，非本次 WASM 修复范围 |

## Orchestrator 自评

- boundary_check: R1 pass, R2 pass — Orchestrator 始终未直接修改产物
- overturn: 无（2 轮中无决策点被推翻）
- Type R/F/S: 无
- 降级: 无
- 预算: 2 轮评议 + 2 次 spawn（Reviewer ×2, Executor ×1），均在默认预算内

## 遗留追踪

以下 suggestion items 建议在当前 issue 关闭后作为独立 issue 追踪：
1. **Blob URL 跨会话持久化** — 页面刷新后死链，建议运行时检测 stale blob URL
2. **Web Audio 去重改进** — 考虑内容哈希替代 byteLength
3. **自动合并开关 UX** — handleActiveClick 不应永久改变用户偏好
