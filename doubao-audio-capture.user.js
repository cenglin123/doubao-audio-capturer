// ==UserScript==
// @name         网页音频捕获与合并
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  捕获豆包网页版中的音频数据，支持直接下载、合并下载多个音频
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
// @updateURL    https://github.com/[您的用户名]/[仓库名]/raw/main/doubao-audio-capture.user.js
// @downloadURL  https://github.com/[您的用户名]/[仓库名]/raw/main/doubao-audio-capture.user.js
// ==/UserScript==

(function() {
    'use strict';
    
    // 存储捕获的音频数据
    let capturedAudio = [];
    let isMonitoring = false;
    let originalXHR = unsafeWindow.XMLHttpRequest;
    let originalFetch = unsafeWindow.fetch;
    let observer = null;
    
    // 创建UI
    function createMainInterface() {
        // 检查是否已存在UI
        if (document.getElementById('audio-capture-panel')) {
            document.getElementById('audio-capture-panel').style.display = 'block';
            return;
        }
        
        const panel = document.createElement('div');
        panel.id = 'audio-capture-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 0 10px rgba(0,0,0,0.2);
            z-index: 9999;
            font-family: Arial, sans-serif;
            max-width: 350px;
        `;
        
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0;">豆包音频捕获工具</h3>
                <button id="close-tool" style="background: none; border: none; cursor: pointer;">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                <button id="monitor-toggle" style="padding: 8px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    ${isMonitoring ? '停止监控网络请求' : '开始监控网络请求'}
                </button>
                <button id="view-captured" style="padding: 8px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">
                    查看已捕获的音频 (<span id="audio-count">0</span>)
                </button>
                <button id="merge-download" style="padding: 8px; background: #0f9d58; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    合并并下载
                </button>
                <button id="direct-download" style="padding: 8px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">✳️从data URL直接解析并下载音频数据</button>
                <button id="process-base64" style="padding: 8px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">✳️处理Base64编码的音频数据</button>
            </div>
            <div id="status-area" style="margin-top: 10px; padding: 5px; font-size: 12px; color: #666;"></div>
        `;
        
        document.body.appendChild(panel);
        
        // 更新音频计数
        updateAudioCount();
        
        // 添加事件监听
        document.getElementById('close-tool').addEventListener('click', () => {
            panel.style.display = 'none';
        });
        
        document.getElementById('direct-download').addEventListener('click', downloadFromDataUrl);
        document.getElementById('process-base64').addEventListener('click', handleBase64FromRequest);
        document.getElementById('view-captured').addEventListener('click', showCapturedAudioList);
        document.getElementById('merge-download').addEventListener('click', showMergeOptions);
        
        // 监控网络请求按钮
        document.getElementById('monitor-toggle').addEventListener('click', () => {
            if (isMonitoring) {
                stopMonitoring();
                document.getElementById('monitor-toggle').textContent = '开始监控网络请求';
                document.getElementById('monitor-toggle').style.background = '#4285f4';
                updateStatus('已停止监控网络请求');
            } else {
                startMonitoring();
                document.getElementById('monitor-toggle').textContent = '停止监控网络请求';
                document.getElementById('monitor-toggle').style.background = '#db4437';
                updateStatus('正在监控网络请求...');
            }
        });
    }
    
    // 更新状态区域
    function updateStatus(message) {
        const statusArea = document.getElementById('status-area');
        if (statusArea) {
            statusArea.textContent = message;
        }
    }
    
    // 更新音频计数
    function updateAudioCount() {
        const countElement = document.getElementById('audio-count');
        if (countElement) {
            countElement.textContent = capturedAudio.length;
        }
    }
    
    // 开始监控网络请求
    function startMonitoring() {
        if (isMonitoring) return;
        isMonitoring = true;
        
        // 拦截XHR请求
        unsafeWindow.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            const originalSend = xhr.send;
            
            xhr.open = function() {
                this.method = arguments[0];
                this.url = arguments[1];
                return originalOpen.apply(this, arguments);
            };
            
            xhr.send = function() {
                this.addEventListener('load', function() {
                    try {
                        // 检查是否是音频相关内容
                        const contentType = this.getResponseHeader('Content-Type') || '';
                        const isAudio = contentType.includes('audio') || 
                                       contentType.includes('octet-stream') ||
                                       this.url.match(/\.(mp3|wav|ogg|aac|flac|m4a)($|\?)/i);
                        
                        if (isAudio || contentType.includes('octet-stream')) {
                            captureAudioFromResponse(this.response, contentType, this.url);
                        }
                    } catch (e) {
                        console.error('处理XHR请求时出错:', e);
                    }
                });
                
                return originalSend.apply(this, arguments);
            };
            
            return xhr;
        };
        
        // 拦截Fetch请求
        unsafeWindow.fetch = function() {
            const url = arguments[0] instanceof Request ? arguments[0].url : arguments[0];
            const method = arguments[0] instanceof Request ? arguments[0].method : 'GET';
            
            return originalFetch.apply(this, arguments).then(response => {
                try {
                    const contentType = response.headers.get('Content-Type') || '';
                    const isAudio = contentType.includes('audio') || 
                                   contentType.includes('octet-stream') ||
                                   url.match(/\.(mp3|wav|ogg|aac|flac|m4a)($|\?)/i);
                    
                    if (isAudio || contentType.includes('octet-stream')) {
                        // 克隆响应以不影响原始处理
                        response.clone().arrayBuffer().then(buffer => {
                            captureAudioFromResponse(buffer, contentType, url);
                        });
                    }
                } catch (e) {
                    console.error('处理Fetch请求时出错:', e);
                }
                
                return response;
            });
        };
        
        // 监控DOM变化以捕获新添加的媒体元素
        observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
                        node.addEventListener('play', () => {
                            if (node.src) {
                                captureAudioFromMediaElement(node);
                            }
                        });
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 监控现有的媒体元素
        document.querySelectorAll('audio, video').forEach(mediaElement => {
            mediaElement.addEventListener('play', () => {
                if (mediaElement.src) {
                    captureAudioFromMediaElement(mediaElement);
                }
            });
        });
        
        // 扫描页面中的data URLs
        scanPageForDataUrls();
    }
    
    // 停止监控
    function stopMonitoring() {
        if (!isMonitoring) return;
        isMonitoring = false;
        
        // 恢复原始的XHR和Fetch
        unsafeWindow.XMLHttpRequest = originalXHR;
        unsafeWindow.fetch = originalFetch;
        
        // 停止DOM观察
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }
    
    // 从响应捕获音频
    function captureAudioFromResponse(response, contentType, url) {
        // 检查是否已捕获
        if (capturedAudio.some(audio => audio.url === url)) {
            return;
        }
        
        const audioItem = {
            id: generateId(),
            source: 'network',
            url: url,
            contentType: contentType,
            timestamp: new Date().toISOString(),
            data: response,
            format: guessAudioFormat(contentType, url),
            size: response ? (response.byteLength || 0) : 0
        };
        
        capturedAudio.push(audioItem);
        updateAudioCount();
        saveAudioData();
        updateStatus(`捕获到新音频: ${getShortUrl(url)}`);
    }
    
    // 从媒体元素捕获音频
    function captureAudioFromMediaElement(mediaElement) {
        if (capturedAudio.some(audio => audio.url === mediaElement.src)) {
            return;
        }
        
        const audioItem = {
            id: generateId(),
            source: 'media',
            url: mediaElement.src,
            contentType: 'audio/media',
            timestamp: new Date().toISOString(),
            mediaElement: mediaElement,
            format: 'mp3',
            size: 'unknown'
        };
        
        capturedAudio.push(audioItem);
        updateAudioCount();
        saveAudioData();
        updateStatus(`捕获到媒体元素音频: ${getShortUrl(mediaElement.src)}`);
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
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            if (path.length > 20) {
                return path.substr(0, 17) + '...';
            }
            return path;
        } catch (e) {
            return url.substr(0, 20) + '...';
        }
    }
    
    // 猜测音频格式
    function guessAudioFormat(contentType, url) {
        if (contentType.includes('mpeg') || contentType.includes('mp3')) {
            return 'mp3';
        } else if (contentType.includes('wav')) {
            return 'wav';
        } else if (contentType.includes('ogg')) {
            return 'ogg';
        } else if (contentType.includes('aac')) {
            return 'aac';
        } else if (contentType.includes('flac')) {
            return 'flac';
        } else if (url) {
            // 从URL猜测
            if (url.match(/\.mp3($|\?)/i)) return 'mp3';
            if (url.match(/\.wav($|\?)/i)) return 'wav';
            if (url.match(/\.ogg($|\?)/i)) return 'ogg';
            if (url.match(/\.aac($|\?)/i)) return 'aac';
            if (url.match(/\.flac($|\?)/i)) return 'flac';
        }
        return 'mp3'; // 默认值
    }
    
    // 保存音频数据到GM存储
    function saveAudioData() {
        try {
            // 只保存必要的信息，不保存二进制数据
            const serializedData = capturedAudio.map(audio => {
                const { id, source, url, contentType, timestamp, format, size } = audio;
                return { id, source, url, contentType, timestamp, format, size };
            });
            
            GM_setValue('capturedAudioMeta', JSON.stringify(serializedData));
        } catch (e) {
            console.error('保存音频元数据时出错:', e);
        }
    }
    
    // 加载音频元数据
    function loadAudioData() {
        try {
            const data = GM_getValue('capturedAudioMeta');
            if (data) {
                capturedAudio = JSON.parse(data);
                updateAudioCount();
            }
        } catch (e) {
            console.error('加载音频元数据时出错:', e);
        }
    }
    
    // 扫描页面中的data URLs
    function scanPageForDataUrls() {
        const pageContent = document.documentElement.innerHTML;
        const dataUrlRegex = /data:(application\/octet-stream|audio\/[^;]+);base64,([A-Za-z0-9+/=]{100,})/g;
        
        let match;
        while ((match = dataUrlRegex.exec(pageContent)) !== null) {
            const mimeType = match[1];
            const base64Data = match[2];
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            
            if (!capturedAudio.some(audio => audio.url === dataUrl)) {
                // 验证是否为有效音频
                validateAudioDataUrl(dataUrl, () => {
                    captureDataUrl(dataUrl, mimeType);
                });
            }
        }
    }
    
    // 验证数据URL是否为有效音频
    function validateAudioDataUrl(dataUrl, callback) {
        const audio = new Audio();
        
        audio.onloadedmetadata = function() {
            // 数据加载成功，是有效音频
            if (audio.duration > 0) {
                callback();
            }
        };
        
        audio.onerror = function() {
            // 尝试作为二进制数据处理
            try {
                fetch(dataUrl)
                    .then(response => response.arrayBuffer())
                    .then(buffer => {
                        // 检查二进制标记
                        const isAudioData = checkAudioSignature(buffer);
                        if (isAudioData) {
                            callback();
                        }
                    });
            } catch (e) {
                // 忽略错误
            }
        };
        
        audio.src = dataUrl;
    }
    
    // 从data URL捕获音频
    function captureDataUrl(dataUrl, mimeType) {
        const audioItem = {
            id: generateId(),
            source: 'dataUrl',
            url: dataUrl,
            contentType: mimeType,
            timestamp: new Date().toISOString(),
            format: guessAudioFormat(mimeType, null),
            size: 'embedded'
        };
        
        capturedAudio.push(audioItem);
        updateAudioCount();
        saveAudioData();
        updateStatus('捕获到data URL音频');
    }
    
    // 检查二进制数据是否为音频
    function checkAudioSignature(buffer) {
        if (!buffer || buffer.byteLength < 8) return false;
        
        const view = new Uint8Array(buffer.slice(0, 16));
        const signatures = {
            // MP3 (ID3)
            'ID3': [0x49, 0x44, 0x33],
            // MP3 (no ID3)
            'MP3': [0xFF, 0xFB],
            // WAV
            'RIFF': [0x52, 0x49, 0x46, 0x46],
            // OGG
            'OGG': [0x4F, 0x67, 0x67, 0x53],
            // FLAC
            'FLAC': [0x66, 0x4C, 0x61, 0x43],
            // M4A/AAC
            'M4A': [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
            // FLV
            'FLV': [0x46, 0x4C, 0x56, 0x01]
        };
        
        for (const [format, sig] of Object.entries(signatures)) {
            let match = true;
            for (let i = 0; i < sig.length; i++) {
                if (view[i] !== sig[i]) {
                    match = false;
                    break;
                }
            }
            if (match) return true;
        }
        
        // 检查字符串标记
        try {
            const textDecoder = new TextDecoder('utf-8');
            const text = textDecoder.decode(new Uint8Array(buffer.slice(0, 100)));
            return text.includes('Lavf') || text.includes('matroska') || text.includes('webm');
        } catch (e) {
            return false;
        }
    }
    
    // 从data URL直接下载
    function downloadFromDataUrl() {
        const audioDataUrl = prompt(
            "请粘贴data:application/octet-stream;base64,开头的URL:",
            ""
        );
        
        if (!audioDataUrl || !audioDataUrl.startsWith('data:')) {
            alert('请提供有效的data URL');
            return;
        }
        
        try {
            // 创建下载链接
            const a = document.createElement('a');
            a.href = audioDataUrl;
            a.download = `captured_audio_${Date.now()}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            updateStatus('音频下载已启动');
            
            // 加入捕获列表
            const mimeType = audioDataUrl.split(';')[0].split(':')[1];
            captureDataUrl(audioDataUrl, mimeType);
        } catch (error) {
            console.error('下载失败:', error);
            alert('下载失败: ' + error.message);
        }
    }
    
    // 处理base64编码的音频数据
    function handleBase64FromRequest() {
        const modal = createModal('处理Base64数据');
        
        const content = document.createElement('div');
        content.innerHTML = `
            <textarea id="base64-input" placeholder="在此粘贴base64编码的音频数据" 
                      style="width: 100%; height: 150px; padding: 8px; margin-bottom: 10px; font-family: monospace;"></textarea>
            <div style="margin-bottom: 10px;">
                <label for="format-select">保存格式:</label>
                <select id="format-select" style="padding: 5px;">
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                    <option value="ogg">OGG</option>
                    <option value="flac">FLAC</option>
                </select>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="cancel-base64" style="padding: 8px 15px;">取消</button>
                <button id="process-base64-btn" style="padding: 8px 15px; background: #4285f4; color: white; border: none;">处理并下载</button>
            </div>
        `;
        
        modal.appendChild(content);
        
        document.getElementById('cancel-base64').addEventListener('click', () => {
            closeModal(modal);
        });
        
        document.getElementById('process-base64-btn').addEventListener('click', () => {
            const base64Data = document.getElementById('base64-input').value.trim();
            if (!base64Data) {
                alert('请输入base64数据');
                return;
            }
            
            // 移除可能的前缀
            let cleanBase64 = base64Data;
            if (cleanBase64.includes('base64,')) {
                cleanBase64 = cleanBase64.split('base64,')[1];
            }
            
            try {
                // 检查是否为有效base64
                atob(cleanBase64.substring(0, 10));
                
                const format = document.getElementById('format-select').value;
                const mimeTypes = {
                    'mp3': 'audio/mpeg',
                    'wav': 'audio/wav',
                    'ogg': 'audio/ogg',
                    'flac': 'audio/flac'
                };
                
                // 创建完整的data URL
                const dataUrl = `data:${mimeTypes[format] || 'application/octet-stream'};base64,${cleanBase64}`;
                
                // 下载文件
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `audio_capture_${Date.now()}.${format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                // 加入捕获列表
                captureDataUrl(dataUrl, mimeTypes[format]);
                
                closeModal(modal);
                updateStatus('音频处理并下载成功');
            } catch (e) {
                alert('无效的base64数据: ' + e.message);
            }
        });
    }
    
    // 显示已捕获的音频列表
    // 在 showCapturedAudioList 函数中，修改创建模态框的部分
    function showCapturedAudioList() {
        if (capturedAudio.length === 0) {
            alert('尚未捕获任何音频');
            return;
        }
        
        const modal = createModal('已捕获的音频列表');
        
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="margin-bottom: 10px;">
                <input type="text" id="search-audio" placeholder="搜索音频..." 
                    style="width: 100%; padding: 8px; margin-bottom: 10px;">
                <button id="clear-all" style="padding: 5px 10px; background: #db4437; color: white; border: none; float: right;">
                    清空列表
                </button>
                <button id="close-audio-list" style="padding: 5px 10px; background: #f0f0f0; border: 1px solid #ccc; float: right; margin-right: 10px;">
                    关闭
                </button>
            </div>
            <div id="audio-list-container" style="max-height: 400px; overflow-y: auto; margin-top: 40px;"></div>
        `;
        
        modal.appendChild(content);
        
        // 添加关闭按钮事件
        document.getElementById('close-audio-list').addEventListener('click', () => {
            closeModal(modal);
        });
        
        // 显示音频列表
        renderAudioList();
        
        // 搜索功能
        document.getElementById('search-audio').addEventListener('input', function() {
            renderAudioList(this.value);
        });
        
        // 清空列表
        document.getElementById('clear-all').addEventListener('click', function() {
            if (confirm('确定要清空所有已捕获的音频吗？')) {
                capturedAudio = [];
                updateAudioCount();
                saveAudioData();
                closeModal(modal);
                updateStatus('已清空音频列表');
            }
        });
        
        // 渲染音频列表
        function renderAudioList(searchTerm = '') {
            const container = document.getElementById('audio-list-container');
            container.innerHTML = '';
            
            const filteredAudio = searchTerm ? 
                capturedAudio.filter(audio => 
                    audio.url.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    audio.format.toLowerCase().includes(searchTerm.toLowerCase())
                ) : 
                capturedAudio;
            
            if (filteredAudio.length === 0) {
                container.innerHTML = '<p>没有匹配的音频</p>';
                return;
            }
            
            filteredAudio.forEach((audio, index) => {
                const item = document.createElement('div');
                item.style.cssText = `
                    border-bottom: 1px solid #eee;
                    padding: 10px;
                    margin-bottom: 5px;
                `;
                
                const date = new Date(audio.timestamp).toLocaleString();
                const size = typeof audio.size === 'number' ? 
                    (audio.size / 1024).toFixed(2) + ' KB' : 
                    audio.size;
                
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <div>
                            <strong>#${index + 1}</strong> - ${audio.format.toUpperCase()}
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            ${date}
                        </div>
                    </div>
                    <div title="${audio.url}" style="font-size: 12px; word-break: break-all; margin: 5px 0;">
                        ${getShortUrl(audio.url)}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        来源: ${audio.source} | 大小: ${size}
                    </div>
                    <div style="display: flex; gap: 5px; margin-top: 5px;">
                        <input type="checkbox" class="audio-select" data-id="${audio.id}" style="margin-right: 5px;">
                        <button class="download-btn" data-id="${audio.id}">下载</button>
                        <button class="play-btn" data-id="${audio.id}">播放</button>
                        <button class="remove-btn" data-id="${audio.id}">删除</button>
                    </div>
                `;
                
                container.appendChild(item);
            });
            
            // 绑定按钮事件
            document.querySelectorAll('.download-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    downloadAudio(id);
                });
            });
            
            document.querySelectorAll('.play-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    playAudio(id);
                });
            });
            
            document.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    removeAudio(id);
                    renderAudioList(searchTerm);
                });
            });
        }
        
        // 下载音频
        function downloadAudio(id) {
            const audio = capturedAudio.find(a => a.id === id);
            if (!audio) return;
            
            if (audio.source === 'dataUrl') {
                // 直接下载data URL
                const a = document.createElement('a');
                a.href = audio.url;
                a.download = `audio_${Date.now()}.${audio.format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else if (audio.url) {
                // 下载URL
                GM_download({
                    url: audio.url,
                    name: `audio_${Date.now()}.${audio.format}`,
                    onload: () => updateStatus('下载完成'),
                    onerror: (e) => {
                        console.error('下载失败:', e);
                        updateStatus('下载失败');
                    }
                });
            }
        }
        
        // 播放音频
        function playAudio(id) {
            const audio = capturedAudio.find(a => a.id === id);
            if (!audio) return;
            
            if (audio.source === 'dataUrl') {
                const audioElement = new Audio(audio.url);
                audioElement.play();
            } else if (audio.mediaElement) {
                audio.mediaElement.play();
            } else if (audio.url) {
                const audioElement = new Audio(audio.url);
                audioElement.play();
            }
        }
        
        // 删除音频
        function removeAudio(id) {
            const index = capturedAudio.findIndex(a => a.id === id);
            if (index !== -1) {
                capturedAudio.splice(index, 1);
                updateAudioCount();
                saveAudioData();
                updateStatus('已删除音频');
            }
        }
    }
    
    // 显示合并选项
    function showMergeOptions() {
        if (capturedAudio.length === 0) {
            alert('尚未捕获任何音频');
            return;
        }
        
        const modal = createModal('合并下载音频');
        
        const content = document.createElement('div');
        content.innerHTML = `
            <p>当前有 ${capturedAudio.length} 个已捕获的音频，您可以选择要合并的音频范围：</p>
            <div style="margin: 15px 0;">
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
                    <label for="merge-range" style="min-width: 60px;">合并范围:</label>
                    <input type="text" id="merge-range" placeholder="例如: 1-5,7,9-12" style="flex: 1; padding: 6px;">
                    <button id="select-all-btn" style="padding: 6px 10px;">全选</button>
                </div>
                <div style="margin-bottom: 10px;">
                    <label for="merge-format">输出格式:</label>
                    <select id="merge-format" style="padding: 6px; margin-left: 10px;">
                        <option value="mp3">MP3</option>
                        <option value="wav">WAV</option>
                    </select>
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    * 范围格式: 单个数字(如5)、范围(如1-5)或组合(如1-3,5,7-9)
                </div>
            </div>
            
            <div style="max-height: 300px; overflow-y: auto; margin: 15px 0; border: 1px solid #eee; padding: 10px;">
                <h4 style="margin-top: 0;">可选择的音频列表:</h4>
                <div id="merge-audio-list"></div>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="cancel-merge" style="padding: 8px 15px;">取消</button>
                <button id="start-merge" style="padding: 8px 15px; background: #0f9d58; color: white; border: none;">开始合并</button>
            </div>
        `;
        
        modal.appendChild(content);
        
        // 显示音频列表
        const audioListContainer = document.getElementById('merge-audio-list');
        capturedAudio.forEach((audio, index) => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                align-items: center;
                padding: 5px 0;
                border-bottom: 1px solid #f0f0f0;
            `;
            
            item.innerHTML = `
                <input type="checkbox" class="merge-select" data-index="${index}" id="merge-item-${index}" style="margin-right: 10px;">
                <label for="merge-item-${index}" style="flex: 1; cursor: pointer;">
                    <strong>#${index + 1}</strong> - ${audio.format.toUpperCase()} 
                    <span style="font-size: 12px; color: #666;">(${getShortUrl(audio.url)})</span>
                </label>
            `;
            
            audioListContainer.appendChild(item);
        });
        
        // 取消按钮
        document.getElementById('cancel-merge').addEventListener('click', () => {
            closeModal(modal);
        });
        
        // 全选按钮
        document.getElementById('select-all-btn').addEventListener('click', () => {
            document.getElementById('merge-range').value = `1-${capturedAudio.length}`;
            document.querySelectorAll('.merge-select').forEach(checkbox => {
                checkbox.checked = true;
            });
        });
        
        // 范围输入框事件
        document.getElementById('merge-range').addEventListener('input', function() {
            const range = this.value.trim();
            if (!range) {
                document.querySelectorAll('.merge-select').forEach(checkbox => {
                    checkbox.checked = false;
                });
                return;
            }
            
            // 解析范围
            const indices = parseRangeString(range, capturedAudio.length);
            
            // 更新复选框
            document.querySelectorAll('.merge-select').forEach(checkbox => {
                const index = parseInt(checkbox.getAttribute('data-index'));
                checkbox.checked = indices.includes(index);
            });
        });
        
        // 复选框变化时更新范围
        document.querySelectorAll('.merge-select').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                // 获取所有选中的索引
                const selectedIndices = [];
                document.querySelectorAll('.merge-select:checked').forEach(cb => {
                    selectedIndices.push(parseInt(cb.getAttribute('data-index')));
                });
                
                // 生成范围字符串
                document.getElementById('merge-range').value = generateRangeString(selectedIndices);
            });
        });
        
        // 开始合并按钮
        document.getElementById('start-merge').addEventListener('click', () => {
            const range = document.getElementById('merge-range').value.trim();
            if (!range) {
                alert('请选择要合并的音频范围');
                return;
            }
            
            const indices = parseRangeString(range, capturedAudio.length);
            if (indices.length === 0) {
                alert('未选择任何有效的音频');
                return;
            }
            
            const format = document.getElementById('merge-format').value;
            
            // 开始合并
            mergeAudio(indices, format);
            closeModal(modal);
        });
    }
    
    // 解析范围字符串，例如 "1-3,5,7-9"
    function parseRangeString(rangeStr, maxValue) {
        const result = [];
        const parts = rangeStr.split(',');
        
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            
            if (trimmed.includes('-')) {
                // 范围
                const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
                // 转换为0-based索引
                const startIndex = Math.max(0, start - 1);
                const endIndex = Math.min(maxValue - 1, end - 1);
                
                if (!isNaN(startIndex) && !isNaN(endIndex) && startIndex <= endIndex) {
                    for (let i = startIndex; i <= endIndex; i++) {
                        if (!result.includes(i)) result.push(i);
                    }
                }
            } else {
                // 单个数字
                const index = parseInt(trimmed) - 1; // 转换为0-based索引
                if (!isNaN(index) && index >= 0 && index < maxValue && !result.includes(index)) {
                    result.push(index);
                }
            }
        }
        
        return result.sort((a, b) => a - b);
    }
    
    // 生成范围字符串
    function generateRangeString(indices) {
        if (indices.length === 0) return '';
        
        // 排序
        indices.sort((a, b) => a - b);
        
        const ranges = [];
        let start = indices[0];
        let end = start;
        
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === end + 1) {
                end = indices[i];
            } else {
                // 结束当前范围
                if (start === end) {
                    ranges.push((start + 1).toString()); // 转换为1-based显示
                } else {
                    ranges.push(`${start + 1}-${end + 1}`); // 转换为1-based显示
                }
                
                // 开始新范围
                start = end = indices[i];
            }
        }
        
        // 添加最后一个范围
        if (start === end) {
            ranges.push((start + 1).toString()); // 转换为1-based显示
        } else {
            ranges.push(`${start + 1}-${end + 1}`); // 转换为1-based显示
        }
        
        return ranges.join(',');
    }
    
    // 合并音频
    function mergeAudio(indices, format) {
        // 检查索引
        if (indices.length === 0) {
            alert('未选择任何音频');
            return;
        }
        
        // 创建进度模态框
        const modal = createModal('音频合并进度');
        
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <div id="merge-progress-text">准备合并 ${indices.length} 个音频文件...</div>
                <div style="margin: 15px 0; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
                    <div id="merge-progress-bar" style="width: 0%; height: 20px; background: #0f9d58;"></div>
                </div>
                <div id="merge-status">正在初始化...</div>
            </div>
        `;
        
        modal.appendChild(content);
        
        // 开始合并流程
        setTimeout(() => {
            startMergeProcess(indices, format, modal);
        }, 500);
    }
    
    // 开始合并流程
    async function startMergeProcess(indices, format, modal) {
        try {
            updateMergeProgress(5, '开始下载音频数据...');
            
            // 准备音频数据
            const audioBuffers = [];
            let currentIndex = 0;
            
            for (const index of indices) {
                currentIndex++;
                const progress = 5 + Math.floor((currentIndex / indices.length) * 50);
                updateMergeProgress(progress, `正在处理第 ${currentIndex}/${indices.length} 个音频...`);
                
                const audio = capturedAudio[index];
                if (!audio) continue;
                
                try {
                    const buffer = await getAudioBuffer(audio);
                    if (buffer) {
                        // 如果是MP3格式且需要合并为MP3，直接添加
                        if (format === 'mp3' && (audio.format === 'mp3' || isValidMp3(buffer))) {
                            audioBuffers.push(buffer);
                        } else {
                            // 如果需要转换格式，仍需添加
                            audioBuffers.push(buffer);
                        }
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
            
            // 合并音频
            const mergedAudio = await mergeAudioBuffers(audioBuffers, format);
            updateMergeProgress(90, '合并完成，准备下载...');
            
            // 下载合并后的文件
            const fileName = `merged_audio_${Date.now()}.${format}`;
            const blob = new Blob([mergedAudio], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            updateMergeProgress(100, '合并完成，已开始下载！');
            updateStatus(`已成功合并 ${audioBuffers.length} 个音频文件并下载`);
            
            // 3秒后关闭窗口
            setTimeout(() => closeModal(modal), 3000);
        } catch (error) {
            console.error('合并音频过程中出错:', error);
            updateMergeStatus(`合并失败: ${error.message}`);
        }
    }
    
    // 获取音频的ArrayBuffer数据
    // 处理base64编码的音频数据
    async function getAudioBuffer(audio) {
        return new Promise(async (resolve, reject) => {
            try {
                if (audio.data instanceof ArrayBuffer) {
                    // 已经有ArrayBuffer数据
                    resolve(audio.data);
                } else if (audio.source === 'dataUrl') {
                    // 如果是data URL，先检查是否为base64编码的MP3
                    if (audio.url.startsWith('data:application/octet-stream;base64,') || 
                        audio.url.startsWith('data:audio/mpeg;base64,')) {
                        // 直接从data URL获取二进制数据
                        const base64Data = audio.url.split('base64,')[1];
                        const binaryString = atob(base64Data);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        resolve(bytes.buffer);
                    } else {
                        // 其他类型的data URL
                        fetch(audio.url)
                            .then(response => response.arrayBuffer())
                            .then(buffer => resolve(buffer))
                            .catch(reject);
                    }
                } else if (audio.url) {
                    // 从URL获取
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: audio.url,
                        responseType: 'arraybuffer',
                        onload: function(response) {
                            resolve(response.response);
                        },
                        onerror: function(error) {
                            reject(new Error('无法下载音频: ' + error));
                        }
                    });
                } else {
                    reject(new Error('无法获取音频数据'));
                }
            } catch (e) {
                reject(e);
            }
        });
    }
    
    // 合并音频缓冲区
    // 直接合并MP3文件
    async function mergeAudioBuffers(audioBuffers, format) {
        return new Promise(async (resolve, reject) => {
            try {
                // 如果选择的格式不是MP3，仍使用旧方法
                if (format !== 'mp3') {
                    updateMergeStatus('非MP3格式仍需要完整处理，可能需要较长时间...');
                    // 使用之前的方法处理
                    // ...原来的mergeAudioBuffers代码...
                    return;
                }
                
                updateMergeStatus('正在直接合并MP3文件...');
                
                // 检查每个文件的MP3头，确保是有效的MP3
                const validMp3Buffers = [];
                for (let i = 0; i < audioBuffers.length; i++) {
                    const buffer = audioBuffers[i];
                    // 简单检查是否为MP3文件
                    if (isValidMp3(buffer)) {
                        validMp3Buffers.push(buffer);
                    } else {
                        console.warn(`跳过第${i+1}个非MP3格式文件`);
                    }
                    
                    updateMergeProgress(60 + Math.floor((i / audioBuffers.length) * 30), 
                        `正在处理第 ${i + 1}/${audioBuffers.length} 个文件...`);
                }
                
                if (validMp3Buffers.length === 0) {
                    reject(new Error('没有有效的MP3文件可以合并'));
                    return;
                }
                
                updateMergeStatus(`正在合并 ${validMp3Buffers.length} 个MP3文件...`);
                
                // 直接拼接MP3文件内容
                const totalLength = validMp3Buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
                const mergedMp3 = new Uint8Array(totalLength);
                
                let offset = 0;
                for (const buffer of validMp3Buffers) {
                    const data = new Uint8Array(buffer);
                    mergedMp3.set(data, offset);
                    offset += buffer.byteLength;
                    
                    updateMergeProgress(90, `已合并 ${offset} / ${totalLength} 字节...`);
                }
                
                updateMergeProgress(95, '合并完成，准备下载...');
                resolve(mergedMp3.buffer);
                
            } catch (e) {
                reject(e);
            }
        });
    }

    // 简单检查是否为有效的MP3文件
    function isValidMp3(buffer) {
        if (!buffer || buffer.byteLength < 3) return false;
        
        const view = new Uint8Array(buffer);
        
        // 检查ID3v2标记
        if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
            return true;
        }
        
        // 检查MP3帧头标记 (通常以0xFF开头)
        for (let i = 0; i < Math.min(100, view.length); i++) {
            if (view[i] === 0xFF && (view[i+1] & 0xE0) === 0xE0) {
                return true;
            }
        }
        
        return false;
    }
    
    // 编码为MP3
    // 优化的MP3编码
    function encodeOptimizedMp3(audioBuffer, sampleRate, callback) {
        const channels = audioBuffer.numberOfChannels;
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
        
        // 获取音频样本，一次性处理以减少循环次数
        const samples = getInterleavedSamples(audioBuffer);
        const mp3Data = [];
        
        // 使用更大的块大小，减少处理次数
        const chunkSize = 1152 * 10; // 增加批量处理量
        
        // 创建工作器函数用于批处理
        const processChunks = (startIndex) => {
            let endTime = Date.now() + 50; // 每50ms让出主线程
            let currentIndex = startIndex;
            
            while (currentIndex < samples.length && Date.now() < endTime) {
                const end = Math.min(currentIndex + chunkSize, samples.length);
                const chunk = samples.subarray(currentIndex, end);
                const mp3buf = mp3encoder.encodeBuffer(chunk);
                
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
                
                currentIndex = end;
                
                // 仅在处理一定量数据后更新进度，减少DOM操作
                if (currentIndex % (chunkSize * 10) === 0) {
                    const progress = 80 + Math.floor((currentIndex / samples.length) * 10);
                    updateMergeProgress(progress, `正在编码MP3: ${Math.floor(currentIndex / samples.length * 100)}%...`);
                }
            }
            
            // 所有数据处理完毕或时间片用完
            if (currentIndex < samples.length) {
                // 还有数据要处理，安排下一个时间片
                setTimeout(() => processChunks(currentIndex), 0);
            } else {
                // 所有数据处理完毕，结束编码
                finishEncoding();
            }
        };
        
        // 完成编码
        const finishEncoding = () => {
            const end = mp3encoder.flush();
            if (end.length > 0) {
                mp3Data.push(end);
            }
            
            // 合并所有数据
            const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
            const mp3Array = new Uint8Array(totalLength);
            let offset = 0;
            
            for (const buf of mp3Data) {
                mp3Array.set(buf, offset);
                offset += buf.length;
            }
            
            callback(mp3Array.buffer);
        };
        
        // 开始处理
        processChunks(0);
    }

    // 优化的交错样本获取(用于MP3编码)
    function getInterleavedSamples(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length * channels;
        const result = new Int16Array(length);
        
        // 预先获取所有通道数据，避免反复调用getChannelData
        const channelsData = [];
        for (let channel = 0; channel < channels; channel++) {
            channelsData.push(audioBuffer.getChannelData(channel));
        }
        
        // 块处理，减少循环次数
        const blockSize = 8192;
        for (let blockStart = 0; blockStart < audioBuffer.length; blockStart += blockSize) {
            const blockEnd = Math.min(blockStart + blockSize, audioBuffer.length);
            
            for (let i = blockStart; i < blockEnd; i++) {
                for (let channel = 0; channel < channels; channel++) {
                    const sample = Math.max(-1, Math.min(1, channelsData[channel][i]));
                    result[i * channels + channel] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                }
            }
        }
        
        return result;
    }

    // 编码为WAV
    // 优化的WAV编码
    function encodeOptimizedWAV(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1; // PCM格式
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const bytesPerSecond = sampleRate * blockAlign;
        
        // 一次性获取所有样本数据
        const samplesData = getWavSamples(audioBuffer);
        
        const buffer = new ArrayBuffer(44 + samplesData.length);
        const view = new DataView(buffer);
        
        // WAV头
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samplesData.length, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, bytesPerSecond, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, samplesData.length, true);
        
        // 写入样本数据
        const uint8 = new Uint8Array(buffer);
        uint8.set(samplesData, 44);
        
        return buffer;
    }

    // 优化的WAV样本获取
    function getWavSamples(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const samples = new Uint8Array(length * numChannels * 2);
        let offset = 0;
        
        // 预先获取所有通道数据
        const channelsData = [];
        for (let channel = 0; channel < numChannels; channel++) {
            channelsData.push(audioBuffer.getChannelData(channel));
        }
        
        // 批量处理样本
        const processBlock = 10000;
        
        for (let blockStart = 0; blockStart < length; blockStart += processBlock) {
            const blockEnd = Math.min(blockStart + processBlock, length);
            
            for (let i = blockStart; i < blockEnd; i++) {
                for (let channel = 0; channel < numChannels; channel++) {
                    const sample = Math.max(-1, Math.min(1, channelsData[channel][i]));
                    const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                    samples[offset++] = value & 0xFF;
                    samples[offset++] = (value >> 8) & 0xFF;
                }
            }
            
            // 只在每个块完成后更新进度
            const progress = 80 + Math.floor((blockEnd / length) * 10);
            updateMergeProgress(progress, `正在编码WAV: ${Math.floor(blockEnd / length * 100)}%...`);
        }
        
        return samples;
    }
    
    // 辅助函数：写入字符串到DataView
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    
    // 更新合并进度
    function updateMergeProgress(percent, message) {
        const progressBar = document.getElementById('merge-progress-bar');
        const progressText = document.getElementById('merge-progress-text');
        
        if (progressBar && progressText) {
            progressBar.style.width = `${percent}%`;
            progressText.textContent = message || `进度: ${percent}%`;
        }
    }
    
    // 更新合并状态
    function updateMergeStatus(message) {
        const statusElement = document.getElementById('merge-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
    
    // 辅助函数：创建模态框
    function createModal(title) {
        // 检查是否已存在模态框
        const existingModal = document.querySelector('.audio-capture-modal-backdrop');
        if (existingModal && document.body.contains(existingModal)) {
            document.body.removeChild(existingModal);
        }
        
        // 创建背景
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'audio-capture-modal-backdrop';
        modalBackdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'audio-capture-modal';
        modal.style.cssText = `
            background: white;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
            width: 80%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 10001;
            padding: 20px;
        `;
        
        // 标题
        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        titleElement.style.cssText = `
            margin-top: 0;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        `;
        
        // 添加到DOM
        modal.appendChild(titleElement);
        modalBackdrop.appendChild(modal);
        document.body.appendChild(modalBackdrop);
        
        return modal;
    }
    
    // 关闭模态框
    // 修改 closeModal 函数
    function closeModal(modal) {
        try {
            const backdrop = modal.parentElement;
            if (backdrop && document.body.contains(backdrop)) {
                document.body.removeChild(backdrop);
            }
        } catch (e) {
            console.error('关闭模态框时出错:', e);
            // 备用方案：查找并移除所有模态框背景
            document.querySelectorAll('.audio-capture-modal-backdrop').forEach(element => {
                if (document.body.contains(element)) {
                    document.body.removeChild(element);
                }
            });
        }
    }
    
    // 注册GM菜单
    GM_registerMenuCommand('打开豆包音频捕获工具', createMainInterface);
    GM_registerMenuCommand('开始/停止监控', function() {
        if (isMonitoring) {
            stopMonitoring();
            updateStatus('已停止监控网络请求');
        } else {
            startMonitoring();
            updateStatus('正在监控网络请求...');
        }
    });
    GM_registerMenuCommand('查看已捕获的音频', showCapturedAudioList);
    GM_registerMenuCommand('合并下载音频', showMergeOptions);
    
    // 加载保存的音频元数据
    loadAudioData();
    
    // 自动创建UI
    window.addEventListener('load', function() {
        setTimeout(createMainInterface, 1000);
    });
})();