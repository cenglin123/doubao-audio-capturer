# CHANGELOG

## 2026-10-08

### 适配豆包新版 WebSocket 流式 TTS (v2.0.7)

#### 变更内容
- 问题: issue #3 反馈脚本失效。实测抓包确认, 豆包网页朗读/语音已改为 WebSocket(frontier-audio-web-ws.doubao.com)流式传输 protobuf 封装的 Opus 分片, 经 SAMI WASM 解码器 + AudioWorklet 播放, 音频不再经过 XHR/Fetch/data URL/decodeAudioData, 既有四条捕获路径全部落空。修复: 新增第五条捕获路径 — Web Audio 播放捕获(tap): hook AudioNode.connect, 当页面将节点连到扬声器时用 MediaRecorder 录制播放流, 停止后经 decodeAudioData 转为 16bit PCM WAV 进入统一管线(可合并/下载)。该方案与传输协议无关, 后续豆包再换通道也能捕获。已知限制: 一键获取的元素静音对 Web Audio 播放无效, 主动捕获期间仍能听到声音。

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
