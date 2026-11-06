<script lang="ts">
  import { cleanClass } from '$lib';
  import { Icon, LoadingSpinner } from '@immich/ui';
  import { mdiAlertCircleOutline, mdiPauseCircleOutline, mdiPlayCircleOutline } from '@mdi/js';
  import { Duration } from 'luxon';
  import { onMount } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  interface Props {
    url: string;
    durationInSeconds?: number;
    enablePlayback?: boolean;
    playbackOnIconHover?: boolean;
    showTime?: boolean;
    curve?: boolean;
    playIcon?: string;
    pauseIcon?: string;
    class?: ClassValue;
  }

  let {
    url,
    durationInSeconds = 0,
    enablePlayback = $bindable(false),
    playbackOnIconHover = false,
    showTime = true,
    curve = false,
    playIcon = mdiPlayCircleOutline,
    pauseIcon = mdiPauseCircleOutline,
    class: className,
  }: Props = $props();

  let remainingSeconds = $state(durationInSeconds);
  let loading = $state(true);
  let playbackError = $state(false);
  let player: HTMLVideoElement | undefined = $state();

  $effect(() => {
    if (!enablePlayback) {
      remainingSeconds = durationInSeconds;
      return;
    }
    if (!player) {
      return;
    }
    const video = player;
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  });

  onMount(() => {
    return () => {
      if (player) {
        player.pause();
      }
    };
  });

  const onMouseEnter = () => {
    if (playbackOnIconHover) {
      enablePlayback = true;
    }
  };

  const onMouseLeave = () => {
    if (playbackOnIconHover) {
      enablePlayback = false;
    }
  };

  const handleVideoError = () => {
    if (!player?.src) {
      return;
    }
    loading = false;
    playbackError = true;
  };

  const handleVideoLoadStart = () => {
    loading = true;
  };

  const handleVideoCanPlay = () => {
    loading = false;
    playbackError = false;
  };
</script>

{#if playbackError}
  <div class="absolute inset-0 flex size-full items-center justify-center bg-gray-300/50 dark:bg-gray-700/50">
    <Icon icon={mdiAlertCircleOutline} size="48" class="text-red-500" />
  </div>
{:else if enablePlayback}
  <video
    bind:this={player}
    class={cleanClass('h-full w-full object-cover', className)}
    class:rounded-xl={curve}
    muted
    autoplay
    loop
    src={url}
    onplay={handleVideoCanPlay}
    onerror={handleVideoError}
    onloadstart={handleVideoLoadStart}
    ontimeupdate={({ currentTarget }) => {
      remainingSeconds = Math.min(Math.ceil(Number.isNaN(currentTarget.duration - currentTarget.currentTime) ? Infinity : currentTarget.duration - currentTarget.currentTime), durationInSeconds);
    }}
  ></video>
{/if}

<div
  class="@container absolute inset-x-0 top-0 flex place-items-center justify-end gap-1 text-xs font-medium text-white text-shadow-[1px_1px_6px_rgb(0_0_0)]"
>
  {#if showTime}
    <span class="hidden pt-2 tabular-nums @min-[100px]:inline">
      {#if remainingSeconds < 60}
        {Duration.fromObject({ seconds: remainingSeconds }).toFormat('m:ss')}
      {:else if remainingSeconds < 3600}
        {Duration.fromObject({ seconds: remainingSeconds }).toFormat('mm:ss')}
      {:else}
        {Duration.fromObject({ seconds: remainingSeconds }).toFormat('h:mm:ss')}
      {/if}
    </span>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    class="pe-2 pt-2 drop-shadow-[1px_1px_6px_rgb(0_0_0)] @max-[99px]:scale-75 @max-[99px]:pe-1 @max-[99px]:pt-1"
    onmouseenter={onMouseEnter}
    onmouseleave={onMouseLeave}
  >
    {#if enablePlayback}
      {#if loading}
        <LoadingSpinner size="large" />
      {:else if playbackError}
        <Icon icon={mdiAlertCircleOutline} size="24" class="text-red-600" />
      {:else}
        <Icon icon={pauseIcon} size="24" />
      {/if}
    {:else}
      <Icon icon={playIcon} size="24" />
    {/if}
  </span>
</div>