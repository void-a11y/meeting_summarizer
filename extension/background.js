// Service worker -- the extension's coordinator.
//
// IMPORTANT: Manifest V3 service workers are non-persistent -- Chrome can
// shut this script down after ~30s of inactivity to save resources, which
// wipes any plain JS variable. The actual recording keeps running fine in
// the offscreen document regardless, but this script would "forget" it was
// tracking one. So recording state lives in chrome.storage.session instead
// of a normal variable -- that survives the service worker being evicted
// and restarted, and clears automatically when the browser closes.

const API_BASE_URL = "http://localhost:8000";

let offscreenCreating = null;

async function getState() {
  const { recordingState } = await chrome.storage.session.get("recordingState");
  return recordingState || { status: "idle" };
}

async function setState(state) {
  await chrome.storage.session.set({ recordingState: state });
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) return;

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }
  offscreenCreating = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Recording tab audio for meeting transcription",
  });
  await offscreenCreating;
  offscreenCreating = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "background") {
    if (message.type === "start-recording") {
      handleStartRecording(sendResponse);
      return true; // keep the message channel open for the async response
    }
    if (message.type === "stop-recording") {
      setState({ status: "uploading" });
      chrome.runtime.sendMessage({ target: "offscreen", type: "stop-recording" });
    }
    if (message.type === "get-status") {
      getState().then(sendResponse);
      return true; // async response
    }
  }

  // Status updates relayed from the offscreen document
  if (message.target === "background-status") {
    setState(message.state);
    // Best-effort forward to the popup if it's currently open and listening
    chrome.runtime.sendMessage({ target: "popup", state: message.state }).catch(() => {});
  }
});

async function handleStartRecording(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await ensureOffscreenDocument();

    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "start-recording",
      streamId,
      tabTitle: tab.title || "recording",
      apiBaseUrl: API_BASE_URL,
    });

    await setState({ status: "recording" });
    sendResponse({ ok: true });
  } catch (err) {
    await setState({ status: "idle" });
    sendResponse({ ok: false, error: err.message });
  }
}