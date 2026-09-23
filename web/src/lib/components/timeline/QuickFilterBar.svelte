<script lang="ts">
  import { AssetTypeEnum } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiImageMultiple, mdiPlayCircle } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    value?: AssetTypeEnum;
  }

  let { value = $bindable() }: Props = $props();

  const isActive = (assetType: AssetTypeEnum | undefined) => value === assetType;

  const onSelect = (assetType: AssetTypeEnum | undefined) => {
    value = assetType;
  };
</script>

<div
  class="flex items-center gap-1 rounded-full border border-gray-200 p-1 dark:border-immich-dark-gray dark:bg-immich-dark-bg"
>
  <button
    type="button"
    aria-pressed={isActive(undefined)}
    onclick={() => onSelect(undefined)}
    class="rounded-full px-3 py-1 text-sm font-medium transition-all duration-150 {isActive(undefined)
      ? 'bg-immich-primary text-white dark:bg-immich-dark-primary dark:text-immich-dark-gray'
      : 'text-immich-fg hover:bg-immich-primary/10 dark:text-immich-dark-fg dark:hover:bg-immich-dark-primary/10'}"
  >
    {$t('all')}
  </button>
  <button
    type="button"
    aria-pressed={isActive(AssetTypeEnum.Image)}
    onclick={() => onSelect(AssetTypeEnum.Image)}
    class="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all duration-150 {isActive(
      AssetTypeEnum.Image,
    )
      ? 'bg-immich-primary text-white dark:bg-immich-dark-primary dark:text-immich-dark-gray'
      : 'text-immich-fg hover:bg-immich-primary/10 dark:text-immich-dark-fg dark:hover:bg-immich-dark-primary/10'}"
  >
    <Icon icon={mdiImageMultiple} size="16" />
    {$t('photos')}
  </button>
  <button
    type="button"
    aria-pressed={isActive(AssetTypeEnum.Video)}
    onclick={() => onSelect(AssetTypeEnum.Video)}
    class="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all duration-150 {isActive(
      AssetTypeEnum.Video,
    )
      ? 'bg-immich-primary text-white dark:bg-immich-dark-primary dark:text-immich-dark-gray'
      : 'text-immich-fg hover:bg-immich-primary/10 dark:text-immich-dark-fg dark:hover:bg-immich-dark-primary/10'}"
  >
    <Icon icon={mdiPlayCircle} size="16" />
    {$t('videos')}
  </button>
</div>
