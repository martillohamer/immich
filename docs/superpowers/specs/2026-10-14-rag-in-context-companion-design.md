# Fase 1.2 — Asistente Conversacional RAG Acotado al Contexto (In-Context AI Companion)

- **Fecha:** 2026-10-14
- **Estado:** Diseño aprobado (visto bueno del usuario). Listo para `writing-plans`.
- **Repositorio/workspace:** `C:\Users\astur\Desktop\immich-main` (frontend `web/`, pnpm + Svelte 5 runes + Vite + Vitest).
- **Precedente:** Fase 1.1 `feat(web): add Smart Class Notes flashcards active recall viewer` (`39bb1cc`).
- **Documento no versionado:** `docs/superpowers/**` nunca se commitea (regla del usuario). Sin `git push` sin confirmación explícita.

---

## 1. Resumen y objetivos

Añadir una **4.ª pestaña Chat** al `TranscriptPanel` que responde preguntas del usuario **usando exclusivamente los segmentos de la transcripción del asset activo**, con **citas temporales `[MM:SS]` clicables** que invocan `onSeek`. Todo se resuelve **en cliente**, de forma **determinista** y **sin llamadas externas** (sin red, sin backend, sin LLM). El motor de recuperación se modela como una **abstracción sustituible** para una futura integración con un proveedor real.

### Objetivos

1. Recuperación contextual real sobre los segmentos de la transcripción del asset activo.
2. Respuesta sintetizada local **extractiva** (cita literal) con citas estructuradas.
3. Historial conversacional **por asset**, que **sobrevive al cambio de pestaña**.
4. Citas `[MM:SS]` clicables → `onSeek(seconds)` + resaltado sincronizado con `currentTime`.
5. Cero invención: si no hay coincidencias, mensaje de "no encontrado" sin citas.
6. i18n `en`/`es` completa, accesibilidad y cobertura de tests de la lógica crítica.

### No-objetivos (v1)

Backend/LLM real, embeddings, streaming de tokens, persistencia (localStorage/DB), recuperación multi-turno, evicción de sesiones, telemetría, preguntas sugeridas, envío multi-línea.

---

## 2. Decisiones aprobadas

| # | Tema | Decisión |
|---|------|----------|
| D1 | Ubicación del retrieval | **Cliente** sobre los segmentos del transcript; síntesis local determinista; **motor abstracto sustituible** por LLM real en el futuro. |
| D2 | Memoria conversacional | **Turnos independientes**: cada pregunta se recupera solo contra los segmentos; el historial es **solo visual**. Citas siempre de la transcripción. |
| D3 | Estado | **Sub-store dedicado `RagChatManager`** con sesiones por `assetId`. Desacoplado del `clear()` de `transcriptManager`; sobrevive cambio de pestaña y de asset ya visitado. |
| D4 | Motor de recuperación | **Scoring léxico IDF-ponderado** (variante ligera de TF-IDF) + stopwords `es`/`en` + top-K con umbral mínimo. |
| D5 | Sin coincidencias | **Mensaje "no encontrado" sin citas** (i18n). La pregunta y esa respuesta se guardan igualmente. |
| D6 | Citas | **Fila de badges clicables `[MM:SS]`** bajo cada respuesta, deduplicadas por segmento; badge resaltado cuando `currentTime ∈ [start, end)`. |
| D7 | Asincronía | `ask()` **async con indicador "Buscando en la transcripción…"**, **sin delay artificial** (yield de microtask). |
| D8 | Estado vacío / compositor | Guía simple i18n + `<input>` de una línea (+ botón enviar); Enter envía; deshabilitado si vacío o respondiendo; `trim`; tope 500; historial solo en memoria. |
| D9 | Composición de respuesta | **Extractiva**: marco i18n corto + cita literal del mejor segmento. Cero texto inventado. |

---

## 3. Arquitectura por capas

```
TranscriptionResponseDto.segments ──▶ createRagEngine(segments)   [utils/transcript-rag.ts · puro]
                                            │ RagEngine.search(query) ─▶ RetrievedSegment[]
                                            ▼
RagChatManager.ask(assetId, question)      [stores/rag-chat.svelte.ts · singleton runes]
   ├─ append mensaje { role:'user' }
   ├─ responding = true  (yield)
   ├─ engine.search(...) ─▶ composición i18n (get(t))
   ├─ append mensaje { role:'assistant', content, citations }
   └─ responding = false
                                            ▼ ChatMessage[]
RagChatPanel.svelte                        [components/asset-viewer/RagChatPanel.svelte]
   ├─ lee transcript de transcriptManager → ensureEngine(assetId, segments)
   ├─ render lista + estado vacío + indicador
   ├─ citas clickables → onSeek(timestampStart)
                                            ▼
TranscriptPanel.svelte (4.º tab 'chat') ──▶ AudioViewer.seekTo(time)
```

Contratos de extremo a extremo:

1. La transcripción (`transcriptManager.transcript: TranscriptionResponseDto | null`) provee `segments: { start, end, text }[]`.
2. `createRagEngine(segments)` construye el índice (determinista).
3. `RagChatManager` mantiene sesiones y compone respuestas.
4. `RagChatPanel` presenta y delega el seek vía `onSeek`.

---

## 4. Contrato de tipos

Se **extiende** `web/src/lib/types/transcript.ts` (dominio "Smart Class Notes"), sin nuevos archivos de tipos.

```ts
export type ChatRole = 'user' | 'assistant';

export type ChatCitation = {
  timestampStart: number;
  timestampEnd: number;
  textSnippet: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  citations?: ChatCitation[];
};

export type ChatSession = {
  assetId: string;
  messages: ChatMessage[];
};
```

Notas:
- `id` se genera con `generateId()` (`$lib/utils/generate-id` → `id-${n}`).
- `timestamp` es `Date.now()` (ms).
- `citations` ausente en pregunta de usuario y en respuestas "no encontrado".
- Sin `any`. Tipos explícitos.

---

## 5. Motor de recuperación — `web/src/lib/utils/transcript-rag.ts` (nuevo, puro)

Unidad **pura y sin dependencias** de stores/UI, fácilmente sustituible (p. ej. por embeddings) detrás de la interfaz `RagEngine`.

### 5.1 API

```ts
export type TranscriptSegment = { start: number; end: number; text: string };

export type RetrievedSegment = {
  index: number;
  start: number;
  end: number;
  text: string;
  score: number; // [0,1]
};

export type RagSearchOptions = {
  topK?: number;   // default 3
  minScore?: number; // default 0.3
};

export interface RagEngine {
  search(query: string, options?: RagSearchOptions): RetrievedSegment[];
}

export function createRagEngine(segments: TranscriptSegment[]): RagEngine;

/** 'MM:SS' o 'HH:MM:SS' si >= 1 hora. Cero-padding de 2 dígitos. */
export function formatTimestamp(seconds: number): string;

/** Proyecta segmentos recuperados a citas estructuradas (únicos por índice). */
export function toCitations(segments: RetrievedSegment[]): ChatCitation[];
```

`createRagEngine` precomputa en construcción (inmutable), por segmento: `tokens` (Set), `tokenCount`, `normalizedText` (texto normalizado con espacios simples), y globalmente `df` e `idf` por término.

### 5.2 Preprocesado

- `tokenize(text)`: minúsculas → `NFD` → elimina diacríticos (`\p{Diacritic}`) → split por `/[^a-z0-9]+/` → filtra vacíos y longitud < 2 → elimina stopwords.
- `STOPWORDS_ES` y `STOPWORDS_EN` (conjuntos `Set<string>` locales, no exhaustivos pero razonables: artículos, preposiciones, pronombres, auxiliares comunes en ambos idiomas).
- `normalizeText(text)`: minúsculas + sin diacríticos + espacios colapsados (para el bonus de frase).

### 5.3 Scoring

Para una consulta con términos distintos `Q` (tras `tokenize`):

- Si `Q` vacío → `search` devuelve `[]`.
- Solo se consideran términos con `df(t) > 0` (presentes en al menos un segmento). `D = Σ idf(t)` sobre esos términos; si `D === 0` → `[]`.
- `idf(t) = Math.log(1 + N / df(t))`, con `N = segments.length`.
- Para cada segmento `s`:
  - `numerator(s) = Σ idf(t)` para `t ∈ Q ∩ tokens(s)`.
  - `coverage(s) = numerator(s) / D` → `[0,1]`.
  - `phrase(s) = (normalizeText(s).includes(normalizeText(query))) ? 1 : 0`.
  - `score(s) = COVERAGE_WEIGHT * coverage(s) + PHRASE_WEIGHT * phrase(s)`, con `COVERAGE_WEIGHT = 0.8` y `PHRASE_WEIGHT = 0.2` → `score ∈ [0,1]`.
  - *Por qué ponderado y no `coverage + bonus` con clamp:* si el fraseo exacto aparece, todos los tokens están presentes y `coverage = 1`; sumar un bonus y clampear a 1 lo volvería inalcanzable. El blend hace que un match contiguo completo (1.0) supere a uno completo no contiguo (0.8) y a uno parcial, sin clamp.
- `search`: calcula `score` por segmento; descarta `score < minScore`; ordena por `score` desc, desempate por `index` asc; recorta a `topK`.
- Resultado vacío ⇒ "no encontrado" (el panel/store lo trata).

Determinismo garantizado: sin aleatoriedad, sin tiempo, sin red.

### 5.4 `formatTimestamp`

```ts
const total = Math.max(0, Math.floor(seconds));
const hh = Math.floor(total / 3600);
const mm = Math.floor((total % 3600) / 60);
const ss = total % 60;
const pad = (n: number) => String(n).padStart(2, '0');
return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
```

### 5.5 `toCitations`

`RetrievedSegment[] → ChatCitation[]` con `{ timestampStart: start, timestampEnd: end, textSnippet: text }`. Sin duplicados (la recuperación ya deduplica por índice).

---

## 6. Store — `web/src/lib/stores/rag-chat.svelte.ts` (nuevo)

Singleton con runes (mismo patrón que `transcript.svelte.ts`). **No** se limpia desde `transcriptManager.clear()`.

### 6.1 Forma

```ts
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';

const EMPTY_MESSAGES: ChatMessage[] = [];

export class RagChatManager {
  #sessions = $state<Record<string, ChatSession>>({});
  #responding = $state<Record<string, boolean>>({});
  #engines = new Map<string, { source: TranscriptSegment[]; engine: RagEngine }>();

  ensureEngine(assetId: string, segments: TranscriptSegment[]): RagEngine;
  getMessages(assetId: string): ChatMessage[];
  isResponding(assetId: string): boolean;
  async ask(assetId: string, question: string): Promise<void>;
  resetSession(assetId: string): void;
  clear(): void;
}

export const ragChatManager = new RagChatManager();
```

### 6.2 Comportamiento

- **`ensureEngine(assetId, segments)`**: si `#engines.get(assetId)?.source === segments` (identidad, igual que `ensureFlashcardsDeck` con `summaryData`), reutiliza; si no, `createRagEngine(segments)` y cachea `{ source: segments, engine }`.
- **`getMessages(assetId)`**: `this.#sessions[assetId]?.messages ?? EMPTY_MESSAGES` (referencia estable para no invalidar `$derived`).
- **`isResponding(assetId)`**: `this.#responding[assetId] ?? false`.
- **`ask(assetId, question)`**:
  1. `const content = question.trim();` si `content.length === 0` o `isResponding(assetId)` → `return`.
  2. Añade mensaje `{ id: generateId(), role:'user', content, timestamp: Date.now() }`.
  3. `#responding = { ...#responding, [assetId]: true }`.
  4. `await Promise.resolve();` (yield: la UI pinta "buscando").
  5. `const retrieved = this.#engines.get(assetId)?.engine.search(content) ?? [];`.
  6. Compone con i18n y añade mensaje `'assistant'`.
  7. `#responding = { ...#responding, [assetId]: false }` en `finally`.
- **Composición (i18n vía `get(t)`)**:
  - `retrieved.length === 0` → `content = get(t)('rag_chat_no_match')`, `citations = []`.
  - si no → `const top = retrieved[0]; const time = formatTimestamp(top.start);`
    `content = \`${get(t)('rag_chat_answer_prefix', { values: { time } })} “${top.text}”\`;`
    `citations = toCitations(retrieved)`.
- **`resetSession(assetId)`**: elimina sesión + flag responding + engine cacheado del asset.
- **`clear()`**: vacía `#sessions`, `#responding` y `#engines` (útil para tests y paridad con `transcriptManager`).
- **Aislamiento**: toda operación está indexada por `assetId`; assets distintos no se interfieren.
- **Sin evicción** en v1 (deuda documentada en §12).

---

## 7. UI — `web/src/lib/components/asset-viewer/RagChatPanel.svelte` (nuevo)

### 7.1 Props

```ts
let { assetId, currentTime, onSeek }: {
  assetId: string;
  currentTime: number;
  onSeek: (time: number) => void;
} = $props();
```

### 7.2 Estado

- `let transcript = $derived(transcriptManager.transcript);`
- `let messages = $derived(ragChatManager.getMessages(assetId));`
- `let responding = $derived(ragChatManager.isResponding(assetId));`
- `let input = $state('');`
- `$effect`: `if (transcript) ragChatManager.ensureEngine(assetId, transcript.segments);`
- `$effect`: auto-scroll al último mensaje cuando `messages.length` cambia (patrón `scrollIntoView({ block: 'end' })`).

### 7.3 Comportamiento

- `submit()`: si `input.trim()` vacío o `responding` → `return`; `void ragChatManager.ask(assetId, input); input = '';`.
- `<input>`: `bind:value={input}`, `onkeydown` Enter → `submit()`, `maxlength={500}`, `aria-label={$t('rag_chat_input_label')}`, `placeholder={$t('rag_chat_placeholder')}`, `disabled={responding}`.
- Botón enviar: `onclick={submit}`, `disabled={responding || input.trim().length === 0}`, texto `$t('rag_chat_send')`.
- **Citas**: por cada `citation`, `<button type="button">` con `[${formatTimestamp(citation.timestampStart)}]`, `onclick={() => onSeek(citation.timestampStart)}`, `title={citation.textSnippet}`, `data-active={citation.timestampStart <= currentTime && currentTime < citation.timestampEnd ? 'true' : undefined}`.
- Nombre de rol: usuario → `$t('rag_chat_you')`; asistente → `$t('rag_chat_assistant')`.

### 7.4 Vistas y testids

- Estado vacío (`messages.length === 0`): `data-testid="rag-chat-empty"` con `$t('rag_chat_empty')`.
- Lista: `data-testid="rag-chat-list"` con `role="log"` y `aria-live="polite"`.
- Mensaje: `data-testid="rag-chat-message"` + `data-role={message.role}`.
- Citas: contenedor `data-testid="rag-chat-sources"` (con `$t('rag_chat_sources')`), cada badge `data-testid="rag-chat-citation"` + `data-active`.
- Indicador: `data-testid="rag-chat-thinking"` con `$t('rag_chat_thinking')` (p. ej. con `Icon`/spinner, patrón de `FlashcardPanel`).
- Compositor: `data-testid="rag-chat-input"`, `data-testid="rag-chat-send"`.

---

## 8. Integración

### 8.1 `web/src/lib/stores/transcript.svelte.ts`

- Extender la unión de `#activeTab` y de `setActiveTab`:
  `'transcript' | 'summary' | 'flashcards' | 'chat'`.
- `clear()` no cambia (el chat es responsabilidad de `RagChatManager`).

### 8.2 `web/src/lib/components/asset-viewer/TranscriptPanel.svelte`

- Importar `RagChatPanel`.
- `GroupTab`:
  - `filters={['transcript', 'summary', 'flashcards', 'chat']}`
  - `labels={[$t('transcript_title'), $t('smart_class_summary_title'), $t('smart_class_flashcards_title'), $t('smart_class_chat_title')]}`
  - `onSelect={(tab) => transcriptManager.setActiveTab(tab as 'transcript' | 'summary' | 'flashcards' | 'chat')}`
- `aria-label`: hoy es un **ternario anidado** (`TranscriptPanel.svelte:81-85`); añadir el caso `activeTab === 'chat'` → `$t('smart_class_chat_title')` (o, preferible, extraer un `$derived` de mapa `tab → label` para evitar anidar más el ternario).
- Nueva rama: `{:else if activeTab === 'chat'}<RagChatPanel {assetId} {currentTime} {onSeek} />` (insertar tras la rama `flashcards`, antes de la rama por defecto `{:else if transcript}`).
- `loading={isGeneratingSummary}` del `GroupTab` se mantiene (el chat no requiere resumen).
- El efecto de auto-generación de resumen se mantiene limitado a `'summary'`/`'flashcards'` (chat no requiere `summaryData`).
- `onSeek` llega desde `AudioViewer.seekTo` (ya cableado: `AudioViewer.svelte:48`).

---

## 9. i18n (`i18n/en.json`, `i18n/es.json`)

Claves nuevas (insertar en **orden alfabético**):

| clave | en | es |
|---|---|---|
| `rag_chat_answer_prefix` | `The transcript says at {time}:` | `En {time} se menciona:` |
| `rag_chat_assistant` | `Assistant` | `Asistente` |
| `rag_chat_empty` | `Ask anything about this material.` | `Pregunta lo que quieras sobre este material.` |
| `rag_chat_input_label` | `Your question` | `Tu pregunta` |
| `rag_chat_no_match` | `I couldn't find that in this material's transcript.` | `No encuentro eso en la transcripción de este material.` |
| `rag_chat_placeholder` | `Type your question…` | `Escribe tu pregunta…` |
| `rag_chat_send` | `Send` | `Enviar` |
| `rag_chat_sources` | `Sources` | `Fuentes` |
| `rag_chat_thinking` | `Searching the transcript…` | `Buscando en la transcripción…` |
| `rag_chat_you` | `You` | `Tú` |
| `smart_class_chat_title` | `Chat` | `Chat` |

Clave **modificada**:

- `smart_class_notes_viewer_tabs`: en → `Transcript, summary, flashcards and chat viewer tabs`; es → `Pestañas del visor de transcripción, resumen, tarjetas y chat` (valor actual es `Pestañas del visor de transcripción, resumen y tarjetas`).

`formatTimestamp` es de formato neutro (no se traduce). `rag_chat_answer_prefix` usa ICU `{time}`.

---

## 10. Testing (TDD)

Todos los specs se ejecutan con Vitest; en tests `$t` devuelve la **clave literal** (`init({ fallbackLocale: 'dev' })` en `web/src/test-data/setup.ts`), por lo que se asertan **testids/estructura** y texto **de datos reales**, nunca traducciones.

### 10.1 `web/src/lib/utils/transcript-rag.spec.ts` (nuevo)

- `tokenize`: minúsculas + sin diacríticos + drop stopwords + drop longitud < 2.
- `createRagEngine(...).search`: cobertura IDF correcta; término presente en 1 de N pesa más que en N.
- Match de frase contigua completo puntúa `1.0`; el mismo conjunto de tokens no contiguo puntúa `0.8`.
- `topK` limita resultados y ordena por score desc (desempate por índice).
- `minScore` filtra; consulta sin coincidencias → `[]`; consulta vacía/solo stopwords → `[]`.
- `formatTimestamp`: `0 → '00:00'`, `65 → '01:05'`, `3599 → '59:59'`, `3600 → '01:00:00'`, negativos → `'00:00'`.
- `toCitations`: mapea `{timestampStart, timestampEnd, textSnippet}`.

### 10.2 `web/src/lib/stores/rag-chat.svelte.spec.ts` (nuevo)

- `ensureEngine` reutiliza el engine si `segments` tiene la misma identidad; reconstruye si cambia.
- `ask` añade mensaje `user` y luego `assistant` (orden, roles, `citations`).
- `isResponding` pasa a `true` y vuelve a `false` al finalizar.
- Consulta sin coincidencias → mensaje `assistant` sin `citations` y contenido = clave literal `rag_chat_no_match`.
- Con coincidencias → `content` incluye el texto real del mejor segmento y `citations` con `timestampStart/End`.
- Aislamiento: `ask('a', ...)` no altera `getMessages('b')`.
- `ask` con pregunta vacía o estando `responding` no añade mensajes.
- `resetSession` vacía solo el asset indicado; `clear` vacía todo.

### 10.3 `web/src/lib/components/asset-viewer/RagChatPanel.spec.ts` (nuevo)

Patrón de mock de store: `vi.mock(import('$lib/stores/rag-chat.svelte'), () => ({ ragChatManager: { ... } as never }))` con objeto `factory.manager` mutable (patrón `FlashcardPanel.spec.ts`). Se mockea también `$lib/stores/transcript.svelte` para `transcript.segments` y `ensureEngine`.

- Estado vacío visible cuando `messages.length === 0`.
- Escribir + Enter (y clic en enviar) llama `ask(assetId, texto)` y limpia el input.
- Botón enviar deshabilitado si input vacío o si `responding`.
- Indicador `rag-chat-thinking` visible mientras `responding`.
- Render de `rag-chat-sources`/`rag-chat-citation` cuando hay `citations`; clic en badge → `onSeek(timestampStart)`.
- `data-active="true"` cuando `currentTime` cae dentro del rango de la cita.
- `maxlength=500` en el input.

### 10.4 `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` (extender)

- Actualizar el tipo local `ManagerState.activeTab` (línea 12) y la firma del mock `setActiveTab` (línea 55) para incluir `'chat'` en la unión.
- 4.º tab `chat` presente; `aria-label` usa `smart_class_chat_title` cuando `activeTab === 'chat'`.
- Al seleccionar `chat` se renderiza `RagChatPanel`. Como `TranscriptPanel.spec.ts` solo mockea `transcriptManager`, añadir `vi.mock(import('./RagChatPanel.svelte'), ...)` (o mockear `$lib/stores/rag-chat.svelte`) para aislar el test y evitar depender del store real.
- Revisar aserciones existentes sobre el número/roles de tabs: `GroupTab` ahora expone **4** filtros; actualizar cualquier conteo o índice posicional de tabs.

---

## 11. Quality gates

Desde `workdir` `web/`:

- `pnpm run check:typescript` (`tsc --noEmit`)
- `pnpm run check:svelte` (`svelte-check --no-tsconfig --fail-on-warnings ...`)
- `pnpm run lint` (`eslint . --max-warnings 0 --concurrency 6`)
- `pnpm exec prettier --cache --check <archivos>` (fix con `--write`; no reformatear `i18n/*.json` salvo inserción de claves)
- `pnpm exec vitest run <specs>`

Reglas de estilo a respetar (ESLint del repo): orden de clases Tailwind, `prefer-single-call`, `no-for-each`, `prefer-string-replace-all`, sin `any`. Ejecutar `lint:fix` y luego `prettier --write` si aplica.

> Nota: gates **solo frontend**; no requiere Maven.

---

## 12. Archivos afectados

**Nuevos**

- `web/src/lib/utils/transcript-rag.ts` (+ `transcript-rag.spec.ts`)
- `web/src/lib/stores/rag-chat.svelte.ts` (+ `rag-chat.svelte.spec.ts`)
- `web/src/lib/components/asset-viewer/RagChatPanel.svelte` (+ `RagChatPanel.spec.ts`)

**Modificados**

- `web/src/lib/types/transcript.ts` (tipos `Chat*`)
- `web/src/lib/stores/transcript.svelte.ts` (unión `activeTab`)
- `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` (4.º tab + rama + aria-label)
- `i18n/en.json`, `i18n/es.json` (11 claves nuevas + 1 actualizada)

**Untracked (no commit):** `docs/superpowers/specs/2026-10-14-rag-in-context-companion-design.md` y su plan asociado.

---

## 13. Riesgos y casos límite

- **Transcripción sin segmentos**: engine con `N = 0`; `search` → `[]` → "no encontrado". Sin excepciones.
- **Consulta solo stopwords / vacía**: `Q` vacío → `[]` (no se persiste si `trim` es vacío).
- **Identidad de `segments`**: `ensureEngine` se apoya en identidad de objeto (coherente con `ensureFlashcardsDeck`); si el asset recarga y produce nuevo array, se reconstruye.
- **Reactividad**: reasignación inmutable de `#sessions`/`#responding` para que los `$derived` del panel reaccionen.
- **Crecimiento de memoria**: sin evicción en v1 (ver §14).
- **Doble envío**: bloqueado por el guard `isResponding` + botón deshabilitado.
- **i18n fuera de línea en tests**: `$t` devuelve la clave literal; los asserts no dependen de traducciones.

---

## 14. Fuera de alcance y trabajo futuro

- Sustituir `RagEngine` por un motor con embeddings/LLM real (la interfaz ya lo permite).
- Streaming de respuesta y `AbortController`/cancelación.
- Recuperación multi-turno (histórico como contexto).
- Persistencia de sesiones y **evicción** (p. ej. LRU por `assetId`).
- Preguntas sugeridas derivadas de `SummaryData.reviewQuestions`.
- Telemetría/analytics de uso.

---

## 15. Trazabilidad

| Requisito del usuario | Sección |
|---|---|
| Contrato de tipos `ChatMessage`/`ChatSession` | §4 |
| Abstracción del motor de búsqueda contextual | §5 |
| Retrieval real en cliente + citas `[MM:SS]` | §5, §7 |
| `onSeek(seconds)` al pulsar cita | §7.3, §8.2 |
| Historial sobrevive cambio de pestaña (y por asset) | §6 (D3) |
| Turnos independientes | D2, §6.2 |
| UI Svelte 5 runes + arquitectura de estado | §6, §7 |
| i18n en/es | §9 |
| Tests y gates verdes | §10, §11 |
| Anti-alucinación (no-match) | D5, §6.2 |

---

## 16. Protocolo de cierre

1. Implementar con TDD; dejar §11 en verde.
2. **Un commit atómico** `feat(web): add in-context RAG chat companion to Smart Class Notes` (o similar), incluyendo solo los archivos de §12 (nunca `docs/superpowers/**` ni cambios ajenos).
3. **No** `git push`/merge sin confirmación explícita del usuario.
