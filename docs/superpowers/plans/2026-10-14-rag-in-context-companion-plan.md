# In-Context RAG Companion (Fase 1.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una 4.ª pestaña "Chat" al `TranscriptPanel` que responde preguntas usando solo los segmentos de la transcripción del asset activo, con citas `[MM:SS]` clicables (`onSeek`), 100% en cliente y determinista.

**Architecture:** Capas limpias — (1) util puro `transcript-rag.ts` (tokenize + IDF + blend de frase → `RagEngine`), (2) sub-store dedicado `RagChatManager` con sesiones por `assetId` sobre `$state`, (3) componente `RagChatPanel.svelte`, (4) integración de un 4.º tab en `transcriptManager`/`TranscriptPanel`. El motor detrás de la interfaz `RagEngine` es sustituible por un LLM real en el futuro.

**Tech Stack:** Svelte 5 (runes), SvelteKit, TypeScript (sin `any`), `svelte-i18n`, Tailwind, Vitest + `@testing-library/svelte`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-14-rag-in-context-companion-design.md`

## Global Constraints

- **Workspace real:** `C:\Users\astur\Desktop\immich-main` (el cwd por defecto del agente es OTRO repo). Usar rutas absolutas o `workdir`. Todos los comandos de este plan se ejecutan con `workdir` `C:\Users\astur\Desktop\immich-main\web`.
- **Cero `any`.** Tipos explícitos; `strict` de TS debe pasar.
- **Sin comentarios** salvo que aporten; documentación en español, identificadores en inglés.
- **i18n** solo en `immich-main/i18n/en.json` y `immich-main/i18n/es.json`, claves en **orden alfabético**. No reformatear el resto del JSON.
- **Nunca commitear `docs/superpowers/**`** (spec/plan quedan untracked).
- **No** `git push` ni merge sin confirmación explícita del usuario.
- Mensajes de commit en estilo repo: `feat(web): ...`.
- **Gates** (workdir `web/`): `pnpm run check:typescript`, `pnpm run check:svelte`, `pnpm run lint` (ya lleva `--max-warnings 0`), `pnpm exec prettier --cache --check <archivos>`, `pnpm exec vitest run <specs>`. Ejecutar `pnpm run lint:fix` y `pnpm exec prettier --write <archivos>` si hay fallos de formato/orden.
- En tests, `$t(clave)` devuelve la **clave literal** (`init({ fallbackLocale: 'dev' })` en `web/src/test-data/setup.ts`). Aserción sobre testids/estructura/clave literal, nunca texto traducido.
- Constantes finales del motor: `topK = 3`, `minScore = 0.3`, `COVERAGE_WEIGHT = 0.8`, `PHRASE_WEIGHT = 0.2`.
- Tipos exactos (una sola vez, en `web/src/lib/types/transcript.ts`): `ChatRole`, `ChatCitation`, `ChatMessage`, `ChatSession` (ver Task 1).

---

## File Structure

- **Create** `web/src/lib/utils/transcript-rag.ts` — motor puro (tokenize, IDF, scoring, `formatTimestamp`, `toCitations`, `createRagEngine`). Task 1.
- **Create** `web/src/lib/utils/transcript-rag.spec.ts` — tests del motor. Task 1.
- **Modify** `web/src/lib/types/transcript.ts` — añadir tipos `Chat*`. Task 1.
- **Create** `web/src/lib/stores/rag-chat.svelte.ts` — sub-store `RagChatManager`. Task 2.
- **Create** `web/src/lib/stores/rag-chat.svelte.spec.ts` — tests del store. Task 2.
- **Create** `web/src/lib/components/asset-viewer/RagChatPanel.svelte` — UI del chat. Task 3.
- **Create** `web/src/lib/components/asset-viewer/RagChatPanel.spec.ts` — tests del panel. Task 3.
- **Modify** `immich-main/i18n/en.json` + `immich-main/i18n/es.json` — claves `rag_chat_*` + `smart_class_chat_title` + `smart_class_notes_viewer_tabs`. Task 3.
- **Modify** `web/src/lib/stores/transcript.svelte.ts` — unión `activeTab` con `'chat'`. Task 4.
- **Modify** `web/src/lib/stores/transcript.svelte.spec.ts` — test de `setActiveTab('chat')`. Task 4.
- **Modify** `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` — 4.º tab + rama + aria-label. Task 4.
- **Modify** `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` — unión mock + mocks chat + tests. Task 4.

---

## Task 1: Motor RAG puro + tipos `Chat*`

**Files:**
- Create: `web/src/lib/utils/transcript-rag.ts`
- Test: `web/src/lib/utils/transcript-rag.spec.ts`
- Modify: `web/src/lib/types/transcript.ts` (añadir `ChatRole`, `ChatCitation`, `ChatMessage`, `ChatSession` al final)

**Interfaces:**
- Consumes: nada (unidad pura).
- Produces:
  - `type TranscriptSegment = { start: number; end: number; text: string }`
  - `type RetrievedSegment = { index: number; start: number; end: number; text: string; score: number }`
  - `type RagSearchOptions = { topK?: number; minScore?: number }`
  - `interface RagEngine { search(query: string, options?: RagSearchOptions): RetrievedSegment[] }`
  - `function createRagEngine(segments: TranscriptSegment[]): RagEngine`
  - `function formatTimestamp(seconds: number): string`
  - `function toCitations(segments: RetrievedSegment[]): ChatCitation[]`
  - Tipos `ChatCitation`/`ChatMessage`/`ChatRole`/`ChatSession` en `$lib/types/transcript`.

- [ ] **Step 1: Añadir los tipos `Chat*` a `web/src/lib/types/transcript.ts`**

Al final del archivo, añadir:

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

- [ ] **Step 2: Escribir el test que falla**

Crear `web/src/lib/utils/transcript-rag.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRagEngine, formatTimestamp, toCitations } from './transcript-rag';

const segments = [
  { start: 0, end: 10, text: 'La fotosíntesis convierte la luz solar en energía química' },
  { start: 10, end: 20, text: 'El aparato de Golgi empaqueta proteínas dentro de la célula' },
  { start: 20, end: 30, text: 'Las mitocondrias producen energía para la célula' },
];

const idfSegments = [
  { start: 0, end: 5, text: 'energia mitocondria' },
  { start: 5, end: 10, text: 'energia celula' },
  { start: 10, end: 15, text: 'energia membrana' },
  { start: 15, end: 20, text: 'mitocondria fotosintesis' },
];

const phraseSegments = [
  { start: 0, end: 5, text: 'clave secreta' },
  { start: 5, end: 10, text: 'la clave esta en la secreta puerta' },
];

describe('formatTimestamp', () => {
  it('formatea minutos y segundos', () => {
    expect(formatTimestamp(0)).toBe('00:00');
    expect(formatTimestamp(65)).toBe('01:05');
    expect(formatTimestamp(3599)).toBe('59:59');
  });

  it('incluye horas cuando es >= 1 hora', () => {
    expect(formatTimestamp(3600)).toBe('01:00:00');
    expect(formatTimestamp(3661)).toBe('01:01:01');
  });

  it('clampea valores negativos a cero', () => {
    expect(formatTimestamp(-5)).toBe('00:00');
  });
});

describe('createRagEngine', () => {
  it('devuelve los segmentos que contienen el término, ordenados por índice en empate', () => {
    const engine = createRagEngine(segments);
    const results = engine.search('energía');
    expect(results.map((result) => result.index)).toEqual([0, 2]);
  });

  it('pondera más los términos raros (IDF) en una consulta multi-término', () => {
    const engine = createRagEngine(idfSegments);
    const results = engine.search('energia mitocondria');
    expect(results[0].index).toBe(0);
    expect(results[0].score).toBeCloseTo(1);
    expect(results[1].index).toBe(3);
    expect(results[1].score).toBeLessThan(results[0].score);
  });

  it('puntúa 1.0 una frase contigua completa y menos una no contigua', () => {
    const engine = createRagEngine(phraseSegments);
    const results = engine.search('clave secreta');
    expect(results[0].index).toBe(0);
    expect(results[0].score).toBeCloseTo(1);
    expect(results[1].index).toBe(1);
    expect(results[1].score).toBeCloseTo(0.8);
  });

  it('respeta topK', () => {
    const engine = createRagEngine(idfSegments);
    const results = engine.search('mitocondria', { topK: 1 });
    expect(results).toHaveLength(1);
  });

  it('filtra por minScore', () => {
    const engine = createRagEngine(idfSegments);
    const results = engine.search('energia mitocondria', { minScore: 0.9 });
    expect(results.map((result) => result.index)).toEqual([0]);
  });

  it('devuelve vacío si no hay coincidencias', () => {
    const engine = createRagEngine(segments);
    expect(engine.search('guitarra eléctrica')).toEqual([]);
  });

  it('devuelve vacío para consultas vacías o solo stopwords', () => {
    const engine = createRagEngine(segments);
    expect(engine.search('')).toEqual([]);
    expect(engine.search('la de en y')).toEqual([]);
  });

  it('devuelve vacío sin segmentos', () => {
    const engine = createRagEngine([]);
    expect(engine.search('energía')).toEqual([]);
  });
});

describe('toCitations', () => {
  it('mapea segmentos recuperados a citas', () => {
    const engine = createRagEngine(segments);
    const citations = toCitations(engine.search('energía'));
    expect(citations[0]).toEqual({ timestampStart: 0, timestampEnd: 10, textSnippet: segments[0].text });
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run (workdir `web`): `pnpm exec vitest run src/lib/utils/transcript-rag.spec.ts`
Expected: FAIL — `Cannot find module './transcript-rag'` (o equivalent).

- [ ] **Step 4: Implementar el motor**

Crear `web/src/lib/utils/transcript-rag.ts`:

```ts
import type { ChatCitation } from '$lib/types/transcript';

export type TranscriptSegment = { start: number; end: number; text: string };

export type RetrievedSegment = {
  index: number;
  start: number;
  end: number;
  text: string;
  score: number;
};

export type RagSearchOptions = {
  topK?: number;
  minScore?: number;
};

export interface RagEngine {
  search(query: string, options?: RagSearchOptions): RetrievedSegment[];
}

const DEFAULT_TOP_K = 3;
const DEFAULT_MIN_SCORE = 0.3;
const COVERAGE_WEIGHT = 0.8;
const PHRASE_WEIGHT = 0.2;

const STOPWORDS = new Set([
  'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'una',
  'su', 'al', 'es', 'lo', 'como', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'si', 'porque', 'esta',
  'entre', 'cuando', 'muy', 'sin', 'sobre', 'tambien', 'me', 'hasta', 'hay', 'donde', 'quien',
  'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso',
  'ante', 'ellos', 'esto', 'mi', 'antes', 'algunos', 'que', 'cual',
  'the', 'an', 'and', 'or', 'but', 'if', 'of', 'at', 'by', 'for', 'with', 'about', 'as', 'into',
  'like', 'through', 'after', 'over', 'between', 'out', 'against', 'without', 'before', 'under',
  'around', 'among', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did',
  'doing', 'have', 'has', 'had', 'having', 'to', 'from', 'in', 'on', 'it', 'its', 'this', 'that',
  'these', 'those', 'you', 'he', 'she', 'we', 'they', 'them', 'his', 'her', 'their', 'our', 'your',
  'my', 'us', 'him', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'not', 'no', 'so',
  'than', 'then', 'too', 'very', 'can', 'will', 'would', 'should', 'could', 'there', 'here',
]);

const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

const tokenize = (text: string): string[] => {
  const tokens: string[] = [];
  for (const word of normalizeText(text).split(/[^a-z0-9]+/)) {
    if (word.length >= 2 && !STOPWORDS.has(word)) {
      tokens.push(word);
    }
  }
  return tokens;
};

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

export function toCitations(segments: RetrievedSegment[]): ChatCitation[] {
  return segments.map((segment) => ({
    timestampStart: segment.start,
    timestampEnd: segment.end,
    textSnippet: segment.text,
  }));
}

export function createRagEngine(segments: TranscriptSegment[]): RagEngine {
  const segmentTokens = segments.map((segment) => new Set(tokenize(segment.text)));
  const segmentText = segments.map((segment) => normalizeText(segment.text));

  const documentFrequency = new Map<string, number>();
  for (const tokens of segmentTokens) {
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const total = segments.length;
  const idf = (token: string): number => {
    const frequency = documentFrequency.get(token) ?? 0;
    return frequency === 0 ? 0 : Math.log(1 + total / frequency);
  };

  const search = (query: string, options: RagSearchOptions = {}): RetrievedSegment[] => {
    const topK = options.topK ?? DEFAULT_TOP_K;
    const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    const queryTokens = new Set(tokenize(query));
    if (queryTokens.size === 0) {
      return [];
    }

    let denominator = 0;
    for (const token of queryTokens) {
      denominator += idf(token);
    }
    if (denominator === 0) {
      return [];
    }

    const normalizedQuery = normalizeText(query);
    const scored: RetrievedSegment[] = [];
    for (const [index, segment] of segments.entries()) {
      const tokens = segmentTokens[index];
      let numerator = 0;
      for (const token of queryTokens) {
        if (tokens.has(token)) {
          numerator += idf(token);
        }
      }
      const coverage = numerator / denominator;
      const phrase = normalizedQuery.length > 0 && segmentText[index].includes(normalizedQuery) ? 1 : 0;
      const score = COVERAGE_WEIGHT * coverage + PHRASE_WEIGHT * phrase;
      if (score >= minScore) {
        scored.push({ index, start: segment.start, end: segment.end, text: segment.text, score });
      }
    }

    scored.sort((left, right) => right.score - left.score || left.index - right.index);
    return scored.slice(0, topK);
  };

  return { search };
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run (workdir `web`): `pnpm exec vitest run src/lib/utils/transcript-rag.spec.ts`
Expected: PASS (todos los casos).

- [ ] **Step 6: Gates locales del archivo**

Run (workdir `web`):
`pnpm run check:typescript` → exit 0
`pnpm run lint` → exit 0
`pnpm exec prettier --write src/lib/utils/transcript-rag.ts src/lib/utils/transcript-rag.spec.ts src/lib/types/transcript.ts` → sin cambios pendientes

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/types/transcript.ts web/src/lib/utils/transcript-rag.ts web/src/lib/utils/transcript-rag.spec.ts
git commit -m "feat(web): add in-context rag search engine and chat types"
```

---

## Task 2: Sub-store `RagChatManager`

**Files:**
- Create: `web/src/lib/stores/rag-chat.svelte.ts`
- Test: `web/src/lib/stores/rag-chat.svelte.spec.ts`

**Interfaces:**
- Consumes: `createRagEngine`, `formatTimestamp`, `toCitations`, `RagEngine`, `TranscriptSegment`, `RetrievedSegment` (Task 1); `ChatMessage`, `ChatSession` (Task 1); `generateId` de `$lib/utils/generate-id`.
- Produces: `class RagChatManager` con `ensureEngine(assetId, segments): RagEngine`, `getMessages(assetId): ChatMessage[]`, `isResponding(assetId): boolean`, `ask(assetId, question): Promise<void>`, `resetSession(assetId): void`, `clear(): void`; singleton exportado `ragChatManager`.

- [ ] **Step 1: Escribir el test que falla**

Crear `web/src/lib/stores/rag-chat.svelte.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '$lib/utils/transcript-rag';
import { ragChatManager } from './rag-chat.svelte';

const segments: TranscriptSegment[] = [
  { start: 0, end: 10, text: 'La fotosíntesis convierte la luz solar en energía química' },
  { start: 10, end: 20, text: 'El aparato de Golgi empaqueta proteínas' },
];

describe('ragChatManager', () => {
  beforeEach(() => {
    ragChatManager.clear();
  });

  it('devuelve lista vacía para un asset desconocido', () => {
    expect(ragChatManager.getMessages('asset-1')).toEqual([]);
    expect(ragChatManager.isResponding('asset-1')).toBe(false);
  });

  it('añade el mensaje de usuario y luego el del asistente', async () => {
    ragChatManager.ensureEngine('asset-1', segments);
    await ragChatManager.ask('asset-1', 'fotosíntesis');
    const messages = ragChatManager.getMessages('asset-1');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('fotosíntesis');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toContain('La fotosíntesis convierte la luz solar en energía química');
    expect(messages[1].citations?.[0]).toMatchObject({ timestampStart: 0, timestampEnd: 10 });
  });

  it('responde sin citas cuando no hay coincidencias', async () => {
    ragChatManager.ensureEngine('asset-1', segments);
    await ragChatManager.ask('asset-1', 'guitarra eléctrica');
    const assistant = ragChatManager.getMessages('asset-1')[1];
    expect(assistant.content).toBe('rag_chat_no_match');
    expect(assistant.citations).toEqual([]);
  });

  it('ignora preguntas vacías', async () => {
    ragChatManager.ensureEngine('asset-1', segments);
    await ragChatManager.ask('asset-1', '   ');
    expect(ragChatManager.getMessages('asset-1')).toHaveLength(0);
  });

  it('aísla las sesiones por asset', async () => {
    ragChatManager.ensureEngine('asset-1', segments);
    ragChatManager.ensureEngine('asset-2', segments);
    await ragChatManager.ask('asset-1', 'fotosíntesis');
    expect(ragChatManager.getMessages('asset-2')).toEqual([]);
  });

  it('reutiliza el engine para los mismos segmentos y reconstruye si cambian', () => {
    const first = ragChatManager.ensureEngine('asset-1', segments);
    const second = ragChatManager.ensureEngine('asset-1', segments);
    expect(second).toBe(first);
    const third = ragChatManager.ensureEngine('asset-1', [...segments]);
    expect(third).not.toBe(first);
  });

  it('gestiona el flag responding', async () => {
    ragChatManager.ensureEngine('asset-1', segments);
    const pending = ragChatManager.ask('asset-1', 'fotosíntesis');
    expect(ragChatManager.isResponding('asset-1')).toBe(true);
    await pending;
    expect(ragChatManager.isResponding('asset-1')).toBe(false);
  });

  it('resetea una sesión y lo limpia todo', async () => {
    ragChatManager.ensureEngine('asset-1', segments);
    await ragChatManager.ask('asset-1', 'fotosíntesis');
    ragChatManager.resetSession('asset-1');
    expect(ragChatManager.getMessages('asset-1')).toEqual([]);
    await ragChatManager.ask('asset-1', 'fotosíntesis');
    ragChatManager.clear();
    expect(ragChatManager.getMessages('asset-1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run (workdir `web`): `pnpm exec vitest run src/lib/stores/rag-chat.svelte.spec.ts`
Expected: FAIL — `Cannot find module './rag-chat.svelte'`.

- [ ] **Step 3: Implementar el store**

Crear `web/src/lib/stores/rag-chat.svelte.ts`:

```ts
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import type { ChatMessage, ChatSession } from '$lib/types/transcript';
import { generateId } from '$lib/utils/generate-id';
import { createRagEngine, formatTimestamp, toCitations } from '$lib/utils/transcript-rag';
import type { RagEngine, RetrievedSegment, TranscriptSegment } from '$lib/utils/transcript-rag';

const EMPTY_MESSAGES: ChatMessage[] = [];

export class RagChatManager {
  #sessions = $state<Record<string, ChatSession>>({});
  #responding = $state<Record<string, boolean>>({});
  #engines = new Map<string, { source: TranscriptSegment[]; engine: RagEngine }>();

  ensureEngine(assetId: string, segments: TranscriptSegment[]): RagEngine {
    const cached = this.#engines.get(assetId);
    if (cached && cached.source === segments) {
      return cached.engine;
    }
    const engine = createRagEngine(segments);
    this.#engines.set(assetId, { source: segments, engine });
    return engine;
  }

  getMessages(assetId: string): ChatMessage[] {
    return this.#sessions[assetId]?.messages ?? EMPTY_MESSAGES;
  }

  isResponding(assetId: string): boolean {
    return this.#responding[assetId] ?? false;
  }

  async ask(assetId: string, question: string): Promise<void> {
    const content = question.trim();
    if (content.length === 0 || this.isResponding(assetId)) {
      return;
    }

    this.#append(assetId, { id: generateId(), role: 'user', content, timestamp: Date.now() });
    this.#setResponding(assetId, true);
    try {
      await Promise.resolve();
      const engine = this.#engines.get(assetId)?.engine;
      const retrieved = engine ? engine.search(content) : [];
      this.#append(assetId, this.#composeAnswer(retrieved));
    } finally {
      this.#setResponding(assetId, false);
    }
  }

  resetSession(assetId: string): void {
    this.#sessions = this.#omit(this.#sessions, assetId);
    this.#responding = this.#omit(this.#responding, assetId);
    this.#engines.delete(assetId);
  }

  clear(): void {
    this.#sessions = {};
    this.#responding = {};
    this.#engines.clear();
  }

  #composeAnswer(retrieved: RetrievedSegment[]): ChatMessage {
    if (retrieved.length === 0) {
      return {
        id: generateId(),
        role: 'assistant',
        content: get(t)('rag_chat_no_match'),
        timestamp: Date.now(),
        citations: [],
      };
    }

    const top = retrieved[0];
    const time = formatTimestamp(top.start);
    const prefix = get(t)('rag_chat_answer_prefix', { values: { time } });
    return {
      id: generateId(),
      role: 'assistant',
      content: `${prefix} “${top.text}”`,
      timestamp: Date.now(),
      citations: toCitations(retrieved),
    };
  }

  #append(assetId: string, message: ChatMessage): void {
    const existing = this.#sessions[assetId];
    const messages = existing ? [...existing.messages, message] : [message];
    this.#sessions = { ...this.#sessions, [assetId]: { assetId, messages } };
  }

  #setResponding(assetId: string, value: boolean): void {
    this.#responding = { ...this.#responding, [assetId]: value };
  }

  #omit<T>(record: Record<string, T>, key: string): Record<string, T> {
    const next = { ...record };
    delete next[key];
    return next;
  }
}

export const ragChatManager = new RagChatManager();
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run (workdir `web`): `pnpm exec vitest run src/lib/stores/rag-chat.svelte.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gates locales del archivo**

Run (workdir `web`):
`pnpm run check:typescript` → exit 0
`pnpm run lint` → exit 0
`pnpm exec prettier --write src/lib/stores/rag-chat.svelte.ts src/lib/stores/rag-chat.svelte.spec.ts` → sin pendientes

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/stores/rag-chat.svelte.ts web/src/lib/stores/rag-chat.svelte.spec.ts
git commit -m "feat(web): add rag chat session store"
```

---

## Task 3: Panel de chat + i18n

**Files:**
- Create: `web/src/lib/components/asset-viewer/RagChatPanel.svelte`
- Test: `web/src/lib/components/asset-viewer/RagChatPanel.spec.ts`
- Modify: `immich-main/i18n/en.json`, `immich-main/i18n/es.json`

**Interfaces:**
- Consumes: `ragChatManager` (Task 2), `transcriptManager.transcript` (`TranscriptionResponseDto | null` con `.segments`), `formatTimestamp` (Task 1), `$t`.
- Produces: componente `RagChatPanel` con props `{ assetId: string; currentTime: number; onSeek: (time: number) => void }` y testids `rag-chat`, `rag-chat-empty`, `rag-chat-list`, `rag-chat-message`, `rag-chat-thinking`, `rag-chat-input`, `rag-chat-send`, `rag-chat-sources`, `rag-chat-citation`.

- [ ] **Step 1: Añadir las claves i18n (en y es, orden alfabético)**

**Ubicación exacta:** en `en.json` insertar `smart_class_chat_title` inmediatamente **antes** de `smart_class_flashcards_title` (línea 2113) y actualizar el valor de `smart_class_notes_viewer_tabs` (línea 2114) in-place. En `es.json` igual: `smart_class_chat_title` antes de `smart_class_flashcards_title` (línea 2090) y `smart_class_notes_viewer_tabs` (línea 2091) in-place. Las claves `rag_chat_*` van en la posición alfabética `rag` (tras la última clave `q...` y antes de la primera `re...`, p.ej. `recent`/`retry`); buscar con `grep` la fila donde insertarlas, sin reordenar el resto del archivo.

En `immich-main/i18n/en.json` insertar y actualizar `smart_class_notes_viewer_tabs`:

```json
"rag_chat_answer_prefix": "The transcript says at {time}:",
"rag_chat_assistant": "Assistant",
"rag_chat_empty": "Ask anything about this material.",
"rag_chat_input_label": "Your question",
"rag_chat_no_match": "I couldn't find that in this material's transcript.",
"rag_chat_placeholder": "Type your question...",
"rag_chat_send": "Send",
"rag_chat_sources": "Sources",
"rag_chat_thinking": "Searching the transcript...",
"rag_chat_you": "You",
"smart_class_chat_title": "Chat",
"smart_class_notes_viewer_tabs": "Transcript, summary, flashcards and chat viewer tabs",
```

En `immich-main/i18n/es.json` insertar y actualizar de forma equivalente:

```json
"rag_chat_answer_prefix": "En {time} se menciona:",
"rag_chat_assistant": "Asistente",
"rag_chat_empty": "Pregunta lo que quieras sobre este material.",
"rag_chat_input_label": "Tu pregunta",
"rag_chat_no_match": "No encuentro eso en la transcripción de este material.",
"rag_chat_placeholder": "Escribe tu pregunta...",
"rag_chat_send": "Enviar",
"rag_chat_sources": "Fuentes",
"rag_chat_thinking": "Buscando en la transcripción...",
"rag_chat_you": "Tú",
"smart_class_chat_title": "Chat",
"smart_class_notes_viewer_tabs": "Pestañas del visor de transcripción, resumen, tarjetas y chat",
```

- [ ] **Step 2: Escribir el test que falla**

Crear `web/src/lib/components/asset-viewer/RagChatPanel.spec.ts`:

```ts
import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatMessage } from '$lib/types/transcript';
import { ragChatManager } from '$lib/stores/rag-chat.svelte';
import RagChatPanel from './RagChatPanel.svelte';

type ManagerState = {
  messages: ChatMessage[];
  responding: boolean;
  transcript: { segments: { start: number; end: number; text: string }[] } | null;
};

const defaultManager: ManagerState = { messages: [], responding: false, transcript: null };
const factory: { manager: ManagerState } = { manager: { ...defaultManager } };

vi.mock(import('$lib/stores/rag-chat.svelte'), () => ({
  ragChatManager: {
    getMessages: vi.fn(() => factory.manager.messages),
    isResponding: vi.fn(() => factory.manager.responding),
    ensureEngine: vi.fn(),
    ask: vi.fn(),
  } as never,
}));

vi.mock(import('$lib/stores/transcript.svelte'), () => ({
  transcriptManager: {
    get transcript() {
      return factory.manager.transcript;
    },
  } as never,
}));

const renderPanel = (currentTime = 0, onSeek = vi.fn()) =>
  render(RagChatPanel, { assetId: 'asset-1', currentTime, onSeek });

describe('RagChatPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    factory.manager = { ...defaultManager };
  });

  afterEach(() => {
    factory.manager = { ...defaultManager };
    vi.clearAllMocks();
  });

  it('muestra el estado vacío sin mensajes', () => {
    const { getByTestId } = renderPanel();
    expect(getByTestId('rag-chat-empty')).toHaveTextContent('rag_chat_empty');
  });

  it('deshabilita el botón enviar con el input vacío', () => {
    const { getByTestId } = renderPanel();
    expect(getByTestId('rag-chat-send')).toHaveProperty('disabled', true);
  });

  it('envía la pregunta con Enter y limpia el input', async () => {
    const { getByTestId } = renderPanel();
    const input = getByTestId('rag-chat-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'fotosíntesis' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(vi.mocked(ragChatManager.ask)).toHaveBeenCalledWith('asset-1', 'fotosíntesis');
    expect(input.value).toBe('');
  });

  it('envía la pregunta al pulsar el botón', async () => {
    const { getByTestId } = renderPanel();
    const input = getByTestId('rag-chat-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'golgi' } });
    await fireEvent.click(getByTestId('rag-chat-send'));
    expect(vi.mocked(ragChatManager.ask)).toHaveBeenCalledWith('asset-1', 'golgi');
  });

  it('muestra el indicador mientras responde', () => {
    factory.manager = { ...defaultManager, responding: true };
    const { getByTestId } = renderPanel();
    expect(getByTestId('rag-chat-thinking')).toBeInTheDocument();
  });

  it('renderiza las citas y hace seek al pulsarlas', async () => {
    factory.manager = {
      ...defaultManager,
      messages: [
        { id: 'm1', role: 'user', content: 'fotosíntesis', timestamp: 0 },
        {
          id: 'm2',
          role: 'assistant',
          content: 'x',
          timestamp: 1,
          citations: [{ timestampStart: 12, timestampEnd: 20, textSnippet: 'snippet' }],
        },
      ],
    };
    const onSeek = vi.fn();
    const { getByTestId } = renderPanel(15, onSeek);
    const citation = getByTestId('rag-chat-citation');
    expect(citation).toHaveTextContent('[00:12]');
    expect(citation).toHaveAttribute('data-active', 'true');
    await fireEvent.click(citation);
    expect(onSeek).toHaveBeenCalledWith(12);
  });

  it('marca una cita como inactiva fuera de su rango', () => {
    factory.manager = {
      ...defaultManager,
      messages: [
        {
          id: 'm2',
          role: 'assistant',
          content: 'x',
          timestamp: 1,
          citations: [{ timestampStart: 12, timestampEnd: 20, textSnippet: 'snippet' }],
        },
      ],
    };
    const { getByTestId } = renderPanel(25);
    expect(getByTestId('rag-chat-citation')).not.toHaveAttribute('data-active');
  });

  it('limita el input a 500 caracteres', () => {
    const { getByTestId } = renderPanel();
    expect(getByTestId('rag-chat-input')).toHaveAttribute('maxlength', '500');
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run (workdir `web`): `pnpm exec vitest run src/lib/components/asset-viewer/RagChatPanel.spec.ts`
Expected: FAIL — `Cannot find module './RagChatPanel.svelte'`.

- [ ] **Step 4: Implementar el panel**

Crear `web/src/lib/components/asset-viewer/RagChatPanel.svelte` (confirmar el import de `t` comparando con `FlashcardPanel.svelte`, que usa `import { t } from 'svelte-i18n';`):

```svelte
<script lang="ts">
  import { t } from 'svelte-i18n';
  import { ragChatManager } from '$lib/stores/rag-chat.svelte';
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import { formatTimestamp } from '$lib/utils/transcript-rag';

  let {
    assetId,
    currentTime,
    onSeek,
  }: {
    assetId: string;
    currentTime: number;
    onSeek: (time: number) => void;
  } = $props();

  let input = $state('');
  let listElement: HTMLDivElement | undefined = $state();

  let messages = $derived(ragChatManager.getMessages(assetId));
  let responding = $derived(ragChatManager.isResponding(assetId));
  let transcript = $derived(transcriptManager.transcript);

  $effect(() => {
    if (transcript) {
      ragChatManager.ensureEngine(assetId, transcript.segments);
    }
  });

  $effect(() => {
    if (listElement && messages.length > 0) {
      listElement.scrollIntoView({ block: 'end' });
    }
  });

  const submit = () => {
    const question = input.trim();
    if (question.length === 0 || responding) {
      return;
    }
    void ragChatManager.ask(assetId, question);
    input = '';
  };

  const isActive = (start: number, end: number) => start <= currentTime && currentTime < end;
</script>

<div class="flex flex-col gap-2" data-testid="rag-chat">
  {#if messages.length === 0}
    <p class="text-sm text-immich-gray" data-testid="rag-chat-empty">{$t('rag_chat_empty')}</p>
  {/if}

  {#if messages.length > 0}
    <div
      class="flex flex-col gap-2"
      role="log"
      aria-live="polite"
      data-testid="rag-chat-list"
      bind:this={listElement}
    >
      {#each messages as message (message.id)}
        <div class="flex flex-col gap-1" data-testid="rag-chat-message" data-role={message.role}>
          <span class="text-xs font-semibold text-immich-gray">
            {message.role === 'user' ? $t('rag_chat_you') : $t('rag_chat_assistant')}
          </span>
          <p class="text-sm whitespace-pre-wrap">{message.content}</p>
          {#if message.citations && message.citations.length > 0}
            <div class="flex flex-wrap items-center gap-1" data-testid="rag-chat-sources">
              <span class="text-xs text-immich-gray">{$t('rag_chat_sources')}</span>
              {#each message.citations as citation, index (index)}
                <button
                  type="button"
                  class="rounded bg-immich-gray/20 px-2 py-0.5 text-xs hover:bg-immich-primary/20"
                  data-testid="rag-chat-citation"
                  data-active={isActive(citation.timestampStart, citation.timestampEnd) ? 'true' : undefined}
                  title={citation.textSnippet}
                  onclick={() => onSeek(citation.timestampStart)}
                >
                  [{formatTimestamp(citation.timestampStart)}]
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if responding}
    <p class="text-sm text-immich-gray" data-testid="rag-chat-thinking">{$t('rag_chat_thinking')}</p>
  {/if}

  <div class="flex items-center gap-2">
    <input
      class="flex-1 rounded border border-immich-gray/30 bg-immich-bg px-2 py-1 text-sm"
      data-testid="rag-chat-input"
      type="text"
      maxlength={500}
      disabled={responding}
      bind:value={input}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      }}
      aria-label={$t('rag_chat_input_label')}
      placeholder={$t('rag_chat_placeholder')}
    />
    <button
      type="button"
      class="rounded bg-immich-primary px-3 py-1 text-sm text-white disabled:opacity-50"
      data-testid="rag-chat-send"
      disabled={responding || input.trim().length === 0}
      onclick={submit}
    >
      {$t('rag_chat_send')}
    </button>
  </div>
</div>
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run (workdir `web`): `pnpm exec vitest run src/lib/components/asset-viewer/RagChatPanel.spec.ts`
Expected: PASS.

- [ ] **Step 6: Gates locales**

Run (workdir `web`):
`pnpm run lint:fix` → arregla orden de clases Tailwind/reglas unicorn
`pnpm exec prettier --write src/lib/components/asset-viewer/RagChatPanel.svelte src/lib/components/asset-viewer/RagChatPanel.spec.ts`
`pnpm run check:svelte` → exit 0
`pnpm run check:typescript` → exit 0
`pnpm run lint` → exit 0

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/components/asset-viewer/RagChatPanel.svelte web/src/lib/components/asset-viewer/RagChatPanel.spec.ts i18n/en.json i18n/es.json
git commit -m "feat(web): add in-context rag chat panel"
```

---

## Task 4: Integración del 4.º tab en `TranscriptPanel`

**Files:**
- Modify: `web/src/lib/stores/transcript.svelte.ts`
- Modify: `web/src/lib/stores/transcript.svelte.spec.ts`
- Modify: `web/src/lib/components/asset-viewer/TranscriptPanel.svelte`
- Modify: `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`

**Interfaces:**
- Consumes: `ragChatManager` (Task 2), `RagChatPanel` (Task 3), `smart_class_chat_title` (Task 3).
- Produces: `transcriptManager.setActiveTab` acepta `'chat'`; `TranscriptPanel` renderiza `RagChatPanel` en el 4.º tab.

- [ ] **Step 1: Escribir los tests que fallan**

En `web/src/lib/stores/transcript.svelte.spec.ts`, dentro del bloque de tests existente, añadir:

```ts
  it('switches to the chat tab', () => {
    transcriptManager.setActiveTab('chat');
    expect(transcriptManager.activeTab).toBe('chat');
  });
```

En `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`, modificar lo existente y añadir lo nuevo:
1. Ampliar el tipo local `ManagerState.activeTab` (línea 12) a `'transcript' | 'summary' | 'flashcards' | 'chat'`.
2. Ampliar la firma del mock `setActiveTab` (línea 55) a `(tab: 'transcript' | 'summary' | 'flashcards' | 'chat')`.
3. **Actualizar las aserciones de nº de tabs de 3 a 4** (el 4.º tab ahora existe):
   - Test `'shows the tabs with the transcript tab selected when there is a transcript'` (líneas 151-164): cambiar `expect(radios).toHaveLength(3)` → `toHaveLength(4)` y añadir `expect(radios[3].checked).toBe(false);`.
   - Test `'renders three tabs and selects flashcards when clicked'` (líneas 270-282): renombrar a `'renders four tabs and selects flashcards when clicked'`, cambiar `expect(radios).toHaveLength(3)` → `toHaveLength(4)` (el índice `radios[2]` sigue siendo flashcards).
   - No tocar el test `it.each(['loading','empty','error'])` (sigue habiendo 0 radios sin transcripción).
4. Añadir el mock del store de chat (junto a los otros `vi.mock`):

```ts
vi.mock(import('$lib/stores/rag-chat.svelte'), () => ({
  ragChatManager: {
    getMessages: () => [],
    isResponding: () => false,
    ensureEngine: vi.fn(),
    ask: vi.fn(),
  } as never,
}));
```

5. Añadir el test del 4.º tab:

```ts
  it('renders the chat panel and sets the region aria-label when the chat tab is active', () => {
    factory.manager = {
      ...defaultManager,
      status: 'success',
      transcript,
      activeTab: 'chat',
    };
    const { getByTestId, getByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });
    expect(getByTestId('rag-chat-empty')).toBeInTheDocument();
    expect(getByRole('region')).toHaveAttribute('aria-label', 'smart_class_chat_title');
  });
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run (workdir `web`):
`pnpm exec vitest run src/lib/stores/transcript.svelte.spec.ts src/lib/components/asset-viewer/TranscriptPanel.spec.ts`
Expected: FAIL — `activeTab`/`setActiveTab` no aceptan `'chat'`; no existe `rag-chat-empty`; el aria-label esperado no aparece.

- [ ] **Step 3: Ampliar la unión de `transcriptManager`**

En `web/src/lib/stores/transcript.svelte.ts`:
- Línea ~20: `#activeTab = $state<'transcript' | 'summary' | 'flashcards' | 'chat'>('transcript');`
- Línea ~76: `setActiveTab(tab: 'transcript' | 'summary' | 'flashcards' | 'chat') {`

- [ ] **Step 4: Integrar el 4.º tab en `TranscriptPanel.svelte`**

Añadir el import (junto a los demás componentes):

```ts
  import RagChatPanel from '$lib/components/asset-viewer/RagChatPanel.svelte';
```

Añadir un mapa de labels de tab (tras la declaración de `activeTab`):

```ts
  const TAB_LABEL_KEYS = {
    transcript: 'transcript_title',
    summary: 'smart_class_summary_title',
    flashcards: 'smart_class_flashcards_title',
    chat: 'smart_class_chat_title',
  } as const;
```

Sustituir el ternario del `aria-label` del `<div role="region">` por:

```svelte
  aria-label={$t(TAB_LABEL_KEYS[activeTab])}
```

Actualizar `GroupTab`:

```svelte
        <GroupTab
          filters={['transcript', 'summary', 'flashcards', 'chat']}
          labels={[
            $t('transcript_title'),
            $t('smart_class_summary_title'),
            $t('smart_class_flashcards_title'),
            $t('smart_class_chat_title'),
          ]}
          selected={activeTab}
          label={$t('smart_class_notes_viewer_tabs')}
          loading={isGeneratingSummary}
          onSelect={(tab) => transcriptManager.setActiveTab(tab as 'transcript' | 'summary' | 'flashcards' | 'chat')}
        />
```

Añadir la rama, **después** de la rama `{:else if activeTab === 'flashcards'}` y **antes** de `{:else if transcript}`:

```svelte
    {:else if activeTab === 'chat'}
      <RagChatPanel {assetId} {currentTime} {onSeek} />
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run (workdir `web`):
`pnpm exec vitest run src/lib/stores/transcript.svelte.spec.ts src/lib/components/asset-viewer/TranscriptPanel.spec.ts`
Expected: PASS.

- [ ] **Step 6: Gates locales**

Run (workdir `web`):
`pnpm run lint:fix`
`pnpm exec prettier --write src/lib/stores/transcript.svelte.ts src/lib/stores/transcript.svelte.spec.ts src/lib/components/asset-viewer/TranscriptPanel.svelte src/lib/components/asset-viewer/TranscriptPanel.spec.ts`
`pnpm run check:svelte` → exit 0
`pnpm run check:typescript` → exit 0
`pnpm run lint` → exit 0

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/stores/transcript.svelte.ts web/src/lib/stores/transcript.svelte.spec.ts web/src/lib/components/asset-viewer/TranscriptPanel.svelte web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts
git commit -m "feat(web): wire in-context chat tab into transcript panel"
```

---

## Task 5: Verificación de regresión completa

**Files:** ninguno (solo verificación; no commit salvo que haya que arreglar algo).

- [ ] **Step 1: Suite de tests afectada + relacionados**

Run (workdir `web`):
`pnpm exec vitest run src/lib/utils/transcript-rag.spec.ts src/lib/stores/rag-chat.svelte.spec.ts src/lib/components/asset-viewer/RagChatPanel.spec.ts src/lib/components/asset-viewer/TranscriptPanel.spec.ts src/lib/stores/transcript.svelte.spec.ts src/lib/utils/transcript-flashcards.spec.ts src/lib/components/asset-viewer/FlashcardPanel.spec.ts`
Expected: PASS (todo).

- [ ] **Step 2: Suite completa del frontend**

Run (workdir `web`): `pnpm exec vitest run`
Expected: PASS (sin regresiones).

- [ ] **Step 3: Gates finales**

Run (workdir `web`):
`pnpm run check:typescript` → exit 0
`pnpm run check:svelte` → exit 0
`pnpm run lint` → exit 0
`pnpm exec prettier --cache --check .` → exit 0

- [ ] **Step 4: Verificar que `docs/superpowers/**` sigue sin stage**

Run (workdir repo raíz): `git status --short`
Expected: no aparecen `docs/superpowers/**` entre los archivos staged; spec/plan untracked.

- [ ] **Step 5: (Solo si hubo fixes) Commit**

Si algún gate requirió cambios, commitear únicamente esos archivos:

```bash
git add <archivos-modificados>
git commit -m "fix(web): satisfy lint and type checks for rag chat"
```

Si no hubo cambios, no hay commit (no crear commits vacíos).

---

## Self-Review

**Cobertura de la spec:**
- §4 tipos `Chat*` → Task 1 Step 1. ✔
- §5 motor (`tokenize`, IDF, blend, topK/minScore, `formatTimestamp`, `toCitations`, `createRagEngine`) → Task 1. ✔
- §6 store (`ensureEngine`, `getMessages`, `isResponding`, `ask`, `resetSession`, `clear`, composición i18n, anti-alucinación, aislamiento) → Task 2. ✔
- §7 panel (props, estado vacío, lista, thinking, citas clicables + `data-active`, compositor, testids, autoscroll) → Task 3. ✔
- §8 integración (`activeTab` union, `GroupTab` 4 filtros, rama, aria-label) → Task 4. ✔
- §9 i18n (11 claves + `smart_class_notes_viewer_tabs`) → Task 3 Step 1. ✔
- §10 testing (motor, store, panel, TranscriptPanel) → Tasks 1–4. ✔
- §11 gates → incluidos por task + Task 5. ✔
- §12 archivos afectados → reflejados en File Structure. ✔
- §16 protocolo de cierre (commit atómico, no `docs/superpowers`, no push) → Global Constraints + Tasks. ✔

**Placeholder scan:** sin TODO/TBD/"similar to Task N"; todo el código está completo.

**Consistencia de tipos/nombres:** `TranscriptSegment`/`RetrievedSegment`/`RagEngine`/`formatTimestamp`/`toCitations`/`createRagEngine` definidos en Task 1 y usados con la misma firma en Tasks 2–3; `ragChatManager` métodos idénticos entre Task 2 (definición), Task 3 y Task 4 (mock y uso); `ChatCitation`/`ChatMessage`/`ChatSession` consistentes; testids idénticos entre panel (Task 3) y spec de integración (Task 4).

**Verificación contra código real (hecha):**
- `transcript.svelte.ts:20` y `:76` son exactamente las dos líneas a ampliar; `get transcript()`/`get activeTab()` existen (líneas 33-43).
- `TranscriptPanel.svelte`: `role="region"` + `aria-label` ternario en 80-85; `GroupTab` en 99-106; ramas `summary`/`flashcards`/`else transcript` en 116/124/126 (la rama `chat` se inserta en 125/126).
- `TranscriptPanel.spec.ts`: `ManagerState.activeTab` en línea 12; mock `setActiveTab` en 55; **dos** asserts `toHaveLength(3)` en líneas 160 y 279 → se corrigen a 4 en Task 4 Step 1.
- `FlashcardPanel.svelte:4` importa `import { t } from 'svelte-i18n';` y usa `$t` (patrón confirmado para `RagChatPanel`).
- `GroupTab.svelte`: `label` se renderiza como `<legend class="sr-only">`, no como aria-label → el assert de región es sobre el div externo (correcto).
- `generate-id.ts`: `generateId = () => \`id-${_count++}\`` (confirmado).
- i18n: `smart_class_flashcards_title`/`smart_class_notes_viewer_tabs`/`smart_class_summary_title` en `en.json` 2113-2115 y `es.json` 2090-2092 (puntos de inserción confirmados; el valor es actualizado en Step 1).
- jsdom no implementa `scrollIntoView` → `RagChatPanel.spec.ts` lo stubbea en `beforeEach` (añadido).
