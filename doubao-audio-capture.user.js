// ==UserScript==
// @name         豆包音频下载助手
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  捕获豆包网页版中的音频数据，支持主动/被动捕获、自动合并、暗黑模式、可拖拽面板
// @author       cenglin123
// @match        https://www.doubao.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=doubao.com
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @require      https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.0/lame.min.js
// @updateURL    https://github.com/cenglin123/doubao-audio-capturer/raw/main/doubao-audio-capture.user.js
// @downloadURL  https://github.com/cenglin123/doubao-audio-capturer/raw/main/doubao-audio-capture.user.js
// @license MIT
// ==/UserScript==

(function() {
    'use strict';

    // 存储捕获的音频数据
    let capturedAudio = [];
    let isMonitoring = false; // 监控是否开启 (XHR/Fetch)
    let isCapturing = false;  // 是否处于"一键获取"的主动模式
    let originalXHR = unsafeWindow.XMLHttpRequest;
    let originalFetch = unsafeWindow.fetch;
    let observer = null;

    // 自动合并相关
    let autoMergeEnabled = GM_getValue('autoMergeEnabled', false);
    let autoMergeTimer = null;
    let lastAudioCaptureTime = null;
    const AUTO_MERGE_DELAY = 5000; // 5秒

    // 自动清空列表
    let autoClearList = GM_getValue('autoClearList', false);

    // 暗黑模式检测
    let isDarkMode = false;

    // 面板拖拽相关
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let isMinimized = GM_getValue('isMinimized', false);
    
    // 验证并修正面板位置
    function validatePanelPosition(position) {
        const defaultPosition = { bottom: 20, right: 20 };
        
        // 如果没有位置信息，使用默认值
        if (!position || typeof position.bottom !== 'number' || typeof position.right !== 'number') {
            console.log('位置信息无效，使用默认位置');
            return defaultPosition;
        }
        
        // 获取窗口尺寸
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const panelWidth = 320; // 面板宽度
        const panelHeight = 650; // 面板大致高度
        
        // 验证位置是否在合理范围内
        // bottom 和 right 应该在 0 到窗口尺寸之间
        const isValidBottom = position.bottom >= 0 && position.bottom < windowHeight - 100;
        const isValidRight = position.right >= 0 && position.right < windowWidth - 100;
        
        if (!isValidBottom || !isValidRight) {
            console.log('保存的位置超出屏幕范围:', position, '窗口尺寸:', windowWidth, windowHeight);
            console.log('重置为默认位置');
            // 保存修正后的位置
            GM_setValue('panelPosition', defaultPosition);
            return defaultPosition;
        }
        
        console.log('位置验证通过:', position);
        return position;
    }
    
    let panelPosition = validatePanelPosition(GM_getValue('panelPosition', { bottom: 20, right: 20 }));

    // 文件名
    let fileNamePrefix = GM_getValue('fileNamePrefix', 'doubao_audio');
    
    // 静音定时器
    let muteInterval = null;

    // SVG图标定义
    const icons = {
        mic: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
        stop: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>',
        eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
        download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
        trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
        link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
        clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        code: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
        minimize: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
        maximize: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>',
        close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
        play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
        music: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
        copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
    };

    // 检测暗黑模式
    function detectDarkMode() {
        // 优先使用浏览器的暗色模式偏好
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // 如果系统有明确的主题偏好，直接使用它
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme)').media !== 'not all') {
            isDarkMode = prefersDark;
            console.log('暗色模式检测结果:', isDarkMode, '(使用系统偏好)');
            return isDarkMode;
        }
        
        // 如果系统没有主题偏好，才检查页面背景色
        let pageDark = false;
        try {
            const bodyBg = window.getComputedStyle(document.body).backgroundColor;
            const rgb = bodyBg.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                pageDark = brightness < 128;
            }
        } catch (e) {
            console.log('检测页面背景色失败:', e);
        }
        
        isDarkMode = pageDark;
        console.log('暗色模式检测结果:', isDarkMode, '(使用页面背景)');
        return isDarkMode;
    }

    // 获取主题样式
    function getThemeStyles() {
        detectDarkMode();
        if (isDarkMode) {
            return {
                background: '#1e1e1e', color: '#e0e0e0', border: '#444',
                buttonBg: '#2d2d2d', buttonHover: '#3d3d3d',
                primaryBg: '#0d7377', primaryHover: '#14b8a6',
                dangerBg: '#b91c1c', shadowColor: 'rgba(0,0,0,0.5)',
                disabledBg: '#374151', disabledColor: '#6b7280'
            };
        } else {
            return {
                background: '#ffffff', color: '#333', border: '#ccc',
                buttonBg: '#f0f0f0', buttonHover: '#e0e0e0',
                primaryBg: '#4285f4', primaryHover: '#357ae8',
                dangerBg: '#db4437', shadowColor: 'rgba(0,0,0,0.2)',
                disabledBg: '#f3f4f6', disabledColor: '#9ca3af'
            };
        }
    }

    // 注入自定义滚动条样式
    function injectCustomScrollbarStyles() {
        const theme = getThemeStyles(); // 获取当前主题
        const styleId = 'audio-capturer-scrollbar-style';
        let styleElement = document.getElementById(styleId);
        
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }
        
        // 为模态框内的滚动区域和面板本身（如果需要）添加样式
        styleElement.textContent = `
            /* Custom Scrollbar for Audio Capturer (WebKit) */
            .audio-capture-modal-backdrop ::-webkit-scrollbar,
            #audio-list-container::-webkit-scrollbar,
            div[style*="max-height: 300px"][style*="overflow-y: auto"]::-webkit-scrollbar,
            #audio-capture-panel ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            .audio-capture-modal-backdrop ::-webkit-scrollbar-track,
            #audio-list-container::-webkit-scrollbar-track,
            div[style*="max-height: 300px"][style*="overflow-y: auto"]::-webkit-scrollbar-track,
            #audio-capture-panel ::-webkit-scrollbar-track {
                background: ${theme.buttonBg};
                border-radius: 4px;
            }
            .audio-capture-modal-backdrop ::-webkit-scrollbar-thumb,
            #audio-list-container::-webkit-scrollbar-thumb,
            div[style*="max-height: 300px"][style*="overflow-y: auto"]::-webkit-scrollbar-thumb,
            #audio-capture-panel ::-webkit-scrollbar-thumb {
                background: ${isDarkMode ? '#555' : '#aaa'};
                border-radius: 4px;
                border: 2px solid ${theme.buttonBg};
            }
            .audio-capture-modal-backdrop ::-webkit-scrollbar-thumb:hover,
            #audio-list-container::-webkit-scrollbar-thumb:hover,
            div[style*="max-height: 300px"][style*="overflow-y: auto"]::-webkit-scrollbar-thumb:hover,
            #audio-capture-panel ::-webkit-scrollbar-thumb:hover {
                background: ${isDarkMode ? '#777' : '#888'};
            }
            
            /* Custom Scrollbar (Firefox) */
            .audio-capture-modal-backdrop .audio-capture-modal,
            #audio-list-container,
            div[style*="max-height: 300px"][style*="overflow-y: auto"] {
                scrollbar-width: thin;
                scrollbar-color: ${isDarkMode ? '#555' : '#aaa'} ${theme.buttonBg};
            }
        `;
    }

    // 自动点击页面播放/停止按钮
    function clickAudioToggleButton() {
        try {
            const stopBtn = document.querySelector('button[data-testid="audio_stop_button"]');
            if (stopBtn && !stopBtn.disabled) {
                stopBtn.click();
                updateStatus('✓ 已触发停止按钮');
                return true;
            }
            const playBtn = document.querySelector('button[data-testid="audio_play_button"]');
            if (playBtn && !playBtn.disabled) {
                playBtn.click();
                updateStatus('✓ 已触发播放按钮');
                return true;
            }
            const playBtnByClass = document.querySelector('button.semi-button-primary[aria-disabled="false"]');
            if (playBtnByClass && playBtnByClass.querySelector('svg')) {
                playBtnByClass.click();
                updateStatus('✓ 已触发播放/停止按钮（备用方法）');
                return true;
            }
            updateStatus('⚠ 未找到播放/停止按钮');
            return false;
        } catch (e) {
            console.error('点击播放/停止按钮失败:', e);
            updateStatus('⚠ 触发播放/停止失败');
            return false;
        }
    }

    // 创建UI函数
    function createMainInterface() {
        try {
            console.log('createMainInterface被调用');
            
            // 先清理可能存在的旧面板
            const oldPanel = document.getElementById('audio-capture-panel');
            if (oldPanel) {
                console.log('发现旧面板，正在移除...');
                oldPanel.remove();
            }

            const theme = getThemeStyles();
            const panel = document.createElement('div');
            panel.id = 'audio-capture-panel';
            const positionStyle = `bottom: ${panelPosition.bottom}px; right: ${panelPosition.right}px;`;

            panel.style.cssText = `
                position: fixed !important;
                ${positionStyle}
                background: ${theme.background}; color: ${theme.color};
                border: 1px solid ${theme.border}; border-radius: 12px;
                padding: ${isMinimized ? '12px' : '20px'};
                box-shadow: 0 4px 20px ${theme.shadowColor}; z-index: 999999 !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
                width: ${isMinimized ? 'auto' : '320px'};
                transition: all 0.3s ease;
                user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            `;
            
            console.log('面板样式已设置，当前主题:', isDarkMode ? '暗色' : '亮色');

            const headerHtml = `
                <div id="panel-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ${isMinimized ? '0' : '16px'}; user-select: none;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600; user-select: none; display: flex; align-items: center; gap: 8px;">
                        ${icons.music} <span>豆包音频捕获</span>
                    </h3>
                    <div style="display: flex; gap: 8px;">
                        <button id="minimize-toggle" style="background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; padding: 4px; display: flex; align-items: center;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                            ${isMinimized ? icons.maximize : icons.minimize}
                        </button>
                        <button id="close-tool" style="background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; padding: 4px; display: flex; align-items: center;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                            ${icons.close}
                        </button>
                    </div>
                </div>
            `;

            const mainContent = isMinimized ? '' : `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button id="active-capture-btn" style="
                            padding: 14px; background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                            color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 500;
                            display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;
                            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
                        " onmouseover="this.style.transform='translateY(-1px)';" onmouseout="this.style.transform='translateY(0)';">
                            ${icons.mic} <span>一键获取</span>
                        </button>
                        <button id="passive-capture-btn" style="
                            padding: 14px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                            color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 500;
                            display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;
                            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
                        " onmouseover="this.style.transform='translateY(-1px)';" onmouseout="this.style.transform='translateY(0)';">
                            ${icons.clock} <span>手动获取</span>
                        </button>
                    </div>

                    <div style="margin-bottom: 4px;">
                        <label style="display: block; font-size: 13px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'}; margin-bottom: 6px;">文件名前缀</label>
                        <input type="text" id="filename-prefix" value="${fileNamePrefix}" placeholder="doubao_audio"
                               style="width: 100%; padding: 10px 12px; background: ${isDarkMode ? '#374151' : '#f3f4f6'}; color: ${theme.color}; border: 1px solid ${isDarkMode ? '#4b5563' : '#e5e7eb'}; border-radius: 6px; font-size: 14px; box-sizing: border-box; transition: all 0.2s;"
                               onfocus="this.style.borderColor='#3b82f6'; this.style.background='${isDarkMode ? '#1f2937' : '#ffffff'}'"
                               onblur="this.style.borderColor='${isDarkMode ? '#4b5563' : '#e5e7eb'}'; this.style.background='${isDarkMode ? '#374151' : '#f3f4f6'}'">
                    </div>

                    <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: ${isDarkMode ? '#374151' : '#f3f4f6'}; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.2s;" onmouseover="this.style.background='${isDarkMode ? '#4b5563' : '#e5e7eb'}'" onmouseout="this.style.background='${isDarkMode ? '#374151' : '#f3f4f6'}'">
                        <input type="checkbox" id="auto-merge-toggle" ${autoMergeEnabled ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                        <span style="font-size: 14px; flex: 1;">5秒无新音频时自动合并下载</span>
                    </label>
                    
                    <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: ${isDarkMode ? '#374151' : '#f3f4f6'}; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.2s;" onmouseover="this.style.background='${isDarkMode ? '#4b5563' : '#e5e7eb'}'" onmouseout="this.style.background='${isDarkMode ? '#374151' : '#f3f4f6'}'">
                        <input type="checkbox" id="auto-clear-toggle" ${autoClearList ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                        <span style="font-size: 14px; flex: 1;">下载完成后自动清空列表</span>
                    </label>

                    <div style="display: flex; gap: 8px;">
                        <button id="view-captured" style="
                            flex: 1; padding: 10px; background: ${isDarkMode ? '#374151' : '#f3f4f6'}; color: ${theme.color};
                            border: 1px solid ${isDarkMode ? '#4b5563' : '#e5e7eb'}; border-radius: 6px; cursor: pointer; font-size: 13px;
                            display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s;
                        " onmouseover="this.style.transform='scale(1.02)'; this.style.background='${isDarkMode ? '#4b5563' : '#e5e7eb'}'" onmouseout="this.style.transform='scale(1)'; this.style.background='${isDarkMode ? '#374151' : '#f3f4f6'}'">
                            <span style="font-size: 20px;">${icons.eye}</span>
                            <span style="font-weight: 500;">已捕获 <span id="audio-count">0</span></span>
                        </button>
                    </div>

                    <button id="merge-download" style="
                        padding: 14px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 8px;
                        cursor: pointer; font-size: 15px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;
                        transition: all 0.2s; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
                    " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(59, 130, 246, 0.3)'">
                        ${icons.download} <span>合并下载</span>
                    </button>

                    <button id="clear-all-audio" style="
                        padding: 12px; background: ${isDarkMode ? '#374151' : 'white'}; color: #ef4444; border: 1px solid ${isDarkMode ? '#4b5563' : '#fecaca'};
                        border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='${isDarkMode ? '#4b5563' : '#fee2e2'}'" onmouseout="this.style.background='${isDarkMode ? '#374151' : 'white'}'">
                        ${icons.trash} <span>清空列表</span>
                    </button>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button id="direct-download" style="
                            padding: 10px; background: ${isDarkMode ? '#374151' : 'white'}; color: ${theme.color}; border: 1px solid ${isDarkMode ? '#4b5563' : '#e5e7eb'};
                            border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;
                        " onmouseover="this.style.background='${isDarkMode ? '#4b5563' : '#f3f4f6'}'" onmouseout="this.style.background='${isDarkMode ? '#374151' : 'white'}'">
                            ${icons.link} <span>解析URL</span>
                        </button>
                        <button id="process-base64" style="
                            padding: 10px; background: ${isDarkMode ? '#374151' : 'white'}; color: ${theme.color}; border: 1px solid ${isDarkMode ? '#4b5563' : '#e5e7eb'};
                            border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;
                        " onmouseover="this.style.background='${isDarkMode ? '#4b5563' : '#f3f4f6'}'" onmouseout="this.style.background='${isDarkMode ? '#374151' : 'white'}'">
                            ${icons.code} <span>处理Base64</span>
                        </button>
                    </div>
                </div>

                <div id="status-area" style="
                    margin-top: 12px; padding: 10px 12px; font-size: 12px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'};
                    background: ${isDarkMode ? '#1f2937' : '#f9fafb'}; border-radius: 6px; text-align: center; user-select: text; min-height: 20px;
                ">工具已启动就绪</div>
            `;

            panel.innerHTML = headerHtml + mainContent;
            document.body.appendChild(panel);
            
            console.log('面板已添加到DOM');
            console.log('面板元素:', panel);
            console.log('面板父元素:', panel.parentElement);
            console.log('面板当前位置:', panel.getBoundingClientRect());
            
            updateAudioCount();
            setupDraggable(panel);

            // 最小化/关闭 按钮
            document.getElementById('minimize-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                isMinimized = !isMinimized;
                GM_setValue('isMinimized', isMinimized);
                createMainInterface();
            });
            
            document.getElementById('close-tool').addEventListener('click', (e) => {
                e.stopPropagation();
                panel.remove();
            });

            if (!isMinimized) {
                
                // 按钮逻辑
                document.getElementById('active-capture-btn').addEventListener('click', handleActiveClick);
                document.getElementById('passive-capture-btn').addEventListener('click', handlePassiveClick);

                // 文件名前缀保存
                document.getElementById('filename-prefix').addEventListener('change', function(e) {
                    e.stopPropagation();
                    fileNamePrefix = this.value.trim() || 'doubao_audio';
                    GM_setValue('fileNamePrefix', fileNamePrefix);
                    updateStatus('文件名前缀已保存: ' + fileNamePrefix);
                });

                // 其他按钮
                document.getElementById('direct-download').addEventListener('click', (e) => { e.stopPropagation(); downloadFromDataUrl(); });
                document.getElementById('process-base64').addEventListener('click', (e) => { e.stopPropagation(); handleBase64FromRequest(); });
                document.getElementById('view-captured').addEventListener('click', (e) => { e.stopPropagation(); showCapturedAudioList(); });
                document.getElementById('merge-download').addEventListener('click', (e) => { e.stopPropagation(); showMergeOptions(); });

                // 清空音频按钮（无确认）
                document.getElementById('clear-all-audio').addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (capturedAudio.length === 0) {
                        updateStatus('当前没有已捕获的音频');
                        return;
                    }
                    capturedAudio = [];
                    updateAudioCount();
                    saveAudioData();
                    updateStatus('已清空所有音频');
                });

                // 自动合并开关
                document.getElementById('auto-merge-toggle').addEventListener('change', function(e) {
                    e.stopPropagation();
                    autoMergeEnabled = this.checked;
                    GM_setValue('autoMergeEnabled', autoMergeEnabled);
                    updateStatus(autoMergeEnabled ? '自动合并已启用' : '自动合并已禁用');
                    if (autoMergeEnabled && capturedAudio.length > 0) {
                        resetAutoMergeTimer();
                    }
                });
                
                // 从存储中同步自动合并状态
                syncAutoMergeCheckbox();

                // 自动清空开关
                document.getElementById('auto-clear-toggle').addEventListener('change', function(e) {
                    e.stopPropagation();
                    autoClearList = this.checked;
                    GM_setValue('autoClearList', autoClearList);
                    updateStatus(autoClearList ? '自动清空已启用' : '自动清空已禁用');
                });
                
                // 从存储中同步自动清空状态
                syncAutoClearCheckbox();
            }

            // 监听主题变化
            if (window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                    createMainInterface();
                });
            }
            
            console.log('音频捕获工具界面已创建');
        } catch (error) {
            console.error('创建界面时出错:', error);
            alert('创建工具界面失败，请刷新页面重试');
        }
    }

    // 处理"一键获取"点击
    function handleActiveClick() {
        if (isMonitoring && isCapturing) {
            // 正在主动捕获 -> 停止
            stopCaptureActions(true); // 传入 true 表示是主动模式
        } else if (!isMonitoring) {
            // 已停止 -> 开始主动捕获
            isCapturing = true;
            startMonitoring();
            mutePageAudio();
            
            // 自动勾选"自动合并"
            const autoMergeCheckbox = document.getElementById('auto-merge-toggle');
            if (autoMergeCheckbox) {
                autoMergeCheckbox.checked = true;
            }
            autoMergeEnabled = true;
            GM_setValue('autoMergeEnabled', autoMergeEnabled);

            setTimeout(clickAudioToggleButton, 500);
            updateStatus('一键获取已启动，已静音');
            updateCaptureUI();
        }
    }

    // 处理"手动获取"点击
    function handlePassiveClick() {
        if (isMonitoring && !isCapturing) {
            // 正在被动监控 -> 停止
            stopCaptureActions(false); // 传入 false 表示不是主动模式
        } else if (!isMonitoring) {
            // 已停止 -> 开始被动监控
            isCapturing = false;
            startMonitoring();
            updateStatus('手动监控已启动，请点击播放');
            updateCaptureUI();
        }
    }

    // 【修正2】统一的停止操作，添加参数区分主动/被动模式
    function stopCaptureActions(isActiveMode) {
        stopMonitoring();
        if (isActiveMode) {
            unmutePageAudio(true); // 传入 true 表示需要点击停止按钮
        } else {
            unmutePageAudio(false); // 传入 false 表示不需要点击按钮
        }
        isCapturing = false;
        updateCaptureUI();
    }
    
    // 统一更新捕获按钮的UI
    function updateCaptureUI() {
        const activeBtn = document.getElementById('active-capture-btn');
        const passiveBtn = document.getElementById('passive-capture-btn');
        if (!activeBtn || !passiveBtn) return;

        const theme = getThemeStyles();
        
        // 默认样式
        const styles = {
            green: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            blue: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            red: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            gray: theme.disabledBg,
            shadowGreen: '0 2px 8px rgba(16, 185, 129, 0.3)',
            shadowBlue: '0 2px 8px rgba(59, 130, 246, 0.3)',
            shadowRed: '0 2px 8px rgba(239, 68, 68, 0.3)',
            shadowGray: 'none'
        };

        if (!isMonitoring) {
            // 状态: OFF
            activeBtn.innerHTML = `${icons.mic} <span>一键获取</span>`;
            activeBtn.style.background = styles.green;
            activeBtn.style.boxShadow = styles.shadowGreen;
            activeBtn.style.color = 'white';
            activeBtn.disabled = false;

            passiveBtn.innerHTML = `${icons.clock} <span>手动获取</span>`;
            passiveBtn.style.background = styles.blue;
            passiveBtn.style.boxShadow = styles.shadowBlue;
            passiveBtn.style.color = 'white';
            passiveBtn.disabled = false;

        } else if (isCapturing) {
            // 状态: ACTIVE (一键获取中)
            activeBtn.innerHTML = `${icons.stop} <span>停止获取</span>`;
            activeBtn.style.background = styles.red;
            activeBtn.style.boxShadow = styles.shadowRed;
            activeBtn.style.color = 'white';
            activeBtn.disabled = false;

            passiveBtn.innerHTML = `${icons.clock} <span>手动获取</span>`;
            passiveBtn.style.background = styles.gray;
            passiveBtn.style.boxShadow = styles.shadowGray;
            passiveBtn.style.color = theme.disabledColor;
            passiveBtn.disabled = true;

        } else {
            // 状态: PASSIVE (手动监控中)
            activeBtn.innerHTML = `${icons.mic} <span>一键获取</span>`;
            activeBtn.style.background = styles.gray;
            activeBtn.style.boxShadow = styles.shadowGray;
            activeBtn.style.color = theme.disabledColor;
            activeBtn.disabled = true;

            passiveBtn.innerHTML = `${icons.stop} <span>停止监控</span>`;
            passiveBtn.style.background = styles.red;
            passiveBtn.style.boxShadow = styles.shadowRed;
            passiveBtn.style.color = 'white';
            passiveBtn.disabled = false;
        }
    }


    // 同步自动合并checkbox状态
    function syncAutoMergeCheckbox() {
        const checkbox = document.getElementById('auto-merge-toggle');
        if (checkbox) {
            checkbox.checked = autoMergeEnabled;
        }
    }

    // 同步自动清空checkbox状态
    function syncAutoClearCheckbox() {
        const checkbox = document.getElementById('auto-clear-toggle');
        if (checkbox) {
            checkbox.checked = autoClearList;
        }
    }

    // 设置可拖拽
    function setupDraggable(panel) {
        panel.addEventListener('mousedown', (e) => {
            const interactiveElements = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'];
            if (interactiveElements.includes(e.target.tagName) || e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            document.body.style.cursor = 'grabbing';
            panel.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.clientX - dragOffsetX;
            const y = e.clientY - dragOffsetY;
            const maxX = window.innerWidth - panel.offsetWidth;
            const maxY = window.innerHeight - panel.offsetHeight;
            const finalX = Math.max(0, Math.min(x, maxX));
            const finalY = Math.max(0, Math.min(y, maxY));
            panel.style.left = finalX + 'px';
            panel.style.top = finalY + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.transition = 'none';
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                panel.style.cursor = '';
                document.body.style.userSelect = '';
                document.body.style.webkitUserSelect = '';
                panel.style.transition = 'all 0.3s ease';
                const rect = panel.getBoundingClientRect();
                const newPosition = {
                    bottom: window.innerHeight - rect.bottom,
                    right: window.innerWidth - rect.right
                };
                
                // 验证并保存位置
                const validatedPosition = validatePanelPosition(newPosition);
                panelPosition = validatedPosition;
                GM_setValue('panelPosition', validatedPosition);
                console.log('保存面板位置:', validatedPosition);
            }
        });
        panel.addEventListener('selectstart', (e) => {
            if (isDragging) e.preventDefault();
        });
    }

    // 页面静音 (不太好用，后续继续开发)
    function mutePageAudio() {
        if (muteInterval) clearInterval(muteInterval);

        const muteAllElements = () => {
            const audioElements = document.querySelectorAll('audio, video');
            audioElements.forEach(element => {
                if (!element.dataset.originalVolume) {
                    element.dataset.originalVolume = element.volume;
                }
                element.volume = 0;
                element.muted = true;
            });
        };

        muteAllElements();
        muteInterval = setInterval(muteAllElements, 500);

        if (window.AudioContext || window.webkitAudioContext) {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state === 'running') {
                    audioContext.suspend();
                }
            } catch (e) {
                console.log('无法静音AudioContext:', e);
            }
        }
    }

    // 解除静音并可选择性停止播放
    function unmutePageAudio(shouldClickButton = true) {
        if (muteInterval) clearInterval(muteInterval);
        muteInterval = null;

        const audioElements = document.querySelectorAll('audio, video');
        audioElements.forEach(element => {
            if (element.dataset.originalVolume) {
                element.volume = parseFloat(element.dataset.originalVolume);
                delete element.dataset.originalVolume;
            }
            element.muted = false;
            element.pause();
        });

        if (window.AudioContext || window.webkitAudioContext) {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
            } catch (e) {
                console.log('无法恢复AudioContext:', e);
            }
        }

        // 只有在主动模式下才点击停止按钮
        if (shouldClickButton) {
            clickAudioToggleButton();
            updateStatus('已恢复页面音频并暂停播放');
        } else {
            updateStatus('已停止监控');
        }
    }

    // 重置自动合并计时器
    function resetAutoMergeTimer() {
        if (autoMergeTimer) clearTimeout(autoMergeTimer);
        if (autoMergeEnabled && capturedAudio.length > 0) {
            autoMergeTimer = setTimeout(() => {
                const now = Date.now();
                const timeSinceLastCapture = lastAudioCaptureTime ? now - lastAudioCaptureTime : 0;
                if (timeSinceLastCapture >= AUTO_MERGE_DELAY && capturedAudio.length > 0) {
                    updateStatus('🤖 自动合并中...');
                    autoMergeAndDownload();
                }
            }, AUTO_MERGE_DELAY);
        }
    }

    // 自动合并并下载
    function autoMergeAndDownload() {
        if (capturedAudio.length === 0) return;
        const indices = capturedAudio.map((_, index) => index);
        const modal = createModal('自动合并进度');
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <div id="merge-progress-text">🤖 自动合并 ${capturedAudio.length} 个音频文件...</div>
                <div style="margin: 15px 0; background: ${isDarkMode ? '#2d2d2d' : '#f0f0f0'}; border-radius: 4px; overflow: hidden;">
                    <div id="merge-progress-bar" style="width: 0%; height: 20px; background: #0f9d58;"></div>
                </div>
                <div id="merge-status">正在初始化...</div>
            </div>
        `;
        modal.appendChild(content);
        setTimeout(() => {
            startMergeProcess(indices, 'mp3', modal, true);
        }, 500);
    }

    // 更新状态区域
    function updateStatus(message) {
        const statusArea = document.getElementById('status-area');
        if (statusArea) statusArea.textContent = message;
    }

    // 更新音频计数
    function updateAudioCount() {
        const countElement = document.getElementById('audio-count');
        if (countElement) countElement.textContent = capturedAudio.length;
    }

    // 开始监控网络请求
    function startMonitoring() {
        if (isMonitoring) return; // 防止重复挂钩
        isMonitoring = true;

        unsafeWindow.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            xhr.open = function() {
                this.url = arguments[1];
                return originalOpen.apply(this, arguments);
            };
            xhr.addEventListener('load', function() {
                if (!isMonitoring) return; // 检查是否仍在监控
                try {
                    const contentType = this.getResponseHeader('Content-Type') || '';
                    const isAudio = contentType.includes('audio') || contentType.includes('octet-stream') || (this.url && this.url.match(/\.(mp3|wav|ogg|aac|flac|m4a)($|\?)/i));
                    if (isAudio) {
                        captureAudioFromResponse(this.response, contentType, this.url);
                    }
                } catch (e) { console.error('处理XHR请求时出错:', e); }
            });
            return xhr;
        };

        unsafeWindow.fetch = function() {
            const url = arguments[0] instanceof Request ? arguments[0].url : arguments[0];
            return originalFetch.apply(this, arguments).then(response => {
                if (!isMonitoring) return response; // 检查是否仍在监控
                try {
                    const contentType = response.headers.get('Content-Type') || '';
                    const isAudio = contentType.includes('audio') || contentType.includes('octet-stream') || (url && url.match(/\.(mp3|wav|ogg|aac|flac|m4a)($|\?)/i));
                    if (isAudio) {
                        response.clone().arrayBuffer().then(buffer => {
                            captureAudioFromResponse(buffer, contentType, url);
                        });
                    }
                } catch (e) { console.error('处理Fetch请求时出错:', e); }
                return response;
            });
        };

        observer = new MutationObserver(mutations => {
            if (!isMonitoring) return; // 检查是否仍在监控
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
                        node.addEventListener('play', () => {
                            if (node.src) captureAudioFromMediaElement(node);
                        });
                        if (isCapturing && muteInterval) { // 只有主动模式才静音新元素
                            if (!node.dataset.originalVolume) {
                                node.dataset.originalVolume = node.volume;
                            }
                            node.volume = 0;
                            node.muted = true;
                        }
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        document.querySelectorAll('audio, video').forEach(mediaElement => {
            mediaElement.addEventListener('play', () => {
                if (mediaElement.src) captureAudioFromMediaElement(mediaElement);
            });
        });

        scanPageForDataUrls();
    }

    // 停止监控
    function stopMonitoring() {
        if (!isMonitoring) return; // 防止重复卸载
        isMonitoring = false;
        unsafeWindow.XMLHttpRequest = originalXHR;
        unsafeWindow.fetch = originalFetch;
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    // 从响应捕获音频
    function captureAudioFromResponse(response, contentType, url) {
        if (!isMonitoring) return; // 最终检查
        if (capturedAudio.some(audio => audio.url === url)) return;
        const audioItem = {
            id: generateId(), source: 'network', url: url, contentType: contentType,
            timestamp: new Date().toISOString(), data: response,
            format: guessAudioFormat(contentType, url),
            size: response ? (response.byteLength || 0) : 0
        };
        capturedAudio.push(audioItem);
        lastAudioCaptureTime = Date.now();
        updateAudioCount();
        saveAudioData();
        updateStatus(`捕获到新音频: ${getShortUrl(url)}`);
        resetAutoMergeTimer();
    }

    // 从媒体元素捕获音频
    function captureAudioFromMediaElement(mediaElement) {
        if (!isMonitoring) return; // 最终检查
        if (capturedAudio.some(audio => audio.url === mediaElement.src)) return;
        const audioItem = {
            id: generateId(), source: 'media', url: mediaElement.src, contentType: 'audio/media',
            timestamp: new Date().toISOString(), mediaElement: mediaElement,
            format: 'mp3', size: 'unknown'
        };
        capturedAudio.push(audioItem);
        lastAudioCaptureTime = Date.now();
        updateAudioCount();
        saveAudioData();
        updateStatus(`捕获到媒体元素音频: ${getShortUrl(mediaElement.src)}`);
        resetAutoMergeTimer();
    }

    // 生成唯一ID
    function generateId() {
        return 'audio_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // 获取简短URL
    function getShortUrl(url) {
        if (!url) return 'unknown';
        if (url.startsWith('data:')) return 'data:URL';
        try {
            const path = new URL(url).pathname;
            return path.length > 20 ? path.substr(0, 17) + '...' : path;
        } catch (e) {
            return url.substr(0, 20) + '...';
        }
    }

    // 猜测音频格式
    function guessAudioFormat(contentType, url) {
        if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
        if (contentType.includes('wav')) return 'wav';
        if (contentType.includes('ogg')) return 'ogg';
        if (contentType.includes('aac')) return 'aac';
        if (contentType.includes('flac')) return 'flac';
        if (url) {
            if (url.match(/\.mp3($|\?)/i)) return 'mp3';
            if (url.match(/\.wav($|\?)/i)) return 'wav';
            if (url.match(/\.ogg($|\?)/i)) return 'ogg';
            if (url.match(/\.aac($|\?)/i)) return 'aac';
            if (url.match(/\.flac($|\?)/i)) return 'flac';
        }
        return 'mp3';
    }

    // 保存音频数据
    function saveAudioData() {
        try {
            const serializedData = capturedAudio.map(({ id, source, url, contentType, timestamp, format, size }) =>
                ({ id, source, url, contentType, timestamp, format, size }));
            GM_setValue('capturedAudioMeta', JSON.stringify(serializedData));
        } catch (e) { console.error('保存音频元数据时出错:', e); }
    }

    // 加载音频元数据
    function loadAudioData() {
        try {
            const data = GM_getValue('capturedAudioMeta');
            if (data) {
                capturedAudio = JSON.parse(data);
                updateAudioCount();
            }
        } catch (e) { console.error('加载音频元数据时出错:', e); }
    }

    // 扫描页面中的data URLs
    function scanPageForDataUrls() {
        const dataUrlRegex = /data:(application\/octet-stream|audio\/[^;]+);base64,([A-Za-z0-9+/=]{100,})/g;
        let match;
        const content = document.documentElement.innerHTML || '';
        while ((match = dataUrlRegex.exec(content)) !== null) {
            const dataUrl = `data:${match[1]};base64,${match[2]}`;
            if (!capturedAudio.some(audio => audio.url === dataUrl)) {
                validateAudioDataUrl(dataUrl, () => captureDataUrl(dataUrl, match[1]));
            }
        }
    }

    // 验证数据URL
    function validateAudioDataUrl(dataUrl, callback) {
        const audio = new Audio();
        audio.onloadedmetadata = () => { if (audio.duration > 0) callback(); };
        audio.onerror = () => {
            try {
                fetch(dataUrl).then(r => r.arrayBuffer()).then(buffer => {
                    if (checkAudioSignature(buffer)) callback();
                });
            } catch (e) {}
        };
        audio.src = dataUrl;
    }

    // 捕获data URL
    function captureDataUrl(dataUrl, mimeType) {
        if (!isMonitoring) return; // 检查
        const audioItem = {
            id: generateId(), source: 'dataUrl', url: dataUrl, contentType: mimeType,
            timestamp: new Date().toISOString(), format: guessAudioFormat(mimeType, null),
            size: 'embedded'
        };
        capturedAudio.push(audioItem);
        lastAudioCaptureTime = Date.now();
        updateAudioCount();
        saveAudioData();
        updateStatus('捕获到data URL音频');
        resetAutoMergeTimer();
    }

    // 检查音频签名
    function checkAudioSignature(buffer) {
        if (!buffer || buffer.byteLength < 8) return false;
        const view = new Uint8Array(buffer.slice(0, 16));
        const signatures = {
            'ID3': [0x49, 0x44, 0x33], 'MP3': [0xFF, 0xFB], 'RIFF': [0x52, 0x49, 0x46, 0x46],
            'OGG': [0x4F, 0x67, 0x67, 0x53], 'FLAC': [0x66, 0x4C, 0x61, 0x43],
            'M4A': [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], 'FLV': [0x46, 0x4C, 0x56, 0x01]
        };
        for (const sig of Object.values(signatures)) {
            if (sig.every((byte, i) => view[i] === byte)) return true;
        }
        try {
            const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer.slice(0, 100)));
            return text.includes('Lavf') || text.includes('matroska') || text.includes('webm');
        } catch (e) { return false; }
    }

    // 从data URL下载
    function downloadFromDataUrl() {
        const audioDataUrl = prompt("请粘贴data:application/octet-stream;base64,开头的URL:", "");
        if (!audioDataUrl || !audioDataUrl.startsWith('data:')) {
            alert('请提供有效的data URL'); return;
        }
        try {
            const a = document.createElement('a');
            a.href = audioDataUrl;
            a.download = `${fileNamePrefix}_${Date.now()}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            updateStatus('音频下载已启动');
            captureDataUrl(audioDataUrl, audioDataUrl.split(';')[0].split(':')[1]);
        } catch (error) {
            console.error('下载失败:', error); alert('下载失败: ' + error.message);
        }
    }

    // 处理Base64
    function handleBase64FromRequest() {
        const modal = createModal('处理Base64数据');
        const theme = getThemeStyles();
        const content = document.createElement('div');
        content.innerHTML = `
            <textarea id="base64-input" placeholder="在此粘贴base64编码的音频数据"
                      style="width: 100%; height: 150px; padding: 8px; margin-bottom: 10px; font-family: monospace; background: ${theme.buttonBg}; color: ${theme.color}; border: 1px solid ${theme.border};"></textarea>
            <div style="margin-bottom: 10px;">
                <label for="format-select">保存格式:</label>
                <select id="format-select" style="padding: 5px; background: ${theme.buttonBg}; color: ${theme.color}; border: 1px solid ${theme.border};">
                    <option value="mp3">MP3</option> <option value="wav">WAV</option>
                    <option value="ogg">OGG</option> <option value="flac">FLAC</option>
                </select>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="cancel-base64" style="padding: 8px 15px; background: ${theme.buttonBg}; border: 1px solid ${theme.border}; border-radius: 4px; cursor: pointer;">取消</button>
                <button id="process-base64-btn" style="padding: 8px 15px; background: ${theme.primaryBg}; color: white; border: none; border-radius: 4px; cursor: pointer;">处理并下载</button>
            </div>
        `;
        modal.appendChild(content);
        document.getElementById('cancel-base64').addEventListener('click', () => closeModal(modal));
        document.getElementById('process-base64-btn').addEventListener('click', () => {
            const base64Data = document.getElementById('base64-input').value.trim();
            if (!base64Data) { alert('请输入base64数据'); return; }
            let cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
            try {
                atob(cleanBase64.substring(0, 10)); // 验证
                const format = document.getElementById('format-select').value;
                const mimeTypes = {'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 'flac': 'audio/flac'};
                const dataUrl = `data:${mimeTypes[format] || 'application/octet-stream'};base64,${cleanBase64}`;
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `${fileNamePrefix}_${Date.now()}.${format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                captureDataUrl(dataUrl, mimeTypes[format]);
                closeModal(modal);
                updateStatus('音频处理并下载成功');
            } catch (e) { alert('无效的base64数据: ' + e.message); }
        });
    }

    // 复制Base64数据
    async function copyAudioData(id) {
        const audio = capturedAudio.find(a => a.id === id);
        if (!audio) {
            updateStatus('⚠ 未找到音频数据');
            return;
        }

        const btn = document.querySelector(`.copy-btn[data-id="${id}"]`);
        const originalHtml = btn ? btn.innerHTML : '';
        
        if (btn) {
            btn.innerHTML = `...`;
            btn.disabled = true;
        }

        try {
            let base64Data;
            if (audio.source === 'dataUrl') {
                if (audio.url.includes('base64,')) {
                    base64Data = audio.url.split('base64,')[1];
                } else {
                    updateStatus('⚠ 无法复制非Base64的Data URL');
                    if (btn) btn.innerHTML = originalHtml;
                    return;
                }
            } else if (audio.data instanceof ArrayBuffer || audio.url) {
                // 需要先获取缓冲区
                const buffer = await getAudioBuffer(audio);
                
                // 将ArrayBuffer转换为Base64
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                base64Data = window.btoa(binary);
            } else {
                updateStatus('⚠ 无法获取音频数据');
                if (btn) btn.innerHTML = originalHtml;
                return;
            }

            await navigator.clipboard.writeText(base64Data);
            const shortId = id.split('_')[1] || id;
            updateStatus(`✓ 音频 #${shortId} 的Base64已复制`);
            
            // 显示“已复制”的临时状态
            if (btn) {
                btn.innerHTML = `${icons.check} 已复制`;
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }, 2000);
            }

        } catch (err) {
            console.error('复制Base64失败:', err);
            updateStatus('⚠ 复制失败: ' + err.message);
            alert('复制失败。请检查控制台获取更多信息。');
            if (btn) {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        }
    }


    // 显示已捕获的音频列表
    function showCapturedAudioList() {
        // 如果列表为空，弹窗提示
        if (capturedAudio.length === 0) {
            alert('⚠ 尚未捕获任何音频');
            return;
        }
        const modal = createModal('已捕获的音频列表');
        const theme = getThemeStyles();
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="position: relative; margin-bottom: 12px;">
                    <input type="text" id="search-audio" placeholder="🔍 搜索音频..."
                           style="width: 100%; padding: 12px 16px; background: ${theme.buttonBg}; color: ${theme.color}; 
                           border: 1px solid ${theme.border}; border-radius: 8px; font-size: 14px; transition: all 0.2s;"
                           onfocus="this.style.borderColor='#3b82f6'; this.style.background='${isDarkMode ? '#1f2937' : '#ffffff'}'"
                           onblur="this.style.borderColor='${theme.border}'; this.style.background='${theme.buttonBg}'">
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="close-audio-list" style="padding: 8px 16px; background: ${theme.buttonBg}; color: ${theme.color}; 
                        border: 1px solid ${theme.border}; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;"
                        onmouseover="this.style.background='${theme.buttonHover}'" onmouseout="this.style.background='${theme.buttonBg}'">
                        关闭
                    </button>
                    <button id="clear-all" style="padding: 8px 16px; background: ${theme.dangerBg}; color: white; 
                        border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s;"
                        onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        清空列表
                    </button>
                </div>
            </div>
            <div id="audio-list-container" style="max-height: 400px; overflow-y: auto; margin-top: 16px;"></div>
        `;
        modal.appendChild(content);
        document.getElementById('close-audio-list').addEventListener('click', () => closeModal(modal));
        renderAudioList();

        document.getElementById('search-audio').addEventListener('input', function() {
            renderAudioList(this.value);
        });

        // 清空列表（无确认）
        document.getElementById('clear-all').addEventListener('click', function() {
            capturedAudio = [];
            updateAudioCount();
            saveAudioData();
            closeModal(modal);
            updateStatus('已清空音频列表');
        });

        function renderAudioList(searchTerm = '') {
            const theme = getThemeStyles();
            const container = document.getElementById('audio-list-container');
            container.innerHTML = '';
            const filteredAudio = searchTerm ?
                capturedAudio.filter(a => (a.url && a.url.toLowerCase().includes(searchTerm.toLowerCase())) || a.format.toLowerCase().includes(searchTerm.toLowerCase())) :
                capturedAudio;
            if (filteredAudio.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 40px 20px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'};">
                    <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                    <div style="font-size: 14px;">${searchTerm ? '没有匹配的音频' : '暂无音频'}</div>
                </div>`;
                return;
            }
            filteredAudio.forEach((audio, index) => {
                const item = document.createElement('div');
                item.style.cssText = `
                    background: ${isDarkMode ? '#2d2d2d' : '#f9fafb'}; 
                    border: 1px solid ${theme.border}; 
                    border-radius: 8px; 
                    padding: 12px; 
                    margin-bottom: 8px;
                    transition: all 0.2s;
                `;
                item.onmouseover = () => { item.style.background = isDarkMode ? '#374151' : '#f3f4f6'; };
                item.onmouseout = () => { item.style.background = isDarkMode ? '#2d2d2d' : '#f9fafb'; };
                
                const date = new Date(audio.timestamp).toLocaleString();
                const size = typeof audio.size === 'number' ? (audio.size / 1024).toFixed(2) + ' KB' : audio.size;
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: ${theme.primaryBg}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                                #${index + 1}
                            </span>
                            <span style="font-weight: 600; font-size: 14px;">${audio.format.toUpperCase()}</span>
                        </div>
                        <div style="font-size: 11px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'};">${date}</div>
                    </div>
                    <div title="${audio.url}" style="font-size: 12px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'}; 
                        word-break: break-all; margin-bottom: 8px; padding: 6px 8px; background: ${isDarkMode ? '#1f2937' : '#ffffff'}; 
                        border-radius: 4px; font-family: monospace;">
                        ${getShortUrl(audio.url)}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <div style="font-size: 11px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'};">
                            来源: ${audio.source} | 大小: ${size}
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button class="download-btn" data-id="${audio.id}" style="padding: 6px 12px; background: ${theme.primaryBg}; 
                                color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;
                                display: flex; align-items: center; gap: 4px;"
                                onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                                ${icons.download} 下载
                            </button>
                            <button class="copy-btn" data-id="${audio.id}" style="padding: 6px 12px; background: ${theme.buttonBg}; 
                                color: ${theme.color}; border: 1px solid ${theme.border}; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;
                                display: flex; align-items: center; gap: 4px;"
                                onmouseover="this.style.background='${theme.buttonHover}'" onmouseout="this.style.background='${theme.buttonBg}'">
                                ${icons.copy} 复制
                            </button>
                            <button class="remove-btn" data-id="${audio.id}" style="padding: 6px 12px; background: ${isDarkMode ? '#7f1d1d' : '#fee2e2'}; 
                                color: ${isDarkMode ? '#fca5a5' : '#dc2626'}; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;
                                display: flex; align-items: center; gap: 4px;"
                                onmouseover="this.style.background='${isDarkMode ? '#991b1b' : '#fecaca'}'" onmouseout="this.style.background='${isDarkMode ? '#7f1d1d' : '#fee2e2'}'">
                                ${icons.trash} 删除
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(item);
            });
            document.querySelectorAll('.download-btn').forEach(btn => btn.addEventListener('click', function() { downloadAudio(this.getAttribute('data-id')); }));
            // 修改事件监听器
            document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', function() { copyAudioData(this.getAttribute('data-id')); }));
            document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', function() { removeAudio(this.getAttribute('data-id')); renderAudioList(searchTerm); }));
        }
        function downloadAudio(id) {
            const audio = capturedAudio.find(a => a.id === id); if (!audio) return;
            if (audio.source === 'dataUrl') {
                const a = document.createElement('a'); a.href = audio.url;
                a.download = `${fileNamePrefix}_${Date.now()}.${audio.format}`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            } else if (audio.url) {
                GM_download({
                    url: audio.url, name: `audio_${Date.now()}.${audio.format}`,
                    onload: () => updateStatus('下载完成'),
                    onerror: (e) => { console.error('下载失败:', e); updateStatus('下载失败'); }
                });
            }
        }
        // 移除 playAudio 函数
        // function playAudio(id) { ... }
        function removeAudio(id) {
            const index = capturedAudio.findIndex(a => a.id === id);
            if (index !== -1) {
                capturedAudio.splice(index, 1);
                updateAudioCount(); saveAudioData(); updateStatus('已删除音频');
            }
        }
    }

    // 显示合并选项
    function showMergeOptions() {
        // 如果列表为空，弹窗提示
        if (capturedAudio.length === 0) {
            alert('⚠ 尚未捕获任何音频');
            return;
        }
        const modal = createModal('合并下载音频');
        const theme = getThemeStyles();
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="background: ${isDarkMode ? '#1f2937' : '#f3f4f6'}; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <div style="font-size: 14px; color: ${theme.color}; margin-bottom: 4px;">
                    📦 当前有 <strong style="color: ${theme.primaryBg};">${capturedAudio.length}</strong> 个已捕获的音频
                </div>
                <div style="font-size: 12px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'};">
                    您可以选择要合并的音频范围
                </div>
            </div>
            
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'}; margin-bottom: 8px; font-weight: 500;">
                    合并范围
                </label>
                <div style="display: flex; gap: 8px; align-items: stretch;">
                    <input type="text" id="merge-range" placeholder="例如: 1-5,7,9-12" 
                        style="flex: 1; padding: 10px 12px; background: ${theme.buttonBg}; color: ${theme.color}; 
                        border: 1px solid ${theme.border}; border-radius: 6px; font-size: 14px; transition: all 0.2s;"
                        onfocus="this.style.borderColor='#3b82f6'; this.style.background='${isDarkMode ? '#1f2937' : '#ffffff'}'"
                        onblur="this.style.borderColor='${theme.border}'; this.style.background='${theme.buttonBg}'">
                    <button id="select-all-btn" style="padding: 10px 16px; background: ${theme.primaryBg}; color: white; 
                        border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; white-space: nowrap;
                        display: flex; align-items: center; justify-content: center; gap: 6px;"
                        onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        ${icons.check} <span>全选</span>
                    </button>
                </div>
                <div style="font-size: 11px; color: ${isDarkMode ? '#6b7280' : '#9ca3af'}; margin-top: 6px; padding-left: 4px;">
                    💡 范围格式: 单个数字(如5)、范围(如1-5)或组合(如1-3,5,7-9)
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'}; margin-bottom: 8px; font-weight: 500;">
                    输出格式
                </label>
                <select id="merge-format" style="width: 100%; padding: 10px 12px; background: ${theme.buttonBg}; color: ${theme.color}; 
                    border: 1px solid ${theme.border}; border-radius: 6px; font-size: 14px; cursor: pointer; transition: all 0.2s;"
                    onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='${theme.border}'">
                    <option value="mp3">MP3 (推荐)</option>
                    <option value="wav">WAV</option>
                </select>
            </div>

            <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px; border: 1px solid ${theme.border}; 
                border-radius: 8px; background: ${isDarkMode ? '#1f2937' : '#ffffff'};">
                <div style="padding: 12px; border-bottom: 1px solid ${theme.border}; background: ${isDarkMode ? '#374151' : '#f9fafb'}; 
                    position: sticky; top: 0; z-index: 1;">
                    <div style="font-size: 13px; font-weight: 600; color: ${theme.color};">可选择的音频列表</div>
                </div>
                <div id="merge-audio-list" style="padding: 8px;"></div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; border-top: 1px solid ${theme.border};">
                <button id="cancel-merge" style="padding: 10px 20px; background: ${theme.buttonBg}; color: ${theme.color}; 
                    border: 1px solid ${theme.border}; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;"
                    onmouseover="this.style.background='${theme.buttonHover}'" onmouseout="this.style.background='${theme.buttonBg}'">
                    取消
                </button>
                <button id="start-merge" style="padding: 10px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                    color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; 
                    transition: all 0.2s; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
                    display: flex; align-items: center; justify-content: center; gap: 8px;"
                    onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.4)'"
                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(16, 185, 129, 0.3)'">
                    ${icons.download} <span>开始合并</span>
                </button>
            </div>
        `;
        modal.appendChild(content);

        const audioListContainer = document.getElementById('merge-audio-list');
        capturedAudio.forEach((audio, index) => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex; 
                align-items: center; 
                padding: 8px 10px; 
                border-radius: 6px;
                margin-bottom: 4px;
                transition: all 0.2s;
                cursor: pointer;
            `;
            item.onmouseover = () => { item.style.background = isDarkMode ? '#374151' : '#f3f4f6'; };
            item.onmouseout = () => { item.style.background = 'transparent'; };
            
            item.innerHTML = `
                <input type="checkbox" class="merge-select" data-index="${index}" id="merge-item-${index}" 
                    style="margin-right: 10px; cursor: pointer; width: 16px; height: 16px;">
                <label for="merge-item-${index}" style="flex: 1; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                    <span style="background: ${theme.primaryBg}; color: white; padding: 2px 8px; border-radius: 4px; 
                        font-size: 11px; font-weight: 600; min-width: 32px; text-align: center;">
                        #${index + 1}
                    </span>
                    <span style="font-weight: 500; font-size: 13px;">${audio.format.toUpperCase()}</span>
                    <span style="font-size: 11px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'}; font-family: monospace; 
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                        ${getShortUrl(audio.url)}
                    </span>
                </label>
            `;
            audioListContainer.appendChild(item);
            
            // 点击整行也能选中
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const checkbox = item.querySelector('input');
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        });

        document.getElementById('cancel-merge').addEventListener('click', () => closeModal(modal));
        document.getElementById('select-all-btn').addEventListener('click', () => {
            document.getElementById('merge-range').value = `1-${capturedAudio.length}`;
            document.querySelectorAll('.merge-select').forEach(cb => { cb.checked = true; });
        });

        const rangeInput = document.getElementById('merge-range');
        const checkboxes = document.querySelectorAll('.merge-select');
        rangeInput.addEventListener('input', function() {
            const indices = parseRangeString(this.value.trim(), capturedAudio.length);
            checkboxes.forEach(cb => {
                cb.checked = indices.includes(parseInt(cb.getAttribute('data-index')));
            });
        });
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const selectedIndices = Array.from(document.querySelectorAll('.merge-select:checked')).map(c => parseInt(c.getAttribute('data-index')));
                rangeInput.value = generateRangeString(selectedIndices);
            });
        });

        document.getElementById('start-merge').addEventListener('click', () => {
            const range = rangeInput.value.trim();
            if (!range) { 
                // 使用 alert 提示
                alert('⚠ 请选择要合并的音频范围'); 
                return; 
            }
            const indices = parseRangeString(range, capturedAudio.length);
            if (indices.length === 0) { 
                // 使用 alert 提示
                alert('⚠ 未选择任何有效的音频'); 
                return; 
            }
            const format = document.getElementById('merge-format').value;
            mergeAudio(indices, format);
            closeModal(modal);
        });
    }

    // 解析范围字符串
    function parseRangeString(rangeStr, maxValue) {
        const result = new Set();
        rangeStr.split(',').forEach(part => {
            part = part.trim();
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => parseInt(n.trim()));
                const startIndex = Math.max(0, start - 1);
                const endIndex = Math.min(maxValue - 1, end - 1);
                if (!isNaN(startIndex) && !isNaN(endIndex) && startIndex <= endIndex) {
                    for (let i = startIndex; i <= endIndex; i++) result.add(i);
                }
            } else {
                const index = parseInt(part) - 1;
                if (!isNaN(index) && index >= 0 && index < maxValue) result.add(index);
            }
        });
        return Array.from(result).sort((a, b) => a - b);
    }

    // 生成范围字符串
    function generateRangeString(indices) {
        if (indices.length === 0) return '';
        indices.sort((a, b) => a - b);
        const ranges = [];
        let start = indices[0], end = indices[0];
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === end + 1) {
                end = indices[i];
            } else {
                ranges.push(start === end ? `${start + 1}` : `${start + 1}-${end + 1}`);
                start = end = indices[i];
            }
        }
        ranges.push(start === end ? `${start + 1}` : `${start + 1}-${end + 1}`);
        return ranges.join(',');
    }

    // 合并音频
    function mergeAudio(indices, format) {
        if (indices.length === 0) { alert('未选择任何音频'); return; }
        const modal = createModal('音频合并进度');
        const theme = getThemeStyles();
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <div id="merge-progress-text">准备合并 ${indices.length} 个音频文件...</div>
                <div style="margin: 15px 0; background: ${isDarkMode ? '#2d2d2d' : '#f0f0f0'}; border-radius: 4px; overflow: hidden;">
                    <div id="merge-progress-bar" style="width: 0%; height: 20px; background: #0f9d58;"></div>
                </div>
                <div id="merge-status">正在初始化...</div>
            </div>
        `;
        modal.appendChild(content);
        setTimeout(() => {
            startMergeProcess(indices, format, modal, false);
        }, 500);
    }

    // 开始合并流程
    async function startMergeProcess(indices, format, modal, isAutoMerge = false) {
        try {
            updateMergeProgress(5, '开始下载音频数据...');
            const audioBuffers = [];
            for (let i = 0; i < indices.length; i++) {
                const index = indices[i];
                const progress = 5 + Math.floor(((i + 1) / indices.length) * 50);
                updateMergeProgress(progress, `正在处理第 ${i + 1}/${indices.length} 个音频...`);
                const audio = capturedAudio[index];
                if (!audio) continue;
                try {
                    const buffer = await getAudioBuffer(audio);
                    if (buffer && (format !== 'mp3' || (audio.format === 'mp3' || isValidMp3(buffer)))) {
                        audioBuffers.push(buffer);
                    }
                } catch (e) {
                    console.error(`处理第 ${index + 1} 个音频时出错:`, e);
                    updateMergeStatus(`处理第 ${index + 1} 个音频时出错: ${e.message}`);
                }
            }

            if (audioBuffers.length === 0) {
                updateMergeStatus('没有有效的音频数据可合并');
                setTimeout(() => closeModal(modal), 3000);
                return;
            }

            updateMergeProgress(60, `已加载 ${audioBuffers.length} 个音频，开始合并...`);
            const mergedAudio = await mergeAudioBuffers(audioBuffers, format);
            updateMergeProgress(90, '合并完成，准备下载...');

            const fileName = `${fileNamePrefix}_${Date.now()}.${format}`;
            const blob = new Blob([mergedAudio], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            let statusMsg = `已成功合并 ${audioBuffers.length} 个音频文件并下载`;
            if (autoClearList) {
                capturedAudio = [];
                updateAudioCount();
                saveAudioData();
                statusMsg = `合并下载完成，并已清空列表`;
            }
            updateMergeProgress(100, '合并完成，已开始下载！');
            updateStatus(statusMsg);

            if (isAutoMerge && (isMonitoring && isCapturing)) { // 仅在主动模式下自动停止
                setTimeout(() => {
                    stopMonitoring();
                    unmutePageAudio(true); // 主动模式，需要点击停止按钮
                    isCapturing = false;
                    isMonitoring = false;
                    updateCaptureUI();
                    updateStatus('✅ 自动合并完成，已停止获取');
                }, 1000);
            }

            setTimeout(() => closeModal(modal), 3000);
        } catch (error) {
            console.error('合并音频过程中出错:', error);
            updateMergeStatus(`合并失败: ${error.message}`);
        }
    }

    // 获取音频的ArrayBuffer数据
    async function getAudioBuffer(audio) {
        return new Promise(async (resolve, reject) => {
            try {
                if (audio.data instanceof ArrayBuffer) {
                    resolve(audio.data);
                } else if (audio.source === 'dataUrl') {
                    if (audio.url.startsWith('data:application/octet-stream;base64,') || audio.url.startsWith('data:audio/mpeg;base64,') || audio.url.includes('base64,')) {
                        const base64Data = audio.url.split('base64,')[1];
                        const binaryString = atob(base64Data);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        resolve(bytes.buffer);
                    } else {
                        fetch(audio.url).then(response => response.arrayBuffer()).then(buffer => resolve(buffer)).catch(reject);
                    }
                } else if (audio.url) {
                    GM_xmlhttpRequest({
                        method: 'GET', url: audio.url, responseType: 'arraybuffer',
                        onload: (response) => resolve(response.response),
                        onerror: (error) => reject(new Error('无法下载音频: ' + error))
                    });
                } else {
                    reject(new Error('无法获取音频数据'));
                }
            } catch (e) { reject(e); }
        });
    }

    // 合并音频缓冲区 (目前仅支持MP3快速拼接，因为WAV文件的体积会非常大)
    async function mergeAudioBuffers(audioBuffers, format) {
        return new Promise(async (resolve, reject) => {
            try {
                if (format !== 'mp3') {
                    reject(new Error("目前仅支持MP3格式的快速合并。"));
                    return;
                }

                updateMergeStatus('正在直接合并MP3文件...');
                const validMp3Buffers = [];
                for (let i = 0; i < audioBuffers.length; i++) {
                    const buffer = audioBuffers[i];
                    if (isValidMp3(buffer)) {
                        validMp3Buffers.push(buffer);
                    } else {
                        console.warn(`跳过第${i+1}个非MP3格式文件`);
                    }
                    updateMergeProgress(60 + Math.floor((i / audioBuffers.length) * 30), `正在处理第 ${i + 1}/${audioBuffers.length} 个文件...`);
                }

                if (validMp3Buffers.length === 0) {
                    reject(new Error('没有有效的MP3文件可以合并')); return;
                }

                updateMergeStatus(`正在合并 ${validMp3Buffers.length} 个MP3文件...`);
                const totalLength = validMp3Buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
                const mergedMp3 = new Uint8Array(totalLength);
                let offset = 0;
                for (const buffer of validMp3Buffers) {
                    const data = new Uint8Array(buffer);
                    mergedMp3.set(data, offset);
                    offset += buffer.byteLength;
                }
                updateMergeProgress(95, '合并完成，准备下载...');
                resolve(mergedMp3.buffer);
            } catch (e) { reject(e); }
        });
    }

    // 简单检查是否为有效的MP3文件
    function isValidMp3(buffer) {
        if (!buffer || buffer.byteLength < 3) return false;
        const view = new Uint8Array(buffer);
        if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) return true;
        for (let i = 0; i < Math.min(100, view.length - 1); i++) {
            if (view[i] === 0xFF && (view[i+1] & 0xE0) === 0xE0) return true;
        }
        return false;
    }

    // 更新合并进度
    function updateMergeProgress(percent, message) {
        const progressBar = document.getElementById('merge-progress-bar');
        const progressText = document.getElementById('merge-progress-text');
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = message || `进度: ${percent}%`;
    }

    // 更新合并状态
    function updateMergeStatus(message) {
        const statusElement = document.getElementById('merge-status');
        if (statusElement) statusElement.textContent = message;
    }

    // 创建模态框
    function createModal(title) {
        // 注入/更新滚动条样式
        injectCustomScrollbarStyles();
            
        const existingModal = document.querySelector('.audio-capture-modal-backdrop');
        if (existingModal) document.body.removeChild(existingModal);
        const theme = getThemeStyles();
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'audio-capture-modal-backdrop';
        modalBackdrop.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        `;
        const modal = document.createElement('div');
        modal.className = 'audio-capture-modal';
        modal.style.cssText = `
            background: ${theme.background}; color: ${theme.color};
            border-radius: 8px; box-shadow: 0 0 20px ${theme.shadowColor};
            width: 80%; max-width: 600px; max-height: 80vh;
            display: flex; flex-direction: column; /* 确保标题和内容正确布局 */
            z-index: 10001;
        `;
        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        titleElement.style.cssText = `
            margin: 0; padding: 20px 20px 15px 20px;
            border-bottom: 1px solid ${theme.border};
            flex-shrink: 0; /* 防止标题被压缩 */
        `;
        
        // 创建一个可滚动的内容容器
        const contentWrapper = document.createElement('div');
        contentWrapper.style.cssText = `
            overflow-y: auto;
            padding: 20px;
            flex-grow: 1; /* 占据剩余空间 */
        `;

        modal.appendChild(titleElement);
        modal.appendChild(contentWrapper); // 内容将被添加到这个包装器中
        modalBackdrop.appendChild(modal);
        document.body.appendChild(modalBackdrop);
        
        // 返回内容包装器，以便调用者向其中添加内容
        return contentWrapper;
    }

    // 关闭模态框
    function closeModal(modalWrapper) {
        try {
            // modalWrapper 是我们返回的内容容器
            // 我们需要找到它的父级 .audio-capture-modal，然后再找到 .audio-capture-modal-backdrop
            const backdrop = modalWrapper.closest('.audio-capture-modal-backdrop');
            if (backdrop && document.body.contains(backdrop)) {
                document.body.removeChild(backdrop);
            }
        } catch (e) {
            console.error('关闭模态框时出错:', e);
            document.querySelectorAll('.audio-capture-modal-backdrop').forEach(el => el.remove());
        }
    }

    // 注册GM菜单
    GM_registerMenuCommand('🎵 打开音频捕获工具', createMainInterface);
    GM_registerMenuCommand('▶️ 触发一键获取', function() {
        document.getElementById('active-capture-btn')?.click();
    });
    GM_registerMenuCommand('⏱️ 触发手动获取', function() {
        document.getElementById('passive-capture-btn')?.click();
    });
    GM_registerMenuCommand('📋 查看已捕获的音频', showCapturedAudioList);
    GM_registerMenuCommand('🔗 合并下载音频', showMergeOptions);
    GM_registerMenuCommand('🤖 切换自动合并', function() {
        autoMergeEnabled = !autoMergeEnabled;
        GM_setValue('autoMergeEnabled', autoMergeEnabled);
        // 同步UI中的checkbox
        syncAutoMergeCheckbox();
        // 保持使用 updateStatus，不弹窗
        updateStatus(autoMergeEnabled ? '✅ 自动合并已启用' : '❌ 自动合并已禁用');
    });
    GM_registerMenuCommand('📍 重置面板位置', function() {
        const defaultPosition = { bottom: 20, right: 20 };
        panelPosition = defaultPosition;
        GM_setValue('panelPosition', defaultPosition);
        const panel = document.getElementById('audio-capture-panel');
        if (panel) {
            panel.remove();
        }
        createMainInterface();
        alert('✅ 面板位置已重置到右下角');
    });

    // 改进初始化，确保在各种情况下都能正确加载
    let isInitialized = false; // 添加初始化标记
    
    function initialize() {
        if (isInitialized) {
            console.log('豆包音频捕获工具已经初始化，跳过重复初始化');
            return;
        }
        
        try {
            console.log('开始初始化豆包音频捕获工具...');
            console.log('当前document.readyState:', document.readyState);
            
            loadAudioData();
            
            // 根据当前页面加载状态决定如何初始化
            const initUI = () => {
                console.log('准备创建主界面...');
                try {
                    createMainInterface();
                    console.log('✓ 主界面创建成功');
                    
                    // 验证面板是否真的在DOM中
                    setTimeout(() => {
                        const panel = document.getElementById('audio-capture-panel');
                        if (panel) {
                            console.log('✓ 面板验证成功，面板存在于DOM中');
                            console.log('面板位置:', panel.getBoundingClientRect());
                            console.log('面板可见性:', window.getComputedStyle(panel).display);
                            console.log('面板z-index:', window.getComputedStyle(panel).zIndex);
                        } else {
                            console.error('✗ 面板验证失败，面板不存在于DOM中！');
                        }
                    }, 500);
                } catch (error) {
                    console.error('创建主界面时出错:', error);
                }
            };
            
            if (document.readyState === 'loading') {
                console.log('页面仍在加载中，等待DOMContentLoaded事件');
                document.addEventListener('DOMContentLoaded', () => {
                    console.log('DOMContentLoaded事件触发');
                    initUI();
                });
            } else {
                console.log('页面已加载完成，立即创建界面');
                // 延迟一小段时间，确保页面完全准备好
                setTimeout(initUI, 100);
            }
            
            isInitialized = true;
            console.log('豆包音频捕获工具初始化完成');
        } catch (error) {
            console.error('初始化失败:', error);
            isInitialized = false;
        }
    }

    // 启动初始化
    initialize();
})();