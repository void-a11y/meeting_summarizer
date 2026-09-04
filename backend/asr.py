"""
ASR integration — local Whisper (openai-whisper package).

Runs entirely on your machine, no API key and no cost. The model is
downloaded once (cached locally) the first time you transcribe.

Requires ffmpeg to be installed and on your PATH:
  - Windows: https://ffmpeg.org/download.html (or `choco install ffmpeg`)
  - Mac: `brew install ffmpeg`
  - Linux: `apt install ffmpeg`

Model sizes (speed vs. accuracy tradeoff), set via WHISPER_MODEL_SIZE:
  tiny < base < small < medium < large
"base" is a good default for a laptop with no GPU.

To swap in a cloud ASR provider (OpenAI's API, Google, Azure) instead,
replace the body of `transcribe_audio` below and keep the same
(text: str) return contract -- nothing else in the app needs to change.
"""
import os
import whisper

_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
_model = None  # loaded lazily so app startup doesn't pay the load cost


def _get_model():
    global _model
    if _model is None:
        _model = whisper.load_model(_MODEL_SIZE)
    return _model


def transcribe_audio(file_path: str, language: str = None) -> str:
    """Transcribe an audio file locally and return the plain-text transcript.
    If language is None, Whisper auto-detects it -- which can misfire on short
    or accented clips. Passing an explicit language code (e.g. "hi", "es",
    "fr") skips detection and is much more reliable."""
    model = _get_model()
    result = model.transcribe(file_path, language=language)
    return result["text"].strip()