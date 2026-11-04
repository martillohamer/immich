# Smart Class Notes — Task 1 (Store y Tipos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir los tipos `SummaryData`/`KeyConcept`, el generador de resumen mock `createMockSummary` y el estado reactivo de resumen/pestaña (`activeTab`, `summaryData`, `isGeneratingSummary`, `setActiveTab`, `loadAssetSummary`) en el store `TranscriptManager` — sin UI, sin endpoint real y sin export, cada pieza verificada con vitest y los quality gates de typecheck.

**Architecture:** Extender el singleton `TranscriptManager` (Enfoque A aprobado) con un segundo `CancellableTask` (`#summaryLoader`) espejo de `#loader`, cada uno con su propio *cleared flag* (`#cleared` para transcripción, `#summaryCleared` para resumen) para evitar datos *stale* entre assets. El resumen se genera con un mock local puro y determinista (`createMockSummary(assetId)`) llamado dentro de `execute(..., false)`, que será el único punto de sustitución futura por el endpoint real.

**Tech Stack:** Svelte 5 runes (`$state`), TypeScript strict (cero `any`), Vitest, `CancellableTask` (util existente del repo), `pnpm` workspaces.

## Global Constraints

```md
- Solo se toca `web/`. NO tocar `server/`, `machine-learning/`, `mobile/`, `open-api/`, `packages/sdk/`, `i18n/` (decisión #7).
- NUNCA commitear `docs/superpowers/**` ni `mise.lock` ni archivos de configuración OS.
- `git add <archivo>` explícito (nunca `git add .` ni `git commit -a`); commits atómicos Conventional Commits; sin `push`/`merge` sin confirmación explícita del usuario.
- TypeScript strict, cero `any`, cero `@ts-expect-error`, nomenclatura en inglés para identificadores de código, sin comentarios redundantes.
- `CancellableTask.execute(f, cancellable)`: el 2º argumento es OBLIGATORIO → usar SIEMPRE `, false`. `execute()` retorna `'DONE'` si `executed === true` (throwaway), por eso cada loader necesita su propio `reset()` vía su propio flag tras `clear()`.
- `clear()` pone AMBOS flags (`#cleared` y `#summaryCleared`) a `true`; cada `get*`/`load*` resetea SOLO su propio loader cuando su flag está activo.
- Svelte 5 solo runes (`$state`), getters reactivos SIN reassignment en tests.
- Vitest: operar sobre el Singleton; reset vía `beforeEach` (patrón `ocr.svelte.spec.ts:34-39`).
- No confiar en `pnpm --filter immich-web run check:all` (exit 1 pre-existente por `--fail-on-warnings`, 62 warnings baseline). Usar los gates por componente.
- Contenido del mock = datos (no labels UI) → NO requiere i18n; determinista por `assetId`.
- El implementador asume contexto cero: consultar `web/src/lib/utils/cancellable-task.ts` y `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` para el patrón de consumo.
- Todos los comandos se ejecutan desde la raíz del repo: `C:\Users\astur\Desktop\immich-main`.
```

---

### Task 1: Tipos de dominio (`web/src/lib/types/transcript.ts`)

**Files:**
- Create: `web/src/lib/types/transcript.ts`
- Test: ninguno (archivo de tipos puro; el gate es `check:typescript`)

**Interfaces:**
- Consumes: nada.
- Produces: `KeyConcept` y `SummaryData` (usados por Task 2 y Task 3).

- [ ] **Step 1: Crear el directorio y el archivo de tipos**

Crear la carpeta `web/src/lib/types/` y el archivo `web/src/lib/types/transcript.ts` con:

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

- [ ] **Step 2: Verificar el typecheck**

Run: `pnpm --filter immich-web run check:typescript`
Expected: exit 0, sin errores nuevos (el archivo queda cubierto por el `tsconfig` de `web/`).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types/transcript.ts
git commit -m "feat(web): add summary domain types for smart class notes"
```

---

### Task 2: Generador mock de resumen (`transcript-summary.ts`) + spec

**Files:**
- Create: `web/src/lib/utils/transcript-summary.ts`
- Test: `web/src/lib/utils/transcript-summary.spec.ts`

**Interfaces:**
- Consumes: `SummaryData` (Task 1).
- Produces: `createMockSummary(assetId: string): SummaryData` — función pura, determinista, sin red ni estado (usada por Task 3).

- [ ] **Step 1: Escribir el test que falla**

Crear `web/src/lib/utils/transcript-summary.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMockSummary } from '$lib/utils/transcript-summary';

describe('createMockSummary', () => {
  it('returns a summary whose content is derived from the asset id', () => {
    const summary = createMockSummary('asset-1');
    expect(summary.executiveSummary).toContain('asset-1');
  });

  it('returns key concepts with term and definition', () => {
    const summary = createMockSummary('asset-1');
    expect(summary.keyConcepts.length).toBeGreaterThan(0);
    for (const concept of summary.keyConcepts) {
      expect(concept.term.length).toBeGreaterThan(0);
      expect(concept.definition.length).toBeGreaterThan(0);
    }
  });

  it('returns review questions', () => {
    const summary = createMockSummary('asset-1');
    expect(summary.reviewQuestions.length).toBeGreaterThan(0);
    for (const question of summary.reviewQuestions) {
      expect(question.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same asset id', () => {
    expect(createMockSummary('asset-1')).toEqual(createMockSummary('asset-1'));
  });

  it('derives different content for different asset ids', () => {
    expect(createMockSummary('asset-1').executiveSummary).not.toEqual(
      createMockSummary('asset-2').executiveSummary,
    );
  });
});
```

- [ ] **Step 2: Run el test para verificar que falla**

Run: `pnpm --filter immich-web exec vitest run src/lib/utils/transcript-summary.spec.ts`
Expected: FAIL — `Failed to resolve import "$lib/utils/transcript-summary"` (el módulo aún no existe). NOTA: el root de vitest es `web/` (`include: src/**` en `vite.config.ts:60`); los filters van relativos a `src/`, sin prefijo `web/`.

- [ ] **Step 3: Implementación mínima**

Crear `web/src/lib/utils/transcript-summary.ts`:

```ts
import type { SummaryData } from '$lib/types/transcript';

export function createMockSummary(assetId: string): SummaryData {
  return {
    executiveSummary: `Resumen inteligente generado de forma local para el asset ${assetId}.`,
    keyConcepts: [
      { term: 'Concepto central', definition: 'Definición derivada de la transcripción del asset.' },
      { term: 'Idea secundaria', definition: 'Definición contextual asociada al asset.' },
    ],
    reviewQuestions: [
      '¿Cuál es la idea principal de este material?',
      '¿Qué ejemplos ilustran los conceptos clave?',
      '¿Cómo se relaciona este contenido con el tema general?',
    ],
  };
}
```

- [ ] **Step 4: Run el test para verificar que pasa**

Run: `pnpm --filter immich-web exec vitest run src/lib/utils/transcript-summary.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/utils/transcript-summary.ts web/src/lib/utils/transcript-summary.spec.ts
git commit -m "feat(web): add deterministic mock summary generator"
```

---

### Task 3: Estado de resumen en el store (`transcript.svelte.ts`) + spec

**Files:**
- Modify: `web/src/lib/stores/transcript.svelte.ts` (archivo actual: 43 líneas)
- Modify (test): `web/src/lib/stores/transcript.svelte.spec.ts` (ya existe con 4 tests de transcripción)

**Interfaces:**
- Consumes: `SummaryData` (Task 1), `createMockSummary` (Task 2), el patrón existente `#loader`/`#cleared`/`getAssetTranscript`.
- Produces: getters `activeTab`, `summaryData`, `isGeneratingSummary`; métodos `setActiveTab(tab: 'transcript' | 'summary')`, `loadAssetSummary(assetId: string)`; `clear()` ampliado. Todo consumido por la futura UI de pestañas (fuera de alcance).

- [ ] **Step 1: Añadir los tests que fallan al spec existente**

Añadir el siguiente bloque al FINAL de `web/src/lib/stores/transcript.svelte.spec.ts` (describe de nivel superior, hermano del existente; lleva su propio `beforeEach` porque no hereda el del otro `describe`). `getAssetTranscript`, `transcript`, `assetCacheManager` ya están importados y mockeados en ese archivo — no repetir imports ni el `vi.mock`.

```ts
describe('summary state', () => {
  beforeEach(() => {
    transcriptManager.clear();
    assetCacheManager.clearTranscriptCache();
    vi.clearAllMocks();
  });

  it('initializes with transcript tab, no summary, not generating', () => {
    expect(transcriptManager.activeTab).toBe('transcript');
    expect(transcriptManager.summaryData).toBeNull();
    expect(transcriptManager.isGeneratingSummary).toBe(false);
  });

  it('switches tabs with setActiveTab', () => {
    transcriptManager.setActiveTab('summary');
    expect(transcriptManager.activeTab).toBe('summary');

    transcriptManager.setActiveTab('transcript');
    expect(transcriptManager.activeTab).toBe('transcript');
  });

  it('marks generating during load and clears it on completion', async () => {
    const loading = transcriptManager.loadAssetSummary('asset-1');

    expect(transcriptManager.isGeneratingSummary).toBe(true);

    await loading;

    expect(transcriptManager.isGeneratingSummary).toBe(false);
    expect(transcriptManager.summaryData).not.toBeNull();
    expect(transcriptManager.summaryData?.executiveSummary).toContain('asset-1');
  });

  it('keeps summary state isolated from a later transcript fetch', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.loadAssetSummary('asset-1');
    await transcriptManager.getAssetTranscript('asset-1');

    expect(transcriptManager.summaryData).not.toBeNull();
    expect(transcriptManager.transcript).toEqual(transcript);
  });

  it('refetches a summary after clear (per-loader re-entry guard)', async () => {
    await transcriptManager.loadAssetSummary('asset-1');
    transcriptManager.clear();

    await transcriptManager.loadAssetSummary('asset-2');

    expect(transcriptManager.summaryData?.executiveSummary).toContain('asset-2');
  });

  it('transcript refetch still works after a summary load in the cleared window', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.getAssetTranscript('asset-1');
    transcriptManager.clear();
    // CORRECCIÓN TDD: `assetCacheManager` NO está mockeado; sin invalidar su caché,
    // la 2ª llamada al SDK se sirve desde caché y el refetch del #loader no se observa.
    assetCacheManager.clearTranscriptCache();

    // El resumen consume primero la ventana "cleared" con SU propio flag.
    await transcriptManager.loadAssetSummary('asset-2');

    // El loader de transcripción se resetea con SU propio flag y debe refetchear,
    // no corto-circuitar con el 'DONE' del loader ya ejecutado.
    await transcriptManager.getAssetTranscript('asset-1');

    expect(getAssetTranscript).toHaveBeenCalledTimes(2);
    expect(transcriptManager.transcript).toEqual(transcript);
  });

  it('clears summary state and resets to transcript tab', async () => {
    await transcriptManager.loadAssetSummary('asset-1');
    transcriptManager.setActiveTab('summary');

    transcriptManager.clear();

    expect(transcriptManager.activeTab).toBe('transcript');
    expect(transcriptManager.summaryData).toBeNull();
    expect(transcriptManager.isGeneratingSummary).toBe(false);
  });
});
```

- [ ] **Step 2: Run el spec para verificar que falla**

Run: `pnpm --filter immich-web exec vitest run src/lib/stores/transcript.svelte.spec.ts`
Expected: FAIL — nuevos casos de `summary state` fallan (`TypeError: transcriptManager.loadAssetSummary is not a function` y asserts sobre getters inexistentes). Los 4 tests pre-existentes siguen pasando.

- [ ] **Step 3: Implementar el store**

Reemplazar TODO el contenido de `web/src/lib/stores/transcript.svelte.ts` (43 líneas) por:

```ts
import type { TranscriptionResponseDto } from '@immich/sdk';
import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
import type { SummaryData } from '$lib/types/transcript';
import { CancellableTask } from '$lib/utils/cancellable-task';
import { createMockSummary } from '$lib/utils/transcript-summary';

export const isNotFound = (error: unknown) => {
  return error instanceof Error && 'status' in error && error.status === 404;
};

export class TranscriptManager {
  #data = $state<TranscriptionResponseDto | null>(null);
  #status = $state<'loading' | 'empty' | 'error' | 'success'>('loading');
  #cleared = false;
  #loader = new CancellableTask(undefined, undefined, (error) => {
    this.#status = isNotFound(error) ? 'empty' : 'error';
  });

  #activeTab = $state<'transcript' | 'summary'>('transcript');
  #summaryData = $state<SummaryData | null>(null);
  #isGeneratingSummary = $state(false);
  #summaryCleared = false;
  #summaryLoader = new CancellableTask(undefined, undefined, () => {
    this.#isGeneratingSummary = false;
  });

  get transcript() {
    return this.#data;
  }

  get status() {
    return this.#status;
  }

  get activeTab() {
    return this.#activeTab;
  }

  get summaryData() {
    return this.#summaryData;
  }

  get isGeneratingSummary() {
    return this.#isGeneratingSummary;
  }

  async getAssetTranscript(id: string) {
    if (this.#cleared) {
      await this.#loader.reset();
      this.#cleared = false;
    }
    await this.#loader.execute(async () => {
      this.#data = await assetCacheManager.getAssetTranscript(id);
      this.#status = 'success';
    }, false);
  }

  setActiveTab(tab: 'transcript' | 'summary') {
    this.#activeTab = tab;
  }

  async loadAssetSummary(assetId: string) {
    this.#isGeneratingSummary = true;
    if (this.#summaryCleared) {
      await this.#summaryLoader.reset();
      this.#summaryCleared = false;
    }
    await this.#summaryLoader.execute(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        this.#summaryData = createMockSummary(assetId);
      },
      false,
    );
    this.#isGeneratingSummary = false;
  }

  clear() {
    this.#cleared = true;
    this.#data = null;
    this.#status = 'loading';
    this.#summaryCleared = true;
    this.#summaryData = null;
    this.#isGeneratingSummary = false;
    this.#activeTab = 'transcript';
  }
}

export const transcriptManager = new TranscriptManager();
```

Notas de implementación:
- `#summaryLoader` NO repite el `isNotFound` de `#loader` (el resumen mock no lanza errores; si en el futuro falla, el `errorCallback` vuelve `isGeneratingSummary` a `false` sin romper el flujo).
- `#isGeneratingSummary = true` se setea como PRIMER statement de `loadAssetSummary`, ANTES del `await` del reset y del `execute`; así el test 3 lo observa `true` de forma síncrona tras invocar el método incluso cuando `#summaryCleared === true` (CORRECCIÓN TDD: en el borrador original iba tras el reset, y la llamada suspendía en `await reset()` dejando `false` observable).
- Los dos *cleared flags* son independientes a propósito (decisión #6): así un `loadAssetSummary` en la ventana "cleared" no deja al `#loader` de transcripción sin resetear con `executed === true`.

- [ ] **Step 4: Run el spec del store para verificar que pasa**

Run: `pnpm --filter immich-web exec vitest run src/lib/stores/transcript.svelte.spec.ts`
Expected: PASS — 4 tests pre-existentes + 7 tests nuevos = 11 tests.

- [ ] **Step 5: Run el spec del mock (sanity del tipo compartido)**

Run: `pnpm --filter immich-web exec vitest run src/lib/utils/transcript-summary.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/stores/transcript.svelte.ts web/src/lib/stores/transcript.svelte.spec.ts
git commit -m "feat(web): add summary state and generation to transcript store"
```

---

### Task 4: Quality Gates finales y sync de `docs/handoff.md`

**Files:**
- Modify: `docs/handoff.md` (sección de estado de avance / Smart Class Notes Task 1)

**Interfaces:**
- Consumes: todo lo producido por Tasks 1-3.

- [ ] **Step 1: Typecheck completo**

Run: `pnpm --filter immich-web run check:typescript`
Expected: exit 0, sin errores.

- [ ] **Step 2: Lint**

Run: `pnpm --filter immich-web run lint`
Expected: exit 0, sin errores en archivos nuevos/modificados (los 62 warnings baseline pre-existentes del proyecto están permitidos).

- [ ] **Step 3: Svelte check**

Run: `pnpm --filter immich-web run check:svelte`
Expected: exit 0, sin warnings nuevos (los warnings pre-existentes del baseline están permitidos).

- [ ] **Step 4: Suite vitest de los specs afectados**

Run: `pnpm --filter immich-web exec vitest run src/lib/utils/transcript-summary.spec.ts src/lib/stores/transcript.svelte.spec.ts`
Expected: PASS — 5 + 11 = 16 tests.

- [ ] **Step 5: Verificación de cero `any`**

Run: `rg -n "\bany\b" web/src/lib/types/transcript.ts web/src/lib/utils/transcript-summary.ts web/src/lib/utils/transcript-summary.spec.ts web/src/lib/stores/transcript.svelte.ts`
Expected: sin resultados (vacío).

- [ ] **Step 6: Sincronizar `docs/handoff.md`**

Leer `docs/handoff.md` y añadir/actualizar el estado de **Smart Class Notes — Task 1 (Store y Tipos)** siguiendo el formato de las entradas previas: archivos creados/modificados, comportamiento esperado (pestañas mock-resumen), gates verificados y nota de que UI/endpoint/export quedan para tasks posteriores.

- [ ] **Step 7: Commit de documentación**

```bash
git add docs/handoff.md
git commit -m "docs: update handoff with smart class notes task 1 status"
```

Criterio de aceptación final (spec §Criterios): todos los gates (Steps 1-5) en zero + commit atómico por tarea verificado por el usuario antes de cualquier `push`/`merge`.

---

## Self-Review (verificado al escribir este plan)

**Cobertura de spec:**
- Tipos `KeyConcept`/`SummaryData` en `web/src/lib/types/transcript.ts` → Task 1. ✔
- `createMockSummary(assetId)` puro/determinista en `web/src/lib/utils/transcript-summary.ts` → Task 2. ✔
- Store: 3 runes + getters + `setActiveTab` + `loadAssetSummary` + `clear()` ampliado → Task 3 (el archivo final completo se incluye en el paso 3). ✔
- `execute(..., false)` en ambas llamadas (`transcript.svelte.ts:30-33` original y la nueva) → Task 3. ✔
- Spec de store (casos 1-4 de la spec) → Task 3 Step 1 (7 casos: cubre inicial, `setActiveTab`, generación en vuelo, `clear`, más 2 regresiones del flag por-loader). ✔
- Gates de aceptación → Task 4. ✔

**Placeholder scan:** ningún "TBD/TODO/implement later"; todo paso con código completo o comando exacto + salida esperada. ✔

**Consistencia de tipos/firmas:** `KeyConcept`, `SummaryData`, `createMockSummary(assetId: string): SummaryData`, `setActiveTab(tab: 'transcript' | 'summary')`, `loadAssetSummary(assetId: string)`, `clear()` — idénticos entre Tasks 1-3 y en los tests. El spec de diseño se corrigió ANTES de escribir el plan (decisión #6 → `#summaryCleared` dedicado; §4 → "modificar", el spec del store ya existía). ✔

**Nota de divergencia con el documento de diseño:** la spec decía `transcript.svelte.spec.ts (nuevo)` pero el archivo ya existe (creado en la Etapa 4, 72 líneas). El plan lo trata como "modificar" (Task 3 Step 1) y la spec se actualizó en consecuencia.