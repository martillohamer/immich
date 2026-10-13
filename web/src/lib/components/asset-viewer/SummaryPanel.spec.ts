import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect } from 'vitest';
import SummaryPanel from './SummaryPanel.svelte';
import type { SummaryData } from '$lib/types/transcript';

vi.mock(import('$lib/utils/transcript-export'), () => ({
  exportSummaryToMarkdown: vi.fn(() => '# MARKDOWN'),
  downloadSummaryMarkdown: vi.fn(),
}));

import { exportSummaryToMarkdown, downloadSummaryMarkdown } from '$lib/utils/transcript-export';

const mockSummary: SummaryData = {
  executiveSummary: 'Resumen ejecutivo de prueba',
  keyConcepts: [
    { term: 'Concepto A', definition: 'Definición A' },
    { term: 'Concepto B', definition: 'Definición B' },
  ],
  reviewQuestions: ['Pregunta 1', 'Pregunta 2'],
};

const baseProps = {
  summaryData: null,
  loading: false,
  onRetry: vi.fn(),
  assetId: 'asset-1',
  assetName: 'Clase 01',
};

describe('SummaryPanel', () => {
  it('shows loading testid when loading', () => {
    const { getByTestId } = render(SummaryPanel, {
      ...baseProps,
      summaryData: null,
      loading: true,
    });
    expect(getByTestId('summary-loading')).toBeInTheDocument();
  });

  it('shows empty testid and calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(SummaryPanel, {
      ...baseProps,
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
      ...baseProps,
      summaryData: mockSummary,
      loading: false,
    });
    expect(getByTestId('summary-executive')).toHaveTextContent(mockSummary.executiveSummary);
  });

  it('renders all key concepts with term and definition', () => {
    const { getAllByTestId } = render(SummaryPanel, {
      ...baseProps,
      summaryData: mockSummary,
      loading: false,
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
      ...baseProps,
      summaryData: mockSummary,
      loading: false,
    });
    const questions = getAllByTestId('summary-question');
    expect(questions).toHaveLength(2);
    expect(questions[0]).toHaveTextContent('Pregunta 1');
    expect(questions[1]).toHaveTextContent('Pregunta 2');
  });

  it('shows the export button only when summary data is available', () => {
    const { getByTestId } = render(SummaryPanel, {
      ...baseProps,
      summaryData: mockSummary,
      loading: false,
    });
    expect(getByTestId('summary-export')).toBeInTheDocument();
  });

  it.each([
    { summaryData: null, loading: true },
    { summaryData: null, loading: false },
  ] as const)('hides the export button when there is no data (loading=$loading)', ({ summaryData, loading }) => {
    const { queryByTestId } = render(SummaryPanel, {
      ...baseProps,
      summaryData,
      loading,
    });
    expect(queryByTestId('summary-export')).toBeNull();
  });

  it('downloads the markdown built from the summary and the asset name when clicked', async () => {
    const { getByTestId } = render(SummaryPanel, {
      ...baseProps,
      summaryData: mockSummary,
      loading: false,
    });
    await fireEvent.click(getByTestId('summary-export'));
    expect(vi.mocked(exportSummaryToMarkdown)).toHaveBeenCalledWith(mockSummary, 'Clase 01');
    expect(vi.mocked(downloadSummaryMarkdown)).toHaveBeenCalledWith('# MARKDOWN', 'asset-1');
  });
});