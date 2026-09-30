import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect } from 'vitest';
import SummaryPanel from './SummaryPanel.svelte';
import type { SummaryData } from '$lib/types/transcript';

const mockSummary: SummaryData = {
  executiveSummary: 'Resumen ejecutivo de prueba',
  keyConcepts: [
    { term: 'Concepto A', definition: 'Definición A' },
    { term: 'Concepto B', definition: 'Definición B' },
  ],
  reviewQuestions: ['Pregunta 1', 'Pregunta 2'],
};

describe('SummaryPanel', () => {
  it('shows loading testid when loading', () => {
    const { getByTestId } = render(SummaryPanel, {
      summaryData: null,
      loading: true,
      onRetry: vi.fn(),
    });
    expect(getByTestId('summary-loading')).toBeInTheDocument();
  });

  it('shows empty testid and calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(SummaryPanel, {
      summaryData: null,
      loading: false,
      onRetry,
    });
    expect(getByTestId('summary-empty')).toBeInTheDocument();
    await fireEvent.click(getByTestId('summary-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders the executive summary text', () => {
    const { getByTestId } = render(SummaryPanel, {
      summaryData: mockSummary,
      loading: false,
      onRetry: vi.fn(),
    });
    expect(getByTestId('summary-executive')).toHaveTextContent(mockSummary.executiveSummary);
  });

  it('renders all key concepts with term and definition', () => {
    const { getAllByTestId } = render(SummaryPanel, {
      summaryData: mockSummary,
      loading: false,
      onRetry: vi.fn(),
    });
    const concepts = getAllByTestId('key-concept');
    expect(concepts).toHaveLength(2);
    expect(concepts[0]).toHaveTextContent('Concepto A');
    expect(concepts[0]).toHaveTextContent('Definición A');
    expect(concepts[1]).toHaveTextContent('Concepto B');
    expect(concepts[1]).toHaveTextContent('Definición B');
  });

  it('renders review questions in order', () => {
    const { getAllByTestId } = render(SummaryPanel, {
      summaryData: mockSummary,
      loading: false,
      onRetry: vi.fn(),
    });
    const questions = getAllByTestId('summary-question');
    expect(questions).toHaveLength(2);
    expect(questions[0]).toHaveTextContent('Pregunta 1');
    expect(questions[1]).toHaveTextContent('Pregunta 2');
  });
});