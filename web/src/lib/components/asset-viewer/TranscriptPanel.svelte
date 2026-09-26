<script lang="ts">
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import { t } from 'svelte-i18n';

  let {
    assetId,
    currentTime,
    duration: _,
    onSeek,
  }: {
    assetId: string;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
  } = $props();

  let transcript = $derived(transcriptManager.transcript);
  let status = $derived(transcriptManager.status);
  let userScrolling = false;

  $effect(() => {
    void transcriptManager.getAssetTranscript(assetId);
    return () => transcriptManager.clear();
  });

  let activeIndex = $derived(
    transcript?.segments.findIndex((segment) => currentTime >= segment.start && currentTime < segment.end) ?? -1,
  );

  $effect(() => {
    if (activeIndex < 0 || userScrolling) {
      return;
    }
    const el = scrollContainer?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  let scrollContainer: HTMLElement | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const handleScrollStart = () => {
    userScrolling = true;
    if (scrollTimer) {
      clearTimeout(scrollTimer);
    }
    scrollTimer = setTimeout(() => {
      userScrolling = false;
    }, 2000);
  };
</script>

<div
  class="fixed inset-x-0 bottom-0 z-40 mt-2 max-h-[30vh] overflow-y-auto border-t border-immich-gray/30 bg-immich-bg/95 backdrop-blur-sm"
  bind:this={scrollContainer}
  role="region"
  aria-label={$t('transcript_title')}
  onwheel={handleScrollStart}
  ontouchmove={handleScrollStart}
>
  <div class="mx-auto flex max-w-4xl flex-col gap-2 p-4">
    <div class="flex items-baseline justify-between" data-testid="transcript-heading">
      <h2 class="text-sm font-semibold text-immich-primary">{$t('transcript_title')}</h2>
      {#if status === 'success' && transcript?.model}
        <span class="text-xs text-immich-gray">{$t('transcript_model')}: {transcript.model}</span>
      {/if}
    </div>

    {#if status === 'loading'}
      <div data-testid="transcript-loading" class="text-sm text-immich-gray">{$t('transcript_loading')}</div>
    {:else if status === 'empty'}
      <div data-testid="transcript-empty" class="text-sm text-immich-gray">{$t('transcript_empty')}</div>
    {:else if status === 'error'}
      <div data-testid="transcript-error" class="text-sm text-red-600">{$t('transcript_error')}</div>
    {:else if transcript}
      <div class="flex flex-col gap-1">
        {#each transcript.segments as segment, index (index)}
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-start text-sm/relaxed transition-colors {index === activeIndex
              ? 'dark bg-immich-primary text-white'
              : 'hover:bg-immich-gray'}"
            onclick={() => onSeek(segment.start)}
            data-active={index === activeIndex ? 'true' : undefined}
          >
            {segment.text}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
