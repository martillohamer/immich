# Plan: Smart Class Notes — Task 2 (UI: Tabs y SummaryPanel)

- **Fecha:** 2026-09-30
- **Repo:** `C:\Users\astur\Desktop\immich-main` (rama `main`)
- **Estado:** borrador en `docs/superpowers/plans/` — **nunca se commitea**.

## Objetivo

Completar el AC de la Task 2 del spec `docs/superpowers/specs/2026-09-30-smart-class-notes-task2-ui-design.md`:

> Mostrar dos pestañas (Transcripción / Resumen) mediante `GroupTab` cuando un recurso tiene transcripción; al activar la pestaña Resumen:
> - auto-generar el resumen si aún no existe;
> - renderizar `SummaryPanel` (vista presentacional) con secciones ejecutivo, conceptos clave y preguntas de repaso;
> - volver a la pestaña Transcripción para ver los segmentos.
>
> AC#2: `SummaryPanel.spec.ts` + `SummaryPanel.svelte` (TDD). AC#3: `TranscriptPanel.spec.ts` ampliado + `TranscriptPanel.svelte`. AC#4: `status !== 'success'` → sin pestañas. AC#5: 7 claves de i18n nuevas en `en.json`/`es.json` (orden alfabético). AC#6: gates (`check:typescript`, `lint`, `check:svelte`, vitest), commit único atómico **gated** (solo tras confirmación explícita del usuario).

## Contexto técnico verificado (no cambiar)

- Root vitest = `web/` → **comandos con rutas `src/...`, NO `web/src/...`** (corrige el comando del AC#4). Config en `web/vite.config.ts` → `test: { name:'web:unit', include:['src/**/*.{test,spec}.{js,ts}'], environment:'happy-dom', setupFiles:['./src/test-data/setup.ts'] }`.
- `web/tsconfig.json` incluye los `.spec.ts` en `tsc --noEmit` → los specs deben ser estrictos y sin `any`.
- `setup.ts` (test-data) hace `await init({ fallbackLocale: 'dev' })` sin registrar mensajes → en tests `$t('clave')` **devuelve la clave literal** (no lanza). Por eso los specs asertan con `data-testid` / datos reales, nunca texto i18n.
- Store Task 1 (`transcript.svelte.ts`): getters `transcript`, `status`, `activeTab`, `summaryData`, `isGeneratingSummary`; métodos `getAssetTranscript(id)`, `setActiveTab(tab)`, `loadAssetSummary(assetId)`, `clear()`. **`clear()` también resetea `activeTab='transcript'`, `summaryData=null`, `isGeneratingSummary=false`** → el `$effect` de transcripción existente (con cleanup `clear()`) ya reinicia el estado al cambiar de asset. No tocar el store.
- `GroupTab.svelte`: props `{ filters: string[]; labels?: string[]; badges?; selected: string; label: string; loading?: boolean; onSelect: (selected: string) => void }`. Renderiza `<fieldset>` + `<legend class="sr-only">{label}>`, radios `value={filter}` `checked={filter === selected}` `onchange={() => onSelect(filter)}`, spinner `data-testid="group-tab-spinner-${index}"` cuando `loading && filter === selected`.
- `types/transcript.ts`: `SummaryData { executiveSummary: string; keyConcepts: KeyConcept[]; reviewQuestions: string[] }`, `KeyConcept { term; definition }`.
- i18n: `retry` y `transcript_title`/`transcript_model` existen en ambos idiomas. Anchors de inserción:
  - `en.json`: tras línea 2096 `"smart_album": "Smart album",` (antes de `some_assets_already_have_a_location_warning`); tras línea 2133 `"suggestions": "Suggestions",` (antes de `sunrise_on_the_beach`).
  - `es.json`: tras línea 2073 `"smart_album": "Álbum inteligente",` (antes de `some_assets_already_have_a_location_warning`); tras línea 2110 `"suggestions": "Sugerencias",` (antes de `sunrise_on_the_beach`).
- Reglas repo: `format`** NO es gate** (no reordenar imports ajenos); códigos sin `any`; test IDs en inglés; textos en español.

## Archivos

- Editar: `i18n/en.json`, `i18n/es.json`, `web/src/lib/components/asset-viewer/TranscriptPanel.svelte`, `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`.
- Crear: `web/src/lib/components/asset-viewer/SummaryPanel.svelte`, `web/src/lib/components/asset-viewer/SummaryPanel.spec.ts`.
- Commit final (archivos con `git add` explícito): `i18n/en.json` `i18n/es.json` `web/src/lib/components/asset-viewer/SummaryPanel.svelte` `web/src/lib/components/asset-viewer/SummaryPanel.spec.ts` `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`.
- **NUNCA** commitear `docs/superpowers/**`, este plan ni `mise.lock`.

---

## Tarea 1 — i18n (7 claves nuevas)

Inserciones (mantener orden alfabético y formato existente, 2 espacios):

**`en.json`** tras `"smart_album": "Smart album",`:
```json
  "smart_class_notes_viewer_tabs": "Transcript and summary viewer tabs",
  "smart_class_summary_title": "Summary",
```
**`en.json`** tras `"suggestions": "Suggestions",`:
```json
  "summary_empty": "No summary is available for this asset yet.",
  "summary_generating": "Generating summary...",
  "summary_section_concepts": "Key concepts",
  "summary_section_executive": "Executive summary",
  "summary_section_questions": "Review questions",
```
**`es.json`** tras `"smart_album": "Álbum inteligente",`:
```json
  "smart_class_notes_viewer_tabs": "Pestañas del visor de transcripción y resumen",
  "smart_class_summary_title": "Resumen",
```
**`es.json`** tras `"suggestions": "Sugerencias",`:
```json
  "summary_empty": "Aún no hay resumen disponible para este recurso.",
  "summary_generating": "Generando resumen...",
  "summary_section_concepts": "Conceptos clave",
  "summary_section_executive": "Resumen ejecutivo",
  "summary_section_questions": "Preguntas de repaso",
```
Orden léxico verificado: `smart_album < smart_class_notes_viewer_tabs < smart_class_summary_title < some_assets...`; `suggestions < summary_empty < summary_generating < summary_section_concepts < summary_section_executive < summary_section_questions < sunrise_on_the_beach`. OK.

**Selftest:** (con `workdir=web`) `pnpm --filter immich-web exec vitest run src/lib/i18n.spec.ts` → PASS (solo valida loaders + `getClosestAvailableLocale`; no fallará con claves nuevas).

---

## Tarea 2 — `SummaryPanel` (TDD)

### Paso 2.1 — RED: escribir `SummaryPanel.spec.ts`

Casos exactos (5):
1. `loading` → `getByTestId('summary-loading')` presente.
2. `empty` → `getByTestId('summary-empty')` presente; `fireEvent.click(getByTestId('summary-retry'))` → `onRetry` llamado.
3. con `summaryData` → `getByTestId('summary-executive')` con `toHaveTextContent` del `executiveSummary`.
4. conceptos → `getAllByTestId('key-concept')` length 2, con texto de term y definition.
5. preguntas → `getAllByTestId('summary-question')` length 2, en orden (`[0]`/`[1]`).

```ts
import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect } from 'vitest';
import SummaryPanel from './SummaryPanel.svelte';
import type { SummaryData } from '$lib/types/transcript';

const mockSummary: SummaryData = {
  executiveSummary: 'Resumen ejecutivo de prueba',
  keyConcepts: [
    { term: 'Concepto A', definition: 'Definición A' },
    { term: 'Concepto B', definition: 'Definición B' },
  ],
  reviewQuestions: ['Pregunta 1', 'Pregunta 2'],
};

describe('SummaryPanel', () => {
  it('shows loading testid when loading', () => {
    const { getByTestId } = render(SummaryPanel, {
      summaryData: null,
      loading: true,
      onRetry: vi.fn(),
    });
    expect(getByTestId('summary-loading')).toBeInTheDocument();
  });

  it('shows empty testid and calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(SummaryPanel, {
      summaryData: null,
      loading: false,
      onRetry,
    });
    expect(getByTestId('summary-empty')).toBeInTheDocument();
    await fireEvent.click(getByTestId('summary-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders the executive summary text', () => {
    const { getByTestId } = render(SummaryPanel, {
      summaryData: mockSummary,
      loading: false,
      onRetry: vi.fn(),
    });
    expect(getByTestId('summary-executive')).toHaveTextContent(mockSummary.executiveSummary);
  });

  it('renders all key concepts with term and definition', () => {
    const { getAllByTestId } = render(SummaryPanel, {
      summaryData: mockSummary,
      loading: false,
      onRetry: vi.fn(),
    });
    const concepts = getAllByTestId('key-concept');
    expect(concepts).toHaveLength(2);
    expect(concepts[0]).toHaveTextContent('Concepto A');
    expect(concepts[0]).toHaveTextContent('Definición A');
    expect(concepts[1]).toHaveTextContent('Concepto B');
    expect(concepts[1]).toHaveTextContent('Definición B');
  });

  it('renders review questions in order', () => {
    const { getAllByTestId } = render(SummaryPanel, {
      summaryData: mockSummary,
      loading: false,
      onRetry: vi.fn(),
    });
    const questions = getAllByTestId('summary-question');
    expect(questions).toHaveLength(2);
    expect(questions[0]).toHaveTextContent('Pregunta 1');
    expect(questions[1]).toHaveTextContent('Pregunta 2');
  });
});
```
**Verificar RED:** falla compilando (no existe `SummaryPanel.svelte`).

### Paso 2.2 — GREEN: `SummaryPanel.svelte`

```svelte
<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiLoading } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { SummaryData } from '$lib/types/transcript';

  let {
    summaryData,
    loading,
    onRetry,
  }: {
    summaryData: SummaryData | null;
    loading: boolean;
    onRetry: () => void;
  } = $props();

  const view = $derived(loading ? 'loading' : summaryData ? 'data' : 'empty');
</script>

{#if view === 'loading'}
  <div data-testid="summary-loading" class="flex items-center gap-2 text-sm text-immich-gray">
    <Icon icon={mdiLoading} class="animate-spin" size="16" />
    {$t('summary_generating')}
  </div>
{:else if view === 'empty'}
  <div data-testid="summary-empty" class="flex flex-col items-start gap-2 text-sm text-immich-gray">
    {$t('summary_empty')}
    <button type="button" data-testid="summary-retry" onclick={onRetry} class="rounded-lg px-3 py-1.5 text-sm bg-immich-primary text-white hover:bg-immich-primary/80">
      {$t('retry')}
    </button>
  </div>
{:else}
  <section aria-labelledby="summary-executive-title" class="flex flex-col gap-1">
    <h3 id="summary-executive-title" class="text-sm font-semibold text-immich-primary">{$t('summary_section_executive')}</h3>
    <p data-testid="summary-executive" class="text-sm/relaxed text-immich-fg">{summaryData!.executiveSummary}</p>
  </section>

  <section aria-labelledby="summary-concepts-title" class="flex flex-col gap-1">
    <h3 id="summary-concepts-title" class="text-sm font-semibold text-immich-primary">{$t('summary_section_concepts')}</h3>
    <ul class="grid gap-2 sm:grid-cols-2">
      {#each summaryData!.keyConcepts as concept}
        <li data-testid="key-concept" class="rounded-lg bg-immich-bg p-2 text-sm">
          <p class="font-medium">{concept.term}</p>
          <p class="text-immich-gray">{concept.definition}</p>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="summary-questions-title" class="flex flex-col gap-1">
    <h3 id="summary-questions-title" class="text-sm font-semibold text-immich-primary">{$t('summary_section_questions')}</h3>
    <ol class="list-decimal space-y-1 pl-5 text-sm/relaxed">
      {#each summaryData!.reviewQuestions as question}
        <li data-testid="summary-question">{question}</li>
      {/each}
    </ol>
  </section>
{/if}
```

Notas: `view === 'data'` garantiza `summaryData` no nulo → el non-null `!` en la rama `{:else}` es correcto (sin `any`). Secciones con `aria-labelledby` + `h3 id` (patrón spec). Estilos del botón retry según spec (líneas 105-107): `rounded-lg px-3 py-1.5 text-sm`.

**Verificar GREEN:** `(workdir=web) pnpm --filter immich-web exec vitest run src/lib/components/asset-viewer/SummaryPanel.spec.ts` → 5 PASS.

---

## Tarea 3 — `TranscriptPanel` (TDD)

### Paso 3.1 — RED: ampliar `TranscriptPanel.spec.ts`

1. `ManagerState` gana `activeTab: 'transcript' | 'summary'`, `summaryData: SummaryData | null`, `isGeneratingSummary: boolean`.
2. El mock gana getters (`activeTab`, `summaryData`, `isGeneratingSummary`) y métodos `setActiveTab: vi.fn(...)` (que muta `factory.manager.activeTab`) y `loadAssetSummary: vi.fn()`; `clear` se queda `vi.fn()` sin mutar (evita resets a mitad de test).
3. `afterEach`/`beforeEach` resetean TODOS los campos. Actualizar los 4 tests existentes con los campos nuevos.
4. Nuevos casos:
   - `it.each(['loading', 'empty', 'error'])` → `queryAllByRole('radio')` length 0 (AC#4: sin pestañas).
   - success + transcript → `getAllByRole('radio')` length 2, `radios[0].checked` true, `radios[1].checked` false.
   - success + transcript + `activeTab:'summary'` → `radios[1].checked` true; `getByTestId('summary-executive')` presente con `summaryData` poblado.
   - clic en radio[1] → `vi.mocked(transcriptManager.setActiveTab)` llamado con `'summary'`.
   - auto-generación: `activeTab:'summary'`, `summaryData:null`, `isGeneratingSummary:false` → `await tick()` → `vi.mocked(transcriptManager.loadAssetSummary)` llamado con `'asset-1'` y `getByTestId('summary-empty')` presente.
   - spinner: `activeTab:'summary'`, `isGeneratingSummary:true` → `getByTestId('group-tab-spinner-1')` presente y `getByTestId('summary-loading')`.

El `it.each` para tabs ocultos (mock no reactivo: los getters leen `factory.manager`, luego el estado se fija **antes** de `render`):

```ts
import type { TranscriptionResponseDto } from '@immich/sdk';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import TranscriptPanel from './TranscriptPanel.svelte';
import type { SummaryData } from '$lib/types/transcript';

type ManagerState = {
  status: 'loading' | 'empty' | 'error' | 'success';
  transcript: TranscriptionResponseDto | null;
  activeTab: 'transcript' | 'summary';
  summaryData: SummaryData | null;
  isGeneratingSummary: boolean;
};

const defaultManager: ManagerState = {
  status: 'loading',
  transcript: null,
  activeTab: 'transcript',
  summaryData: null,
  isGeneratingSummary: false,
};

const factory: { manager: ManagerState } = { manager: { ...defaultManager } };

vi.mock(import('$lib/stores/transcript.svelte'), () => ({
  transcriptManager: {
    get status() {
      return factory.manager.status;
    },
    get transcript() {
      return factory.manager.transcript;
    },
    get activeTab() {
      return factory.manager.activeTab;
    },
    get summaryData() {
      return factory.manager.summaryData;
    },
    get isGeneratingSummary() {
      return factory.manager.isGeneratingSummary;
    },
    getAssetTranscript: vi.fn(),
    setActiveTab: vi.fn((tab: 'transcript' | 'summary') => {
      factory.manager.activeTab = tab;
    }),
    loadAssetSummary: vi.fn(),
    clear: vi.fn(),
  } as never,
}));

const transcript: TranscriptionResponseDto = {
  text: 'Hola mundo',
  segments: [
    { start: 0, end: 2.4, text: 'Hola' },
    { start: 2.4, end: 5, text: 'mundo' },
  ],
  language: 'es',
  model: 'whisper',
  createdAt: new Date('2026-09-26T00:00:00Z'),
};

const mockSummary: SummaryData = {
  executiveSummary: 'Resumen ejecutivo de prueba',
  keyConcepts: [{ term: 'C', definition: 'D' }],
  reviewQuestions: ['Q1'],
};

describe('TranscriptPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    factory.manager = { ...defaultManager };
  });

  afterEach(() => {
    factory.manager = { ...defaultManager };
    vi.clearAllMocks();
  });

  it('renders segments and highlights the active one', () => {
    factory.manager = { ...defaultManager, status: 'success', transcript };
    const { getByText, getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 1,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(getByText('Hola')).toBeInTheDocument();
    expect(getByText('mundo')).toBeInTheDocument();
    expect(getByTestId('transcript-heading')).toBeInTheDocument();
  });

  it('calls onSeek with the segment start time when clicked', async () => {
    factory.manager = { ...defaultManager, status: 'success', transcript };
    const onSeek = vi.fn();
    const { getAllByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek,
    });
    await fireEvent.click(getAllByRole('button')[1]);
    expect(onSeek).toHaveBeenCalledWith(2.4);
  });

  it('shows empty testid when status is empty', () => {
    factory.manager = { ...defaultManager, status: 'empty' };
    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(getByTestId('transcript-empty')).toBeInTheDocument();
  });

  it('shows error testid when status is error', () => {
    factory.manager = { ...defaultManager, status: 'error' };
    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(getByTestId('transcript-error')).toBeInTheDocument();
  });

  it.each(['loading', 'empty', 'error'] as const)('hides the tabs when status is %s', (status) => {
    factory.manager = { ...defaultManager, status };
    const { queryAllByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(queryAllByRole('radio')).toHaveLength(0);
  });

  it('shows the tabs with the transcript tab selected when there is a transcript', () => {
    factory.manager = { ...defaultManager, status: 'success', transcript };
    const { getAllByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    const radios = getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it('calls setActiveTab with summary when the summary tab is clicked', async () => {
    factory.manager = { ...defaultManager, status: 'success', transcript };
    const { getAllByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    await fireEvent.change(getAllByRole('radio')[1]);
    expect(vi.mocked(transcriptManager.setActiveTab)).toHaveBeenCalledWith('summary');
  });

  it('shows the summary view when the summary tab is selected and data is available', () => {
    factory.manager = {
      ...defaultManager,
      status: 'success',
      transcript,
      activeTab: 'summary',
      summaryData: mockSummary,
    };
    const { getAllByRole, getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    const radios = getAllByRole('radio') as HTMLInputElement[];
    expect(radios[1].checked).toBe(true);
    expect(getByTestId('summary-executive')).toHaveTextContent(mockSummary.executiveSummary);
  });

  it('auto-generates the summary when the summary tab is active and no summary exists', async () => {
    factory.manager = {
      ...defaultManager,
      status: 'success',
      transcript,
      activeTab: 'summary',
      summaryData: null,
    };
    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    await tick();
    expect(vi.mocked(transcriptManager.loadAssetSummary)).toHaveBeenCalledWith('asset-1');
    expect(getByTestId('summary-empty')).toBeInTheDocument();
  });

  it('shows a spinner in the summary tab while generating', () => {
    factory.manager = {
      ...defaultManager,
      status: 'success',
      transcript,
      activeTab: 'summary',
      isGeneratingSummary: true,
    };
    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(getByTestId('group-tab-spinner-1')).toBeInTheDocument();
    expect(getByTestId('summary-loading')).toBeInTheDocument();
  });
});
```

Notas TS: `vi.mocked(transcriptManager.setActiveTab)` tipo real del método → ok en `tsc --noEmit` (el mock se marca `as never`, sin `any`). `fireEvent.change` dispara `onchange` del radio (maneja `onSelect(filter)`). En el test de auto-generación el mock no reactivo corre el `$effect` una vez al montar; `await tick()` flush; `loadAssetSummary` mock no muta estado → sigue `summary-empty`.

**Verificar RED:** el spec falla (faltan getters en el mock si no se actualizan juntos, y fallan los nuevos casos hasta implementar el componente).

### Paso 3.2 — GREEN: modificar `TranscriptPanel.svelte`

Cambios exactos:

**Script** — añadir imports y estado (mantener orden de imports del archivo; añadir `GroupTab` y `SummaryPanel` junto a los otros locales):
```ts
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import GroupTab from '$lib/elements/GroupTab.svelte';
  import SummaryPanel from './SummaryPanel.svelte';
  import { t } from 'svelte-i18n';
```
Tras `status`/`transcript`:
```ts
  let activeTab = $derived(transcriptManager.activeTab);
  let summaryData = $derived(transcriptManager.summaryData);
  let isGeneratingSummary = $derived(transcriptManager.isGeneratingSummary);
```
Nuevo `$effect` (sin cleanup; el cleanup de `clear()` ya está en el effect de transcripción):
```ts
  $effect(() => {
    if (activeTab === 'summary' && status === 'success' && transcript && summaryData === null && !isGeneratingSummary) {
      void transcriptManager.loadAssetSummary(assetId);
    }
  });
```

**Markup** — si `status === 'success' && transcript`, pestañas junto al título (filas del heading):
```svelte
    <div class="flex items-baseline justify-between" data-testid="transcript-heading">
      <h2 class="text-sm font-semibold text-immich-primary">{$t('transcript_title')}</h2>
      {#if status === 'success' && transcript?.model}
        <span class="text-xs text-immich-gray">{$t('transcript_model')}: {transcript.model}</span>
      {/if}
    </div>

    {#if status === 'success' && transcript}
      <div class="flex justify-end">
        <GroupTab
          filters={['transcript', 'summary']}
          labels={[$t('transcript_title'), $t('smart_class_summary_title')]}
          selected={activeTab}
          label={$t('smart_class_notes_viewer_tabs')}
          loading={isGeneratingSummary}
          onSelect={(tab) => transcriptManager.setActiveTab(tab as 'transcript' | 'summary')}
        />
      </div>
    {/if}
```
**Contenido** — reemplazar la rama de segmentos para intercalar el summary:
```svelte
    {#if status === 'loading'}
      <div data-testid="transcript-loading" class="text-sm text-immich-gray">{$t('transcript_loading')}</div>
    {:else if status === 'empty'}
      <div data-testid="transcript-empty" class="text-sm text-immich-gray">{$t('transcript_empty')}</div>
    {:else if status === 'error'}
      <div data-testid="transcript-error" class="text-sm text-red-600">{$t('transcript_error')}</div>
    {:else if activeTab === 'summary'}
      <SummaryPanel
        summaryData={summaryData}
        loading={isGeneratingSummary}
        onRetry={() => void transcriptManager.loadAssetSummary(assetId)}
      />
    {:else if transcript}
      <div class="flex flex-col gap-1">
        {#each transcript.segments as segment, index (index)}
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-start text-sm/relaxed transition-colors {index === activeIndex
              ? 'dark bg-immich-primary text-white'
              : 'hover:bg-immich-gray'}"
            onclick={() => onSeek(segment.start)}
            data-active={index === activeIndex ? 'true' : undefined}
          >
            {segment.text}
          </button>
        {/each}
      </div>
    {/if}
```
Aria-label dinámico → `aria-label={activeTab === 'summary' ? $t('smart_class_summary_title') : $t('transcript_title')}`.

**Verificar GREEN:** `(workdir=web) pnpm --filter immich-web exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts src/lib/components/asset-viewer/SummaryPanel.spec.ts` → todos PASS. Además `src/lib/stores/transcript.svelte.spec.ts` (no cambia).

---

## Tarea 4 — Verificación integrada y commit

### Gates (workdir=`web`)

1. `pnpm --filter immich-web run check:typescript` → `tsc --noEmit` PASS (specs incluidos).
2. `pnpm --filter immich-web run lint` → `eslint --max-warnings 0` PASS.
3. `pnpm --filter immich-web run check:svelte` → `svelte-check --no-tsconfig --fail-on-warnings --compiler-warnings "state_referenced_locally:ignore"` PASS.
4. Suite: `pnpm --filter immich-web exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts src/lib/components/asset-viewer/SummaryPanel.spec.ts src/lib/stores/transcript.svelte.spec.ts src/lib/i18n.spec.ts` → PASS.
5. Opcional (no gate): correr `pnpm exec prettier --write` **solo** sobre los 6 archivos del commit.

### Commit

Sin confirmación del usuario no se commitea ni se hace push/merge. Mensaje propuesto:

```
feat(web): add Smart Class Notes summary tabs and SummaryPanel

- i18n keys for summary viewer tabs and panel sections (en, es)
- SummaryPanel presentational component with empty/loading/data states
- TranscriptPanel tabbed UI driven by transcriptManager.activeTab
- auto-generate summary and expose retry flow
```

Pasos exactos (PowerShell):
```powershell
git add i18n/en.json i18n/es.json `
  web/src/lib/components/asset-viewer/SummaryPanel.svelte `
  web/src/lib/components/asset-viewer/SummaryPanel.spec.ts `
  web/src/lib/components/asset-viewer/TranscriptPanel.svelte `
  web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts
git commit -m "feat(web): add Smart Class Notes summary tabs and SummaryPanel"
```
Verificar antes: `git status` limpio salvo esos 6 archivos + `docs/superpowers/**` (untracked, **no** añadir), `git log --oneline -10` (Task 1 `406490e` al tope).

## Riegos / paradas

- Si un test del $effect de auto-generación es flaky en `happy-dom`, priorizar `await tick()` tras `render` (no `flushSync`); el mock no reactivo solo permite lanzamiento al montar.
- Si `fireEvent.change` sobre radio no propagara en `happy-dom`, usar `fireEvent.click(radio)` — el manejador `onchange` no lee el evento.
- Si `svelte-check` marca `summaryData!` en `SummaryPanel.svelte`: refactorizar a `{#if summaryData}` anidado en lugar de non-null assertions (zero `any` igual se mantiene).
- No tocar `transcript.svelte.ts` ni `GroupTab.svelte`.