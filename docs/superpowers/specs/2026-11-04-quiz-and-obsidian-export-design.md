# Superfase 1.3 - Generador de Test Interactivo (Quiz) y Exportación a Obsidian/Markdown

- **Fecha:** 2026-11-04
- **Estado:** Borrador de especificación técnica inicial.
- **Repositorio/workspace:** `C:\Users\astur\Desktop\immich-main` (frontend `web/`, Svelte 5 runes + TypeScript + Vite + Vitest).
- **Precedente:** Fase 1.1 (Flashcards Active Recall `39bb1cc`), Fase 1.2 (RAG In-Context Companion `50a1873`).

---

## 1. Resumen y Objetivos

Añadir una **5.ª pestaña "Quiz"** al `TranscriptPanel` que ofrece un **examen interactivo de autoevaluación de opción múltiple** generado a partir del resumen y contenido del recurso (audio/transcripción), e **integración de exportación a Obsidian** (formato Markdown enriquecido con YAML frontmatter y Callouts de Obsidian).

### Objetivos

1. **Generador de Quiz Interactivo (Cliente-Side / Pure JS)**:
   - Derivar un conjunto de preguntas de opción múltiple (`QuizQuestion`) deterministas basadas en `SummaryData` / `KeyConcept` / `reviewQuestions` / transcripción.
   - Evaluación instantánea de respuestas seleccionadas con explicaciones contextuales.
   - Puntuación final y resumen de rendimiento por sesión.
2. **Exportador Aumentado a Obsidian (`.md` / Callouts)**:
   - Exportación de notas de clase con formato compatible con Obsidian: YAML frontmatter (tags, assetId, fecha), Callouts de Obsidian (`> [!summary]`, `> [!abstract]`, `> [!note]`), badges de dificultad e historial de Quiz.
   - Opción de exportar el recurso completo (Transcripción + Resumen + Flashcards + Quiz) en una nota estructurada en Markdown.
3. **Pestaña UI Interactiva `QuizPanel.svelte`**:
   - Selector de nivel de dificultad o modo de revisión (Rápido / Completo).
   - Vista pregunta a pregunta con feedback inmediato (correcto/incorrecto).
   - Muestra de porcentaje de aciertos e histograma final.
4. **Ampliación de la Suite de Pestañas**:
   - `TranscriptPanel.svelte` soporta 5 pestañas: `Transcript` | `Summary` | `Flashcards` | `Chat` | `Quiz`.

---

## 2. Tipos de Dominio (`web/src/lib/types/transcript.ts`)

Se extiende `web/src/lib/types/transcript.ts` con las siguientes estructuras:

```ts
export type QuizOption = {
  id: string; // 'a' | 'b' | 'c' | 'd'
  text: string;
};

export type QuizQuestion = {
  id: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
  conceptTerm?: string;
};

export type QuizResult = {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  timeSpentSeconds?: number;
};

export type QuizSession = {
  assetId: string;
  questions: QuizQuestion[];
  answers: Record<string, string>; // questionId -> selectedOptionId
  submitted: boolean;
  score: number; // porcentaje 0-100
};

export type ObsidianExportOptions = {
  includeFrontmatter: boolean;
  includeCallouts: boolean;
  includeTranscript: boolean;
  includeQuizHistory: boolean;
  tags: string[];
};
```

---

## 3. Generador de Quiz y Exportador a Obsidian (`web/src/lib/utils/`)

### 3.1 `web/src/lib/utils/transcript-quiz.ts` (Puro)
- `buildQuizFromSummary(summaryData: SummaryData, assetId: string): QuizQuestion[]`:
  - Genera 1 pregunta por cada `KeyConcept` (identificando el término correcto entre distracciones razonables o definiciones) y 1 pregunta por cada `reviewQuestion`.
  - Determinista y puro.
- `evaluateQuiz(questions: QuizQuestion[], answers: Record<string, string>): { score: number; total: number; percentage: number }`.

### 3.2 `web/src/lib/utils/obsidian-export.ts` (Puro)
- `exportToObsidianMarkdown(summaryData: SummaryData, transcript?: TranscriptionResponseDto | null, options?: ObsidianExportOptions): string`:
  - Genera un documento Markdown con Callouts nativos de Obsidian:
    - YAML Frontmatter: `--- title: ..., tags: [smart-class-notes, audio], assetId: ... ---`
    - `> [!abstract] Resumen Ejecutivo`
    - `> [!note] Conceptos Clave`
    - `> [!faq] Preguntas de Repaso`
    - `> [!quote] Transcripción Completa` (plegable mediante `> [!quote]- Transcripción Completa`).

---

## 4. Estado y Sub-Store (`web/src/lib/stores/quiz.svelte.ts`)

Mantiene el estado reactivo del Quiz por `assetId` utilizando Svelte 5 runes (`$state`):
- `getQuizSession(assetId: string): QuizSession | null`
- `startQuiz(assetId: string, summaryData: SummaryData): void`
- `selectAnswer(assetId: string, questionId: string, optionId: string): void`
- `submitQuiz(assetId: string): void`
- `resetQuiz(assetId: string): void`

---

## 5. Componentes UI (`web/src/lib/components/asset-viewer/`)

1. **`QuizPanel.svelte`**:
   - Renderiza las preguntas interactivas con estados: `unstarted` | `in_progress` | `completed`.
   - Muestra opciones de selección, indicador de progreso (ej. Pregunta 3 de 5) y botón de envío/revisión.
   - Ofrece el desglose de resultados finales con porcentaje de acierto.

2. **`TranscriptPanel.svelte` (Modificado)**:
   - Inserción de la 5.ª pestaña en `GroupTab` (`'quiz'`).
   - Inserción del botón "Exportar a Obsidian" en la cabecera o pie del panel de resumen/exportación.

---

## 6. Plan de Pruebas (TDD)

- **`transcript-quiz.spec.ts`**: Verificación de generación determinista de preguntas, distracciones y cálculo de puntajes.
- **`obsidian-export.spec.ts`**: Verificación de estructura YAML, formato de Callouts Obsidian y presencia de la transcripción opcional.
- **`quiz.svelte.spec.ts`**: Verificación de estados en el store, selección de respuestas e inmutabilidad entre assets.
- **`QuizPanel.spec.ts`**: Renderizado de UI, selección de opciones, emisión de evento de finalización y vista de resultados.

---

## 7. i18n (`i18n/en.json`, `i18n/es.json`)

Nuevas claves en estricto orden alfabético:
- `quiz_title`, `quiz_start`, `quiz_submit`, `quiz_score`, `quiz_retry`, `quiz_explanation`, `obsidian_export_button`.
