# Plan: Caché en cliente para estadísticas del timeline (Opción A) + fix de stale write

**Fecha:** 2026-09-24
**Base:** commit actual de `main` (fork local de Immich, `web/`).
**Spec:** `docs/superpowers/specs/2026-09-24-asset-stats-client-cache-design.md`
**Método:** TDD (RED → GREEN → REFACTOR) por cada trozo; commits pequeños y revisables.

## Alcance

| Archivo | Tipo |
| --- | --- |
| `web/src/lib/services/asset-statistics.service.ts` | NUEVO |
| `web/src/lib/services/asset-statistics.service.spec.ts` | NUEVO |
| `web/src/lib/components/timeline/QuickFilterBar.svelte` | MODIFICADO |
| `web/src/lib/components/timeline/QuickStats.svelte` | MODIFICADO |
| `web/src/lib/managers/timeline-manager/timeline-manager.svelte.ts` | MODIFICADO (fix 3 puntos) |
| `web/src/lib/managers/timeline-manager/timeline-manager.svelte.spec.ts` | MODIFICADO (test de regresión) |

Sin cambios en `packages/sdk`, backend, DTOs ni en `QuickFilterBar.spec.ts`.

## Orden de ejecución

Las tareas 1 y 3 son independientes (capas distintas); van en paralelo lógico pero se commitean por separado. La tarea 2 depende de la 1.

---

## Tarea 1 — Service de caché con TTL (TDD)

### 1.1 RED: `web/src/lib/services/asset-statistics.service.spec.ts` (nuevo)

Patrón seguido por `QuickFilterBar.spec.ts` y `MaintenanceBackupEntry.spec.ts`:
- Imports explícitos de `vitest` (`beforeEach, afterEach, describe, expect, it, vi`).
- Imports: `@testing-library/jest-dom` no necesario aquí (no hay DOM). Ámbito service puro.
- `import { sdkMock } from '$lib/__mocks__/sdk.mock';`
- imports del módulo: `AssetVisibility`, `AssetStatsResponseDto` de `@immich/sdk`; `getTimelineStats`, `invalidateTimelineStats` del service.

Estructura del spec:

```ts
import { AssetVisibility } from '@immich/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { getTimelineStats, invalidateTimelineStats } from './asset-statistics.service';

const DEFAULT_STATS: AssetStatsResponseDto = { images: 5, videos: 3, total: 8 };
const TTL_MS = 30_000;

describe('asset-statistics.service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    sdkMock.getAssetStatistics.mockResolvedValue(DEFAULT_STATS);
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateTimelineStats();
  });

  it('llama al SDK una sola vez cuando varios consumidores piden a la vez (coalescing)', async () => {
    const [a, b] = await Promise.all([getTimelineStats(), getTimelineStats()]);

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(1);
    expect(sdkMock.getAssetStatistics).toHaveBeenCalledWith({ visibility: AssetVisibility.Timeline });
    expect(a).toEqual(DEFAULT_STATS);
    expect(b).toEqual(DEFAULT_STATS);
  });

  it('reutiliza el valor cacheador dentro de la ventana de TTL de 30 s', async () => {
    const first = await getTimelineStats();

    await vi.advanceTimersByTimeAsync(TTL_MS - 1);
    const second = await getTimelineStats();

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('dispara una nueva petición con force: true aunque haya caché válida', async () => {
    await getTimelineStats();

    await getTimelineStats({ force: true });

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(2);
  });

  it('expira la entrada y vuelve a llamar al SDK tras 30 s', async () => {
    await getTimelineStats();

    await vi.advanceTimersByTimeAsync(TTL_MS);
    await getTimelineStats();

    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(2);
  });

  it('no cachea errores: propaga el rechazo y la siguiente llamada reintenta', async () => {
    sdkMock.getAssetStatistics.mockRejectedValueOnce(new Error('boom'));

    await expect(getTimelineStats()).rejects.toThrow('boom');

    const retry = await getTimelineStats();
    expect(retry).toEqual(DEFAULT_STATS);
    expect(sdkMock.getAssetStatistics).toHaveBeenCalledTimes(2);
  });
});
```

> Nota de implementación del test: `vi.advanceTimersByTimeAsync` hace avanzar el reloj y respeta microtasks entre medio; útil para TTL. Alternativa válida que usan otros specs del repo: `vi.useFakeTimers()` + `vi.setSystemTime(...)`. Si `advanceTimersByTimeAsync` diera problemas con happy-dom, se conmuta al patrón `vi.setSystemTime` (igual que `MaintenanceBackupEntry.spec.ts`).

**Verificación RED:** ejecutar

```powershell
& "C:\Users\astur\Desktop\immich-main\web\node_modules\.bin\vitest.cmd" run src/lib/services/asset-statistics.service.spec.ts
```

Debe fallar: error de módulo inexistente (`asset-statistics.service`). Anotar el fallo.

### 1.2 GREEN: `web/src/lib/services/asset-statistics.service.ts` (nuevo)

Contrato (spec §Arquitectura):

- Clave única `AssetVisibility.Timeline`; caché `Map<AssetVisibility, CacheEntry>` generalizado (YAGNI: una sola clave hoy).
- `getTimelineStats(options?: { force?: boolean }): Promise<AssetStatsResponseDto>`.
- `invalidateTimelineStats(): void` (borra entrada).
- Coalescing: mientras está en vuelo se almacena la Promise; el segundo consumidor obtiene la misma.
- TTL 30 s: dentro de la ventana devuelve el valor cacheado (`Promise.resolve` del valor o la promise resuelta ya almacenada); fuera, re-llama.
- `force: true` ignora TTL.
- Errores: se elimina la entrada del Map y se re-lanza.
- Tipado estricto sin `any`; `expiresAt` como `Date`.

Diseño del módulo (Java-free, TS puro, sin clases — función exportada + modos internos; nomenclatura en inglés):

```ts
import { AssetVisibility, getAssetStatistics, type AssetStatsResponseDto } from '@immich/sdk';

const TTL_MS = 30_000;

interface CacheEntry {
  promise: Promise<AssetStatsResponseDto>;
  expiresAt: number; // epoch ms (Date.now())
}

const cache = new Map<AssetVisibility, CacheEntry>();

const loadTimelineStats = (): Promise<AssetStatsResponseDto> => {
  const promise = getAssetStatistics({ visibility: AssetVisibility.Timeline });

  cache.set(AssetVisibility.Timeline, {
    promise,
    expiresAt: Date.now() + TTL_MS,
  });

  // No cachear errores: si rechaza, se elimina la entrada (referencia por identidad
  // para no borrar una entrada más nueva creada entre tanto).
  promise.catch(() => {
    const current = cache.get(AssetVisibility.Timeline);
    if (current?.promise === promise) {
      cache.delete(AssetVisibility.Timeline);
    }
  });

  return promise;
};

export const getTimelineStats = (options: { force?: boolean } = {}) => {
  const entry = cache.get(AssetVisibility.Timeline);

  if (!options.force && entry && entry.expiresAt > Date.now()) {
    return entry.promise;
  }

  return loadTimelineStats();
};

export const invalidateTimelineStats = () => {
  cache.delete(AssetVisibility.Timeline);
};
```

> Coalescing implícito: llamadas concurrentes en la misma macrotask ven el mismo `CacheEntry` recién creado.
> Nota: `eslint-plugin-unicorn` (config repo, `--max-warnings 0`) puede marcar `promise.catch(() => {...})` como floating promise si devuelve algo; usar `void promise.catch(...)` si el linter lo exige. Se resuelve en 1.4 si aparece el warning.

**Verificación GREEN:** repetir el comando vitest → 5 tests en verde.

### 1.3 REFACTOR / revisión

- Re-leer el spec §Decisiones y confirmar contra el código (solo lectura).
- No hay refactor estructural pendiente para ~40 líneas.

### 1.4 Verificación de calidad (Tarea 1)

```powershell
& "C:\Users\astur\Desktop\immich-main\web\node_modules\.bin\eslint.cmd" --max-warnings 0 src/lib/services/asset-statistics.service.ts src/lib/services/asset-statistics.service.spec.ts
```

Si `unicorn` u otra regla falla, ajustar (p. ej. `void promise.catch(...)`) y re-correr vitest + eslint. No continuar hasta verde.

### 1.5 Commit

Mensaje acorde al estilo del repo (fix/feat + descripción breve):

```
feat: add TTL client-side cache for timeline asset statistics
```

Incluir solo `asset-statistics.service.ts` y `asset-statistics.service.spec.ts`.

---

## Tarea 2 — Integración en componentes (sin TDD nuevo; depende de T1)

Los specs existentes validan la UI: `QuickFilterBar.spec.ts` (3 tests) debe seguir en verde **sin cambios**.

### 2.1 `web/src/lib/components/timeline/QuickFilterBar.svelte` (onMount:19-26)

Reemplazar el bloque actual:

```ts
const statsPromise = getAssetStatistics({ visibility: AssetVisibility.Timeline });
```

por:

```ts
const statsPromise = getTimelineStats();
```

Y ajustar imports:
- Quitar `getAssetStatistics, AssetVisibility` de `@immich/sdk` si no se usan en otra parte del archivo.
- Añadir `import { getTimelineStats } from '$lib/services/asset-statistics.service';`

Sin tocar presentación, derivados (`stats`, `loading`, `aria-busy`, spinners) ni handlers.

### 2.2 `web/src/lib/components/timeline/QuickStats.svelte` (onMount:15)

Reemplazar la llamada directa al SDK por el service (patrón del spec §Integración):

```ts
statsPromise = getTimelineStats();
```

Ajustar imports de igual forma.

### 2.3 Verificación

```powershell
& "C:\Users\astur\Desktop\immich-main\web\node_modules\.bin\vitest.cmd" run src/lib/components/timeline/QuickFilterBar.spec.ts
```

Debe pasar. Ejecutar también `check:svelte` y `check:typescript` para validar tipos de ambos componentes (ver comandos en T5).

### 2.4 Commit

```
refactor: use shared timeline stats service in QuickFilterBar and QuickStats
```

Incluir solo los dos `.svelte`.

---

## Tarea 3 — Fix de stale write en TimelineManager (TDD: RED primero)

### 3.1 Contexto del fix

`timeline-manager.svelte.ts`:
- `updateOptions` (línea ~275): `initTask.reset()` + `initTask.execute(...)`.
- `#initializeTimelineMonths` (línea ~254): tras `await getTimeBuckets`, asignaba `this.months` sin chequear `abortSignal.aborted`.
- Causa raíz confirmada por scratch: `CancellableTask.execute` sólo verifica `signal.aborted` DESPUÉS de que el callback retorna; los efectos secundarios dentro del callback (escritura de `this.months`, `updateViewportGeometry`, `#createScrubberMonths`) ya se comprometieron.

Fix mínimo de 3 puntos:
1. `#initializeTimelineMonths(abortSignal)` — `if (abortSignal.aborted) return;` tras el `await getTimeBuckets`, antes de escribir `this.months`.
2. `#init(options)` — pasar la `AbortSignal` al callback de `execute` y devolver `boolean` (init aplicado / cancelado).
3. `updateOptions` — si el init fue cancelado, no ejecutar `updateViewportGeometry(false)` ni `#createScrubberMonths()`; el `return` dentro del `try` para que `finally` restaure `suspendTransitions = false`.

### 3.2 RED: test de regresión en `timeline-manager.svelte.spec.ts`

Añadir al archivo existente (usa `tick` de svelte ya importado, `sdkMock` y `TimelineManager`). Patrón del scratch validado:

```ts
describe('updateOptions - stale write', () => {
  let timelineManager: TimelineManager;

  beforeEach(() => {
    vi.resetAllMocks();
    timelineManager = new TimelineManager();
  });

  it('descarta el resultado de la inicialización cancelada aunque su fetch resuelva después', async () => {
    let resolveFirst!: (
      value: Array<{ count: number; timeBucket: string }>,
    ) => void;
    const firstRequest = new Promise<Array<{ count: number; timeBucket: string }>>((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond!: (
      value: Array<{ count: number; timeBucket: string }>,
    ) => void;
    const secondRequest = new Promise<Array<{ count: number; timeBucket: string }>>((resolve) => {
      resolveSecond = resolve;
    });

    sdkMock.getTimeBuckets
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest);

    // p1: primer updateOptions entra en vuelo (fetch pendiente)
    const firstUpdate = timelineManager.updateOptions({ albumId: 'album-a' });
    await tick();
    await Promise.resolve();

    // p2: segunda updateOptions cancela la primera y lanza su propio fetch
    const secondUpdate = timelineManager.updateOptions({ albumId: 'album-b' });
    await tick();
    await Promise.resolve();

    // Resuelve primero la VIGENTE (p2) con el mes B
    resolveSecond([{ count: 1, timeBucket: '2024-03-01' }]);
    await secondUpdate;
    await tick();

    // Luego resuelve la CANCELADA (p1) con el mes A
    resolveFirst([{ count: 1, timeBucket: '2020-01-01' }]);
    await firstUpdate;
    await tick();

    // Invariante corregido: los meses reflejan solo la última opción activa
    expect(timelineManager.months).toHaveLength(1);
    expect(timelineManager.months[0].yearMonth.month).toBe(3);
    expect(timelineManager.months[0].yearMonth.year).toBe(2024);
    expect(timelineManager.months[0].yearMonth.month).not.toBe(1);
    expect(timelineManager.months[0].yearMonth.year).not.toBe(2020);
  });
});
```

Ajustes finos durante la implementación según la API real de `updateOptions` (puede recibir `{ albumId }`, `{ visibility }` u otras opciones — verificar firma en `timeline-manager.svelte.ts` y en tests existentes, p.ej. línea ~291/307). También `yearMonth` tiene getters `year`/`month` (confirmado en tests existentes).

**Verificación RED — sin el fix debe fallar (stale write):**

```powershell
& "C:\Users\astur\Desktop\immich-main\web\node_modules\.bin\vitest.cmd" run src/lib/managers/timeline-manager/timeline-manager.svelte.spec.ts
```

Confirmar que el nuevo test falla (los 17 tests previos siguen verdes). Anotar el fallo como evidencia.

### 3.3 GREEN: aplicar el fix en `timeline-manager.svelte.ts`

```ts
// #initializeTimelineMonths: tras await getTimeBuckets
const timebuckets = await getTimeBuckets({ ... });

if (abortSignal.aborted) {
  return;
}

this.months = timebuckets.map(/* ... render actual ... */);
```

```ts
// #init: devuelve boolean
const initStatus = await this.initTask.execute(async (abortSignal) => {
  // body actual del init
  await this.#initializeTimelineMonths(abortSignal);
  // ... resto (ó permanece como está salvo el early-return aborted)
}, /* preserve early-return de CancellableTask: ver firma real */);
```

> IMPORTANTE: respetar la firma real de `execute` de `cancellable-task.ts` (línea 55): `execute(f, { preserveEarlyReturn }?)` y pasar la señal al callback. Confirmar nombres de params al editar.

```ts
// updateOptions
this.suspendTransitions = true;
try {
  const initialized = await this.initTask.reset().then(() => this.#init(options));
  if (!initialized) {
    return;
  }
  this.updateViewportGeometry(false);
  this.#createScrubberMonths();
} finally {
  this.suspendTransitions = false;
}
```

(Reflejar el código existente real; el esqueleto aquí es orientativo.)

**Verificación GREEN:** re-correr el spec del manager → todos en verde (incl. el de regresión y los 17 previos).

### 3.4 Verificación de calidad (Tarea 3)

```powershell
& "C:\Users\astur\Desktop\immich-main\web\node_modules\.bin\eslint.cmd" --max-warnings 0 src/lib/managers/timeline-manager/timeline-manager.svelte.ts src/lib/managers/timeline-manager/timeline-manager.svelte.spec.ts
```

### 3.5 Commit

```
fix: discard stale months if timeline init is cancelled mid-flight
```

Incluir solo `timeline-manager.svelte.ts` y `timeline-manager.svelte.spec.ts`.

---

## Tarea 4 — Verificación integral

Ejecutar, en orden, en `web/` (workdir `C:\Users\astur\Desktop\immich-main\web`):

```powershell
npm run check:svelte
npm run check:typescript
npm run lint
```

(vitrón de todos los specs afectados ya cubierto en T1-T3; opcional corrida completa `npm test` → ~31 s.)

Cualquier warning/error debe resolverse antes de continuar. Si `check:svelte` u otro falla por el nuevo service, corregir y re-correr.

## Criterio de terminado

- [ ] 5 tests del service pasan.
- [ ] `QuickFilterBar.spec.ts` en verde sin cambios.
- [ ] Test de regresión de concurrencia en ROJO antes del fix y en VERDE tras él (evidencia anotada).
- [ ] `npm run check:svelte`, `npm run check:typescript`, `npm run lint` limpios.
- [ ] 4 commits separados, sin mezclar tareas.
- [x] `docs/handoff.md` actualizado al final (estado de avance).
- [ ] Sin push/merge (regla AGENTS.md: solo con confirmación explícita).

## Fuera de alcance (recordatorio)

- AbortSignal en el SDK generado para `getTimeBuckets` (exigiría modificar `packages/sdk`).
- Cambios de presentación/UX.
- Otros consumidores de `getAssetStatistics` fuera de timeline.