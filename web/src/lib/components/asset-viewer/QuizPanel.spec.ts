import { render, screen, fireEvent } from '@testing-library/svelte';
import { beforeEach, vi, describe, expect, it } from 'vitest';
import QuizPanel from './QuizPanel.svelte';
import { quizManager } from '$lib/stores/quiz.svelte';
import { transcriptManager } from '$lib/stores/transcript.svelte';

vi.mock('$lib/stores/transcript.svelte', () => ({
  transcriptManager: {
    summaryData: {
      executiveSummary: 'Test summary',
      keyConcepts: [{ term: 'Test', definition: 'Test definition' }],
      reviewQuestions: [],
    },
    originalFileName: 'test.mp3',
    isGeneratingSummary: false,
    flashcardDeck: null,
    flashcardGrades: {},
    flashcardIndex: 0,
    activeTab: 'summary',
    status: 'success',
    loading: false,
    clear: vi.fn(),
    loadAssetSummary: vi.fn(),
    setActiveTab: vi.fn(),
    gradeFlashcard: vi.fn(),
    setFlashcardIndex: vi.fn(),
    resetFlashcards: vi.fn(),
    getAssetTranscript: vi.fn(),
    generateId: () => 'test-id',
  },
}));

describe('QuizPanel component', () => {
  beforeEach(() => {
    quizManager.clear();
  });

  it('shows empty state when no session exists and no summary', async () => {
    (transcriptManager as any).summaryData = null;
    
    render(QuizPanel, { props: { assetId: 'test-asset', onRetry: () => {} } });
    
    expect(screen.getByTestId('quiz-empty')).toBeInTheDocument();
    expect(screen.getByText('summary_export_description')).toBeInTheDocument();
  });

  it('shows start button when session not started and summary exists', async () => {
    (transcriptManager as any).summaryData = {
      executiveSummary: 'Test',
      keyConcepts: [{ term: 'T', definition: 'D' }],
      reviewQuestions: [],
    };
    
    render(QuizPanel, { props: { assetId: 'test-asset', onRetry: () => {} } });
    
    expect(screen.getByTestId('quiz-start')).toBeInTheDocument();
  });

  it('starts quiz on start click', async () => {
    (transcriptManager as any).summaryData = {
      executiveSummary: 'Test',
      keyConcepts: [{ term: 'T', definition: 'D' }],
      reviewQuestions: [],
    };
    
    render(QuizPanel, { props: { assetId: 'test-asset', onRetry: () => {} } });
    
    await fireEvent.click(screen.getByTestId('quiz-start'));
    
    const session = quizManager.getSession('test-asset');
    expect(session.questions.length).toBe(1);
  });

  it('shows question view after starting quiz', async () => {
    (transcriptManager as any).summaryData = {
      executiveSummary: 'Test',
      keyConcepts: [{ term: 'T', definition: 'D' }],
      reviewQuestions: [],
    };
    
    render(QuizPanel, { props: { assetId: 'test-asset', onRetry: () => {} } });
    
    await fireEvent.click(screen.getByTestId('quiz-start'));
    
    await new Promise(r => setTimeout(r, 10));
    
    expect(screen.getByTestId('quiz-question')).toBeInTheDocument();
  });

  it('shows result view after submitting', async () => {
    quizManager.startQuiz('test-asset', {
      executiveSummary: 'Test',
      keyConcepts: [{ term: 'T', definition: 'D' }],
      reviewQuestions: [],
    });
    
    render(QuizPanel, { props: { assetId: 'test-asset', onRetry: () => {} } });
    
    await fireEvent.click(screen.getByTestId('quiz-submit'));
    
    await new Promise(r => setTimeout(r, 10));
    
    expect(screen.getByTestId('quiz-result')).toBeInTheDocument();
  });

  it('shows retry button in result view', async () => {
    quizManager.startQuiz('test-asset', {
      executiveSummary: 'Test',
      keyConcepts: [{ term: 'T', definition: 'D' }],
      reviewQuestions: [],
    });
    
    render(QuizPanel, { props: { assetId: 'test-asset', onRetry: () => {} } });
    
    await fireEvent.click(screen.getByTestId('quiz-submit'));
    
    await new Promise(r => setTimeout(r, 10));
    
    expect(screen.getByTestId('quiz-retry')).toBeInTheDocument();
  });
});