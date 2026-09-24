<script lang="ts">
  import ServerStatisticsCard from '$lib/components/server-statistics/ServerStatisticsCard.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { getTimelineStats } from '$lib/services/asset-statistics.service';
  import { type AssetStatsResponseDto } from '@immich/sdk';
  import { Text } from '@immich/ui';
  import { mdiCameraIris, mdiImageMultiple, mdiPlayCircle } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  const pending = new Promise<never>(() => undefined);

  let statsPromise = $state<Promise<AssetStatsResponseDto> | undefined>(undefined);

  onMount(() => {
    statsPromise = getTimelineStats();
  });

  const photosPromise = $derived.by(() => statsPromise?.then((stats) => ({ value: stats.images })) ?? pending);
  const videosPromise = $derived.by(() => statsPromise?.then((stats) => ({ value: stats.videos })) ?? pending);
  const totalPromise = $derived.by(() => statsPromise?.then((stats) => ({ value: stats.total })) ?? pending);

  const username = $derived.by(() => {
    try {
      return authManager.user.name;
    } catch {
      return undefined;
    }
  });
</script>

<div class="flex flex-col gap-4">
  <Text size="large" fontWeight="medium">
    {#if username}
      {$t('quick_stats_greeting', { values: { name: username } })}
    {:else}
      {$t('welcome')}
    {/if}
  </Text>

  <div class="flex flex-col gap-4 lg:flex-row">
    <ServerStatisticsCard icon={mdiCameraIris} title={$t('photos')} valuePromise={photosPromise} />
    <ServerStatisticsCard icon={mdiPlayCircle} title={$t('videos')} valuePromise={videosPromise} />
    <ServerStatisticsCard icon={mdiImageMultiple} title={$t('total')} valuePromise={totalPromise} />
  </div>
</div>
