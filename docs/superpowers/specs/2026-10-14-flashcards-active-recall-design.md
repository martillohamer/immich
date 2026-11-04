# Design: Web — Smart Class Notes, Flashcards Active Recall + Anki Export (Fase 1.1)

**Fecha:** 2026-10-14
**Ámbito:** `web/` (SvelteKit + Svelte 5 runes + TypeScript strict) + `i18n/` (raíz del repo). Fork local de Immich v3.2.0.
**Estado:** diseño propuesto — pendiente de aprobación del usuario.

## Objetivo

Construir un **generador y visor de tarjetas de repaso activo (flashcards)** derivado del `SummaryData` que ya produce el store de Smart Class Notes (Task 1-3), con **autoevaluación por sesión** y **exportación client-side a Anki en formato CSV**.

El alcance introduce:

1. Tipos de dominio `Flashcard` y `FlashcardDeck` + `FlashcardGrade` (sesión) en `web/src/lib/types/transcript.ts`.
2. Transformador puro e inmutable `buildFlashcardDeck(summaryData, assetName?)` que convierte `Key Concepts` (anverso = término, reverso = definición) y `Review Questions` (anverso = pregunta, reverso vacío, autochequeo) en un mazo.
3. Estado de sesión **en el store `transcriptManager`** (Opción A aprobada): `flashcardDeck`, `flashcardIndex`, `flashcardGrades`; sobrevive a los cambios de pestaña (transcript ↔ summary ↔ flashcards) y se reinicia al cambiar de asset (`clear()`).
4. **Tercera pestaña "Flashcards"** en `TranscriptPanel.svelte` (patrón `GroupTab` existente), que amplía el tipo de `activeTab` a `'transcript' | 'summary' | 'flashcards'`.
5. Visor interactivo `FlashcardPanel.svelte`: volteo anverso/reverso, navegación anterior/siguiente, autoevaluación **"La sé" (known) / "La estudio" (again)**, contador de progreso y **resumen de sesión** al final (x conocidas, y a repasar, reinicio).
6. Exportador Anki CSV client-side: `exportFlashcardDeckToCsv(deck, grades?)` + `downloadFlashcardDeckCsv(csv, assetId)`, reutilizando `downloadBlob` de `$lib/utils`. Contrato de columnas acordado: `Front,Back,Tags`, con tags de resultado según la autoevaluación.
7. Claves i18n nuevas en `i18n/en.json` y `i18n/es.json` (raíz del repo) + actualización de la aria-label existente `smart_class_notes_viewer_tabs`.

No incluye: persistencia server-side, algoritmo SM-2 (dificultad programada), generación `.apkg` (requiere zip+sqlite), edición de tarjetas, sincronización multi-sesión, ni cambios en backend/mobile/sdk.

## Decisiones acordadas (aprobadas por el usuario en brainstorming)

1. **Formato de exportación: solo CSV Anki.** Cero dependencias; las tarjetas se importan en Anki Desktop (`File → Import`). No se genera `.apkg` ni JSON en Fase 1.1.
2. **Ubicación: tercera pestaña** en `TranscriptPanel` mediante el `GroupTab` existente; el estado vive en el store `transcriptManager` (**Opción A**) y **sobrevive a los cambios de pestaña**, de modo que el usuario puede consultar el transcript y volver al mazo sin perder progreso.
3. **Autoevaluación: cartas graded + resumen de sesión.** Tras voltear, el usuario marca "La sé" (known) o "La estudio" (again); al terminar el mazo aparece el resumen (x conocidas, y a repasar) con opción de repasar de nuevo y exportar. La dificultad se refleja vía Tags en el CSV.
4. **Contrato CSV: `Front,Back,Tags`** (header fijo + 1 línea por tarjeta), RFC 4180, terminador `\n`. Tags separados por espacio: `smart-class-notes` + fuente (`concept`/`question`) + resultado de autoevaluación (`known`/`again`) cuando la tarjeta ya fue evaluada en la sesión.
5. **Tipo `Flashcard.difficulty?: 'easy' | 'medium' | 'hard'` queda definido pero no se popula en Fase 1.1** (siempre `undefined`): la autoevaluación binaria de esta fase no produce una escala de 3 niveles; `difficulty` queda reservado para el futuro algoritmo SM-2. El resultado de la sesión se expresa con tags `known`/`again`.
6. **Tarjetas pregunta con reverso vacío.** `SummaryData.reviewQuestions` son strings sin respuestas almacenadas. El anverso es la pregunta y el reverso queda vacío; el visor muestra una pista i18n de autochequeo ("responde en voz alta y evalúate") y el CSV exporta el campo Back vacío, etiquetado con `question`. Las preguntas son para repaso activo (para uno mismo), no tarjetas con respuesta explícita.
7. **Reconstrucción del mazo por identidad del summary:** el store recuerda la referencia del `SummaryData` con el que construyó el mazo. Al alternar pestañas la referencia es la misma → la sesión se conserva. Al regenerar el resumen (`loadAssetSummary` crea un objeto nuevo) → el mazo se reconstruye y la sesión se reinicia.
8. **Descarga reutilizando `downloadBlob`** (patrón Task 3): filename determinista `flashcards-[assetId].csv`, `type: 'text/csv;charset=utf-8'`.
9. **Determinismo:** ids de tarjetas `concept-{n}` / `question-{n}`, orden estable (conceptos primero, luego preguntas), tests por igualdad literal (no snapshots).

## Arquitectura e integración

```
TranscriptPanel.svelte                       (modificado)
├── GroupTab.svelte                          (sin cambios; filters ya es genérico)
├── (bloque transcripción — sin cambios)
├── SummaryPanel.svelte                      (sin cambios en Fase 1.1)
└── FlashcardPanel.svelte                    (nuevo)
    ├── lee transcriptManager.flashcardDeck / flashcardIndex / flashcardGrades
    ├── volteo de tarjeta (estado local flipped)
    ├── grading known/again → gradeFlashcard(cardId, grade)
    └── export → downloadFlashcardDeckCsv(exportFlashcardDeckToCsv(deck, grades), assetId)

web/src/lib/types/transcript.ts             (modificado: Flashcard, FlashcardDeck, FlashcardGrade, ...)
web/src/lib/utils/transcript-flashcards.ts  (nuevo: buildFlashcardDeck + exportFlashcardDeckToCsv + downloadFlashcardDeckCsv)
web/src/lib/stores/transcript.svelte.ts     (modificado: estado de sesión flashcards + setActiveTab ampliado)
i18n/en.json, i18n/es.json                  (modificado)
```

- Punto de integración: el mismo `TranscriptPanel` que ya consume `transcriptManager`, `assetId`, `assetName`, `summaryData` e `isGeneratingSummary`. Se amplía el efecto de auto-carga del resumen para que también dispare al activar la pestaña `flashcards`, y se añade un segundo efecto que invoca `ensureFlashcardsDeck(summaryData, assetName)`.
- `FlashcardPanel` es presentacional + lee del store (single source of truth), como exige la Opción A; solo recibe props externas de navegación: `assetId` (filename) y `onRetry` (repetir generación del resumen).
- `AudioViewer.svelte`, `GroupTab.svelte`, `SummaryPanel.svelte`: **sin cambios**.

## Contrato de tipos y funciones

### 1. `web/src/lib/types/transcript.ts` (modificado)

Se añaden al mismo archivo que `SummaryData` (el mazo se deriva directamente de él; una única ruta de import):

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

### 2. `web/src/lib/utils/transcript-flashcards.ts` (nuevo)

```ts
import type { FlashcardDeck, FlashcardGrade, SummaryData } from '$lib/types/transcript';
import { downloadBlob } from '$lib/utils';

export function buildFlashcardDeck(summaryData: SummaryData, assetName?: string): FlashcardDeck;
export function exportFlashcardDeckToCsv(
  deck: FlashcardDeck,
  grades?: Partial<Record<string, FlashcardGrade>>,
): string;
export function downloadFlashcardDeckCsv(csv: string, assetId: string): void;
```

#### `buildFlashcardDeck(summaryData, assetName?)`

- **Pura e inmutable:** no muta `summaryData`, no toca DOM, no usa i18n, no lanza excepciones.
- `deck.title` = `assetName?.trim()` o `''` (vacío si no se provee; el visor aplica el fallback i18n).
- `deck.id` = `'flashcards-' + slug(assetName)` con `slug = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck'`. Determinista y seguro para identificadores.
- **Tarjetas `concept`** (en orden de `keyConcepts`, índice `n` 0-based): `{ id: 'concept-' + n, front: term, back: definition, source: 'concept' }`. `term`/`definition` se emiten **sin recortar**.
- **Tarjetas `question`** (en orden de `reviewQuestions`, índice `m` 0-based): `{ id: 'question-' + m, front: question, back: '', source: 'question' }`.
- **Orden global del mazo:** primero todos los conceptos, después todas las preguntas.
- Arreglos vacíos → cero tarjetas de ese tipo; `SummaryData` vacío → `cards: []`.
- `difficulty` nunca se asigna (queda `undefined`).

#### `exportFlashcardDeckToCsv(deck, grades?)`

- **Pura:** no muta inputs, sin efectos. Devuelve el CSV completo como string.
- **Header fijo** línea 1: `Front,Back,Tags`.
- **1 línea por tarjeta**, cada campo envuelto en comillas dobles y con las comillas interiores duplicadas (RFC 4180):
  ```
  "<front>","<back>","<tags>"
  ```
- **Rule de `tags`:** tokens separados por espacio, en orden fijo:
  1. `smart-class-notes` (siempre)
  2. `concept` o `question` según `card.source`
  3. `known` o `again` **solo si** `grades[card.id]` existe en el mapa de la sesión (tarjetas sin evaluar: sin token de resultado)
- **Terminador:** `\n` al final de cada línea y una línea final tras la última tarjeta (el archivo termina en `\n`). Cero tarjetas → solo `Front,Back,Tags\n`.
- Ejemplo (2 conceptos evaluados, 1 pregunta sin evaluar):

```
Front,Back,Tags
"Concepto central","Definición derivada de la transcripción del asset.","smart-class-notes concept known"
"Idea secundaria","Definición contextual asociada al asset.","smart-class-notes concept again"
"¿Cuál es la idea principal de este material?","","smart-class-notes question"
```

#### `downloadFlashcardDeckCsv(csv, assetId)`

- `new Blob([csv], { type: 'text/csv;charset=utf-8' })` y delega en `downloadBlob(data, 'flashcards-' + assetId + '.csv')` (patrón idéntico a `downloadSummaryMarkdown`). No retorna nada.

### 3. `web/src/lib/stores/transcript.svelte.ts` (modificado)

**Nuevo estado privado (runes `$state`):**

```ts
#flashcardDeck: FlashcardDeck | null = null;
#flashcardSourceSummary: SummaryData | null = null; // referencia con la que se construyó el mazo
#flashcardIndex = 0;
#flashcardGrades: Partial<Record<string, FlashcardGrade>> = {};
```

**Getters públicos:**

```ts
get flashcardDeck(): FlashcardDeck | null;
get flashcardIndex(): number;
get flashcardGrades(): Partial<Record<string, FlashcardGrade>>;
```

**Métodos públicos:**

```ts
ensureFlashcardsDeck(summaryData: SummaryData, assetName?: string): FlashcardDeck {
  if (this.#flashcardSourceSummary === summaryData && this.#flashcardDeck) {
    return this.#flashcardDeck; // misma fuente → conserva sesión (cambio de pestaña)
  }
  this.#flashcardDeck = buildFlashcardDeck(summaryData, assetName);
  this.#flashcardSourceSummary = summaryData;
  this.#flashcardGrades = {};
  this.#flashcardIndex = 0;
  return this.#flashcardDeck;
}

gradeFlashcard(cardId: string, grade: FlashcardGrade): void {
  this.#flashcardGrades = { ...this.#flashcardGrades, [cardId]: grade };
}

setFlashcardIndex(index: number): void;
resetFlashcards(): void; // index = 0, grades = {} (mazo intacto) — usado por "Repasar de nuevo"
```

**Cambios adicionales:**

- `#activeTab` y `setActiveTab` amplían el tipo a `'transcript' | 'summary' | 'flashcards'`.
- `clear()` añade el reset completo del estado flashcards: `#flashcardDeck = null`, `#flashcardSourceSummary = null`, `#flashcardIndex = 0`, `#flashcardGrades = {}` (además de los resets existentes).

### 4. `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` (modificado)

**Efecto de auto-carga del resumen (ampliado):**

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
```

**Nuevo efecto de construcción del mazo:**

```ts
$effect(() => {
  if (activeTab === 'flashcards' && summaryData) {
    transcriptManager.ensureFlashcardsDeck(summaryData, assetName);
  }
});
```

**GroupTab — 3 filtros y label de vista:**

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

**Render de la pestaña (nueva rama antes del bloque de transcript):**

```svelte
{:else if activeTab === 'flashcards'}
  <FlashcardPanel assetId={assetId} onRetry={() => void transcriptManager.loadAssetSummary(assetId)} />
```

**aria-label del contenedor (ampliado):** `activeTab === 'flashcards' ? $t('smart_class_flashcards_title') : activeTab === 'summary' ? $t('smart_class_summary_title') : $t('transcript_title')`.

### 5. `web/src/lib/components/asset-viewer/FlashcardPanel.svelte` (nuevo)

**Props:**

```ts
type Props = {
  assetId: string;
  onRetry: () => void;
};
let { assetId, onRetry }: Props = $props();
```

**Lecturas del store (Opción A):**

```ts
let deck = $derived(transcriptManager.flashcardDeck);
let index = $derived(transcriptManager.flashcardIndex);
let grades = $derived(transcriptManager.flashcardGrades);
let isGeneratingSummary = $derived(transcriptManager.isGeneratingSummary);
let summaryData = $derived(transcriptManager.summaryData);
let flipped = $state(false); // estado local efímero del volteo de la tarjeta actual
```

**Estados de vista** (mismo patrón que `SummaryPanel`):

| Estado | Condición | Contenido |
|---|---|---|
| `loading` | `deck === null && isGeneratingSummary` | testid `flashcard-loading` + `$t('flashcards_loading')` |
| `building` | `deck === null && summaryData !== null && !isGeneratingSummary` (microtask entre render y efecto `ensureFlashcardsDeck`) | testid `flashcard-loading` (mismo spinner; transición invisible para el usuario) |
| `empty` | `deck === null && !isGeneratingSummary && summaryData === null` | testid `flashcard-empty` + `$t('flashcards_empty')` + botón retry (testid `flashcard-retry`) |
| `empty` | `deck !== null && deck.cards.length === 0` (resumen sin conceptos ni preguntas) | testid `flashcard-empty` + `$t('flashcards_empty')` (sin botón retry) |
| `data` | `deck !== null && deck.cards.length > 0` | visor de tarjetas o resumen de sesión |

**Visor de tarjetas (`deck` con `cards.length > 0`):**

- **Cabecera:** título `deck.title || $t('smart_class_flashcards_title')` + botón export `data-testid="flashcard-export"` (`$t('flashcards_export')`) que ejecuta `downloadFlashcardDeckCsv(exportFlashcardDeckToCsv(deck, grades), assetId)`.
- **Progreso:** `flashcard-counter` → `$t('flashcards_counter', { current: index + 1, total: deck.cards.length })`.
- **Tarjeta** (`data-testid="flashcard-card"`):
  - Anverso (`data-testid="flashcard-front"`): `front` de la tarjeta actual + insignia de fuente (`flashcard_source_concept` / `flashcard_source_question`).
  - Reverso (`data-testid="flashcard-back"`): si `back` no vacío → el texto; si vacío (tarjeta `question`) → pista `$t('flashcards_self_check')`.
  - Botón de volteo `data-testid="flashcard-toggle"` (label `$t('flashcards_flip')`); togglea `flipped`.
- **Navegación:** `flashcard-prev` (disabled en `index === 0`) y `flashcard-next` (disabled en `index === deck.cards.length - 1`); ambos con `setFlashcardIndex`; al navegar `flipped = false`.
- **Grading (visible cuando `flipped`):**
  - `flashcard-known` (`$t('flashcards_known')`) → `gradeFlashcard(card.id, 'known')`, avanza (`index + 1`), `flipped = false`. Si era la última tarjeta → vista de resumen de sesión.
  - `flashcard-again` (`$t('flashcards_again')`) → idem con `'again'`.
- Las tarjetas sin evaluar al llegar al final se muestran en el resumen como "a repasar".

**Resumen de sesión (cuando `index >= deck.cards.length`):**

- testid `flashcard-summary`.
- Líneas ICU (testids `flashcard-summary-known`, `flashcard-summary-again`, `flashcard-summary-ungraded`, renderizadas solo si su conteo > 0): `flashcards_summary_known` `{count}` y `flashcards_summary_again` `{count}`, calculadas contando `grades`; si quedan tarjetas sin evaluar en `deck.cards` (no presentes en `grades`), se añade `flashcards_summary_ungraded` `{count}`.
- Botón `flashcard-restart` (`$t('flashcards_restart')`) → `transcriptManager.resetFlashcards()` (index 0, grades limpios).
- Botón export `flashcard-export` también presente aquí (mismo handler).

### 6. `i18n/en.json` y `i18n/es.json` (modificar — raíz del repo)

Claves nuevas (nombres en orden alfabético; `smart_class_flashcards_title` junto a las demás `smart_class_*`):

| Clave | en.json | es.json |
|---|---|---|
| `smart_class_flashcards_title` | `Flashcards` | `Flashcards` |
| `flashcards_loading` | `Preparing flashcards...` | `Preparando tarjetas...` |
| `flashcards_empty` | `No flashcards are available for this summary.` | `No hay tarjetas disponibles para este resumen.` |
| `flashcards_export` | `Export to Anki (CSV)` | `Exportar a Anki (CSV)` |
| `flashcards_flip` | `Show answer` | `Mostrar respuesta` |
| `flashcards_known` | `I knew it` | `La sé` |
| `flashcards_again` | `Still learning` | `La estudio` |
| `flashcards_prev` | `Previous card` | `Tarjeta anterior` |
| `flashcards_next` | `Next card` | `Siguiente tarjeta` |
| `flashcards_counter` | `{current} of {total}` | `{current} de {total}` |
| `flashcards_self_check` | `Recite your answer aloud, then rate yourself.` | `Responde en voz alta y puntúate.` |
| `flashcards_restart` | `Review again` | `Repasar de nuevo` |
| `flashcards_source_concept` | `Concept` | `Concepto` |
| `flashcards_source_question` | `Question` | `Pregunta` |
| `flashcards_summary_known` | `{count, plural, one {# known} other {# known}}` | `{count, plural, one {# conocida} other {# conocidas}}` |
| `flashcards_summary_again` | `{count, plural, one {# to review} other {# to review}}` | `{count, plural, one {# a repasar} other {# a repasar}}` |
| `flashcards_summary_ungraded` | `{count, plural, one {# not rated} other {# not rated}}` | `{count, plural, one {# sin evaluar} other {# sin evaluar}}` |

**Clave existente actualizada:** `smart_class_notes_viewer_tabs`: en → `Transcript, summary and flashcards viewer tabs`; es → `Pestañas del visor de transcripción, resumen y tarjetas`.

## Manejo de estados y ciclo de vida

| Evento | Estado flashcards |
|---|---|
| Inicio (tras `clear()`) | `flashcardDeck = null`, index 0, grades `{}` |
| Activar pestaña `flashcards` sin resumen | `loadAssetSummary(assetId)` auto-dispara (efecto ampliado); `flashcard-loading` |
| Resumen disponible | `ensureFlashcardsDeck` construye el mazo una vez; visor listo |
| Cambiar de pestaña (transcript/summary) y volver | El mazo y el progreso se **conservan** (misma referencia de `summaryData`) |
| Regenerar resumen (`loadAssetSummary`) | Nueva referencia → mazo reconstruido + sesión reiniciada |
| Cambiar de asset | `clear()` (efecto `onMount` de TranscriptPanel) resetea todo |
| Evaluar tarjeta | `grades[cardId] = 'known' | 'again'`, avanza de índice |
| Llegar al final del mazo | Resumen de sesión (conocidas / a repasar / sin evaluar) + exportar + repasar de nuevo |
| Exportar | CSV `Front,Back,Tags` descargado con `flashcards-[assetId].csv` |

## Testing

### `web/src/lib/utils/transcript-flashcards.spec.ts` (nuevo)

**`buildFlashcardDeck`** (sin mocks; datos fijos tipo `SummaryData`):

1. Tarjetas de concepto: `id/concept-0`, `front === term`, `back === definition`, `source === 'concept'`, `difficulty` undefined.
2. Tarjetas de pregunta: `id/question-0`, `front === question`, `back === ''`, `source === 'question'`, `difficulty` undefined.
3. Orden del mazo: todos los conceptos antes que todas las preguntas.
4. Ids secuenciales por fuente (`concept-0`, `concept-1`, `question-0`, …).
5. `title` con `assetName` (trim aplicado); `''` y `undefined` → título vacío.
6. `deck.id` slug determinista del assetName; sin assetName → `flashcards-deck`.
7. `keyConcepts: []` → cero tarjetas concept; `reviewQuestions: []` → cero tarjetas question.
8. `SummaryData` vacío → `cards: []`.
9. **No mutación** del `summaryData` input (deep-equal antes/después).

**`exportFlashcardDeckToCsv`** (sin mocks):

10. Header exacto `Front,Back,Tags`.
11. 1 línea por tarjeta, campos siempre envueltos en comillas dobles.
12. Escapado de comillas interiores (`"` → `""`) y tolerancia de comas/saltos en el contenido.
13. Tags: tarjeta sin evaluar → solo `smart-class-notes <source>`; evaluada conocida → `... known`; evaluada a repasar → `... again`.
14. **Igualdad literal** con el ejemplo de la sección Contrato 2 (assert por string completo).
15. Mazo vacío → solo `Front,Back,Tags\n`.
16. Termina en `\n`; no muta `deck` ni `grades`.

**`downloadFlashcardDeckCsv`** (mock de `$lib/utils`):

17. `downloadBlob` recibido con `Blob` `type === 'text/csv;charset=utf-8'`, contenido igual al CSV de entrada, filename `flashcards-<assetId>.csv`.

### `web/src/lib/stores/transcript.svelte.spec.ts` (modificar)

Bloque nuevo `describe('flashcard state', ...)`:

1. Estado inicial: `flashcardDeck === null`, `flashcardIndex === 0`, `flashcardGrades === {}`, `activeTab` inicial `'transcript'`.
2. `setActiveTab` acepta `'flashcards'`.
3. `ensureFlashcardsDeck` construye el mazo con la primera llamada y **devuelve la misma referencia** en una segunda llamada con la misma `SummaryData` (no reset).
4. Con una **referencia distinta** de `SummaryData` → mazo reconstruido y `flashcardGrades`/`flashcardIndex` reiniciados.
5. `gradeFlashcard` acumula de forma inmutable (`grades` no muta la referencia anterior).
6. `setFlashcardIndex` actualiza el índice.
7. `resetFlashcards` pone índice 0 y grades `{}` dejando el mazo intacto.
8. `clear()` resetea todo el estado flashcards (deck, source, index, grades) y restaura `activeTab === 'transcript'`.
9. Regresión: bloqueo existente de `summary state` sigue en verde (los counts de llamadas de `getAssetTranscript`/`loadAssetSummary` no cambian).

### `web/src/lib/components/asset-viewer/FlashcardPanel.spec.ts` (nuevo)

Usa el patrón `factory.manager` + `vi.mock(import('$lib/stores/transcript.svelte'), ...)` y mock de `$lib/utils/transcript-flashcards`:

1. `loading` → testid `flashcard-loading`.
2. `empty` (sin resumen) + retry → testid `flashcard-empty`, click en `flashcard-retry` llama `onRetry`.
3. **mazo vacío** (`deck.cards.length === 0`) → testid `flashcard-empty` sin `flashcard-retry`.
4. **data**: `flashcard-front` muestra el anverso; `flashcard-counter` muestra el progreso.
5. Volteo: click en `flashcard-toggle` muestra `flashcard-back` (y la pista `flashcards_self_check` en tarjetas de pregunta con back vacío).
6. Navegación: `flashcard-prev` disabled en la primera; `flashcard-next` avanza y `flashcard-counter` se actualiza.
7. Grading known: click `flashcard-known` → `gradeFlashcard('concept-0', 'known')` y avanza de índice.
8. Grading again: análogo con `'again'`.
9. Al evaluar la última tarjeta → `flashcard-summary` con conocidas/a repasar/sin evaluar (se renderizan `flashcard-summary-known`, `flashcard-summary-again`, `flashcard-summary-ungraded` solo si su conteo > 0).
10. `flashcard-restart` en el resumen → `transcriptManager.resetFlashcards()`.
11. Export: click `flashcard-export` → `downloadFlashcardDeckCsv(exportFlashcardDeckToCsv(...), 'asset-1')` con el `grades` de la sesión.

### `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` (modificar)

1. **3 radios** cuando hay transcript (actual test de 2 → 3).
2. Click en el tercer radio → `setActiveTab('flashcards')`.
3. Con `activeTab: 'flashcards'` y `summaryData: mockSummary` → se renderiza `FlashcardPanel` (testid presente) y `ensureFlashcardsDeck` fue llamado.
4. `activeTab: 'flashcards'` sin resumen → auto-dispara `loadAssetSummary('asset-1')` (efecto ampliado).
5. aria-label del contenedor usa `smart_class_flashcards_title` cuando `activeTab === 'flashcards'`.
6. Regresión: tests actuales de transcript, summary, spinner y export se mantienen en verde.

### `i18n.spec.ts`

Sin cambios (valida estructura de JSON); las nuevas claves quedan cubiertas por compilación de types (no hay `any`).

## Fuera de alcance (fases posteriores)

- Algoritmo SM-2 / programación de dificultad (`Flashcard.difficulty` queda `undefined`).
- Generación `.apkg` (zip + sqlite anki2) o exportación a otros formatos (JSON, TSV).
- Persistencia del progreso de estudio (localStorage o server).
- Endpoint real del resumen (sustituye `createMockSummary`).
- Edición/creación manual de tarjetas.
- Soporte de imágenes/expresiones matemáticas/campos extra en el CSV.
- Cambios en `server/`, `machine-learning/`, `mobile/`, `packages/sdk/`, `ui/`.

## Criterios de aceptación (Quality Gates)

1. `pnpm --filter immich-web run check:typescript` → exit 0.
2. `pnpm --filter immich-web run lint` → exit 0.
3. `pnpm --filter immich-web exec vitest run src/lib/utils/transcript-flashcards.spec.ts src/lib/stores/transcript.svelte.spec.ts src/lib/components/asset-viewer/FlashcardPanel.spec.ts src/lib/components/asset-viewer/TranscriptPanel.spec.ts` → todos pass (nuevos + regresión). O bien la suite `test:cov` de `web/`.
4. Cero `any` en archivos nuevos/modificados (strict); mocks siguiendo el patrón `as never` existente cuando sea imprescindible.
5. Claves i18n nuevas presentes en `en.json` **y** `es.json`, y `smart_class_notes_viewer_tabs` actualizada en ambos.
6. En el navegador (query manual opcional): tercera pestaña visible, volteo/grading/contador/resumen funcionan, cambiar de pestaña conserva el progreso, el CSV descarga e importa en Anki Desktop con `Front,Back,Tags`.
7. Commit atómico independiente (Conventional Commit) tras verificación y confirmación del usuario; **sin push** sin aprobación explícita.