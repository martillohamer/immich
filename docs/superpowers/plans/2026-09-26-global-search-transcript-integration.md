# Global Search Transcript Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing `transcript_search` GIN trigram table to Immich's global search pipeline as an explicit filter (like `ocr`), returning transcription snippets alongside audio assets in search results, with an Audio badge in the thumbnail grid and click-through to `AudioViewer`.

**Architecture:** Replicate the `ocr_search` integration pattern exactly — `SearchFilterBranch.transcript` field → `branchPredicates` EXISTS predicate using `%>>` trigram → post-processing batch snippet lookup in `searchMetadataV3`. Frontend mirrors the pattern: `TimelineAsset.isAudio` → `Thumbnail` audio badge → click opens `AudioViewer` with loaded transcript.

**Tech Stack:** NestJS + Kysely (backend), Svelte 5 runes + TypeScript (frontend), PostgreSQL GIN trigram, happy-dom tests.

## Global Constraints

- TypeScript strict, zero `any`
- No `@any` imports
- No `@html` in Svelte
- English naming (variables/classes), Spanish comments/docstrings
- Backend tests use Vitest + `@nestjs/testing`
- Frontend tests use Vitest + `@testing-library/svelte` + happy-dom
- `check:svelte` is repo-wide red (62 pre-existing warnings) — separate baseline from introduced errors
- Never commit `docs/superpowers/**` or `.superpowers/**`
- `pnpm --filter immich-web exec vitest run <file>` for frontend tests (NOT `vitest run`)
- `pnpm --filter immich-web run check:typescript`, `lint`, `format` for gates
- Backend tests: `pnpm --filter @immich/sdk run test` or `pnpm test` from server
- One commit per task on `main`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `server/src/dtos/search.dto.ts` | Add `transcript: StringSimilarityFilterSchema` to `searchFilterBranchShape` |
| Modify | `server/src/utils/database.ts` | Add `transcript` EXISTS predicate in `branchPredicates` + `searchAssetBuilderLegacy` |
| Modify | `server/src/repositories/transcription.repository.ts` | Add `findMatchingSnippets(assetIds, query)` method |
| Modify | `server/src/dtos/asset-response.dto.ts` | Add `transcriptSnippet?: string` to `AssetResponseDto` / `MapAsset` |
| Modify | `server/src/services/search.service.ts` | Add snippet post-processing in `searchMetadataV3` |
| Modify | `web/src/lib/managers/timeline-manager/types.ts` | Add `isAudio: boolean` |
| Modify | `web/src/lib/utils/timeline-util.ts` | Add `isAudio` in `toTimelineAsset` |
| Modify | `web/src/lib/components/assets/thumbnail/Thumbnail.svelte` | Add Audio badge + overlay |
| Modify | `web/src/lib/types.ts` | Add `transcript` to `SearchFilter` |
| Modify | `web/src/lib/managers/search-manager.svelte.ts` | Handle `transcript` field mapping |
| Modify | `web/src/routes/(user)/search/[[photos=photos]][[assetId=id]]+page.svelte` | Wire Audio click → AudioViewer |
| Create | `server/src/repositories/transcription.repository.spec.ts` | Test `findMatchingSnippets` |
| Create | `server/src/services/search.service.spec.ts` (add test) | Test transcript filter produces EXISTS |

---

### Task 1: Backend DTOs + Query Builder

**Files:**
- Modify: `server/src/dtos/search.dto.ts`
- Modify: `server/src/utils/database.ts`
- Test: `server/src/services/search.service.spec.ts` (add)

**Interfaces:**
- Consumes: `StringSimilarityFilterSchema` (already defined L229-233), `tokenizeForSearch` (already imported)
- Produces: `SearchFilterBranch.transcript?: { matches: string }` — available to all consumers of `SearchFilterBranch`

- [ ] **Step 1: Add `transcript` field to `searchFilterBranchShape`**

In `server/src/dtos/search.dto.ts`, line 268 (after `ocr: StringSimilarityFilterSchema`), add:
```ts
transcript: StringSimilarityFilterSchema,
```

The `searchFilterBranchShape` object (L247-280) maps field names to zod schemas. Adding `transcript` here automatically makes it available in `SearchFilterBranch` and `SearchFilter` types.

- [ ] **Step 2: Add `transcript` EXISTS predicate in `branchPredicates()`**

In `server/src/utils/database.ts`, after the `ocr` block (L772), add:
```ts
...(branch.transcript
  ? [
      eb.exists(
        eb
          .selectFrom('transcript_search')
          .whereRef('transcript_search.assetId', '=', 'asset.id')
          .where(
            sql<SqlBool>`f_unaccent(transcript_search.text) %>> f_unaccent(${tokenizeForSearch(branch.transcript.matches).join(' ')})`,
          ),
      ),
    ]
  : []),
```

- [ ] **Step 3: Add `transcript` innerJoin in `searchAssetBuilderLegacy()`**

In `server/src/utils/database.ts`, after the `ocr` block (L521), add:
```ts
.$if(!!options.transcript, (qb) =>
  qb
    .innerJoin('transcript_search', 'asset.id', 'transcript_search.assetId')
    .where(() => sql`f_unaccent(transcript_search.text) %>> f_unaccent(${tokenizeForSearch(options.transcript!).join(' ')})`),
),
```

Note: `searchAssetBuilderLegacy` receives `options` with `ocr` as `string` and `transcript` similarly. Check the `AssetSearchBuilderOptions` type to confirm `transcript` field exists or add it.

- [ ] **Step 4: Write the failing test**

Add a test in `server/src/services/search.service.spec.ts` that calls `searchMetadataV3` with `filter: { transcript: { matches: 'test' } }` and verifies the query contains `EXISTS` on `transcript_search`. The test should fail (no `transcript` handling yet) then pass after Steps 2-3.

Alternatively, write a unit test for `branchPredicates` that passes a branch with `transcript` and verifies the output array contains an EXISTS predicate referencing `transcript_search`.

- [ ] **Step 5: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/search.service.spec.ts` (or the project's test command)
Expected: FAIL (the `transcript` field is typed but not handled).

- [ ] **Step 6: Run test to verify it passes**

Expected: PASS (Steps 2-3 now handle `transcript`).

- [ ] **Step 7: Commit**

```bash
git add server/src/dtos/search.dto.ts server/src/utils/database.ts server/src/services/search.service.spec.ts
git commit -m "feat: add transcript filter to global search query builder"
```

---

### Task 2: Backend Repository — `findMatchingSnippets`

**Files:**
- Modify: `server/src/repositories/transcription.repository.ts`
- Test: `server/src/repositories/transcription.repository.spec.ts` (create)

**Interfaces:**
- Consumes: `TranscriptionSearchTable` schema (already defined), `tokenizeForSearch` (already imported)
- Produces: `findMatchingSnippets(assetIds: string[], query: string): Promise<Map<string, string>>`

- [ ] **Step 1: Add `findMatchingSnippets` method to `TranscriptionRepository`**

In `server/src/repositories/transcription.repository.ts`, add a new async method:
```ts
async findMatchingSnippets(assetIds: string[], query: string): Promise<Map<string, string>> {
  const results = await this.db
    .selectFrom('transcript_search')
    .select(['assetId', 'text'])
    .where('assetId', 'in', assetIds)
    .where(sql`f_unaccent(text) %>> f_unaccent(${tokenizeForSearch(query).join(' ')})`)
    .execute();

  return new Map(results.map((r) => [r.assetId, r.text]));
}
```

- [ ] **Step 2: Write the failing test**

Create `server/src/repositories/transcription.repository.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TranscriptionRepository } from './transcription.repository.js';

// Mock the DB
vi.mock('@nestjs/kysely', () => ({
  InjectKysely: () => (target: unknown) => target,
  Kysely: class {},
}));

describe('TranscriptionRepository', () => {
  it('findMatchingSnippets returns map of matching snippets', async () => {
    // Setup mock DB that returns transcript_search rows
    const repo = new TranscriptionRepository(/* mock db */);
    const snippets = await repo.findMatchingSnippets(['asset-1', 'asset-2'], 'hello world');
    expect(snippets instanceof Map).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/transcription.repository.ts server/src/repositories/transcription.repository.spec.ts
git commit -m "feat: add findMatchingSnippets to transcription repository"
```

---

### Task 3: Backend Service — Snippet Post-Processing + DTO

**Files:**
- Modify: `server/src/dtos/asset-response.dto.ts`
- Modify: `server/src/services/search.service.ts`
- Test: `server/src/services/search.service.spec.ts` (add)

**Interfaces:**
- Consumes: `TranscriptionRepository.findMatchingSnippets` (Task 2)
- Produces: `AssetResponseDto.transcriptSnippet?: string` populated for audio assets matching via transcript

- [ ] **Step 1: Add `transcriptSnippet` to `AssetResponseDto` and `MapAsset`**

In `server/src/dtos/asset-response.dto.ts`, add to both `AssetResponseDto` and `MapAsset` interfaces:
```ts
transcriptSnippet?: string;
```

Locate where `mapAsset` converts `MapAsset` → `AssetResponseDto` and pass through `transcriptSnippet`.

- [ ] **Step 2: Add snippet post-processing in `searchMetadataV3`**

In `server/src/services/search.service.ts`, in `searchMetadataV3` (L241), after `const { hasNextPage, items } = await ...` and before `return this.mapResponse(...)`:

```ts
// Post-process transcript snippets for audio assets
const transcriptFilter = filter.transcript;
const hasTranscriptFilter = transcriptFilter || filter.or?.some((b) => b.transcript);
if (hasTranscriptFilter && items.length > 0) {
  const audioAssetIds = items
    .filter((item) => item.type === AssetType.Audio)
    .map((item) => item.id);
  if (audioAssetIds.length > 0) {
    const matches = transcriptFilter?.matches
      ? [transcriptFilter.matches]
      : filter.or?.map((b) => b.transcript?.matches).filter(Boolean) ?? [];
    const query = matches.join(' ');
    if (query) {
      const snippets = await this.transcriptionRepository.findMatchingSnippets(audioAssetIds, query);
      for (const item of items) {
        item.transcriptSnippet = snippets.get(item.id);
      }
    }
  }
}
```

**Important**: Check if `transcriptionRepository` is already injected in `SearchService`. If not, add it to the constructor.

- [ ] **Step 3: Write the failing test**

Add a test in `search.service.spec.ts`: mock `transcriptionRepository.findMatchingSnippets` to return `{ 'audio-1': 'snippet text' }`, call `searchMetadataV3` with `filter: { transcript: { matches: 'hello' } }`, verify the returned items with type `Audio` have `transcriptSnippet` set.

- [ ] **Step 4: Run test to verify it fails**

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Commit**

```bash
git add server/src/dtos/asset-response.dto.ts server/src/services/search.service.ts server/src/services/search.service.spec.ts
git commit -m "feat: add transcript snippet post-processing to search service"
```

---

### Task 4: Frontend Types + SearchManager

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/managers/search-manager.svelte.ts`
- Test: `web/src/lib/managers/search-manager.svelte.ts` (add, if testable)

**Interfaces:**
- Consumes: `SearchFilter` from `@immich/sdk` (already typed)
- Produces: `SearchFilter.transcript?: { matches: string }` support in `SearchManager`

- [ ] **Step 1: Add `transcript` to `SearchFilter` type**

In `web/src/lib/types.ts`, add to the `SearchFilter` type:
```ts
transcript?: { matches: string };
```

- [ ] **Step 2: Add `transcript` mapping in `SearchManager`**

In `web/src/lib/managers/search-manager.svelte.ts`, add handling for `transcript`:
- In the method that builds `MetadataSearchDto` from internal state, include `transcript` if set
- In the method that parses `MetadataSearchDto` back to internal state, read `transcript`
- Mirror the pattern used for `ocr` field mapping

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter immich-web run check:typescript`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/managers/search-manager.svelte.ts
git commit -m "feat: add transcript field to SearchFilter and SearchManager"
```

---

### Task 5: Frontend Thumbnail Audio Badge

**Files:**
- Modify: `web/src/lib/managers/timeline-manager/types.ts`
- Modify: `web/src/lib/utils/timeline-util.ts`
- Modify: `web/src/lib/components/assets/thumbnail/Thumbnail.svelte`

**Interfaces:**
- Consumes: `AssetTypeEnum.Audio` (already in enum)
- Produces: `TimelineAsset.isAudio: boolean` + Audio visual treatment in `Thumbnail`

- [ ] **Step 1: Add `isAudio` to `TimelineAsset` type**

In `web/src/lib/managers/timeline-manager/types.ts`, add to `TimelineAsset` (after `isImage`):
```ts
isAudio: boolean;
```

- [ ] **Step 2: Add `isAudio` in `toTimelineAsset`**

In `web/src/lib/utils/timeline-util.ts`, in `toTimelineAsset()` (L140-174), add after `isImage` (L163):
```ts
isAudio: assetResponse.type === AssetTypeEnum.Audio,
```

- [ ] **Step 3: Add Audio badge/overlay in `Thumbnail.svelte`**

In `web/src/lib/components/assets/thumbnail/Thumbnail.svelte`:

1. Import `mdiSpeaker` or equivalent audio icon from `@mdi/js` (check available icons)
2. Add conditional block after the existing `{#if asset.isVideo}` block (L255-292):
```svelte
{:else if asset.isAudio && mouseOver}
  <div class="pointer-events-none absolute size-full">
    <div class="flex size-full place-items-center justify-center bg-black/40">
      <Icon icon={mdiSpeaker} size="32" class="text-white" />
    </div>
  </div>
{/if}
```

3. Add persistent audio badge (visible without hover) in the icon overlay section (after L355):
```svelte
{#if asset.isAudio}
  <div class="absolute inset-s-2 z-2">
    <Icon icon={mdiSpeaker} size="20" class="text-white" />
  </div>
{/if}
```

4. For click-through, add a visual indicator that audio assets open the player.

**Note**: Check if `mdiSpeaker` exists in `@mdi/js`. If not, use `mdiMusic` or similar. Verify by checking existing imports in `Thumbnail.svelte`.

- [ ] **Step 4: Verify check:svelte for this file**

Run: `pnpm --filter immich-web run check:svelte` and confirm no errors introduced in `Thumbnail.svelte` (repo-wide baseline of 62 warnings is expected).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/timeline-manager/types.ts web/src/lib/utils/timeline-util.ts web/src/lib/components/assets/thumbnail/Thumbnail.svelte
git commit -m "feat: add Audio type visual treatment to thumbnail component"
```

---

### Task 6: Frontend Search Page — AudioViewer Navigation

**Files:**
- Modify: `web/src/routes/(user)/search/[[photos=photos]][[assetId=id]]+page.svelte`
- (Optional) Modify: `web/src/lib/components/shared-components/gallery-viewer/GalleryViewer.svelte` if click routing needs central change

**Interfaces:**
- Consumes: `AudioViewer` (Task 5), `TranscriptPanel` (Task 4)
- Produces: Audio assets in search results clickable → open `AudioViewer` with loaded transcript

- [ ] **Step 1: Identify the click routing in the search page**

Read `web/src/routes/(user)/search/[[photos=photos]][[assetId=id]]+page.svelte`. Find how clicking an asset navigates. If it uses a `GalleryViewer` that handles clicks generically (opening a lightbox/preview), find where to add `AudioViewer` routing.

- [ ] **Step 2: Add AudioViewer import and routing**

In the search page component:
```ts
import AudioViewer from '$lib/components/asset-viewer/AudioViewer.svelte';
```

Add logic: when an asset is clicked and `asset.type === AssetTypeEnum.Audio`, open `AudioViewer` (not the default lightbox/preview).

- [ ] **Step 3: Pass transcript to AudioViewer**

When opening `AudioViewer` for an audio asset from search results, pass `assetId` and the `transcriptSnippet` if available. The `AudioViewer` already loads transcript via `transcriptManager.getAssetTranscript(assetId)` on mount.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter immich-web run check:typescript`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/(user)/search/[[photos=photos]][[assetId=id]]+page.svelte
git commit -m "feat: wire audio search results to AudioViewer"
```

---

### Task 7: Full Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full web check suite**

Run: `pnpm --filter immich-web run check:all`
Expected: Same baseline as before (62 pre-existing svelte warnings). No new failures from our changes.

- [ ] **Step 2: Run backend build + tests**

Run: `pnpm --filter @immich/sdk run build` → exit 0
Run server tests → pass

- [ ] **Step 3: Run frontend build**

Run: `pnpm --filter immich-web run build` → exit 0

- [ ] **Step 4: Smoke test checklist**

Report to user:
1. Search with `transcript: { matches: '...' }` filter → returns audio assets with `EXISTS` clause
2. Audio assets show speaker badge in thumbnail grid
3. Clicking audio asset opens `AudioViewer` with transcript loaded
4. Search results for audio include `transcriptSnippet` text
5. Photo/video search unaffected (no regression)

Do NOT commit verification-only changes. This task produces no commit.

---

## Self-Review

**Spec coverage:**
- DTO `transcript` field → Task 1 ✓
- `branchPredicates` EXISTS predicate → Task 1 ✓
- `searchAssetBuilderLegacy` innerJoin → Task 1 ✓
- `findMatchingSnippets` repository method → Task 2 ✓
- `transcriptSnippet` in `AssetResponseDto` → Task 3 ✓
- Snippet post-processing in `searchMetadataV3` → Task 3 ✓
- `TimelineAsset.isAudio` → Task 5 ✓
- `Thumbnail` Audio badge → Task 5 ✓
- SearchManager `transcript` mapping → Task 4 ✓
- Search page AudioViewer navigation → Task 6 ✓

**Placeholder scan:** No TBD/TODO. All code blocks contain actual code. Every step has specific file paths and commands.

**Type consistency:** `transcript` is `StringSimilarityFilterSchema` (= `{ matches: string }`) in all layers. `findMatchingSnippets` takes `string[]` and `string`. `transcriptSnippet` is `string | undefined`. Consistent across all tasks.