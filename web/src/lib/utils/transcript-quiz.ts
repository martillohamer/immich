import type { QuizQuestion, SummaryData } from '../types/transcript';

export function buildQuizFromSummary(
  summaryData: SummaryData,
  assetId: string,
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  let questionIndex = 0;

  for (const concept of summaryData.keyConcepts) {
    const options = [
      { id: 'a', text: concept.definition },
      { id: 'b', text: 'Incorrect definition for ' + concept.term },
      { id: 'c', text: 'Wrong explanation' },
      { id: 'd', text: 'Alternative wrong answer' },
    ];
    const correctOptionId = 'a';
    questions.push({
      id: `${assetId}-q${questionIndex}`,
      question: `What is the definition of ${concept.term}?`,
      options,
      correctOptionId,
      explanation: concept.definition,
      conceptTerm: concept.term,
    });
    questionIndex++;
  }

  for (const reviewQ of summaryData.reviewQuestions) {
    const options = [
      { id: 'a', text: reviewQ + ' answer A' },
      { id: 'b', text: reviewQ + ' answer B' },
      { id: 'c', text: reviewQ + ' answer C' },
      { id: 'd', text: reviewQ + ' answer D' },
    ];
    questions.push({
      id: `${assetId}-q${questionIndex}`,
      question: reviewQ,
      options,
      correctOptionId: 'b',
      explanation: `Based on: ${reviewQ}`,
    });
    questionIndex++;
  }

  return questions;
}

export function evaluateQuiz(
  questions: QuizQuestion[],
  answers: Record<string, string>,
): { score: number; total: number; percentage: number } {
  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctOptionId) {
      correct++;
    }
  }
  const total = questions.length;
  const percentage = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { score: correct, total, percentage };
}