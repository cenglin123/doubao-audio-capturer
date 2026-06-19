## Round 1 attempt · issue 1 (Blob URL leak)
- source: converge_loop
- reviewer_backend: claude-code (general-purpose agent)
- Issue: Blob URL memory leak in setupWebAudioHooks(). Every Web Audio capture creates URL.createObjectURL() but these URLs are never revoked. removeAudio() and clear-all path do not revoke blob URLs before discarding items.
- Issue 归因（reviewer 判定）: executor_limit
- plan_amendment_required: true
- Approach: Added revokeAudioBlobUrl() helper that checks for blob: URL prefix and calls URL.revokeObjectURL(). Called this helper in removeAudio() before splicing, and in all 4 clear-all paths (main panel x2, management window clear-all, auto-clear after merge). Added comment in saveAudioData() noting blob URLs are non-serializable and lost across page reloads.
- Diff: |
  - Added revokeAudioBlobUrl() helper function after isWasmBinary() (lines ~1461-1469)
  - removeAudio(): added revokeAudioBlobUrl(capturedAudio[index]) before splice
  - Main panel clear-all (both occurrences): added capturedAudio.forEach(item => revokeAudioBlobUrl(item)) before capturedAudio = []
  - Management window clear-all: same forEach+revoke pattern
  - Auto-clear after merge in startMergeProcess(): same forEach+revoke pattern
  - saveAudioData(): added comment block explaining blob URL non-serialization
- R1 verdict: fixed

## Round 1 attempt · issue 2 (Incomplete WASM defense)
- source: converge_loop
- reviewer_backend: claude-code (general-purpose agent)
- Issue: Incomplete WASM defense coverage. captureAudioFromMediaElement() and scanNodeForDataUrls() lack isWasmBinary() checks.
- Issue 归因（reviewer 判定）: executor_limit
- plan_amendment_required: true
- Approach: Added URL pattern warning in captureAudioFromMediaElement() for non-blob/non-data URLs without known audio extensions; added isWasmBinary() check in validateAudioDataUrl() fallback fetch path to reject WASM data before calling callback(); added documentation comment explaining WASM filtering is deferred to getAudioBuffer() -> isValidMp3() for blob URLs.
- Diff: |
  - captureAudioFromMediaElement(): added JSDoc comment explaining blob URL deferral to isValidMp3(); added console.warn for URLs without recognizable audio file extensions
  - validateAudioDataUrl(): added isWasmBinary(buffer) check in the fetch->arrayBuffer->checkAudioSignature fallback path; logs and skips WASM data without calling callback()
- R1 verdict: fixed

## Round 1 attempt · issue 3 (Race condition)
- source: converge_loop
- reviewer_backend: claude-code (general-purpose agent)
- Issue: Race condition: setupWebAudioHooks() installs decodeAudioData hooks after XHR/Fetch interceptors. Audio decoded between page load and hook installation is missed.
- Issue 归因（reviewer 判定）: executor_limit
- plan_amendment_required: false
- Approach: Moved setupWebAudioHooks() call from startMonitoring() to initialize() so the decodeAudioData hook is permanently installed from script load. Hook body already checks isMonitoring before capturing. Removed restoreWebAudioHooks() call from stopMonitoring(); added comment to restoreWebAudioHooks() noting it is retained for future cleanup scenarios.
- Diff: |
  - initialize(): added setupWebAudioHooks() call after loadAudioData(), with comment explaining early-install strategy
  - startMonitoring(): removed setupWebAudioHooks() call (was at end of function)
  - stopMonitoring(): removed restoreWebAudioHooks() call; replaced with comment explaining hook is now permanent
  - restoreWebAudioHooks(): added comment "保留以备将来的清理场景使用" noting hook is permanently installed
- R1 verdict: fixed
