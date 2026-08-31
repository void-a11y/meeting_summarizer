"""
LLM-based summary + action item extraction -- Groq (free tier).

Groq's API is OpenAI-compatible, so this looks almost identical to an
OpenAI integration, just pointed at Groq's endpoint with a Groq model.
Get a free API key at https://console.groq.com/keys

Swappable: replace `client`/the model call below with any other
provider (OpenAI, Gemini, a local Ollama model, Anthropic, etc.) as
long as `summarize_transcript` keeps returning the same dict shape.
"""
import os
import json
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = (
    "You are an assistant that turns raw meeting transcripts into crisp, "
    "action-oriented meeting minutes. You are precise and never invent "
    "information that isn't supported by the transcript. If the transcript "
    "is too short or unclear to extract something, return an empty list "
    "for that field rather than guessing."
)

USER_PROMPT_TEMPLATE = """Summarize the following meeting transcript.

Return ONLY valid JSON (no markdown fences, no commentary) matching this shape:
{{
  "summary": "2-4 sentence plain-language summary of what the meeting covered",
  "decisions": ["decision 1", "decision 2"],
  "action_items": [
    {{"task": "what needs to be done", "owner": "person responsible or null", "due_date": "deadline mentioned or null"}}
  ]
}}

Rules:
- "decisions" = concrete choices or agreements made during the meeting.
- "action_items" = concrete follow-up tasks, each with an owner if one was named in the transcript.
- If no owner or due date was mentioned for a task, use null for that field -- don't invent one.
- Keep the summary factual and free of filler.

Transcript:
\"\"\"
{transcript}
\"\"\"
"""


def summarize_transcript(transcript: str) -> dict:
    """Call the LLM and return {summary, decisions, action_items}."""
    response = client.chat.completions.create(
        model=SUMMARY_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(transcript=transcript)},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Defensive fallback in case the model wraps output in fences despite instructions
        cleaned = raw.strip().strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        data = json.loads(cleaned)

    return {
        "summary": data.get("summary", ""),
        "decisions": data.get("decisions", []) or [],
        "action_items": data.get("action_items", []) or [],
    }
