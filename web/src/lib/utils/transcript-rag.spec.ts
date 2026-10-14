import { describe, expect, it } from 'vitest';
import { createRagEngine, formatTimestamp, toCitations } from './transcript-rag';

const segments = [
  { start: 0, end: 10, text: 'La fotosíntesis convierte la luz solar en energía química' },
  { start: 10, end: 20, text: 'El aparato de Golgi empaqueta proteínas dentro de la célula' },
  { start: 20, end: 30, text: 'Las mitocondrias producen energía para la célula' },
];

const idfSegments = [
  { start: 0, end: 5, text: 'energia mitocondria' },
  { start: 5, end: 10, text: 'energia celula' },
  { start: 10, end: 15, text: 'energia membrana' },
  { start: 15, end: 20, text: 'mitocondria fotosintesis' },
];

const phraseSegments = [
  { start: 0, end: 5, text: 'clave secreta' },
  { start: 5, end: 10, text: 'la clave esta en la secreta puerta' },
];

describe('formatTimestamp', () => {
  it('formatea minutos y segundos', () => {
    expect(formatTimestamp(0)).toBe('00:00');
    expect(formatTimestamp(65)).toBe('01:05');
    expect(formatTimestamp(3599)).toBe('59:59');
  });

  it('incluye horas cuando es >= 1 hora', () => {
    expect(formatTimestamp(3600)).toBe('01:00:00');
    expect(formatTimestamp(3661)).toBe('01:01:01');
  });

  it('clampea valores negativos a cero', () => {
    expect(formatTimestamp(-5)).toBe('00:00');
  });
});

describe('createRagEngine', () => {
  it('devuelve los segmentos que contienen el término, ordenados por índice en empate', () => {
    const engine = createRagEngine(segments);
    const results = engine.search('energía');
    expect(results.map((result) => result.index)).toEqual([0, 2]);
  });

  it('pondera más los términos raros (IDF) en una consulta multi-término', () => {
    const engine = createRagEngine(idfSegments);
    const results = engine.search('energia mitocondria');
    expect(results[0].index).toBe(0);
    expect(results[0].score).toBeCloseTo(1);
    expect(results[1].index).toBe(3);
    expect(results[1].score).toBeLessThan(results[0].score);
  });

  it('puntúa 1.0 una frase contigua completa y menos una no contigua', () => {
    const engine = createRagEngine(phraseSegments);
    const results = engine.search('clave secreta');
    expect(results[0].index).toBe(0);
    expect(results[0].score).toBeCloseTo(1);
    expect(results[1].index).toBe(1);
    expect(results[1].score).toBeCloseTo(0.8);
  });

  it('respeta topK', () => {
    const engine = createRagEngine(idfSegments);
    const results = engine.search('mitocondria', { topK: 1 });
    expect(results).toHaveLength(1);
  });

  it('filtra por minScore', () => {
    const engine = createRagEngine(idfSegments);
    const results = engine.search('energia mitocondria', { minScore: 0.9 });
    expect(results.map((result) => result.index)).toEqual([0]);
  });

  it('devuelve vacío si no hay coincidencias', () => {
    const engine = createRagEngine(segments);
    expect(engine.search('guitarra eléctrica')).toEqual([]);
  });

  it('devuelve vacío para consultas vacías o solo stopwords', () => {
    const engine = createRagEngine(segments);
    expect(engine.search('')).toEqual([]);
    expect(engine.search('la de en y')).toEqual([]);
  });

  it('devuelve vacío sin segmentos', () => {
    const engine = createRagEngine([]);
    expect(engine.search('energía')).toEqual([]);
  });
});

describe('toCitations', () => {
  it('mapea segmentos recuperados a citas', () => {
    const engine = createRagEngine(segments);
    const citations = toCitations(engine.search('energía'));
    expect(citations[0]).toEqual({ timestampStart: 0, timestampEnd: 10, textSnippet: segments[0].text });
  });
});
