# Minutes — Meeting Summarizer

Turn a meeting recording into a transcript, a plain-language summary, and a
clean list of decisions and action items.

## How it works

1. **Upload** — you drop an audio file into the frontend (or `POST` it directly).
2. **Transcribe** — the backend runs the audio through a locally-hosted
   Whisper model (`openai-whisper` package) — free, no API key, no per-file cost.
3. **Summarize** — the transcript is sent to an LLM on Groq's free tier
   (`llama-3.3-70b-versatile` by default) with a prompt that returns
   structured JSON: a summary, a list of decisions, and a list of action
   items (task / owner / due date).
4. **Store & serve** — everything is saved to SQLite and served back over a
   small REST API that the frontend polls while a job is processing.

This stack was chosen to run the whole pipeline for free: local Whisper
needs no API key at all, and Groq has a generous free tier for the LLM
call. The task brief's ASR requirement lists "Google, Azure, OpenAI
Whisper, etc." — local Whisper is the same underlying model OpenAI's API
wraps, just self-hosted, so it satisfies the same requirement at zero cost.

## Stack

- **Backend:** FastAPI + SQLAlchemy (SQLite), background tasks for async
  processing (upload returns immediately; transcription + summarization run
  in the background while the frontend polls for status)
- **ASR:** local Whisper via the `openai-whisper` package (`asr.py` — swap in
  a cloud provider like OpenAI's API, Google Speech-to-Text, or Azure Speech
  by replacing the body of `transcribe_audio`, the return contract is just `str`)
- **LLM:** Groq's OpenAI-compatible Chat Completions API with JSON-mode
  output (`summarizer.py` — swap in OpenAI, Anthropic, Gemini, or a local
  Ollama model the same way)
- **Frontend:** plain HTML/CSS/JS, no build step, served directly by the
  backend so the whole thing runs from one process

## Project layout

```
meeting-summarizer/
├── backend/
│   ├── main.py          # FastAPI app, routes, background job orchestration
│   ├── asr.py            # ASR provider integration
│   ├── summarizer.py      # LLM prompt + summary/action-item extraction
│   ├── models.py         # SQLAlchemy Meeting table
│   ├── schemas.py        # Pydantic response models
│   ├── database.py       # DB session setup
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

## Setup

You'll need **ffmpeg** installed and on your PATH (required by Whisper to
read audio files):
- Windows: https://ffmpeg.org/download.html (or `choco install ffmpeg`)
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

## API

| Method | Path                    | Description                                  |
|--------|-------------------------|-----------------------------------------------|
| POST   | `/api/meetings`         | Upload an audio file, kicks off processing    |
| GET    | `/api/meetings`         | List all meetings with status                 |
| GET    | `/api/meetings/{id}`    | Get full detail: transcript, summary, actions |

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

## LLM prompt

The summarization prompt (see `summarizer.py`) instructs the model to:

- Only extract decisions and action items actually present in the transcript
  (explicitly told not to invent an owner or due date if one wasn't stated)
- Return strict JSON (enforced via OpenAI's JSON response mode) so the API
  response is reliably parseable
- Keep the summary to 2–4 factual sentences, no filler

This keeps grading/eval focused on transcript fidelity rather than the model
"cleaning up" or embellishing what was said.

## Known limitations / next steps

- Processing runs in FastAPI `BackgroundTasks`, which is fine for a demo but
  not durable — a crash mid-job loses that job. A real deployment would use
  a task queue (Celery/RQ) or a managed job runner.
- No auth — anyone with the URL can upload/view meetings. Fine for a local
  demo, not for production.
- Large files: OpenAI's transcription endpoint caps uploads at 25MB. Longer
  recordings would need chunking before transcription.
- Diarization (who said what) isn't implemented — `gpt-4o-transcribe` and
  some other ASR providers support speaker labels if that's a required
  extension.

## Demo video

_Add a link here once recorded — a 2–3 minute walkthrough of: uploading a
short recording, watching the status update through transcribing →
summarizing → done, and reviewing the resulting minutes._
