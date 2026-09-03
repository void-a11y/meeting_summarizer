
## Setup

You'll need **ffmpeg** installed and on your PATH (required by Whisper to
read audio files):
- Windows: https://ffmpeg.org/download.html, or `winget install "FFmpeg (Essentials Build)"`
- Mac: `brew install ffmpeg`
- Linux: `apt install ffmpeg`

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and set GROQ_API_KEY (free key from https://console.groq.com/keys)
```

The first transcription will download the Whisper model (~140MB for
`base`), which is cached locally afterward.

## Run

```bash
cd backend
uvicorn main:app --reload
```

Open **http://localhost:8000** — the backend serves the frontend directly,
so there's nothing else to start.

## Features

- **Upload & process** — drag-and-drop audio, watch status move through
  transcribing → summarizing → done
- **Retry** — if a job fails (e.g. a bad API key, a renamed model), fix the
  cause and retry in place without re-uploading the file
- **Delete** — remove a meeting and its stored audio file
- **Search** — the history list searches filenames *and* transcript/summary
  content, not just titles
- **Translate** — translate a completed meeting's summary, decisions, and
  action items into another language on demand, with a one-click return to
  the original
- **Visible error messages** — a failed job shows the actual error (e.g. an
  invalid model name) in the UI, not just a generic "Failed" status

## API

| Method | Path                                    | Description                                     |
|--------|------------------------------------------|--------------------------------------------------|
| POST   | `/api/meetings`                          | Upload an audio file, kicks off processing        |
| GET    | `/api/meetings?q=...`                    | List meetings, optionally searching filename/transcript/summary |
| GET    | `/api/meetings/{id}`                     | Get full detail: transcript, summary, actions     |
| POST   | `/api/meetings/{id}/retry`               | Re-run a failed (or any) meeting                  |
| DELETE | `/api/meetings/{id}`                     | Delete a meeting and its stored audio             |
| POST   | `/api/meetings/{id}/translate`           | Translate summary/decisions/actions (form field: `target_language`) |

Supported audio formats: `.mp3 .mp4 .wav .m4a .webm .mpeg .mpga`

### Example

```bash
curl -X POST http://localhost:8000/api/meetings \
  -F "file=@standup.mp3"

curl http://localhost:8000/api/meetings/1
```

Response once processing finishes:

```json
{
  "id": 1,
  "filename": "standup.mp3",
  "status": "done",
  "transcript": "...",
  "summary": "The team agreed to ship the auth refactor by Friday...",
  "decisions": ["Ship the auth refactor by Friday", "Use Postgres over DynamoDB"],
  "action_items": [
    {"task": "Write migration script", "owner": "Priya", "due_date": "Thursday"},
    {"task": "Update API docs", "owner": null, "due_date": null}
  ]
}
```

## LLM prompt design

The summarization prompt (see `summarizer.py`) instructs the model to:

- Only extract decisions and action items actually present in the
  transcript — explicitly told not to invent an owner or due date if one
  wasn't stated
- Return strict JSON (enforced via Groq's JSON response mode) so the API
  response is reliably parseable
- Keep the summary to 2–4 factual sentences, no filler

This keeps grading/eval focused on transcript fidelity rather than the model
"cleaning up" or embellishing what was said. See `/examples` for real
output on both a near-empty test clip (verifies no hallucination) and a
substantive real meeting (verifies correct extraction of real content).

## Examples

`/examples` contains real input/output pairs so summarization quality can
be judged without running the app:

- `01-minimal-recording` — a near-empty test clip. Confirms the model
  returns empty decisions/action-items instead of inventing content when
  the transcript doesn't support any.
- `02-product-design-kickoff` — an ~11-minute real business meeting from
  the AMI Meeting Corpus (CC BY 4.0). Confirms extraction of real decisions
  (pricing, targets, constraints) and action items with correctly
  identified owners.

<!-- ## Known limitations / next steps

- Processing runs in FastAPI `BackgroundTasks`, which is fine for a demo but
  not durable — a crash mid-job loses that job. A real deployment would use
  a task queue (Celery/RQ) or a managed job runner.
- No auth — anyone with the URL can upload/view meetings. Fine for a local
  demo, not for production.
- Large files: local Whisper can handle longer files than a cloud API's
  25MB cap, but very long recordings (an hour+) will be slow to transcribe
  on CPU without a GPU.
- Diarization (who said what) isn't implemented — some Whisper variants and
  other ASR providers support speaker labels if that's a required extension.
- Translation calls the LLM once per decision/action item plus the summary,
  which is simple and reliable but not the most token-efficient approach
  for very long transcripts — a single batched translation call would scale
  better. -->

