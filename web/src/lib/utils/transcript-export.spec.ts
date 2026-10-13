import { describe, expect, it, vi } from 'vitest';
import type { SummaryData } from '$lib/types/transcript';
import { downloadSummaryMarkdown, exportSummaryToMarkdown } from '$lib/utils/transcript-export';

vi.mock(import('$lib/utils'), () => ({
  downloadBlob: vi.fn(),
}));

import { downloadBlob } from '$lib/utils';

const fullSummary: SummaryData = {
  executiveSummary: 'Resumen inteligente generado de forma local para el asset 896f9505.',
  keyConcepts: [
    { term: 'Concepto central', definition: 'Definición derivada de la transcripción del asset.' },
    { term: 'Idea secundaria', definition: 'Definición contextual asociada al asset.' },
  ],
  reviewQuestions: [
    '¿Cuál es la idea principal de este material?',
    '¿Qué ejemplos ilustran los conceptos clave?',
  ],
};

const fullExpected = [
  '# Class Notes',
  '',
  '## Clase 01',
  '',
  '---',
  '',
  '## Executive Summary',
  '',
  'Resumen inteligente generado de forma local para el asset 896f9505.',
  '',
  '## Key Concepts',
  '',
  '- **Concepto central**: Definición derivada de la transcripción del asset.',
  '- **Idea secundaria**: Definición contextual asociada al asset.',
  '',
  '## Review Questions',
  '',
  '1. ¿Cuál es la idea principal de este material?',
  '2. ¿Qué ejemplos ilustran los conceptos clave?',
].join('\n') + '\n';

describe('exportSummaryToMarkdown', () => {
  it('always starts with the fixed title', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output.startsWith('# Class Notes\n')).toBe(true);
  });

  it('omits the subtitle when assetName is not provided', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output).not.toContain('## Clase 01');
    expect(output).toContain('# Class Notes\n\n---');
  });

  it('emits the subtitle when assetName is provided', () => {
    const output = exportSummaryToMarkdown(fullSummary, 'Clase 01');
    expect(output).toContain('# Class Notes\n\n## Clase 01');
  });

  it('omits the subtitle when assetName is empty or whitespace', () => {
    expect(exportSummaryToMarkdown(fullSummary, '')).not.toContain('## Clase 01');
    expect(exportSummaryToMarkdown(fullSummary, ' '.repeat(3))).not.toContain('## Clase 01');
    expect(exportSummaryToMarkdown(fullSummary, undefined)).not.toContain('## Clase 01');
  });

  it('matches the full expected document exactly', () => {
    const output = exportSummaryToMarkdown(fullSummary, 'Clase 01');
    expect(output).toBe(fullExpected);
  });

  it('emits every key concept as a bold term followed by a definition', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output).toContain('- **Concepto central**: Definición derivada de la transcripción del asset.');
    expect(output).toContain('- **Idea secundaria**: Definición contextual asociada al asset.');
    const firstIndex = output.indexOf('Concepto central');
    const secondIndex = output.indexOf('Idea secundaria');
    expect(firstIndex).toBeGreaterThan(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it('emits review questions as a 1-based ordered list', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output).toContain('1. ¿Cuál es la idea principal de este material?');
    expect(output).toContain('2. ¿Qué ejemplos ilustran los conceptos clave?');
  });

  it('omits empty sections entirely', () => {
    const output = exportSummaryToMarkdown({
      executiveSummary: '',
      keyConcepts: [],
      reviewQuestions: [],
    });
    expect(output).not.toContain('## Executive Summary');
    expect(output).not.toContain('## Key Concepts');
    expect(output).not.toContain('## Review Questions');
  });

  it('ends with a trailing newline', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output.endsWith('\n')).toBe(true);
  });

  it('does not mutate the input summary', () => {
    const input: SummaryData = structuredClone(fullSummary);
    exportSummaryToMarkdown(input, 'Clase 01');
    expect(input).toEqual(fullSummary);
  });
});

describe('downloadSummaryMarkdown', () => {
  it('downloads the markdown as a blob with the expected type and filename', async () => {
    const markdown = '# Class Notes\n\n';
    downloadSummaryMarkdown(markdown, 'asset-1');

    expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blob.text()).toBe(markdown);
    expect(filename).toBe('class-notes-asset-1.md');
  });
});