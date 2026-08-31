"""
Translation -- reuses the same Groq LLM already used for summarization,
so no new API key or service is needed.
"""
import os
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
TRANSLATE_MODEL = os.getenv("SUMMARY_MODEL", "openai/gpt-oss-120b")


def translate_text(text: str, target_language: str) -> str:
    """Translate arbitrary text to the target language. Returns translated text only."""
    if not text:
        return ""

    response = client.chat.completions.create(
        model=TRANSLATE_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a precise translator. Translate the user's text into "
                    f"{target_language}. Return ONLY the translated text -- no notes, "
                    "no explanations, no markdown, no quotation marks around it."
                ),
            },
            {"role": "user", "content": text},
        ],
        temperature=0.1,
    )
    return response.choices[0].message.content.strip()