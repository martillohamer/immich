# Design: Web — Smart Class Notes, Task 1 (Store y Tipos)

**Fecha:** 2026-09-30
**Ámbito:** `web/` (SvelteKit + Svelte 5 runes + TypeScript strict) + `packages/sdk/`. Fork local de Immich v3.2.0.
**Estado:** diseño aprobado por el usuario (Enfoque A) — en implementación.

## Objetivo

Preparar la capa de tipos y estado del cliente web para la futura funcionalidad **"Smart Class Notes" (Resúmenes Inteligentes de Audio y Exportación a Markdown)**. La Task 1 **solo** introduce el modelo tipado (`SummaryData`) y extiende el store existente `TranscriptManager` con estado reactivo de pestañas, datos de resumen e indicador de generación — sin UI de pestañas, sin endpoint real y sin export a Markdown (tasks posteriores).

El punto de integración es el mismo `TranscriptManager` (singleton) que ya consume `TranscriptPanel.svelte`: un solo store que en el futuro alimentará tanto el panel de transcripción como el panel de resumen.

## Decisiones acordadas (aprobadas por el usuario)

1. **Enfoque A — extender `TranscriptManager`** (el singleton existente en `web/src/lib/stores/transcript.svelte.ts`). Se rechazaron: B (store separado `SummaryManager` — exige sincronizar dos stores en `clear()`/cambio de asset) y C (`activeTab` como `$state` local en el componente — contradice el requisito de estado reactivo de pestaña en el store y se pierde al desmontar el panel).
2. **Origen del resumen en esta fase: mock local frontend** (`createMockSummary(assetId)` pura y determinista, sin red). La firma `loadAssetSummary(id)` queda lista para apuntar a un endpoint real en una fase posterior del backend.
3. **Nuevo directorio `web/src/lib/types/`**: `transcript.ts` con `SummaryData` y `KeyConcept`. Se rechazó ubicar los tipos dentro del store o añadirlos al SDK (`packages/sdk/src/fetch-client.ts`) — el SDK solo debe contener el contrato del servidor, y este tipo es de dominio frontend.
4. **Util de mock** en `web/src/lib/utils/transcript-summary.ts`: función pura y determinista (deriva contenido del `assetId`), para que el test de la Task 1 sea estable y sin red. Es el único punto que se sustituirá por la llamada real en una fase posterior.
5. **`clear()` ampliado**: al invocarse (cambio/destrucción de asset en `$effect` de `TranscriptPanel`), además de limpiar la transcripción, resetea `summaryData`, `isGeneratingSummary` y `activeTab` a `'transcript'` — cada asset arranca en la pestaña de transcripción con resumen vacío.
6. **Segundo `CancellableTask`** (`#summaryLoader`) para la generación del resumen, espejo de `#loader` que ya gestiona la transcripción: da la misma protección de re-entrada que `getAssetTranscript`, pero con **flag propio `#summaryCleared`** (no comparte `#cleared`). Si `loadAssetSummary` consumiera el flag compartido en la ventana "cleared", un `getAssetTranscript` posterior vería `#cleared === false` con `#loader.executed === true`, y `execute()` retornaría `'DONE'` sin refetchear (datos *stale* del asset anterior). `clear()` pone ambos flags a `true`. `execute(..., false)` replica exactamente la llamada de la transcripción (`transcript.svelte.ts:30-33`), ya que `createMockSummary` es síncrono.
7. **Sin cambios en `i18n/`** en esta task: no hay strings nuevos aún (la UI de pestañas es task posterior). Sin cambios en `server/`, `machine-learning/`, `mobile/`, `open-api/`.

## Contrato del dominio (frontend)

Nuevos tipos locales (`web/src/lib/types/transcript.ts`), estrictos, cero `any`:

```ts
export type KeyConcept = {
  term: string;
  definition: string;
};

export type SummaryData = {
  executiveSummary: string;
  keyConcepts: KeyConcept[];
  reviewQuestions: string[];
};
```

`KeyConcept` se exporta por separado para que tests y futuros componentes tipen sin depender de `SummaryData`.

## Diseño

### 1. `web/src/lib/types/transcript.ts` (nuevo)

Crear directorio `web/src/lib/types/` y archivo con los dos tipos anteriores.

### 2. `web/src/lib/utils/transcript-summary.ts` (nuevo)

- `export function createMockSummary(assetId: string): SummaryData`
- Determinista: genera `executiveSummary`, `keyConcepts` (2-3 conceptos) y `reviewQuestions` (2-3 preguntas) con plantillas que incluyen el `assetId` para trazabilidad/test estable. Puro: sin red, sin `any`, sin estado.
- Es el único punto de sustitución futura por la llamada real (`assetCacheManager.getAssetSummary(...)`).

### 3. `web/src/lib/stores/transcript.svelte.ts` (modificar)

Extiende la clase `TranscriptManager` (estado privado con runes Svelte 5):

```ts
#activeTab = $state<'transcript' | 'summary'>('transcript');
#summaryData = $state<SummaryData | null>(null);
#isGeneratingSummary = $state(false);
#summaryLoader = new CancellableTask(undefined, undefined, () => {
  this.#isGeneratingSummary = false;
}); // espejo de #loader (errorCallback devuelve el flag a false ante fallo)
```

Getters (mismo patrón que `transcript`/`status`):

```ts
get activeTab() { return this.#activeTab; }
get summaryData() { return this.#summaryData; }
get isGeneratingSummary() { return this.#isGeneratingSummary; }
```

Métodos:

```ts
setActiveTab(tab: 'transcript' | 'summary') {
  this.#activeTab = tab;
}

async loadAssetSummary(assetId: string) {
  if (this.#summaryCleared) {
    await this.#summaryLoader.reset();
    this.#summaryCleared = false;
  }
  this.#isGeneratingSummary = true;
  await this.#summaryLoader.execute(async () => {
    this.#summaryData = createMockSummary(assetId);
  }, false);
  this.#isGeneratingSummary = false;
}
```

Ampliación de `clear()`:

```ts
clear() {
  // ... estatal existente (transcripción)
  this.#summaryCleared = true;
  this.#summaryData = null;
  this.#isGeneratingSummary = false;
  this.#activeTab = 'transcript';
}
```

Consideraciones:
- `isGeneratingSummary` se marca al iniciar y se limpia tras `execute()` (success o error), quedando siempre consistente.
- `loadAssetSummary` refleja el guard de re-entrada de `getAssetTranscript` con su propio flag: si `#summaryCleared`, `await this.#summaryLoader.reset()` y `#summaryCleared = false` antes de ejecutar.
- Los getters se leen desde la UI futura vía `$derived(transcriptManager.activeTab)` etc., siguiendo el patrón de `TranscriptPanel.svelte:17-18`.

### 4. `web/src/lib/stores/transcript.svelte.spec.ts` (modificar — ya existe con tests de transcripción)

Siguiendo la convención de `ocr.svelte.spec.ts` (operar sobre el Singleton, reset vía `beforeEach`). Como la generación es mock puro (sin red), **no** se necesita `vi.mock('@immich/sdk')` para el flujo de resumen.

Casos:
1. Estado inicial: `activeTab === 'transcript'`, `summaryData === null`, `isGeneratingSummary === false`.
2. `setActiveTab('summary')` → `activeTab === 'summary'`; `setActiveTab('transcript')` revierte.
3. `loadAssetSummary(assetId)` → durante la generación `isGeneratingSummary === true`; tras completar, `summaryData` poblado (assert de estructura + contenido derivado del id) e `isGeneratingSummary === false`.
4. `clear()` → resetea `summaryData`, `isGeneratingSummary` y `activeTab`.

## Fuera de alcance (tasks posteriores)

- UI de pestañas `transcript/summary` en el visor (`TranscriptPanel`, pestañas/panel de resumen).
- Contrato REST real del endpoint de resumen y su consumo vía `AssetCacheManager`/`AsyncCache`.
- Exportación del resumen a Markdown (descarga de archivo `.md`).
- Claves `i18n` para la UI de resumen.

## Criterios de aceptación

1. `pnpm --filter immich-web run check:typescript` → exit 0.
2. `pnpm --filter immich-web run lint` → exit 0.
3. `pnpm --filter immich-web run check:svelte` → exit 0 sin warnings nuevos.
4. `pnpm --filter immich-web exec vitest run web/src/lib/stores/transcript.svelte.spec.ts` → todos los casos pass.
5. Cero `any` en archivos nuevos/modificados.
6. Commit atómico independiente (Conventional Commit) una vez verificado y confirmado por el usuario.