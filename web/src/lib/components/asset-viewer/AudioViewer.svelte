<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize, type AssetResponseDto } from '@immich/sdk';
  import {
    mdiCheck,
    mdiChevronLeft,
    mdiChevronRight,
    mdiPause,
    mdiPlay,
    mdiVolumeHigh,
    mdiVolumeLow,
    mdiVolumeMedium,
    mdiVolumeMute,
  } from '@mdi/js';
  import { Icon } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import TranscriptPanel from '$lib/components/asset-viewer/TranscriptPanel.svelte';
  import 'media-chrome/media-controller';
  import 'media-chrome/media-control-bar';
  import 'media-chrome/media-play-button';
  import 'media-chrome/media-time-display';
  import 'media-chrome/media-mute-button';
  import 'media-chrome/media-volume-range';
  import 'media-chrome/menu/media-playback-rate-menu';
  import 'media-chrome/menu/media-settings-menu';
  import 'media-chrome/menu/media-settings-menu-button';
  import 'media-chrome/menu/media-settings-menu-item';
  import './immich-time-range';

  let { asset }: { asset: AssetResponseDto } = $props();

  let audio = $state<HTMLAudioElement>();
  let currentTime = $state(0);
  let duration = $state(0);

  const src = $derived(getAssetMediaUrl({ id: asset.id, size: AssetMediaSize.Original }));

  const assetName = $derived(asset.originalFileName?.replace(/\.[^.]+$/, ''));

  const handleTimeUpdate = () => {
    currentTime = audio?.currentTime ?? 0;
  };

  const handleDurationChange = () => {
    duration = audio?.duration ?? 0;
  };

  const seekTo = (time: number) => {
    if (!audio) {
      return;
    }
    audio.currentTime = time;
    void audio.play();
  };
</script>

<div class="flex size-full flex-col bg-immich-bg">
  <div class="flex flex-1 flex-col items-center justify-center gap-4 p-4">
    <media-controller class="w-full max-w-2xl">
      <audio
        slot="media"
        {src}
        bind:this={audio}
        preload="metadata"
        ontimeupdate={handleTimeUpdate}
        ondurationchange={handleDurationChange}
      ></audio>

      <media-settings-menu hidden anchor="auto" class="min-w-3xs rounded-xl border border-light-300 shadow-sm">
        <Icon slot="checked-indicator" icon={mdiCheck} class="m-2" />
        <media-settings-menu-item class="mx-1 rounded-lg p-1 ps-2">
          {$t('media_chrome.playback_rate')}
          <Icon slot="suffix" icon={mdiChevronRight} class="m-2" />
          <media-playback-rate-menu slot="submenu" hidden rates="0.5 1 1.5 2">
            <Icon slot="back-icon" icon={mdiChevronLeft} class="m-2" />
            <span slot="title">{$t('media_chrome.playback_rate')}</span>
          </media-playback-rate-menu>
        </media-settings-menu-item>
      </media-settings-menu>

      <div class="flex h-20 w-full flex-col justify-end bg-linear-to-b to-black/80 px-4">
        <media-control-bar part="bottom" class="flex h-10 w-full gap-2">
          <media-play-button class="shrink-0 rounded-full p-2 outline-none">
            <Icon slot="play" icon={mdiPlay} />
            <Icon slot="pause" icon={mdiPause} />
          </media-play-button>
          <media-time-display showduration class="rounded-lg p-2 outline-none"></media-time-display>

          <span class="grow"></span>

          <div
            class="volume-wrapper shrink-0 rounded-full bg-light-100/0 transition-colors duration-400 hover:bg-light-100"
          >
            <media-volume-range class="h-full bg-none outline-none"></media-volume-range>
            <media-mute-button class="bg-none p-2 outline-none">
              <Icon slot="off" icon={mdiVolumeMute} />
              <Icon slot="low" icon={mdiVolumeLow} />
              <Icon slot="medium" icon={mdiVolumeMedium} />
              <Icon slot="high" icon={mdiVolumeHigh} />
            </media-mute-button>
          </div>

          <media-settings-menu-button class="shrink-0 rounded-full p-2 outline-none"></media-settings-menu-button>
        </media-control-bar>
        <immich-time-range class="h-8 w-full rounded-lg px-2 pb-3 outline-none"></immich-time-range>
      </div>
    </media-controller>
  </div>
  <TranscriptPanel {...{ assetId: asset.id, assetName, currentTime, duration, onSeek: seekTo }} />
</div>

<style>
  media-controller {
    --media-control-background: none;
    --media-control-hover-background: var(--immich-ui-light-100);
    --media-focus-box-shadow: 0 0 0 2px var(--immich-ui-dark);
    --media-font-family: var(--font-sans);
    --media-font-size: var(--text-base);
    --media-font-weight: var(--font-weight-medium);
    --media-menu-border-radius: var(--radius-xl);
    --media-menu-gap: var(--spacing);
    --media-menu-item-hover-background: var(--immich-ui-light-200);
    --media-menu-item-icon-height: 1em;
    --media-menu-item-indicator-height: 1em;
    --media-primary-color: var(--immich-ui-dark);
    --media-time-range-buffered-color: var(--immich-ui-dark-400);
    --media-time-range-hover-bottom: 0;
    --media-time-range-hover-height: 100%;
    --media-range-thumb-box-shadow: none;
    --media-range-thumb-opacity: 0;
    --media-range-thumb-transition: opacity 0.15s ease;
    --media-range-track-border-radius: 2px;
    --media-range-track-height: 3.5px;
    --media-range-padding: 0;
    --media-settings-menu-background: var(--immich-ui-light-100);
    --media-text-content-height: var(--text-base--line-height);
    --media-tooltip-arrow-display: none;
    --media-tooltip-border-radius: var(--radius-lg);
    --media-tooltip-background-color: var(--immich-ui-light-200);
    --media-tooltip-distance: 8px;
    --media-tooltip-padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3.5);
  }

  media-time-display {
    font-variant-numeric: tabular-nums;
  }

  immich-time-range,
  media-volume-range {
    --media-control-hover-background: none;
  }

  immich-time-range:hover,
  media-volume-range:hover {
    --media-range-thumb-opacity: 1;
  }

  *::part(tooltip) {
    --media-font-size: var(--text-xs);
    --media-text-content-height: var(--text-xs--line-height);
    color: white;
  }

  .volume-wrapper {
    --media-control-hover-background: none;
  }

  media-volume-range:has(+ media-mute-button) {
    padding: 0;
    margin: 0;
    width: 0;
    overflow: hidden;
    transition: width 0.4s ease-out;
  }

  /* Expand volume control in all relevant states */
  .volume-wrapper:hover > media-volume-range,
  media-volume-range:has(+ media-mute-button:hover),
  media-volume-range:has(+ media-mute-button:focus),
  media-volume-range:has(+ media-mute-button:focus-within),
  media-volume-range:hover,
  media-volume-range:focus,
  media-volume-range:focus-within {
    padding: 0 calc(var(--spacing) * 2);
    margin-left: calc(var(--spacing) * 2);
    width: 70px;
  }
</style>
