# Smart Class Notes — Fase 1.1 (Flashcards Active Recall + Anki Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Este plan NO commitea por tarea**: el usuario exige un único commit atómico al final (Task 7), tras verificación completa y confirmación explícita.

**Goal:** Añadir un visor de tarjetas de repaso activo (flashcards) derivado del `SummaryData` existente de Smart Class Notes, con autoevaluación por sesión (known/again), resumen de sesión y exportación client-side a Anki en formato CSV (`flashcards-<assetId>.csv`), integrado como tercera pestaña en `TranscriptPanel`.

**Architecture:** tipos de dominio `Flashcard`/`FlashcardDeck` en `web/src/lib/types/transcript.ts`; transformador puro e inmutable `buildFlashcardDeck(summaryData, assetName?)` + exportador CSV puro `exportFlashcardDeckToCsv(deck, grades?)` + helper fino `downloadFlashcardDeckCsv(csv, assetId)` en `web/src/lib/utils/transcript-flashcards.ts`; estado de sesión en el store `transcriptManager` (Opción A aprobada: `flashcardDeck`, `flashcardSourceSummary`, `flashcardIndex`, `flashcardGrades`, que sobrevive a cambios de pestaña y se resetea con `clear()`); `FlashcardPanel.svelte` presentacional lee del store y gradúa/exporta; `TranscriptPanel.svelte` amplía `activeTab` a `'transcript' | 'summary' | 'flashcards'` con un tercer `GroupTab`, efecto de auto-carga del resumen ampliado y efecto `ensureFlashcardsDeck`.

**Tech Stack:** Svelte 5 (runes, `$props`/`$derived`/`$state`), TypeScript strict, Vitest + Testing Library (`@testing-library/svelte`), `vi.mock`, svelte-i18n (fallback `dev` en tests), Immich `$lib/utils.downloadBlob` (utils.ts:319), JSON de idiomas en `i18n/` (raíz del repo).

## Global Constraints

- **Lenguaje de código:** clases/métodos/variables/identificadores en inglés; docstrings/comentarios y textos de UI traducibles en español vía i18n.
- **Cero `any`:** TypeScript strict; mocks estrictamente con el patrón `as never` existente cuando el mock del store lo requiera. No `any` ni escapes de tipo.
- **TDD:** cada cambio funcional empieza por su test que falla (red → impl → pass). Los tipos de dominio (declaraciones) se crean antes de su spec: no fallan en runtime; se verifican por compilación.
- **Util pura e inmutable:** `buildFlashcardDeck` y `exportFlashcardDeckToCsv` no mutan `summaryData`/`deck`/`grades` (deep-equal verificado en test), no tocan DOM, no usan i18n, no lanzan excepciones.
- **Contrato CSV:** header fijo `Front,Back,Tags`, 1 línea por tarjeta, todos los campos entre comillas dobles con escapado `"` → `""` (RFC 4180), terminador `\n` en cada línea y tras la última (archivo termina en `\n`). Tags separados por espacio en orden fijo: `smart-class-notes` + `concept`|`question` + `known`|`again` solo si `grades[card.id]` existe. Cero tarjetas → solo `Front,Back,Tags\n`.
- **Determinismo:** ids `concept-{n}` (orden de `keyConcepts`, 0-based) y `question-{m}` (orden de `reviewQuestions`); mazo = conceptos primero, después preguntas; `term`/`definition`/`question` sin recortar; `difficulty` siempre `undefined` (reservado para SM-2 futuro).
- **`$t` NO está tipado contra un diccionario** (svelte-i18n carga traducciones en runtime): las claves i18n no fallan typecheck. Verificación de claves por revisión explícita en Task 3 (presentes en `en.json` Y `es.json`, y `smart_class_notes_viewer_tabs` actualizada en ambos).
- **Puntos de inserción i18n (anclas, no líneas):** 16 claves `flashcards_*` entre `"fix_incorrect_match"` (en.json:1167 / es.json:1155) y `"focal_length"` (en.json:1168 / es.json:1156), en estricto orden alfabético; `smart_class_flashcards_title` entre `"smart_album"` (en.json:2096 / es.json:2073) y `"smart_class_notes_viewer_tabs"` (en.json:2097 / es.json:2074), también alfabético.
- **Vitest corre desde `web/`:** rutas relativas a `src/...`; `setup.ts` usa `fallbackLocale: 'dev'` → `$t('clave')` devuelve la clave literal; los specs asertan testids/estado, nunca texto traducido (las claves literal se usan solo como aserción de aria-label/testids).
- **ESLint unicorn:** `prefer-single-call`, `no-for-each` (usar `for...of`/`map`), `no-immediate-mutation`, `prefer-string-repeat`. Evitar encadenamientos que las rompan.
- **Nunca commitear `docs/superpowers/**` ni planes.** `git add` explícito por archivo. Sin push/merge sin confirmación. **Commit único atómico** al final tras OK del usuario (no hay commits por tarea).
- **No tocar archivos no relacionados** (~archivos modificados pendientes en el workspace). `git add` + commit estrictamente de los archivos de esta tarea.
- **Rutas de JSON de idiomas:** `i18n/en.json` y `i18n/es.json` en la **raíz del repo**.

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `web/src/lib/types/transcript.ts` | Modificar | Añadir `FlashcardSource`, `FlashcardDifficulty`, `FlashcardGrade`, `Flashcard`, `FlashcardDeck` (junto a `KeyConcept`/`SummaryData`) |
| `web/src/lib/utils/transcript-flashcards.ts` | Crear | `buildFlashcardDeck` + `exportFlashcardDeckToCsv` + `downloadFlashcardDeckCsv` |
| `web/src/lib/utils/transcript-flashcards.spec.ts` | Crear | 17 casos (9 mazo + 7 CSV + 1 download helper) |
| `web/src/lib/stores/transcript.svelte.ts` | Modificar | Estado de sesión flashcards + `setActiveTab` ampliado + `clear()` extendido |
| `web/src/lib/stores/transcript.svelte.spec.ts` | Modificar | Nuevo bloque `describe('flashcard state', ...)` (9 tests) |
| `web/src/lib/components/asset-viewer/FlashcardPanel.svelte` | Crear | Visor de tarjetas: volteo, navegación, grading, resumen de sesión, export |
| `web/src/lib/components/asset-viewer/FlashcardPanel.spec.ts` | Crear | 11 tests (factory.manager + mock de store y de util CMS) |
| `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` | Modificar | 3er tab, efectos ampliados, branch `activeTab === 'flashcards'`, aria-label 3 vías |
| `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` | Modificar | `ManagerState`+mock ampliados; 4 tests nuevos + ajustes 2 existentes |
| `i18n/en.json` | Modificar | 16 claves `flashcards_*` + `smart_class_flashcards_title` + actualizar `smart_class_notes_viewer_tabs` |
| `i18n/es.json` | Modificar | Idem en español |

Sin cambios: `SummaryPanel.svelte`, `SummaryPanel.spec.ts`, `transcript-export.ts`, `transcript-summary.ts`, `GroupTab.svelte`, `AudioViewer.svelte`, `utils.ts` (se reutiliza `downloadBlob`), `i18n.spec.ts`.

## Task 1: Tipos de dominio + util pura `buildFlashcardDeck` + spec

**Files:**
- Modify: `web/src/lib/types/transcript.ts`
- Create: `web/src/lib/utils/transcript-flashcards.ts`
- Test: `web/src/lib/utils/transcript-flashcards.spec.ts` (solo bloque `buildFlashcardDeck`)

**Interfaces:**
- Consumes: `SummaryData` (`executiveSummary: string`, `keyConcepts: {term, definition}[]`, `reviewQuestions: string[]`).
- Produces: `buildFlashcardDeck(summaryData: SummaryData, assetName?: string): FlashcardDeck`.

- [ ] **Step 1: Añadir los tipos de dominio**

Edit `web/src/lib/types/transcript.ts` — añadir tras la definición de `SummaryData`:

```ts
export type FlashcardSource = 'concept' | 'question';
export type FlashcardDifficulty = 'easy' | 'medium' | 'hard';
export type FlashcardGrade = 'known' | 'again';

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  source: FlashcardSource;
  difficulty?: FlashcardDifficulty; // reservado: siempre undefined en Fase 1.1 (SM-2 futuro)
};

export type FlashcardDeck = {
  id: string;
  title: string;
  cards: Flashcard[];
};
```

- [ ] **Step 2: Write the failing test**

Create `web/src/lib/utils/transcript-flashcards.spec.ts` (los imports de funciones que aún no existen hacen fallar la compilación del spec):

```ts
import { describe, expect, it } from 'vitest';
import type { SummaryData } from '$lib/types/transcript';
import { buildFlashcardDeck } from '$lib/utils/transcript-flashcards';

const fullSummary: SummaryData = {
  executiveSummary: 'Resumen.',
  keyConcepts: [
    { term: 'Concepto central', definition: 'Definición derivada de la transcripción del asset.' },
    { term: 'Idea secundaria', definition: 'Definición contextual asociada al asset.' },
  ],
  reviewQuestions: ['¿Cuál es la idea principal de este material?'],
};

describe('buildFlashcardDeck', () => {
  it('builds concept cards with terms and definitions', () => {
    const deck = buildFlashcardDeck(fullSummary);
    const concept = deck.cards[0];
    expect(concept.id).toBe('concept-0');
    expect(concept.front).toBe('Concepto central');
    expect(concept.back).toBe('Definición derivada de la transcripción del asset.');
    expect(concept.source).toBe('concept');
    expect(concept.difficulty).toBeUndefined();
  });

  it('builds question cards with an empty back', () => {
    const deck = buildFlashcardDeck(fullSummary);
    const question = deck.cards[2];
    expect(question.id).toBe('question-0');
    expect(question.front).toBe('¿Cuál es la idea principal de este material?');
    expect(question.back).toBe('');
    expect(question.source).toBe('question');
    expect(question.difficulty).toBeUndefined();
  });

  it('orders all concepts before all questions', () => {
    const deck = buildFlashcardDeck(fullSummary);
    expect(deck.cards.map((card) => card.source)).toEqual(['concept', 'concept', 'question']);
  });

  it('uses sequential deterministic ids per source', () => {
    const deck = buildFlashcardDeck(fullSummary);
    expect(deck.cards.map((card) => card.id)).toEqual(['concept-0', 'concept-1', 'question-0']);
  });

  it('sets the title from the trimmed asset name', () => {
    expect(buildFlashcardDeck(fullSummary, '  Clase 01  ').title).toBe('Clase 01');
    expect(buildFlashcardDeck(fullSummary, '').title).toBe('');
    expect(buildFlashcardDeck(fullSummary, undefined).title).toBe('');
  });

  it('derives a deterministic slugged deck id from the asset name', () => {
    expect(buildFlashcardDeck(fullSummary, 'Clase 01').id).toBe('flashcards-clase-01');
    expect(buildFlashcardDeck(fullSummary, ' Mi Clase! 01 ').id).toBe('flashcards-mi-clase-01');
    expect(buildFlashcardDeck(fullSummary, undefined).id).toBe('flashcards-deck');
  });

  it('produces zero cards of a source when its array is empty', () => {
    const deck = buildFlashcardDeck({ executiveSummary: '', keyConcepts: [], reviewQuestions: ['Q'] });
    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0].source).toBe('question');
  });

  it('produces an empty deck for an empty summary', () => {
    const deck = buildFlashcardDeck({ executiveSummary: '', keyConcepts: [], reviewQuestions: [] });
    expect(deck.cards).toEqual([]);
  });

  it('does not mutate the input summary', () => {
    const input: SummaryData = structuredClone(fullSummary);
    buildFlashcardDeck(input, 'Clase 01');
    expect(input).toEqual(fullSummary);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-flashcards.spec.ts
```
Expected: FAIL — `Cannot find module '$lib/utils/transcript-flashcards'` (el archivo no existe).

- [ ] **Step 4: Write minimal implementation**

Create `web/src/lib/utils/transcript-flashcards.ts`:

```ts
import type { Flashcard, FlashcardDeck, SummaryData } from '$lib/types/transcript';

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';

export function buildFlashcardDeck(summaryData: SummaryData, assetName?: string): FlashcardDeck {
  const baseName = assetName?.trim() ?? '';
  const concepts: Flashcard[] = summaryData.keyConcepts.map(({ term, definition }, index) => ({
    id: `concept-${index}`,
    front: term,
    back: definition,
    source: 'concept',
  }));
  const questions: Flashcard[] = summaryData.reviewQuestions.map((question, index) => ({
    id: `question-${index}`,
    front: question,
    back: '',
    source: 'question',
  }));
  return {
    id: `flashcards-${slug(baseName)}`,
    title: baseName,
    cards: [...concepts, ...questions],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-flashcards.spec.ts
```
Expected: PASS, 9 tests.

## Task 2: Exportador CSV puro + helper de descarga + spec

**Files:**
- Modify: `web/src/lib/utils/transcript-flashcards.ts`
- Test: `web/src/lib/utils/transcript-flashcards.spec.ts` (bloques `exportFlashcardDeckToCsv` + `downloadFlashcardDeckCsv`)

**Interfaces:**
- Consumes: `FlashcardDeck`, `FlashcardGrade`, `grades?: Partial<Record<string, FlashcardGrade>>`, `downloadBlob(data: Blob, filename: string)` de `'$lib/utils'` (utils.ts:319).
- Produces: `exportFlashcardDeckToCsv(deck, grades?): string` y `downloadFlashcardDeckCsv(csv: string, assetId: string): void`.

- [ ] **Step 1: Append the failing tests**

Append a la spec. **Mover el `vi.mock` del upload top** como indica el plan de Task 3 de export (vitest hoistea `vi.mock`, pero por legibilidad colocarlo en el tope junto al import de util). Orden final del archivo:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SummaryData } from '$lib/types/transcript';
import type { FlashcardDeck } from '$lib/types/transcript';
import { buildFlashcardDeck, exportFlashcardDeckToCsv, downloadFlashcardDeckCsv } from '$lib/utils/transcript-flashcards';

vi.mock(import('$lib/utils'), () => ({
  downloadBlob: vi.fn(),
}));

import { downloadBlob } from '$lib/utils';
```

Append (fuera del `describe('buildFlashcardDeck', ...)`):

```ts
const expectedCsv = [
  'Front,Back,Tags',
  '"Concepto central","Definición derivada de la transcripción del asset.","smart-class-notes concept known"',
  '"Idea secundaria","Definición contextual asociada al asset.","smart-class-notes concept again"',
  '"¿Cuál es la idea principal de este material?","","smart-class-notes question"',
].join('\n') + '\n';

describe('exportFlashcardDeckToCsv', () => {
  it('writes the exact fixed header', () => {
    const csv = exportFlashcardDeckToCsv(buildFlashcardDeck(fullSummary));
    expect(csv.split('\n')[0]).toBe('Front,Back,Tags');
  });

  it('writes one line per card with every field double-quoted', () => {
    const csv = exportFlashcardDeckToCsv(buildFlashcardDeck(fullSummary));
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^".*","(.*)","(.*)"$/);
  });

  it('escapes inner double quotes and tolerates commas and newlines', () => {
    const deck: FlashcardDeck = {
      id: 'flashcards-test',
      title: 'Test',
      cards: [
        { id: 'concept-0', front: 'He said "hi"', back: 'line1\nline2', source: 'concept' },
      ],
    };
    const csv = exportFlashcardDeckToCsv(deck);
    expect(csv).toContain('"He said ""hi""","line1\nline2","smart-class-notes concept"');
  });

  it('computes tags: base source, plus result only when graded', () => {
    const deck = buildFlashcardDeck(fullSummary);
    expect(exportFlashcardDeckToCsv(deck)).toContain('"smart-class-notes question"');
    expect(exportFlashcardDeckToCsv(deck, { 'concept-0': 'known' })).toContain('"smart-class-notes concept known"');
    expect(exportFlashcardDeckToCsv(deck, { 'concept-1': 'again' })).toContain('"smart-class-notes concept again"');
  });

  it('matches the agreed example exactly', () => {
    const csv = exportFlashcardDeckToCsv(buildFlashcardDeck(fullSummary), {
      'concept-0': 'known',
      'concept-1': 'again',
    });
    expect(csv).toBe(expectedCsv);
  });

  it('returns only the header for an empty deck', () => {
    const csv = exportFlashcardDeckToCsv({ id: 'flashcards-test', title: '', cards: [] });
    expect(csv).toBe('Front,Back,Tags\n');
  });

  it('ends with a newline and does not mutate deck or grades', () => {
    const deck = buildFlashcardDeck(fullSummary);
    const grades = { 'concept-0': 'known' as const };
    const input: FlashcardDeck = structuredClone(deck);
    const csv = exportFlashcardDeckToCsv(deck, grades);
    expect(csv.endsWith('\n')).toBe(true);
    expect(deck).toEqual(input);
    expect(grades).toEqual({ 'concept-0': 'known' });
  });
});

describe('downloadFlashcardDeckCsv', () => {
  it('downloads the csv blob with the expected type and filename', async () => {
    const csv = 'Front,Back,Tags\n';
    downloadFlashcardDeckCsv(csv, 'asset-1');

    expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(await blob.text()).toBe(csv);
    expect(filename).toBe('flashcards-asset-1.csv');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-flashcards.spec.ts
```
Expected: FAIL — `exportFlashcardDeckToCsv is not a function` / `downloadFlashcardDeckCsv is not a function`.

- [ ] **Step 3: Implement**

Append to `web/src/lib/utils/transcript-flashcards.ts`:

```ts
import { downloadBlob } from '$lib/utils';
import type { FlashcardDeck, FlashcardGrade } from '$lib/types/transcript';

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function exportFlashcardDeckToCsv(
  deck: FlashcardDeck,
  grades?: Partial<Record<string, FlashcardGrade>>,
): string {
  const lines = ['Front,Back,Tags'];
  for (const card of deck.cards) {
    const tokens = ['smart-class-notes', card.source];
    const grade = grades?.[card.id];
    if (grade) {
      tokens.push(grade);
    }
    lines.push(`${escapeCsv(card.front)},${escapeCsv(card.back)},${escapeCsv(tokens.join(' '))}`);
  }
  return `${lines.join('\n')}\n`;
}

export function downloadFlashcardDeckCsv(csv: string, assetId: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `flashcards-${assetId}.csv`);
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-flashcards.spec.ts
```
Expected: PASS, 17 tests.

## Task 3: Claves i18n

**Files:**
- Modify: `i18n/en.json` (insertar 16 claves `flashcards_*` entre `fix_incorrect_match` y `focal_length`; `smart_class_flashcards_title` entre `smart_album` y `smart_class_notes_viewer_tabs`; actualizar `smart_class_notes_viewer_tabs`)
- Modify: `i18n/es.json` (idem)

**Interfaces:**
- Produce: claves consumidas por `FlashcardPanel`/`TranscriptPanel` via `$t(...)`.

- [ ] **Step 1: Edit `i18n/en.json`**

Tras la línea `"fix_incorrect_match": "Fix incorrect match",` y antes de `"focal_length"` — que quede en estricto orden alfabético (`geti`... no existe; `fix_` → `fla`... no existe → `flashcards_*` entre `fix_` y `fol_` no aplica; el ancla real es `fix_incorrect_match` → `flashcards_*` → `focal_length`):

```json
  "flashcards_again": "Still learning",
  "flashcards_counter": "{current} of {total}",
  "flashcards_empty": "No flashcards are available for this summary.",
  "flashcards_export": "Export to Anki (CSV)",
  "flashcards_flip": "Show answer",
  "flashcards_known": "I knew it",
  "flashcards_loading": "Preparing flashcards...",
  "flashcards_next": "Next card",
  "flashcards_prev": "Previous card",
  "flashcards_restart": "Review again",
  "flashcards_self_check": "Recite your answer aloud, then rate yourself.",
  "flashcards_source_concept": "Concept",
  "flashcards_source_question": "Question",
  "flashcards_summary_again": "{count, plural, one {# to review} other {# to review}}",
  "flashcards_summary_known": "{count, plural, one {# known} other {# known}}",
  "flashcards_summary_ungraded": "{count, plural, one {# not rated} other {# not rated}}",
```

Y entre la línea `"smart_album": ...` y `"smart_class_notes_viewer_tabs"`:

```json
  "smart_class_flashcards_title": "Flashcards",
```

Actualizar `"smart_class_notes_viewer_tabs"` → `"Transcript, summary and flashcards viewer tabs"`.

- [ ] **Step 2: Edit `i18n/es.json`**

Mismas anclas (`fix_incorrect_match` / `focal_length`, `smart_album` / `smart_class_notes_viewer_tabs`):

```json
  "flashcards_again": "La estudio",
  "flashcards_counter": "{current} de {total}",
  "flashcards_empty": "No hay tarjetas disponibles para este resumen.",
  "flashcards_export": "Exportar a Anki (CSV)",
  "flashcards_flip": "Mostrar respuesta",
  "flashcards_known": "La sé",
  "flashcards_loading": "Preparando tarjetas...",
  "flashcards_next": "Siguiente tarjeta",
  "flashcards_prev": "Tarjeta anterior",
  "flashcards_restart": "Repasar de nuevo",
  "flashcards_self_check": "Responde en voz alta y puntúate.",
  "flashcards_source_concept": "Concepto",
  "flashcards_source_question": "Pregunta",
  "flashcards_summary_again": "{count, plural, one {# a repasar} other {# a repasar}}",
  "flashcards_summary_known": "{count, plural, one {# conocida} other {# conocidas}}",
  "flashcards_summary_ungraded": "{count, plural, one {# sin evaluar} other {# sin evaluar}}",
```

Y:

```json
  "smart_class_flashcards_title": "Flashcards",
```

Actualizar `"smart_class_notes_viewer_tabs"` → `"Pestañas del visor de transcripción, resumen y tarjetas"`.

- [ ] **Step 3: Verify both locales still load**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/i18n.spec.ts
```
Expected: PASS. **Gate de revisión manual:** comprobar que las 17 claves están en `en.json` Y `es.json`, que `en.json` mantiene orden alfabético (16 `flashcards_*` ordenadas, `smart_class_flashcards_title` antes que `smart_class_notes_viewer_tabs`) y que los JSON siguen siendo válidos (pares idénticos en ambos archivos).

## Task 4: Estado de sesión en `transcriptManager`

**Files:**
- Modify: `web/src/lib/stores/transcript.svelte.ts`
- Test: `web/src/lib/stores/transcript.svelte.spec.ts` (nuevo bloque `describe('flashcard state', ...)`)

**Interfaces:**
- Consumes: `buildFlashcardDeck`, tipos `FlashcardDeck`/`FlashcardGrade`/`SummaryData`.
- Produces: getters `flashcardDeck`, `flashcardIndex`, `flashcardGrades`; métodos `ensureFlashcardsDeck(summaryData, assetName?)`, `gradeFlashcard(cardId, grade)`, `setFlashcardIndex(index)`, `resetFlashcards()`; `activeTab` ampliado a `'transcript' | 'summary' | 'flashcards'`; `clear()` resetea el estado flashcards.

- [ ] **Step 1: Write the failing test**

Append a `web/src/lib/stores/transcript.svelte.spec.ts` (fuera de `describe('summary state', ...)`):

```ts
describe('flashcard state', () => {
  const summary: SummaryData = {
    executiveSummary: 'E',
    keyConcepts: [{ term: 'T1', definition: 'D1' }],
    reviewQuestions: ['Q1'],
  };

  beforeEach(() => {
    transcriptManager.clear();
    assetCacheManager.clearTranscriptCache();
    vi.clearAllMocks();
  });

  it('initializes with no deck, index 0, empty grades and the transcript tab', () => {
    expect(transcriptManager.flashcardDeck).toBeNull();
    expect(transcriptManager.flashcardIndex).toBe(0);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.activeTab).toBe('transcript');
  });

  it('accepts flashcards as a tab', () => {
    transcriptManager.setActiveTab('flashcards');
    expect(transcriptManager.activeTab).toBe('flashcards');
  });

  it('builds the deck once and reuses it for the same summary reference', () => {
    const first = transcriptManager.ensureFlashcardsDeck(summary);
    const second = transcriptManager.ensureFlashcardsDeck(summary);
    expect(first).toBe(second);
    expect(second.cards.map((card) => card.id)).toEqual(['concept-0', 'question-0']);
  });

  it('rebuilds the deck and resets the session when the summary reference changes', () => {
    transcriptManager.ensureFlashcardsDeck(summary);
    transcriptManager.gradeFlashcard('concept-0', 'known');
    transcriptManager.setFlashcardIndex(1);

    const other: SummaryData = { executiveSummary: 'X', keyConcepts: [], reviewQuestions: [] };
    const rebuilt = transcriptManager.ensureFlashcardsDeck(other);

    expect(rebuilt.cards).toEqual([]);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.flashcardIndex).toBe(0);
  });

  it('accumulates grades immutably', () => {
    transcriptManager.ensureFlashcardsDeck(summary);
    const before = transcriptManager.flashcardGrades;
    transcriptManager.gradeFlashcard('concept-0', 'known');
    expect(transcriptManager.flashcardGrades).not.toBe(before);
    expect(transcriptManager.flashcardGrades).toEqual({ 'concept-0': 'known' });
  });

  it('updates the index with setFlashcardIndex', () => {
    transcriptManager.setFlashcardIndex(2);
    expect(transcriptManager.flashcardIndex).toBe(2);
  });

  it('resets index and grades without rebuilding the deck', () => {
    const deck = transcriptManager.ensureFlashcardsDeck(summary);
    transcriptManager.gradeFlashcard('concept-0', 'again');
    transcriptManager.setFlashcardIndex(1);

    transcriptManager.resetFlashcards();

    expect(transcriptManager.flashcardIndex).toBe(0);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.flashcardDeck).toBe(deck);
  });

  it('clears all flashcard state and restores the transcript tab', async () => {
    await transcriptManager.loadAssetSummary('asset-1');
    transcriptManager.ensureFlashcardsDeck(transcriptManager.summaryData!);
    transcriptManager.setActiveTab('flashcards');
    transcriptManager.gradeFlashcard('concept-0', 'known');

    transcriptManager.clear();

    expect(transcriptManager.flashcardDeck).toBeNull();
    expect(transcriptManager.flashcardIndex).toBe(0);
    expect(transcriptManager.flashcardGrades).toEqual({});
    expect(transcriptManager.activeTab).toBe('transcript');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/stores/transcript.svelte.spec.ts
```
Expected: FAIL / TSError — `Property 'flashcardDeck' does not exist` / `Mutation of private property` (casos no compilables hasta implementar).

- [ ] **Step 3: Implement**

Edit `web/src/lib/stores/transcript.svelte.ts`:

Imports (líneas 4-5):

```ts
import type { FlashcardDeck, FlashcardGrade, SummaryData } from '$lib/types/transcript';
import { createMockSummary } from '$lib/utils/transcript-summary';
import { buildFlashcardDeck } from '$lib/utils/transcript-flashcards';
```

Nuevo estado privado (tras `#summaryLoader`, línea 25):

```ts
  #flashcardDeck: FlashcardDeck | null = null;
  #flashcardSourceSummary: SummaryData | null = null;
  #flashcardIndex = 0;
  #flashcardGrades: Partial<Record<string, FlashcardGrade>> = {};
```

`#activeTab` (línea 19):

```ts
  #activeTab = $state<'transcript' | 'summary' | 'flashcards'>('transcript');
```

Getters (tras `get isGeneratingSummary`, línea 45):

```ts
  get flashcardDeck(): FlashcardDeck | null {
    return this.#flashcardDeck;
  }

  get flashcardIndex() {
    return this.#flashcardIndex;
  }

  get flashcardGrades() {
    return this.#flashcardGrades;
  }
```

`setActiveTab` (línea 58):

```ts
  setActiveTab(tab: 'transcript' | 'summary' | 'flashcards') {
    this.#activeTab = tab;
  }
```

Nuevos métodos públicos (tras `setActiveTab`):

```ts
  ensureFlashcardsDeck(summaryData: SummaryData, assetName?: string): FlashcardDeck {
    if (this.#flashcardSourceSummary === summaryData && this.#flashcardDeck) {
      return this.#flashcardDeck;
    }
    this.#flashcardDeck = buildFlashcardDeck(summaryData, assetName);
    this.#flashcardSourceSummary = summaryData;
    this.#flashcardGrades = {};
    this.#flashcardIndex = 0;
    return this.#flashcardDeck;
  }

  gradeFlashcard(cardId: string, grade: FlashcardGrade) {
    this.#flashcardGrades = { ...this.#flashcardGrades, [cardId]: grade };
  }

  setFlashcardIndex(index: number) {
    this.#flashcardIndex = index;
  }

  resetFlashcards() {
    this.#flashcardIndex = 0;
    this.#flashcardGrades = {};
  }
```

`clear()` (tras `this.#activeTab = 'transcript';`, línea 85):

```ts
    this.#flashcardDeck = null;
    this.#flashcardSourceSummary = null;
    this.#flashcardIndex = 0;
    this.#flashcardGrades = {};
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/stores/transcript.svelte.spec.ts
```
Expected: PASS — 3 tests del bloque original `TranscriptManager` + 8 `summary state` (regresión) + 9 nuevos `flashcard state`.

## Task 5: `FlashcardPanel.svelte`

**Files:**
- Create: `web/src/lib/components/asset-viewer/FlashcardPanel.svelte`
- Test: `web/src/lib/components/asset-viewer/FlashcardPanel.spec.ts`

**Interfaces:**
- Props: `{ assetId: string; onRetry: () => void }`.
- Consumes: `transcriptManager` (getters `flashcardDeck`/`flashcardIndex`/`flashcardGrades`/`isGeneratingSummary`/`summaryData`; métodos `gradeFlashcard`/`setFlashcardIndex`/`resetFlashcards`), `exportFlashcardDeckToCsv` + `downloadFlashcardDeckCsv`, `$t` de svelte-i18n.
- Produces: estados `loading`/`building`/`empty`/`empty-no-retry`/`data` + resumen de sesión; testids `flashcard-loading`, `flashcard-empty`, `flashcard-retry`, `flashcard-export`, `flashcard-counter`, `flashcard-card`, `flashcard-front`, `flashcard-back`, `flashcard-toggle`, `flashcard-prev`, `flashcard-next`, `flashcard-known`, `flashcard-again`, `flashcard-summary`, `flashcard-summary-known`, `flashcard-summary-again`, `flashcard-summary-ungraded`, `flashcard-restart`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/components/asset-viewer/FlashcardPanel.spec.ts`:

```ts
import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import FlashcardPanel from './FlashcardPanel.svelte';
import type { FlashcardDeck, FlashcardGrade, SummaryData } from '$lib/types/transcript';

type ManagerState = {
  flashcardDeck: FlashcardDeck | null;
  flashcardIndex: number;
  flashcardGrades: Partial<Record<string, FlashcardGrade>>;
  isGeneratingSummary: boolean;
  summaryData: SummaryData | null;
};

const deck: FlashcardDeck = {
  id: 'flashcards-test',
  title: 'Clase 01',
  cards: [
    { id: 'concept-0', front: 'Concepto A', back: 'Definición A', source: 'concept' },
    { id: 'concept-1', front: 'Concepto B', back: 'Definición B', source: 'concept' },
    { id: 'question-0', front: '¿Pregunta?', back: '', source: 'question' },
  ],
};

const defaultManager: ManagerState = {
  flashcardDeck: null,
  flashcardIndex: 0,
  flashcardGrades: {},
  isGeneratingSummary: false,
  summaryData: null,
};

const factory: { manager: ManagerState } = { manager: { ...defaultManager } };

vi.mock(import('$lib/stores/transcript.svelte'), () => ({
  transcriptManager: {
    get flashcardDeck() {
      return factory.manager.flashcardDeck;
    },
    get flashcardIndex() {
      return factory.manager.flashcardIndex;
    },
    get flashcardGrades() {
      return factory.manager.flashcardGrades;
    },
    get isGeneratingSummary() {
      return factory.manager.isGeneratingSummary;
    },
    get summaryData() {
      return factory.manager.summaryData;
    },
    gradeFlashcard: vi.fn(),
    setFlashcardIndex: vi.fn((index: number) => {
      factory.manager.flashcardIndex = index;
    }),
    resetFlashcards: vi.fn(() => {
      factory.manager.flashcardIndex = 0;
      factory.manager.flashcardGrades = {};
    }),
    ensureFlashcardsDeck: vi.fn(),
  } as never,
}));

vi.mock(import('$lib/utils/transcript-flashcards'), () => ({
  exportFlashcardDeckToCsv: vi.fn(() => 'CSV'),
  downloadFlashcardDeckCsv: vi.fn(),
}));

import { transcriptManager } from '$lib/stores/transcript.svelte';
import { downloadFlashcardDeckCsv, exportFlashcardDeckToCsv } from '$lib/utils/transcript-flashcards';

const renderPanel = () =>
  render(FlashcardPanel, {
    assetId: 'asset-1',
    onRetry: vi.fn(),
  });

describe('FlashcardPanel', () => {
  beforeEach(() => {
    factory.manager = { ...defaultManager };
  });

  afterEach(() => {
    factory.manager = { ...defaultManager };
    vi.clearAllMocks();
  });

  it('shows loading testid while the summary is generating', () => {
    factory.manager = { ...defaultManager, isGeneratingSummary: true };
    const { getByTestId } = renderPanel();
    expect(getByTestId('flashcard-loading')).toBeInTheDocument();
  });

  it('shows empty testid and calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(FlashcardPanel, { assetId: 'asset-1', onRetry });
    expect(getByTestId('flashcard-empty')).toBeInTheDocument();
    await fireEvent.click(getByTestId('flashcard-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows empty testid without retry when the deck has zero cards', () => {
    factory.manager = { ...defaultManager, flashcardDeck: { ...deck, cards: [] }, summaryData: {} as SummaryData };
    const { getByTestId, queryByTestId } = renderPanel();
    expect(getByTestId('flashcard-empty')).toBeInTheDocument();
    expect(queryByTestId('flashcard-retry')).toBeNull();
  });

  it('renders the front of the card and the progress counter', () => {
    factory.manager = { ...defaultManager, flashcardDeck: deck };
    const { getByTestId } = renderPanel();
    expect(getByTestId('flashcard-card')).toBeInTheDocument();
    expect(getByTestId('flashcard-front')).toHaveTextContent('Concepto A');
    expect(getByTestId('flashcard-counter')).toBeInTheDocument();
  });

  it('flips to reveal the back, and shows the self-check hint on question cards', async () => {
    factory.manager = { ...defaultManager, flashcardDeck: deck };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-toggle'));
    expect(getByTestId('flashcard-back')).toHaveTextContent('Definición A');

    factory.manager = { ...defaultManager, flashcardDeck: deck, flashcardIndex: 2 };
    const second = renderPanel();
    await fireEvent.click(second.getByTestId('flashcard-toggle'));
    expect(second.getByTestId('flashcard-back')).toHaveTextContent('flashcards_self_check');
  });

  it('disables prev on the first card and advances with next', async () => {
    factory.manager = { ...defaultManager, flashcardDeck: deck };
    const { getByTestId } = renderPanel();
    expect(getByTestId('flashcard-prev')).toHaveProperty('disabled', true);
    await fireEvent.click(getByTestId('flashcard-next'));
    expect(vi.mocked(transcriptManager.setFlashcardIndex)).toHaveBeenCalledWith(1);
    expect(factory.manager.flashcardIndex).toBe(1);
  });

  it('grades a known card and advances', async () => {
    factory.manager = { ...defaultManager, flashcardDeck: deck };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-toggle'));
    await fireEvent.click(getByTestId('flashcard-known'));
    expect(vi.mocked(transcriptManager.gradeFlashcard)).toHaveBeenCalledWith('concept-0', 'known');
    expect(vi.mocked(transcriptManager.setFlashcardIndex)).toHaveBeenCalledWith(1);
  });

  it('grades an again card and advances', async () => {
    factory.manager = { ...defaultManager, flashcardDeck: deck };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-toggle'));
    await fireEvent.click(getByTestId('flashcard-again'));
    expect(vi.mocked(transcriptManager.gradeFlashcard)).toHaveBeenCalledWith('concept-0', 'again');
    expect(vi.mocked(transcriptManager.setFlashcardIndex)).toHaveBeenCalledWith(1);
  });

  it('reaches the session summary after grading the last card, showing known/again/ungraded', async () => {
    factory.manager = {
      ...defaultManager,
      flashcardDeck: deck,
      flashcardIndex: deck.cards.length - 1,
      flashcardGrades: { 'concept-0': 'known', 'concept-1': 'again' },
    };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-toggle'));
    await fireEvent.click(getByTestId('flashcard-known'));
    expect(getByTestId('flashcard-summary')).toBeInTheDocument();
    expect(getByTestId('flashcard-summary-known')).toBeInTheDocument();
    expect(getByTestId('flashcard-summary-again')).toBeInTheDocument();
    expect(getByTestId('flashcard-summary-ungraded')).toBeInTheDocument();
  });

  it('restarts the session from the summary view', async () => {
    factory.manager = {
      ...defaultManager,
      flashcardDeck: deck,
      flashcardIndex: deck.cards.length,
      flashcardGrades: {},
    };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-restart'));
    expect(vi.mocked(transcriptManager.resetFlashcards)).toHaveBeenCalled();
  });

  it('exports the csv built from the deck and the session grades', async () => {
    factory.manager = {
      ...defaultManager,
      flashcardDeck: deck,
      flashcardGrades: { 'concept-0': 'known' },
    };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-export'));
    expect(vi.mocked(exportFlashcardDeckToCsv)).toHaveBeenCalledWith(deck, { 'concept-0': 'known' });
    expect(vi.mocked(downloadFlashcardDeckCsv)).toHaveBeenCalledWith('CSV', 'asset-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/FlashcardPanel.spec.ts
```
Expected: FAIL — `Failed to resolve import './FlashcardPanel.svelte'` (el componente no existe).

- [ ] **Step 3: Implement**

Create `web/src/lib/components/asset-viewer/FlashcardPanel.svelte`:

```svelte
<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiLoading } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import type { FlashcardGrade } from '$lib/types/transcript';
  import { downloadFlashcardDeckCsv, exportFlashcardDeckToCsv } from '$lib/utils/transcript-flashcards';

  let {
    assetId,
    onRetry,
  }: {
    assetId: string;
    onRetry: () => void;
  } = $props();

  let deck = $derived(transcriptManager.flashcardDeck);
  let index = $derived(transcriptManager.flashcardIndex);
  let grades = $derived(transcriptManager.flashcardGrades);
  let isGeneratingSummary = $derived(transcriptManager.isGeneratingSummary);
  let summaryData = $derived(transcriptManager.summaryData);
  let flipped = $state(false);

  const view = $derived(
    deck === null && isGeneratingSummary
      ? 'loading'
      : deck === null && summaryData !== null && !isGeneratingSummary
        ? 'building'
        : deck === null
          ? 'empty'
          : deck.cards.length === 0
            ? 'empty-no-retry'
            : 'data',
  );

  const card = $derived(deck?.cards[index] ?? null);
  const showSummary = $derived(deck !== null && deck.cards.length > 0 && index >= deck.cards.length);
  const knownCount = $derived(deck?.cards.filter((c) => grades[c.id] === 'known').length ?? 0);
  const againCount = $derived(deck?.cards.filter((c) => grades[c.id] === 'again').length ?? 0);
  const ungradedCount = $derived(deck?.cards.filter((c) => grades[c.id] === undefined).length ?? 0);

  const toggle = () => {
    flipped = !flipped;
  };

  const goTo = (next: number) => {
    transcriptManager.setFlashcardIndex(next);
    flipped = false;
  };

  const grade = (grade: FlashcardGrade) => {
    if (deck === null || card === null) {
      return;
    }
    transcriptManager.gradeFlashcard(card.id, grade);
    goTo(index + 1);
  };

  const exportCsv = () => {
    if (deck === null) {
      return;
    }
    downloadFlashcardDeckCsv(exportFlashcardDeckToCsv(deck, grades), assetId);
  };
</script>

{#if view === 'loading' || view === 'building'}
  <div data-testid="flashcard-loading" class="flex items-center gap-2 text-sm text-immich-gray">
    <Icon icon={mdiLoading} class="animate-spin" size="16" />
    {$t('flashcards_loading')}
  </div>
{:else if view === 'empty'}
  <div data-testid="flashcard-empty" class="flex flex-col items-start gap-2 text-sm text-immich-gray">
    {$t('flashcards_empty')}
    <button
      type="button"
      data-testid="flashcard-retry"
      onclick={onRetry}
      class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
    >
      {$t('retry')}
    </button>
  </div>
{:else if view === 'empty-no-retry'}
  <div data-testid="flashcard-empty" class="text-sm text-immich-gray">
    {$t('flashcards_empty')}
  </div>
{:else if showSummary}
  <div data-testid="flashcard-summary" class="flex flex-col gap-2 text-sm">
    {#if knownCount > 0}
      <p data-testid="flashcard-summary-known">{$t('flashcards_summary_known', { count: knownCount })}</p>
    {/if}
    {#if againCount > 0}
      <p data-testid="flashcard-summary-again">{$t('flashcards_summary_again', { count: againCount })}</p>
    {/if}
    {#if ungradedCount > 0}
      <p data-testid="flashcard-summary-ungraded">{$t('flashcards_summary_ungraded', { count: ungradedCount })}</p>
    {/if}
    <div class="flex gap-2">
      <button
        type="button"
        data-testid="flashcard-restart"
        onclick={() => transcriptManager.resetFlashcards()}
        class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
      >
        {$t('flashcards_restart')}
      </button>
      <button
        type="button"
        data-testid="flashcard-export"
        onclick={exportCsv}
        class="rounded-lg bg-immich-gray px-3 py-1.5 text-sm text-immich-fg hover:bg-immich-gray/80"
      >
        {$t('flashcards_export')}
      </button>
    </div>
  </div>
{:else}
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between">
      <h3 class="text-sm font-semibold text-immich-primary">{deck!.title || $t('smart_class_flashcards_title')}</h3>
      <button
        type="button"
        data-testid="flashcard-export"
        onclick={exportCsv}
        class="rounded-lg bg-immich-gray px-3 py-1.5 text-sm text-immich-fg hover:bg-immich-gray/80"
      >
        {$t('flashcards_export')}
      </button>
    </div>

    <p data-testid="flashcard-counter" class="text-xs text-immich-gray">
      {$t('flashcards_counter', { current: index + 1, total: deck!.cards.length })}
    </p>

    <div data-testid="flashcard-card" class="rounded-2xl border border-immich-gray/30 bg-immich-bg p-4">
      <div data-testid="flashcard-front" class="text-sm">
        <span class="font-medium">{card!.front}</span>
        <span class="ml-2 text-xs text-immich-gray">
          {card!.source === 'concept' ? $t('flashcards_source_concept') : $t('flashcards_source_question')}
        </span>
      </div>
      {#if flipped}
        <div data-testid="flashcard-back" class="mt-2 text-sm text-immich-gray">
          {#if card!.back}
            {card!.back}
          {:else}
            {$t('flashcards_self_check')}
          {/if}
        </div>
      {/if}
    </div>

    <div class="flex items-center justify-between">
      <button
        type="button"
        data-testid="flashcard-toggle"
        onclick={toggle}
        class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
      >
        {$t('flashcards_flip')}
      </button>
      <div class="flex gap-2">
        <button
          type="button"
          data-testid="flashcard-prev"
          onclick={() => goTo(index - 1)}
          disabled={index === 0}
          class="rounded-lg bg-immich-gray px-3 py-1.5 text-sm text-immich-fg hover:bg-immich-gray/80 disabled:opacity-40"
        >
          {$t('flashcards_prev')}
        </button>
        <button
          type="button"
          data-testid="flashcard-next"
          onclick={() => goTo(index + 1)}
          disabled={index === deck!.cards.length - 1}
          class="rounded-lg bg-immich-gray px-3 py-1.5 text-sm text-immich-fg hover:bg-immich-gray/80 disabled:opacity-40"
        >
          {$t('flashcards_next')}
        </button>
      </div>
    </div>

    {#if flipped}
      <div class="flex gap-2">
        <button
          type="button"
          data-testid="flashcard-known"
          onclick={() => grade('known')}
          class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
        >
          {$t('flashcards_known')}
        </button>
        <button
          type="button"
          data-testid="flashcard-again"
          onclick={() => grade('again')}
          class="rounded-lg bg-immich-gray px-3 py-1.5 text-sm text-immich-fg hover:bg-immich-gray/80"
        >
          {$t('flashcards_again')}
        </button>
      </div>
    {/if}
  </div>
{/if}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/FlashcardPanel.spec.ts
```
Expected: PASS, 11 tests.

## Task 6: Integración en `TranscriptPanel.svelte`

**Files:**
- Modify: `web/src/lib/components/asset-viewer/TranscriptPanel.svelte`
- Test: `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`

**Interfaces:**
- Consumes: `transcriptManager` (mock ampliado), `FlashcardPanel`, `$t('smart_class_flashcards_title')`.
- Produces: 3 filas en `GroupTab`; `setActiveTab` con `'transcript' | 'summary' | 'flashcards'`; efecto de auto-carga del resumen ampliado a flashcards; nuevo efecto `ensureFlashcardsDeck`; rama `{:else if activeTab === 'flashcards'}`; aria-label con 3 vías.

- [ ] **Step 1: Modify the existing spec (fails red)**

Edit `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`:

- Ancora `type ManagerState` (líneas 9-15):

```ts
type ManagerState = {
  status: 'loading' | 'empty' | 'error' | 'success';
  transcript: TranscriptionResponseDto | null;
  activeTab: 'transcript' | 'summary' | 'flashcards';
  summaryData: SummaryData | null;
  isGeneratingSummary: boolean;
  flashcardDeck: FlashcardDeck | null;
  flashcardIndex: number;
  flashcardGrades: Partial<Record<string, FlashcardGrade>>;
};
```

- Import types (añadir a `import type { SummaryData }` línea 7):

```ts
import type { FlashcardDeck, FlashcardGrade, SummaryData } from '$lib/types/transcript';
```

- `defaultManager` (líneas 17-23):

```ts
const defaultManager: ManagerState = {
  status: 'loading',
  transcript: null,
  activeTab: 'transcript',
  summaryData: null,
  isGeneratingSummary: false,
  flashcardDeck: null,
  flashcardIndex: 0,
  flashcardGrades: {},
};
```

- `vi.mock` del store (líneas 27-51): ampliar getters y métodos:

```ts
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
    get flashcardDeck() {
      return factory.manager.flashcardDeck;
    },
    get flashcardIndex() {
      return factory.manager.flashcardIndex;
    },
    get flashcardGrades() {
      return factory.manager.flashcardGrades;
    },
    getAssetTranscript: vi.fn(),
    setActiveTab: vi.fn((tab: 'transcript' | 'summary' | 'flashcards') => {
      factory.manager.activeTab = tab;
    }),
    loadAssetSummary: vi.fn(),
    ensureFlashcardsDeck: vi.fn(),
    gradeFlashcard: vi.fn(),
    setFlashcardIndex: vi.fn(),
    resetFlashcards: vi.fn(),
    clear: vi.fn(),
  } as never,
}));
```

- Ajustar tramo `const mockSummary` (tras línea 68) con un deck de ejemplo:

```ts
const flashcardDeckFixture: FlashcardDeck = {
  id: 'flashcards-clase-01',
  title: 'Clase 01',
  cards: [{ id: 'concept-0', front: 'C', back: 'D', source: 'concept' }],
};
```

- Ajustar el test existente `'shows the tabs with the transcript tab selected'` (líneas 140-152): `radios).toHaveLength(2)` → `3`, y `radios[1].checked` pasa a `false` (añadir `radios[2]`):

```ts
    const radios = getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(radios[2].checked).toBe(false);
```

- Añadir los 4 casos nuevos dentro de `describe('TranscriptPanel', ...)` (al final, antes del cierre):

```ts
  it('calls setActiveTab with flashcards when the flashcards tab is clicked', async () => {
    factory.manager = { ...defaultManager, status: 'success', transcript };
    const { getAllByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    await fireEvent.change(getAllByRole('radio')[2]);
    expect(vi.mocked(transcriptManager.setActiveTab)).toHaveBeenCalledWith('flashcards');
  });

  it('renders the flashcards panel and builds the deck when the flashcards tab is active', () => {
    factory.manager = {
      ...defaultManager,
      status: 'success',
      transcript,
      activeTab: 'flashcards',
      summaryData: mockSummary,
      flashcardDeck: flashcardDeckFixture,
    };
    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      assetName: 'Clase 01',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(getByTestId('flashcard-card')).toBeInTheDocument();
    expect(vi.mocked(transcriptManager.ensureFlashcardsDeck)).toHaveBeenCalledWith(mockSummary, 'Clase 01');
  });

  it('auto-generates the summary when the flashcards tab is active and no summary exists', async () => {
    factory.manager = {
      ...defaultManager,
      status: 'success',
      transcript,
      activeTab: 'flashcards',
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
    expect(getByTestId('flashcard-empty')).toBeInTheDocument();
  });

  it('uses the flashcards title as the region aria-label when the flashcards tab is active', () => {
    factory.manager = {
      ...defaultManager,
      status: 'success',
      transcript,
      activeTab: 'flashcards',
      summaryData: mockSummary,
      flashcardDeck: flashcardDeckFixture,
    };
    const { getByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(getByRole('region')).toHaveAttribute('aria-label', 'smart_class_flashcards_title');
  });
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts
```
Expected: FAIL — los 4 casos nuevos fallan (`setActiveTab('flashcards')` no lanza el render correcto, `flashcard-card` no existe, etc.) y el test de radios aún espera 2.

- [ ] **Step 3: Implement**

Edit `web/src/lib/components/asset-viewer/TranscriptPanel.svelte`:

- Imports (líneas 2-4):

```svelte
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import GroupTab from '$lib/elements/GroupTab.svelte';
  import SummaryPanel from './SummaryPanel.svelte';
  import FlashcardPanel from './FlashcardPanel.svelte';
  import { t } from 'svelte-i18n';
```

- Efecto de auto-carga del resumen (líneas 33-37):

```ts
  $effect(() => {
    if (
      (activeTab === 'summary' || activeTab === 'flashcards') &&
      status === 'success' &&
      transcript &&
      summaryData === null &&
      !isGeneratingSummary
    ) {
      void transcriptManager.loadAssetSummary(assetId);
    }
  });

  $effect(() => {
    if (activeTab === 'flashcards' && summaryData) {
      transcriptManager.ensureFlashcardsDeck(summaryData, assetName);
    }
  });
```

- aria-label del contenedor (línea 68):

```svelte
  aria-label={
    activeTab === 'flashcards'
      ? $t('smart_class_flashcards_title')
      : activeTab === 'summary'
        ? $t('smart_class_summary_title')
        : $t('transcript_title')
  }
```

- `GroupTab` (líneas 82-89):

```svelte
        <GroupTab
          filters={['transcript', 'summary', 'flashcards']}
          labels={[$t('transcript_title'), $t('smart_class_summary_title'), $t('smart_class_flashcards_title')]}
          selected={activeTab}
          label={$t('smart_class_notes_viewer_tabs')}
          loading={isGeneratingSummary}
          onSelect={(tab) => transcriptManager.setActiveTab(tab as 'transcript' | 'summary' | 'flashcards')}
        />
```

- Rama de render (tras la rama `{:else if activeTab === 'summary'}` y antes de `{:else if transcript}`, líneas 99-107):

```svelte
    {:else if activeTab === 'flashcards'}
      <FlashcardPanel assetId={assetId} onRetry={() => void transcriptManager.loadAssetSummary(assetId)} />
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts
```
Expected: PASS — regresión (8 casos existentes ajustados) + 4 nuevos = 12 casos.

## Task 7: Gates completos, QA y commit atómico

**Files:** (ninguno — verificación y commit)

- [ ] **Step 1: Ejecutar la suite completa de la tarea + regresión**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-flashcards.spec.ts src/lib/stores/transcript.svelte.spec.ts src/lib/components/asset-viewer/FlashcardPanel.spec.ts src/lib/components/asset-viewer/TranscriptPanel.spec.ts src/lib/i18n.spec.ts
```
Expected: PASS todos (nuevos + regresión de Task 1/2/3 del store, Panel e i18n).

- [ ] **Step 2: TypeScript, lint y formateo**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm run check:typescript
pnpm run lint -- --max-warnings 0
pnpm exec prettier --check src/lib/types/transcript.ts src/lib/utils/transcript-flashcards.ts src/lib/utils/transcript-flashcards.spec.ts src/lib/stores/transcript.svelte.ts src/lib/stores/transcript.svelte.spec.ts src/lib/components/asset-viewer/FlashcardPanel.svelte src/lib/components/asset-viewer/FlashcardPanel.spec.ts src/lib/components/asset-viewer/TranscriptPanel.svelte src/lib/components/asset-viewer/TranscriptPanel.spec.ts
```
Expected: exit 0 en los tres. Si prettier falla: `pnpm exec prettier --write <archivos de la tarea>`. Si svelte-check falla por el defecto preexistente de flags en Windows, ejecutar con el flag citado tal cual documentado en el repo.

- [ ] **Step 3: Gate de revisión i18n**

Verificar (rápido) con `grep` en repo raíz que las 17 claves nuevas existen en `en.json` y `es.json`, que `smart_class_notes_viewer_tabs` está actualizada en ambos, y que `en.json` conserva el orden alfabético de las `flashcards_*`. (Las tool calls usan el tool `grep`, no `rg` — `rg` no está en PATH.)

- [ ] **Step 4: Confirmar el diff y commitear solo los archivos de la tarea**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main
git status
git diff --stat -- web/src/lib/types/transcript.ts web/src/lib/utils/transcript-flashcards.ts web/src/lib/utils/transcript-flashcards.spec.ts web/src/lib/stores/transcript.svelte.ts web/src/lib/stores/transcript.svelte.spec.ts web/src/lib/components/asset-viewer/FlashcardPanel.svelte web/src/lib/components/asset-viewer/FlashcardPanel.spec.ts web/src/lib/components/asset-viewer/TranscriptPanel.svelte web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts i18n/en.json i18n/es.json
```

Verificar que **no** aparecen los archivos no relacionados ni `docs/superpowers/**`. Solo tras OK explícito del usuario, commit atómico:

```powershell
git add web/src/lib/types/transcript.ts web/src/lib/utils/transcript-flashcards.ts web/src/lib/utils/transcript-flashcards.spec.ts web/src/lib/stores/transcript.svelte.ts web/src/lib/stores/transcript.svelte.spec.ts web/src/lib/components/asset-viewer/FlashcardPanel.svelte web/src/lib/components/asset-viewer/FlashcardPanel.spec.ts web/src/lib/components/asset-viewer/TranscriptPanel.svelte web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts i18n/en.json i18n/es.json
git commit -m "feat(web): smart class notes flashcards active recall with anki csv export"
```

**NO push, NO merge.** Esperar confirmación explícita del usuario.

- [ ] **Step 5: QA manual opcional en navegador**

Abrir un asset de audio con transcripción → pestaña FlashCards: volteo, `La sé`/`La estudio`, contador, resumen de sesión final, cambio de pestaña conserva progreso, `Export to Anki (CSV)` descarga e importa en Anki Desktop (File → Import) con columnas `Front,Back,Tags`.

## Self-Review

**Spec coverage:**
- Tipos `Flashcard`/`FlashcardDeck`/`FlashcardGrade` (spec §1) → Task 1. ✔
- `buildFlashcardDeck` puro (orden, ids, slug, title fallback, `difficulty` undefined, no mutación) → Task 1 (9 tests). ✔
- `exportFlashcardDeckToCsv` (RFC 4180, tags fijos, reglas de grade, terminador, igualdad literal, no mutación) → Task 2 (7 tests). ✔
- `downloadFlashcardDeckCsv` (Blob `text/csv;charset=utf-8`, filename `flashcards-<assetId>.csv`, `downloadBlob`) → Task 2 (1 test). ✔
- Estado de sesión en `transcriptManager` (Opción A: conserva por referencia, rebuild por identidad, grades inmutables, `resetFlashcards`, `clear()`) → Task 4 (9 tests). ✔
- Tercera pestaña `GroupTab` + efecto auto-carga ampliado + efecto `ensureFlashcardsDeck` + rama `flashcard` + aria-label 3 vías → Task 6 (4 casos + ajustes). ✔
- `FlashcardPanel`: estados loading/building/empty/empty-no-retry/data, volteo, pista `self_check` en preguntas, nav, grading, resumen de sesión con 3 líneas condicionales, restart, export → Task 5 (11 tests). ✔
- i18n: 16 `flashcards_*` + `smart_class_flashcards_title` + `smart_class_notes_viewer_tabs` actualizada, en ambos idiomas, con gate de revisión → Task 3. ✔

**Placeholder scan:** sin TBD/TODO; todo paso tiene código o comando exacto. ✔

**Type consistency:** `FlashcardGrade = 'known' | 'again'` usado en types/store/panel/CSV; `ensureFlashcardsDeck(summaryData, assetName?)` idéntico en store (Task 4) y en TranscriptPanel (Task 6); `downloadFlashcardDeckCsv(csv, assetId)` idéntico en util (Task 2) y panel (Task 5); testids finales = spec §5 (`flashcard-*`). ✔

**Nota de formato CSV:** las claves ICU `flashcards_summary_*` NO se formatean con fallback `dev`; los specs solo asertan testids/estado, nunca texto (coherente con Global Constraints). El aria-label literal `smart_class_flashcards_title` se aserta por clave con fallback `dev`. ✔