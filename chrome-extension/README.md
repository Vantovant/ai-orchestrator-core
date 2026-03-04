# VantoOS Companion Chrome Extension

## Setup

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select this `chrome-extension/` folder
4. Click the VantoOS icon in toolbar → side panel opens

## Pairing with VantoOS

1. In VantoOS web app → Settings → Extension → click **Generate Pairing Code**
2. Copy the 6-character code
3. In the extension Settings tab, paste the code and click **Pair**

## Adding Domains

1. Go to Settings tab in the extension
2. Add domains you want to capture from (e.g. `app.example.com`)
3. Chrome will prompt to grant access — click Allow

## Capturing

1. Visit an allowed domain
2. Optionally select text on the page
3. Click **Capture Current Tab** in the Capture tab
4. Select a project (optional) and click **Send to Project**

## Icons

Replace the placeholder icons in `chrome-extension/icons/` with your own 16x16, 48x48, and 128x128 PNG files.
