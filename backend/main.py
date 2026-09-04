import os
import json
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Meeting
from schemas import MeetingOut, MeetingListItem
from asr import transcribe_audio
from summarizer import summarize_transcript
from translator import translate_text
from typing import Optional

Base.metadata.create_all(bind=engine)

STORAGE_DIR = Path(__file__).parent / "storage"
STORAGE_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".mp4", ".wav", ".m4a", ".webm", ".mpeg", ".mpga"}

app = FastAPI(title="Meeting Summarizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def process_meeting(meeting_id: int, file_path: str, language: str = None):
    """Background job: transcribe, then summarize, updating status as it goes."""
    db = next(get_db())
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    try:
        meeting.status = "transcribing"
        db.commit()

        transcript = transcribe_audio(file_path, language=language) 
        meeting.transcript = transcript
        meeting.status = "summarizing"
        db.commit()

        result = summarize_transcript(transcript)
        meeting.summary = result["summary"]
        meeting.decisions_json = json.dumps(result["decisions"])
        meeting.action_items_json = json.dumps(result["action_items"])
        meeting.status = "done"
        db.commit()
    except Exception as e:
        meeting.status = "failed"
        meeting.error_message = str(e)
        db.commit()
    finally:
        db.close()


@app.post("/api/meetings", response_model=MeetingListItem)
def upload_meeting(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source_language: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    saved_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = STORAGE_DIR / saved_name
    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    meeting = Meeting(filename=file.filename, status="uploaded",file_path=str(dest_path))
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    background_tasks.add_task(process_meeting, meeting.id, str(dest_path), source_language)

    return meeting


@app.get("/api/meetings", response_model=list[MeetingListItem])
def list_meetings(db: Session = Depends(get_db)):
    return db.query(Meeting).order_by(Meeting.created_at.desc()).all()


@app.get("/api/meetings/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return MeetingOut.from_orm_model(meeting)

@app.post("/api/meetings/{meeting_id}/translate")
def translate_meeting(meeting_id: int, target_language: str = Form(...), db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.status != "done":
        raise HTTPException(status_code=400, detail="Meeting isn't summarized yet")

    decisions = json.loads(meeting.decisions_json) if meeting.decisions_json else []
    action_items = json.loads(meeting.action_items_json) if meeting.action_items_json else []

    translated_summary = translate_text(meeting.summary or "", target_language)
    translated_decisions = [translate_text(d, target_language) for d in decisions]
    translated_actions = [
        {**a, "task": translate_text(a.get("task", ""), target_language)} for a in action_items
    ]

    return {
        "target_language": target_language,
        "summary": translated_summary,
        "decisions": translated_decisions,
        "action_items": translated_actions,
    }

@app.post("/api/meetings/{meeting_id}/retry", response_model=MeetingListItem)
def retry_meeting(meeting_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not meeting.file_path or not Path(meeting.file_path).exists():
        raise HTTPException(status_code=400, detail="Original audio file no longer exists on disk, can't retry")

    meeting.status = "uploaded"
    meeting.error_message = None
    meeting.transcript = None
    meeting.summary = None
    meeting.decisions_json = None
    meeting.action_items_json = None
    db.commit()
    db.refresh(meeting)

    background_tasks.add_task(process_meeting, meeting.id, meeting.file_path)
    return meeting


@app.delete("/api/meetings/{meeting_id}")
def delete_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.file_path and Path(meeting.file_path).exists():
        Path(meeting.file_path).unlink()

    db.delete(meeting)
    db.commit()
    return {"deleted": True, "id": meeting_id}

# Serve the simple frontend directly from the backend for one-command demos
frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
