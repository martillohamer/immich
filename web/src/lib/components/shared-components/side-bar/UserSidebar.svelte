<script lang="ts">
  import BottomInfo from '$lib/components/shared-components/side-bar/BottomInfo.svelte';
  import RecentAlbums from '$lib/components/shared-components/side-bar/RecentAlbums.svelte';
  import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { Route } from '$lib/route';
  import { recentAlbumsDropdown } from '$lib/stores/preferences.store';
  import { NavbarGroup, NavbarItem } from '@immich/ui';
  import {
    mdiAccount,
    mdiAccountMultiple,
    mdiAccountMultipleOutline,
    mdiAccountOutline,
    mdiArchiveArrowDown,
    mdiArchiveArrowDownOutline,
    mdiCards,
    mdiCardsOutline,
    mdiFolderOutline,
    mdiHeart,
    mdiHeartOutline,
    mdiImageAlbum,
    mdiImageMultiple,
    mdiImageMultipleOutline,
    mdiLink,
    mdiLock,
    mdiLockOutline,
    mdiMagnify,
    mdiMap,
    mdiMapOutline,
    mdiTagMultipleOutline,
    mdiToolbox,
    mdiToolboxOutline,
    mdiTrashCan,
    mdiTrashCanOutline,
    mdiUploadOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
</script>

<Sidebar ariaLabel={$t('primary')} class="sidebar-terminal">
  <NavbarGroup title={$t('photos')} size="tiny" class="font-terminal terminal-status" />
  <NavbarItem title={$t('photos')} href={Route.photos()} icon={mdiImageMultipleOutline} activeIcon={mdiImageMultiple} class="nav-item-terminal" />

  {#if featureFlagsManager.value.search}
    <NavbarItem title={$t('explore')} href={Route.explore()} icon={mdiMagnify} class="nav-item-terminal" />
  {/if}

  {#if featureFlagsManager.value.map}
    <NavbarItem title={$t('map')} href={Route.map()} icon={mdiMapOutline} activeIcon={mdiMap} class="nav-item-terminal" />
  {/if}

  {#if authManager.preferences.memories.enabled && authManager.preferences.memories.sidebarWeb}
    <NavbarItem title={$t('memories')} href={Route.memories()} icon={mdiCardsOutline} activeIcon={mdiCards} class="nav-item-terminal" />
  {/if}

  {#if authManager.preferences.people.enabled && authManager.preferences.people.sidebarWeb}
    <NavbarItem title={$t('people')} href={Route.people()} icon={mdiAccountOutline} activeIcon={mdiAccount} class="nav-item-terminal" />
  {/if}

  {#if authManager.preferences.sharedLinks.enabled && authManager.preferences.sharedLinks.sidebarWeb}
    <NavbarItem title={$t('shared_links')} href={Route.sharedLinks()} icon={mdiLink} class="nav-item-terminal" />
  {/if}

  <NavbarItem
    title={$t('sharing')}
    href={Route.sharing()}
    icon={mdiAccountMultipleOutline}
    activeIcon={mdiAccountMultiple}
    class="nav-item-terminal"
  />

  <NavbarGroup title={$t('library')} size="tiny" class="font-terminal terminal-status" />

  <NavbarItem title={$t('favorites')} href={Route.favorites()} icon={mdiHeartOutline} activeIcon={mdiHeart} class="nav-item-terminal" />

  <NavbarItem
    title={$t('albums')}
    href={Route.albums()}
    icon={{ icon: mdiImageAlbum, flipped: true }}
    bind:expanded={$recentAlbumsDropdown}
    class="nav-item-terminal"
  >
    {#snippet items()}
      <span in:fly={{ y: -20 }} class="hidden md:block">
        <RecentAlbums />
      </span>
    {/snippet}
  </NavbarItem>

  {#if authManager.preferences.tags.enabled && authManager.preferences.tags.sidebarWeb}
    <NavbarItem title={$t('tags')} href={Route.tags()} icon={{ icon: mdiTagMultipleOutline, flipped: true }} class="nav-item-terminal" />
  {/if}

  {#if authManager.preferences.recentlyAdded.sidebarWeb}
    <NavbarItem
      title={$t('recently_added')}
      href={Route.recentlyAdded()}
      icon={{ icon: mdiUploadOutline, flipped: true }}
      class="nav-item-terminal"
    />
  {/if}

  {#if authManager.preferences.folders.enabled && authManager.preferences.folders.sidebarWeb}
    <NavbarItem title={$t('folders')} href={Route.folders()} icon={{ icon: mdiFolderOutline, flipped: true }} class="nav-item-terminal" />
  {/if}

  <NavbarItem title={$t('utilities')} href={Route.utilities()} icon={mdiToolboxOutline} activeIcon={mdiToolbox} class="nav-item-terminal" />

  <NavbarItem
    title={$t('archive')}
    href={Route.archive()}
    icon={mdiArchiveArrowDownOutline}
    activeIcon={mdiArchiveArrowDown}
    class="nav-item-terminal"
  />

  <NavbarItem title={$t('locked_folder')} href={Route.locked()} icon={mdiLockOutline} activeIcon={mdiLock} class="nav-item-terminal" />

  {#if featureFlagsManager.value.trash}
    <NavbarItem title={$t('trash')} href={Route.trash()} icon={mdiTrashCanOutline} activeIcon={mdiTrashCan} class="nav-item-terminal" />
  {/if}

  <BottomInfo class="font-terminal" />
</Sidebar>
