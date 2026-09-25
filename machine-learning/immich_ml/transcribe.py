import threading
from io import BytesIO
from typing import Any

from faster_whisper import WhisperModel

from .config import log, settings

_transcription_models: dict[str, WhisperModel] = {}
_transcription_lock = threading.Lock()


def get_whisper_model(model: str) -> WhisperModel:
    if model not in _transcription_models:
        with _transcription_lock:
            if model not in _transcription_models:
                log.info(f"Loading faster-whisper model '{model}' ...")
                _transcription_models[model] = WhisperModel(
                    model,
                    device=settings.transcription_device,
                    compute_type=settings.transcription_compute_type,
                    download_root=settings.cache_folder,
                )
    return _transcription_models[model]


def transcribe_audio(audio: bytes, model: str | None, language: str | None) -> dict[str, Any]:
    whisper_model = get_whisper_model(model or settings.transcription_model)
    segments_iter, info = whisper_model.transcribe(
        BytesIO(audio),
        language=language or settings.transcription_language,
        vad_filter=settings.transcription_vad_filter,
        without_timestamps=False,
    )
    segments = [
        {"start": round(segment.start, 3), "end": round(segment.end, 3), "text": segment.text.strip()}
        for segment in segments_iter
    ]
    text = " ".join(segment["text"] for segment in segments).strip()
    return {
        "text": text,
        "segments": segments,
        "language": info.language or language or settings.transcription_language,
        "model": model or settings.transcription_model,
    }
