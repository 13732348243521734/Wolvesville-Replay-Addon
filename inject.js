(function() {
    console.log("%cWolvesville Helper & CSP-Bypass Loaded", "color: #00ff00; font-size: 16px; font-weight: bold;");

    // --- Native Backups ---
    const originalNow = Date.now;
    const originalPerformanceNow = performance.now.bind(performance);
    const OriginalDate = window.Date;
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;

    // --- Live Logging Infrastructure ---
    let logContainer = null;
    let isInternalLogging = false;

    function addLiveLog(level, msg, category = 'Addon') {
        if (!logContainer) {
            logContainer = document.getElementById('wv-live-logs');
            if (!logContainer) return;
        }

        const div = document.createElement('div');
        div.dataset.level = level.toLowerCase();
        div.style.whiteSpace = 'nowrap';
        div.style.flexShrink = '0';
        div.style.width = 'fit-content';
        div.style.minWidth = '100%';

        const colors = { 'info': '#2196f3', 'warn': '#ff9800', 'error': '#f44336', 'debug': '#9c27b0' };
        const color = colors[level.toLowerCase()] || '#ccc';

        const time = new OriginalDate().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        div.innerHTML = `<span style="color:#666;">[${time}]</span> <span style="color:#888; font-weight:700;">[${category}]</span> <span style="color:${color}; font-weight:700;">${level.toUpperCase()}:</span> <span style="color:#eee;">${msg}</span>`;

        const currentFilter = window._wv_current_filter ? window._wv_current_filter.value : 'all';
        if (currentFilter !== 'all' && div.dataset.level !== currentFilter) {
            div.style.display = 'none';
        }

        logContainer.appendChild(div);
        if (logContainer.childNodes.length > 200) logContainer.removeChild(logContainer.firstChild);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function showModal(title, message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'wv-modal-overlay';
            overlay.innerHTML = `
                <div class="wv-modal">
                    <div class="wv-modal-header">${title}</div>
                    <div class="wv-modal-body">${message}</div>
                    <div class="wv-modal-actions">
                        <button class="wv-btn btn-modal-close">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('.btn-modal-close').onclick = () => {
                overlay.remove();
                resolve();
            };
        });
    }

    function showConfirm(title, message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'wv-modal-overlay';
            overlay.innerHTML = `
                <div class="wv-modal">
                    <div class="wv-modal-header">${title}</div>
                    <div class="wv-modal-body">${message}</div>
                    <div class="wv-modal-actions">
                        <button class="wv-btn btn-modal-no" style="background:#666;">No</button>
                        <button class="wv-btn danger btn-modal-yes">Yes, Delete</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('.btn-modal-no').onclick = () => {
                overlay.remove();
                resolve(false);
            };
            overlay.querySelector('.btn-modal-yes').onclick = () => {
                overlay.remove();
                resolve(true);
            };
        });
    }

    function initLogging() {
        logContainer = document.getElementById('wv-live-logs');
        const customFilter = document.getElementById('wv-log-filter-custom');
        const filterOptions = document.getElementById('wv-log-filter-options');
        const filterLabel = document.getElementById('wv-log-filter-label');
        const clearLogsBtn = document.getElementById('btn-clear-logs');

        if (clearLogsBtn) clearLogsBtn.onclick = () => { if (logContainer) logContainer.innerHTML = ''; };

        if (customFilter) {
            customFilter.onclick = (e) => {
                e.stopPropagation();
                filterOptions.classList.toggle('show');
            };

            filterOptions.querySelectorAll('.wv-select-option').forEach(opt => {
                opt.onclick = (e) => {
                    e.stopPropagation();
                    const val = opt.dataset.value;
                    filterLabel.innerText = opt.innerText;
                    filterOptions.classList.remove('show');

                    const logs = logContainer.querySelectorAll('div');
                    logs.forEach(l => {
                        if (val === 'all' || l.dataset.level === val) l.style.display = 'block';
                        else l.style.display = 'none';
                    });

                    if (!window._wv_current_filter) window._wv_current_filter = {};
                    window._wv_current_filter.value = val;
                };
            });

            document.addEventListener('click', () => filterOptions.classList.remove('show'));
        }
    }

    const logToServer = (level, ...args) => {
        if (isInternalLogging) return;
        isInternalLogging = true;
        try {
            const message = args.map(a => {
                try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                catch(e) { return "[Circular or Unserializable]"; }
            }).join(" ");
            window.postMessage({ type: "WV_LIVE_LOG", level, message }, "*");
            addLiveLog(level, message);
        } finally {
            isInternalLogging = false;
        }
    };

    const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console)
    };

    console.log = (...args) => { originalConsole.log(...args); logToServer("info", ...args); };
    console.warn = (...args) => { originalConsole.warn(...args); logToServer("warn", ...args); };
    console.error = (...args) => { originalConsole.error(...args); logToServer("error", ...args); };
    console.debug = (...args) => { originalConsole.debug(...args); logToServer("debug", ...args); };

    let ROLE_MAP = {}; 
    let GAMEMODE_MAP = {}; 

    // Fetch dynamic roles list & gamemodes
    window.postMessage({ type: "WV_FETCH_ROLES" }, "*");
    window.postMessage({ type: "WV_GET_ALL_GAMEMODES" }, "*");

    window.addEventListener("message", (event) => {
        if (!event.data) return;
        
        if (event.data.type === "WV_GAMEMODE_MAPPINGS") {
            GAMEMODE_MAP = event.data.mappings || {};
            console.log(`[Gamemodes] Loaded ${Object.keys(GAMEMODE_MAP).length} mappings.`);
        }
        if (event.data.type === "WV_ROLES_LIST_DATA" && event.data.data && event.data.data.roles) {
            const roles = event.data.data.roles;
            ROLE_MAP = {};
            roles.forEach(r => ROLE_MAP[r.id] = r.name);
            console.log(`%c[Roles] Updated map with ${roles.length} roles.`, "color: #4caf50");
        }
    });

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        if (!response.ok) return response;
        try {
            const url = (args[0] && typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) ? args[0].url : "";

            if (url.includes("/api/public/activeGameModes/v2")) {
                const clone = response.clone();
                clone.json().then(data => {
                    const staticMap = { "quick": "Schnelles Spiel", "sandbox": "Sandbox", "ranked": "Rangliste", "custom": "Benutzerdefiniertes Spiel" };
                    if (Array.isArray(data)) {
                        data.forEach(mode => {
                            let name = staticMap[mode.id];
                            if (mode.id.startsWith("ranked-league")) name = "Rangliste";
                            if (mode.id.startsWith("sandbox")) name = "Sandbox";

                            if (name && mode.languageGameModes) {
                                mode.languageGameModes.forEach(lgm => {
                                    if (!GAMEMODE_MAP[lgm.id]) {
                                        GAMEMODE_MAP[lgm.id] = name;
                                        window.postMessage({ type: "WV_CACHE_GAMEMODE", id: lgm.id, name }, "*");
                                    }
                                });
                            }
                            if (mode.id === "crazy-fun" && mode.languageGameModes) {
                                if (!window._crazyFunIds) window._crazyFunIds = [];
                                mode.languageGameModes.forEach(lgm => window._crazyFunIds.push(lgm.id));
                            }
                        });
                    }
                }).catch(() => {});
            }

            if (url.includes("players/meAndCheckAppVersion")) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.player && data.player.id) {
                        window.postMessage({ type: "WV_SET_MY_ID", id: data.player.id }, "*");
                    }
                }).catch(() => {});
            }

            if (url.includes("/roleRotation/funGameMode/")) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.gameModeName) {
                        const funId = url.split("/").pop();
                        const name = data.gameModeName;
                        if (!GAMEMODE_MAP[funId]) {
                            GAMEMODE_MAP[funId] = name;
                            window.postMessage({ type: "WV_CACHE_GAMEMODE", id: funId, name }, "*");
                        }
                        if (window._crazyFunIds) {
                            window._crazyFunIds.forEach(id => GAMEMODE_MAP[id] = name);
                        }
                    }
                }).catch(() => {});
            }
        } catch (e) {}
        return response;
    };

    function toTitleCase(str) {
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    function getRoleName(id) {
        if (!id) return "Unknown";
        if (ROLE_MAP[id]) return toTitleCase(ROLE_MAP[id]);
        return toTitleCase(id.replace(/-/g, ' '));
    }

    let activeWS = null;
    let currentGameMetadata = null;

    // --- Time Scaling Logic ---
    const timeScaler = {
        speed: 1,
        baseRealTime: originalNow(),
        baseVirtualTime: originalNow(),
        baseRealPerf: originalPerformanceNow(),
        baseVirtualPerf: originalPerformanceNow(),

        setSpeed(newSpeed) {
            const now = originalNow();
            const perf = originalPerformanceNow();
            this.baseVirtualTime = this.getVirtualTime(now);
            this.baseRealTime = now;
            this.baseVirtualPerf = this.getVirtualPerf(perf);
            this.baseRealPerf = perf;
            this.speed = newSpeed;
        },

        getVirtualTime(realTime = originalNow()) {
            return this.baseVirtualTime + (realTime - this.baseRealTime) * this.speed;
        },

        getVirtualPerf(realPerf = originalPerformanceNow()) {
            return this.baseVirtualPerf + (realPerf - this.baseRealPerf) * this.speed;
        }
    };

    // --- Session Management ---
    const gameSessions = {}; 
    let activeGameId = null;

    class SessionData {
        constructor(id) {
            this.id = id;
            this.playerDataCache = {}; 
        }
    }

    function getSession() {
        if (!activeGameId) return null;
        if (!gameSessions[activeGameId]) {
            gameSessions[activeGameId] = new SessionData(activeGameId);
        }
        return gameSessions[activeGameId];
    }

    function resetGameVars() {
        const keys = Object.keys(gameSessions);
        if (keys.length > 3) {
            delete gameSessions[keys[0]];
        }
    }

    function formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        return `${m}:${(s % 60).toString().padStart(2, '0')}`;
    }

    class MockWebSocket extends EventTarget {
        constructor(url, protocols) {
            super();
            this.url = url; 
            this.protocols = protocols || "";
            this.readyState = 0;
            this.binaryType = "blob";
            setTimeout(() => {
                if (this.readyState === 3) return;
                this.readyState = 1;
                const openEvent = new Event('open');
                this.dispatchEvent(openEvent);
                if (typeof this.onopen === 'function') this.onopen(openEvent);
                replayManager.onVirtualWSReady();
            }, 100);
        }
        send(data) {
            if (data === "2") {
                setTimeout(() => {
                    if (this.readyState === 1) {
                        const pong = new MessageEvent('message', { data: "3", origin: this.url });
                        this.dispatchEvent(pong);
                        if (this.onmessage) this.onmessage(pong);
                    }
                }, 10);
            }
        }
        close() {
            this.readyState = 3;
            const closeEvent = new CloseEvent('close');
            this.dispatchEvent(closeEvent);
            if (typeof this.onclose === 'function') this.onclose(closeEvent);
        }
    }

    const replayManager = {
        isRecording: false,
        isPlaying: false,
        isReplayMode: false,
        playbackSpeed: 1,
        skipSpeed: 50,
        logs: [],
        startTime: 0,
        playbackTimeout: null,
        currentTime: 0,
        totalTime: 0,
        reanalyzeEnabled: false,

        startAutoRecord: function() {
            this.logs = [];
            this.startTime = Date.now();
            this.isRecording = true;
            currentGameMetadata = {
                id: 'game_' + Date.now(),
                date: new Date().toLocaleString(),
                role: 'Unknown',
                result: 'Aborted',
                mode: 'Unknown',
                winStatus: 'Unknown',
                duration: 0,
                players: []
            };
        },

        stopAndSave: function() {
            if (!this.isRecording || this.logs.length < 10) return;
            this.isRecording = false;
            currentGameMetadata.duration = Math.round((Date.now() - this.startTime) / 1000);
            window.postMessage({
                type: "WV_SAVE_GAME",
                id: currentGameMetadata.id,
                gameData: { metadata: currentGameMetadata, logs: this.logs }
            }, "*");
        },

        logMessage: function(type, data) {
            if (!this.isRecording) return;
            this.logs.push({ t: Date.now() - this.startTime, type, data });
        },

        playGame: function(game) {
            this.logs = game.logs;
            this.totalTime = this.logs[this.logs.length - 1].t;
            this.isPlaying = true;
            this.isReplayMode = true;
            this.isRecording = false;
            this.currentTime = 0;
            this.playbackSpeed = 1;
            timeScaler.setSpeed(1);

            if (this.reanalyzeEnabled) {
                updateUI("Re-analyzing game...", false);
                currentGameMetadata = {
                    id: 'replay_' + Date.now(),
                    date: new Date().toLocaleString(),
                    role: 'Unknown',
                    result: 'Replay',
                    mode: 'Unknown',
                    winStatus: 'Unknown',
                    duration: 0,
                    players: []
                };
            }

            document.getElementById('wv-debug-controls').style.display = 'none';
            document.getElementById('wv-playback-controls').style.display = 'block';
            document.getElementById('btn-speed').innerText = "1x Speed";
            document.getElementById('wv-tab-playback').innerText = "Playback";
            document.querySelector('.wv-tab[data-tab="playback"]').click();
            this.updateProgressBar(0);
            applyUIState();
        },

        onVirtualWSReady: async function() {
            if (!this.isPlaying || this.logs.length === 0) return;
            this.playFrom(0);
        },

        playFrom: async function(targetMs) {
            const isBackwards = targetMs < this.currentTime;
            this.currentTime = isBackwards ? 0 : this.currentTime;
            clearTimeout(this.playbackTimeout);
            const startIndex = this.logs.findIndex(l => l.t >= this.currentTime);
            this.startPlaybackLoop(startIndex === -1 ? 0 : startIndex, targetMs);
        },

        startPlaybackLoop: function(index, targetMs = -1) {
            if (!this.isPlaying || index >= this.logs.length) return;
            let messagesInThisTick = 0;
            const maxMessagesPerTick = (targetMs !== -1) ? 30 : 1;
            while (messagesInThisTick < maxMessagesPerTick && index < this.logs.length) {
                const entry = this.logs[index];
                this.currentTime = entry.t;
                if (entry.type === 'down' && activeWS) {
                    emulateIn(entry.data);
                }
                if (targetMs !== -1 && entry.t >= targetMs) { targetMs = -1; break; }
                if (targetMs === -1) break;
                index++;
                messagesInThisTick++;
            }
            this.updateProgressBar(this.currentTime);
            const nextEntry = this.logs[index + 1];
            if (nextEntry) {
                const currentSpeed = (targetMs !== -1) ? this.skipSpeed : this.playbackSpeed;
                const delay = (nextEntry.t - this.currentTime) / currentSpeed;
                this.playbackTimeout = originalSetTimeout(() => this.startPlaybackLoop(index + 1, targetMs), Math.max(0, delay));
            } else {
                this.isPlaying = false;
                timeScaler.setSpeed(1);
                updateUI("Replay finished.", true);
            }
        },

        updateProgressBar: function(time) {
            const percent = (time / this.totalTime) * 100;
            document.getElementById('wv-progress-fill').style.width = percent + "%";
            document.getElementById('wv-time-display').innerText = `${formatTime(time)} / ${formatTime(this.totalTime)}`;
        },

        stopPlayback: function() {
            this.isPlaying = false;
            this.isReplayMode = false;
            timeScaler.setSpeed(1);
            clearTimeout(this.playbackTimeout);
            if (activeWS instanceof MockWebSocket) activeWS.close();
            document.getElementById('wv-playback-controls').style.display = 'none';
            document.getElementById('wv-debug-controls').style.display = 'flex';
            document.getElementById('wv-tab-playback').innerText = "Debug";
            applyUIState();
        },

        toggleSpeed: function() {
            this.playbackSpeed = (this.playbackSpeed === 1) ? 2 : (this.playbackSpeed === 2 ? 4 : 1);
            timeScaler.setSpeed(this.playbackSpeed);
            document.getElementById('btn-speed').innerText = this.playbackSpeed + "x Speed";
        }
    };

    // --- UI Logic & Styles ---
    const style = document.createElement('style');
    style.innerHTML = `
        .wv-overlay { position: fixed; background: rgba(15, 15, 25, 0.98); color: #eee; z-index: 10000; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 14px; backdrop-filter: blur(12px); display: flex; flex-direction: column; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; touch-action: none; }
        .wv-overlay.portrait { top: 0; left: 0; width: 100%; height: 33.33vh; border-radius: 0 0 16px 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); border-bottom: 1px solid rgba(255,255,255,0.1); }
        .wv-overlay.landscape { top: 20px; right: 20px; width: 420px; height: auto; max-height: 95vh; border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.08); }
        .wv-overlay.minimized { width: 50px !important; height: 50px !important; border-radius: 50% !important; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); background: #3f51b5; box-shadow: 0 4px 12px rgba(0,0,0,0.4); max-height: 50px; display: flex; align-items: center; justify-content: center; touch-action: none !important; }
        .wv-overlay.minimized * { display: none !important; }
        .wv-overlay.minimized::after { content: '🐺'; font-size: 24px; display: block; }
        .wv-overlay.dragging { transition: none !important; }
        .wv-resize-handle { position: absolute; background: transparent; z-index: 10001; }
        .wv-overlay.portrait .wv-resize-handle { bottom: -5px; left: 0; width: 100%; height: 20px; cursor: ns-resize; display: flex; align-items: center; justify-content: center; background: transparent; }
        .wv-overlay.portrait .wv-resize-handle::after { content: ''; width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; }
        .wv-resize-edge { position: absolute; left: 0; top: 0; width: 12px; height: 100%; cursor: ew-resize; z-index: 10001; }
        .wv-resize-bottom { position: absolute; left: 0; bottom: 0; width: 100%; height: 12px; cursor: ns-resize; z-index: 10001; }
        .wv-resize-corner { position: absolute; left: 0; bottom: 0; width: 20px; height: 20px; cursor: nesw-resize; z-index: 10002; display: flex; align-items: flex-end; padding: 2px; }
        .wv-resize-corner::after { content: ''; width: 0; height: 0; border-style: solid; border-width: 10px 0 0 10px; border-color: transparent transparent transparent rgba(255,255,255,0.3); }
        .wv-header { border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 16px; letter-spacing: -0.02em; }
        .wv-tabs { display: flex; background: rgba(255,255,255,0.03); gap: 6px; margin: 0 10px; border-radius: 10px; }
        .wv-tab { flex: 1; text-align: center; padding: 10px 0; cursor: pointer; color: #777; border-radius: 8px; transition: all 0.2s; font-size: 13px; font-weight: 600; }
        .wv-tab.active { background: rgba(255,255,255,0.08); color: #fff; }
        .wv-panel { padding: 20px; overflow-y: auto; flex: 1; display: none; flex-direction: column; }
        .wv-panel.active { display: flex; }
        .wv-history-item { position: relative; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-bottom: 8px; border: 1px solid transparent; transition: all 0.2s; }
        .wv-history-item:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); }
        .wv-menu-trigger { padding: 8px; cursor: pointer; color: #666; border-radius: 50%; transition: all 0.2s; line-height: 1; font-size: 18px; }
        .wv-menu-trigger:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .wv-dropdown { position: absolute; right: 10px; top: 40px; background: #1a1a2a; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 10001; display: none; min-width: 120px; overflow: hidden; }
        .wv-dropdown.show { display: block; }
        .wv-dropdown-item { padding: 10px 16px; cursor: pointer; font-size: 12px; transition: background 0.2s; color: #ccc; display: flex; align-items: center; gap: 8px; }
        .wv-dropdown-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .wv-dropdown-item.danger { color: #f44336; }
        .wv-dropdown-item.danger:hover { background: rgba(244, 67, 54, 0.1); }
        .wv-btn { background: #3f51b5; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; position: relative; overflow: hidden; }
        .wv-btn:hover { background: #5c6bc0; transform: translateY(-1px); }
        .wv-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .wv-analysis-progress-container { width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-bottom: 12px; overflow: hidden; display: none; }
        .wv-analysis-progress-fill { height: 100%; background: #2196f3; width: 0%; transition: width 0.3s ease-out; box-shadow: 0 0 8px rgba(33, 150, 243, 0.5); }
        .wv-progress-container { width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; position: relative; margin: 15px 0; overflow: hidden; cursor: pointer; }
        .wv-progress-fill { height: 100%; background: #4caf50; width: 0%; transition: width 0.1s linear; }
        .wv-log-item { background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid transparent; font-size: 13px; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .wv-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 20000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .wv-modal { background: #1a1a2a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; width: 90%; max-width: 400px; padding: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .wv-modal-header { font-weight: 700; font-size: 16px; margin-bottom: 12px; color: #fff; }
        .wv-modal-body { font-size: 14px; color: #ccc; margin-bottom: 20px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; }
        .wv-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .wv-custom-select { position: relative; background: #222; color: #ccc; border: 1px solid #444; font-size: 10px; border-radius: 4px; padding: 2px 18px 2px 6px; cursor: pointer; user-select: none; min-width: 60px; }
        .wv-custom-select::after { content: '▼'; position: absolute; right: 5px; top: 50%; transform: translateY(-50%); font-size: 8px; color: #666; }
        .wv-select-options { position: absolute; bottom: 100%; left: 0; width: 100%; background: #1a1a2a; border: 1px solid #444; border-radius: 4px; display: none; flex-direction: column; z-index: 10005; margin-bottom: 2px; box-shadow: 0 -4px 12px rgba(0,0,0,0.5); }
        .wv-select-options.show { display: flex; }
        .wv-select-option { padding: 4px 8px; transition: background 0.2s; }
        .wv-select-option:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .wv-switch { position: relative; display: inline-block; width: 34px; height: 18px; vertical-align: middle; }
        .wv-switch input { opacity: 0; width: 0; height: 0; }
        .wv-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .4s; border-radius: 18px; }
        .wv-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .wv-slider { background-color: #2196F3; }
        input:checked + .wv-slider:before { transform: translateX(16px); }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'wv-overlay';
    overlay.innerHTML = `
        <div class="wv-header">
            <span>🐺 Wolvesville Helper</span>
            <button id="btn-minimize" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:18px;">−</button>
        </div>
        <div id="wv-collapsible-area" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
            <div class="wv-tabs">
                <div class="wv-tab active" data-tab="analysis">Analysis</div>
                <div class="wv-tab" data-tab="playback" id="wv-tab-playback">Debug</div>
                <div class="wv-tab" data-tab="history">History</div>
            </div>
            <div id="panel-analysis" class="wv-panel active">
                <div id="wv-analysis-progress" class="wv-analysis-progress-container">
                    <div id="wv-analysis-progress-fill" class="wv-analysis-progress-fill"></div>
                </div>
                <div id="wv-content" style="font-size: 12px; line-height: 1.4;">Waiting for game...</div>
            </div>
            <div id="panel-playback" class="wv-panel" style="height:100%; flex-direction:column;">
                <div id="wv-playback-controls" style="display:none; text-align:center;">
                    <div style="font-size:24px; font-weight:bold; margin-bottom:5px; color:#fff;" id="wv-playback-status">REPLAY</div>
                    <div id="wv-time-display" style="font-family:monospace; color:#aaa; margin-bottom:10px;">0:00 / 0:00</div>
                    <div id="wv-progress-bar" class="wv-progress-container">
                        <div id="wv-progress-fill" class="wv-progress-fill"></div>
                    </div>
                    <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin-top:15px;">
                        <button id="btn-stop-replay" class="wv-btn danger">Stop</button>
                        <button id="btn-speed" class="wv-btn">1x Speed</button>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="font-size:11px; color:#aaa; font-weight:600;">Re-analyze</span>
                            <label class="wv-switch">
                                <input type="checkbox" id="cb-reanalyze">
                                <span class="wv-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div id="wv-debug-controls" style="display:flex; flex-direction:column; gap:8px; height:100%;">
                    <button id="btn-reanalyze-all" class="wv-btn" style="background:#ef6c00;">⚙️ Re-analyze All Games</button>
                    <div style="display:flex; gap:8px;">
                        <button id="btn-export-all" class="wv-btn" style="flex:1;">Export All</button>
                        <button id="btn-export-cache" class="wv-btn" style="flex:1; background:#009688;">Export Cache</button>
                        <label class="wv-btn" style="flex:1; text-align:center; background:#7b1fa2; cursor:pointer;">
                            Import <input type="file" id="inp-debug-import" multiple style="display:none;">
                        </label>
                    </div>
                    <div style="margin-top:10px; flex:1; display:flex; flex-direction:column; min-height:0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <span style="font-size:11px; font-weight:700; color:#aaa; text-transform:uppercase;">Live Logs</span>
                            <div style="display:flex; gap:4px; align-items:center;">
                                <div id="wv-log-filter-custom" class="wv-custom-select">
                                    <span id="wv-log-filter-label">All</span>
                                    <div id="wv-log-filter-options" class="wv-select-options">
                                        <div class="wv-select-option" data-value="all">All</div>
                                        <div class="wv-select-option" data-value="info">Info</div>
                                        <div class="wv-select-option" data-value="warn">Warn</div>
                                        <div class="wv-select-option" data-value="error">Error</div>
                                    </div>
                                </div>
                                <button id="btn-clear-logs" style="background:none; border:none; color:#666; cursor:pointer; font-size:10px;">Clear</button>
                            </div>
                        </div>
                        <div id="wv-live-logs" style="background:rgba(0,0,0,0.3); border-radius:6px; padding:8px; font-family:monospace; font-size:10px; flex:1; overflow:auto; border:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; gap:2px; min-height:100px;"></div>
                    </div>
                </div>
            </div>
            <div id="panel-history" class="wv-panel">
                <div id="wv-history-list"></div>
            </div>
        </div>
        <div class="wv-resize-handle"></div>
        <div class="wv-resize-edge"></div>
        <div class="wv-resize-bottom"></div>
        <div class="wv-resize-corner"></div>
    `;
    document.body.appendChild(overlay);
    initLogging();

    // --- UI Logic & Draggable/Resizable Implementation ---
    let uiState = {
        minimized: false,
        pos: { x: window.innerWidth - 70, y: 100 },
        portraitHeight: "33.33vh",
        landscapeWidth: "420px",
        landscapeHeight: "auto",
        activeTab: "analysis",
        tabHeights: {
            analysis: "auto",
            playback_debug: "auto",
            playback_replay: "auto",
            history: "auto"
        }
    };

    const savedState = localStorage.getItem('wv_ui_state');
    if (savedState) {
        try { uiState = { ...uiState, ...JSON.parse(savedState) }; } catch(e) {}
    }

    function saveUIState() { localStorage.setItem('wv_ui_state', JSON.stringify(uiState)); }

    function getCurrentHeightKey() {
        if (uiState.activeTab === 'playback') {
            return replayManager.isPlaying ? 'playback_replay' : 'playback_debug';
        }
        return uiState.activeTab;
    }

    function applyUIState() {
        if (uiState.minimized) {
            overlay.classList.add('minimized');
            overlay.style.top = uiState.pos.y + 'px';
            overlay.style.left = uiState.pos.x + 'px';
            overlay.style.height = '';
            overlay.style.width = '';
        } else {
            overlay.classList.remove('minimized');
            const isPortrait = window.innerWidth / window.innerHeight < 1.0;
            if (isPortrait) {
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = uiState.portraitHeight;
            } else {
                overlay.style.top = '20px';
                overlay.style.right = '20px';
                overlay.style.left = 'auto';
                overlay.style.width = uiState.landscapeWidth;
                overlay.style.height = uiState.tabHeights[getCurrentHeightKey()] || "auto";
            }
        }
        updateLayout();
    }

    // Dragging Logic
    let isDragging = false;
    let isResizing = false;
    let dragStart = { x: 0, y: 0 };
    let dragOffset = { x: 0, y: 0 };
    
    const resizeHandle = overlay.querySelector('.wv-resize-handle');
    const resizeEdge = overlay.querySelector('.wv-resize-edge');
    const resizeBottom = overlay.querySelector('.wv-resize-bottom');
    const resizeCorner = overlay.querySelector('.wv-resize-corner');
    let currentResizeTarget = null;

    overlay.addEventListener('pointerdown', (e) => {
        if (uiState.minimized) {
            isDragging = true;
            overlay.classList.add('dragging');
            dragStart.x = e.clientX;
            dragStart.y = e.clientY;
            dragOffset.x = uiState.pos.x;
            dragOffset.y = uiState.pos.y;
            overlay.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        }
    }, { capture: true });

    const startResizing = (e, el) => {
        if (!uiState.minimized) {
            isResizing = true;
            currentResizeTarget = el;
            overlay.classList.add('dragging');
            dragStart.x = e.clientX;
            dragStart.y = e.clientY;
            dragOffset.w = overlay.offsetWidth;
            dragOffset.h = overlay.offsetHeight;
            el.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        }
    };

    resizeHandle.addEventListener('pointerdown', (e) => startResizing(e, resizeHandle));
    resizeEdge.addEventListener('pointerdown', (e) => startResizing(e, resizeEdge));
    resizeBottom.addEventListener('pointerdown', (e) => startResizing(e, resizeBottom));
    resizeCorner.addEventListener('pointerdown', (e) => startResizing(e, resizeCorner));

    window.addEventListener('pointermove', (e) => {
        if (isDragging && uiState.minimized) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            uiState.pos.x = dragOffset.x + dx;
            uiState.pos.y = dragOffset.y + dy;
            overlay.style.left = uiState.pos.x + 'px';
            overlay.style.top = uiState.pos.y + 'px';
        } else if (isResizing) {
            const isPortrait = window.innerWidth / window.innerHeight < 1.0;
            if (isPortrait) {
                const newHeight = e.clientY;
                uiState.portraitHeight = Math.max(100, Math.min(window.innerHeight - 50, newHeight)) + 'px';
                overlay.style.height = uiState.portraitHeight;
            } else {
                const dx = dragStart.x - e.clientX;
                const dy = e.clientY - dragStart.y;
                if (currentResizeTarget === resizeEdge || currentResizeTarget === resizeCorner) {
                    uiState.landscapeWidth = Math.max(250, dragOffset.w + dx) + 'px';
                    overlay.style.width = uiState.landscapeWidth;
                }
                if (currentResizeTarget === resizeBottom || currentResizeTarget === resizeCorner) {
                    const newHeight = Math.max(150, dragOffset.h + dy) + 'px';
                    uiState.tabHeights[getCurrentHeightKey()] = newHeight;
                    overlay.style.height = newHeight;
                }
            }
        }
    }, { capture: true });

    window.addEventListener('pointerup', (e) => {
        if (isDragging && uiState.minimized) {
            isDragging = false;
            overlay.classList.remove('dragging');
            const totalMove = Math.sqrt(Math.pow(e.clientX - dragStart.x, 2) + Math.pow(e.clientY - dragStart.y, 2));
            const wasJustAClick = totalMove < 5;
            const centerX = uiState.pos.x + 25;
            uiState.pos.x = (centerX < window.innerWidth / 2) ? 10 : window.innerWidth - 60;
            uiState.pos.y = Math.max(10, Math.min(window.innerHeight - 60, uiState.pos.y));
            overlay.style.left = uiState.pos.x + 'px';
            overlay.style.top = uiState.pos.y + 'px';
            saveUIState();
            if (wasJustAClick) setMinimized(false);
        }
        if (isResizing) {
            isResizing = false;
            overlay.classList.remove('dragging');
            saveUIState();
        }
    }, { capture: true });

    const tabs = document.querySelectorAll('.wv-tab');
    const panels = document.querySelectorAll('.wv-panel');

    window.addEventListener('click', () => {
        document.querySelectorAll('.wv-dropdown').forEach(d => d.classList.remove('show'));
    });

    tabs.forEach(tab => {
        tab.onclick = () => {
            const targetTab = tab.dataset.tab;
            uiState.activeTab = targetTab;
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${targetTab}`).classList.add('active');
            
            const isPortrait = window.innerWidth / window.innerHeight < 1.0;
            if (!isPortrait && !uiState.minimized) {
                if (targetTab === 'history') uiState.tabHeights.history = "auto";
                overlay.style.height = uiState.tabHeights[getCurrentHeightKey()] || "auto";
            }
            if (targetTab === 'history') window.postMessage({ type: "WV_GET_GAMES" }, "*");
            saveUIState();
        };
    });

    function updateLayout() {
        const isPortrait = window.innerWidth / window.innerHeight < 1.0;
        if (isPortrait) {
            overlay.classList.add('portrait');
            overlay.classList.remove('landscape');
        } else {
            overlay.classList.add('landscape');
            overlay.classList.remove('portrait');
        }
    }
    window.addEventListener('resize', updateLayout);

    window.onerror = (message, source, lineno, colno, error) => {
        logToServer("error", `Uncaught Exception: ${message} at ${source}:${lineno}:${colno}`);
    };

    function setMinimized(val) {
        uiState.minimized = val;
        if (val) {
            overlay.classList.add('minimized');
            overlay.style.top = uiState.pos.y + 'px';
            overlay.style.left = uiState.pos.x + 'px';
            overlay.style.height = '50px';
            overlay.style.width = '50px';
        } else {
            overlay.classList.remove('minimized');
            overlay.style.height = '';
            overlay.style.width = '';
            const isPortrait = window.innerWidth / window.innerHeight < 1.0;
            if (isPortrait) {
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = uiState.portraitHeight;
            } else {
                overlay.style.top = '20px';
                overlay.style.right = '20px';
                overlay.style.width = uiState.landscapeWidth;
                overlay.style.height = uiState.tabHeights[uiState.activeTab || "analysis"] || "auto";
            }
        }
        saveUIState();
        updateLayout();
    }

    document.getElementById('btn-minimize').onclick = (e) => { e.stopPropagation(); setMinimized(true); };
    setMinimized(uiState.minimized);

    const progressBar = document.getElementById('wv-progress-bar');
    progressBar.onclick = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        replayManager.playFrom(percent * replayManager.totalTime);
    };

    document.getElementById('btn-speed').onclick = () => replayManager.toggleSpeed();
    document.getElementById('btn-stop-replay').onclick = () => replayManager.stopPlayback();

    const cbReanalyze = document.getElementById('cb-reanalyze');
    cbReanalyze.checked = replayManager.reanalyzeEnabled;
    cbReanalyze.onchange = (e) => {
        replayManager.reanalyzeEnabled = e.target.checked;
        if (replayManager.reanalyzeEnabled && replayManager.isPlaying && !currentGameMetadata) {
            currentGameMetadata = {
                id: 'replay_' + Date.now(),
                date: new OriginalDate().toLocaleString(),
                role: 'Unknown',
                result: 'Replay',
                mode: 'Unknown',
                winStatus: 'Unknown',
                duration: 0,
                players: []
            };
        }
        console.log(`[Playback] Re-analyze ${replayManager.reanalyzeEnabled ? 'enabled' : 'disabled'}`);
    };

    document.getElementById('btn-reanalyze-all').onclick = async () => {
        const confirmed = await showConfirm("Re-analyze Database", "This will re-process all games in your local database to refresh metadata. Continue?");
        if (!confirmed) return;
        const btn = document.getElementById('btn-reanalyze-all');
        btn.disabled = true;
        btn.innerText = "⚙️ Re-analyzing...";
        window.postMessage({ type: "WV_REANALYZE_ALL" }, "*");
    };

    document.getElementById('btn-export-all').onclick = () => window.postMessage({ type: "WV_EXPORT_ALL" }, "*");
    document.getElementById('btn-export-cache').onclick = () => window.exportPlayerCache();

    document.getElementById('inp-debug-import').onchange = (e) => {
        const files = e.target.files;
        if (!files.length) return;
        replayManager.debugImport(files);
    };

    // --- Message Listeners (Data Handling) ---
    window.addEventListener("message", (event) => {
        if (!event.data) return;

        if (event.data.type === "WV_EXPORT_DATA") {
            const games = event.data.games;
            if (!games || Object.keys(games).length === 0) {
                showModal("Export", "No games found to export.");
                return;
            }
            try {
                const blob = new Blob([JSON.stringify(games, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `wov_full_export_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                showModal("Export Error", "Export failed: " + err.message);
            }
        }

        if (event.data.type === "WV_REANALYZE_COMPLETE") {
            const btn = document.getElementById('btn-reanalyze-all');
            if (btn) {
                btn.disabled = false;
                btn.innerText = "✅ Re-analyze Complete!";
                showModal("Re-analyze", "Database re-analysis complete!");
                setTimeout(() => {
                    btn.innerText = "⚙️ Re-analyze All Games";
                    window.postMessage({ type: "WV_GET_GAMES" }, "*");
                }, 2000);
            }
        }

        if (event.data.type === "WV_GAME_DETAILS") {
            const game = event.data.game;
            if (game) {
                if (event.data.forExport) {
                    const meta = game.metadata;
                    const blob = new Blob([JSON.stringify(game, null, 2)], {type: 'application/json'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `wov_${meta.role}_${meta.id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    replayManager.playGame(game);
                    if (game.metadata.players) {
                        game.metadata.players.forEach(player => {
                            window.postMessage({ type: "WV_LOOKUP_PLAYER", username: player.name }, "*");
                        });
                    }
                }
            } else {
                showModal("Error", "Could not load game data.");
            }
        }

        if (event.data.type === "WV_GAMES_LIST") {
            const list = document.getElementById('wv-history-list');
            if (!list) return;
            list.innerHTML = '';
            const games = Object.values(event.data.games).sort((a, b) => (b.metadata.dbTimestamp || 0) - (a.metadata.dbTimestamp || 0));
            window._wv_all_games = event.data.games;

            games.forEach(game => {
                const meta = game.metadata;
                const winColor = meta.winStatus === 'Won' ? '#4caf50' : (meta.winStatus === 'Lost' ? '#f44336' : '#888');
                let displayMode = meta.mode || 'Unknown';
                if (GAMEMODE_MAP[displayMode]) displayMode = GAMEMODE_MAP[displayMode];

                const formatDuration = (s) => {
                    if (!s) return '00:00';
                    const mins = Math.floor(s / 60);
                    const secs = s % 60;
                    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                };

                const item = document.createElement('div');
                item.className = 'wv-history-item';
                
                const infoWrapper = document.createElement('div');
                infoWrapper.style = 'flex:1; cursor:pointer;';
                infoWrapper.onclick = () => window.postMessage({ type: "WV_GET_GAME_DETAILS", id: meta.id }, "*");
                infoWrapper.innerHTML = `
                    <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                        ${meta.role}${meta.isDead ? ' 💀' : ''} 
                        <span style="color:${winColor}; font-size:11px; font-weight:800; background:rgba(255,255,255,0.05); padding:1px 6px; border-radius:4px; text-transform:uppercase;">${meta.winStatus || ''}</span>
                    </div>
                    <div style="font-size:11px; color:#666; margin-top:4px; font-weight:500;">
                        ${displayMode} • ${formatDuration(meta.duration)} • ${meta.date}
                    </div>
                `;
                
                const menuContainer = document.createElement('div');
                menuContainer.style = 'position:relative; display:flex; align-items:center; gap:4px;';
                const trigger = document.createElement('div');
                trigger.className = 'wv-menu-trigger';
                trigger.innerHTML = '⋮';
                const dropdown = document.createElement('div');
                dropdown.className = 'wv-dropdown';
                dropdown.innerHTML = `<div class="wv-dropdown-item btn-meta">ℹ️ Show Metadata</div><div class="wv-dropdown-item btn-dl">💾 Export Game</div><div class="wv-dropdown-item danger btn-del">🗑️ Delete Game</div>`;
                
                trigger.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.wv-dropdown').forEach(d => { if(d !== dropdown) d.classList.remove('show'); }); dropdown.classList.toggle('show'); };
                dropdown.querySelector('.btn-meta').onclick = (e) => { e.stopPropagation(); dropdown.classList.remove('show'); showModal("Game Metadata", JSON.stringify(meta, null, 2)); };
                dropdown.querySelector('.btn-dl').onclick = (e) => { e.stopPropagation(); dropdown.classList.remove('show'); window.postMessage({ type: "WV_GET_GAME_DETAILS", id: meta.id, forExport: true }, "*"); };
                dropdown.querySelector('.btn-del').onclick = async (e) => { e.stopPropagation(); const confirmed = await showConfirm("Delete Game", "Permanently delete this game?"); if (confirmed) window.postMessage({ type: "WV_DELETE_GAME", id: meta.id }, "*"); dropdown.classList.remove('show'); };
                
                menuContainer.appendChild(trigger);
                menuContainer.appendChild(dropdown);
                item.appendChild(infoWrapper);
                item.appendChild(menuContainer);
                list.appendChild(item);
            });
        }

        if (event.data.type === "WV_PLAYER_DATA") {
            const { username, data } = event.data;
            const session = getSession();
            let pData = data;
            if (pData && pData.players && pData.players.length > 0) pData = pData.players[0];

            if (session && pData && pData.id) {
                const playerInGame = currentGameMetadata && currentGameMetadata.players && currentGameMetadata.players.find(p => p.name === username);
                const gameId = playerInGame ? playerInGame.id : pData.id;
                session.playerDataCache[gameId] = pData;
                if (gameId !== pData.id) session.playerDataCache[pData.id] = pData;
                
                if (currentGameMetadata && currentGameMetadata.players) {
                    const total = currentGameMetadata.players.length;
                    const loaded = currentGameMetadata.players.filter(p => session.playerDataCache[p.id]).length;
                    const progContainer = document.getElementById('wv-analysis-progress');
                    const progFill = document.getElementById('wv-analysis-progress-fill');
                    if (progContainer && progFill) {
                        progContainer.style.display = 'block';
                        progFill.style.width = (loaded / total * 100) + '%';
                        if (loaded >= total) setTimeout(() => { if (progFill.style.width === '100%') progContainer.style.display = 'none'; }, 3000);
                    }
                }
            }
        }

        if (event.data.type === "WV_LOG_MSG") {
            if (isInternalLogging) return;
            isInternalLogging = true;
            try { addLiveLog(event.data.level, event.data.msg, event.data.category || 'Background'); } finally { isInternalLogging = false; }
        }

        if (event.data.type === "WV_PLAYER_CACHE_RESPONSE") {
            const data = event.data.playerCache;
            if (!data || data.length === 0) return;
            try {
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `wov_player_cache_${Date.now()}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 100);
            } catch (err) { console.error("[Debug] Export failed:", err); }
        }
    });

    window.debugPlayer = (username) => { window.postMessage({ type: "WV_LOOKUP_PLAYER", username }, "*"); return "Fetching..."; };
    window.exportPlayerCache = () => { window.postMessage({ type: "WV_EXPORT_PLAYER_CACHE" }, "*"); return "Exporting..."; };
    window.getCacheStats = () => { window.postMessage({ type: "WV_GET_OFFLINE_STATUS" }, "*"); return "Requesting stats..."; };

    function processMessage(content_text, isPlayback) {
        if (!isPlayback) replayManager.logMessage('down', content_text);
        const match = content_text.match(/^\d+/);
        const prefix = match ? match[0] : "";
        const jsonStr = content_text.substring(prefix.length);
        if (!jsonStr) return;
        let data; try { data = JSON.parse(jsonStr); } catch (e) { return; }
        if (!Array.isArray(data)) return;
        const [key, bodyRaw] = data;
        let body = bodyRaw; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }

        if (key === "game-joined" && body && body.gameId) {
            if (!isPlayback) {
                activeGameId = body.gameId;
                if (!gameSessions[activeGameId]) gameSessions[activeGameId] = new SessionData(activeGameId);
                if (currentGameMetadata) currentGameMetadata.id = body.gameId;
                updateUI(`Game joined: ${activeGameId}`, false);
                const progFill = document.getElementById('wv-analysis-progress-fill');
                if (progFill) progFill.style.width = '0%';
            } else {
                if (currentGameMetadata) currentGameMetadata.id = body.gameId;
            }
        }

        const session = getSession();

        if (key === "game-settings-changed" && body && session && !isPlayback) {
            if (body.gameMode && currentGameMetadata) {
                const rawMode = body.gameMode;
                let modeName = GAMEMODE_MAP[rawMode] || toTitleCase(rawMode.replace(/-/g, ' '));
                if (body.allCoupled) modeName += " (Coupled)";
                if (body.isRowWars) modeName = "Row Wars";
                if (currentGameMetadata) currentGameMetadata.mode = modeName;
            }
        }

        if (key === "game-game-over" && body && currentGameMetadata && !isPlayback) {
            currentGameMetadata.result = "Finished";
            if (body.gameResult && body.gameResult.status) {
                const status = body.gameResult.status;
                if (status.includes("WINNER_VILLAGERS")) currentGameMetadata.winStatus = "Villagers Won";
                else if (status.includes("WINNER_WEREWOLVES")) currentGameMetadata.winStatus = "Werewolves Won";
                else if (status.includes("WINNER_SOLO")) currentGameMetadata.winStatus = "Solo Won";
            }
        }

        if (key === "game-over-awards-available" && body && currentGameMetadata && !isPlayback) {
            currentGameMetadata.result = "Finished";
            if (body.playerAward && body.playerAward.awardedXp) {
                const win = body.playerAward.awardedXp.some(xp => xp.reason && xp.reason.includes("WIN"));
                currentGameMetadata.winStatus = win ? "Won" : "Lost";
            }
            if (!isPlayback) replayManager.stopAndSave();
            resetGameVars();
        }

        if (key === "game-started") {
            if (body && currentGameMetadata && !isPlayback) {
                if (body.role && currentGameMetadata) {
                    currentGameMetadata.role = getRoleName(body.role);
                    console.log(`%c[Analysis] Role detected: ${currentGameMetadata.role}`, "color: #ff00ff; font-weight: bold;");
                }
                if (body.players && currentGameMetadata) {
                    currentGameMetadata.players = body.players.map(p => ({ name: p.username, idx: p.gridIdx, level: p.level, id: p.id }));
                    console.log(`[Queue] Starting lookup for ${currentGameMetadata.players.length} players...`);
                    currentGameMetadata.players.forEach(player => {
                        window.postMessage({ type: "WV_LOOKUP_PLAYER", username: player.name }, "*");
                    });
                }
            }
        }

        if ((key === "game-over-v2" || key === "game-over-awards-available") && currentGameMetadata && !isPlayback) {
            currentGameMetadata.result = "Finished";
            if (!isPlayback) replayManager.stopAndSave();
            resetGameVars();
        }
    }

    // --- WebSocket Proxy ---
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        if (typeof replayManager !== 'undefined' && (replayManager.isPlaying || replayManager.isReplayMode)) {
            activeWS = new MockWebSocket(url, protocols);
            return activeWS;
        }
        const ws = new OriginalWebSocket(url, protocols);
        activeWS = ws;
        if (typeof replayManager !== 'undefined') replayManager.startAutoRecord();
        const originalSend = ws.send;
        ws.send = function(data) {
            if (typeof replayManager !== 'undefined') replayManager.logMessage('up', data);
            return originalSend.apply(this, arguments);
        };
        ws.addEventListener('message', (e) => processMessage(e.data, false));
        ws.addEventListener('close', () => {
            if (typeof replayManager !== 'undefined' && !replayManager.isPlaying) replayManager.stopAndSave();
            if (activeWS === ws) activeWS = null;
        });
        return ws;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;

    // --- Time Scaling Patching ---
    function MockDate(...args) {
        if (!new.target) {
            if (typeof replayManager !== 'undefined' && replayManager.isPlaying) {
                return new OriginalDate(timeScaler.getVirtualTime(originalNow())).toString();
            }
            return OriginalDate();
        }
        if (args.length === 0 && typeof replayManager !== 'undefined' && replayManager.isPlaying) {
            return Reflect.construct(OriginalDate, [timeScaler.getVirtualTime(originalNow())], new.target);
        }
        return Reflect.construct(OriginalDate, args, new.target);
    }
    MockDate.prototype = OriginalDate.prototype;
    MockDate.now = function() {
        if (typeof replayManager !== 'undefined' && replayManager.isPlaying) return Math.floor(timeScaler.getVirtualTime(originalNow()));
        return originalNow();
    };
    MockDate.parse = OriginalDate.parse;
    MockDate.UTC = OriginalDate.UTC;
    window.Date = MockDate;

    performance.now = function() {
        if (typeof replayManager !== 'undefined' && replayManager.isPlaying) return timeScaler.getVirtualPerf(originalPerformanceNow());
        return originalPerformanceNow();
    };

    window.setTimeout = function(fn, delay, ...args) {
        if (typeof replayManager !== 'undefined' && replayManager.isPlaying && timeScaler.speed !== 1) {
            return originalSetTimeout(fn, delay / timeScaler.speed, ...args);
        }
        return originalSetTimeout(fn, delay, ...args);
    };

    window.setInterval = function(fn, delay, ...args) {
        if (typeof replayManager !== 'undefined' && replayManager.isPlaying && timeScaler.speed !== 1) {
            return originalSetInterval(fn, delay / timeScaler.speed, ...args);
        }
        return originalSetInterval(fn, delay, ...args);
    };

    function updateUI(text, append = false) {
        const content = document.getElementById('wv-content');
        if (!content) return;
        if (content.innerText.includes("Waiting for game...")) content.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'wv-log-item';
        div.innerHTML = text;
        if (!append) content.innerHTML = '';
        content.appendChild(div);
        content.scrollTop = content.scrollHeight;
    }

    function emulateIn(data) {
        if (!activeWS) return;
        if (replayManager.reanalyzeEnabled) processMessage(data, false);
        const event = new MessageEvent('message', { data: data, origin: activeWS.url });
        activeWS.dispatchEvent(event);
        if (activeWS.onmessage) activeWS.onmessage(event);
    }
})();