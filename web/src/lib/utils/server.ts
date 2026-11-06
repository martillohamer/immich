import { setRetryableFetch } from '@immich/sdk';
import { memoize } from 'lodash-es';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
import { initLanguage } from '$lib/utils';

type Fetch = typeof fetch;

async function _init(fetch: Fetch) {
  setRetryableFetch(fetch);
  await initLanguage();
  await serverConfigManager.init();
  await authManager.load();

  if (!serverConfigManager.value.maintenanceMode) {
    await featureFlagsManager.init();
  }
}

export const init = memoize(_init, () => 'singlevalue');
