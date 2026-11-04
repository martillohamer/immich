# Design: Web — Visor de Transcripciones (AudioViewer + TranscriptPanel)

**Fecha:** 2026-09-26
**Ámbito:** `web/` (SvelteKit + svelte 5 + media-chrome) + `packages/sdk/`. Fork local de Immich v3.2.0.
**Estado:** diseño aprobado por el usuario (Enfoque C) — en implementación.

## Objetivo

Mostrar en el visor de assets de la web (`AssetViewer`) la reproducción de archivos de audio con su **transcripción sincronizada**: al reproducir un audio de la Serie de Cátedra, un panel inferior muestra el texto por segmentos, resalta el segmento activo en tiempo real (`timeupdate`), permite **clic en un segmento para saltar** a ese instante, y ofrece control de velocidad de reproducción (`0.5x / 1x / 1.5x / 2x`). Reutiliza el endpoint existente `GET /transcript/:assetId` del server.

## Decisiones acordadas (aprobadas por el usuario)

1. **Enfoque C — panel reutilizable** (`TranscriptPanel.svelte`) orquestado por un `AudioViewer.svelte`. Se rechazaron: A (video con `<track>` WebVTT — requiere transcodificar a m3u8, no existe en el server para audio) y B (panel pegado al asset grid).
2. **Caché de transcripciones**: nuevo `TranscriptManager` en `web/src/lib/stores/transcript.svelte.ts` (patrón `ocr.svelte.ts`: `CancellableTask` + `#data = $state`), expuesto también vía `AssetCacheManager` con `AsyncCache` (`#transcriptCache`) invalidada junto a OCR/faces en `invalidate()` / `invalidateAsset()`. Reutilizable por OCR, detección de rostros y transcripción.
3. **URL del audio**: `getAssetMediaUrl({ id, size: AssetMediaSize.Original })` → `/assets/:id/original`, **no** HLS. Implica `Permission.AssetDownload`: el owner y links compartidos con `allowDownload` reproducen; los shared links sin descarga no (aceptado y documentado en el código). El player muestra un mensaje de error si el `<audio>` no puede reproducirse (elemento `Audio` con concepto `error` estado).
4. **SDK manual**: añadir a `packages/sdk/src/fetch-client.ts` el tipo `TranscriptionResponseDto` y la función `getAssetTranscript({ id }, opts?)` replicando el patrón oazapfts de `getAssetOcr` (URL `/transcript/${encodeURIComponent(id)}`, `oazapfts.fetchJson`). **No se regenera** desde `open-api/` — el spec OpenAPI todavía no contiene la entidad `Transcript` (verificado: `idx=-1`). La próxima regeneración la sobrescribirá (aceptado).
5. **Panel inferior fijo** con área de scroll propia y auto-scroll al **centro** del segmento activo (`scrollIntoView({ behavior: 'smooth', block: 'center' })`), solo cuando el usuario no está haciendo scroll manual.
6. **i18n `en` + `es`**: claves planas nuevas en `i18n/en.json` (y traducción en `i18n/es.json`), tipadas automáticamente en `$t()` vía `web/src/app.d.ts` (`import type en from '$i18n/en.json'`). No tocar `web/src/lib/i18n/` (no existe; el directorio real es `i18n/` en la raíz del repo).
7. **Sin tocar media-chrome locales**: no se añaden claves a `MediaChromeDefaults` en `+layout.svelte` (solo se necesitan las ya existentes para `media-playback-rate-menu`).

## Contrato (fijado por el server, ya implementado)

- `GET /transcript/:assetId` (`TranscriptionController`, `@Authenticated({ permission: Permission.AssetRead })`).
- Respuesta 200 (`TranscriptionResponseDto`, `server/src/dtos/transcription.dto.ts`):
  ```ts
  {
    text: string;              // texto completo de la transcripción
    segments: Array<{
      start: number;           // segundos (double)
      end: number;             // segundos (double)
      text: string;
    }>;
    language: string;          // código de idioma detectado
    model: string | null;      // modelo usado
    createdAt: Date;           // ISO datetime
  }
  ```
- **404** cuando el asset no tiene transcripción (`NotFoundException('Transcript not found')`, `transcription.service.ts:64-66`) → el panel muestra estado `empty` ("no hay transcripción").
- **403** si el usuario no tiene `AssetRead` → estado `error`.

## Arquitectura

```
┌─ AssetViewer.svelte ────────────────┐
│  viewerKind: Audio → 'AudioViewer'  │
│  section.asset-viewer               │
│   └─ {:else if viewerKind === 'AudioViewer'}
│        └─ <AudioViewer {asset} />   │
└─────────────────────────────────────┘
          │ assetId
          ▼
┌─ AudioViewer.svelte ──────────────────────────────┐
│  <media-controller>                                │
│   ├─ <audio slot="media" src=/assets/:id/original> │
│   │    on:timeupdate / on:durationchange         │
│   └─ <media-control-bar> + <media-playback-rate-menu> │
│                    │ render:currentTime/duration/onSeek
│                    ▼
└─ TranscriptPanel.svelte ──────────────────────────┐
   • transcriptManager.getAssetTranscript(id)        │
   • segmento activo = $derived(start ≤ t < end)     │
   • highlight .immich-accent + auto-scroll center   │
   • clic → onSeek(segment.start)                    │
└───────────────────────────────────────────────────┘
```

## Implementación

### 1. `packages/sdk/src/fetch-client.ts` (modificar)

Insertar **después** de la OcrResponseDto (`AssetOcrResponseDto` L1390) el tipo:

```ts
export type TranscriptionResponseSegmentDto = {
    /** End time of the segment in seconds */
    end: number;
    /** Start time of the segment in seconds */
    start: number;
    /** The segment text */
    text: string;
};
export type TranscriptionResponseDto = {
    /** The date the transcript was created */
    createdAt: Date;
    /** The detected language code */
    language: string;
    /** The model used for transcription */
    model: string | null;
    /** The transcript segments */
    segments: TranscriptionResponseSegmentDto[];
    /** The full transcript text */
    text: string;
};
```

Insertar **después** de `getAssetOcr` (L4895) la función:

```ts
/**
 * Retrieve an asset transcript
 */
export function getAssetTranscript({ id }: {
    id: string;
}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: TranscriptionResponseDto;
    }>(`/transcript/${encodeURIComponent(id)}`, {
        ...opts
    }));
}
```

### 2. `web/src/lib/stores/transcript.svelte.ts` (nuevo)

Clase `TranscriptManager` que espeja `ocr.svelte.ts` (usa `AssetCacheManager`, no el SDK directamente):

- `#data = $state<TranscriptionResponseDto | null>(null)`
- `#status = $state<'loading' | 'empty' | 'error' | 'success'>('loading')` — `'empty'` cuando la petición falla con 404, `'error'` en cualquier otro fallo.
- `#loader = new CancellableTask(undefined, undefined, (error) => { this.#status = isNotFound(error) ? 'empty' : 'error'; })` y `#cleared = false`. **Importante:** `CancellableTask.execute` captura internamente los errores del callback y **no los relanza** (transiciona a `'ERRORED'` y los pasa al `errorCallback` del constructor — verificado en `cancellable-task.ts:84-91`). Por eso el 404/errores se resuelven en el `errorCallback`, no con `try/catch` alrededor de `execute`.
- `getAssetTranscript(id)`: si `#cleared` → `await this.#loader.reset(); this.#cleared = false;` luego `await this.#loader.execute(async () => { this.#data = await assetCacheManager.getAssetTranscript(id); this.#status = 'success'; }, false)`.
- **`isNotFound(error)`** = `error instanceof Error && 'status' in error && error.status === 404` — el runtime `@oazapfts/runtime` lanza `HttpError` con propiedad `status` (verificado en `@oazapfts+runtime@1.2.0/index.d.ts:48-52`). No usar la clase local `ApiError` de `utils.ts` (solo la usan `uploadRequest`/`downloadRequest` XHR, no las llamadas del SDK).
- `clear()` → `#cleared = true; this.#data = null; this.#status = 'loading';`
- `get transcript()` → `this.#data`; `get status()` → `this.#status`.
- `export const transcriptManager = new TranscriptManager();`

### 3. `web/src/lib/managers/AssetCacheManager.svelte.ts` (modificar)

- Importar `getAssetTranscript` de `@immich/sdk`.
- `#transcriptCache = new AsyncCache(getAssetTranscript);`
- `getAssetTranscript(id)` → `this.#transcriptCache.getOrFetch({ id }, true)`.
- `invalidateAsset(id)`: añadir `this.#transcriptCache.clearKey({ id });`.
- `invalidate()`: añadir `this.#transcriptCache.clear();`.
- `clearTranscriptCache()` (nuevo) reflejando `clearOcrCache`.

### 4. `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` (nuevo)

Props:

```ts
let {
  assetId,
  currentTime,
  duration,
  onSeek,
}: {
  assetId: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
} = $props();
```

- `let transcript = $derived(transcriptManager.transcript)`; `let status = $derived(transcriptManager.status)` — reactivos desde el manager (`$state` interno).
- `$effect(() => { void transcriptManager.getAssetTranscript(assetId); return () => transcriptManager.clear(); })` — patrón de `ocr.svelte`/`AssetViewer.refresh()` (cancela al cambiar de asset o destruir; la re-ejecución depende de `assetId` porque se referencia dentro del effect).
- Estado `empty` ⇒ el fetch resolvió 404 (`isNotFound()`), `error` ⇒ otro fallo.
- `let activeIndex = $derived(transcript?.segments.findIndex((s) => currentTime >= s.start && currentTime < s.end) ?? -1);` (incluye el tramo antes del primer segmento → -1 = nada activo).
- **Segmento clickeable**: `<button onclick={() => onSeek(segment.start)}>` con clase `bg-immich-primary` / texto `.immich-accent` cuando `index === activeIndex`, `hover:bg-immich-gray` si no.
- **Auto-scroll centro** en `$effect`: cuando cambia `activeIndex`, `translateEl.scrollIntoView({ behavior: 'smooth', block: 'center' })` **solo si** `!userScrolling`; `userScrolling` se activa con `wheel`/`touchmove` sobre el contenedor scrollable y se desactiva a los 2s.
- Layout: panel `fixed bottom-0 left-0 right-0` dentro del wrapper del visor, `max-h-[30vh]`, `overflow-y-auto`, background oscuro translúcido, track `danger/primary` según estado.
- Cabecera: `{$t('transcript_title')}` + metadatos `{$t('transcript_model')}: {model ?? '-'}`.
- Espaciadores: no renderizar nada extra cuando no hay transcript.

### 5. `web/src/lib/components/asset-viewer/AudioViewer.svelte` (nuevo)

- Imports media-chrome (patrón `VideoNativeViewer.svelte` L35-38) y `getAssetMediaUrl`, `AssetMediaSize` de `utils.ts`/`@immich/sdk`.
- `let audio = $state<HTMLAudioElement>();` via `bind:this` en `<audio>`.
- `let currentTime = $state(0); let duration = $state(0);`
- `const handleTimeUpdate = () => { currentTime = audio?.currentTime ?? 0; }` y `handleDurationChange` análogo.
- `<media-controller>`:
  - `<audio slot="media" {src} bind:this={audio} preload="metadata" ontimeupdate={handleTimeUpdate} ondurationchange={handleDurationChange} />` (src = `getAssetMediaUrl({ id: asset.id, size: AssetMediaSize.Original })`).
  - `<media-control-bar>` con `media-play`, `media-seek-backward`, `media-seek-forward`, `media-time-display`, `media-time-range`, `media-playback-rate-button` + `<media-playback-rate-menu>` (rates `0.5 1 1.5 2`), `media-volume` (media-chrome ya traduce sus strings vía `MediaChromeDefaults` en `+layout.svelte`).
- `<TranscriptPanel {assetId: asset.id} {currentTime} {duration} onSeek={(time) => { if (audio) { audio.currentTime = time; void audio.play(); } }} />`
- Cambios de asset (slideshow con audios): como `song` no hay; el componente se re-monta por cambio de `key` de `asset.id` en AssetViewer (patrón actual: el bloque `{:else if}` ya re-monta por `viewerKind`). Aun así, `currentTime` se resetea en `$effect` cuando cambia `assetId`.
- No hay poster/thumb: mostrar fondo `bg-immich-bg` en la zona central y el panel de transcripción abajo.

### 6. `web/src/lib/components/asset-viewer/AssetViewer.svelte` (modificar)

- Import `AudioViewer` (nuevo componente) y `AssetTypeEnum` (ya importado en el archivo).
- `viewerKind` (L429): en la derivada de tipo, añadir antes del branch de vídeo:
  ```ts
  if (asset.type === AssetTypeEnum.Audio) {
    return 'AudioViewer';
  }
  ```
- Template (fila "Asset Viewer", `{:else if viewerKind === 'AudioViewer'}` antes del branch de video):
  ```svelte
  {:else if viewerKind === 'AudioViewer'}
    <AudioViewer {asset} />
  ```
- `refresh()` (L394-406) no cambia: la transcripción se refresca vía caché invalidada en `AssetUpdate`.

### 7. i18n (`i18n/en.json` + `i18n/es.json`) (modificar)

Claves planas nuevas (insertar en orden alfabético junto a las demás llaves planas):

```json
"transcript_empty": "No transcript available for this asset.",
"transcript_error": "Failed to load the transcript.",
"transcript_loading": "Loading transcript...",
"transcript_model": "Model",
"transcript_title": "Transcript"
```

`i18n/es.json` (traducción):

```json
"transcript_empty": "No hay transcripción disponible para este recurso.",
"transcript_error": "No se pudo cargar la transcripción.",
"transcript_loading": "Cargando transcripción...",
"transcript_model": "Modelo",
"transcript_title": "Transcripción"
```

Nota: `model` podría suprimirse si se quiere, pero se incluye por trazabilidad de la Serie de Cátedra.

## Verificación

- `mise run web:lint` — eslint svelte/ts.
- `mise run web:lint-fix` si hay formateo necesario, revisando el diff.
- Typecheck del web (`mise run web:typecheck` o el comando equivalente en `mise.toml`).
- Build del web (`mise run web:build`) para `vue/tsc` equivalentes.
- SDK: `npm run build` en `packages/sdk` (o `mise run sdk:build`).
- Prueba manual: abrir un audio con transcripción → aparece el panel, resalta conforme avanza, clic salta, playback rate funciona; audio **sin** transcripción → estado `empty`; sin permiso → `error`.

## Restricciones

- NO commitear: `mise.lock`, `open-api/immich-openapi-specs.json`, `docs/superpowers/**`.
- Sin push/merge sin confirmación del usuario. Commit por tarea.
- TypeScript estricto, **cero `any`**, cero comentarios redundantes. Nomenclatura en inglés.
- No tocar `server/`, `machine-learning/`, `mobile/`.
- No regenerar el SDK desde el spec OpenAPI; el tipo/función se añaden a mano con el mismo estilo oazapfts (formato 4 espacios, comillas simples).

## Fuera de alcance

- Transcodificar audio a HLS/WebVTT en el server (fase futura).
- Descargar transcripciones (exportar a SRT/txt).
- Búsqueda dentro de la transcripción (resaltado de términos).
- Panel de transcripción en `mobile/` y en links compartidos sin permisos.