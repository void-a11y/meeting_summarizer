// Offscreen document -- the only place in a Manifest V3 extension that can
// actually touch media streams (getUserMedia/MediaRecorder). It lives
// independently of the popup, so it keeps recording even if the popup closes.

let mediaRecorder = null;
let recordedChunks = [];
let audioContext = null;
let apiBaseUrl = "http://localhost:8000";

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;

  if (message.type === "start-recording") {
    apiBaseUrl = message.apiBaseUrl || apiBaseUrl;
    startRecording(message.streamId, message.tabTitle);
  } else if (message.type === "stop-recording") {
    stopRecording();
  }
});

async function startRecording(streamId, tabTitle) {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
  });

  // Capturing a tab's audio via getUserMedia silences it for the user unless
  // we explicitly route the captured stream back out to speakers.
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(media);
  source.connect(audioContext.destination);

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(media, { mimeType: "audio/webm" });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    media.getTracks().forEach((t) => t.stop());
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    await uploadRecording(blob, tabTitle);
  };
  mediaRecorder.start();

  reportStatus({ status: "recording" });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

async function uploadRecording(blob, tabTitle) {
  reportStatus({ status: "uploading" });
  try {
    const formData = new FormData();
    const safeName = (tabTitle || "recording").replace(/[^a-z0-9]/gi, "_").slice(0, 60);
    formData.append("file", blob, `${safeName}.webm`);

    const res = await fetch(`${apiBaseUrl}/api/meetings`, { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    const meeting = await res.json();
    reportStatus({ status: "processing", meetingId: meeting.id });
  } catch (err) {
    reportStatus({ status: "failed", error: err.message });
  }
}

function reportStatus(state) {
  chrome.runtime.sendMessage({ target: "background-status", state });
}
