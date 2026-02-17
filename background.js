// background.js - Centralized Service Worker for Wolvesville Helper

// Standardize Browser API (Chrome/Firefox)
const chromeAPI = globalThis.browser || globalThis.chrome;

// --- 0. Log Broadcasting ---
const originalBGConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};

let isBroadcasting = false;
function broadcastLog(level, msg) {
    if (isBroadcasting) return;
    isBroadcasting = true;
    try {
        chromeAPI.tabs.query({ url: "*://*.wolvesville.com/*" }).then(tabs => {
            tabs.forEach(tab => {
                chromeAPI.tabs.sendMessage(tab.id, { type: "WV_LOG_MSG", level, msg, category: 'Background' })
                    .catch(() => {});
            });
        }).finally(() => {
            isBroadcasting = false;
        });
    } catch (e) {
        isBroadcasting = false;
    }
}

console.log = (...args) => { originalBGConsole.log(...args); broadcastLog('info', args.map(String).join(' ')); };
console.warn = (...args) => { originalBGConsole.warn(...args); broadcastLog('warn', args.map(String).join(' ')); };
console.error = (...args) => { originalBGConsole.error(...args); broadcastLog('error', args.map(String).join(' ')); };

// --- 1. Stealth Headers (DNR) ---
const RULES = [
    {
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "Origin", operation: "set", value: "https://wolvesville-tools.pages.dev" },
                { header: "Referer", operation: "set", value: "https://wolvesville-tools.pages.dev/search" }
            ]
        },
        condition: {
            urlFilter: "||wolvesville-tools.pages.dev",
            resourceTypes: ["xmlhttprequest", "other"]
        }
    }
];

if (chromeAPI.declarativeNetRequest) {
    chromeAPI.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: RULES
    }).then(() => console.log("[Background] Stealth rules registered."))
      .catch(e => console.error("DNR Error:", e));
}

// --- 2. Database & Compression Logic ---
const GAMES_DB_NAME = "WolvesvilleGamesDB";
const STORE_GAMES = "games";
const STORE_TRASH = "trash";

const CACHE_DB_NAME = "WolvesvilleHelperCache";
const PLAYER_CACHE_STORE = "player_cache";
const ROLES_CACHE_STORE = "roles_cache";
const GAMEMODE_CACHE_STORE = "gamemode_cache";

const CACHE_EXPIRY_PLAYER = 60 * 60 * 1000; // 1 hour
const CACHE_EXPIRY_ROLES = 24 * 60 * 60 * 1000;
const API_DELAY_MS = 1000;

let cachedGamesDB = null;
let cachedHelperDB = null;
let global_myId = null;

// Compression Helpers
async function compressData(jsonObj) {
    const stream = new Blob([JSON.stringify(jsonObj)]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    return new Response(compressedStream).arrayBuffer();
}

async function decompressData(arrayBuffer) {
    const stream = new Blob([arrayBuffer]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(decompressedStream).text();
    return JSON.parse(text);
}

// DB Open Helpers
function openGamesDB() {
    if (cachedGamesDB) return Promise.resolve(cachedGamesDB);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(GAMES_DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_GAMES)) db.createObjectStore(STORE_GAMES, { keyPath: "id" });
            if (!db.objectStoreNames.contains(STORE_TRASH)) db.createObjectStore(STORE_TRASH, { keyPath: "id" });
        };
        request.onsuccess = () => { cachedGamesDB = request.result; resolve(cachedGamesDB); };
        request.onerror = () => reject(request.error);
    });
}

function openHelperDB() {
    if (cachedHelperDB) return Promise.resolve(cachedHelperDB);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CACHE_DB_NAME, 2);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(PLAYER_CACHE_STORE)) db.createObjectStore(PLAYER_CACHE_STORE, { keyPath: "username" });
            if (!db.objectStoreNames.contains(ROLES_CACHE_STORE)) db.createObjectStore(ROLES_CACHE_STORE, { keyPath: "id" });
            if (!db.objectStoreNames.contains(GAMEMODE_CACHE_STORE)) db.createObjectStore(GAMEMODE_CACHE_STORE, { keyPath: "id" });
        };
        request.onsuccess = () => { cachedHelperDB = request.result; resolve(cachedHelperDB); };
        request.onerror = () => reject(request.error);
    });
}

// Game Operations
function parseDateToTs(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
    if (parts) {
        const ts = Date.parse(`${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}T${parts[4].padStart(2, '0')}:${parts[5].padStart(2, '0')}:${parts[6].padStart(2, '0')}`);
        if (!isNaN(ts)) return ts;
    }
    const ts = Date.parse(dateStr);
    if (!isNaN(ts)) return ts;
    return null;
}

async function saveGameToDB(gameData, isTrash = false) {
    const db = await openGamesDB();
    const storeName = isTrash ? STORE_TRASH : STORE_GAMES;
    const { logs, ...rest } = gameData;
    const metadata = rest.metadata || rest;
    
    if (!metadata.dbTimestamp) metadata.dbTimestamp = parseDateToTs(metadata.date) || Date.now();
    const compressedLogs = await compressData(logs || []);
    const now = Date.now();
    const entry = { id: metadata.id, metadata, compressedLogs, timestamp: now, updated_at: now, is_deleted: 0 };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getGameFromDB(id, isTrash = false) {
    const db = await openGamesDB();
    const storeName = isTrash ? STORE_TRASH : STORE_GAMES;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get(id);
        request.onsuccess = async () => {
            const entry = request.result;
            if (!entry) return resolve(null);
            try {
                const logs = await decompressData(entry.compressedLogs);
                resolve({ metadata: entry.metadata, logs });
            } catch (e) { resolve(null); }
        };
        request.onerror = () => reject(request.error);
    });
}

async function getAllGamesMetadata(isTrash = false) {
    const db = await openGamesDB();
    const storeName = isTrash ? STORE_TRASH : STORE_GAMES;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => {
            const gamesList = {};
            if (Array.isArray(request.result)) {
                request.result.forEach(entry => { gamesList[entry.id] = { metadata: entry.metadata }; });
            }
            resolve(gamesList);
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteGameFromDB(id, isTrash = false) {
    const db = await openGamesDB();
    const storeName = isTrash ? STORE_TRASH : STORE_GAMES;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Cache Operations
async function getCachedData(storeName, key) {
    const db = await openHelperDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get(key.toLowerCase());
        request.onsuccess = async () => {
            const result = request.result;
            if (!result) return resolve(null);
            
            let expiry = 0;
            if (storeName === PLAYER_CACHE_STORE) expiry = CACHE_EXPIRY_PLAYER;
            else if (storeName === ROLES_CACHE_STORE) expiry = CACHE_EXPIRY_ROLES;
            else if (storeName === GAMEMODE_CACHE_STORE) expiry = 365 * 24 * 60 * 60 * 1000;

            if (expiry > 0 && Date.now() - result.timestamp > expiry) return resolve(null);
            
            if (result.compressedData instanceof ArrayBuffer) {
                try {
                    const data = await decompressData(result.compressedData);
                    resolve(data);
                } catch (e) { resolve(null); }
            } else {
                resolve(result.data);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function saveToCache(storeName, key, data) {
    const db = await openHelperDB();
    const compressed = await compressData(data);
    const now = Date.now();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put({ username: key.toLowerCase(), id: key.toLowerCase(), compressedData: compressed, timestamp: now, updated_at: now, is_deleted: 0 });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- 3. Merging & Processing ---
function processLogs(logs, baseOffset = 0) {
    let currentOffset = baseOffset;
    let lastT = 0;
    const processed = [];
    for (let i = 0; i < logs.length; i++) {
        let log = logs[i];
        if (i > 0 && log.t < lastT) {
            currentOffset += lastT + 1000;
        }
        lastT = log.t;
        processed.push({ ...log, t: log.t + currentOffset });
    }
    return processed;
}

function mergeGameData(existing, incoming) {
    if (!existing || !incoming) return existing || incoming;
    const baseOffset = existing.logs.length > 0 ? existing.logs[existing.logs.length - 1].t + 1000 : 0;
    const shiftedLogs = processLogs(incoming.logs, baseOffset);
    const mergedLogs = existing.logs.concat(shiftedLogs).sort((a, b) => a.t - b.t);
    const meta = existing.metadata;
    const newMeta = incoming.metadata;
    meta.duration = Math.round(mergedLogs[mergedLogs.length - 1].t / 1000);
    if (newMeta.role && newMeta.role !== 'Unknown') meta.role = newMeta.role;
    if (newMeta.mode && newMeta.mode !== 'Unknown') meta.mode = newMeta.mode;
    if (newMeta.result && newMeta.result !== 'Aborted') meta.result = newMeta.result;
    if (newMeta.winStatus && newMeta.winStatus !== 'Unknown') meta.winStatus = newMeta.winStatus;
    const playerMap = {};
    [...(meta.players || []), ...(newMeta.players || [])].forEach(p => { if (p.id) playerMap[p.id] = p; });
    meta.players = Object.values(playerMap);
    return { metadata: meta, logs: mergedLogs };
}

function reanalyzeGame(game) {
    const logs = game.logs || [];
    if (logs.length === 0) return game.metadata;

    const meta = { ...game.metadata };
    const newTs = parseDateToTs(meta.date);
    if (newTs) meta.dbTimestamp = newTs;

    meta.role = 'Unknown';
    meta.mode = 'Unknown';
    meta.winStatus = 'Unknown';
    meta.result = 'Aborted';
    meta.players = [];
    meta.duration = 0;
    meta.isDead = false;
    meta.isComplete = false;

    let myId = global_myId;
    const toTitleCase = (str) => str.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const parseEntry = (entry) => {
        if (entry.type !== 'down') return null;
        const content_text = entry.data;
        const match = content_text.match(/^\d+/);
        const prefix = match ? match[0] : "";
        const jsonStr = content_text.substring(prefix.length);
        if (!jsonStr) return null;
        let data; try { data = JSON.parse(jsonStr); } catch (e) { return null; }
        if (!Array.isArray(data)) return null;
        const [key, bodyRaw] = data;
        let body = bodyRaw; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
        return { key, body };
    };

    const processMessage = (key, body) => {
        if (!body) return;
        if (key === "game-joined" && body.gameId) meta.id = body.gameId;
        if (key === "game-settings-changed" && body.gameMode) {
            let modeName = toTitleCase(body.gameMode);
            if (body.allCoupled) modeName += " (Coupled)";
            if (body.isRowWars) modeName = "Row Wars";
            meta.mode = modeName;
        }
        if (key === "game-game-over") {
            meta.result = "Finished";
            meta.isComplete = true;
            if (myId && body.playersWinnerMapping && body.playersWinnerMapping[myId] !== undefined) {
                meta.winStatus = body.playersWinnerMapping[myId] ? "Won" : "Lost";
            } else if (meta.winStatus === 'Unknown' && body.gameResult && body.gameResult.status) {
                const status = body.gameResult.status;
                if (status.includes("WINNER_VILLAGERS")) meta.winStatus = "Villagers Won";
                else if (status.includes("WINNER_WEREWOLVES")) meta.winStatus = "Werewolves Won";
                else if (status.includes("WINNER_SOLO")) meta.winStatus = "Solo Won";
            }
        }
        if (key === "game-over-awards-available") {
            meta.result = "Finished";
            meta.isComplete = true;
            if (body.playerAward) {
                if (body.playerAward.playerId) myId = body.playerAward.playerId;
                if (meta.winStatus === 'Unknown' && body.playerAward.awardedXp) {
                    const win = body.playerAward.awardedXp.some(xp => xp.reason && xp.reason.includes("WIN"));
                    meta.winStatus = win ? "Won" : "Lost";
                }
            }
        }
        if (key === "game-started") {
            if (body.role) meta.role = toTitleCase(body.role);
            if (body.players) meta.players = body.players.map(p => ({ name: p.username, idx: p.gridIdx, level: p.level, id: p.id }));
        }
        if (key === "game-reconnect-set-players" && myId && body[myId] && body[myId].isAlive === false) meta.isDead = true;
        if (key === "game-players-killed" && body.victims && myId && body.victims.some(v => v.targetPlayerId === myId)) meta.isDead = true;
    };

    logs.forEach(entry => {
        const parsed = parseEntry(entry);
        if (parsed) processMessage(parsed.key, parsed.body);
    });

    if (myId) {
        meta.isDead = false; 
        meta.winStatus = 'Unknown'; 
        logs.forEach(entry => {
            const parsed = parseEntry(entry);
            if (parsed) processMessage(parsed.key, parsed.body);
        });
    }

    if (logs.length > 0) {
        meta.duration = Math.round((logs[logs.length - 1].t - logs[0].t) / 1000);
    }
    if (!meta.dbTimestamp) meta.dbTimestamp = parseDateToTs(meta.date) || Date.now();
    return meta;
}

// --- 4. Request Queue ---
class RequestQueue {
    constructor() { this.queue = []; this.processing = false; }
    async add(url, headers = {}) {
        return new Promise((resolve, reject) => {
            this.queue.push({ url, headers, resolve, reject });
            this.process();
        });
    }
    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        while (this.queue.length > 0) {
            const { url, headers, resolve, reject } = this.queue.shift();
            try {
                await new Promise(r => setTimeout(r, API_DELAY_MS));
                const response = await fetch(url, { headers });
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                resolve(data);
            } catch (err) { reject(err); }
        }
        this.processing = false;
    }
}
const apiQueue = new RequestQueue();

// --- 5. Migration ---
async function migrateStorageToDB() {
    const storage = await chromeAPI.storage.local.get(["wv_games", "wv_trash"]);
    if (storage.wv_games) {
        for (const [id, game] of Object.entries(storage.wv_games)) await saveGameToDB(game, false);
        await chromeAPI.storage.local.remove("wv_games");
    }
    if (storage.wv_trash) {
        for (const [id, game] of Object.entries(storage.wv_trash)) await saveGameToDB(game, true);
        await chromeAPI.storage.local.remove("wv_trash");
    }
}
migrateStorageToDB().catch(console.error);

// --- 6. Message Handlers ---
chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "WV_LIVE_LOG") return;
    if (message.type === "WV_SET_MY_ID") {
        global_myId = message.id;
        chromeAPI.storage.local.set({ "wv_my_id": message.id });
        return;
    }

    const handlers = {
        "WV_LOOKUP_PLAYER": async () => {
            const cached = await getCachedData(PLAYER_CACHE_STORE, message.username);
            if (cached) return { success: true, data: cached };
            try {
                const data = await apiQueue.add(`https://wolvesville-tools.pages.dev/api/players/search?username=${encodeURIComponent(message.username)}&page=1`, { "Accept": "*/*" });
                if (data && data.players && data.players.length > 0) {
                    await saveToCache(PLAYER_CACHE_STORE, message.username, data.players[0]);
                    return { success: true, data: data.players[0] };
                }
                await saveToCache(PLAYER_CACHE_STORE, message.username, { notFound: true });
                return { success: false, error: "Player not found" };
            } catch (e) { return { success: false, error: e.message }; }
        },
        "WV_FETCH_ROLES": async () => {
            const cached = await getCachedData(ROLES_CACHE_STORE, "roles_list");
            if (cached) return { success: true, data: cached };
            const data = await apiQueue.add("https://wolvesville-tools.pages.dev/api/roles");
            await saveToCache(ROLES_CACHE_STORE, "roles_list", data);
            return { success: true, data };
        },
        "WV_SAVE_GAME": async () => {
            const { id, gameData } = message;
            let existing = await getGameFromDB(id, false) || await getGameFromDB(id, true);
            let merged = existing ? mergeGameData(existing, gameData) : gameData;
            merged.metadata = reanalyzeGame(merged);
            const isTrash = merged.metadata.role === 'Unknown';
            await saveGameToDB(merged, isTrash);
            if (!isTrash) await deleteGameFromDB(id, true);
            return { success: true };
        },
        "WV_GET_GAMES": async () => {
            const games = await getAllGamesMetadata(false);
            return { games };
        },
        "WV_GET_GAME_DETAILS": async () => {
            const game = await getGameFromDB(message.id, false);
            return { game };
        },
        "WV_DELETE_GAME": async () => {
            const game = await getGameFromDB(message.id, false);
            if (game) { await saveGameToDB(game, true); await deleteGameFromDB(message.id, false); }
            const games = await getAllGamesMetadata(false);
            return { games };
        },
        "WV_IMPORT_BATCH": async () => {
            const games = Array.isArray(message.games) ? message.games : Object.values(message.games);
            for (const game of games) {
                const id = game.metadata.id;
                let existing = await getGameFromDB(id, false) || await getGameFromDB(id, true);
                let merged = existing ? mergeGameData(existing, game) : game;
                if (!existing) {
                    merged.logs = processLogs(merged.logs, 0);
                    merged.metadata.duration = Math.round(merged.logs[merged.logs.length - 1].t / 1000);
                }
                await saveGameToDB(merged, merged.metadata.role === 'Unknown');
            }
            return { success: true };
        },
        "WV_EXPORT_ALL": async () => {
            const allMeta = await getAllGamesMetadata(false);
            const trashMeta = await getAllGamesMetadata(true);
            const exportData = {};
            for (const id of Object.keys(allMeta)) {
                const fullGame = await getGameFromDB(id, false);
                if (fullGame) exportData[id] = fullGame;
            }
            for (const id of Object.keys(trashMeta)) {
                const fullGame = await getGameFromDB(id, true);
                if (fullGame) exportData[id] = fullGame;
            }
            return { games: exportData };
        },
        "WV_REANALYZE_ALL": async () => {
            const allMeta = await getAllGamesMetadata(false);
            const trashMeta = await getAllGamesMetadata(true);
            const processStore = async (metaMap, currentIsTrash) => {
                for (const id of Object.keys(metaMap)) {
                    const game = await getGameFromDB(id, currentIsTrash);
                    if (game && game.logs) {
                        const newMeta = reanalyzeGame(game);
                        const shouldBeTrash = newMeta.role === 'Unknown';
                        if (shouldBeTrash !== currentIsTrash) {
                            await saveGameToDB({ metadata: newMeta, logs: game.logs }, shouldBeTrash);
                            await deleteGameFromDB(id, currentIsTrash);
                        } else {
                            await saveGameToDB({ metadata: newMeta, logs: game.logs }, currentIsTrash);
                        }
                    }
                }
            };
            await processStore(allMeta, false);
            await processStore(trashMeta, true);
            chromeAPI.tabs.query({ url: "*://www.wolvesville.com/*" }).then(tabs => {
                tabs.forEach(tab => chromeAPI.tabs.sendMessage(tab.id, { type: "WV_REANALYZE_COMPLETE" }).catch(() => {}));
            });
            return { success: true };
        },
        "WV_CACHE_GAMEMODE": async () => {
            await saveToCache(GAMEMODE_CACHE_STORE, message.id, { name: message.name });
            return { success: true };
        },
        "WV_GET_ALL_GAMEMODES": async () => {
            const db = await openHelperDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(GAMEMODE_CACHE_STORE, "readonly");
                const request = tx.objectStore(GAMEMODE_CACHE_STORE).getAll();
                request.onsuccess = async () => {
                    const results = request.result || [];
                    const mappings = {};
                    for (const entry of results) {
                        if (entry.compressedData instanceof ArrayBuffer) {
                            try {
                                const data = await decompressData(entry.compressedData);
                                mappings[entry.id] = data.name;
                            } catch (e) {}
                        }
                    }
                    resolve({ mappings });
                };
                request.onerror = () => reject(request.error);
            });
        },
        "WV_GET_OFFLINE_STATUS": async () => {
            const db = await openHelperDB();
            const count = await new Promise(res => {
                const req = db.transaction(PLAYER_CACHE_STORE, "readonly").objectStore(PLAYER_CACHE_STORE).count();
                req.onsuccess = () => res(req.result);
            });
            return { mode: "OFF", stats: { count } };
        },
        "WV_EXPORT_PLAYER_CACHE": async () => {
            const db = await openHelperDB();
            const tx = db.transaction(PLAYER_CACHE_STORE, "readonly");
            const request = tx.objectStore(PLAYER_CACHE_STORE).getAll();
            return new Promise((resolve, reject) => {
                request.onsuccess = async () => {
                    const results = request.result || [];
                    const exportData = [];
                    for (const entry of results) {
                        try {
                            const data = await decompressData(entry.compressedData);
                            exportData.push({ username: entry.username, timestamp: entry.timestamp, updated_at: entry.updated_at, data: data });
                        } catch (e) {
                            exportData.push({ username: entry.username, error: "Decompression failed" });
                        }
                    }
                    resolve({ playerCache: exportData });
                };
                request.onerror = () => reject(request.error);
            });
        }
    };

    if (handlers[message.type]) {
        handlers[message.type]().then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});