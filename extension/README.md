# Minutes — Chrome Extension

Records the active browser tab's audio (e.g. a Google Meet or Zoom-in-browser
call) and sends it to the same backend the web app uses — no separate
server, no duplicated logic.

## How it works

1. Click the extension icon, hit **Start Recording**.
2. It captures the active tab's audio via `chrome.tabCapture`, while piping
   the audio back out to your speakers so the tab doesn't go silent.
3. Click **Stop Recording** — the recording uploads to your backend
   automatically, then the popup polls for status the same way the web app
   does, and shows decisions/action items/summary right there.
4. You can close the popup mid-recording (Chrome does this automatically
   when you click away) — recording continues in the background, and
   reopening the popup picks up exactly where it left off.

## Setup

1. Make sure the backend from `../backend` is running
   (`uvicorn main:app --reload`) at `http://localhost:8000`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked**, and select this `extension/` folder.
5. Pin the extension (puzzle-piece icon in the toolbar → pin "Minutes").

## Trying it out

Open a tab that's playing audio (a YouTube video works fine for testing —
doesn't have to be an actual meeting), click the extension icon, hit
**Start Recording**, let a bit of audio play, click **Stop Recording**, and
watch it upload and process.

## Architecture notes

- **`background.js`** — the service worker. Holds the canonical recording
  state (`idle` / `recording` / `uploading` / `processing` / `done` /
  `failed`) so that state survives the popup being closed and reopened.
- **`offscreen.js`** — the only context in a Manifest V3 extension that can
  touch `getUserMedia`/`MediaRecorder`. This is where the actual audio
  capture and upload happen, independent of whether the popup is open.
- **`popup.js`** — pure UI. On open, it always asks the background script
  "what's actually happening right now" rather than trusting any of its own
  memory, since the popup's JS context is destroyed every time it loses
  focus.

## Known limitations

- **Points at `localhost:8000`** — this only works while your own backend
  is running on your own machine. To let other people install and use this
  extension, the backend needs to be deployed somewhere real (Render,
  Railway, Fly.io, etc.) and the `API_BASE_URL` constants in
  `background.js`, `offscreen.js`, and `popup.js` updated to that URL, plus
  `host_permissions` in `manifest.json` updated to match.
- **Chrome only, for now** — uses `chrome.tabCapture` and
  `chrome.offscreen`, both Chrome/Chromium-specific Manifest V3 APIs.
  Porting to Firefox would need a different capture approach (Firefox
  doesn't have an equivalent `tabCapture` API for arbitrary tab audio).
- **One recording at a time** — no queue or multi-tab support yet.
- **No auth** — same as the web app, this is a local-dev setup, not
  production-hardened.
