# Design: Web — Smart Class Notes, Task 3 (Client-side Markdown Export)

**Fecha:** 2026-09-30
**Ámbito:** `web/` (SvelteKit + Svelte 5 runes + TypeScript strict) + `i18n/` (raíz del repo). Fork local de Immich v3.2.0.
**Estado:** diseño propuesto — pendiente de aprobación del usuario.

## Objetivo

Añadir exportación **client-side** del resumen de clase ("Smart Class Notes") a un archivo Markdown descargable, sobre el `SummaryData` que ya entrega el store (Task 1) y el `SummaryPanel` presentacional (Task 2). La Task 3 **solo** introduce:

1. Una utilidad pura e inmutable `exportSummaryToMarkdown(summaryData, assetName?): string` que serializa `SummaryData` a Markdown estructurado y elegante.
2. Un helper fino de descarga `downloadSummaryMarkdown(markdown, assetId)` que construye un `Blob` `text/markdown;charset=utf-8`, dispara la descarga con `download="class-notes-[assetId].md"` y libera la URL efímera (`URL.revokeObjectURL`).
3. Un botón "Export as Markdown" en la cabecera de la vista de datos (data) de `SummaryPanel.svelte`, activo **solo** cuando `summaryData` está presente.
4. La clavarita i18n `summary_export` para la etiqueta del botón.

No incluye: endpoint real del resumen (Task 4+), edición del resumen, exportar la transcripción completa, ni cambios en backend/mobile/sdk.

## Decisiones acordadas (aprobadas por el usuario en brainstorming)

1. **Headers internos en inglés fijo:** las secciones del `.md` usan encabezados literales `## Executive Summary`, `## Key Concepts`, `## Review Questions`, independientes del locale. Solo el texto del botón y el aria-label se traducen por i18n. El documento exportado es estable para procesamiento/compartición.
2. **Título del documento:** `# Class Notes` se emite SIEMPRE como encabezado principal (línea 1 fija). `assetName` (si se provee) aparece como subtítulo `## <assetName>` debajo del título; si no se provee, solo se omite el subtítulo y el documento continúa con el separador `---`. La jerarquía es: título fijo ancla + nombre del asset opcional.
3. **Secciones vacías se omiten:** si `keyConcepts` o `reviewQuestions` llegan vacíos, su sección no se emite (ni encabezado ni lista). `executiveSummary` vacío → su sección tampoco. El documento refleja exactamente el contenido disponible.
4. **Origen de `assetName`:** `AudioViewer` deriva `assetName` de `asset.originalFileName` **sin extensión** y lo pasa como prop opcional a `TranscriptPanel`, que a su vez lo pasa a `SummaryPanel`. La utilidad pura no conoce extensiones ni sanitización: recibe el string ya limpio.
5. **`exportSummaryToMarkdown` pura e inmutable:** cero efectos colaterales, no toca DOM, no usa i18n. Recibe `SummaryData` + `assetName?` y devuelve un string. Totalmente testeable sin mocks.
6. **Descarga reutilizando el mecanismo del repo:** `$lib/utils` ya expone `downloadBlob(data: Blob, filename)` que crea el ancla, dispara `click()` y hace `URL.revokeObjectURL` automáticamente (`web/src/lib/utils.ts:319`). La Task 3 construye el `Blob` con `type: 'text/markdown;charset=utf-8'` y delega la descarga en `downloadBlob` (mismo patrón que `downloadJson`). No se reinventa la rueda.
7. **Botón solo con datos:** el botón se renderiza únicamente en la vista `data` de `SummaryPanel.svelte` (cuando `summaryData !== null`), alineado a la derecha en una fila superior de la vista. En `loading`/`empty` no existe.
8. **Filename determinista:** `class-notes-[assetId].md` (p. ej. `class-notes-896f9505-4a2a-4f2a-9b2a-8f2a7d9b0000.md`), donde `assetId` llega como prop. Sin timestamp (determinista y testable).

## Arquitectura e integración

```
AudioViewer.svelte                        (modificado: deriva assetName = originalFileName sin extensión)
└── TranscriptPanel.svelte                (modificado: prop nueva assetName?, la reenvía)
    ├── GroupTab.svelte                   (sin cambios)
    ├── (bloque transcripción — sin cambios)
    └── SummaryPanel.svelte               (modificado: props nuevas assetId + assetName?)
        └── botón "Export as Markdown" →  exportSummaryToMarkdown(summaryData, assetName)
                                          → downloadSummaryMarkdown(markdown, assetId)
                                          → downloadBlob(blob, 'class-notes-[assetId].md')

web/src/lib/utils/transcript-export.ts    (nuevo: utilidad pura + helper de descarga fino)
web/src/lib/utils/transcript-export.spec.ts (nuevo)
```

- Punto de integración: el mismo `TranscriptPanel` que ya consume `transcriptManager`, `assetId`, `summaryData`, `isGeneratingSummary`. `AudioViewer` **solo** añade el envío de `assetName` (no cambia su contrato salvo la prop nueva hacia `TranscriptPanel`).
- `SummaryPanel` deja de ser 100% presentacional: recibe `assetId` (necesario para el filename y cuya procedencia ya es prop en `TranscriptPanel`) y `assetName?`. La **lógica de generación y descarga** se invoca en el `onclick` del botón del propio `SummaryPanel`.

## Contrato de funciones y tipos

### 1. `web/src/lib/utils/transcript-export.ts` (nuevo)

```ts
import type { SummaryData } from '$lib/types/transcript';

export function exportSummaryToMarkdown(summaryData: SummaryData, assetName?: string): string;

export function downloadSummaryMarkdown(markdown: string, assetId: string): void;
```

#### `exportSummaryToMarkdown(summaryData, assetName?)`

- **Pura e inmutable:** no muta `summaryData`, no toca DOM, no usa i18n, no lanza excepciones.
- **`assetName`:** opcional. Si se provee y tiene contenido tras `trim()`, se emite como subtítulo; si es `undefined` o vacío, no se emite.
- **Salida (template exacto):**

```markdown
# Class Notes

## <assetName>          ← solo si assetName presente

---

## Executive Summary

<executiveSummary>

## Key Concepts

- **<term>**: <definition>
- **<term>**: <definition>

## Review Questions

1. <reviewQuestion>
2. <reviewQuestion>
```

- **Reglas de emisión:**
  - Línea 1 SIEMPRE: `# Class Notes`.
  - Si `assetName` (trim) presente: línea en blanco + `## <assetName>`.
  - Separador `---` siempre, con una línea en blanco antes y después.
  - `## Executive Summary` solo si `executiveSummary.trim()` tiene contenido; el texto se emite sin recortar (se conserva el contenido tal cual).
  - `## Key Concepts` solo si `keyConcepts.length > 0`; cada concepto en formato `- **<term>**: <definition>` con `term`/`definition` sin recortar.
  - `## Review Questions` solo si `reviewQuestions.length > 0`; lista ordenada `1.`, `2.`, … (índice 1-based).
  - El documento termina con un salto de línea final (`\n`).
- **Ejemplo concreto (assetName `Clase 01`):**

```markdown
# Class Notes

## Clase 01

---

## Executive Summary

Resumen inteligente generado de forma local para el asset 896f9505.

## Key Concepts

- **Concepto central**: Definición derivada de la transcripción del asset.
- **Idea secundaria**: Definición contextual asociada al asset.

## Review Questions

1. ¿Cuál es la idea principal de este material?
2. ¿Qué ejemplos ilustran los conceptos clave?
```

#### `downloadSummaryMarkdown(markdown, assetId)`

- Construye `new Blob([markdown], { type: 'text/markdown;charset=utf-8' })`.
- Delega en `downloadBlob(data, 'class-notes-' + assetId + '.md')` (importado de `'$lib/utils'`), que ya gestiona ancla → `click()` → `URL.revokeObjectURL`.
- No retorna nada; los fallos de descarga de navegador quedan fuera del alcance de la utilidad (no hay red).
- `assetId` se usa tal cual en el filename (los ids de assets de Immich son UUIDs seguros para filename).

### 2. `web/src/lib/components/asset-viewer/SummaryPanel.svelte` (modificado)

**Props actualizadas:**

```ts
type Props = {
  summaryData: SummaryData | null;
  loading: boolean;
  onRetry: () => void;
  assetId: string;
  assetName?: string;
};
let { summaryData, loading, onRetry, assetId, assetName }: Props = $props();
```

**Cambio de layout en `view === 'data'`:** antes de las secciones se añade una fila de cabecera alineada a la derecha:

```svelte
<div class="flex justify-end">
  <button
    type="button"
    data-testid="summary-export"
    onclick={() => downloadSummaryMarkdown(exportSummaryToMarkdown(summaryData, assetName), assetId)}
    class="rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white hover:bg-immich-primary/80"
  >
    {$t('summary_export')}
  </button>
</div>
```

- El `<section>` de resumen ejecutivo mantiene `aria-labelledby="summary-executive-title"` y el `h3`. El botón se coloca **fuera** de las secciones, en la fila superior derecha.
- Los tres bloques (`executiveSummary`, `keyConcepts`, `reviewQuestions`) no cambian su markup de la Task 2.

**Imports nuevos en el `<script>`:**

```ts
import { downloadSummaryMarkdown, exportSummaryToMarkdown } from '$lib/utils/transcript-export';
```

### 3. `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` (modificado)

**Props públicas (ampliadas):**

```ts
type Props = {
  assetId: string;
  assetName?: string;              // nueva, opcional
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
};
```

**Cuerpo — acceso Summary (sin cambios de lógica):**

```svelte
<SummaryPanel
  {summaryData}
  loading={isGeneratingSummary}
  onRetry={() => void transcriptManager.loadAssetSummary(assetId)}
  {assetId}
  {assetName}
/>
```

### 4. `web/src/lib/components/asset-viewer/AudioViewer.svelte` (modificado)

**Derivación del nombre (sin extensión) y envío:**

```ts
const assetName = $derived(asset.originalFileName?.replace(/\.[^.]+$/, ''));
```

Nótese el uso de `?.`: `originalFileName` puede ser `undefined` o `null` en `AssetResponseDto`; el resultado queda `string | undefined`, compatible con la prop opcional.

```svelte
<TranscriptPanel {...{ assetId: asset.id, assetName, currentTime, duration, onSeek: seekTo }} />
```

- No se altera nada más de `AudioViewer`.

### 5. `i18n/en.json` y `i18n/es.json` (modificar — raíz del repo)

Claves nuevas (integradas junto a `summary_*`):

| Clave | en.json | es.json |
|---|---|---|
| `summary_export` | `Export as Markdown` | `Exportar como Markdown` |

> El subtítulo del documento (`## <assetName>`) es texto de negocio del asset, no texto de UI; por tanto no necesita i18n. El único string nuevo traducible es la etiqueta del botón `summary_export`.

## Manejo de estados

| Estado de SummaryPanel | Botón exportar |
|---|---|
| `loading` | No |
| `empty` | No |
| `data` (summaryData presente) | Sí, alineado a la derecha en la fila superior |
| Cambio de asset (`clear()` reset del store) | Se oculta (vuelve a loading/empty) |

## Testing

### `web/src/lib/utils/transcript-export.spec.ts` (nuevo)

Sin mocks (es pura). Datos fijos `SummaryData` y casos:

1. **Título siempre presente:** el string empieza por `# Class Notes\n`.
2. **Sin `assetName`:** no hay línea `## <assetName>`; el documento salta del título al separador.
3. **Con `assetName`:** aparece `## Clase 01` tras `# Class Notes`.
4. **`assetName` vacío/undefined:** se omite el subtítulo.
5. **Estructura completa:** con `summaryData` poblado + `assetName`, el output exacto == el `Snapshot` del template de la sección "Salida (template exacto)" (assert por igualdad literal, no snapshot de vitest, para que el test sea un contrato).
6. **Key Concepts:** cada concepto emite `- **<term>**: <definition>` (assert de substrings y del array ordenado).
7. **Review Questions:** emite `1. <q1>` … `n. <qn>` en orden.
8. **Secciones vacías omitidas:** `keyConcepts: []` → el output no contiene `## Key Concepts`; `reviewQuestions: []` → no contiene `## Review Questions`; `executiveSummary: ''` → no contiene `## Executive Summary`.
9. **Ultima línea:** el documento termina en `\n` (trailing newline).
10. **No mutación:** `summaryData` original no se modifica (deep-equal antes/después).

`downloadSummaryMarkdown` (helper fino): caso 11: mock de `'$lib/utils'` (estilo `vi.mock`) para espiar `downloadBlob`; verificar que se invoca con un `Blob` cuyo `type` es `text/markdown;charset=utf-8` y filename `class-notes-<assetId>.md`.

### `web/src/lib/components/asset-viewer/SummaryPanel.spec.ts` (modificar)

Ampliar renders con las props nuevas (`assetId: 'asset-1'`, `assetName: 'Clase 01'`). Casos nuevos:

1. **Botón presente en `data`:** `getByTestId('summary-export')` existe solo con `summaryData` poblado.
2. **Botón ausente en `loading` y `empty`:** `queryByTestId('summary-export')` es `null`.
3. **Click dispara la descarga:** mock de `downloadSummaryMarkdown` (vía `vi.mock` de `transcript-export`) y verificar que al `fireEvent.click` en `summary-export` se llama con `(markdown, 'asset-1')`; `assetName` correcto en `exportSummaryToMarkdown`.
4. Regresión: casos actuales de loading/empty/data ejecutivo/conceptos/preguntas siguen en verde.

### `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` (modificar)

1. **Prop `assetName` reenviada:** con `assetName` en las props del render, `SummaryPanel` recibe el valor (assert del `summary-export` presente o de la prop vía mock).
2. **Sin `assetName`:** el botón sigue presente y `exportSummaryToMarkdown` se llama sin nombre.
3. Regresión: tabs, auto-generación, spinner, y los 4 casos de transcripción siguen en verde.

### `web/src/lib/stores/transcript.svelte.spec.ts`

Sin cambios (la Task 1 cubre el store).

## Fuera de alcance (tasks posteriores)

- Endpoint REST real del resumen y consumo vía `AssetCacheManager`/SDK (sustituye `createMockSummary`).
- Exportación de la transcripción completa en Markdown (solo el resumen).
- Edición/persistencia del resumen por el usuario.
- Estados `error` dedicados en el store para el resumen.
- Cambios en `server/`, `machine-learning/`, `mobile/`, `packages/sdk/`.
- Sanitización/escapado de caracteres Markdown en `term`/`definition`/`reviewQuestions` (se emiten tal cual; contenido de confianza del sistema).

## Criterios de aceptación (Quality Gates)

1. `pnpm --filter immich-web run check:typescript` → exit 0.
2. `pnpm --filter immich-web run lint` → exit 0.
3. `pnpm --filter immich-web run check:svelte` → exit 0 sin warnings nuevos *(en Windows usar el flag con comillas dobles; defecto preexistente documentado en el repo)*.
4. `pnpm --filter immich-web exec vitest run src/lib/utils/transcript-export.spec.ts src/lib/components/asset-viewer/SummaryPanel.spec.ts src/lib/components/asset-viewer/TranscriptPanel.spec.ts` → todos pass (nuevos + regresión). (`vitest` corre desde `web/`, filtros relativos a `src/`.)
5. Cero `any` en archivos nuevos/modificados (strict).
6. Clave i18n `summary_export` presente en `en.json` y `es.json`.
7. En el navegador (query manual opcional): con resumen generado, el botón descarga `class-notes-<assetId>.md` con contenido Markdown correcto; con `loading`/fallo no existe el botón.
8. El documento descargado omite secciones vacías y termina en `\n`.
9. Commit atómico independiente (Conventional Commit) tras verificación y confirmación del usuario.