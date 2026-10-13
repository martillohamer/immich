<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiLoading } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import type { FlashcardGrade } from '$lib/types/transcript';
  import { downloadFlashcardDeckCsv, exportFlashcardDeckToCsv } from '$lib/utils/transcript-flashcards';

  let { assetId, onRetry }: { assetId: string; onRetry: () => void } = $props();

  let flipped = $state(false);
  let flashcardIndex = $state(transcriptManager.flashcardIndex);

  const deck = $derived(transcriptManager.flashcardDeck);
  const grades = $derived(transcriptManager.flashcardGrades);
  const loading = $derived(transcriptManager.isGeneratingSummary);
  const hasSummary = $derived(transcriptManager.summaryData !== null);
  const cards = $derived(deck?.cards ?? []);
  const card = $derived(cards[flashcardIndex] ?? null);
  const finished = $derived(cards.length > 0 && flashcardIndex >= cards.length);
  const view = $derived(loading ? 'loading' : cards.length === 0 ? 'empty' : finished ? 'summary' : 'card');

  const preview = $derived({
    known: cards.filter((entry) => grades[entry.id] === 'known').length,
    again: cards.filter((entry) => grades[entry.id] === 'again').length,
    ungraded: cards.filter((entry) => grades[entry.id] === undefined).length,
  });

  const toggle = () => {
    flipped = !flipped;
  };

  const grade = (value: FlashcardGrade) => {
    if (!card) {
      return;
    }
    transcriptManager.gradeFlashcard(card.id, value);
    const next = flashcardIndex + 1;
    flashcardIndex = next;
    transcriptManager.setFlashcardIndex(next);
    flipped = false;
  };

  const goTo = (index: number) => {
    flashcardIndex = index;
    transcriptManager.setFlashcardIndex(index);
    flipped = false;
  };

  const restart = () => {
    transcriptManager.resetFlashcards();
    flashcardIndex = 0;
    flipped = false;
  };

  const exportCsv = () => {
    if (!deck) {
      return;
    }
    downloadFlashcardDeckCsv(exportFlashcardDeckToCsv(deck, grades), assetId);
  };
</script>

{#if view === 'loading'}
  <div data-testid="flashcard-loading" class="flex items-center gap-2 text-sm text-immich-gray">
    <Icon icon={mdiLoading} class="animate-spin" size="16" />
    {$t('flashcards_loading')}
  </div>
{:else if view === 'empty'}
  <div data-testid="flashcard-empty" class="flex flex-col items-start gap-2 text-sm text-immich-gray">
    {$t('flashcards_empty')}
    {#if !hasSummary}
      <button
        type="button"
        data-testid="flashcard-retry"
        onclick={onRetry}
        class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
      >
        {$t('retry')}
      </button>
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold text-immich-primary">{deck?.title || $t('smart_class_flashcards_title')}</p>
      <button
        type="button"
        data-testid="flashcard-export"
        onclick={exportCsv}
        class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
      >
        {$t('flashcards_export')}
      </button>
    </div>

    {#if view === 'summary'}
      <div data-testid="flashcard-summary" class="flex flex-col gap-2">
        <p data-testid="flashcard-summary-known" class="text-sm text-immich-fg">
          {$t('flashcards_summary_known', { values: { count: preview.known } })}
        </p>
        <p data-testid="flashcard-summary-again" class="text-sm text-immich-fg">
          {$t('flashcards_summary_again', { values: { count: preview.again } })}
        </p>
        <p data-testid="flashcard-summary-ungraded" class="text-sm text-immich-gray">
          {$t('flashcards_summary_ungraded', { values: { count: preview.ungraded } })}
        </p>
      </div>
      <button
        type="button"
        data-testid="flashcard-restart"
        onclick={restart}
        class="self-start rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
      >
        {$t('flashcards_restart')}
      </button>
    {:else}
      <div
        data-testid="flashcard-card"
        class="flip flex min-h-40 items-center justify-center rounded-xl bg-immich-bg p-4"
      >
        <div class="flip-inner" data-flipped={String(flipped)}>
          <div data-testid="flashcard-front" class="flip-face flex flex-col items-center gap-2 text-center">
            <span class="text-xs tracking-wide text-immich-gray uppercase"
              >{$t(card?.source === 'question' ? 'flashcards_source_question' : 'flashcards_source_concept')}</span
            >
            <p class="text-base text-immich-fg">{card?.front}</p>
          </div>
          <div data-testid="flashcard-back" class="flip-face flip-back flex flex-col items-center gap-2 text-center">
            {#if card?.back}
              <p class="text-base text-immich-fg">{card.back}</p>
            {:else}
              <p class="text-xs text-immich-gray">{$t('flashcards_self_check')}</p>
            {/if}
          </div>
        </div>
      </div>

      <p data-testid="flashcard-counter" class="text-center text-sm text-immich-gray">
        {$t('flashcards_counter', { values: { current: flashcardIndex + 1, total: cards.length } })}
      </p>

      <div class="flex items-center justify-center gap-2">
        <button
          type="button"
          data-testid="flashcard-prev"
          disabled={flashcardIndex === 0}
          onclick={() => goTo(Math.max(0, flashcardIndex - 1))}
          class="rounded-lg bg-immich-bg px-3 py-1.5 text-sm text-immich-fg disabled:opacity-40"
        >
          {$t('flashcards_prev')}
        </button>
        <button
          type="button"
          data-testid="flashcard-toggle"
          onclick={toggle}
          class="rounded-lg bg-immich-primary px-4 py-1.5 text-sm text-white hover:bg-immich-primary/80"
        >
          {$t('flashcards_flip')}
        </button>
        <button
          type="button"
          data-testid="flashcard-next"
          disabled={flashcardIndex >= cards.length - 1}
          onclick={() => goTo(Math.min(cards.length - 1, flashcardIndex + 1))}
          class="rounded-lg bg-immich-bg px-3 py-1.5 text-sm text-immich-fg disabled:opacity-40"
        >
          {$t('flashcards_next')}
        </button>
      </div>

      {#if flipped}
        <div class="flex items-center justify-center gap-2">
          <button
            type="button"
            data-testid="flashcard-again"
            onclick={() => grade('again')}
            class="rounded-lg bg-immich-bg px-3 py-1.5 text-sm text-immich-fg"
          >
            {$t('flashcards_again')}
          </button>
          <button
            type="button"
            data-testid="flashcard-known"
            onclick={() => grade('known')}
            class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
          >
            {$t('flashcards_known')}
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .flip {
    perspective: 1000px;
  }

  .flip-inner {
    position: relative;
    transform-style: preserve-3d;
    transition: transform 0.3s ease;
  }

  .flip-inner[data-flipped='true'] {
    transform: rotateY(180deg);
  }

  .flip-face {
    backface-visibility: hidden;
  }

  .flip-back {
    position: absolute;
    inset: 0;
    justify-content: center;
    transform: rotateY(180deg);
  }
</style>
