import { t, type Translations } from 'svelte-i18n';
import { SvelteMap } from 'svelte/reactivity';
import { get } from 'svelte/store';
import type { ChatMessage, ChatSession } from '$lib/types/transcript';
import { generateId } from '$lib/utils/generate-id';
import { createRagEngine, formatTimestamp, toCitations } from '$lib/utils/transcript-rag';
import type { RagEngine, RetrievedSegment, TranscriptSegment } from '$lib/utils/transcript-rag';

const EMPTY_MESSAGES: ChatMessage[] = [];

export class RagChatManager {
  #sessions = $state<Record<string, ChatSession>>({});
  #responding = $state<Record<string, boolean>>({});
  #engines = new SvelteMap<string, { source: TranscriptSegment[]; engine: RagEngine }>();

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
        content: get(t)('rag_chat_no_match' as Translations),
        timestamp: Date.now(),
        citations: [],
      };
    }

    const top = retrieved[0];
    const time = formatTimestamp(top.start);
    const prefix = get(t)('rag_chat_answer_prefix' as Translations, { values: { time } });
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
