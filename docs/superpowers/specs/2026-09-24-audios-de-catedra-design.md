# Design: Audios de Cátedra — Audio-to-Knowledge (rebane vertical Fase 1)

**Fecha:** 2026-09-24
**Ámbito:** `server/` (NestJS 12, PostgreSQL 14, BullMQ/Redis) + `machine-learning/` (FastAPI, faster-whisper) + `web/` (SvelteKit 5). Fork local de Immich v3.2.0.
**Estado:** no implementado — diseño aprobado por el usuario, listo para plan de implementación.

## Objetivo

Permitir subir audios (notas de voz, clases grabadas, audiolibros) y convertirlos automáticamente en conocimiento consultable:

1. Subida y almacenamiento de audio como `AssetType.Audio` (MIME desbloqueado).
2. Transcripción automática local con **faster-whisper** (CPU, idioma español fijo), ejecutada por el pipeline BullMQ in-process.
3. Búsqueda de texto completo (GIN trigram, `f_unaccent`) sobre las transcripciones desde la barra de búsqueda general.
4. `AudioViewer` en el frontend con reproductor nativo y transcripción sincronizada en tiempo real.

## Decisiones acordadas

1. **Alcance:** rebanada vertical mínima end-to-end (backend + pipeline + frontend). Sin embeddings semánticos en Fase 1.
2. **Hardware:** CPU. `faster-whisper` (CTranslate2), modelo `small`, `compute_type='int8'`.
3. **Búsqueda:** texto completo trigram (GIN `f_unaccent` + `gin_trgm_ops`), replicando `ocr_search`. La semántica (embeddings) queda como fase posterior.
4. **Modelo de datos:** tablas dedicadas nuevas `asset_transcript` (JSONB con segmentos) + `transcript_search` (plana con GIN), patrón exacto de `asset_ocr`/`ocr_search`. Nueva columna `transcribedAt` en `asset_job_status`.
5. **Motor Whisper:** integrado en el servicio ML existente (`machine-learning/` FastAPI), expuesto como endpoint HTTP consumido por el worker.
6. **Frontend:** `AudioViewer.svelte` dedicado, registrado en `AssetViewer`, con reproductor `<audio>` + transcripción sincronizada al `currentTime`.
7. **Idioma:** `language='es'` fijo. La subida interrumpe el upload estándar de Immich, clasificando por MIME como `AssetType.Audio`.

## Arquitectura

```
                    ┌─────────────────────────────────────────────┐
                    │  WEB (SvelteKit)                            │
                    │  ├─ AudioViewer.svelte (NUEVO)              │
                    │  │   └─ <audio> + transcripción sincronizada│
                    │  └─ SearchBar (búsqueda de texto existente) │
                    └───────────────▲─────────────────────────────┘
                                    │ REST (arquitectura existente)
                    ┌───────────────┴─────────────────────────────┐
                    │  API (NestJS)  ── controllers/services      │
                    │  TranscriptionService + repós (nuevos)      │
                    └───────────────▲─────────────────────────────┘
                                    │ BullMQ (Redis), queue 'transcription'
                    ┌───────────────┴─────────────────────────────┐
                    │  Microservices (worker NestJS in-process)   │
                    │  └─ JobName.Transcription / QueueAll        │
                    └───────────────▲─────────────────────────────┘
                                    │ HTTP (MachineLearningRepository)
                    ┌───────────────┴─────────────────────────────┐
                    │  machine-learning (FastAPI)                 │
                    │  └─ POST /transcribe (faster-whisper, es)   │
                    └─────────────────────────────────────────────┘
```

### Flujo principal

1. El usuario sube `clase-2.mp3` por el upload estándar ► `mimeTypes.assetType()` devuelve `AssetType.Audio` ► se crea el asset (enum ya existente).
2. Al completarse la subida se encola `JobName.Transcription` con el `assetId` (queue `transcription`).
3. El worker in-process recibe el job, recupera el `originalPath` del asset, lo envía por HTTP a `machine-learning:3003/transcribe`.
4. El ML service corre faster-whisper (`language='es'`, CPU/int8) y devuelve texto plano + segmentos `{start,end,text}`.
5. El worker persiste en `asset_transcript` (1:1) y reescribe `transcript_search`, marcando `transcribedAt`.
6. Frontend: `AudioViewer` reproduce el original y sincroniza la transcripción con `currentTime`.

## Sección B — Modelo de datos

### Nueva tabla `asset_transcript` (1:1 con asset)

| Columna | Tipo | Notas |
|---|---|---|
| `assetId` | uuid PK, FK→`asset` ON DELETE CASCADE | 1:1 |
| `text` | text NOT NULL | transcripción completa |
| `segments` | jsonb NOT NULL | `[{ start, end, text }]` de faster-whisper |
| `language` | varchar(2) DEFAULT 'es' | fijo en Fase 1 |
| `model` | varchar(50) | audit, ej. `faster-whisper-small` |
| `createdAt` / `updatedAt` | timestamptz | |

### Nueva tabla `transcript_search` (réplica de `ocr_search`)

| Columna | Tipo |
|---|---|
| `assetId` | uuid PK |
| `asset_transcript_id` | uuid FK→`asset_transcript` |
| `text` | text (denormalizado, tokenizado) |
| Índice | **GIN `f_unaccent("text") gin_trgm_ops`** |

### Modificaciones

- `asset_job_status`: **nueva columna** `transcribedAt timestamp with time zone nullable` (flag del job, gemelo de `ocrAt`).

### Código backend asociado

- `server/src/utils/mime-types.ts`: mapa `audio` (`.mp3/.wav/.m4a/.ogg/.aac/.flac`) + `isAudio` + `assetType()` → `AssetType.Audio`. Hoy `assetType()` solo devuelve Image/Video/Other. (`AssetType.Audio` ya existe en el enum.)
- Migraciones con el patrón `@immich/sql-tools` (`server/src/schema/migrations/`): 3 scripts (dos tablas + columna).

## Sección C — Pipeline de segundo plano

### C.1 Registro del job (adiciones en `server/src/enum.ts`)

```ts
// QueueName (junto a Ocr = 'ocr')
Transcription = 'transcription',

// JobName (junto al bloque // OCR)
TranscriptionQueueAll = 'TranscriptionQueueAll',
Transcription = 'Transcription',
```

Nuevo `TranscriptionService` (`server/src/services/transcription.service.ts`), gemelo de `OcrService` (`server/src/services/ocr.service.ts`):

- `@OnJob({ name: JobName.TranscriptionQueueAll, queue: QueueName.Transcription })` → `handleQueueTranscription`: si `!isTranscriptionEnabled(machineLearning)` → `Skipped`; `if (force) transcriptRepository.deleteAll()`; `streamForTranscriptionJob(force)` + `queueAll` (patrón `ocr.service.ts:14-28`).
- `@OnJob({ name: JobName.Transcription, queue: QueueName.Transcription })` → `handleTranscription`: valida visibilidad, obtiene el asset con `getForTranscription(id)` (**`originalPath` + `originalFileName`**, no `previewFile` como OCR), llama al ML service, persiste y marca estado (patrón `ocr.service.ts:31-55`).

Registro automático: al ser `@Injectable()` en el mismo árbol que `OcrService`, BullMQ lo descubre (mecanismo `OnJob`).

### C.2 Lectura del audio por el worker

- Diferencia clave vs OCR: `ocr.service.ts:39` usa `asset.previewFile` (imagen). Whisper necesita el **archivo de audio completo**: se lee `asset.originalPath` desde el storage local.
- `AssetJobRepository.getForTranscription(id)`: shape de `getForOcr` pero resolviendo `originalPath`, `originalFileName`, `visibility`, `ownerId`.
- El `MachineLearningRepository` hace `readFile(asset.originalPath)` (`node:fs/promises` ya importado en `machine-learning.repository.ts:2`) y construye el FormData.

### C.3 Endpoint ML service (`machine-learning/immich_ml/main.py`)

faster-whisper **no encaja** en el esquema `ModelTask/ModelType/model_cache` (es CTranslate2, no ONNX gestionado por `InferenceModel`), por lo que se añade un endpoint dedicado con el estilo del `predict` existente:

```python
@app.post("/transcribe")
async def transcribe(audio: bytes = File(...)) -> ORJSONResponse:
    model = get_whisper_model(model_name=settings.transcription.model,
                              device="cpu", compute_type="int8")
    run_args = dict(language="es", vad_filter=True, without_timestamps=False)
    segments_iter, info = model.transcribe(BytesIO(audio), **run_args)
    text, segments = "", []
    for s in segments_iter:
        text += s.text
        segments.append({"start": s.start, "end": s.end, "text": s.text.strip()})
    return ORJSONResponse({"text": text, "segments": segments,
                           "language": info.language,
                           "model": settings.transcription.model})
```

Detalles:

- **Thread safety:** ejecutar dentro de `run()`/`thread_pool` existente (`main.py:215-219`), como el resto de inferencias bloqueantes.
- **Dependencia:** `faster-whisper` en `machine-learning/pyproject.toml`.
- **Modelo:** `small` por defecto (462M params, CPU viable, bueno para contenido de aula en español); configurable vía `settings.transcription.model` (env `MACHINE_LEARNING_TRANSCRIPTION_MODEL`).
- **`vad_filter=True`:** recorta silencios (mejora en audios de aula con ruido).
- **TTL/caché:** el modelo se cachea en memoria respetando `settings.model_ttl`; se recarga a demanda (comportamiento del `model_cache` existente).

### C.4 Persistencia + estado del job

Nuevo `TranscriptionRepository` (`server/src/repositories/transcription.repository.ts`), especular de `ocr.repository.ts`:

- `upsert(assetId, { text, segments, language, model })`: `INSERT ... ON CONFLICT (assetId) DO UPDATE` en `asset_transcript` + reescritura de `transcript_search` (delete + insert con `tokenizeForSearch(text)` — util ya usada en `ocr.service.ts:77`).
- `deleteAll()` para modo `force`.
- `searchText` = `tokenizeForSearch(fullText).join(' ')` (normalización alias f_unaccent/trigram).

Fin de job (gemelo de `ocr.service.ts:51`):

```ts
await this.assetRepository.upsertJobStatus({ assetId: id, transcribedAt: new Date() });
```

**Endpoint de lectura nuevo:** `GET /transcript/:assetId` → `{ text, segments, language, model }`. DTO de solo lectura, sin campos sensibles.

**Config:** bloque `transcription: { enabled: true, model: 'small' }` en la config de ML (`isTranscriptionEnabled = enabled && transcription.enabled`), espejo de `isOcrEnabled`.

## Sección D — Integración frontend

### D.1 `AudioViewer.svelte` en el ecosistema de assets

El dispatch se resuelve en `AssetViewer.svelte` por `viewerKind` calculado de `asset.type` (`AssetViewer.svelte:431-448`). Adición:

```ts
if (asset.type === AssetTypeEnum.Audio) {
  return 'AudioViewer';
}
```

Nuevo archivo `web/src/lib/components/asset-viewer/AudioViewer.svelte`:

- **Reproductor:** `<audio controls src={getAssetFileUrl(asset)}>` + control de velocidad (`playbackRate`: 0.75 / 1 / 1.25 / 1.5 / 2) para `AssetType.Audio`. Reutiliza `getAssetFileUrl` (stream del original; el audio no necesita HLS en Fase 1).
- **Transcripción sincronizada:** al montar, `GET /transcript/:assetId`. Renderiza segmentos; sobre `timeupdate` del `<audio>` calcula el segmento activo (`currentTime >= start && currentTime < end`), resalta con clase CSS e auto-scroll (`scrollIntoView({ block: 'center', behavior: 'smooth' })`). Click en segmento → `audio.currentTime = start` + `play()`.
- Componentes a imitar: `VideoNativeViewer.svelte` (reproductor + eventos de tiempo) y `OcrBoundingBox.svelte` (render condicional de datos analíticos).
- `AudioViewer.spec.ts`: segmento activo / speed control / click-to-seek.

### D.2 Búsqueda de texto dentro de transcripciones

La `SearchBar` general ya dispara metadata search y el OCR ya indexa texto libre de esta forma — la transcripción se integra con el mismo mecanismo, **sin UI nueva**:

1. **Backend** (`server/src/repositories/search.repository.ts`): en `searchMetadataV3` (string-similarity) existe la subquery sobre `ocr_search` con `f_unaccent(...) %>> f_unaccent($4)`. Se añade una **subquery equivalente** sobre `transcript_search` combinada con `or`, aceptando `transcript?: string` en `SearchMetadataOptions` (`search.repository.ts:98-99`) y wire en `MetadataSearchDto`.
2. **Frontend:** cero cambios de UI; la barra general ya manda `q` al endpoint de metadatos y la grilla renderiza assets (incl. thumbnails de audio).
3. Futuro (fuera de Fase 1): "saltar al segmento desde los resultados" — ya cubierto por el click-to-seek del viewer D.1.

## Testing (TDD)

### a) `server/src/services/transcription.service.spec.ts` (nuevo)

1. `handleTranscription` con ML deshabilitado → `JobStatus.Skipped` (sin llamadas al repo de ML).
2. Asset sin `originalPath` o visibilidad Hidden → `JobStatus.Failed`/`Skipped`.
3. Flujo feliz: mock `machineLearningRepository.transcribe` → devuelve texto+segmentos; verifica `transcriptRepository.upsert` y `upsertJobStatus({ transcribedAt })`.
4. `handleQueueTranscription`: `force` llama `deleteAll`; encola jobs por lote (`queueAll`).

### b) `server/src/repositories/transcription.repository.spec.ts` (nuevo)

1. `upsert` inserta nuevo; segundo `upsert` actualiza (ON CONFLICT), reescribiendo `transcript_search`.
2. `deleteAll` limpia ambas tablas.
3. `searchText` normaliza acentos (util `tokenizeForSearch`).

### c) Búsqueda — `server/src/repositories/search.repository.spec.ts` (extensión)

1. `searchMetadataV3` con `transcript` matchea un asset cuya `transcript_search` contiene el término (con acentos normalizados).
2. Sin término `transcript` → comportamiento actual intacto.

### d) `machine-learning/tests/test_main.py` (extensión)

1. `POST /transcribe` con bytes de audio → 200 con `{ text, segments, language, model }`.
2. Segmentos monótonos (`start < end`), texto no vacío.
3. (mock/fixture: no descargar modelo en CI — stub de `WhisperModel`).

### e) `web/src/lib/components/asset-viewer/AudioViewer.spec.ts` (nuevo)

1. Renderiza `<audio>` con `src` del original y control de velocidad.
2. Con `currentTime` en medio de un segmento → ese segmento tiene la clase activa.
3. Click en segmento → `audio.currentTime` = `start` y se inicia reproducción.

## Checklist de riesgo

- **Tiempo long-run en CPU:** transcripción de audios largos tarda minutos en `small`/int8. El job debe tolerar tiempo amplio (BullMQ sin timeout restrictivo) y no bloquear el pool del worker; `model_ttl` evita mantener el modelo cargado indefinidamente.
- **`model_ttl` global:** el TTL del ML service puede descargar Whisper por inactividad; el recargo a demanda es aceptado (mismo comportamiento CLIP/OCR).
- **Migraciones:** FK `asset_transcript.assetId` con `ON DELETE CASCADE`; `transcript_search` referenciando `asset_transcript` (orden de creación en la migración). `utf8mb4` → en este fork PostgreSQL 14 (patrón existente `ocr-search.table.ts`).
- **Ruido en working tree:** `mise.lock` y `open-api/immich-openapi-specs.json` no se commitean en esta tarea.
- **DTOs seguros:** el endpoint `GET /transcript/:assetId` expone solo texto/segmentos/metadata de transcripción; jamás `secret_token`, credenciales ni paths.
- **Errores no silenciados:** fallos del ML service se auditan/loggea en el servicio (patrón AGENTS — cero excepciones silenciadas); el job falla y queda visible en las colas BullMQ.

## Verificación global

- Este fork es NestJS (no Maven/Gradle): se usa la suite nativa del repo (guía técnica en `AGENTS.md` de este repositorio, no el de workspace de otro proyecto):
  - `cd server && npm run test` (specs de `transcription.*` + `search.repository`).
  - `cd machine-learning && python -m pytest tests/test_main.py`.
  - `cd web && npx vitest run src/lib/components/asset-viewer/AudioViewer.spec.ts && npx svelte-check && npx eslint src/lib/components/asset-viewer/AudioViewer.svelte --max-warnings 0`.
- Confirmar **BUILD SUCCESS** equivalente: toda la suite `server` en verde antes de dar por terminada la tarea.
- Sin push ni merge sin aprobación explícita del usuario (regla del repo).

## Fuera de alcance (fases posteriores)

- Búsqueda semántica por embeddings de texto (vector index).
- Autodetección de idioma / lenguas múltiples por job.
- Streaming/pedación de transcripción para audios muy largos.
- HLS de audio (sólo si el formato original no es reproducible en navegador).