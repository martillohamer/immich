# Design: ML Service — POST /transcribe (faster-whisper, idioma es)

**Fecha:** 2026-09-25
**Ámbito:** `machine-learning/` (FastAPI, faster-whisper, CTranslate2). Fork local de Immich v3.2.0.
**Estado:** diseño aprobado por el usuario (Opción A) — en implementación TDD.

## Objetivo

Añadir al microservicio Python `machine-learning/` el endpoint `POST /transcribe` que convierte bytes de audio en texto transcrito por **faster-whisper** (CTranslate2), para que el worker NestJS (pipeline BullMQ `transcription`) obtenga `{ text, segments, language, model }` y la persista en `asset_transcript` / `transcript_search`.

## Decisiones acordadas (aprobadas por el usuario)

1. **Opción A — módulo dedicado** (`immich_ml/transcribe.py`), independiente de `ModelTask`/`ModelType`/`ModelCache` (faster-whisper es CTranslate2, no ONNX gestionado por `InferenceModel`). Se rechazaron: forzar whisper en `InferenceModel` (B) y carga por-request sin caché (C).
2. **Caché en memoria global:** `dict` + `threading.Lock`, carga lazy de `WhisperModel`, `download_root=settings.cache_folder`. Sin TTL (patrón `ModelCache` NO se usa; el bucle `idle_shutdown_task` no aplica a whisper).
3. **Defaults (configurables por env):** modelo `small`, device `cpu`, compute `int8`, idioma `es`, `vad_filter=True`.
4. **Decodificación de audio** mediante `io.BytesIO(audio)` — PyAV (transitivo de faster-whisper) maneja m4a/mp3/mp4/wav. Sin binario ffmpeg externo.
5. **Formato de respuesta:** segmentos `{ start, end, text }` (start/end redondeados a 3 decimales), texto global = `" ".join(...)` de los segmentos con `.strip()` por segmento (para indexación trigram posterior; se descarta `"\n".join`).
6. **Concurrencia:** transf/downstream vía `run(...)`/`thread_pool` existente (`immich_ml/main.py:215-219`), como el resto de inferencias bloqueantes.
7. **Dependencia:** `faster-whisper>=1.1.0` en `dependencies` de `machine-learning/pyproject.toml`.

## Contrato (fijado por el server, ya implementado)

Consumidor NestJS (`server/src/repositories/machine-learning.repository.ts:232-263`):

- `POST /transcribe` (multipart/form-data):
  - `audio`: file (bytes crudos leídos de `asset.originalPath` vía `readFile`).
  - `model`: string, p. ej. `small` (viene de `config.machineLearning.transcription.modelName`).
  - `language`: string, default `es` en el cliente y en el server.
- Respuesta `200 OK` JSON:
  ```json
  { "text": "string", "segments": [{ "start": 0.0, "end": 2.5, "text": "..." }], "language": "es", "model": "small" }
  ```
- Errores: cualquier status no-OK hace que el cliente marque la URL unhealthy y pruebe la siguiente; tras agotar todas lanza `Error`. El microservicio debe responder `400` (audio vacío) / `500` (fallo de inferencia) con `detail` legible.

## Arquitectura

```
worker NestJS ──POST /transcribe (multipart: audio, model, language)──► machine-learning:3003
        ◄── 200 { text, segments[{start,end,text}], language, model } ─────────┘
                │
                ├─ main.py: endpoint async → run(transcribe_audio, ...) → thread_pool
                └─ transcribe.py: Caché global dict + Lock → WhisperModel(small, int8, cpu)
                                       → model.transcribe(BytesIO(audio), language='es', vad_filter=True)
```

## Implementación

### `machine-learning/immich_ml/config.py` (modificar)

Añadir a `Settings` (env prefix `MACHINE_LEARNING_` ya configurado en `model_config`):

```python
transcription_model: str = "small"
transcription_language: str = "es"
transcription_device: str = "cpu"
transcription_compute_type: str = "int8"
transcription_vad_filter: bool = True
```

Vars de entorno resultantes: `MACHINE_LEARNING_TRANSCRIPTION_MODEL`, `..._LANGUAGE`, `..._DEVICE`, `..._COMPUTE_TYPE`, `..._VAD_FILTER`.

### `machine-learning/immich_ml/transcribe.py` (nuevo)

```python
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


def transcribe_audio(
    audio: bytes,
    model: str | None,
    language: str | None,
) -> dict[str, Any]:
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
```

### `machine-learning/immich_ml/main.py` (modificar)

Añadir import y endpoint (estilo de `/predict`, `main.py:166-182`):

```python
from .transcribe import transcribe_audio

@app.post("/transcribe", dependencies=[Depends(update_state)])
async def transcribe(
    audio: bytes = File(...),
    model: str | None = Form(default=None),
    language: str | None = Form(default=None),
) -> ORJSONResponse:
    if not audio:
        raise HTTPException(400, "Empty audio")
    try:
        response = await run(transcribe_audio, audio, model, language)
    except Exception as e:
        log.error(f"Failed to transcribe audio: {e}")
        raise HTTPException(500, "Failed to transcribe audio") from e
    return ORJSONResponse(response)
```

### `machine-learning/pyproject.toml` (modificar)

Añadir `"faster-whisper>=1.1.0",` a `[project].dependencies`. Regenerar `uv.lock` con `uv sync` / `uv lock`.

**Advertencia validada:** `faster-whisper` arrastra `ctranslate2` y `av` (PyAV). En la máquina local (Windows, Python ≥3.12) comprobar disponibilidad de wheels al hacer `uv sync`; en contenedores Docker se resuelve con los extras existentes (`cpu`, etc.).

## Testing (TDD)

En `machine-learning/test_main.py`, sin descargar modelos en CI — stub de `WhisperModel`:

1. `POST /transcribe` con audio válido (mockeando `immich_ml.transcribe.WhisperModel`) → `200`, claves `text`, `segments`, `language`, `model`.
2. `text` = unión con espacio de segmentos `.strip()`eado; segmentos con `start < end` y timestamps float.
3. Request sin campo `audio` → el cliente replica el contrato real (multipart sin audio) → el server de FastAPI responde 422; con `audio=b""` → `400`.
4. Modelo cacheado: dos llamadas con el mismo `model` → `WhisperModel` instanciado una sola vez.
5. Fallo de `transcribe` (excepción) → `500`.
6. Envío los parámetros `model`/`language` del form llegan a `transcribe_audio`.

Fixture útil en `conftest.py` (patrón `ort_session`): patch `immich_ml.transcribe.WhisperModel` con autospec y `return_value.transcribe.return_value = (generator, info)`.

## Verificación

- `cd machine-learning && uv run pytest -q` (toda la suite existente + nuevos tests).
- `cd machine-learning && uv run ruff check .`
- `cd machine-learning && uv run mypy immich_ml test_main.py`
- No romper el baseline del server (sin tocar `server/`).

## Restricciones

- NO commitear: `mise.lock`, `open-api/immich-openapi-specs.json`, `docs/superpowers/**`.
- Sin push/merge sin confirmación del usuario.
- Tipado estricto (mypy `disallow_untyped_defs`), cero comentarios redundantes, código documentado en español.
- Este capítulo cierra la Etapa 2 del plan (ML service python `/transcribe`); búsqueda y frontend son fases posteriores (fuera de alcance aquí).

## Fuera de alcance

- Autodetección de idioma / lenguas múltiples por job.
- Streaming/pedación de transcripción.
- TTL/descarga inactiva de whisper (modelo cargado toda la vida del worker; rehenes de RAM ~1GB en `small` int8).