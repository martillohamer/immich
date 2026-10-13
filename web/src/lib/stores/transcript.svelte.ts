import type { TranscriptionResponseDto } from '@immich/sdk';
import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
import type { FlashcardDeck, FlashcardGrade, SummaryData } from '$lib/types/transcript';
import { CancellableTask } from '$lib/utils/cancellable-task';
import { buildFlashcardDeck } from '$lib/utils/transcript-flashcards';
import { createMockSummary } from '$lib/utils/transcript-summary';

export const isNotFound = (error: unknown) => {
  return error instanceof Error && 'status' in error && error.status === 404;
};

export class TranscriptManager {
  #data = $state<TranscriptionResponseDto | null>(null);
  #status = $state<'loading' | 'empty' | 'error' | 'success'>('loading');
  #cleared = false;
  #loader = new CancellableTask(undefined, undefined, (error) => {
    this.#status = isNotFound(error) ? 'empty' : 'error';
  });

  #activeTab = $state<'transcript' | 'summary' | 'flashcards'>('transcript');
  #summaryData = $state<SummaryData | null>(null);
  #isGeneratingSummary = $state(false);
  #summaryCleared = false;
  #summaryLoader = new CancellableTask(undefined, undefined, () => {
    this.#isGeneratingSummary = false;
  });

  #flashcardDeck: FlashcardDeck | null = null;
  #flashcardSourceSummary: SummaryData | null = null;
  #flashcardIndex = 0;
  #flashcardGrades: Partial<Record<string, FlashcardGrade>> = {};

  get transcript() {
    return this.#data;
  }

  get status() {
    return this.#status;
  }

  get activeTab() {
    return this.#activeTab;
  }

  get summaryData() {
    return this.#summaryData;
  }

  get isGeneratingSummary() {
    return this.#isGeneratingSummary;
  }

  get flashcardDeck(): FlashcardDeck | null {
    return this.#flashcardDeck;
  }

  get flashcardIndex() {
    return this.#flashcardIndex;
  }

  get flashcardGrades() {
    return this.#flashcardGrades;
  }

  async getAssetTranscript(id: string) {
    if (this.#cleared) {
      await this.#loader.reset();
      this.#cleared = false;
    }
    await this.#loader.execute(async () => {
      this.#data = await assetCacheManager.getAssetTranscript(id);
      this.#status = 'success';
    }, false);
  }

  setActiveTab(tab: 'transcript' | 'summary' | 'flashcards') {
    this.#activeTab = tab;
  }

  ensureFlashcardsDeck(summaryData: SummaryData, assetName?: string): FlashcardDeck {
    if (this.#flashcardSourceSummary === summaryData && this.#flashcardDeck) {
      return this.#flashcardDeck;
    }
    this.#flashcardDeck = buildFlashcardDeck(summaryData, assetName);
    this.#flashcardSourceSummary = summaryData;
    this.#flashcardGrades = {};
    this.#flashcardIndex = 0;
    return this.#flashcardDeck;
  }

  gradeFlashcard(cardId: string, grade: FlashcardGrade) {
    this.#flashcardGrades = { ...this.#flashcardGrades, [cardId]: grade };
  }

  setFlashcardIndex(index: number) {
    this.#flashcardIndex = index;
  }

  resetFlashcards() {
    this.#flashcardIndex = 0;
    this.#flashcardGrades = {};
  }

  async loadAssetSummary(assetId: string) {
    this.#isGeneratingSummary = true;
    if (this.#summaryCleared) {
      await this.#summaryLoader.reset();
      this.#summaryCleared = false;
    }
    await this.#summaryLoader.execute(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        this.#summaryData = createMockSummary(assetId);
      },
      false,
    );
    this.#isGeneratingSummary = false;
  }

  clear() {
    this.#cleared = true;
    this.#data = null;
    this.#status = 'loading';
    this.#summaryCleared = true;
    this.#summaryData = null;
    this.#isGeneratingSummary = false;
    this.#activeTab = 'transcript';
    this.#flashcardDeck = null;
    this.#flashcardSourceSummary = null;
    this.#flashcardIndex = 0;
    this.#flashcardGrades = {};
  }
}

export const transcriptManager = new TranscriptManager();
