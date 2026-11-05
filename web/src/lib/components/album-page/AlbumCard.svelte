<script lang="ts">
  import AlbumCover from '$lib/components/album-page/AlbumCover.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { getShortDateRange } from '$lib/utils/date-time';
  import { type AlbumResponseDto } from '@immich/sdk';
  import { ContextMenuButton, type MenuItems } from '@immich/ui';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    showOwner?: boolean;
    showDateRange?: boolean;
    showItemCount?: boolean;
    preload?: boolean;
    contextMenuItems?: MenuItems;
  };

  const {
    album,
    showOwner = false,
    showDateRange = false,
    showItemCount = false,
    preload = false,
    contextMenuItems,
  }: Props = $props();
</script>

<div
  class="group relative rounded-sm border border-terminal-green-500/30 bg-deep-carbon-800/50 p-4 hover:border-terminal-green-500 hover:bg-deep-carbon-700 transition-all duration-200 photo-card-terminal font-terminal"
  data-testid="album-card"
>
  {#if contextMenuItems}
    <div
      id="icon-{album.id}"
      class="absolute inset-e-6 top-6 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      data-testid="context-button-parent"
    >
      <ContextMenuButton
        translations={{ open_menu: $t('show_album_options') }}
        position="top-left"
        variant="filled"
        class="icon-white-drop-shadow"
        items={contextMenuItems}
      />
    </div>
  {/if}

  <AlbumCover {album} {preload} class="transition-all duration-300 hover:shadow-lg" />

  <div class="mt-4">
    <p
      class="line-clamp-2 w-full text-sm/5 font-semibold wrap-break-word text-white group-hover:text-terminal-green-400 font-terminal"
      data-testid="album-name"
      title={album.albumName}
    >
      {album.albumName}
    </p>

    {#if showDateRange && album.startDate && album.endDate}
      <p class="flex text-xs capitalize text-terminal-green-400 font-mono">
        {getShortDateRange(album.startDate, album.endDate)}
      </p>
    {/if}

    <span class="flex gap-2 text-xs text-terminal-green-400 font-mono" data-testid="album-details">
      {#if showItemCount}
        <p>
          {$t('items_count', { values: { count: album.assetCount } })}
        </p>
      {/if}

      {#if (showOwner || album.shared) && showItemCount}
        <p>•</p>
      {/if}

      {#if showOwner}
        {@const owner = album.albumUsers[0].user}
        {#if owner.id === authManager.user.id}
          <p>{$t('owned')}</p>
        {:else}
          <p>
            {$t('shared_by_user', { values: { user: owner.name } })}
          </p>
        {/if}
      {:else if album.shared}
        <p>{$t('shared')}</p>
      {/if}
    </span>
  </div>
</div>
