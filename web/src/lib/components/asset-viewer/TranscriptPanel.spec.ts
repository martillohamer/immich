import type { TranscriptionResponseDto } from '@immich/sdk';
import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import TranscriptPanel from './TranscriptPanel.svelte';

type ManagerState = {
  status: 'loading' | 'empty' | 'error' | 'success';
  transcript: TranscriptionResponseDto | null;
};

const factory: { manager: ManagerState } = {
  manager: { status: 'loading', transcript: null },
};

vi.mock(import('$lib/stores/transcript.svelte'), () => ({
  transcriptManager: {
    get status() {
      return factory.manager.status;
    },
    get transcript() {
      return factory.manager.transcript;
    },
    getAssetTranscript: vi.fn(),
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

describe('TranscriptPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    factory.manager = { status: 'loading', transcript: null };
    vi.clearAllMocks();
  });

  it('renders segments and highlights the active one', () => {
    factory.manager = { status: 'success', transcript };

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
    factory.manager = { status: 'success', transcript };
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
    factory.manager = { status: 'empty', transcript: null };

    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });

    expect(getByTestId('transcript-empty')).toBeInTheDocument();
  });

  it('shows error testid when status is error', () => {
    factory.manager = { status: 'error', transcript: null };

    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });

    expect(getByTestId('transcript-error')).toBeInTheDocument();
  });
});
