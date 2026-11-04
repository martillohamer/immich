# Smart Class Notes — Task 3 (Markdown Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir exportación client-side del resumen de clase a un archivo Markdown descargable (`class-notes-<assetId>.md`) vía utilidad pura + helper de descarga + botón en `SummaryPanel`.

**Architecture:** Una utilidad pura e inmutable `exportSummaryToMarkdown(summaryData, assetName?)` en `web/src/lib/utils/transcript-export.ts` serializa `SummaryData` a Markdown estructurado (headers internos fijos en inglés, secciones vacías omitidas). Un helper fino `downloadSummaryMarkdown(markdown, assetId)` construye un `Blob` `text/markdown;charset=utf-8` y delega en `downloadBlob` (ya existente en `$lib/utils`) para ancla → `click()` → `URL.revokeObjectURL`. `AudioViewer` deriva `assetName` de `originalFileName` sin extensión y lo propaga por `TranscriptPanel` hasta `SummaryPanel`, donde un botón `data-testid="summary-export"` (solo en vista `data`) dispara la descarga.

**Tech Stack:** Svelte 5 (runes legacy mode, `$props`/`$derived`), TypeScript strict, Vitest + Testing Library (`@testing-library/svelte`), `vi.mock`, svelte-i18n, Immich `$lib/utils` (`downloadBlob`), JSON de idiomas en `i18n/` (raíz del repo).

## Global Constraints

- **Lenguaje de código:** clases/métodos/variables/identificadores en inglés; docstrings/comentarios y textos de UI traducibles en español vía i18n.
- **Cero `any`:** TypeScript `strict`; no usar `any` ni escapes de tipo en archivos nuevos o modificados.
- **TDD:** cada cambio funcional empieza por su test que falla.
- **Util pura e inmutable:** `exportSummaryToMarkdown` no muta `summaryData` (deep-equal verificado en test), no toca DOM, no usa i18n, no lanza excepciones.
- **Headers internos del Markdown en inglés fijo:** `## Executive Summary`, `## Key Concepts`, `## Review Questions`. El único string traducible nuevo es `summary_export` (etiqueta del botón).
- **Título del documento:** línea 1 SIEMPRE `# Class Notes`. Subtítulo `## <assetName>` solo si `assetName?.trim()` tiene contenido; de lo contrario solo se omite. Separador `---` siempre, con línea en blanco antes y después.
- **Secciones vacías omitidas:** `executiveSummary.trim() === ''` → no se emite `## Executive Summary`; `keyConcepts.length === 0` → no se emite `## Key Concepts`; `reviewQuestions.length === 0` → no se emite `## Review Questions`.
- **Formato de emisión:** Key Concepts `- **<term>**: <definition>` (term/definition sin recortar); Review Questions lista ordenada `1. …`, `2. …` (1-based, texto sin recortar). Documento termina en `\n`.
- **Filename:** `class-notes-<assetId>.md` (sin timestamp).
- **Botón solo en vista `data`:** en `loading`/`empty` de `SummaryPanel` no existe el testid `summary-export`.
- **Nunca commitear `docs/superpowers/**` ni planes.** `git add` explícito por archivo. Sin push/merge sin confirmación. Commit único atómico final tras OK del usuario.
- **Vitest corre desde `web/`:** rutas de test relativas a `src/...`. `setup.ts` usa `fallbackLocale: 'dev'` → `$t('clave')` devuelve la clave literal; los specs asertan testids/datos, nunca texto traducido.
- **Rutas de JSON de idiomas:** `i18n/en.json` y `i18n/es.json` en la **raíz del repo** (alias `$i18n` → `../i18n` relativo a `web/src/lib`). Las claves `summary_*` ya existen; añadir `summary_export`.
- **No tocar el remoto Git** (decisión del usuario: "No tocar por ahora").
- **No tocar archivos no relacionados** (~18 archivos modificados pendientes en el workspace). `git add` + commit estrictamente de los archivos de esta tarea.

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `web/src/lib/utils/transcript-export.ts` | Crear | Util pura `exportSummaryToMarkdown` + helper fino `downloadSummaryMarkdown` |
| `web/src/lib/utils/transcript-export.spec.ts` | Crear | 10 casos de la util pura + 1 caso del helper (mock de `$lib/utils`) |
| `web/src/lib/components/asset-viewer/SummaryPanel.svelte` | Modificar | Props `assetId` (obligatoria) + `assetName?`; botón `summary-export` en vista `data` |
| `web/src/lib/components/asset-viewer/SummaryPanel.spec.ts` | Modificar | Props nuevas en renders existentes; casos botón presente/ausente + click |
| `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` | Modificar | Prop `assetName?`, reenviada a `SummaryPanel` |
| `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` | Modificar | Caso reenvío (botón presente con summaryData) |
| `web/src/lib/components/asset-viewer/AudioViewer.svelte` | Modificar | Deriva `assetName` de `originalFileName` sin extensión; lo envía |
| `i18n/en.json` | Modificar | Clave `summary_export` = "Export as Markdown" |
| `i18n/es.json` | Modificar | Clave `summary_export` = "Exportar como Markdown" |

Sin cambios: `transcript.svelte.ts`, `transcript-summary.ts`, tipos, `utils.ts` (se reutiliza `downloadBlob`).

## Task 1: Util pura `exportSummaryToMarkdown` + spec

**Files:**
- Create: `web/src/lib/utils/transcript-export.ts`
- Test: `web/src/lib/utils/transcript-export.spec.ts`

**Interfaces:**
- Consumes: `SummaryData` de `$lib/types/transcript` (`executiveSummary: string`, `keyConcepts: {term, definition}[]`, `reviewQuestions: string[]`).
- Produces: `exportSummaryToMarkdown(summaryData: SummaryData, assetName?: string): string`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/utils/transcript-export.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SummaryData } from '$lib/types/transcript';
import { exportSummaryToMarkdown } from '$lib/utils/transcript-export';

const fullSummary: SummaryData = {
  executiveSummary: 'Resumen inteligente generado de forma local para el asset 896f9505.',
  keyConcepts: [
    { term: 'Concepto central', definition: 'Definición derivada de la transcripción del asset.' },
    { term: 'Idea secundaria', definition: 'Definición contextual asociada al asset.' },
  ],
  reviewQuestions: [
    '¿Cuál es la idea principal de este material?',
    '¿Qué ejemplos ilustran los conceptos clave?',
  ],
};

const fullExpected = [
  '# Class Notes',
  '',
  '## Clase 01',
  '',
  '---',
  '',
  '## Executive Summary',
  '',
  'Resumen inteligente generado de forma local para el asset 896f9505.',
  '',
  '## Key Concepts',
  '',
  '- **Concepto central**: Definición derivada de la transcripción del asset.',
  '- **Idea secundaria**: Definición contextual asociada al asset.',
  '',
  '## Review Questions',
  '',
  '1. ¿Cuál es la idea principal de este material?',
  '2. ¿Qué ejemplos ilustran los conceptos clave?',
].join('\n') + '\n';

describe('exportSummaryToMarkdown', () => {
  it('always starts with the fixed title', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output.startsWith('# Class Notes\n')).toBe(true);
  });

  it('omits the subtitle when assetName is not provided', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output).not.toContain('## Clase 01');
    expect(output).toContain('# Class Notes\n\n---');
  });

  it('emits the subtitle when assetName is provided', () => {
    const output = exportSummaryToMarkdown(fullSummary, 'Clase 01');
    expect(output).toContain('# Class Notes\n\n## Clase 01');
  });

  it('omits the subtitle when assetName is empty or whitespace', () => {
    expect(exportSummaryToMarkdown(fullSummary, '')).not.toContain('## ');
    expect(exportSummaryToMarkdown(fullSummary, '   ')).not.toContain('## ');
    expect(exportSummaryToMarkdown(fullSummary, undefined)).not.toContain('## ');
  });

  it('matches the full expected document exactly', () => {
    const output = exportSummaryToMarkdown(fullSummary, 'Clase 01');
    expect(output).toBe(fullExpected);
  });

  it('emits every key concept as a bold term followed by a definition', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output).toContain('- **Concepto central**: Definición derivada de la transcripción del asset.');
    expect(output).toContain('- **Idea secundaria**: Definición contextual asociada al asset.');
    const firstIndex = output.indexOf('Concepto central');
    const secondIndex = output.indexOf('Idea secundaria');
    expect(firstIndex).toBeGreaterThan(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it('emits review questions as a 1-based ordered list', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output).toContain('1. ¿Cuál es la idea principal de este material?');
    expect(output).toContain('2. ¿Qué ejemplos ilustran los conceptos clave?');
  });

  it('omits empty sections entirely', () => {
    const output = exportSummaryToMarkdown({
      executiveSummary: '',
      keyConcepts: [],
      reviewQuestions: [],
    });
    expect(output).not.toContain('## Executive Summary');
    expect(output).not.toContain('## Key Concepts');
    expect(output).not.toContain('## Review Questions');
  });

  it('ends with a trailing newline', () => {
    const output = exportSummaryToMarkdown(fullSummary);
    expect(output.endsWith('\n')).toBe(true);
  });

  it('does not mutate the input summary', () => {
    const input: SummaryData = structuredClone(fullSummary);
    exportSummaryToMarkdown(input, 'Clase 01');
    expect(input).toEqual(fullSummary);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root, PowerShell):
```powershell
& "C:\Users\astur\Desktop\maven\apache-maven-3.9.9\bin\mvn.cmd" -v | Out-Null; Set-Variable -Name _ -Value $null
```
No — Maven no participa en tareas del web. Ejecutar vitest directamente:

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-export.spec.ts
```
Expected: FAIL — `Cannot find module '$lib/utils/transcript-export'` (el archivo no existe).

- [ ] **Step 3: Write minimal implementation**

Create `web/src/lib/utils/transcript-export.ts`:

```ts
import type { SummaryData } from '$lib/types/transcript';

export function exportSummaryToMarkdown(summaryData: SummaryData, assetName?: string): string {
  const sections: string[] = [];

  sections.push('# Class Notes');

  const trimmedAssetName = assetName?.trim();
  if (trimmedAssetName) {
    sections.push('');
    sections.push(`## ${trimmedAssetName}`);
  }

  sections.push('');
  sections.push('---');

  if (summaryData.executiveSummary.trim()) {
    sections.push('');
    sections.push('## Executive Summary');
    sections.push('');
    sections.push(summaryData.executiveSummary);
  }

  if (summaryData.keyConcepts.length > 0) {
    sections.push('');
    sections.push('## Key Concepts');
    sections.push('');
    for (const { term, definition } of summaryData.keyConcepts) {
      sections.push(`- **${term}**: ${definition}`);
    }
  }

  if (summaryData.reviewQuestions.length > 0) {
    sections.push('');
    sections.push('## Review Questions');
    sections.push('');
    summaryData.reviewQuestions.forEach((question, index) => {
      sections.push(`${index + 1}. ${question}`);
    });
  }

  return `${sections.join('\n')}\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-export.spec.ts
```
Expected: PASS, 10 tests.

## Task 2: Helper fino `downloadSummaryMarkdown` + case 11

**Files:**
- Modify: `web/src/lib/utils/transcript-export.ts` (añadir helper)
- Test: `web/src/lib/utils/transcript-export.spec.ts` (añadir bloque `downloadSummaryMarkdown`)

**Interfaces:**
- Consumes: `downloadBlob(data: Blob, filename: string)` de `'$lib/utils'` (ya existente en `web/src/lib/utils.ts:319`).
- Produces: `downloadSummaryMarkdown(markdown: string, assetId: string): void` — Blob `text/markdown;charset=utf-8`, filename `class-notes-<assetId>.md`.

- [ ] **Step 1: Append the failing test**

Append to `web/src/lib/utils/transcript-export.spec.ts`:

```ts
import { vi } from 'vitest';
```

Y al final del archivo (fuera del `describe('exportSummaryToMarkdown', ...)`):

```ts
vi.mock(import('$lib/utils'), () => ({
  downloadBlob: vi.fn(),
}));

import { downloadBlob } from '$lib/utils';
import { downloadSummaryMarkdown } from '$lib/utils/transcript-export';

describe('downloadSummaryMarkdown', () => {
  it('downloads the markdown as a blob with the expected type and filename', async () => {
    const markdown = '# Class Notes\n\n';
    downloadSummaryMarkdown(markdown, 'asset-1');

    expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blob.text()).toBe(markdown);
    expect(filename).toBe('class-notes-asset-1.md');
  });
});
```

Nota: mover el `vi.mock` **antes** del primer test que dependa de imports, al tope del archivo junto al import de `vi`. El bloque `downloadSummaryMarkdown` importa tras el mock (ver Step 3 para el orden final íntegro).

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-export.spec.ts
```
Expected: FAIL — `downloadSummaryMarkdown is not a function` / no existe en el módulo.

- [ ] **Step 3: Implement the helper**

Append to `web/src/lib/utils/transcript-export.ts`:

```ts
import { downloadBlob } from '$lib/utils';

export function downloadSummaryMarkdown(markdown: string, assetId: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `class-notes-${assetId}.md`);
}
```

Orden final recomendado del spec (vitest aplica hoisting de `vi.mock`, pero por legibilidad):

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SummaryData } from '$lib/types/transcript';
import { exportSummaryToMarkdown } from '$lib/utils/transcript-export';

vi.mock(import('$lib/utils'), () => ({
  downloadBlob: vi.fn(),
}));

import { downloadBlob } from '$lib/utils';

describe('exportSummaryToMarkdown', () => {
  // ...tests del Task 1...
});

describe('downloadSummaryMarkdown', () => {
  // ...test del Task 2...
});
```

El import de `downloadSummaryMarkdown` puede ir junto al de `exportSummaryToMarkdown` al tope (no depende del mock).

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-export.spec.ts
```
Expected: PASS, 11 tests.

## Task 3: Clave i18n `summary_export`

**Files:**
- Modify: `i18n/en.json` (añadir tras `summary_section_questions`, línea ~2140)
- Modify: `i18n/es.json` (añadir tras `summary_section_questions`, línea ~2117)

**Interfaces:**
- Produces: clave `summary_export` usada por `SummaryPanel.svelte` (Task 4) como `$t('summary_export')`.

- [ ] **Step 1: Edit `i18n/en.json`**

Insertar tras la línea `"summary_section_questions": "Review questions",`:

```json
  "summary_export": "Export as Markdown",
```

- [ ] **Step 2: Edit `i18n/es.json`**

Insertar tras la línea `"summary_section_questions": "Preguntas de repaso",`:

```json
  "summary_export": "Exportar como Markdown",
```

- [ ] **Step 3: Verify both locales still load**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/i18n.spec.ts
```
Expected: PASS (los loaders resuelven `en.json`/`es.json` sin error de claves).

## Task 4: Botón de exportación en `SummaryPanel.svelte`

**Files:**
- Modify: `web/src/lib/components/asset-viewer/SummaryPanel.svelte` (props + imports + fila de cabecera en vista `data`)
- Test: `web/src/lib/components/asset-viewer/SummaryPanel.spec.ts`

**Interfaces:**
- Consumes: `assetId: string` (obligatoria desde `TranscriptPanel`), `assetName?: string`, `exportSummaryToMarkdown`, `downloadSummaryMarkdown`, $t('summary_export').
- Produces: `data-testid="summary-export"` renderizado solo en vista `data`.

- [ ] **Step 1: Write the failing tests**

Edit `web/src/lib/components/asset-viewer/SummaryPanel.spec.ts`:

```ts
import { render, fireEvent } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SummaryPanel from './SummaryPanel.svelte';
import type { SummaryData } from '$lib/types/transcript';

vi.mock(import('$lib/utils/transcript-export'), () => ({
  exportSummaryToMarkdown: vi.fn(() => '# MARKDOWN'),
  downloadSummaryMarkdown: vi.fn(),
}));

import { exportSummaryToMarkdown, downloadSummaryMarkdown } from '$lib/utils/transcript-export';

const baseProps = {
  summaryData: null,
  loading: false,
  onRetry: vi.fn(),
  assetId: 'asset-1',
  assetName: 'Clase 01',
};
```

- Añadir `assetId: 'asset-1'` (y opcionalmente `assetName`) a **todos** los renders existentes (loading, empty, executive, concepts, questions) — prop ahora obligatoria.
- Añadir casos nuevos dentro de `describe('SummaryPanel', ...)`:

```ts
it('shows the export button only when summary data is available', () => {
  const { getByTestId } = render(SummaryPanel, {
    ...baseProps,
    summaryData: mockSummary,
    loading: false,
  });
  expect(getByTestId('summary-export')).toBeInTheDocument();
});

it.each([
  { summaryData: null, loading: true },
  { summaryData: null, loading: false },
] as const)('hides the export button when there is no data (loading=$loading)', ({ summaryData, loading }) => {
  const { queryByTestId } = render(SummaryPanel, {
    ...baseProps,
    summaryData,
    loading,
  });
  expect(queryByTestId('summary-export')).toBeNull();
});

it('downloads the markdown built from the summary and the asset name when clicked', async () => {
  const { getByTestId } = render(SummaryPanel, {
    ...baseProps,
    summaryData: mockSummary,
    loading: false,
  });
  await fireEvent.click(getByTestId('summary-export'));
  expect(vi.mocked(exportSummaryToMarkdown)).toHaveBeenCalledWith(mockSummary, 'Clase 01');
  expect(vi.mocked(downloadSummaryMarkdown)).toHaveBeenCalledWith('# MARKDOWN', 'asset-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/SummaryPanel.spec.ts
```
Expected: FAIL — `summary-export` no existe / TSError por prop `assetId` ausente en componente.

- [ ] **Step 3: Implement**

Edit `web/src/lib/components/asset-viewer/SummaryPanel.svelte`:

Script (líneas 1-18):

```svelte
<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiLoading } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { SummaryData } from '$lib/types/transcript';
  import { downloadSummaryMarkdown, exportSummaryToMarkdown } from '$lib/utils/transcript-export';

  let {
    summaryData,
    loading,
    onRetry,
    assetId,
    assetName,
  }: {
    summaryData: SummaryData | null;
    loading: boolean;
    onRetry: () => void;
    assetId: string;
    assetName?: string;
  } = $props();

  const view = $derived(loading ? 'loading' : summaryData ? 'data' : 'empty');
</script>
```

Vista `data` (tras el `{:else}` que abre la rama con datos, línea 33; insertar la fila de cabecera como primer bloque dentro de la rama):

```svelte
{:else}
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

  <section aria-labelledby="summary-executive-title" class="flex flex-col gap-1">
    ...
```

El resto de la rama `data` (secciones executive/concepts/questions) queda idéntico. `summaryData` dentro de la rama se mantiene con `summaryData!` como ya está.

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/SummaryPanel.spec.ts
```
Expected: PASS, 8 tests (5 regresión + 3 nuevos). Nota: los `it.each` cuentan como 2 tests → total regresión 5 + 1 + 2 + 1 = 9.

## Task 5: Prop `assetName` en `TranscriptPanel.svelte`

**Files:**
- Modify: `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` (props + `<SummaryPanel>`)
- Test: `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts`

**Interfaces:**
- Consumes: prop opcional `assetName?: string` desde `AudioViewer`.
- Produces: reenvía `{ assetId }` y `{ assetName }` a `SummaryPanel`; `SummaryPanel` ahora requiere `assetId` (ya llega como prop de `TranscriptPanel`).

- [ ] **Step 1: Write the failing test**

Edit `web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts` — añadir caso nuevo dentro de `describe('TranscriptPanel', ...)`:

```ts
it('forwards assetName to the summary panel and exposes the export button', () => {
  factory.manager = {
    ...defaultManager,
    status: 'success',
    transcript,
    activeTab: 'summary',
    summaryData: mockSummary,
  };
  const { getByTestId } = render(TranscriptPanel, {
    assetId: 'asset-1',
    assetName: 'Clase 01',
    currentTime: 0,
    duration: 5,
    onSeek: vi.fn(),
  });
  expect(getByTestId('summary-export')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts
```
Expected: FAIL — `summary-export` no existe aún (prop `assetName` no llega) o svelte-check fails por prop `assetId` requerida.

- [ ] **Step 3: Implement**

Edit `web/src/lib/components/asset-viewer/TranscriptPanel.svelte` (script, líneas 7-17):

```svelte
  let {
    assetId,
    assetName,
    currentTime,
    duration: _,
    onSeek,
  }: {
    assetId: string;
    assetName?: string;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
  } = $props();
```

Y el acceso a Summary (líneas 98-102):

```svelte
      <SummaryPanel
        summaryData={summaryData}
        loading={isGeneratingSummary}
        onRetry={() => void transcriptManager.loadAssetSummary(assetId)}
        {assetId}
        {assetName}
      />
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/components/asset-viewer/TranscriptPanel.spec.ts
```
Expected: PASS, todos los casos (regresión + 1 nuevo).

## Task 6: Derivar `assetName` en `AudioViewer.svelte`

**Files:**
- Modify: `web/src/lib/components/asset-viewer/AudioViewer.svelte` (derivación + envío a `TranscriptPanel`)
- Verificación: gates de TypeScript/lint/svelte-check (no existe `AudioViewer.spec.ts`)

**Interfaces:**
- Consumes: `asset.originalFileName?: string | null` (de `AssetResponseDto`).
- Produces: `assetName: string | undefined` (nombre sin extensión) → prop de `TranscriptPanel`.

- [ ] **Step 1: Implement**

Edit `web/src/lib/components/asset-viewer/AudioViewer.svelte` (script, tras la línea `const src = $derived(...)`, línea 36):

```svelte
  const assetName = $derived(asset.originalFileName?.replace(/\.[^.]+$/, ''));
```

Y el render de `TranscriptPanel` (línea 107):

```svelte
  <TranscriptPanel {...{ assetId: asset.id, assetName, currentTime, duration, onSeek: seekTo }} />
```

Nota: `originalFileName` puede ser `undefined`/`null`; el `?.` garantiza `string | undefined`, compatible con la prop opcional. El regex quita la última extensión con punto (`miclase.mp3` → `miclase`); si no hay punto, el nombre queda intacto.

- [ ] **Step 2: Verify compilation**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm run check:typescript
pnpm run check:svelte
```
Expected: PASS ambos, sin warnings nuevos.

## Task 7: Gates completos + commit atómico

**Files:** (ninguno — verificación y commit)

- [ ] **Step 1: Ejecutar la suite completa de la tarea + regresión**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm exec vitest run src/lib/utils/transcript-export.spec.ts src/lib/components/asset-viewer/SummaryPanel.spec.ts src/lib/components/asset-viewer/TranscriptPanel.spec.ts src/lib/stores/transcript.svelte.spec.ts src/lib/i18n.spec.ts
```
Expected: PASS todos (nuevos + regresión de Task 1/2 del store, Panel y i18n).

- [ ] **Step 2: TypeScript, lint y formateo**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm run check:typescript
pnpm run lint -- --max-warnings 0
pnpm exec prettier --check src/lib/utils/transcript-export.ts src/lib/utils/transcript-export.spec.ts src/lib/components/asset-viewer/SummaryPanel.svelte src/lib/components/asset-viewer/TranscriptPanel.svelte src/lib/components/asset-viewer/AudioViewer.svelte
```
Expected: exit 0 en los tres. Si prettier falla: `pnpm exec prettier --write build ...` sobre los archivos de la tarea.

- [ ] **Step 3: svelte-check**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main\web
pnpm run check:svelte
```
Expected: exit 0 sin warnings nuevos. (En Windows puede requerir comillas dobles alrededor del flag `--compiler-warnings '...'` — defecto preexistente; si falla por eso, lanzar con el flag citado tal cual documentado.)

- [ ] **Step 4: Confirmar el diff y commitear solo los archivos de la tarea**

```powershell
Set-Location C:\Users\astur\Desktop\immich-main
git status
git diff --stat -- web/src/lib/utils/transcript-export.ts web/src/lib/utils/transcript-export.spec.ts web/src/lib/components/asset-viewer/SummaryPanel.svelte web/src/lib/components/asset-viewer/SummaryPanel.spec.ts web/src/lib/components/asset-viewer/TranscriptPanel.svelte web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts web/src/lib/components/asset-viewer/AudioViewer.svelte i18n/en.json i18n/es.json
```

Verificar que **no** aparecen los ~18 archivos no relacionados ni `docs/superpowers/**`. Commit:

```powershell
git add web/src/lib/utils/transcript-export.ts web/src/lib/utils/transcript-export.spec.ts web/src/lib/components/asset-viewer/SummaryPanel.svelte web/src/lib/components/asset-viewer/SummaryPanel.spec.ts web/src/lib/components/asset-viewer/TranscriptPanel.svelte web/src/lib/components/asset-viewer/TranscriptPanel.spec.ts web/src/lib/components/asset-viewer/AudioViewer.svelte i18n/en.json i18n/es.json
git commit -m "feat(web): export smart class summary to markdown"
```

**NO push, NO merge.** Esperar confirmación explícita del usuario.

## Self-Review

**Spec coverage:**
- Objetivo 1 (util pura) → Task 1. ✔
- Objetivo 2 (helper fino + Blob + downloadBlob) → Task 2. ✔
- Objetivo 3 (botón solo con datos) → Task 4. ✔
- Objetivo 4 (clave i18n) → Task 3. ✔
- Decisión origen `assetName` (AudioViewer sin extensión → TranscriptPanel → SummaryPanel) → Tasks 4/5/6. ✔
- Decisión formato exacto/snapshots → test Task 1 (igualdad literal `fullExpected` + casos 6/7 substrings). ✔
- Secciones vacías omitidas → caso 8. ✔
- Filename determinista → Task 2 (assert `class-notes-asset-1.md`). ✔
- No mutación → caso 10. ✔
- Manejo de estados (botón loading/empty/data) → Task 4 `it.each`. ✔

**Placeholder scan:** sin TBD/TODO; todo paso tiene código o comando exacto. ✔

**Type consistency:** `exportSummaryToMarkdown(summaryData, assetName?)` definido en Task 1 y usado igual en Tasks 2/4/5; `downloadSummaryMarkdown(markdown, assetId)` definido en Task 2 y usado en Task 4; props `assetId`/`assetName?` idénticas en Tasks 4/5/6; testid `summary-export` consistente. ✔

**Nota de formato key concepts:** en el test la etiqueta esperada es `- **Concepto central**: Definición…` (`**` + `: `): la implementación del Task 1 emite exactamente `- ${term}**: ${definition}` con template literal `- **${term}**: ${definition}`. Consistente entre test y código y con el ejemplo del spec.