import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { transcriptManager } from '$lib/stores/transcript.svelte';
import type { FlashcardDeck, FlashcardGrade, SummaryData } from '$lib/types/transcript';
import { downloadFlashcardDeckCsv, exportFlashcardDeckToCsv } from '$lib/utils/transcript-flashcards';
import FlashcardPanel from './FlashcardPanel.svelte';

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

  it('flips to reveal the back', async () => {
    factory.manager = { ...defaultManager, flashcardDeck: deck };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-toggle'));
    expect(getByTestId('flashcard-back')).toHaveTextContent('Definición A');
  });

  it('shows the self-check hint on question cards', async () => {
    factory.manager = { ...defaultManager, flashcardDeck: deck, flashcardIndex: 2 };
    const { getByTestId } = renderPanel();
    await fireEvent.click(getByTestId('flashcard-toggle'));
    expect(getByTestId('flashcard-back')).toHaveTextContent('flashcards_self_check');
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
