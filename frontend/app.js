const API_BASE = ""; // same-origin; backend serves this file too

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const tapeHint = document.getElementById("tape-hint");
const statusLine = document.getElementById("status-line");
const statusText = document.getElementById("status-text");
const meetingList = document.getElementById("meeting-list");
const resultsPanel = document.getElementById("results-panel");

const STATUS_LABELS = {
  uploaded: "Queued…",
  transcribing: "Transcribing audio…",
  summarizing: "Extracting decisions & action items…",
  done: "Done",
  failed: "Failed",
};

// ---- Upload interactions ----

dropzone.addEventListener("click", () => fileInput.click());

["dragover", "dragenter"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
});

async function uploadFile(file) {
  tapeHint.textContent = file.name;
  statusLine.hidden = false;
  statusText.textContent = "Uploading…";

  const formData = new FormData();
  formData.append("file", file);
  const lang = document.getElementById("source-language").value;
  if (lang) formData.append("source_language", lang);

  try {
    const res = await fetch(`${API_BASE}/api/meetings`, { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    const meeting = await res.json();
    statusText.textContent = STATUS_LABELS[meeting.status] || meeting.status;
    pollMeeting(meeting.id);
    loadMeetingList();
  } catch (e) {
    statusText.textContent = `Error: ${e.message}`;
  }
}

async function pollMeeting(id) {
  const poll = async () => {
    const res = await fetch(`${API_BASE}/api/meetings/${id}`);
    if (!res.ok) return;
    const meeting = await res.json();
    statusText.textContent = STATUS_LABELS[meeting.status] || meeting.status;

    if (meeting.status === "done" || meeting.status === "failed") {
      statusLine.hidden = true;
      loadMeetingList();
      renderResults(meeting);
      return;
    }
    setTimeout(poll, 2500);
  };
  poll();
}

// ---- History list ----

let allMeetings = [];
let currentMeetingId = null;
let currentMeetingData = null;

async function loadMeetingList() {
  const res = await fetch(`${API_BASE}/api/meetings`);
  if (!res.ok) return;
  allMeetings = await res.json();
  renderMeetingList();
}

function renderMeetingList() {
  const query = (document.getElementById("history-search")?.value || "").toLowerCase().trim();
  const meetings = query
    ? allMeetings.filter((m) => m.filename.toLowerCase().includes(query))
    : allMeetings;

  if (meetings.length === 0) {
    meetingList.innerHTML = `<li class="empty-note">${query ? "No meetings match your search." : "Nothing yet — your first upload will show up here."}</li>`;
    return;
  }

  meetingList.innerHTML = "";
  meetings.forEach((m) => {
    const li = document.createElement("li");
    li.className = "meeting-item";
    const date = new Date(m.created_at + "Z").toLocaleString();
    li.innerHTML = `
      <span class="name">${escapeHtml(m.filename)}</span>
      <span class="meta">${date}</span>
      <span class="pill status-${m.status}">${m.status}</span>
      <button class="row-delete-btn" title="Delete">✕</button>
    `;
    li.addEventListener("click", async (e) => {
      if (e.target.closest(".row-delete-btn")) return;
      const detail = await fetch(`${API_BASE}/api/meetings/${m.id}`).then((r) => r.json());
      if (detail.status === "done" || detail.status === "failed") renderResults(detail);
    });
    li.querySelector(".row-delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${m.filename}"? This can't be undone.`)) return;
      await fetch(`${API_BASE}/api/meetings/${m.id}`, { method: "DELETE" });
      if (currentMeetingId === m.id) resultsPanel.hidden = true;
      loadMeetingList();
    });
    meetingList.appendChild(li);
  });
}

document.getElementById("history-search").addEventListener("input", renderMeetingList);

document.getElementById("retry-btn").addEventListener("click", async () => {
  if (!currentMeetingId) return;
  const res = await fetch(`${API_BASE}/api/meetings/${currentMeetingId}/retry`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Retry failed");
    return;
  }
  const meeting = await res.json();
  statusLine.hidden = false;
  statusText.textContent = STATUS_LABELS[meeting.status] || meeting.status;
  pollMeeting(meeting.id);
  loadMeetingList();
});

document.getElementById("delete-btn").addEventListener("click", async () => {
  if (!currentMeetingId) return;
  if (!confirm("Delete this meeting? This can't be undone.")) return;
  await fetch(`${API_BASE}/api/meetings/${currentMeetingId}`, { method: "DELETE" });
  resultsPanel.hidden = true;
  currentMeetingId = null;
  loadMeetingList();
});

document.getElementById("translate-btn").addEventListener("click", async () => {
  const lang = document.getElementById("translate-lang").value;
  if (!lang || !currentMeetingId) return;

  const btn = document.getElementById("translate-btn");
  btn.textContent = "Translating…";
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("target_language", lang);
    const res = await fetch(`${API_BASE}/api/meetings/${currentMeetingId}/translate`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Translation failed");
    }
    const translated = await res.json();
    applyTranslatedView(translated);
    document.getElementById("show-original-btn").hidden = false;
  } catch (e) {
    alert(e.message);
  } finally {
    btn.textContent = "Translate";
    btn.disabled = false;
  }
});

document.getElementById("show-original-btn").addEventListener("click", () => {
  if (currentMeetingData) renderResultsContent(currentMeetingData);
  document.getElementById("show-original-btn").hidden = true;
  document.getElementById("translate-lang").value = "";
});

function applyTranslatedView(translated) {
  const decisionsList = document.getElementById("decisions-list");
  decisionsList.innerHTML = translated.decisions.length
    ? translated.decisions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")
    : `<li class="empty-field">No explicit decisions detected.</li>`;

  const actionsList = document.getElementById("actions-list");
  actionsList.innerHTML = translated.action_items.length
    ? translated.action_items
        .map(
          (a) => `
      <li class="action-item">
        <span class="task">${escapeHtml(a.task)}</span>
        <span class="owner-due">${escapeHtml(a.owner || "unassigned")} · ${escapeHtml(a.due_date || "no due date")}</span>
      </li>`
        )
        .join("")
    : `<li class="empty-field">No action items detected.</li>`;

  document.getElementById("summary-text").textContent = translated.summary || "";
}
// ---- Results panel ----

function renderResults(meeting) {
  resultsPanel.hidden = false;
  currentMeetingId = meeting.id;
  currentMeetingData = meeting;
  document.getElementById("results-filename").textContent = meeting.filename;

  const statusPill = document.getElementById("results-status");
  statusPill.textContent = meeting.status;
  statusPill.className = `pill status-${meeting.status}`;

  document.getElementById("retry-btn").hidden = meeting.status !== "failed";
  document.getElementById("show-original-btn").hidden = true;
  document.getElementById("translate-lang").value = "";

  const errorCard = document.getElementById("error-card");
  const resultsGrid = document.getElementById("results-grid");
  const summaryCard = document.getElementById("summary-card");
  const transcriptDetails = document.getElementById("transcript-details");

  if (meeting.status === "failed") {
    errorCard.hidden = false;
    document.getElementById("error-text").textContent = meeting.error_message || "Unknown error.";
    resultsGrid.hidden = true;
    summaryCard.hidden = true;
    if (meeting.transcript) {
      transcriptDetails.hidden = false;
      document.getElementById("transcript-text").textContent = meeting.transcript;
    } else {
      transcriptDetails.hidden = true;
    }
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  errorCard.hidden = true;
  resultsGrid.hidden = false;
  summaryCard.hidden = false;
  transcriptDetails.hidden = false;

    renderResultsContent(meeting);
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResultsContent(meeting) {
  const decisionsList = document.getElementById("decisions-list");
  decisionsList.innerHTML = meeting.decisions.length
    ? meeting.decisions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")
    : `<li class="empty-field">No explicit decisions detected.</li>`;

  const actionsList = document.getElementById("actions-list");
  actionsList.innerHTML = meeting.action_items.length
    ? meeting.action_items
        .map(
          (a) => `
      <li class="action-item">
        <span class="task">${escapeHtml(a.task)}</span>
        <span class="owner-due">${escapeHtml(a.owner || "unassigned")} · ${escapeHtml(a.due_date || "no due date")}</span>
      </li>`
        )
        .join("")
    : `<li class="empty-field">No action items detected.</li>`;

  document.getElementById("summary-text").textContent = meeting.summary || "";
  document.getElementById("transcript-text").textContent = meeting.transcript || "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---- Init ----
loadMeetingList();
