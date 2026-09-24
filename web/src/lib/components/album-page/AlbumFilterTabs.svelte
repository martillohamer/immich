<script lang="ts">
  import type { AlbumStatisticsResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import GroupTab from '$lib/elements/GroupTab.svelte';
  import { getAlbumStatisticsCounters, invalidateAlbumStatistics } from '$lib/services/album-statistics.service';

  interface Props {
    filters: string[];
    labels?: string[];
    selected: string;
    label: string;
    onSelect: (selected: string) => void;
  }

  let { filters, labels, selected, label, onSelect }: Props = $props();

  let stats = $state<AlbumStatisticsResponseDto | undefined>(undefined);
  let loading = $state(true);

  const refresh = async () => {
    loading = true;
    try {
      stats = await getAlbumStatisticsCounters();
    } catch {
      stats = undefined;
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    void refresh();
  });

  const handleAlbumChanged = () => {
    invalidateAlbumStatistics();
    void refresh();
  };

  const badges = $derived(
    stats ? [String(stats.notShared + stats.shared), String(stats.owned), String(stats.shared)] : undefined,
  );
</script>

<OnEvents
  onAlbumCreate={handleAlbumChanged}
  onAlbumUpdate={handleAlbumChanged}
  onAlbumDelete={handleAlbumChanged}
  onAlbumShare={handleAlbumChanged}
  onAlbumUserUpdate={handleAlbumChanged}
  onAlbumUserDelete={handleAlbumChanged}
/>

<GroupTab {filters} {labels} {selected} {label} {badges} {loading} {onSelect} />