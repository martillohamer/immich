# Web Transcription Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show audio playback with a synchronized, click-to-seek transcript panel in the Immich web asset viewer (`AudioViewer` + `TranscriptPanel`), consuming the existing `GET /transcript/:assetId` endpoint.

**Architecture:** A reusable `TranscriptPanel.svelte` renders transcript segments with active-segment highlighting and auto-scroll; it is orchestrated by `AudioViewer.svelte` (media-chrome `<audio>` player) which feeds `currentTime`/`duration` into the panel and seeks on segment click. A `TranscriptManager` store (mirror of `ocr.svelte.ts`) fetches via `AssetCacheManager` (`AsyncCache`), and the SDK gains a hand-added `getAssetTranscript` function + `TranscriptionResponseDto` type (the OpenAPI spec has no Transcript entity yet — verified `idx=-1` — so it is added manually and regenerated later).

**Tech Stack:** Svelte 5 (runes `$state`/`$derived`/`$effect`), media-chrome, svelte-i18n (`$t`), TypeScript strict, vitest 4 + @testing-library/svelte + happy-dom, `@oazapfts/runtime` (SDK fetch).

## Global Constraints

- NO commit: `docs/superpowers/**`, `mise.lock`, `open-api/immich-openapi-specs.json`. Commit per task. No push/merge without user confirmation.
- TypeScript strict, **zero `any`**, zero redundant comments. English naming. No Lombok-analog shortcuts (this repo has none — plain TS/Svelte).
- Do NOT touch `server/`, `machine-learning/`, `mobile/`, `open-api/`.
- SDK type/function are added by hand in `packages/sdk/src/fetch-client.ts` with the exact oazapfts style (4-space indent, single quotes, `oazapfts.ok(oazapfts.fetchJson<...>)`). Do NOT regenerate from OpenAPI.
- Svelte 5 syntax ONLY: `$state` (never `.value` — there is no `.value`), event names are `ontimeupdate`/`ondurationchange`/`onclick` (no `on:name`), `$derived`, `$effect`, `$props`.
- Endpoint contract: 200 → `TranscriptionResponseDto`; **404** (`NotFoundException('Transcript not found')`) → panel `empty` state; other failure → `error` state. 404/errors are resolved in the `CancellableTask` constructor `errorCallback`, because `execute()` catches errors internally and does NOT rethrow (`cancellable-task.ts:84-91`, `#transitionToErrored` calls `errorCallback`).
- To detect 404: `error instanceof Error && 'status' in error && error.status === 404` (runtime `@oazapfts/runtime` throws `HttpError` with a `status` field — NOT the local `ApiError` class in `web/src/lib/utils.ts`, which is only used by XHR `uploadRequest`/`downloadRequest`).
- Audio src = `getAssetMediaUrl({ id, size: AssetMediaSize.Original })` (needs `AssetDownload` permission; shared links without `allowDownload` will fail to play — accepted, document in code with a comment-free i18n error string `transcript_error` reuse is fine; do not add extra comments).
- URL helper proven pattern: `web/src/lib/utils.ts` exports `getAssetMediaUrl`; `AssetMediaSize` comes from `@immich/sdk`.
- Verify with pnpm from repo root (`C:\Users\astur\Desktop\immich-main`): `pnpm --filter @immich/sdk run build`, `pnpm --filter immich-web run lint`, `pnpm --filter immich-web run check:svelte`, `pnpm --filter immich-web run check:typescript`, `pnpm --filter immich-web exec vitest run <file>` (the `vitest` binary is invoked via `exec`, since pnpm resolves a bare `vitest` as a missing script — `pnpm run test` is the same wrapper).
- Do NOT commit the `docs/superpowers/**` directory or handoff.

---

### Task 1: SDK — `TranscriptionResponseDto` type + `getAssetTranscript` function

**Files:**
- Modify: `packages/sdk/src/fetch-client.ts` (insert type after the `AssetOcrResponseDto` type ends ~L1403; insert function after `getAssetOcr` ends ~L4895)

**Interfaces:**
- Produces (used by Tasks 2+):
  - `export type TranscriptionResponseSegmentDto = { end: number; start: number; text: string };` (alphabetical field order: `end`, `start`, `text` — matches oazapfts generated style)
  - `export type TranscriptionResponseDto = { createdAt: Date; language: string; model: string | null; segments: TranscriptionResponseSegmentDto[]; text: string };`
  - `export function getAssetTranscript({ id }: { id: string }, opts?: Oazapfts.RequestOpts): Promise<TranscriptionResponseDto>`

This task has no unit test (the SDK has no test runner — package.json scripts: only `build`). Verification is TypeScript compile + downstream typecheck in Task 5.

- [ ] **Step 1: Insert the two types after `AssetOcrResponseDto`**

Open `packages/sdk/src/fetch-client.ts` and locate the `AssetOcrResponseDto` type (~L1390). Immediately after its closing `};`, insert:

```ts
export type TranscriptionResponseSegmentDto = {
    /** End time of the segment in seconds */
    end: number;
    /** Start time of the segment in seconds */
    start: number;
    /** The segment text */
    text: string;
};

export type TranscriptionResponseDto = {
    /** The date the transcript was created */
    createdAt: Date;
    /** The detected language code */
    language: string;
    /** The model used for transcription */
    model: string | null;
    /** The transcript segments */
    segments: TranscriptionResponseSegmentDto[];
    /** The full transcript text */
    text: string;
};
```

- [ ] **Step 2: Insert `getAssetTranscript` after `getAssetOcr`**

Locate the `getAssetOcr` function (~L4886-4895). Immediately after its closing `}` (the function ends with `}));` then `}`), insert:

```ts
/**
 * Retrieve an asset transcript
 */
export function getAssetTranscript(
    { id }: {
        id: string;
    },
    opts?: Oazapfts.RequestOpts,
) {
    return oazapfts.ok(
        oazapfts.fetchJson<{
            status: 200;
            data: TranscriptionResponseDto;
        }>(`/transcript/${encodeURIComponent(id)}`, {
            ...opts,
        }),
    );
}
```

Match the exact formatting of the neighboring `getAssetOcr` function (check its body indentation — it may be `oazapfts.ok(oazapfts.fetchJson<...>(url, { ...opts }))` on fewer lines; clone its shape precisely).

- [ ] **Step 3: Build the SDK**

Run: `pnpm --filter @immich/sdk run build`
Expected: `tsc` exits 0, emits `packages/sdk/build/`. If there is no build/ dir, `"main": "./build/index.js"` requires it — `tsc` creates it.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/fetch-client.ts packages/sdk/build
git commit -m "feat: add getAssetTranscript to SDK"
```

---

### Task 2: `AssetCacheManager` — transcript cache

**Files:**
- Modify: `web/src/lib/managers/AssetCacheManager.svelte.ts`

**Interfaces:**
- Consumes: `getAssetTranscript` from Task 1 (`@immich/sdk`).
- Produces (used by Tasks 3+):
  - `class AssetCacheManager` gains `getAssetTranscript(id: string): Promise<TranscriptionResponseDto>`
  - `getAssetTranscript` -> `this.#transcriptCache.getOrFetch({ id }, true)` (mirror `#ocrCache.getAssetOcr` L58-60)
  - `clearTranscriptCache()` -> `this.#transcriptCache.clear()` (mirror `clearOcrCache` L77-79)
  - `invalidateAsset(id)` adds `this.#transcriptCache.clearKey({ id });` (L66-71)
  - `invalidate()` adds `this.clearTranscriptCache();` (L85-89)

No unit test (manager already has none — it is integration-verified via Task 3 store test which mocks it at module level).

- [ ] **Step 1: Add the import + cache field**

In `web/src/lib/managers/AssetCacheManager.svelte.ts` L1, change:

```ts
import { getAssetInfo, getAssetOcr, getFaces } from '@immich/sdk';
```

to:

```ts
import { getAssetInfo, getAssetOcr, getAssetTranscript, getFaces } from '@immich/sdk';
```

In the `AssetCacheManager` class (after L41 `#faceCache = new AsyncCache(getFaces);`), add:

```ts
  #transcriptCache = new AsyncCache(getAssetTranscript);
```

- [ ] **Step 2: Add getter + clear method**

After `getAssetFaces` (L62-64), add:

```ts
  async getAssetTranscript(id: string) {
    return this.#transcriptCache.getOrFetch({ id }, true);
  }
```

After `clearFaceCache` (L81-83), add:

```ts
  clearTranscriptCache() {
    this.#transcriptCache.clear();
  }
```

- [ ] **Step 3: Wire invalidations**

In `invalidateAsset(id)` (L66-71), add `this.#transcriptCache.clearKey({ id });` after the faces line.

In `invalidate()` (L85-89), add `this.clearTranscriptCache();` after the faces line.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter immich-web run check:typescript`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/AssetCacheManager.svelte.ts
git commit -m "feat: add transcript cache to asset cache manager"
```

---

### Task 3: `TranscriptManager` store + unit test

**Files:**
- Create: `web/src/lib/stores/transcript.svelte.ts`
- Create: `web/src/lib/stores/transcript.svelte.spec.ts` (co-located beside the store, matching the `ocr.svelte.spec.ts` convention)

**Interfaces:**
- Consumes: `assetCacheManager.getAssetTranscript` (Task 2), `CancellableTask` (`web/src/lib/utils/cancellable-task.ts`), `TranscriptionResponseDto` + `HttpError` shape.
- Produces (used by Task 4):
  - `class TranscriptManager` with:
    - `get transcript(): TranscriptionResponseDto | null`
    - `get status(): 'loading' | 'empty' | 'error' | 'success'`
    - `getAssetTranscript(id: string): Promise<void>`
    - `clear(): void`
  - `export const transcriptManager = new TranscriptManager();`
  - `export const isNotFound = (error: unknown): boolean` (also exported so Task 4 can reuse/react — it is a pure helper)

Key behavioral spec:
- On success: `status === 'success'`, `transcript` set.
- On 404 (error has `status === 404`): `status === 'empty'`, `transcript` stays `null`.
- On any other error: `status === 'error'`, `transcript` stays `null`.
- Cancellation (`AbortError`) does NOT flip status (implemented by `CancellableTask.execute` catching it as `'CANCELED'` and not calling `errorCallback`).
- `clear()` → `#cleared = true`, `#data = null`, `#status = 'loading'`. Next `getAssetTranscript` sees `#cleared` → `reset()` then proceeds.

Use the exact `ocr.svelte.ts` shape (`web/src/lib/stores/ocr.svelte.ts` L20-56), with the following transcribed + status additions:

```ts
#data = $state<TranscriptionResponseDto | null>(null);
#status = $state<'loading' | 'empty' | 'error' | 'success'>('loading');
#cleared = false;
```

- [ ] **Step 1: Write the failing store test**

Follow the `ocr.svelte.spec.ts` mocking convention exactly: `vi.mock('@immich/sdk', ...)` at module top, use the exported singleton via `beforeEach` reset, operate on the singleton (no `new TranscriptManager()` — the singleton's `$state` is what `$derived` reads, and the singleton starts `'loading'`/`null` which your test's first assertion should confirm).

CRITICAL for test isolation: `getAssetTranscript` goes through the REAL `assetCacheManager`'s `#transcriptCache` (`getOrFetch` caches by key). Tests reuse `'asset-1'`, so the beforeEach MUST call `assetCacheManager.clearTranscriptCache()` (added in Task 2) exactly as `ocr.svelte.spec.ts` clears `assetCacheManager.clearOcrCache()` in its beforeEach — otherwise the 404 test receives the cached success from an earlier test.

Create `web/src/lib/stores/transcript.svelte.spec.ts`:

```ts
import { getAssetTranscript } from '@immich/sdk';
import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transcriptManager } from '$lib/stores/transcript.svelte';
import type { TranscriptionResponseDto } from '@immich/sdk';

// Mock the SDK
vi.mock('@immich/sdk', () => ({
  getAssetInfo: vi.fn(),
  getAssetTranscript: vi.fn(),
  getFaces: vi.fn(),
}));

const transcript: TranscriptionResponseDto = {
  text: 'Hola mundo',
  segments: [{ start: 0, end: 2.4, text: 'Hola' }],
  language: 'es',
  model: 'whisper',
  createdAt: new Date('2026-09-26T00:00:00Z'),
};

const notFoundError = Object.assign(new Error('Transcript not found'), { status: 404 });

describe('TranscriptManager', () => {
  beforeEach(() => {
    transcriptManager.clear();
    assetCacheManager.clearTranscriptCache();
    vi.clearAllMocks();
  });

  it('loads a transcript successfully', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.getAssetTranscript('asset-1');

    expect(getAssetTranscript).toHaveBeenCalledWith({ id: 'asset-1' });
    expect(transcriptManager.status).toBe('success');
    expect(transcriptManager.transcript).toEqual(transcript);
  });

  it('sets empty status when the transcript is a 404', async () => {
    vi.mocked(getAssetTranscript).mockRejectedValue(notFoundError);

    await transcriptManager.getAssetTranscript('asset-1');

    expect(transcriptManager.status).toBe('empty');
    expect(transcriptManager.transcript).toBeNull();
  });

  it('sets error status for other failures', async () => {
    vi.mocked(getAssetTranscript).mockRejectedValue(new Error('network down'));

    await transcriptManager.getAssetTranscript('asset-1');

    expect(transcriptManager.status).toBe('error');
    expect(transcriptManager.transcript).toBeNull();
  });

  it('resets to loading after clear and refetches', async () => {
    vi.mocked(getAssetTranscript).mockResolvedValue(transcript);

    await transcriptManager.getAssetTranscript('asset-1');
    transcriptManager.clear();

    expect(transcriptManager.status).toBe('loading');
    expect(transcriptManager.transcript).toBeNull();

    await transcriptManager.getAssetTranscript('asset-1');
    expect(transcriptManager.status).toBe('success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter immich-web exec vitest run src/lib/stores/transcript.svelte.spec.ts`
Expected: FAIL — cannot find module `$lib/stores/transcript.svelte` (file does not exist yet).

- [ ] **Step 3: Write the store**

Create `web/src/lib/stores/transcript.svelte.ts`:

```ts
import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
import { CancellableTask } from '$lib/utils/cancellable-task';
import type { TranscriptionResponseDto } from '@immich/sdk';

export const isNotFound = (error: unknown) => {
  return error instanceof Error && 'status' in error && error.status === 404;
};

export class TranscriptManager {
  #data = $state<TranscriptionResponseDto | null>(null);
  #status = $state<'loading' | 'empty' | 'error' | 'success'>('loading');
  #cleared = false;
  #loader = new CancellableTask(
    undefined,
    undefined,
    (error) => {
      this.#status = isNotFound(error) ? 'empty' : 'error';
    },
  );

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
```

Note: `isNotFound`'s return type is inferred as `boolean` (`&&` expression). Do not annotate with explicit `any`; the `'status' in error` narrowing works because `error` is `unknown` → in the `&&` chain TypeScript narrows to `Error & Record<'status', unknown>` then `error.status === 404` is `boolean`. If the check `pnpm --filter immich-web run check:typescript` complains about `status` type, keep exactly the above — it is valid.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter immich-web exec vitest run src/lib/stores/transcript.svelte.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter immich-web run check:typescript` and `pnpm --filter immich-web run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/stores/transcript.svelte.ts web/src/lib/stores/transcript.svelte.spec.ts
git commit -m "feat: add transcript manager store"
```

---

### Task 4: `TranscriptPanel.svelte` + unit test

**Files:**
- Create: `web/src/lib/components/asset-viewer/TranscriptPanel.svelte`
- Create: `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` (co-located beside the component, matching `DeleteAction.spec.ts` convention)

**Interfaces:**
- Consumes: `transcriptManager` (Task 3), `$t` from `svelte-i18n`, buttons + tailwind `bg-immich-primary`/`hover:bg-immich-gray`/`bg-immich-bg`.
- Produces (used by Task 5):
  - Props: `{ assetId: string; currentTime: number; duration: number; onSeek: (time: number) => void }`
  - Renders segment `<button>` elements with `onclick={() => onSeek(segment.start)}`; active segment (start ≤ currentTime < end) has class `bg-immich-primary dark` (mirror `OcrButton.svelte:11` active styling) + `text-white`; inactive is `hover:bg-immich-gray`.
  - Adds `data-testid="transcript-empty"` / `data-testid="transcript-error"` / `data-testid="transcript-loading"` on the respective state containers so tests are deterministic regardless of i18n.
  - Header always shows `{$t('transcript_title')}` and, in success with model, `{$t('transcript_model')}: {model}`.
  - Auto-scroll active segment to center via `segmentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })` guarded by `!userScrolling` (wheel/touchmove on the scroll container sets `userScrolling = true`, cleared after 2s).

- [ ] **Step 1: Write the failing component test**

**IMPORTANT — reactive state in the test:** the panel reads `$derived(transcriptManager.status)` / `$derived(transcriptManager.transcript)`. Because the module mock replaces the manager with a plain (non-`$state`) object, the `$derived` will compute from whatever values exist at first render. Therefore each test must **set the mock's values BEFORE `render`** and keep the panel in one static state per test. Use a mutable holder (`factory`) whose getters the mock reads:

Create `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TranscriptPanel from './TranscriptPanel.svelte';
import type { TranscriptionResponseDto } from '@immich/sdk';

type ManagerState = {
  status: 'loading' | 'empty' | 'error' | 'success';
  transcript: TranscriptionResponseDto | null;
};

const factory: { manager: ManagerState } = {
  manager: { status: 'loading', transcript: null },
};

vi.mock(import('$lib/stores/transcript.svelte'), () => ({
  transcriptManager: {
    get status() {
      return factory.manager.status;
    },
    get transcript() {
      return factory.manager.transcript;
    },
    getAssetTranscript: vi.fn(),
    clear: vi.fn(),
  },
}));

const transcript: TranscriptionResponseDto = {
  text: 'Hola mundo',
  segments: [
    { start: 0, end: 2.4, text: 'Hola' },
    { start: 2.4, end: 5, text: 'mundo' },
  ],
  language: 'es',
  model: 'whisper',
  createdAt: new Date('2026-09-26T00:00:00Z'),
};

describe('TranscriptPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    factory.manager = { status: 'loading', transcript: null };
    vi.clearAllMocks();
  });

  it('renders segments and highlights the active one', () => {
    factory.manager = { status: 'success', transcript };

    const { getByText, getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 1,
      duration: 5,
      onSeek: vi.fn(),
    });

    expect(getByText('Hola')).toBeInTheDocument();
    expect(getByText('mundo')).toBeInTheDocument();
    expect(getByTestId('transcript-heading')).toBeInTheDocument();
  });

  it('calls onSeek with the segment start time when clicked', async () => {
    factory.manager = { status: 'success', transcript };
    const onSeek = vi.fn();

    const { getAllByRole } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek,
    });

    await fireEvent.click(getAllByRole('button')[1]);
    expect(onSeek).toHaveBeenCalledWith(2.4);
  });

  it('shows empty testid when status is empty', () => {
    factory.manager = { status: 'empty', transcript: null };

    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });

    expect(getByTestId('transcript-empty')).toBeInTheDocument();
  });

  it('shows error testid when status is error', () => {
    factory.manager = { status: 'error', transcript: null };

    const { getByTestId } = render(TranscriptPanel, {
      assetId: 'asset-1',
      currentTime: 0,
      duration: 5,
      onSeek: vi.fn(),
    });

    expect(getByTestId('transcript-error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter immich-web exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts`
Expected: FAIL — cannot find module `./TranscriptPanel.svelte`.

- [ ] **Step 3: Write the component**

Create `web/src/lib/components/asset-viewer/TranscriptPanel.svelte`:

```svelte
<script lang="ts">
  import { $derived, $effect, $props } from 'svelte';
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import { t } from 'svelte-i18n';

  let {
    assetId,
    currentTime,
    duration,
    onSeek,
  }: {
    assetId: string;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
  } = $props();

  let transcript = $derived(transcriptManager.transcript);
  let status = $derived(transcriptManager.status);
  let userScrolling = false;

  $effect(() => {
    void transcriptManager.getAssetTranscript(assetId);
    return () => transcriptManager.clear();
  });

  let activeIndex = $derived(
    transcript?.segments.findIndex((segment) => currentTime >= segment.start && currentTime < segment.end) ?? -1,
  );

  let segmentEl: HTMLElement | undefined;
  $effect(() => {
    if (activeIndex >= 0 && !userScrolling) {
      segmentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  let scrollContainer: HTMLElement | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const handleScrollStart = () => {
    userScrolling = true;
    if (scrollTimer) {
      clearTimeout(scrollTimer);
    }
    scrollTimer = setTimeout(() => {
      userScrolling = false;
    }, 2000);
  };
</script>

<div class="fixed bottom-0 left-0 right-0 z-40 mt-2 max-h-[30vh] overflow-y-auto border-t border-immich-gray/30 bg-immich-bg/95 backdrop-blur-sm" bind:this={scrollContainer} onwheel={handleScrollStart} ontouchmove={handleScrollStart}>
  <div class="mx-auto flex max-w-4xl flex-col gap-2 p-4">
    <div class="flex items-baseline justify-between" data-testid="transcript-heading">
      <h2 class="text-sm font-semibold text-immich-primary">{$t('transcript_title')}</h2>
      {#if status === 'success' && transcript?.model}
        <span class="text-xs text-immich-gray">{$t('transcript_model')}: {transcript.model}</span>
      {/if}
    </div>

    {#if status === 'loading'}
      <div data-testid="transcript-loading" class="text-sm text-immich-gray">{$t('transcript_loading')}</div>
    {:else if status === 'empty'}
      <div data-testid="transcript-empty" class="text-sm text-immich-gray">{$t('transcript_empty')}</div>
    {:else if status === 'error'}
      <div data-testid="transcript-error" class="text-sm text-red-600">{$t('transcript_error')}</div>
    {:else if transcript}
      <div class="flex flex-col gap-1">
        {#each transcript.segments as segment, index (index)}
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-start text-sm leading-relaxed transition-colors {index === activeIndex ? 'bg-immich-primary dark text-white' : 'hover:bg-immich-gray'} "
            onclick={() => onSeek(segment.start)}
            bind:this={index === activeIndex ? segmentEl : undefined}
          >
            {@html segment.text}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
```

Notes:
- `@html` is used because Whisper segment text may contain entity-escaped apostrophes/etc. originating from the ML pipeline's JSON; `{segment.text}` would double-escape. This matches the transcript being trusted server data (`@Authenticated(AssetRead)`) — acceptable.
- The `{@html segment.text}` may trip eslint (`svelte/no-at-html-tags`). If the lint step fails on `@html`, replace with a `{@render}` that builds text via `{@html}` inside a svelte:component? No — simplest compliant fix: use plain `{segment.text}` for now (ignore double-escape edge), and if lint still fails, add a one-line regex sanitization mapping `<`/`>`/`&` of the segment text in a `$derived` strip. Decide based on lint output in Step 5.
- `segmentEl` binding is best-effort; the `bind:this` on a conditional element works in Svelte 5 as long as exactly one matching element is in the current `#if`. This satisfies the auto-scroll test (`Element.prototype.scrollIntoView = vi.fn()`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter immich-web exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts`
Expected: PASS (4 tests). If the `#each` + `bind:this` pattern produces a Svelte compile warning (`each` block children should not be modified) — it won't: `bind:this` inside `#if` is fine — but if a `svelte-check` or vitest compile error occurs around `bind:this` in `#each`, restructure to track the active segment element via an `on` built with `data-index` and find it imperatively in the `$effect`:

```ts
$effect(() => {
  if (activeIndex >= 0 && !userScrolling) {
    const el = scrollContainer?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
```

And on the button add `data-active={index === activeIndex ? 'true' : undefined}` instead of `bind:this`. Use the version that compiles cleanly.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter immich-web run lint` and `pnpm --filter immich-web run check:svelte` and `pnpm --filter immich-web run check:typescript`
Expected: exit 0 (see `@html` note above — if `svelte/no-at-html-tags` fires, apply the replacement documented in Step 3 Notes; do not add `eslint-disable` without comment).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/components/asset-viewer/TranscriptPanel.svelte web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts
git commit -m "feat: add transcript panel component"
```

---

### Task 5: `AudioViewer.svelte`

**Files:**
- Create: `web/src/lib/components/asset-viewer/AudioViewer.svelte`

**Interfaces:**
- Consumes: `TranscriptPanel` (Task 4), `getAssetMediaUrl` (`$lib/utils`) + `AssetMediaSize` (`@immich/sdk`), media-chrome web components (already used by `VideoNativeViewer.svelte`), `t` from `svelte-i18n`.
- Produces (used by Task 6):
  - `AudioViewer` component with prop `{ asset: AssetResponseDto }`
  - `<media-controller>` containing `<audio slot="media" ...>` with `bind:this={audio}` and a `<media-control-bar slot="controls">` with `media-play-button`, `media-time-display`, `media-mute-button` + `media-volume-range`, `media-settings-menu-button` + `media-playback-rate-menu` (rates `0.5 1 1.5 2`), and `immich-time-range` as the scrubber (NOT `media-time-range`, NOT seek buttons — this repo does not use media-seek-backward/forward).
  - `<TranscriptPanel {assetId: asset.id} {currentTime} {duration} onSeek={seekTo} />` where `seekTo(time)` sets `audio.currentTime = time` and calls `void audio.play()`.
  - `let audio = $state<HTMLAudioElement>()` bound via `bind:this`; `currentTime`/`duration` `$state(0)` updated via `ontimeupdate`/`ondurationchange` handlers reading `audio?.currentTime`.

No dedicated unit test (media-chrome custom elements under happy-dom make this an integration concern covered by manual verification in Task 8 + lint/typecheck). Match `VideoNativeViewer.svelte`'s media-chrome imports exactly.

- [ ] **Step 1: Copy the media-chrome import list + control bar markup from VideoNativeViewer**

Open `web/src/lib/components/asset-viewer/VideoNativeViewer.svelte` L30-47. Copy the exact `import 'media-chrome/media-*'` / `import 'media-chrome/menu/media-*'` statements and the `./immich-time-range` one. Note the actual element names used there: `media-controller`, `media-control-bar`, `media-play-button`, `media-time-display`, `media-mute-button`, `media-volume-range`, `media-settings-menu-button`, `media-settings-menu`, `media-settings-menu-item`, `media-playback-rate-menu`, `media-fullscreen-button`. There are NO seek buttons and NO direct `media-time-range` use. The scrubber is `<immich-time-range>`. For AudioViewer import only the subset needed: `media-chrome/media-controller`, `media-chrome/media-control-bar`, `media-chrome/media-play-button`, `media-chrome/media-time-display`, `media-chrome/media-mute-button`, `media-chrome/media-volume-range`, `media-chrome/menu/media-playback-rate-menu`, `media-chrome/menu/media-settings-menu`, `media-chrome/menu/media-settings-menu-button`, `media-chrome/menu/media-settings-menu-item`, and `./immich-time-range`.

Also copy the playback-rate submenu markup style from L433-453 (the `<media-settings-menu hidden anchor="auto">` with a `<media-settings-menu-item>` containing `<media-playback-rate-menu slot="submenu" hidden rates="0.5 1 1.5 2">`).

- [ ] **Step 2: Write the component**

Create `web/src/lib/components/asset-viewer/AudioViewer.svelte`:

```svelte
<script lang="ts">
  import { $props, $state } from 'svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize, type AssetResponseDto } from '@immich/sdk';
  import { mdiCheck, mdiChevronLeft, mdiChevronRight, mdiPause, mdiPlay, mdiVolumeHigh, mdiVolumeLow, mdiVolumeMedium, mdiVolumeMute } from '@mdi/js';
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

  const src = getAssetMediaUrl({ id: asset.id, size: AssetMediaSize.Original });

  const handleTimeUpdate = () => {
    currentTime = audio?.currentTime ?? 0;
  };

  const handleDurationChange = () => {
    duration = audio?.duration ?? 0;
  };

  const seekTo = (time: number) => {
    if (audio) {
      audio.currentTime = time;
      void audio.play();
    }
  };
</script>

<div class="flex h-full w-full flex-col bg-immich-bg">
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

          <div class="volume-wrapper shrink-0 rounded-full bg-light-100/0 transition-colors duration-400 hover:bg-light-100">
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
  <TranscriptPanel {assetId: asset.id} {currentTime} {duration} onSeek={seekTo} />
</div>
```

**IMPORTANT — copy, do not invent:** the element names above are exactly what `VideoNativeViewer.svelte` uses (cross-check L425-486 while writing). `media-controller`'s `--media-*` CSS custom properties from VideoNativeViewer's `<style>` block (L503-533) may also be copied into AudioViewer so the controls render identically. Do NOT add `media-seek-backward-button`/`media-seek-forward-button`/`media-fullscreen-button` to the audio viewer; the first two don't appear in this repo and fullscreen is meaningless for audio.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter immich-web run check:svelte` and `pnpm --filter immich-web run check:typescript` and `pnpm --filter immich-web run lint`
Expected: exit 0. Remove any unused imports (e.g. `AssetTypeEnum` is NOT needed here — omit it from the `@immich/sdk` import).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/components/asset-viewer/AudioViewer.svelte
git commit -m "feat: add audio viewer with transcript panel"
```

---

### Task 6: Integrate into `AssetViewer.svelte`

**Files:**
- Modify: `web/src/lib/components/asset-viewer/AssetViewer.svelte`

**Interfaces:**
- Consumes: `AudioViewer` (Task 5), `AssetTypeEnum` (already imported in `AssetViewer.svelte`).
- Produces: `viewerKind` returns `'AudioViewer'` for `asset.type === AssetTypeEnum.Audio`; template renders `<AudioViewer {asset} />` in the viewer area.

- [ ] **Step 1: Read the current imports + viewerKind derivation**

Open `web/src/lib/components/asset-viewer/AssetViewer.svelte`:
- Imports at L1-85 — locate the asset-viewer component imports (search `from './`).
- `viewerKind` `$derived` at L429-449 (starts with the `previewStackedAsset` check, then `asset.type === AssetTypeEnum.Video` → `'VideoViewer'`, then motion photo, panorama, editor, default `'PhotoViewer'`).
- Template area inside `<section id="immich-asset-viewer">` at L544-591 — the `{:else if viewerKind === 'StackVideoViewer'}` / `{:else if viewerKind === 'LiveVideoViewer'}` / `{:else if viewerKind === 'ImagePanaramaViewer'}` / `{:else if viewerKind === 'CropArea'}` / `{:else if viewerKind === 'PhotoViewer'}` / `{:else if viewerKind === 'VideoViewer'}` chain ending with `{/if}` at L591.

Add near the other `./` component imports (they are bunched near the top of the `<script>`; add yours alphabetically with them):

```ts
import AudioViewer from './AudioViewer.svelte';
```

- [ ] **Step 2: Add the Audio branch to viewerKind**

In the `viewerKind` derivation, insert as the FIRST audio check, immediately AFTER the `previewStackedAsset` block and BEFORE the `if (asset.type === AssetTypeEnum.Video)` video branch (so audio assets never fall through to the video/photo branches):

```ts
if (asset.type === AssetTypeEnum.Audio) {
  return 'AudioViewer';
}
```

`AssetTypeEnum` is already imported at the top of the file (the viewer uses `AssetTypeEnum.Video`/`AssetTypeEnum.Image`).

- [ ] **Step 3: Render AudioViewer in the template**

In the Asset Viewer chain (L546-591), add the branch immediately AFTER the `{:else if viewerKind === 'LiveVideoViewer'}` block and BEFORE `{:else if viewerKind === 'ImagePanaramaViewer'}` (order in the chain is not functionally critical since the values are mutually exclusive, but keep it grouped with the other media viewers):

```svelte
{:else if viewerKind === 'AudioViewer'}
  <AudioViewer {asset} />
```

The existing branches compare against the exact string values returned by `viewerKind` (e.g. `'VideoViewer'`, `'LiveVideoViewer'`, `'ImagePanaramaViewer'`, `'CropArea'`, `'PhotoViewer'`) — mirror that style exactly with `'AudioViewer'`.

NOTE: `previewStackedAsset` for a non-image stack returns `'StackVideoViewer'`; an Audio asset is never in a stack preview, so the audio branch after the stack check is correct.

- [ ] **Step 4: Typecheck + lint + svelte-check**

Run: `pnpm --filter immich-web run check:typescript` and `pnpm --filter immich-web run check:svelte` and `pnpm --filter immich-web run lint`
Expected: exit 0.

NOTE: `check:svelte` is `svelte-check --no-tsconfig --fail-on-warnings --compiler-warnings 'state_referenced_locally:ignore'` (per `web/package.json`). New Svelte 5 runes code must not hit `--fail-on-warnings`.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/asset-viewer/AssetViewer.svelte
git commit -m "feat: render audio viewer in asset viewer"
```

---

### Task 7: i18n keys (`es`, `en` done)

**Files:**
- Modify: `i18n/es.json`
- (No-op: `i18n/en.json` — the 5 `transcript_*` keys were already committed with Task 4, forced because `web/src/app.d.ts` derives the `Translations` type from `en.json` and the panel cannot typecheck without them. Verify they live at the top level in strict alphabetical order; do NOT re-add them.)

**Interfaces:**
- Consumes: `$t('transcript_title')`, `$t('transcript_model')`, `$t('transcript_loading')`, `$t('transcript_empty')`, `$t('transcript_error')` (Tasks 4-5).
- Produces: typed i18n — `web/src/app.d.ts` already does `import type en from '$i18n/en.json'`, and `$t` becomes typed automatically once the keys exist.

- [ ] **Step 1: Verify en.json state (informational)**

Open `i18n/en.json`. The 5 keys `transcript_empty`, `transcript_error`, `transcript_loading`, `transcript_model`, `transcript_title` must already be present at the TOP LEVEL (not nested) in alphabetical order (git show shows them committed with Task 4). Confirm; if any are missing, add them at the strict alphabetical position and note it in your report.

- [ ] **Step 2: Add Spanish keys**

In `i18n/es.json`, insert (alphabetical position):

```json
"transcript_empty": "No hay transcripción disponible para este recurso.",
"transcript_error": "No se pudo cargar la transcripción.",
"transcript_loading": "Cargando transcripción...",
"transcript_model": "Modelo",
"transcript_title": "Transcripción",
```

- [ ] **Step 3: Validate JSON + lint**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/es.json','utf8')); console.log('ok')"`.

Also run: `pnpm --filter immich-web run check:typescript` (ensures `$t('transcript_...')` resolves against the new type) 
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add i18n/es.json
git commit -m "feat: add transcript i18n keys"
```

---

### Task 8: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full web check suite**

Run (from repo root): `pnpm --filter immich-web run check:all`
Expected: `format` + `lint` + `check:svelte` + `check:typescript` + `test:cov` all pass. If `test:cov` fails on coverage thresholds unrelated to our new files, check the threshold config; our new test files are `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` and `web/src/lib/stores/transcript.svelte.spec.ts`. If coverage gate fails only on AudioViewer.svelte/AssetViewer branches having no tests, that is pre-existing behavior (other viewers have no direct tests) — note it, don't add tests just to satisfy coverage.

- [ ] **Step 2: Build both packages**

Run: `pnpm --filter @immich/sdk run build`
Expected: exit 0.

Run: `pnpm --filter immich-web run build`
Expected: exit 0 (SvelteKit build).

- [ ] **Step 3: Manual smoke test (list for the user)**

Report this checklist to the user:
1. Open an audio asset (serie de cátedra) with a transcript → panel appears below the player.
2. Play: the active segment highlights as `timeupdate` fires; panel auto-scrolls to keep the active segment centered (unless the user scrolls manually).
3. Click a segment → audio seeks and plays.
4. Playback-rate menu → 0.5x/1x/1.5x/2x works.
5. An audio without transcript → `empty` state text.
6. Shared link without `allowDownload` → audio fails to load; panel shows `transcript_error` (404 on transcript) — document expected behavior.

Do NOT commit verification-only changes. This task produces no commit.

---

## Self-Review

**Spec coverage:**
- Decision 2 (TranscriptManager + AssetCacheManager cache) → Tasks 2, 3 ✓
- Decision 3 (original URL, error state) → Task 5 + error path in Task 3 ✓
- Decision 4 (manual SDK, no regen) → Task 1 ✓
- Decision 5 (panel fixed bottom, auto-scroll center, userScrolling guard) → Task 4 ✓
- Decision 6 (i18n en/es flat keys, typed) → Task 7 ✓
- Decision 7 (no MediaChromeDefaults changes) → Task 5 uses existing media-chrome translations only ✓
- Contrato 200/404/403 → Task 3 (`empty`/`error`) ✓
- Arquitectura (viewerKind branch + `{:else if}`) → Task 6 ✓

**Placeholder scan:** The only intentional non-literal section is Task 5's media-chrome control bar (Task 5 Step 2 explicitly instructs copying VideoNativeViewer's exact elements) and Task 6's branching literals (mirror existing string values). These are deliberate instructions to read the source of truth, not placeholders.

**Type consistency:**
- `isNotFound` exported in Task 3 and reused in Task 4 reactively only if needed — Task 4 panel does not call `isNotFound` directly (status comes from the manager), so no cross-task signature drift.
- `TranscriptManager.transcript`/`status` getters → used by Task 2 test and Task 4 panel. Consistent.
- `getAssetTranscript(id: string)` everywhere (SDK Task 1: `{ id }` param; store Task 3: `id: string`; manager Task 2: `id: string`). Consistent.
- `TranscriptionResponseDto` fields `createdAt/language/model/segments/text` used consistently across Task 1 (type), Task 3 (test fixture), Task 4 (test fixture). Consistent.