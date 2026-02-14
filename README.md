# TabSync

A personal, self-hosted browser extension to sync open tabs across devices (Chromium & Firefox).

## Features

- 🔄 **Real-time sync** of open tabs across all your devices
- 🔥 **Firebase Firestore** backend (self-hosted)
- 🚫 **No authentication** required - single tenant architecture
- 🌙 **Dark mode** UI with Tailwind CSS
- 🦊 **Cross-browser** support (Chrome, Firefox, Edge)
- 💾 **Dynamic configuration** - provide your own Firebase config

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Build Tool**: CRXJS (Vite plugin for extensions)
- **Styling**: Tailwind CSS
- **Backend**: Firebase Firestore (no Auth)
- **Cross-Browser**: webextension-polyfill

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Create Extension Icons

Place the following icon files in `src/assets/`:
- `icon-16.png` (16x16)
- `icon-32.png` (32x32)
- `icon-48.png` (48x48)
- `icon-128.png` (128x128)

### 3. Setup Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Firestore Database**
4. Go to Project Settings → General
5. Scroll to "Your apps" and copy the `firebaseConfig` object
6. You'll paste this into the extension on first run

### 4. Build the Extension

**For Chrome/Edge (with packaging):**
```bash
pnpm build:chrome
```
This creates a ZIP file in the `build/` folder.

**For Firefox (with packaging):**
```bash
pnpm build:firefox
```
This creates an XPI file in the `build/` folder.

**Development build (no packaging):**
```bash
pnpm build
```

### 5. Load the Extension

**Chrome/Edge (Development):**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

**Chrome/Edge (Packaged CRX):**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Pack extension"
4. Select the `dist` folder as the extension root
5. Chrome will generate a `.crx` file and a `.pem` key
6. Drag the `.crx` file into the extensions page

**Firefox (Development):**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist` folder

**Firefox (Packaged XPI):**
1. The XPI file from `build/` can be installed temporarily
2. For permanent installation, sign it at [addons.mozilla.org](https://addons.mozilla.org/developers/)

## Usage

### First Run Setup

**Step 1: Enter Firebase Configuration**
1. Click the extension icon
2. You'll see a configuration form
3. Paste your Firebase config JSON
4. Click "Save Configuration"

**Step 2: Select or Create Device**
- **If you have existing devices:**
  - You'll see a list of all devices currently synced
  - Click on any device to sync with it (merges your current tabs with that device)
  - Or click "Create New Device" to add this as a new device
  
- **If this is your first device:**
  - Click "Create New Device"
  - Enter a descriptive name (e.g., "Work Laptop", "Home Desktop")
  - Click "Create Device"

### Normal Usage

- The extension automatically syncs your tabs every 2 seconds (debounced)
- Click the extension icon to see all synced devices
- Click on a device to expand and see its tabs
- Click any tab to open it
- Click "Open All" to open all tabs from another device
- **Hover over a tab** from another device to see the close button (×) - click to close that tab remotely!

### Remote Tab Control (Command Pattern)

TabSync implements a command pattern for remote operations:
- When you click the "×" button on a tab from Device A (while viewing from Device B), Device B writes a command to Firestore
- The command is stored in: `devices/DeviceA/commands/{commandId}`
- Device A's background script listens to its commands subcollection
- When Device A receives the command, it executes the action (closes the tab) and deletes the command document

### Managing Configuration

If you need to change your Firebase config or switch devices:
1. Open the extension popup
2. Click "Reset Config"
3. Confirm the reset
4. You'll be taken back to the configuration screen
5. Follow the first-run setup again

## Architecture

### Background Script (`src/background/index.ts`)

- Waits for Firebase config to be available in storage
- Watches for tab changes (create, update, remove, move)
- Debounces writes to Firestore (2 seconds)
- Writes to: `devices/{deviceId}`
- Listens to `devices/{deviceId}/commands` for remote commands
- Executes commands (close tab, open tab) and marks them as done

### Popup (`src/popup/`)

- **ConfigForm**: Shows on first run to collect Firebase config
- **DeviceList**: Shows all synced devices and their tabs
- Real-time listener to Firestore for device updates

### Firestore Schema

```
devices/
  {deviceId}/
    deviceName: string
    lastUpdated: timestamp
    tabCount: number
    tabs: [
      {
        id: number
        url: string
        title: string
        favIconUrl: string
        windowId: number
        index: number
        active: boolean
        pinned: boolean
      }
    ]
    commands/ (subcollection)
      {commandId}/
        action: "closeTab" | "openTab"
        tabId: number (for closeTab)
        url: string (for openTab)
        createdAt: timestamp
        fromDevice: string
```

## Development

```bash
# Install dependencies
pnpm install

# Development mode (hot reload)
pnpm dev

# Build for production (Chrome/Edge)
pnpm build

# Build for production (Firefox)
set TARGET=firefox
pnpm build

# Build and package for Chrome
pnpm build:chrome

# Build and package for Firefox
pnpm build:firefox
```

## Firestore Security Rules

Since this is self-hosted and single-tenant, you can use simple rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /devices/{deviceId} {
      allow read, write: if true;
      
      match /commands/{commandId} {
        allow read, write: if true;
      }
    }
  }
}
```

⚠️ **Warning**: These rules allow anyone with your Firebase config to read/write. Only share your config with trusted devices.

## License

MIT License - See LICENSE file for details

## Contributing

This is a personal project, but feel free to fork and customize for your own use!