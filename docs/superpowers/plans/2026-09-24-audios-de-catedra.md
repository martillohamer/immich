# Plan — Audios de Cátedra (Etapa 1: Backend)

Fecha: 2026-09-24
Spec de referencia: `docs/superpowers/specs/2026-09-24-audios-de-catedra-design.md` (aprobada y commiteada).
Rama: `main`. Regla: sin push ni merge sin confirmación explícita; commit por tarea; no commiteear `mise.lock` ni `open-api/immich-openapi-specs.json`.

## Contexto

Immich (fork NestJS, Postgres 14, BullMQ). Queremos subir audios de cátedra (`.mp3/.wav/.m4a/.ogg/.aac/.flac`) y transcribirlos en segundo plano con `faster-whisper` (CPU, modelo `small`, int8, idioma `es`). Esta Etapa 1 cubre **todo el backend**: reconocimiento MIME, modelo de datos, pipeline BullMQ, servicio de transcripción, endpoint de lectura y configuración. ML service (python `/transcribe`), búsqueda y frontend quedan para fases posteriores.

El pipeline replica el patrón OCR existente (`OcrService` / `asset_ocr` / `ocr_search`), que ya está probado y verde en el repo.

## Estado pre-flight (verificado)

- Mecanismo de migraciones: runtime = Kysely `FileMigrationProvider` (`database.repository.ts:500-513`, carpeta `schema/migrations`, `allowUnorderedMigrations: isDev()`). Nuevas migraciones se declaran añadiéndolas al archivo `server/src/schema/migrations/ORDER` (formato `<timestamp>-<Nombre>`). Última migración: `1789419229196-ConvertUserOAuthIdEmptyStringToNull` → timestamps nuevos **> 1789419229196**.
- Tablas se registran en `server/src/schema/index.ts` en 3 puntos: imports, lista de clases, mapeo `Database`.
- Concurrencia: `queue.service.ts:93-98` `updateConcurrency(config)` itera `Object.values(QueueName)` y lee `config.job[queueName].concurrency`. Añadir `QueueName.Transcription` + entrada `transcription` en el bloque `job` (schema y defaults) engancha automáticamente el concurrency de la cola.
- `upsertJobStatus` es genérico (`asset.repository.ts:355`): basta añadir la columna `transcribedAt` a la tabla; no se toca el repository.
- `AssetType.Audio` ya existe en el enum.
- `tokenizeForSearch` existe (`utils/database.ts:379`) y se usa en OCR.
- Patrones verbatim ya leídos: migraciones OCR (3), `asset-ocr.table.ts`, `ocr-search.table.ts`, `asset-job-status.table.ts`, `ocr.repository.ts`, `ocr.service.ts` + `.spec.ts`, `machine-learning.repository.ts`, `test/utils.ts` (ServiceMocks), `system-config.stub.ts`.
- Suite server baseline: 574 passed | 2 skipped.

## Enfoque

TDD estricto por tarea: **test rojo primero** (`npm run test <spec>`), luego implementación mínima, `npm run check` + `npm run lint` + `npm run format`, commit por tarea. `workdir` siempre = `server` (o `C:\Users\astur\Desktop\immich-main\server`), nunca el CWD por defecto.

Comandos de verificación (`server/package.json`):
- `npm run test src/utils/mime-types.spec.ts` (o spec concreto)
- `npm run test -- --run src/utils/mime-types.spec.ts` si vitest pide flags (verificar en `test/vitest.config.mjs`)
- `npm run check` (tsc --noEmit)
- `npm run lint`
- `npm run format`

---

## Task 1 — MIME audio (`AssetType.Audio`)

**Archivos:** `server/src/utils/mime-types.ts`, `server/src/utils/mime-types.spec.ts`

**Test rojo primero** (bloque que se muestra al usuario al arrancar la Task 1):

```ts
describe('audio', () => {
  it('should contain only lowercase mime types', () => {
    const keys = Object.keys(mimeTypes.audio);
    expect(keys).toEqual(keys.map((mimeType) => mimeType.toLowerCase()));

    const values = Object.values(mimeTypes.audio).flat();
    expect(values).toEqual(values.map((mimeType) => mimeType.toLowerCase()));
  });

  it('should be a sorted list', () => {
    const keys = Object.keys(mimeTypes.audio);
    expect(keys).toEqual(keys.toSorted());
  });

  it('should contain only audio mime types', () => {
    const values = Object.values(mimeTypes.audio).flat();
    expect(values).toEqual(values.filter((mimeType) => mimeType.startsWith('audio/')));
  });

  for (const [extension, v] of Object.entries(mimeTypes.audio)) {
    it(`should lookup ${extension}`, () => {
      expect(mimeTypes.lookup(`test.${extension}`)).toEqual(v[0]);
    });
  }
});

describe('assetType', () => {
  for (const [filename, type] of [
    ['a.mp3', AssetType.Audio],
    ['a.wav', AssetType.Audio],
    ['a.m4a', AssetType.Audio],
    ['a.ogg', AssetType.Audio],
    ['a.aac', AssetType.Audio],
    ['a.flac', AssetType.Audio],
  ]) {
    it(`should return ${AssetType.Audio} for ${filename}`, () => {
      expect(mimeTypes.assetType(filename)).toBe(type);
    });
  }
});
```

**Implementación (mínimo):**
- Añadir mapa `audio` (ordenado alfabético, `.aac/.flac/.m4a/.mp3/.ogg/.wav`).
- `const types = { ...image, ...video, ...audio, ...sidecar };`
- `isAudio: (filename) => isType(filename, audio)` en el export.
- `assetType()`: rama `if (contentType.startsWith('audio/')) return AssetType.Audio;` antes del `Other`.
- `isAsset(filename)`: incluir `|| isType(filename, audio)`.
- `getSupportedFileExtensions()`: incluir `...Object.keys(audio)`.

**Tabla de mimes sugerida** (verificar contra `getSupportedFileExtensions`/uso existente):

| ext | mime |
|---|---|
| `.aac` | `audio/aac` |
| `.flac` | `audio/flac` |
| `.m4a` | `audio/mp4` |
| `.mp3` | `audio/mpeg` |
| `.ogg` | `audio/ogg` |
| `.wav` | `audio/wav` |

**Verificar:** `npm run test src/utils/mime-types.spec.ts`; `npm run check`.
**Commit:** `feat(server): support audio assets (AssetType.Audio) + transcription MIME` (sin spec generada).

---

## Task 2 — Tablas `asset_transcript` + `transcript_search` + columna `transcribedAt`

**Archivos nuevos:** `server/src/schema/tables/asset-transcript.table.ts`, `server/src/schema/tables/transcript-search.table.ts`
**Modificado:** `server/src/schema/tables/asset-job-status.table.ts`, `server/src/schema/index.ts`

**`asset-transcript.table.ts`** (patrón de `asset-ocr.table.ts`; PK = `assetId` 1:1 con asset):

```ts
@Table({ name: 'asset_transcript' })
export class AssetTranscriptTable {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'assetId', primary: true })
  assetId!: string;

  @Column({ name: 'text' })
  text!: string;

  @Column({ name: 'segments', type: 'jsonb' })
  segments!: TranscriptionSegment[];

  @Column({ name: 'language', type: 'varchar', default: sql`'es'` })
  language!: string;

  @Column({ name: 'model', type: 'varchar', nullable: true })
  model!: string | null;

  @Column({ name: 'createdAt', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt!: Date;

  @ForeignKey('assetId', () => AssetTable, 'id', { onDelete: 'CASCADE' })
  @AfterDeleteTrigger('asset_transcript_delete')
  @UpdatedAtTrigger('asset_transcript_updatedAt')
  // a la eliminación del asset, se borra la fila (FK CASCADE)
}
```

> Definir `export type TranscriptionSegment = { start: number; end: number; text: string }` en `server/src/utils/database.ts` (junto a `tokenizeForSearch`) para reutilizarlo en tabla + DTOs + repos.

**`transcript-search.table.ts`** (réplica de `ocr-search.table.ts`, con FK→`asset_transcript`):

```ts
@Table({ name: 'transcript_search' })
export class TranscriptSearchTable {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'assetId', primary: true })
  assetId!: string;

  @Column({ name: 'assetTranscriptId', type: 'uuid' })
  @ForeignKey('assetTranscriptId', () => AssetTranscriptTable, 'assetId', { onDelete: 'CASCADE' })
  assetTranscriptId!: string;

  @Column({ name: 'text' })
  text!: string;
}

@Index({
  name: 'idx_transcript_search_text',
  using: 'gin',
  expression: 'f_unaccent("text") gin_trgm_ops',
})
export class TranscriptSearchTextIndex {}
```

**`asset-job-status.table.ts`:** añadir tras `ocrAt`:

```ts
@Column({ name: 'transcribedAt', type: 'timestamptz', nullable: true })
transcribedAt!: Date | null;
```

**`schema/index.ts`:** registrar `AssetTranscriptTable`, `TranscriptSearchTable`, `AssetTranscriptTableRelations` (si el patrón lo requiere) + el `TranscriptSearchTextIndex` con su columna en los 3 puntos (imports, `getTables()`, `Database` type).

**Verificar:** `npm run check` (compila tipos de tabla). No hay spec para tablas.
**Commit:** `feat(server): add asset_transcript, transcript_search tables and transcribedAt column` (¡NO commiteear la OPEN API spec regenerada! Revertir `open-api/immich-openapi-specs.json` si aparece).

---

## Task 3 — Migraciones nuevas (3 scripts)

**Archivos nuevos:** `server/src/schema/migrations/1789419229197-CreateAssetTranscriptTable.ts`, `...198-CreateTranscriptSearchTable.ts`, `...199-UpsertTranscriptAssetJobStatus.ts`
**Modificado:** `server/src/schema/migrations/ORDER`

Plantillas exactas de `1758705774125-CreateAssetOCRTable.ts` / `1758705789125-CreateOCRSearchTable.ts` / `1758705804128-UpsertOcrAssetJobStatus.ts`.

- Migración 1: crea `asset_transcript` (assetId uuid PK FK→asset ON DELETE CASCADE; text; segments jsonb; language varchar(2) default 'es'; model varchar(50) NULL; createdAt/updatedAt timestamptz default now()).
- Migración 2: crea `transcript_search` (assetId uuid PK; assetTranscriptId uuid FK→asset_transcript.assetId ON DELETE CASCADE; text) + `CREATE INDEX idx_transcript_search_text ON transcript_search USING gin (f_unaccent("text") gin_trgm_ops);` **+ el `INSERT INTO "migration_overrides"`** con los `\"` escapados (patrón exacto de `CreateOCRSearchTable.ts`). Orden: crear tabla primero, índice después.
- Migración 3: `ALTER TABLE asset_job_status ADD COLUMN "transcribedAt" timestamptz;` (gemelo de UpsertOcrAssetJobStatus, que usa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — verificar el cuerpo real).

Registrar las 3 líneas en `ORDER` (después de `1789419229196-ConvertUserOAuthIdEmptyStringToNull`).

**Verificar:** `npm run check` + lanzar migraciones en una DB test (o al menos `docker` stack si está disponible). Si hay `npm run test` con DB real disponible, no es necesario en esta tarea (el patrón ya está probado).
**Commit:** `feat(server): add migrations for asset_transcript, transcript_search and transcribedAt`.

---

## Task 4 — Enums, jobs y config

**Archivos:** `server/src/enum.ts`, `server/src/types.ts`, `server/src/dtos/config.dto.ts`, `server/src/utils/misc.ts`

1. **enum.ts** — `QueueName` (junto a `Ocr = 'ocr'`):
   ```ts
   Transcription = 'transcription',
   ```
   `JobName` (junto al bloque `// OCR`):
   ```ts
   TranscriptionQueueAll = 'TranscriptionQueueAll',
   Transcription = 'Transcription',
   ```
2. **types.ts** — añadir a la unión `Jobs` (líneas ~432-435 junto a OCR):
   ```ts
   TranscriptionQueueAll: IBaseJob;
   Transcription: IEntityJob;
   ```
   (`ConcurrentQueueName` ya cubre transcription por exclusión; no requiere cambio.)
3. **config.dto.ts**:
   - Bloque `job` (~182-189): añadir `transcription: AdminConfigJobSettingsSchema,` tras `ocr:`.
   - Bloque `machineLearning` (246-260): añadir `transcription: AdminConfigMachineLearningModelSchema,` tras `ocr:`.
   - Defaults bloque `job` (~610): añadir `transcription: { concurrency: 1 },` tras `ocr`.
   - Defaults bloque `machineLearning` (~642-648): añadir `transcription: { enabled: true, modelName: 'small' },`.
4. **misc.ts** — espejo de `isOcrEnabled` (96-105):
   ```ts
   export const isTranscriptionEnabled = (config: MachineLearningConfig) =>
     isMachineLearningEnabled(config) && config.transcription.enabled;
   ```

> Nota: `MachineLearningConfig['transcription']` debe quedar tipado por el schema (`modelName`). El campo `model: 'small'` de la spec es del **ML service python** (`MACHINE_LEARNING_TRANSCRIPTION_MODEL`), la config del server usa `modelName` → defaults `{ enabled: true, modelName: 'small' }`.

**Verificar:** `npm run check`; si hay spec de `config.dto` la suite lo cubre. `npm run lint`.
**Commit:** `feat(server): add transcription queue/job and ML configuration`.

---

## Task 5 — Repos: AssetJobRepository + TranscriptionRepository

**Archivos:** `server/src/repositories/asset-job.repository.ts`, `server/src/repositories/transcription.repository.ts` (nuevo)

1. **asset-job.repository.ts** (dos métodos, espejo de `getForOcr`/`streamForOcrJob`):

```ts
@GenerateSql({ params: [DummyValue.UUID] })
getForTranscription(id: string) {
  return this.db
    .selectFrom('asset')
    .select((eb) => [
      'asset.visibility',
      'asset.ownerId',
      'asset.originalFileName',
      withFilePath(eb, AssetFileType.Original).as('originalPath'),
    ])
    .where('asset.id', '=', id)
    .executeTakeFirst();
}

@GenerateSql({ params: [], stream: true })
streamForTranscriptionJob(force?: boolean) {
  return this.db
    .selectFrom('asset')
    .select(['asset.id'])
    .$if(!force, (qb) =>
      qb
        .innerJoin('asset_job_status', 'asset_job_status.assetId', 'asset.id')
        .where('asset_job_status.transcribedAt', 'is', null),
    )
    .where('asset.deletedAt', 'is', null)
    .where('asset.visibility', '!=', AssetVisibility.Hidden)
    .stream();
}
```

2. **transcription.repository.ts** (especular de `ocr.repository.ts`): `@InjectKysely() private db: Kysely<DB>` + logger constructor.
   - `getById(assetId, options?)` — select text, segments, language, model, createdAt, updatedAt.
   - `getByAssetId(assetId)` igual sin filtros de borrado (para el endpoint).
   - `upsert(assetId, { text, segments, language, model })`: `INSERT ... ON CONFLICT (assetId) DO UPDATE` en `asset_transcript` + reescritura de `transcript_search` (delete + insert con `searchText`). Replicar la CTE de `ocr.repository.ts` (`upsert` + `inserted_search`), sustituyendo `asset_ocr`→`asset_transcript`, `ocr_search`→`transcript_search`, `assetTranscriptId`→`assetTranscriptId` (FK), `text`→tokenizado con `tokenizeForSearch(text).join(' ')`.
   - `deleteAll()`: transacción `truncate transcript_search` + `truncate asset_transcript` (omitir FK / truncar en orden hijo→padre, como hace `deleteAll` de OCR).

**Verificar:** `npm run check` + `npm run lint`.
**Commit:** `feat(server): add transcription repositories`.

---

## Task 6 — TranscriptionService + spec

**Archivos:** `server/src/services/transcription.service.ts` (nuevo), `server/src/services/transcription.service.spec.ts` (nuevo)
**Modificado:** `server/test/utils.ts` (ServiceMocks), `server/test/fixtures/system-config.stub.ts`

**structura tipo `ocr.service.ts`:** `@Injectable()` con `@OnJob({ name: JobName.TranscriptionQueueAll, queue: QueueName.Transcription })` y `@OnJob({ name: JobName.Transcription, queue: QueueName.Transcription })`; `onModuleInit` no requiere registro manual (patrón OcrService).

**HandleQueueTranscription:**
```ts
const config = await this.config.getConfig({ withCache: false });
if (!isTranscriptionEnabled(config.machineLearning)) return JobStatus.Skipped;
if (force) await this.transcriptionRepository.deleteAll();
const stream = this.assetJobRepository.streamForTranscriptionJob(force);
return this.queueService.queueAll({ name: JobName.Transcription, data: { force }, stream });
```

**HandleTranscription:**
```ts
const { id, force } = job;
const asset = await this.assetJobRepository.getForTranscription(id);
if (!asset || !asset.originalPath || !asset.originalFileName) {
  throw new Error(`Asset ${id} is not a transcribable asset`);
}
if (asset.visibility === AssetVisibility.Hidden) return JobStatus.Skipped;

const config = await this.config.getConfig({ withCache: false });
if (!isTranscriptionEnabled(config.machineLearning)) return JobStatus.Skipped;

const { text, segments, language, model } = await this.machineLearningRepository.transcribe(asset.originalPath, {
  modelName: config.machineLearning.transcription.modelName,
  language: 'es',
});

await this.transcriptionRepository.upsert(id, { text, segments, language, model });
await this.assetRepository.upsertJobStatus({ assetId: id, transcribedAt: new Date() });
```

**Mocks necesarios** (`test/utils.ts` `ServiceMocks` + `getMocks()`):
- `transcription: automock(TranscriptionRepository)` → `sut.transcription.upsert` `deleteAll` etc.
- No hay `TranscriptionRepository` en `Mockify` → añadirlo.
- `machineLearning: automock(MachineLearningRepository)` ya existe; añadir `transcribe` al mock (devuelve `mockTranscription(...)`).
- `system-config.stub.ts`: añadir `machineLearningTranscriptionDisabled` = `{ machineLearning: { enabled: true, transcription: { enabled: false } } }` (o reutilizar patrón OCR).

**Spec (TDD)** (`transcription.service.spec.ts`):
1. `handleTranscription` con ML deshabilitado → `JobStatus.Skipped`, sin `transcribe` (mock no llamado).
2. Asset con `asset` = `undefined` → lanza error; visibility Hidden → `Skipped`.
3. Flujo feliz: `mockOriginals` con `{ getForTranscription: assetMock }`, `machineLearning.transcribe` → `{ text, segments, language, model }`; verifica `transcription.upsert` y `assetRepository.upsertJobStatus({ assetId, transcribedAt: expect.any(Date) })`; devuelve `JobStatus.Completed`.
4. `handleQueueTranscription`: `force` → `deleteAll` llamado; flujo con stream (mock `{ async *[Symbol.asyncIterator]() { yield { id: 'asset-1' } } }`) → `queueAll` encolado.

**Recordar:** `newTestService(TranscriptionService, { ...mocks })`; `config.getConfig` mock obligatorio (patrón ocr.service.spec.ts:29-49).

**Verificar:** `npm run test src/services/transcription.service.spec.ts`; `npm run check`; `npm run lint`.
**Commit:** `feat(server): add TranscriptionService with queue and healing job for audio`.

---

## Task 7 — MachineLearningRepository.transcribe()

**Archivos:** `server/src/repositories/machine-learning.repository.ts`

Endpoint dedicado (spec C.3): `POST /transcribe` con `audio` en FormData (faster-whisper no encaja en `ModelTask/ModelType`).

Tipos en `machine-learning.repository.ts`:
```ts
export type TranscriptionSegment = { start: number; end: number; text: string };
export type Transcription = { text: string; segments: TranscriptionSegment[]; language: string; model: string };
export type TranscriptionOptions = { modelName: string; language?: string };

async transcribe(audioPath: string, { modelName, language = 'es' }: TranscriptionOptions): Promise<Transcription> {
  const fileBuffer = await readFile(audioPath);
  const formData = new FormData();
  formData.append('audio', new Blob([new Uint8Array(fileBuffer)]));
  formData.append('model', modelName);
  formData.append('language', language);

  for (const url of [...healthy, ...unhealthy]) {
    try {
      const response = await fetch(new URL('transcribe', url), { method: 'POST', body: formData });
      if (response.ok) {
        this.setHealthy(url, true);
        const data = (await response.json()) as Transcription;
        return { ...data, segments: data.segments ?? [] };
      }
      this.logger.warn(`...`);
    } catch (error) { this.logger.warn(...); this.setHealthy(url, false); }
  }
  throw new Error(`Machine learning request to transcribe failed for all URLs`);
}
```

> Reutilizar el patrón de `predict` (healthy-first, setHealthy, warn+fallo) sin reusar `predict` (este endpoint es `/transcribe`, no `/predict`). Añadir test unitario en `machine-learning.repository.spec.ts` **solo si se detecta que existe un spec** para este repo (no se ha encontrado; si no existe, se cubre vía el spec del servicio, Task 6).

**Verificar:** `npm run check`; `npm run lint`.
**Commit:** `feat(server): add MachineLearningRepository.transcribe to call ML /transcribe`.

---

## Task 8 — Endpoint `GET /transcript/:assetId`

**Archivos nuevos:** `server/src/dtos/transcription.dto.ts`, `server/src/controllers/transcription.controller.ts`
**Modificado:** `server/src/repositories/transcription.repository.ts` (si falta `getByAssetId` con filtro `isVisible`)

DTO sólo lectura (spec C.4 "sin campos sensibles"):
```ts
export class TranscriptionResponseDto {
  id!: string;
  text!: string;
  segments!: TranscriptionSegment[];
  language!: string;
  model!: string | null;
  createdAt!: Date;
}
```

Controller:
```ts
@ApiTags('Transcription')
@Controller('transcript')
@Authenticated()
export class TranscriptionController {
  constructor(private service: TranscriptionRepository) {}

  @Get(':assetId')
  async get(@Auth() _, @Param() { assetId }: AssetIdDto) {
    const transcript = await this.service.getByAssetId(assetId);
    if (!transcript) throw new NotFoundException('Transcript not found');
    return mapDto(transcript, TranscriptionResponseDto);
  }
}
```
Reutilizar `AssetIdDto` existente (`server/src/dtos/asset.dto.ts`). Verificar patrón de un controller GET simple del repo (p. ej. `memory.controller.ts`) antes de escribir.

**Nota de autorización:** la spec no exige validación de propiedad por usuario en esta fase; el guard `@Authenticated()` es suficiente. Anotar en código/documento la limitación si el endpoint debe restringirse por owner en una fase posterior.

**Verificar:** `npm run check`; `npm run lint`; suite completa de server al final.
**Commit:** `feat(server): add GET /transcript/:assetId read endpoint`.

---

## Verificación final (antes de dar por terminada)

```powershell
# desde server/
npm run test          # suite completa: 574 + nuevos en verde
npm run check
npm run lint
npm run format
npm run build         # si existe script de build en package.json
```

- Confirmar que **no** aparece `open-api/immich-openapi-specs.json` ni `mise.lock` modificados en el git status (revertir si aparecen).
- `git status` limpio tras commits por tarea.

## Fuera de alcance (fases posteriores, ver spec secciones D y finales)

- ML service python: endpoint `POST /transcribe` en `machine-learning/immich_ml/main.py` + `faster-whisper` + tests `test_main.py`.
- Búsqueda: subquery `transcript_search` en `searchMetadataV3` + `MetadataSearchDto.transcript`.
- Frontend: `AudioViewer.svelte` + `getAssetFileUrl` + clicks-to-seek + spec.
- Semántica/embeddings, multi-idioma, streaming, HLS de audio.