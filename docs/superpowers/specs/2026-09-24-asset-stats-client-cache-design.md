# Design: Caché en cliente para estadísticas del timeline (Opción A)

**Fecha:** 2026-09-24
**Ámbito:** `web/` (SvelteKit 5, TypeScript estricto). Sin cambios en `packages/sdk`, backend ni DTOs.
**Estado:** aprobado por el usuario.

## Objetivo

Eliminar llamadas HTTP redundantes a `getAssetStatistics({ visibility: Timeline })`:

- `QuickStats.svelte` y `QuickFilterBar.svelte` montan juntos dentro de `{#key assetTypeFilter}` en `+page.svelte`, por lo que cada montaje o cambio de pestaña dispara **2 peticiones HTTP** (una por componente).
- Se introduce un caché en cliente compartido por ambos componentes: 1 sola petición real por ventana de TTL.

## Decisiones acordadas

1. **TTL:** 30 segundos.
2. **Alcance:** caché compartido por `QuickStats` y `QuickFilterBar`.
3. **Enfoque:** servicio + coalescing de Promises (guardar la Promise en vuelo). Sin deps nuevas.
4. **Punto 3 (concurrencia TimelineManager):** la verificación empírica (spec scratch) demostró que el invariante NO existía: `#initializeTimelineMonths` (`timeline-manager.svelte.ts:254`) escribía `this.months` tras el `await getTimeBuckets` sin comprobar la `AbortSignal`, y `updateOptions` proseguía con `updateViewportGeometry` + `#createScrubberMonths` aunque el init hubiera sido cancelado. El resultado cancelado SÍ se aplicaba (stale write). Se incluye un **fix mínimo** (3 puntos en `timeline-manager.svelte.ts`) + test de regresión que verifica el invariante corregido.

## Arquitectura

Nuevo archivo: `web/src/lib/services/asset-statistics.service.ts`

```
getTimelineStats(options?: { force?: boolean }): Promise<AssetStatsResponseDto>
invalidateTimelineStats(): void
```

### Comportamiento

- **Clave:** única constante `AssetVisibility.Timeline`. El caché es un `Map<string, CacheEntry>` generalizado en estructura pero con una sola clave de uso hoy (YAGNI).
- **Coalescing:** mientras una petición está en vuelo se almacena su **Promise** pendiente. Un segundo consumidor obtiene la misma Promise → 1 llamada HTTP.
- **TTL 30s:** al resolver se guarda `{ value, expiresAt }`. Dentro de TTL se devuelve `Promise.resolve(value)`.
- **`force: true`:** ignora el TTL y dispara nueva petición (reintentos / recarga manual).
- **Errores:** si la petición HTTP falla se elimina la entrada del `Map` (no se cachea el error) y se re-lanza para que el componente conserve su `.catch` actual.
- **Tipado:** `AssetStatsResponseDto` y `AssetVisibility` de `@immich/sdk`. `expiresAt` como `Date`. Sin `any`.

### Integración en componentes

- `QuickFilterBar.svelte` `onMount`:
  ```ts
  getTimelineStats()
    .then((measured) => { stats = measured; })
    .catch(() => { stats = undefined; });
  ```
- `QuickStats.svelte` `onMount`:
  ```ts
  statsPromise = getTimelineStats();
  ```
- La presentación (`loading`, `aria-busy`, spinners, contadores, fades) **no cambia**. Cachear solo elimina red.

## Verificación de concurrencia en TimelineManager

- Confirmado: `updateOptions` (`timeline-manager.svelte.ts:275`) → `initTask.reset()` + `initTask.execute(...)`. `CancellableTask` aborta el token del init previo y descarta el resultado obsoleto (`signal.aborted` tras `await`).
- **Bug detectado (stale write):** el scratch `race-scratch.spec.ts` probó que al resolver el fetch cancelado (p1) DESPUÉS del vigente (p2), `months` quedaba con los datos de p1. Causa: `#initializeTimelineMonths` asignaba `this.months` sin chequear `abortSignal.aborted` tras el `await getTimeBuckets`, y `updateOptions` finalizaba `updateViewportGeometry(false)` + `#createScrubberMonths()` pese al init cancelado.
- **Fix mínimo (3 puntos, `web/src/lib/managers/timeline-manager/timeline-manager.svelte.ts`):**
  1. `#initializeTimelineMonths(abortSignal)` — tras el `await getTimeBuckets`, `if (abortSignal.aborted) return;` antes de escribir `this.months`/vaciado/dibujo.
  2. `#init(options)` — pasar la `AbortSignal` al callback de `execute` y devolver `boolean` (init aplicado / cancelado).
  3. `updateOptions` — si el init fue cancelado, no ejecutar `updateViewportGeometry` ni `#createScrubberMonths` con datos obsoletos.
- Limitación conocida (fuera de alcance): el SDK generado no acepta `AbortSignal` en `getTimeBuckets`; la petición HTTP cancelada completa su descarga en red aunque su resultado se descarta. Corregirlo exigiría modificar `packages/sdk` compartido.

## Testing

### a) `web/src/lib/services/asset-statistics.service.spec.ts` (nuevo)

Usa `sdkMock` de `web/src/lib/__mocks__/sdk.mock.ts` y `vi.useFakeTimers()`.

1. **Coalescing:** `Promise.all([getTimelineStats(), getTimelineStats()])` con petición sin resolver → `getAssetStatistics` llamado **1 vez**; ambas promesas resuelven el mismo valor.
2. **TTL 30s:** segunda llamada dentro de TTL → sin llamada nueva al SDK; valor del caché.
3. **`force: true`:** nueva llamada al SDK aunque haya caché válida.
4. **Expiración:** `vi.advanceTimersByTime(30_000)` → nueva llamada al SDK.
5. **Sin cachear errores:** rechazo del SDK → entrada invalidada y error propagado; llamada posterior vuelve a intentar.

### b) `web/src/lib/components/timeline/QuickFilterBar.spec.ts`

Sin cambios. Los 3 tests actuales deben seguir en verde (la UI no cambia, solo la fuente de datos).

### c) `web/src/lib/managers/timeline-manager/timeline-manager.svelte.spec.ts`

Nuevo test de regresión de concurrencia (fase TRANSPORTE, red que va a estar en ROJO antes del fix): con una `updateOptions` en vuelo (mock `getTimeBuckets` con promesa controlable vía `mockReturnValueOnce`), una segunda `updateOptions` con opciones distintas cancela la primera; se resuelve primero la vigente y después la cancelada. Invariante corregido: **el resultado de una inicialización cancelada nunca se aplica** — `months` e `isInitialized` reflejan exclusivamente la última opción activa. Sin el fix mínimo, este test falla con stale write. Nota: la red puede llegar a pagar `getTimeBuckets` por cada `updateOptions` en vuelo (el SDK generado no permite abortar); lo que el fix garantiza es que el resultado obsoleto no tiene efecto observable en el manager.

## Verificación global

- `svelte-check` 0 errores / 0 warnings.
- `tsc --noEmit` limpio en `web/`.
- ESLint sobre los archivos tocados (nuevos + modificados) con `--max-warnings 0`.
- `vitest run` sobre los specs nuevos/afectados: `asset-statistics.service.spec.ts`, `QuickFilterBar.spec.ts`, `timeline-manager.svelte.spec.ts`.