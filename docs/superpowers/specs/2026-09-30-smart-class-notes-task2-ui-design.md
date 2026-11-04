# Design: Web — Smart Class Notes, Task 2 (UI Tabs y SummaryPanel)

**Fecha:** 2026-09-30
**Ámbito:** `web/` (SvelteKit + Svelte 5 runes + TypeScript strict) + `i18n/` (raíz del repo). Fork local de Immich v3.2.0.
**Estado:** diseño propuesto — pendiente de aprobación del usuario.

## Objetivo

Construir la capa de interfaz del visor de assets para la funcionalidad **"Smart Class Notes"**. La Task 2 **solo** introduce:

1. Selector de pestañas `'transcript' | 'summary'` en la cabecera de `TranscriptPanel.svelte`, alimentado por el estado reactivo del store (`activeTab`, `summaryData`, `isGeneratingSummary`) que ya entregó la Task 1.
2. El subcomponente `SummaryPanel.svelte`, que renderiza de forma elegante los bloques de `SummaryData`: Resumen Ejecutivo, Conceptos Clave en tarjetas y Preguntas de Repaso numeradas.
3. Estado de carga (`isGeneratingSummary`) y estados vacíos, con generación automática on-demand al entrar en la pestaña Summary.

No incluye: endpoint real del resumen, exportación a Markdown, ni cambios en backend/mobile/sdk (tasks posteriores).

## Decisiones acordadas (aprobadas por el usuario en brainstorming)

1. **Auto-generar al entrar:** al activar la pestaña `summary` con `summaryData === null` y `isGeneratingSummary === false`, el panel dispara `loadAssetSummary(assetId)` automáticamente (UX fluida; el flag del store protege la re-entrada).
2. **Reutilizar `GroupTab`** (`web/src/lib/elements/GroupTab.svelte`) como selector de pestañas: patrón del repo (`AlbumFilterTabs`), accesible (radio group con `<legend>`), y con spinner de carga por pestaña listo (`group-tab-spinner-{index}`). No se crea un selector propio.
3. **Tabs solo con transcripción:** las pestañas solo se muestran cuando `status === 'success'` y hay transcripción. Con `loading`/`empty`/`error` el panel conserva el comportamiento actual (estado de la transcripción, sin tabs). Se evita ofrecer generar un resumen sin base de transcripción.
4. **`SummaryPanel` puramente presentacional:** recibe `summaryData`, `loading` y `onRetry` por props; la lógica de negocio (disparo de `loadAssetSummary`, guards) vive en `TranscriptPanel`, que posee `assetId` y el ciclo de vida del store.
5. **Estado vacío con reintento:** el caso `!summaryData && !loading` (fallo real actual/futuro) se muestra como "no hay resumen" + botón reintentar. No se añade un estado de `error` nuevo al store en esta task (el mock nunca falla y el contrato real es posterior).

## Arquitectura e integración

```
AudioViewer.svelte
└── TranscriptPanel.svelte        (modificado)
    ├── GroupTab.svelte            (reutilizado: selector Transcript | Summary)
    ├── (bloque actual de segmentos de transcripción)
    └── SummaryPanel.svelte        (nuevo, presentacional)
```

- Punto de integración: el mismo `TranscriptPanel` que ya consume el singleton `transcriptManager` (Task 1). `AudioViewer` no cambia su contrato de props hacia `TranscriptPanel`.
- El panel mantiene `role="region"` y el `aria-label` se actualiza según la pestaña activa (clave i18n correspondiente).

## Contrato de componentes

### 1. `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` (modificado)

**Props públicas (sin cambios):** `assetId: string`, `currentTime: number`, `duration: number`, `onSeek: (time: number) => void`.

**Estado derivado del store** (mismo patrón que `transcript`/`status`):

```ts
let activeTab = $derived(transcriptManager.activeTab);
let summaryData = $derived(transcriptManager.summaryData);
let isGeneratingSummary = $derived(transcriptManager.isGeneratingSummary);
```

**Cabecera:**
- Izquierda: título `$t('transcript_title')` + modelo (si `status === 'success'` y `transcript?.model`), igual que hoy.
- Derecha (solo si `status === 'success'`): `<GroupTab>` con:
  - `filters={['transcript', 'summary']}`
  - `labels={[$t('transcript_title'), $t('smart_class_summary_title')]}`
  - `selected={activeTab}`
  - `loading={isGeneratingSummary}` → el spinner de `GroupTab` se muestra solo en la pestaña activa (Summary), como requiere el diseño.
  - `label={$t('smart_class_notes_viewer_tabs')}` (aria `<legend>`).
  - `onSelect={(tab) => transcriptManager.setActiveTab(tab as 'transcript' | 'summary')}` (el contrato de `GroupTab` emite `string`; se valida con el cast tipado sin `any`).

**Auto-generación on-demand** (nuevo `$effect`):

```ts
$effect(() => {
  if (activeTab === 'summary' && summaryData === null && !isGeneratingSummary) {
    void transcriptManager.loadAssetSummary(assetId);
  }
});
```

- Guard triple: si ya hay datos o ya se está generando, no re-dispara. Sin re-entrada ni doble llamada.

**Cuerpo (switch por pestaña):**

- `activeTab === 'transcript'`: bloque actual (loading/empty/error/segmentos) **sin cambios**; `onSeek` sigue funcionando.
- `activeTab === 'summary'`:
  ```svelte
  <SummaryPanel summaryData={summaryData} loading={isGeneratingSummary}
    onRetry={() => void transcriptManager.loadAssetSummary(assetId)} />
  ```

### 2. `web/src/lib/components/asset-viewer/SummaryPanel.svelte` (nuevo)

**Props estrictas:**

```ts
type Props = {
  summaryData: SummaryData | null;
  loading: boolean;
  onRetry: () => void;
};
let { summaryData, loading, onRetry }: Props = $props();
```

**Estados derivados (prioridad):**

```ts
const view = $derived(loading ? 'loading' : summaryData ? 'data' : 'empty');
```

**Render condicional:**

1. `view === 'loading'` — `data-testid="summary-loading"`:
   - `<Icon icon={mdiLoading} class="animate-spin" />` + texto `$t('summary_generating')`, `text-sm text-immich-gray`.
2. `view === 'empty'` — `data-testid="summary-empty"`:
   - Texto `$t('summary_empty')` + botón `$t('retry')` (clave `retry` ya existe en i18n), `data-testid="summary-retry"`, estilo botón secundario (`rounded-lg px-3 py-1.5 text-sm ...`), `onclick={onRetry}`.
3. `view === 'data'` — bloques de contenido (contenedor `flex flex-col gap-4`):

   - **Resumen Ejecutivo:** `<section aria-labelledby="summary-executive-title">` con `<h3 id="summary-executive-title" class="text-xs font-semibold uppercase tracking-wide text-immich-gray">{$t('summary_section_executive')}</h3>` y `<p data-testid="summary-executive" class="text-sm text-immich-gray">{summaryData.executiveSummary}</p>`.
   - **Conceptos Clave:** `<section>` con `<h3 …>{$t('summary_section_concepts')}</h3>` y grid responsive envolviendo el `each`:
     ```svelte
     <div class="grid gap-2 sm:grid-cols-2">
       {#each summaryData.keyConcepts as concept (concept.term)}
         <div data-testid="key-concept" class="rounded-xl border border-immich-gray/30 bg-immich-bg/60 p-3">
           <strong class="text-sm text-immich-primary">{concept.term}</strong>
           <p class="mt-1 text-sm text-immich-gray">{concept.definition}</p>
         </div>
       {/each}
     </div>
     ```
   - **Preguntas de Repaso:** `<section>` con `<h3 …>{$t('summary_section_questions')}</h3>` y lista numerada:
     ```svelte
     <ol class="list-decimal space-y-1 pl-5">
       {#each summaryData.reviewQuestions as question, i (i)}
         <li data-testid="summary-question" class="text-sm text-immich-gray">{question}</li>
       {/each}
     </ol>
     ```

**Accesibilidad:** secciones con `aria-labelledby`; lista numerada semántica `<ol>`; botón de reintento accesible; no se introducen `role="tab"` manuales (las pestañas son radio group vía `GroupTab`).

### 3. `i18n/en.json` y `i18n/es.json` (modificar — raíz del repo)

Claves nuevas (alfabéticamente integradas junto a `transcript_*`):

| Clave | en.json | es.json |
|---|---|---|
| `smart_class_summary_title` | `Summary` | `Resumen` |
| `smart_class_notes_viewer_tabs` | `Transcript and summary viewer tabs` | `Pestañas del visor de transcripción y resumen` |
| `summary_generating` | `Generating summary...` | `Generando resumen...` |
| `summary_empty` | `No summary is available for this asset yet.` | `Aún no hay resumen disponible para este recurso.` |
| `summary_section_executive` | `Executive summary` | `Resumen ejecutivo` |
| `summary_section_concepts` | `Key concepts` | `Conceptos clave` |
| `summary_section_questions` | `Review questions` | `Preguntas de repaso` |

`transcript_title`, `transcript_model`, `retry` y `loading` ya existen y se reutilizan.

## Manejo de estados

| # | Estado | Disparo | UI |
|---|---|---|---|
| 1 | `loading` | `isGeneratingSummary === true` en pestaña summary (auto-al entrar) | Spinner en pestaña activa (`group-tab-spinner-1`) + `summary-loading` |
| 2 | `empty` | `summaryData === null && !isGeneratingSummary` (fallo real actual/futuro, o mock puro no iniciado) | `summary-empty` + botón `summary-retry` → `loadAssetSummary` |
| 3 | `data` | `summaryData` poblado | Bloques ejecutivo / conceptos / preguntas |
| 4 | transcript sin datos | `status` loading/empty/error | Comportamiento actual, **sin tabs** |
| — | cambio de asset | `clear()` del store (Task 1) resetea `activeTab='transcript'`, `summaryData=null`, `isGeneratingSummary=false` | Cada asset arranca en transcripción |

## Testing

### `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` (modificar)

Ampliar el mock del store en `vi.mock(import('$lib/stores/transcript.svelte'))` con: `activeTab`, `summaryData`, `isGeneratingSummary`, `setActiveTab` y `loadAssetSummary` (getters/setters vía `factory.manager`). El estado del manager se expande a:

```ts
type ManagerState = {
  status: 'loading' | 'empty' | 'error' | 'success';
  transcript: TranscriptionResponseDto | null;
  activeTab: 'transcript' | 'summary';
  summaryData: SummaryData | null;
  isGeneratingSummary: boolean;
};
```

Casos nuevos:
1. **Tabs ocultos sin transcripción:** con `status='loading' | 'empty' | 'error'` no se renderiza el `fieldset` de pestañas (assert por ausencia de `group-tab` o por `queryTestId` de las pestañas).
2. **Tabs visibles con transcripción:** con `status='success'` se muestran ambas pestañas y la activa es `transcript`.
3. **Cambio de pestaña:** clic en la pestaña Summary → `setActiveTab` llamado con `'summary'`; con `activeTab='summary'` y `summaryData` poblado se renderiza `SummaryPanel` (assert del `summary-executive` o del contenido).
4. **Auto-generación:** activar `summary` con `summaryData=null` y `isGeneratingSummary=false` → `loadAssetSummary` invocada con el `assetId`.
5. **Spinner en pestaña activa:** con `isGeneratingSummary=true` y `activeTab='summary'` existe `group-tab-spinner-1`.
6. Mantener 4 casos actuales de transcripción en verde (regresión).

> Nota: la auto-generación ocurre en un `$effect`; en el test debe darse tiempo al ciclo de runes con `await tick()` tras simular el cambio (patrón ya usado en la suite web; se concretará en el plan).

### `web/src/lib/components/asset-viewer/SummaryPanel.spec.ts` (nuevo)

Componente puramente presentacional → sin mock del store. `render(SummaryPanel, { summaryData, loading, onRetry })` con:
1. **loading:** `getByTestId('summary-loading')`.
2. **empty + retry:** `getByTestId('summary-empty')`; `fireEvent.click` en `summary-retry` → `onRetry` llamada.
3. **data ejecutivo:** texto de `executiveSummary` visible en `summary-executive`.
4. **data conceptos:** cada `term` (strong) y `definition` visibles; `getAllByTestId('key-concept')` con la longitud esperada.
5. **data preguntas:** `getAllByTestId('summary-question')` en orden y con el contenido esperado.

### `web/src/lib/stores/transcript.svelte.spec.ts`

Sin cambios: la Task 1 ya cubre `loadAssetSummary`, `setActiveTab`, `clear()` y flags.

## Fuera de alcance (tasks posteriores)

- Endpoint REST real del resumen y consumo vía `AssetCacheManager`/SDK (sustituye a `createMockSummary`).
- Exportación del resumen a Markdown (descarga `.md`).
- Estado de `error` dedicado en el store para el resumen (el `empty` + retry cubre hoy el fallo).
- Ediciones del usuario sobre el resumen / persistencia.
- Cambios en `server/`, `machine-learning/`, `mobile/`, `packages/sdk/`, `AudioViewer` (contrato de props intacto).

## Criterios de aceptación

1. `pnpm --filter immich-web run check:typescript` → exit 0.
2. `pnpm --filter immich-web run lint` → exit 0.
3. `pnpm --filter immich-web run check:svelte` → exit 0 sin warnings nuevos.
4. `pnpm --filter immich-web exec vitest run web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts web/src/lib/components/asset-viewer/SummaryPanel.spec.ts web/src/lib/stores/transcript.svelte.spec.ts` → todos los casos pass (nuevos + regresión).
5. Cero `any` en archivos nuevos/modificados (strict).
6. Todas las claves i18n nuevas presentes en `en.json` y `es.json`.
7. Tabs no visibles en `loading`/`empty`/`error`; visibles y funcionales en `success` (query manual opcional).
8. Con `activeTab='summary'` y transcripción OK, el resumen se auto-genera (spinner → `summary-executive`), sin llamadas duplicadas.
9. Commit atómico independiente (Conventional Commit) tras verificación y confirmación del usuario.