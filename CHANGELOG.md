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

### 修复一键获取交互: 真正静音 Web Audio、停止不再误触播放、自动合并偏好不再永久残留 (v2.1.0)

#### 变更内容
- 用户反馈三个交互问题。1) 主动捕获期间页面仍出声: 原 mutePageAudio 新建本地 AudioContext 再 suspend 无法影响页面自己的 Context; 改为 tap hook 在主动捕获时把音源到扬声器的连接重定向到 gain=0 的静音增益节点(录制不受影响, 已实测), 停止时恢复增益。2) 播放结束后点『停止获取』反而重新播放: unmutePageAudio 无脑点击播放/停止切换按钮; 增加 stopOnly 参数, 仅在播放进行中(存在停止按钮)时点击。3) 自动获取一次后手动捕获数量不再增加: handleActiveClick 把自动合并偏好永久写入存储, 之后所有捕获 10 秒后自动合并并清空列表; 改为暂存用户偏好、会话内临时开启、停止时还原。另: 自动合并成功的自动停止分支统一走 stopCaptureActions。已在浏览器实测重定向静音下录制信号正常(rms 0.212)。

### 修复捕获音频开头缺首音节: 录制器静音期预启动 + 解码后裁剪首尾静音 (v2.1.1)

#### 变更内容
- 用户反馈捕获的音频开头少一小段(如『长城』听到『…城』)。原因: 录制器在 RMS 检测到有声后才启动, 轮询间隔+录制器启动延迟吃掉首音节起振(用户提供的样本证实: 文件从第 0 秒就是满幅语音, 起始部分根本没录进来)。修复: 1) 录制器改为 tap 建立时(静音期)立即预启动, 切段后在静音期内立即重开, 语音起始永远落在已录状态; 2) 新增 trimAudioBufferSilence, 解码后按 20ms 窗 RMS 裁剪首尾静音保留 150ms 余量; 3) 修复评审发现的回归: 停止再恢复监控后录制器不重启(startMonitoring 补启 + 轮询兜底)。浏览器实测: 录制预启动后语音延后 1.5s 开始, 产出条目起振完整且带 150ms 前置余量。

### 修复第二个音频无法捕获: tap 会话按 AudioContext 隔离 + Context 关闭时收尾录制 (v2.1.2)

#### 变更内容
- 用户反馈『自动获取过一次后, 手动获取再播放音频数量不增加, 只能获取第一个』。通过在自动化 Chrome 中注入脚本并加调试探针实测定位到两个根因: 1) 豆包每段朗读会新建 AudioContext, 而 tap 状态是全局单例(tapDestNode/tapAnalyser), 第二个 Context 的音源因 context 不匹配被跳过, 分析器读不到声音; 2) 豆包在每段朗读结束后会关闭 AudioContext, 而轮询遇到 closed 状态只是删除会话、没有收尾 MediaRecorder, 已录好的音频被整体丢弃(录制器还挂在死流上)。修复: tap 状态改为 per-AudioContext 会话表(tapSessions Map, 各会话独立的 destNode/analyser/recorder/chunks/lastLoudTime), Context 关闭时先 stopTapRecording 触发 finalize 产出条目再删除会话。真实页面实测: 连续两次朗读计数 1→2, 各产出独立 WAV(1898KB/1660KB); 自动合并下载 MP3 20.74s(两段之和), 起始静音 0.18s、首音节起振完整。






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
