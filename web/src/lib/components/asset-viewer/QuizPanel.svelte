<script lang="ts">
  import { t } from 'svelte-i18n';
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import { quizManager } from '$lib/stores/quiz.svelte';
  import { downloadObsidianMarkdown, exportToObsidianMarkdown } from '$lib/utils/obsidian-export';

  let { assetId, onRetry }: { assetId: string; onRetry: () => void } = $props();

  let currentQuestionIndex = $state(0);
  let showResult = $state(false);

  const session = $derived(quizManager.getSession(assetId));
  const questions = $derived(session.questions);
  const answers = $derived(session.answers);
  const submitted = $derived(session.submitted);
  const score = $derived(session.score);
  const hasSummary = $derived(transcriptManager.summaryData !== null);
  const isUnstarted = $derived(questions.length === 0);
  const currentQuestion = $derived(questions[currentQuestionIndex] ?? null);

  const submitQuiz = () => {
    quizManager.submitQuiz(assetId);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      currentQuestionIndex++;
    }
  };

  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
    }
  };

  const navigateToQuestion = (index: number) => {
    currentQuestionIndex = index;
  };

  const resetQuiz = () => {
    quizManager.resetQuiz(assetId);
    currentQuestionIndex = 0;
    showResult = false;
  };

  const exportToObsidian = () => {
    if (!hasSummary) return;
    const markdown = exportToObsidianMarkdown(transcriptManager.summaryData!, null, {
      includeFrontmatter: true,
      includeCallouts: true,
      includeTranscript: false,
      includeQuizHistory: true,
      tags: ['smart-class-notes', 'quiz'],
    }, transcriptManager.originalFileName);
    downloadObsidianMarkdown(markdown, `class-notes-${assetId}.md`);
  };
</script>

{#if isUnstarted}
  <div data-testid="quiz-empty" class="flex flex-col items-center gap-3 text-sm text-immich-gray">
    <p>{$t('smart_class_quiz_title')}</p>
    {#if !hasSummary}
      <p>{$t('summary_export_description')}</p>
    {:else}
      <button
        type="button"
        data-testid="quiz-start"
        onclick={() => quizManager.startQuiz(assetId, transcriptManager.summaryData!)}
        class="rounded-lg bg-immich-primary px-4 py-2 text-sm text-white hover:bg-immich-primary/80"
      >
        {$t('smart_class_quiz_start')}
      </button>
    {/if}
  </div>
{:else if submitted}
  <div data-testid="quiz-result" class="flex flex-col gap-4">
    <p class="text-2xl font-bold text-immich-primary" data-testid="quiz-score">
      {$t('smart_class_quiz_score_full', { values: { percentage: score } })}
    </p>
    <button
      type="button"
      data-testid="quiz-retry"
      onclick={resetQuiz}
      class="rounded-lg bg-immich-primary px-4 py-2 text-sm text-white hover:bg-immich-primary/80"
    >
      {$t('smart_class_quiz_retry')}
    </button>
    <button
      type="button"
      data-testid="quiz-export-obsidian"
      onclick={exportToObsidian}
      class="rounded-lg bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-600/80"
    >
      Export to Obsidian
    </button>
  </div>
{:else}
  <div data-testid="quiz-question" class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold text-immich-fg">
        {$t('smart_class_quiz_title')} • {$t('flashcards_counter', { values: { current: currentQuestionIndex + 1, total: questions.length } })}
      </p>
    </div>

    <div class="rounded-xl bg-immich-bg p-4 shadow-sm">
      <h3 class="mb-4 text-lg font-medium text-immich-fg" data-testid="quiz-question-text">
        {currentQuestion?.question}
      </h3>

      <div class="flex flex-col gap-2">
        {#each currentQuestion?.options ?? [] as option, idx}
          <button
            type="button"
            data-testid={`quiz-option-${idx}`}
            onclick={() => quizManager.selectAnswer(assetId, currentQuestion.id, option.id)}
            class="rounded-lg border p-3 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span class="font-medium text-immich-fg">{String.fromCharCode(97 + idx)})</span>
            <span class="ml-2 text-immich-fg">{option.text}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="flex items-center justify-between">
      <button
        type="button"
        data-testid="quiz-prev"
        disabled={currentQuestionIndex === 0}
        onclick={prevQuestion}
        class="rounded-lg bg-immich-bg px-4 py-2 text-sm text-immich-fg disabled:opacity-40"
      >
        {$t('flashcards_prev')}
      </button>

      {#if currentQuestionIndex < questions.length - 1}
        <button
          type="button"
          data-testid="quiz-next"
          onclick={() => navigateToQuestion(currentQuestionIndex + 1)}
          class="rounded-lg bg-immich-primary px-4 py-2 text-sm text-white hover:bg-immich-primary/80"
        >
          {$t('smart_class_quiz_next')}
        </button>
      {:else}
        <button
          type="button"
          data-testid="quiz-submit"
          onclick={submitQuiz}
          class="rounded-lg bg-immich-primary px-4 py-2 text-sm text-white hover:bg-immich-primary/80"
        >
          {$t('smart_class_quiz_submit')}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(.dark) {
    .bg-immich-bg {
      background-color: var(--immich-dark-bg);
    }
    .text-immich-fg {
      color: var(--immich-dark-fg);
    }
  }
</style>