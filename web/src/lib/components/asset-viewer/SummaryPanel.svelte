<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiLoading } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { SummaryData } from '$lib/types/transcript';
  import { downloadSummaryMarkdown, exportSummaryToMarkdown } from '$lib/utils/transcript-export';

  let {
    summaryData,
    loading,
    onRetry,
    assetId,
    assetName,
  }: {
    summaryData: SummaryData | null;
    loading: boolean;
    onRetry: () => void;
    assetId: string;
    assetName?: string;
  } = $props();

  const view = $derived(loading ? 'loading' : summaryData ? 'data' : 'empty');
</script>

{#if view === 'loading'}
  <div data-testid="summary-loading" class="flex items-center gap-2 text-sm text-immich-gray">
    <Icon icon={mdiLoading} class="animate-spin" size="16" />
    {$t('summary_generating')}
  </div>
{:else if view === 'empty'}
  <div data-testid="summary-empty" class="flex flex-col items-start gap-2 text-sm text-immich-gray">
    {$t('summary_empty')}
    <button type="button" data-testid="summary-retry" onclick={onRetry} class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80">
      {$t('retry')}
    </button>
  </div>
{:else}
  <div class="flex justify-end">
    <button
      type="button"
      data-testid="summary-export"
      onclick={() => downloadSummaryMarkdown(exportSummaryToMarkdown(summaryData!, assetName), assetId)}
      class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
    >
      {$t('summary_export')}
    </button>
  </div>

  <section aria-labelledby="summary-executive-title" class="flex flex-col gap-1">
    <h3 id="summary-executive-title" class="text-sm font-semibold text-immich-primary">{$t('summary_section_executive')}</h3>
    <p data-testid="summary-executive" class="text-sm/relaxed text-immich-fg">{summaryData!.executiveSummary}</p>
  </section>

  <section aria-labelledby="summary-concepts-title" class="flex flex-col gap-1">
    <h3 id="summary-concepts-title" class="text-sm font-semibold text-immich-primary">{$t('summary_section_concepts')}</h3>
    <ul class="grid gap-2 sm:grid-cols-2">
      {#each summaryData!.keyConcepts as concept (concept.term)}
        <li data-testid="key-concept" class="rounded-lg bg-immich-bg p-2 text-sm">
          <p class="font-medium">{concept.term}</p>
          <p class="text-immich-gray">{concept.definition}</p>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="summary-questions-title" class="flex flex-col gap-1">
    <h3 id="summary-questions-title" class="text-sm font-semibold text-immich-primary">{$t('summary_section_questions')}</h3>
    <ol class="list-decimal space-y-1 pl-5 text-sm/relaxed">
      {#each summaryData!.reviewQuestions as question (question)}
        <li data-testid="summary-question">{question}</li>
      {/each}
    </ol>
  </section>
{/if}