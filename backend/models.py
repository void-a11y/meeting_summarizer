import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from database import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    status = Column(String, default="uploaded")  # uploaded, transcribing, summarizing, done, failed
    error_message = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)

    transcript = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    decisions_json = Column(Text, nullable=True)      # JSON-encoded list[str]
    action_items_json = Column(Text, nullable=True)   # JSON-encoded list[{task, owner, due_date}]

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
