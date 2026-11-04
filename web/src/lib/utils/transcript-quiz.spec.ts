import { describe, expect, it } from 'vitest';
import { buildQuizFromSummary, evaluateQuiz } from './transcript-quiz';
import type { SummaryData } from '../types/transcript';

describe('buildQuizFromSummary', () => {
  const mockSummary: SummaryData = {
    executiveSummary: 'Test summary content',
    keyConcepts: [
      { term: 'Photosynthesis', definition: 'Process by which plants convert light to energy' },
      { term: 'Mitosis', definition: 'Cell division process that produces identical cells' },
    ],
    reviewQuestions: ['What is the main function of mitosis?', 'Explain cellular respiration.'],
  };

  it('generates questions from key concepts', () => {
    const quiz = buildQuizFromSummary(mockSummary, 'test-asset-1');
    const conceptQuestions = quiz.filter((q) => q.conceptTerm !== undefined);
    expect(conceptQuestions.length).toBeGreaterThan(0);
    expect(conceptQuestions[0].conceptTerm).toBe('Photosynthesis');
  });

  it('generates questions from review questions', () => {
    const quiz = buildQuizFromSummary(mockSummary, 'test-asset-1');
    const reviewQuestions = quiz.filter((q) => q.question.includes('mitosis') || q.question.includes('respiration'));
    expect(reviewQuestions.length).toBe(2);
  });

  it('includes correct option id in each question', () => {
    const quiz = buildQuizFromSummary(mockSummary, 'test-asset-1');
    quiz.forEach((q) => {
      expect(q.correctOptionId).toBeDefined();
      expect(q.options.map((o) => o.id)).toContain(q.correctOptionId);
    });
  });

  it('associates each question with the provided assetId', () => {
    const quiz = buildQuizFromSummary(mockSummary, 'asset-123');
    quiz.forEach((q) => {
      expect(q.id).toContain('asset-123');
    });
  });
});

describe('evaluateQuiz', () => {
  const quiz = [
    {
      id: 'q1',
      question: 'What is 2+2?',
      options: [
        { id: 'a', text: '3' },
        { id: 'b', text: '4' },
        { id: 'c', text: '5' },
        { id: 'd', text: '6' },
      ],
      correctOptionId: 'b',
      explanation: 'Basic math',
    },
    {
      id: 'q2',
      question: 'Capital of France?',
      options: [
        { id: 'a', text: 'London' },
        { id: 'b', text: 'Paris' },
        { id: 'c', text: 'Berlin' },
        { id: 'd', text: 'Madrid' },
      ],
      correctOptionId: 'b',
      explanation: 'Geographic fact',
    },
  ];

  it('calculates correct score for all correct answers', () => {
    const answers = { q1: 'b', q2: 'b' };
    const result = evaluateQuiz(quiz, answers);
    expect(result.total).toBe(2);
    expect(result.score).toBe(2);
    expect(result.percentage).toBe(100);
  });

  it('calculates incorrect score for wrong answers', () => {
    const answers = { q1: 'a', q2: 'c' };
    const result = evaluateQuiz(quiz, answers);
    expect(result.total).toBe(2);
    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('calculates partial score', () => {
    const answers = { q1: 'b', q2: 'a' };
    const result = evaluateQuiz(quiz, answers);
    expect(result.total).toBe(2);
    expect(result.score).toBe(1);
    expect(result.percentage).toBe(50);
  });

  it('handles missing answers as incorrect', () => {
    const answers = { q1: 'b' };
    const result = evaluateQuiz(quiz, answers);
    expect(result.total).toBe(2);
    expect(result.score).toBe(1);
  });
});