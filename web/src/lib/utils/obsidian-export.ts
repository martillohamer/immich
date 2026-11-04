import type { SummaryData, ObsidianExportOptions } from '../types/transcript';
import type { TranscriptionResponseDto } from '@immich/sdk';
import { formatTimestamp } from './transcript-rag';

export function exportToObsidianMarkdown(
  summaryData: SummaryData,
  transcript?: TranscriptionResponseDto | null,
  options: ObsidianExportOptions = {
    includeFrontmatter: true,
    includeCallouts: true,
    includeTranscript: false,
    includeQuizHistory: false,
    tags: ['smart-class-notes'],
  },
  assetName?: string,
): string {
  const lines: string[] = [];

  if (options.includeFrontmatter) {
    lines.push('---');
    lines.push(`title: ${assetName ?? 'Class Notes'}`);
    lines.push(`tags: ${options.tags.join(', ')}`);
    lines.push('export-date: ' + new Date().toISOString().split('T')[0]);
    lines.push('---');
    lines.push('');
  }

  if (options.includeCallouts) {
    lines.push('> [!abstract] Executive Summary');
    lines.push(`> ${summaryData.executiveSummary}`);
    lines.push('');
    lines.push('> [!note] Key Concepts');
    for (const concept of summaryData.keyConcepts) {
      lines.push(`> **${concept.term}**: ${concept.definition}`);
    }
    lines.push('');
lines.push('> [!faq] Review Questions');
  for (let i = 0; i < summaryData.reviewQuestions.length; i++) {
    const quest = summaryData.reviewQuestions[i];
    lines.push(`> ${i + 1}. ${quest}`);
  }
    lines.push('');
  }

  if (options.includeTranscript && transcript) {
    lines.push('> [!quote]- Full Transcript');
    lines.push('>');
    for (const segment of transcript.segments ?? []) {
      const time = formatTimestamp(segment.start);
      const cleanText = segment.text.replace(/\n/g, ' ');
      lines.push(`> [${time}] ${cleanText}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadObsidianMarkdown(
  markdown: string,
  filename: string = 'class-notes.md',
): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}