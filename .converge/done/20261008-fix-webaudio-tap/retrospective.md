# Retrospective · 20261008-fix-webaudio-tap

## 收敛摘要

| 指标 | 值 |
|------|-----|
| 收敛对象 | `doubao-audio-capture.user.js` |
| 初始问题 | GitHub Issue #3 反馈脚本失效（v2.0.7 首版修复被用户反馈"没有修好"） |
| 根因 | ① v2.0.7 首版 tap 从未把音源接入录制目标（录到空流）；② 深层原因：豆包改为 WebSocket 流式 Opus + SAMI WASM 解码 + AudioWorklet 播放，旧四条捕获路径全部失效 |
| 总轮次 | 3 (评议模式) |
| 最终 verdict | 可执行 |
| 终止类型 | 终止-b（渐近通过：blocking 2→1→0） |
| 实测验证 | 真实豆包页面注入同逻辑：两次朗读正确切为两段（11.5s/11.1s），静音切段后条目立即产出 |

## 评议过程

### Round 1
- **Verdict**: 阻断需修复（2 blocking，均为 plan_defect）
  1. 分段逻辑失效：MediaRecorder timeslice 分片与静音无关，"无活动计时"永不到期 → 改为 AnalyserNode RMS 静音检测分段（阈值 0.01，静音 4s 切段）
  2. tapSources 无界增长且不去重 → WeakSet 去重 + 上限（后被 R2 指出为死代码，R3 前删除）
- **Executor**: 重写 tap 模块（RMS 状态机），实测验证分段生效

### Round 2
- **Verdict**: 阻断需修复（1 blocking）
  1. 停止再恢复监控后 tap 永久失效（stopTapMonitoring 清轮询但无重建路径）→ 轮询常驻，tapPoll 内由 isMonitoring 门控
- 另核实 R1 两项修复均到位

### Round 3
- **Verdict**: 可执行（零阻断）
- 采纳两条低成本建议：Float32Array 轮询缓冲复用；createAnalyser 失败回滚（基础设施就绪后才对外可见）

## Suggestion Issues 处置

| # | 描述 | 处置 |
|---|------|------|
| S1 | 单 AudioContext 限制 | 已知限制，注释声明 |
| S2 | Float32Array 常驻分配 | 已修复（缓冲复用） |
| S3 | createAnalyser 失败半初始化 | 已修复（回滚赋值） |
| S4 | 停止监控时不足 4 秒的段被主动收尾 | 行为符合预期（内容完整，finalize 有最短时长过滤） |
| S5 | tap 捕获项无 url 去重（重复播放产生重复条目） | 已知限制 |

## 遗留追踪

1. 多 AudioContext 场景漏录（豆包若拆分语音通话/朗读上下文时需处理）
2. 一键获取的元素静音对 Web Audio 播放无效（主动捕获期间仍能听到声音）
