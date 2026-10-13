import type { Flashcard, FlashcardDeck, FlashcardGrade, SummaryData } from '$lib/types/transcript';
import { downloadBlob } from '$lib/utils';

const slug = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '') || 'deck';

export function buildFlashcardDeck(summaryData: SummaryData, assetName?: string): FlashcardDeck {
  const baseName = assetName?.trim() ?? '';
  const concepts: Flashcard[] = summaryData.keyConcepts.map(({ term, definition }, index) => ({
    id: `concept-${index}`,
    front: term,
    back: definition,
    source: 'concept',
  }));
  const questions: Flashcard[] = summaryData.reviewQuestions.map((question, index) => ({
    id: `question-${index}`,
    front: question,
    back: '',
    source: 'question',
  }));
  return {
    id: `flashcards-${slug(baseName)}`,
    title: baseName,
    cards: [...concepts, ...questions],
  };
}

const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function exportFlashcardDeckToCsv(
  deck: FlashcardDeck,
  grades?: Partial<Record<string, FlashcardGrade>>,
): string {
  const lines = ['Front,Back,Tags'];
  for (const card of deck.cards) {
    const tokens = ['smart-class-notes', card.source];
    const grade = grades?.[card.id];
    if (grade) {
      tokens.push(grade);
    }
    lines.push(`${escapeCsv(card.front)},${escapeCsv(card.back)},${escapeCsv(tokens.join(' '))}`);
  }
  return `${lines.join('\n')}\n`;
}

export function downloadFlashcardDeckCsv(csv: string, assetId: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `flashcards-${assetId}.csv`);
}
