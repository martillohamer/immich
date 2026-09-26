import type { TranscriptionResponseDto } from '@immich/sdk';
import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
import { CancellableTask } from '$lib/utils/cancellable-task';

export const isNotFound = (error: unknown) => {
  return error instanceof Error && 'status' in error && error.status === 404;
};

export class TranscriptManager {
  #data = $state<TranscriptionResponseDto | null>(null);
  #status = $state<'loading' | 'empty' | 'error' | 'success'>('loading');
  #cleared = false;
  #loader = new CancellableTask(undefined, undefined, (error) => {
    this.#status = isNotFound(error) ? 'empty' : 'error';
  });

  get transcript() {
    return this.#data;
  }

  get status() {
    return this.#status;
  }

  async getAssetTranscript(id: string) {
    if (this.#cleared) {
      await this.#loader.reset();
      this.#cleared = false;
    }
    await this.#loader.execute(async () => {
      this.#data = await assetCacheManager.getAssetTranscript(id);
      this.#status = 'success';
    }, false);
  }

  clear() {
    this.#cleared = true;
    this.#data = null;
    this.#status = 'loading';
  }
}

export const transcriptManager = new TranscriptManager();
