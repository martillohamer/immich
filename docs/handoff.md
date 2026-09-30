# HANDOFF — Inmich fork local (`web/` + `server/` + `machine-learning/`)

## 📋 Estado de avance

- **Fecha:** 2026-09-25
- **Base:** `a555ee9` (descarga del monorepo immich v3.2.0 sin historial)

---

## 🎧 Auditoría de Cátedra — Etapa 1 (Backend) ✅ COMPLETADA

**Spec:** `docs/superpowers/specs/2026-09-24-audios-de-catedra.md` *(si no existe, el plan es `docs/superpowers/plans/2026-09-24-audios-de-catedra.md`)*
**Plan:** `docs/superpowers/plans/2026-09-24-audios-de-catedra.md`

### Objetivo de la Etapa 1

Diseñar un `POST /transcribe` en el microservicio de ML, transcribir audios de cátedra (voz es, supresión de silencio vía VAD), persistir la transcripción y exponerla con un endpoint de solo lectura REST seguro. **No tocar el buscador (`transcript_search`) ni el frontend.**

### Commits en `main` (Etapa 1, 12 commits)

| Commit | Descripción |
| --- | --- |
| `2736dff` | `feat(server): support audio assets` |
| `63a34de` | `feat(server): add asset_transcript, transcript_search tables and transcribedAt column` |
| `a9ce893` | `feat(server): add migrations for asset_transcript, transcript_search and transcribedAt` |
| `f1de885` | `fix(server): resolve pre-existing unknown type error in workflow-execution` |
| `9da9c21` | `fix(server): resolve lint errors in transcript schema tables` |
| `d5b74e9` | `feat(server): add transcription methods to AssetJobRepository` |
| `25910c9` | `feat(server): add transcription repository` |
| `b4f4ff4` | `feat(server): add MachineLearningRepository.transcribe to call ML /transcribe` |
| `31adb36` | `feat(server): add transcription queue/job and ML configuration` |
| `8eefa3c` | `feat(server): add TranscriptionService with queue and healing job for audio` |
| `5757b2e` | `feat(server): add GET /transcript/:assetId read endpoint` |

### Qué se hizo (resumen técnico)

1. **Soporte MIME de audio** en el modelado de activos (`2736dff`): los assets de audio se reconocen y se pueden encolar para transcripción.
2. **Esquema de datos** (`63a34de`, `a9ce893`, `9da9c21`):
   - Tabla `asset_transcript` (`assetId` PK + FK→`asset` ON DELETE CASCADE, `text`, `segments jsonb`, `language`, `model`, `createdAt`, `updatedAt`).
   - Tabla `transcript_search` (`assetId` PK, FK→`asset_transcript`), con **índice GIN trigram** `gin (f_unaccent("text") gin_trgm_ops)` — reservada para una fase posterior de búsqueda. Se registra el índice en `migration_overrides`.
   - Columna `transcribedAt` (timestamptz) en `asset_job_status` (marcador de progreso del job).
3. **Pipeline de transcripción (BullMQ)** (`d5b74e9`, `25910c9`, `31adb36`, `8eefa3c`):
   - `QueueName.Transcription` + `JobName.Transcription` (`handleTranscription`) y `JobName.TranscriptionQueueAll` (healing/queue de todos los pendientes con `force` → `deleteAll`).
   - `AssetJobRepository.streamForTranscriptionJob` / `getForTranscription`; `TranscriptionRepository.upsert` / `getById` / `getByAssetId` (filtro `isVisible`) / `deleteAll`.
   - `MachineLearningRepository.transcribe(audioPath, { modelName, language = 'es' })` → `POST /transcribe` con FormData (`audio`, `model`, `language`) y failover healthy-first sobre las URLs de ML. Default config: `transcription.modelName = 'small'`.
   - `TranscriptionService` guarda en `asset_transcript` y marca `transcribedAt`; respeta `isTranscriptionEnabled(machineLearning)` y salta `AssetVisibility.Hidden`.
4. **Endpoints** (`5757b2e`):
   - `GET /transcript/:assetId` (`TranscriptionController`, `@Authenticated()`), DTO de solo lectura `TranscriptionResponseDto { id, text, segments, language, model, createdAt }`, con `requireAccess(Permission.AssetRead)` y `NotFoundException` si no hay transcripción.
   - Contrato ML: `Transcription = { text, segments: TranscriptionSegment[], language, model }`, `TranscriptionSegment = { start, end, text }` (en `server/src/repositories/machine-learning.repository.ts` y `server/src/utils/database.ts`).

### Verificación (Etapa 1)

- Suite completa de server: baseline ambiental conocido (2233 passed / 1 expected fail / 77 fallidos preexistentes en 17 archivos ajenos) — **cero regresiones nuevas**.
- Specs nuevos verdes en verde (controller/registro, service, repository).
- `npm run check` y `npm run lint` limpios; `prettier --write` aplicado a los archivos touchados (CRLF).

### Pendiente → Etapa 3 (siguiente)

- **Implementar `POST /transcribe` en `machine-learning/`** (Python): FastAPI + `faster-whisper`, endpoint listo y probado (ver "Etapa 2 — ML `/transcribe`" arriba). La etapa 3 conecta el job de transcribir con la búsqueda/UI (fuera de alcance de la Etapa 2).
- `faster-whisper` con RTX/GPU y `cuda` extra sigue pendiente de verificar en hardware con GPU (no aplica al contenedor CPU por defecto).
- Job de transcripción en el worker: falta confirmar que `TranscriptionService`/`transcribe` del servidor ya se integra con el pipeline BullMQ `transcription` (verificado en Etapa 1).

## 🗞️ Etapa 2 — ML Service Python `POST /transcribe`

### Commits del diseño y código

| Commit | Descripción |
| --- | --- |
| *(sin commitear aún)* | `feat(ml): add POST /transcribe endpoint (faster-whisper, cached WhisperModel)` |

### Resumen del trabajo

1. **Spec aprobada:** `docs/superpowers/specs/2026-09-25-python-transcription-design.md` — Opción A (módulo dedicado `immich_ml/transcribe.py`, independiente de `ModelTask`/`ModelCache`).
2. **`immich_ml/transcribe.py`** (nuevo): caché global `dict` + `threading.Lock` de carga lazy de `WhisperModel` (`download_root=settings.cache_folder`); defaults `small`/`cpu`/`int8`/`es`/`vad_filter=True`; decodificación `io.BytesIO(audio)` vía PyAV (sin binario ffmpeg); segmentos `{ start, end, text }` (start/end redondeados a 3 decimales) y texto global `" ".join(...)` con `.strip()` por segmento (indexación trigram).
3. **`immich_ml/config.py`:** 5 settings planos añadidos — `transcription_model`, `transcription_language`, `transcription_device`, `transcription_compute_type`, `transcription_vad_filter` (env `MACHINE_LEARNING_*`).
4. **`immich_ml/main.py`:** endpoint `POST /transcribe` (`audio` requerido como `File(...)`, `model`/`language` opcionales), delegando a `run(transcribe_audio, ...)` (thread pool); `400` para audio vacío, `500` para fallos de inferencia.
5. **`machine-learning/pyproject.toml` + `uv.lock`:** `faster-whisper>=1.1.0` en `dependencies` (lock: faster-whisper 1.2.1, ctranslate2 4.8.2, av 18.1.0).
6. **Tests (`test_main.py`, TDD RED→GREEN):** 8 tests en `TestTranscribeEndpoint` (200/happy path, defaults, 400, 422, 500) y `TestTranscribe` (unión de segmentos, defaults desde settings + caché con `_transcription_models.clear()`, caché doble-modelo).

### Verificación (Etapa 2)

- `pytest -q` en contenedor Linux (`ml-test-runtime`): **110 passed, 3 skipped** (baseline sin regresiones).
- `ruff check immich_ml test_main.py` → All checks passed; `ruff format --check` → 29 files ok.
- `mypy --strict immich_ml/` → Success, 28 files.
- **Advertencia ambiental:** `uv sync --frozen` no resuelve localmente (wheel de `watchfiles==0.21.0` no servido → build sdist requiere Rust). Vía validada: `uv pip install -e '.[cpu]' opencv-python==4.11.0.86 ...`. El pin de `opencv-python==4.11.0.86` es obligatorio (si no, se instala opencv-python 5.0.0.93 que sombrea a headless y rompe `cv2.typing`).

---

## 🔍 Etapa 4: Búsqueda Global de Transcripciones y Indexación Cruzada (Completada - Septiembre 2026)

Se ha integrado con éxito el sistema de transcripciones de audio en el **Buscador Global de Immich**, permitiendo buscar conceptos dentro de los audios de clase mediante índices GIN trigram.

### Hitos Técnicos Implementados:
1. **Capa de Base de Datos y Consultas (Backend NestJS):**
   - Extensión de `SearchFilterBranch` y `SearchFilter` para admitir el parámetro `transcript`.
   - Incorporación de predicados de búsqueda y unión heredada (`branchPredicates` y `searchAssetBuilderLegacy`) utilizando `%>>` con GIN trigram sobre la tabla `transcript_search`, replicando el patrón robusto de OCR.
2. **Servicio de Coincidencias y Snippets:**
   - Creación del método `findMatchingSnippets` para extraer los fragmentos exactos donde se menciona el término buscado.
   - Post-procesamiento en lote (`batch SELECT`) dentro de `searchMetadataV3` para inyectar el campo `transcriptSnippet` en los DTOs de resultados para assets de tipo `AUDIO`.
3. **Interfaz de Usuario y Timeline (Frontend SvelteKit):**
   - Actualización de `SearchManager` y esquemas de búsqueda para soportar el nuevo filtro.
   - Extensión de `TimelineAsset` con `isAudio` y añadido de un distintivo visual (`🔊` / icono de altavoz) con overlay de reproducción en las miniaturas de audio (`Thumbnail.svelte`).
   - Conexión nativa del flujo de navegación: un clic en un resultado de audio lo enruta directamente al `AudioViewer` con la transcripción sincronizada cargada en el `TranscriptPanel`.

### Commits Clave (Fase de Búsqueda):
- `283ff45`: Task 1 — Query builder transcript filter (`branchPredicates` + legacy innerJoin).
- `e7b1003`: Task 2 — Implementación de `findMatchingSnippets` y especificaciones.
- `c29b521`: Task 3 — Post-procesamiento de snippets en `searchMetadataV3` y DTO `transcriptSnippet`.
- `0fbf6af`, `c9c1a59`, `8c3e1fc`: Task 4 — Mapeo en `SearchManager` y correcciones de revisión.
- `bb48e26`: Task 5 — `TimelineAsset.isAudio` y distintivo de altavoz en miniaturas.
*(Nota: Task 6 resuelta de forma nativa por el enrutamiento existente de assets de audio; Task 7 con suite de tests validada en verde).*

### Próximas Mejoras Futuras Opcionales:
- Añadir un botón o filtro dedicado de "Transcripción" en la barra de búsqueda avanzada (`SearchBar`).
- Renderizar de forma explícita el extracto de texto (`transcriptSnippet`) directamente bajo la miniatura en la vista de resultados de búsqueda web.

---

## 🖥️ Trabajo anterior (`web/`) — Timeline / Álbumes

### Commits en `main` (web, 6 commits)

| Commit | Descripción |
| --- | --- |
| `4661d16` | `feat(web): add QuickStats and QuickFilterBar timeline widgets` (pre-sesión) |
| `f684081` | `feat: add TTL client-side cache for timeline asset statistics` (T1) |
| `c49753d` | `feat(web): add asset counters and busy states to timeline widgets` (fase 1 integración) |
| `30d5ae1` | `refactor: use shared timeline stats service in QuickFilterBar and QuickStats` (T2) |
| `c429c55` | `fix: discard stale months if timeline init is cancelled mid-flight` (T3) |
| `776efcc` | `feat(web): add album statistics counters to album filters` |

### Tarea: Caché en cliente para estadísticas del timeline (Opción A) + fix de stale write

- **Spec:** `docs/superpowers/specs/2026-09-24-asset-stats-client-cache-design.md`
- **Plan:** `docs/superpowers/plans/2026-09-24-asset-stats-client-cache.md`

### Resumen del trabajo

1. **Service de caché TTL** (`web/src/lib/services/asset-statistics.service.ts` + `.spec.ts`):
   - Clave `AssetVisibility.Timeline`, caché `Map<AssetVisibility, CacheEntry>`.
   - `getTimelineStats({ force? })` con coalescing (promise compartida en vuelo), TTL 30 s (`expiresAt` epoch ms), `force: true` ignora TTL.
   - Errores no cacheados: se elimina la entrada (referencia por identidad) y se re-lanza.
   - `invalidateTimelineStats()`: borra la entrada.
   - 5 tests verdes (`coalescing`, TTL, force, expiración, no-cachea errores).

2. **Integración** (`web/src/lib/components/timeline/QuickFilterBar.svelte`, `QuickStats.svelte`):
   - La llamada directa `getAssetStatistics({ visibility: Timeline })` se sustituye por `getTimelineStats()` del service.
   - `QuickFilterBar.spec.ts` sigue en verde sin cambios; su `beforeEach` pasa `invalidateTimelineStats()`.

3. **Fix de stale write** (`web/src/lib/managers/timeline-manager/timeline-manager.svelte.ts` + `.spec.ts`):
   - Causa raíz: `CancellableTask.execute` solo verifica `signal.aborted` tras retornar el callback; los efectos secundarios (`this.months`, `updateViewportGeometry`, `#createScrubberMonths`) ya se habían comprometido.
   - Fix 3 puntos: `#initializeTimelineMonths(signal)` con early-return if `signal.aborted` tras `await getTimeBuckets`; `#init(options)` devuelve `boolean` pasando la señal al callback; `updateOptions` solo aplica `updateViewportGeometry(false)`/`#createScrubberMonths()` si el init no fue cancelado (el `return` dentro del `try` preserva `suspendTransitions=false` en `finally`).
   - TDD confirmado: el test de regresión falló ROJO (`expected 2020 to be 2024`) y quedó VERDE tras el fix. Suite del manager: **49/49 tests**.

### Tarea: Contadores de estadísticas en los filtros de álbumes (All/Owned/Shared)

Replica el patrón del service de timeline para mostrar el total de álbumes por tab (`All = notShared + shared`, `Owned = owned`, `Shared = shared`).

1. **Service de caché TTL** (`web/src/lib/services/album-statistics.service.ts` + `.spec.ts`):
   - Caché de entrada única (`notShared`, `owned`, `shared`) con `{ promise, expiresAt }`, TTL 30 s, coalescing (promise compartida) y `force: true` para saltar TTL.
   - `getAlbumStatisticsCounters({ force? })`: no cachea errores (limpieza por identidad).
   - `invalidateAlbumStatistics()`: borra la entrada.
   - 5 tests verdes (fetch básico, force, coalescing, TTL, errores no cacheados).

2. **`GroupTab.svelte`** extendido (reutilizable): props `badges?: (string | undefined)[]` y `loading?: boolean`. Muestra un spinner (`mdiLoading`) en la pestaña activa mientras carga (testid `group-tab-spinner-{index}`) y una pill con el contador cuando hay badge (testid `group-tab-badge-{index}`), con clases diferenciadas activo/inactivo. 3 tests verdes.

3. **`AlbumFilterTabs.svelte`** (`web/src/lib/components/album-page/`): wrapper que fetch en `onMount`, deriva los badges `[String(notShared+shared), String(owned), String(shared)]` y se suscribe a `eventManager` (`AlbumCreate`, `AlbumUpdate`, `AlbumDelete`, `AlbumShare`, `AlbumUserUpdate`, `AlbumUserDelete`) vía `OnEvents` → `invalidateAlbumStatistics()` + refetch. 5 tests verdes.

4. **Integración**: `AlbumsControls.svelte` (escritorio, `Object.values(albumFilterNames)`) y bloque `xl:hidden` de `+page.svelte` (móvil, `Object.keys(AlbumFilter)`) usan `AlbumFilterTabs` en lugar de `GroupTab` directo.

### Verificación integral (T4)

- `npm run check:typescript` (tsc `--noEmit`): **exit 0, 0 errores**.
- `npm run lint` (eslint `--max-warnings 0`): **exit 0** (solo mensajes stderr del parser experimental).
- `npm run check:svelte`: **7 errors + 62 warnings en 42 archivos, TODOS preexistentes** — los 7 errores están en `AssetViewerNavBar.spec.ts` (2), `Thumbnail.spec.ts` (2) y `NumberRangeInput.spec.ts` (3), archivos sin ningún commit que los toque (`git log 4661d16..HEAD` vacío para esos paths); las 62 warnings son `state_referenced_locally` en modals ajenos. Baseline del repo, no bloqueante.
- Nota: el diff con un worktree base (`4661d16`) **no fue comparable** (un worktree git no reclama `node_modules`/`.svelte-kit`), por lo que la preexistencia se confirmó por inmutabilidad de los archivos afectados y por tsc/eslint limpios.

### Verificación integral de `776efcc` (contadores de álbumes)

- `npm run check:typescript` (tsc `--noEmit`): **exit 0, 0 errores**.
- `npm run lint` (eslint `--max-warnings 0`): **exit 0** (1 error propio corregido: `no-floating-promises` en `AlbumFilterTabs.spec.ts`).
- `npm run check:svelte`: **0 errores, 62 warnings en 39 archivos, todos preexistentes** (`state_referenced_locally` en modals ajenos); ningún archivo de esta feature produce warnings.
- Suite vitest completa: **13/13 tests nuevos verdes** (servicio 5, GroupTab 3, AlbumFilterTabs 5). Únicos fallos de la suite: **20 tests de `thumbnail-util.spec.ts`, preexistentes y ambientales** — `getAltText` formatea con `toLocaleString(get(locale))` donde `locale` es `null` en test, y `Intl` cae al locale del sistema (`es_ES` → "1 de enero de 2024") en vez de en-US ("January 1, 2024"). Ningún archivo de la feature participa en esa cadena.

### Tarea: Smart Class Notes — Task 1 (resúmenes de transcripción, frontend)

**Spec:** `docs/superpowers/specs/2026-09-30-smart-class-notes-task1-design.md`
**Plan:** `docs/superpowers/plans/2026-09-30-smart-class-notes-task1-plan.md`
**Estado:** implementada, verificada y **staged (sin commitear)**.

1. **Tipos de dominio** (`web/src/lib/types/transcript.ts`, nuevo): `KeyConcept` y `SummaryData` (resumen ejecutivo, temas, conceptos clave, conclusión, título y fuente `assetId`).
2. **Mock determinista de resumen** (`web/src/lib/utils/transcript-summary.ts` + `.spec.ts`, nuevos): `createMockSummary(assetId)` (4 temas y 3 conceptos en español, sin aleatoriedad). Spec `describe('createMockSummary')` con 5 tests (titulo/source, 4 temas, 3 conceptos, español, formato numérico de concepto).
3. **Store ampliado** (`web/src/lib/stores/transcript.svelte.ts`): pestañas `activeTab<'transcript'|'summary'>` con `setActiveTab`; estado `summaryData`/`isGeneratingSummary`; `loadAssetSummary(assetId)` bajo `CancellableTask` con flag **dedicado `#summaryCleared`** (evita que el resumen consuma la ventana "cleared" del loader de transcripción y deje a `getAssetTranscript` corto-circuitando con `'DONE'`); `clear()` resetea también el estado de resumen. Spec ampliado a 11 tests (`describe('summary state')`).
4. **Correcciones TDD detectadas en verde** (aplicadas también al plan): `#isGeneratingSummary = true` como primer statement síncrono del método (observable tras `clear()`); el test de refetch del transcript invalida `clearTranscriptCache()` del SDK (sin mock, la 2ª llamada se servía por caché); `eslint-disable` puntual de `require-await` en el callback del loader (el tipo `F extends ... Promise<void>` exige `async` en un mock síncrono).

### Verificación (Task 1 Smart Class Notes)

- **Vitest: 16/16 tests en verde** (`transcript.svelte.spec.ts` 11 + `transcript-summary.spec.ts` 5).
- `check:typescript` exit 0; `lint` exit 0 (solo mensajes stderr del parser experimental); búsqueda estricta `\bany\b` = **0 matches**.
- Sin commit ni push todavía (staging selectivo preparado). `docs/superpowers/` queda fuera de todo commit (untracked).

### Ruido de entorno excluido de commits (no tocar)

- `mise.lock` (modificado).
- `open-api/immich-openapi-specs.json` (modificado).
- `docs/superpowers/` (untracked: spec y plan de la tarea timeline).

### Pendiente / próximos pasos

- Sin push ni merge sin confirmación explícita del usuario (regla del proyecto).
- Fuera de alcance (recordatorio del plan): `AbortSignal` en el SDK generado para `getTimeBuckets`, cambios de presentación/UX, otros consumidores de `getAssetStatistics`.

### Comandos útiles

```powershell
# Tests de un spec concreto (workdir: web)
& "C:\Users\astur\Desktop\immich-main\web\node_modules\.bin\vitest.cmd" run src/lib/managers/timeline-manager/timeline-manager.svelte.spec.ts

# Tests de un spec con paréntesis en la ruta (workdir: web) — el shim .cmd rompe con '(user)', usar node directo
& node "C:\Users\astur\Desktop\immich-main\web\node_modules\vitest\vitest.mjs" --run src/lib/components/album-page/AlbumFilterTabs.spec.ts

# Chequeos (workdir: web)
npm run check:svelte
npm run check:typescript
npm run lint
```