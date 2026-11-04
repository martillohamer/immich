import { describe, expect, it, beforeEach } from 'vitest';
import { quizManager } from './quiz.svelte';
import type { SummaryData } from '../types/transcript';

describe('QuizManager', () => {
  const mockSummary: SummaryData = {
    executiveSummary: 'Test summary content',
    keyConcepts: [
      { term: 'Photosynthesis', definition: 'Process by which plants convert light to energy' },
      { term: 'Mitosis', definition: 'Cell division process' },
    ],
    reviewQuestions: ['What is the main function?'],
  };

  beforeEach(() => {
    quizManager.clear();
  });

  describe('getSession', () => {
    it('returns empty session for non-existent assetId', () => {
      const session = quizManager.getSession('new-asset');
      expect(session.assetId).toBe('new-asset');
      expect(session.questions).toEqual([]);
      expect(session.submitted).toBe(false);
    });
  });

  describe('startQuiz', () => {
    it('creates quiz from summary for the given assetId', () => {
      quizManager.startQuiz('test-asset-1', mockSummary);
      const session = quizManager.getSession('test-asset-1');

      expect(session.questions.length).toBeGreaterThan(0);
      expect(session.answers).toEqual({});
      expect(session.submitted).toBe(false);
    });

    it('associates quiz with assetId', () => {
      quizManager.startQuiz('asset-abc', mockSummary);
      const session = quizManager.getSession('asset-abc');

      expect(session.questions[0].id).toContain('asset-abc');
    });
  });

  describe('selectAnswer', () => {
    it('records selected answer for a question', () => {
      quizManager.startQuiz('test-asset', mockSummary);
      quizManager.selectAnswer('test-asset', 'test-asset-q0', 'b');

      const session = quizManager.getSession('test-asset');
      expect(session.answers['test-asset-q0']).toBe('b');
    });

    it('does not change answers after submission', () => {
      quizManager.startQuiz('test-asset', mockSummary);
      quizManager.selectAnswer('test-asset', 'test-asset-q0', 'a');
      quizManager.submitQuiz('test-asset');
      quizManager.selectAnswer('test-asset', 'test-asset-q0', 'b');

      const session = quizManager.getSession('test-asset');
      expect(session.answers['test-asset-q0']).toBe('a');
    });

    it('does not change answers for non-existent session', () => {
      expect(() => {
        quizManager.selectAnswer('unknown-asset', 'q1', 'a');
      }).not.toThrow();
    });
  });

  describe('submitQuiz', () => {
    it('calculates score based on correct answers', () => {
      quizManager.startQuiz('test-asset', mockSummary);
      const session = quizManager.getSession('test-asset');
      const questionsCount = session.questions.length;
      const firstQuestion = session.questions[0];

      if (questionsCount === 1) {
        quizManager.selectAnswer('test-asset', firstQuestion.id, firstQuestion.correctOptionId);
      } else {
        for (const q of session.questions) {
          quizManager.selectAnswer('test-asset', q.id, q.correctOptionId);
        }
      }
      quizManager.submitQuiz('test-asset');

      const submittedSession = quizManager.getSession('test-asset');
      expect(submittedSession.submitted).toBe(true);
      expect(submittedSession.score).toBe(100);
    });

    it('sets submitted flag', () => {
      quizManager.startQuiz('test-asset', mockSummary);
      quizManager.submitQuiz('test-asset');

      const session = quizManager.getSession('test-asset');
      expect(session.submitted).toBe(true);
    });
  });

  describe('resetQuiz', () => {
    it('removes session for the given assetId', () => {
      quizManager.startQuiz('test-asset', mockSummary);
      quizManager.resetQuiz('test-asset');

      const session = quizManager.getSession('test-asset');
      expect(session.questions).toEqual([]);
    });

    it('preserves other sessions', () => {
      quizManager.startQuiz('asset-1', mockSummary);
      quizManager.startQuiz('asset-2', mockSummary);
      quizManager.resetQuiz('asset-1');

      expect(quizManager.getSession('asset-1').questions).toEqual([]);
      expect(quizManager.getSession('asset-2').questions.length).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('clears all sessions', () => {
      quizManager.startQuiz('asset-1', mockSummary);
      quizManager.startQuiz('asset-2', mockSummary);
      quizManager.clear();

      expect(quizManager.getSession('asset-1').questions).toEqual([]);
      expect(quizManager.getSession('asset-2').questions).toEqual([]);
    });
  });

  describe('isSubmitted', () => {
    it('returns true when quiz is submitted', () => {
      quizManager.startQuiz('test-asset', mockSummary);
      expect(quizManager.isSubmitted('test-asset')).toBe(false);

      quizManager.submitQuiz('test-asset');
      expect(quizManager.isSubmitted('test-asset')).toBe(true);
    });

    it('returns false for non-existent session', () => {
      expect(quizManager.isSubmitted('unknown-asset')).toBe(false);
    });
  });

  describe('getScore', () => {
    it('returns the calculated score', () => {
      quizManager.startQuiz('test-asset', mockSummary);
      quizManager.submitQuiz('test-asset');

      expect(quizManager.getScore('test-asset')).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 for non-existent session', () => {
      expect(quizManager.getScore('unknown-asset')).toBe(0);
    });
  });
});