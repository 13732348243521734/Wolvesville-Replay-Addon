# Wolvesville Replay Manager

Wolvesville Replay Manager is a browser extension designed to help Wolvesville players record, manage, and analyze their game sessions. It provides a robust system for capturing game logs and replaying them with time-scaling capabilities.

## Features

- **Automatic Game Recording:** Automatically captures all incoming and outgoing game messages when you play on Wolvesville.com.
- **AI-Assisted Development:** This project was created with the support of AI development tools.
- **Local Storage:** Saves game sessions locally using IndexedDB for persistence across browser restarts.
- **Replay System:**
    - Replay recorded games within the browser.
    - Adjustable playback speed (1x, 2x, 4x).
    - Progress bar for seeking through the replay.
- **Game History:** A detailed list of all recorded games, showing roles, results (Win/Loss), game modes, and durations.
- **Metadata Analysis:** Automatically extracts game information such as roles, winners, and game duration from logs.
- **Export/Import:**
    - Export individual games or your entire database as JSON files.
    - Import games from other players or backups.
- **Player Cache:** Caches player information to display profile icons and roles in history.

## Installation

1. Clone or download this repository.
2. Open your browser's extensions page.
3. **Important:** Currently, this extension is optimized for **Firefox** due to the handling of background scripts (`browser` vs. `chrome` namespace). While it's an "easy fix" for full Chrome compatibility, Firefox is currently recommended.
4. Load the extension:
    - **Firefox:** Click "Load Temporary Add-on" and select the `manifest.json` inside the `addon` folder.
    - **Chrome/Edge:** Click "Load unpacked" and select the `addon` folder.

## How to Use

### Recording
The extension automatically starts recording once you join a game on [Wolvesville.com](https://www.wolvesville.com). A small icon or overlay will appear, indicating the current status.

### Managing History
1. Click the extension icon to open the overlay.
2. Go to the **History** tab to see all your recorded games.
3. Use the menu (three dots) next to a game to:
    - View metadata.
    - Export the game log.
    - Delete the game.

### Replaying
1. In the **History** tab, click on any game to start the replay.
2. The UI will switch to the **Debug** (Playback) tab.
3. Use the controls to pause, stop, or change the playback speed.
4. Toggle **Re-analyze** if you want to re-process the logs during playback.

## Technical Details

- **Manifest V3:** Built using the latest extension standards.
- **IndexedDB:** Uses `indexedDB` for efficient storage of large game logs.
- **Gzip Compression:** Logs are compressed using the `CompressionStream` API to save storage space.
- **Content Security Policy (CSP) Bypass:** Uses a standard injection technique to interact with the game's WebSocket and internal state safely.

## Disclaimer

This extension is intended for personal use and replay management. It does not provide any unfair advantages or "cheating" features in live games. Always respect the Wolvesville [Terms of Service](https://www.wolvesville.com/terms-of-service.html).

## License

This project is licensed under the MIT License - see the LICENSE file for details.
