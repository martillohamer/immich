import type { SummaryData } from '$lib/types/transcript';

export function createMockSummary(assetId: string): SummaryData {
  return {
    executiveSummary: `Resumen inteligente generado de forma local para el asset ${assetId}.`,
    keyConcepts: [
      { term: 'Concepto central', definition: 'Definición derivada de la transcripción del asset.' },
      { term: 'Idea secundaria', definition: 'Definición contextual asociada al asset.' },
    ],
    reviewQuestions: [
      '¿Cuál es la idea principal de este material?',
      '¿Qué ejemplos ilustran los conceptos clave?',
      '¿Cómo se relaciona este contenido con el tema general?',
    ],
  };
}