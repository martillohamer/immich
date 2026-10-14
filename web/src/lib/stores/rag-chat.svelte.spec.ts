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
    await ragChatManager.ask('asset-1', ' '.repeat(3));
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
