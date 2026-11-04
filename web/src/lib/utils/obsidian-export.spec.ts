import { describe, expect, it, vi } from 'vitest';
import { exportToObsidianMarkdown, downloadObsidianMarkdown } from './obsidian-export';
import type { SummaryData } from '../types/transcript';
import type { TranscriptionResponseDto } from '@immich/sdk';

describe('exportToObsidianMarkdown', () => {
  const mockSummary: SummaryData = {
    executiveSummary: 'This is a test summary.',
    keyConcepts: [
      { term: 'Photosynthesis', definition: 'Process by which plants convert light energy' },
    ],
    reviewQuestions: ['What is the main function of mitosis?', 'Explain cellular respiration.'],
  };

  const mockTranscript: TranscriptionResponseDto = {
    segments: [
      { start: 0, end: 5, text: 'This is the first segment of the transcript.' },
      { start: 5, end: 10, text: 'This is the second segment.\nNewline here.' },
    ],
    text: '',
    language: 'en',
    model: 'test',
    createdAt: new Date(),
  };

  it('generates frontmatter with default tags', () => {
    const md = exportToObsidianMarkdown(mockSummary, null, {
      includeFrontmatter: true,
      includeCallouts: true,
      includeTranscript: false,
      includeQuizHistory: false,
      tags: ['smart-class-notes'],
    });
    expect(md).toContain('---');
    expect(md).toContain('title: Class Notes');
    expect(md).toContain("tags: smart-class-notes");
    expect(md).toContain('export-date:');
  });

  it('generates frontmatter with asset name', () => {
    const md = exportToObsidianMarkdown(mockSummary, null, {
      includeFrontmatter: true,
      includeCallouts: true,
      includeTranscript: false,
      includeQuizHistory: false,
      tags: ['test'],
    }, 'My Lecture Audio');
    expect(md).toContain('title: My Lecture Audio');
  });

  it('includes abstract callout with executive summary', () => {
    const md = exportToObsidianMarkdown(mockSummary, null, {
      includeFrontmatter: false,
      includeCallouts: true,
      includeTranscript: false,
      includeQuizHistory: false,
      tags: [],
    });
    expect(md).toContain('> [!abstract] Executive Summary');
    expect(md).toContain('> This is a test summary.');
  });

  it('includes note callout with key concepts', () => {
    const md = exportToObsidianMarkdown(mockSummary, null, {
      includeFrontmatter: false,
      includeCallouts: true,
      includeTranscript: false,
      includeQuizHistory: false,
      tags: [],
    });
    expect(md).toContain('> [!note] Key Concepts');
    expect(md).toContain('> **Photosynthesis**: Process by which plants convert light energy');
  });

  it('includes FAQ callout with review questions', () => {
    const md = exportToObsidianMarkdown(mockSummary, null, {
      includeFrontmatter: false,
      includeCallouts: true,
      includeTranscript: false,
      includeQuizHistory: false,
      tags: [],
    });
    expect(md).toContain('> [!faq] Review Questions');
    expect(md).toContain('> 1. What is the main function of mitosis?');
    expect(md).toContain('> 2. Explain cellular respiration.');
  });

  it('includes transcript quote callout when enabled', () => {
    const md = exportToObsidianMarkdown(mockSummary, mockTranscript, {
      includeFrontmatter: false,
      includeCallouts: true,
      includeTranscript: true,
      includeQuizHistory: false,
      tags: [],
    });
    expect(md).toContain('> [!quote]- Full Transcript');
    expect(md).toContain('[00:00] This is the first segment of the transcript.');
    expect(md).toContain('[00:05] This is the second segment.');
  });

  it('normalizes newlines in transcript segments', () => {
    const md = exportToObsidianMarkdown(mockSummary, mockTranscript, {
      includeFrontmatter: false,
      includeCallouts: false,
      includeTranscript: true,
      includeQuizHistory: false,
      tags: [],
    });
    expect(md).toContain('Newline here');
  });

  it('skips transcript callout when null provided', () => {
    const md = exportToObsidianMarkdown(mockSummary, null, {
      includeFrontmatter: false,
      includeCallouts: false,
      includeTranscript: true,
      includeQuizHistory: false,
      tags: [],
    });
    expect(md).not.toContain('[00:00]');
  });

  it('skips transcript when empty segments', () => {
    const emptyTranscript: TranscriptionResponseDto = { segments: [], text: '', language: 'en', model: 'test', createdAt: new Date() };
    const md = exportToObsidianMarkdown(mockSummary, emptyTranscript, {
      includeFrontmatter: false,
      includeCallouts: false,
      includeTranscript: true,
      includeQuizHistory: false,
      tags: [],
    });
    expect(md).not.toContain('[00:00]');
  });
});

describe('downloadObsidianMarkdown', () => {
  it('creates blob and triggers download', () => {
    const mockClick = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: mockClick,
    } as unknown as HTMLAnchorElement);
    
    const mockRevoke = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevoke);

    downloadObsidianMarkdown('# Test content', 'test.md');
    expect(mockClick).toHaveBeenCalled();
  });
});