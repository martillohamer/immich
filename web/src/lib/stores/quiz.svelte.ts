import { generateId } from '$lib/utils/generate-id';
import { buildQuizFromSummary, evaluateQuiz } from '$lib/utils/transcript-quiz';
import type { QuizSession, QuizQuestion, SummaryData } from '$lib/types/transcript';

const EMPTY_SESSION: QuizSession = {
  assetId: '',
  questions: [],
  answers: {},
  submitted: false,
  score: 0,
};

export class QuizManager {
  #sessions = $state<Record<string, QuizSession>>({});

  getSession(assetId: string): QuizSession {
    return this.#sessions[assetId] ?? {
      assetId,
      questions: [],
      answers: {},
      submitted: false,
      score: 0,
    };
  }

  startQuiz(assetId: string, summaryData: SummaryData): void {
    const questions = buildQuizFromSummary(summaryData, assetId);
    this.#sessions = { ...this.#sessions, [assetId]: { assetId, questions, answers: {}, submitted: false, score: 0 } };
  }

  selectAnswer(assetId: string, questionId: string, optionId: string): void {
    const session = this.#sessions[assetId];
    if (!session || session.submitted) return;

    const newAnswers = { ...session.answers, [questionId]: optionId };
    this.#sessions = { ...this.#sessions, [assetId]: { ...session, answers: newAnswers } };
  }

  submitQuiz(assetId: string): void {
    const session = this.#sessions[assetId];
    if (!session) return;

    const result = evaluateQuiz(session.questions, session.answers);
    this.#sessions = { ...this.#sessions, [assetId]: { ...session, submitted: true, score: result.percentage } };
  }

  isSubmitted(assetId: string): boolean {
    return this.#sessions[assetId]?.submitted ?? false;
  }

  getScore(assetId: string): number {
    return this.#sessions[assetId]?.score ?? 0;
  }

  resetQuiz(assetId: string): void {
    const next = { ...this.#sessions };
    delete next[assetId];
    this.#sessions = next;
  }

  clear(): void {
    this.#sessions = {};
  }
}

export const quizManager = new QuizManager();