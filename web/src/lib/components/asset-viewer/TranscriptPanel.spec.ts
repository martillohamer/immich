import type { TranscriptionResponseDto } from '@immich/sdk';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { transcriptManager } from '$lib/stores/transcript.svelte';
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