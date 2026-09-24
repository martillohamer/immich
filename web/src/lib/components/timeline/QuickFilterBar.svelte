<script lang="ts">
  import { AssetTypeEnum, type AssetStatsResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiImageMultiple, mdiLoading, mdiPlayCircle, mdiViewGridOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { t } from 'svelte-i18n';
  import { getTimelineStats } from '$lib/services/asset-statistics.service';

  interface Props {
    value?: AssetTypeEnum;
    loading?: boolean;
  }

  let { value = $bindable(), loading = false }: Props = $props();

  let stats = $state<AssetStatsResponseDto | undefined>(undefined);

  onMount(() => {
    getTimelineStats()
      .then((measured) => {
        stats = measured;
      })
      .catch(() => {
        stats = undefined;
      });
  });

  const isActive = (assetType: AssetTypeEnum | undefined) => value === assetType;

  const onSelect = (assetType: AssetTypeEnum | undefined) => {
    value = assetType;
  };

  const pillClass = (assetType: AssetTypeEnum | undefined) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all duration-150 ${
      isActive(assetType)
        ? 'bg-immich-primary text-white dark:bg-immich-dark-primary dark:text-immich-dark-gray'
        : 'text-immich-fg hover:bg-immich-primary/10 dark:text-immich-dark-fg dark:hover:bg-immich-dark-primary/10'
    }`;

  const countClass = (assetType: AssetTypeEnum | undefined) =>
    `rounded-full px-1.5 text-xs font-semibold ${
      isActive(assetType)
        ? 'bg-white/25 text-white dark:bg-immich-dark-gray/25 dark:text-immich-dark-gray'
        : 'bg-gray-200/70 text-immich-fg dark:bg-immich-dark-gray dark:text-immich-dark-fg'
    }`;
</script>

<div
  data-testid="quick-filter-bar"
  aria-busy={loading}
  class="flex items-center gap-1 rounded-full border border-gray-200 p-1 dark:border-immich-dark-gray dark:bg-immich-dark-bg"
>
  <button type="button" aria-pressed={isActive(undefined)} onclick={() => onSelect(undefined)} class={pillClass(undefined)}>
    <Icon icon={mdiViewGridOutline} size="16" />
    {$t('all')}
    {#if loading && isActive(undefined)}
      <Icon class="animate-spin" data-testid="filter-spinner" icon={mdiLoading} size="16" />
    {/if}
    {#if stats}
      <span class={countClass(undefined)}>
        {#key stats}
          <span transition:fade={{ duration: 150 }} data-testid="filter-count-all">{stats.total}</span>
        {/key}
      </span>
    {/if}
  </button>
  <button
    type="button"
    aria-pressed={isActive(AssetTypeEnum.Image)}
    onclick={() => onSelect(AssetTypeEnum.Image)}
    class={pillClass(AssetTypeEnum.Image)}
  >
    <Icon icon={mdiImageMultiple} size="16" />
    {$t('photos')}
    {#if loading && isActive(AssetTypeEnum.Image)}
      <Icon class="animate-spin" data-testid="filter-spinner" icon={mdiLoading} size="16" />
    {/if}
    {#if stats}
      <span class={countClass(AssetTypeEnum.Image)}>
        {#key stats}
          <span transition:fade={{ duration: 150 }} data-testid="filter-count-photos">{stats.images}</span>
        {/key}
      </span>
    {/if}
  </button>
  <button
    type="button"
    aria-pressed={isActive(AssetTypeEnum.Video)}
    onclick={() => onSelect(AssetTypeEnum.Video)}
    class={pillClass(AssetTypeEnum.Video)}
  >
    <Icon icon={mdiPlayCircle} size="16" />
    {$t('videos')}
    {#if loading && isActive(AssetTypeEnum.Video)}
      <Icon class="animate-spin" data-testid="filter-spinner" icon={mdiLoading} size="16" />
    {/if}
    {#if stats}
      <span class={countClass(AssetTypeEnum.Video)}>
        {#key stats}
          <span transition:fade={{ duration: 150 }} data-testid="filter-count-videos">{stats.videos}</span>
        {/key}
      </span>
    {/if}
  </button>
</div>