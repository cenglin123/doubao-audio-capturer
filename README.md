# 豆包音频下载助手

![Version](https://img.shields.io/badge/version-2.1.2-blue?style=flat-square)
![License](https://img.shields.io/github/license/cenglin123/doubao-audio-capturer?style=flat-square)

一个用于捕获豆包网页版 (doubao.com) 朗读/语音音频的 Tampermonkey（油猴）脚本，支持一键捕获、按语句自动切段、批量合并下载。

## 📥 安装

- **Greasy Fork**：[豆包音频下载助手](https://greasyfork.org/scripts/533430)（需先安装 [Tampermonkey](https://www.tampermonkey.net/)）
- **GitHub**：点击安装 [doubao-audio-capture.user.js](https://github.com/cenglin123/doubao-audio-capturer/raw/refs/heads/main/doubao-audio-capture.user.js)，或从 [Releases](https://github.com/cenglin123/doubao-audio-capturer/releases) 下载

## 🚀 使用

1. 打开 https://www.doubao.com/ ，页面右下角会出现"豆包音频捕获"面板
2. 点 **一键获取**（自动播放并静音采集）或 **手动获取**（被动监控），再点消息旁的"朗读"
3. 播放结束后音频自动进入捕获列表，可单条下载或用 **合并下载** 打包

## ✨ 功能

- **Web Audio 播放捕获**：适配豆包新版流式语音链路（WebSocket + WASM 解码），按语句自动切段
- **两种捕获模式**：一键获取（静音采集）/ 手动获取（被动监控）
- **合并下载**：多条音频合并为一个 MP3 或 WAV（WAV 源自动转码 MP3）
- **自动合并**：捕获停止后 10 秒无新音频时自动合并下载（可关）
- **界面**：暗黑模式、可拖拽、可最小化、面板位置记忆

## ❓ 常见问题

**捕获不到音频？** 先点"一键获取"或"手动获取"开启监控，再点消息旁的"朗读"。

**合并格式？** 捕获音频为 WAV；选择 MP3 合并时会自动转码。

**面板位置乱了？** Tampermonkey 菜单 → 重置面板位置。

## 📜 更新日志

见 [CHANGELOG.md](CHANGELOG.md) 与 [GitHub Releases](https://github.com/cenglin123/doubao-audio-capturer/releases)。

## 免责声明

此脚本仅用于学习、调试与研究用途。请遵守相关法律法规并尊重内容版权。作者对因使用本脚本导致的任何后果不承担责任。

## 🤖 AI 协作

本项目使用 [AGENTS.md](AGENTS.md) 定义的 AI 协作规范进行开发，变更记录见 [CHANGELOG.md](CHANGELOG.md)。
