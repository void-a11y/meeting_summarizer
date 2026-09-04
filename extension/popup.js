const API_BASE_URL = "http://localhost:8000";

const recordBtn = document.getElementById("record-btn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

let pollTimer = null;

// On open, ask the background script what's actually happening right now --
// the popup gets destroyed every time it loses focus, so it can never trust
// its own memory of state. The background script is the source of truth.
init();

async function init() {
  const state = await chrome.runtime.sendMessage({ target: "background", type: "get-status" });
  applyState(state);
}

recordBtn.addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ target: "background", type: "get-status" });

  if (state.status === "recording") {
    chrome.runtime.sendMessage({ target: "background", type: "stop-recording" });
    applyState({ status: "uploading" });
  } else if (state.status === "idle" || state.status === "done" || state.status === "failed") {
    statusEl.textContent = "Starting…";
    const response = await chrome.runtime.sendMessage({ target: "background", type: "start-recording" });
    if (!response || !response.ok) {
      statusEl.textContent = `Error: ${response?.error || "Could not start recording"}`;
      return;
    }
    applyState({ status: "recording" });
  }
});

// Live updates while the popup happens to be open
chrome.runtime.onMessage.addListener((message) => {
  if (message.target === "popup" && message.state) {
    applyState(message.state);
  }
});

function applyState(state) {
  clearTimeout(pollTimer);

  if (state.status === "recording") {
    recordBtn.textContent = "■ Stop Recording";
    recordBtn.classList.add("recording");
    statusEl.textContent = "Recording… click Stop when the meeting ends.";
    resultsEl.hidden = true;
  } else if (state.status === "uploading") {
    recordBtn.textContent = "● Start Recording";
    recordBtn.classList.remove("recording");
    statusEl.textContent = "Uploading…";
  } else if (state.status === "processing") {
    recordBtn.textContent = "● Start Recording";
    recordBtn.classList.remove("recording");
    statusEl.textContent = "Transcribing & summarizing…";
    if (state.meetingId) pollMeeting(state.meetingId);
  } else if (state.status === "failed") {
    recordBtn.textContent = "● Start Recording";
    recordBtn.classList.remove("recording");
    statusEl.textContent = `Error: ${state.error || "Something went wrong."}`;
  } else {
    recordBtn.textContent = "● Start Recording";
    recordBtn.classList.remove("recording");
    statusEl.textContent = "";
  }
}

async function pollMeeting(id) {
  const res = await fetch(`${API_BASE_URL}/api/meetings/${id}`);
  if (!res.ok) return;
  const meeting = await res.json();

  if (meeting.status === "done") {
    statusEl.textContent = "Done.";
    renderResults(meeting);
  } else if (meeting.status === "failed") {
    statusEl.textContent = `Failed: ${meeting.error_message || "unknown error"}`;
  } else {
    pollTimer = setTimeout(() => pollMeeting(id), 2500);
  }
}

function renderResults(meeting) {
  resultsEl.hidden = false;

  const decisionsList = document.getElementById("decisions-list");
  decisionsList.innerHTML = meeting.decisions.length
    ? meeting.decisions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")
    : `<li class="empty">No explicit decisions detected.</li>`;

  const actionsList = document.getElementById("actions-list");
  actionsList.innerHTML = meeting.action_items.length
    ? meeting.action_items
        .map((a) => `<li>${escapeHtml(a.task)} — ${escapeHtml(a.owner || "unassigned")}</li>`)
        .join("")
    : `<li class="empty">No action items detected.</li>`;

  document.getElementById("summary-text").textContent = meeting.summary || "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
