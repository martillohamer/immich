import { describe, expect, it } from 'vitest';
import { createMockSummary } from '$lib/utils/transcript-summary';

describe('createMockSummary', () => {
  it('returns a summary whose content is derived from the asset id', () => {
    const summary = createMockSummary('asset-1');
    expect(summary.executiveSummary).toContain('asset-1');
  });

  it('returns key concepts with term and definition', () => {
    const summary = createMockSummary('asset-1');
    expect(summary.keyConcepts.length).toBeGreaterThan(0);
    for (const concept of summary.keyConcepts) {
      expect(concept.term.length).toBeGreaterThan(0);
      expect(concept.definition.length).toBeGreaterThan(0);
    }
  });

  it('returns review questions', () => {
    const summary = createMockSummary('asset-1');
    expect(summary.reviewQuestions.length).toBeGreaterThan(0);
    for (const question of summary.reviewQuestions) {
      expect(question.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same asset id', () => {
    expect(createMockSummary('asset-1')).toEqual(createMockSummary('asset-1'));
  });

  it('derives different content for different asset ids', () => {
    expect(createMockSummary('asset-1').executiveSummary).not.toEqual(
      createMockSummary('asset-2').executiveSummary,
    );
  });
});