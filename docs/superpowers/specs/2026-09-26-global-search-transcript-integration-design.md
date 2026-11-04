# Especificación: Integración de Transcripciones en el Buscador Global

## Resumen

Conectar la tabla `transcript_search` (GIN trigram, ya poblada) con el pipeline de búsqueda global de Immich, permitiendo al usuario buscar en el contenido textual de transcripciones de audio de forma explícita, siguiendo el patrón establecido por `ocr_search`.

## Decisiones

- **Integración como filtro explícito** (`transcript: { matches: string }`), replicando `ocr: StringSimilarityFilterSchema` en `SearchFilterBranch`
- **Snippet de transcripción**: post-procesamiento batch en `searchMetadataV3` (no subquery en Kysely)
- **Patrón de predicado**: `eb.exists(selectFrom('transcript_search').whereRef(...).where(sql\`f_unaccent(transcript_search.text) %>> f_unaccent(...)\`))` — idéntico a `ocr_search` en `branchPredicates`

## Capas a modificar

### 1. Backend — DTOs (`server/src/dtos/search.dto.ts`)

- Añadir `transcript: StringSimilarityFilterSchema` a `searchFilterBranchShape` (junto a `ocr`)
- `SearchFilterBranch` hereda el campo automáticamente
- `SearchFilter` hereda el campo automáticamente
- Sin tipos exportados adicionales necesarios

### 2. Backend — Query Builder (`server/src/utils/database.ts`)

**`branchPredicates()` (L761-772)**: añadir bloque `transcript` idéntico al de `ocr`:
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

**`searchAssetBuilderLegacy` (L517-521)**: añadir `$if(!!options.transcript, ...)` con `innerJoin('transcript_search', ...)` + `%>>` — igual que `ocr`.

**Nota**: `searchAssetBuilderV3` (L797+) usa `branchPredicates` y `filter` directamente. No necesita un `options.transcript` separado — lee del `filter.transcript` en `branchPredicates`.

### 3. Backend — Servicio de Búsqueda (`server/src/services/search.service.ts`)

**`searchMetadataV3` (L241)**: post-procesamiento para snippet:
- Antes de `mapResponse`, verificar si `filter.transcript` o cualquier `branch.transcript` existe
- Si existe, hacer batch query de `transcript_search` para los assetIds resultantes:
  ```ts
  const transcriptTexts = await this.transcriptionRepository.findMatchingSnippets(
    assetIds,
    tokenizeForSearch(transcriptMatches).join(' ')
  );
  ```
- Adjuntar `transcriptSnippet` al `AssetResponseDto` correspondiente

**Nota sobre el DTO**: `AssetResponseDto` necesitará `transcriptSnippet?: string` opcional para la respuesta de búsqueda.

### 4. Backend — Repositorio de Transcripción (`server/src/repositories/transcription.repository.ts`)

Añadir método `findMatchingSnippets(assetIds: string[], query: string): Promise<Map<string, string>>` que:
- SELECT `assetId, text FROM transcript_search WHERE assetId IN (...) AND f_unaccent(text) %>> f_unaccent(query)`
- Retorna `Map<assetId, snippetText>` (primer match por asset)

### 5. Frontend — Tipos (`web/src/lib/types.ts`)

- `SearchFilter` type: añadir `transcript?: { matches: string }`

### 6. Frontend — SearchManager (`web/src/lib/managers/search-manager.svelte.ts`)

- `SearchManager` maneja el campo `transcript` (mapeo entre `SearchFilter` interno y `MetadataSearchDto`/`SmartSearchDto`)
- El campo `transcript` se envía como `filter: { transcript: { matches: ... } }`

### 7. Frontend — Thumbnail (`web/src/lib/components/assets/thumbnail/Thumbnail.svelte`)

- Añadir manejo para `asset.isAudio` (tipo `AssetType.Audio`)
- Badge visual: icono de altavoz / indicador de audio
- Sobre hover: indicador de reproducción

### 8. Frontend — Navegación a AudioViewer

- Cuando un resultado de búsqueda es `AssetType.Audio`, al hacer click abre `AudioViewer` con el asset y la transcripción cargada
- Reutiliza `AudioViewer.svelte` (Task 5) ya implementado

## Flujo de datos

```
Usuario escribe "transcript" en buscador
  → SearchManager.buildQuery() incluye filter.transcript.matches
  → searchMetadataV3(auth, dto) con dto.filter.transcript
  → searchRepository.searchMetadataV3()
  → searchAssetBuilder(db, { filter }, scope)
      → branchPredicates(eb, filter)
          → branch.transcript → eb.exists(transcript_search %>> ...)
      → SELECT ... FROM asset LEFT JOIN asset_exif WHERE ... AND EXISTS(...)
      → SELECT asset.id, asset.type, ... LIMIT/OFFSET
  → mapResponse(items, ...)
      → POST-PROCESO: batch query transcript_search para snippets
      → items[].transcriptSnippet = snippetText
  → SearchResponseDto<AssetResponseDto & { transcriptSnippet? }>
  → Frontend GalleryViewer → Thumbnail(asset.isAudio) → Badge + click → AudioViewer
```

## Restricciones

- Cero `any`
- TypeScript estricto
- No usar `@any` en imports
- No introducir regresiones en búsqueda de fotos/video
- No modificar `server/src/queries/search.repository.sql` (auto-generado)
- No tocar `docs/superpowers/**`

## Tests

- Backend: `search.service.spec.ts` — nuevo test verifica que `transcript` filter produce `EXISTS` en query
- Backend: `transcription.repository.spec.ts` — nuevo test para `findMatchingSnippets`
- Frontend: no se requieren tests de componente para esta capa (el comportamiento se valida en Task 8)
