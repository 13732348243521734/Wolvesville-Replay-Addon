// Bridge between Injected Script and Extension Storage
const script = document.createElement('script');
script.src = browser.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Forward messages from Background Script to Injected Script
browser.runtime.onMessage.addListener((message) => {
    window.postMessage(message, "*");
});

window.addEventListener("message", async (event) => {
    if (event.source !== window) return;

    // Clone data to avoid XrayWrapper errors
    let eventData;
    try {
        eventData = JSON.parse(JSON.stringify(event.data));
    } catch (e) { return; }

    const type = eventData.type;

    // List of types that should NOT be forwarded back to background
    // (either because they come FROM background or are intended only for inject.js)
    const INTERNAL_TYPES = [
        "WV_LOG_MSG", 
        "WV_GAMES_LIST", 
        "WV_GAME_DETAILS", 
        "WV_PLAYER_DATA", 
        "WV_ROLES_LIST_DATA", 
        "WV_GAMEMODE_MAPPINGS", 
        "WV_OFFLINE_STATUS",
        "WV_SYNC_PROGRESS",
        "WV_REANALYZE_COMPLETE",
        "WV_PLAYER_CACHE_RESPONSE"
    ];

    // Forward known message types to Background Script
    if (type && !INTERNAL_TYPES.includes(type) && (type.startsWith("WV_") || type === "WV_LIVE_LOG")) {
        browser.runtime.sendMessage(eventData).then(response => {
            // Send response back to inject.js if needed
            if (response) {
                if (type === "WV_GET_GAMES") window.postMessage({ type: "WV_GAMES_LIST", games: response.games }, "*");
                if (type === "WV_DELETE_GAME") window.postMessage({ type: "WV_GAMES_LIST", games: response.games }, "*");
                if (type === "WV_GET_GAME_DETAILS") window.postMessage({ type: "WV_GAME_DETAILS", game: response.game, forExport: eventData.forExport }, "*");
                if (type === "WV_EXPORT_ALL") window.postMessage({ type: "WV_EXPORT_DATA", games: response.games }, "*");
                if (type === "WV_EXPORT_PLAYER_CACHE" && response.playerCache) window.postMessage({ type: "WV_PLAYER_CACHE_RESPONSE", playerCache: response.playerCache }, "*");
                if (type === "WV_LOOKUP_PLAYER" && response.success) window.postMessage({ type: "WV_PLAYER_DATA", username: eventData.username, data: response.data }, "*");
                if (type === "WV_FETCH_ROLES" && response.success) window.postMessage({ type: "WV_ROLES_LIST_DATA", data: response.data }, "*");
                if (type === "WV_GET_ALL_GAMEMODES" && response.mappings) window.postMessage({ type: "WV_GAMEMODE_MAPPINGS", mappings: response.mappings }, "*");
                if (type === "WV_GET_OFFLINE_STATUS") window.postMessage({ type: "WV_OFFLINE_STATUS", mode: response.mode, stats: response.stats }, "*");
            }
        }).catch(err => {}); // Silent catch
    }
});
