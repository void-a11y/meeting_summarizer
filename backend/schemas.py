import json
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ActionItem(BaseModel):
    task: str
    owner: Optional[str] = None
    due_date: Optional[str] = None


class MeetingOut(BaseModel):
    id: int
    filename: str
    status: str
    error_message: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    decisions: List[str] = []
    action_items: List[ActionItem] = []
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_model(cls, m):
        return cls(
            id=m.id,
            filename=m.filename,
            status=m.status,
            error_message=m.error_message,
            transcript=m.transcript,
            summary=m.summary,
            decisions=json.loads(m.decisions_json) if m.decisions_json else [],
            action_items=json.loads(m.action_items_json) if m.action_items_json else [],
            created_at=m.created_at,
            updated_at=m.updated_at,
        )

    class Config:
        from_attributes = True


class MeetingListItem(BaseModel):
    id: int
    filename: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
