import { describe, expect, it, vi } from 'vitest';
import type { FlashcardDeck, SummaryData } from '$lib/types/transcript';
import { downloadBlob } from '$lib/utils';
import {
  buildFlashcardDeck,
  downloadFlashcardDeckCsv,
  exportFlashcardDeckToCsv,
} from '$lib/utils/transcript-flashcards';

vi.mock(import('$lib/utils'), () => ({
  downloadBlob: vi.fn(),
}));

const fullSummary: SummaryData = {
  executiveSummary: 'Resumen.',
  keyConcepts: [
    { term: 'Concepto central', definition: 'Definición derivada de la transcripción del asset.' },
    { term: 'Idea secundaria', definition: 'Definición contextual asociada al asset.' },
  ],
  reviewQuestions: ['¿Cuál es la idea principal de este material?'],
};

describe('buildFlashcardDeck', () => {
  it('builds concept cards with terms and definitions', () => {
    const deck = buildFlashcardDeck(fullSummary);
    const concept = deck.cards[0];
    expect(concept.id).toBe('concept-0');
    expect(concept.front).toBe('Concepto central');
    expect(concept.back).toBe('Definición derivada de la transcripción del asset.');
    expect(concept.source).toBe('concept');
    expect(concept.difficulty).toBeUndefined();
  });

  it('builds question cards with an empty back', () => {
    const deck = buildFlashcardDeck(fullSummary);
    const question = deck.cards[2];
    expect(question.id).toBe('question-0');
    expect(question.front).toBe('¿Cuál es la idea principal de este material?');
    expect(question.back).toBe('');
    expect(question.source).toBe('question');
    expect(question.difficulty).toBeUndefined();
  });

  it('orders all concepts before all questions', () => {
    const deck = buildFlashcardDeck(fullSummary);
    expect(deck.cards.map((card) => card.source)).toEqual(['concept', 'concept', 'question']);
  });

  it('uses sequential deterministic ids per source', () => {
    const deck = buildFlashcardDeck(fullSummary);
    expect(deck.cards.map((card) => card.id)).toEqual(['concept-0', 'concept-1', 'question-0']);
  });

  it('sets the title from the trimmed asset name', () => {
    expect(buildFlashcardDeck(fullSummary, '  Clase 01  ').title).toBe('Clase 01');
    expect(buildFlashcardDeck(fullSummary, '').title).toBe('');
    expect(buildFlashcardDeck(fullSummary, undefined).title).toBe('');
  });

  it('derives a deterministic slugged deck id from the asset name', () => {
    expect(buildFlashcardDeck(fullSummary, 'Clase 01').id).toBe('flashcards-clase-01');
    expect(buildFlashcardDeck(fullSummary, ' Mi Clase! 01 ').id).toBe('flashcards-mi-clase-01');
    expect(buildFlashcardDeck(fullSummary, undefined).id).toBe('flashcards-deck');
  });

  it('produces zero cards of a source when its array is empty', () => {
    const deck = buildFlashcardDeck({ executiveSummary: '', keyConcepts: [], reviewQuestions: ['Q'] });
    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0].source).toBe('question');
  });

  it('produces an empty deck for an empty summary', () => {
    const deck = buildFlashcardDeck({ executiveSummary: '', keyConcepts: [], reviewQuestions: [] });
    expect(deck.cards).toEqual([]);
  });

  it('does not mutate the input summary', () => {
    const input: SummaryData = structuredClone(fullSummary);
    buildFlashcardDeck(input, 'Clase 01');
    expect(input).toEqual(fullSummary);
  });
});

const expectedCsv =
  [
    'Front,Back,Tags',
    '"Concepto central","Definición derivada de la transcripción del asset.","smart-class-notes concept known"',
    '"Idea secundaria","Definición contextual asociada al asset.","smart-class-notes concept again"',
    '"¿Cuál es la idea principal de este material?","","smart-class-notes question"',
  ].join('\n') + '\n';

describe('exportFlashcardDeckToCsv', () => {
  it('writes the exact fixed header', () => {
    const csv = exportFlashcardDeckToCsv(buildFlashcardDeck(fullSummary));
    expect(csv.split('\n', 1)[0]).toBe('Front,Back,Tags');
  });

  it('writes one line per card with every field double-quoted', () => {
    const csv = exportFlashcardDeckToCsv(buildFlashcardDeck(fullSummary));
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^".*","(.*)","(.*)"$/);
  });

  it('escapes inner double quotes and tolerates commas and newlines', () => {
    const deck: FlashcardDeck = {
      id: 'flashcards-test',
      title: 'Test',
      cards: [{ id: 'concept-0', front: 'He said "hi"', back: 'line1\nline2', source: 'concept' }],
    };
    const csv = exportFlashcardDeckToCsv(deck);
    expect(csv).toContain('"He said ""hi""","line1\nline2","smart-class-notes concept"');
  });

  it('computes tags: base source, plus result only when graded', () => {
    const deck = buildFlashcardDeck(fullSummary);
    expect(exportFlashcardDeckToCsv(deck)).toContain('"smart-class-notes question"');
    expect(exportFlashcardDeckToCsv(deck, { 'concept-0': 'known' })).toContain('"smart-class-notes concept known"');
    expect(exportFlashcardDeckToCsv(deck, { 'concept-1': 'again' })).toContain('"smart-class-notes concept again"');
  });

  it('matches the agreed example exactly', () => {
    const csv = exportFlashcardDeckToCsv(buildFlashcardDeck(fullSummary), {
      'concept-0': 'known',
      'concept-1': 'again',
    });
    expect(csv).toBe(expectedCsv);
  });

  it('returns only the header for an empty deck', () => {
    const csv = exportFlashcardDeckToCsv({ id: 'flashcards-test', title: '', cards: [] });
    expect(csv).toBe('Front,Back,Tags\n');
  });

  it('ends with a newline and does not mutate deck or grades', () => {
    const deck = buildFlashcardDeck(fullSummary);
    const grades = { 'concept-0': 'known' as const };
    const input: FlashcardDeck = structuredClone(deck);
    const csv = exportFlashcardDeckToCsv(deck, grades);
    expect(csv.endsWith('\n')).toBe(true);
    expect(deck).toEqual(input);
    expect(grades).toEqual({ 'concept-0': 'known' });
  });
});

describe('downloadFlashcardDeckCsv', () => {
  it('downloads the csv blob with the expected type and filename', async () => {
    const csv = 'Front,Back,Tags\n';
    downloadFlashcardDeckCsv(csv, 'asset-1');

    expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(await blob.text()).toBe(csv);
    expect(filename).toBe('flashcards-asset-1.csv');
  });
});
