# CHANGELOG

## 2026-10-08

### 适配豆包新版 WebSocket 流式 TTS (v2.0.7)

#### 变更内容
- 问题: issue #3 反馈脚本失效。实测抓包确认, 豆包网页朗读/语音已改为 WebSocket(frontier-audio-web-ws.doubao.com)流式传输 protobuf 封装的 Opus 分片, 经 SAMI WASM 解码器 + AudioWorklet 播放, 音频不再经过 XHR/Fetch/data URL/decodeAudioData, 既有四条捕获路径全部落空。修复: 新增第五条捕获路径 — Web Audio 播放捕获(tap): hook AudioNode.connect, 当页面将节点连到扬声器时用 MediaRecorder 录制播放流, 停止后经 decodeAudioData 转为 16bit PCM WAV 进入统一管线(可合并/下载)。该方案与传输协议无关, 后续豆包再换通道也能捕获。已知限制: 一键获取的元素静音对 Web Audio 播放无效, 主动捕获期间仍能听到声音。

### 修复 v2.0.7 播放捕获录到空流问题, 重写为 RMS 静音检测分段 (v2.0.8)

#### 变更内容
- 用户反馈 v2.0.7 未修复。经 converge 评议(R1)定位: 首版 tap 创建了录制目标但从未把页面音源接入, 录到的是空流。重写 tap 模块: hook AudioNode.connect 时把音源同时接入 MediaStreamAudioDestinationNode(录制)与 AnalyserNode(RMS 静音检测), 有声自动开录 MediaRecorder, 持续静音 4 秒按语句切段, 切段后 webm→decodeAudioData→16bit PCM WAV 进入统一管线。R2 修复停止再恢复监控后 tap 永久失效问题(轮询常驻由 isMonitoring 门控)。R3 零阻断收敛。真实豆包页面实测: 两次朗读正确切为两段(11.5s/11.1s)。

### 修复播放捕获条目无法参与 MP3 合并的问题 (v2.0.9)

#### 变更内容
- 用户反馈 v2.0.8 合并报『没有有效的音频数据可合并』。原因: 播放捕获产出的条目是 WAV, 而合并默认目标格式为 MP3, startMergeProcess 的格式过滤把 WAV 条目全部丢弃。修复: 新增 isWavBuffer 与 convertWavBufferToMp3(lamejs 128kbps), 合并到 MP3 时自动将 WAV 条目转码后参与合并; 转 WAV 目标格式不受影响。已在 Node 与浏览器(同一 cdnjs lamejs/1.2.0)双环境验证转码输出为合法 MP3。



---

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
