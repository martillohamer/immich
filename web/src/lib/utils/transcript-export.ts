import type { SummaryData } from '$lib/types/transcript';
import { downloadBlob } from '$lib/utils';

export function exportSummaryToMarkdown(summaryData: SummaryData, assetName?: string): string {
  const trimmedAssetName = assetName?.trim();
  const lines: string[] = [
    '# Class Notes',
    '',
    ...(trimmedAssetName ? [`## ${trimmedAssetName}`, ''] : []),
    '---',
    ...(summaryData.executiveSummary.trim()
      ? ['', '## Executive Summary', '', summaryData.executiveSummary]
      : []),
    ...(summaryData.keyConcepts.length > 0
      ? ['', '## Key Concepts', '', ...summaryData.keyConcepts.map(({ term, definition }) => `- **${term}**: ${definition}`)]
      : []),
    ...(summaryData.reviewQuestions.length > 0
      ? ['', '## Review Questions', '', ...summaryData.reviewQuestions.map((question, index) => `${index + 1}. ${question}`)]
      : []),
  ];

  return `${lines.join('\n')}\n`;
}

export function downloadSummaryMarkdown(markdown: string, assetId: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `class-notes-${assetId}.md`);
}