import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ragChatManager } from '$lib/stores/rag-chat.svelte';
import type { ChatMessage } from '$lib/types/transcript';
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
