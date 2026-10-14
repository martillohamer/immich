import type { ChatCitation } from '$lib/types/transcript';

export type TranscriptSegment = { start: number; end: number; text: string };

export type RetrievedSegment = {
  index: number;
  start: number;
  end: number;
  text: string;
  score: number;
};

export type RagSearchOptions = {
  topK?: number;
  minScore?: number;
};

export interface RagEngine {
  search(query: string, options?: RagSearchOptions): RetrievedSegment[];
}

const DEFAULT_TOP_K = 3;
const DEFAULT_MIN_SCORE = 0.3;
const COVERAGE_WEIGHT = 0.8;
const PHRASE_WEIGHT = 0.2;

const STOPWORDS = new Set([
  'de',
  'la',
  'el',
  'en',
  'y',
  'a',
  'los',
  'del',
  'se',
  'las',
  'por',
  'un',
  'para',
  'con',
  'una',
  'su',
  'al',
  'es',
  'lo',
  'como',
  'pero',
  'sus',
  'le',
  'ya',
  'o',
  'este',
  'si',
  'porque',
  'esta',
  'entre',
  'cuando',
  'muy',
  'sin',
  'sobre',
  'tambien',
  'me',
  'hasta',
  'hay',
  'donde',
  'quien',
  'desde',
  'todo',
  'nos',
  'durante',
  'todos',
  'uno',
  'les',
  'ni',
  'contra',
  'otros',
  'ese',
  'eso',
  'ante',
  'ellos',
  'esto',
  'mi',
  'antes',
  'algunos',
  'que',
  'cual',
  'the',
  'an',
  'and',
  'or',
  'but',
  'if',
  'of',
  'at',
  'by',
  'for',
  'with',
  'about',
  'as',
  'into',
  'like',
  'through',
  'after',
  'over',
  'between',
  'out',
  'against',
  'without',
  'before',
  'under',
  'around',
  'among',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'am',
  'do',
  'does',
  'did',
  'doing',
  'have',
  'has',
  'had',
  'having',
  'to',
  'from',
  'in',
  'on',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'you',
  'he',
  'she',
  'we',
  'they',
  'them',
  'his',
  'her',
  'their',
  'our',
  'your',
  'my',
  'us',
  'him',
  'what',
  'which',
  'who',
  'when',
  'where',
  'why',
  'how',
  'not',
  'no',
  'so',
  'than',
  'then',
  'too',
  'very',
  'can',
  'will',
  'would',
  'should',
  'could',
  'there',
  'here',
]);

const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

const tokenize = (text: string): string[] => {
  const tokens: string[] = [];
  for (const word of normalizeText(text).split(/[^a-z0-9]+/)) {
    if (word.length >= 2 && !STOPWORDS.has(word)) {
      tokens.push(word);
    }
  }
  return tokens;
};

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

export function toCitations(segments: RetrievedSegment[]): ChatCitation[] {
  return segments.map((segment) => ({
    timestampStart: segment.start,
    timestampEnd: segment.end,
    textSnippet: segment.text,
  }));
}

export function createRagEngine(segments: TranscriptSegment[]): RagEngine {
  const segmentTokens = segments.map((segment) => new Set(tokenize(segment.text)));
  const segmentText = segments.map((segment) => normalizeText(segment.text));

  const documentFrequency = new Map<string, number>();
  for (const tokens of segmentTokens) {
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const total = segments.length;
  const idf = (token: string): number => {
    const frequency = documentFrequency.get(token) ?? 0;
    return frequency === 0 ? 0 : Math.log(1 + total / frequency);
  };

  const search = (query: string, options: RagSearchOptions = {}): RetrievedSegment[] => {
    const topK = options.topK ?? DEFAULT_TOP_K;
    const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    const queryTokens = new Set(tokenize(query));
    if (queryTokens.size === 0) {
      return [];
    }

    let denominator = 0;
    for (const token of queryTokens) {
      denominator += idf(token);
    }
    if (denominator === 0) {
      return [];
    }

    const normalizedQuery = normalizeText(query);
    const scored: RetrievedSegment[] = [];
    for (const [index, segment] of segments.entries()) {
      const tokens = segmentTokens[index];
      let numerator = 0;
      for (const token of queryTokens) {
        if (tokens.has(token)) {
          numerator += idf(token);
        }
      }
      const coverage = numerator / denominator;
      const phrase = normalizedQuery.length > 0 && segmentText[index].includes(normalizedQuery) ? 1 : 0;
      const score = COVERAGE_WEIGHT * coverage + PHRASE_WEIGHT * phrase;
      if (score >= minScore) {
        scored.push({ index, start: segment.start, end: segment.end, text: segment.text, score });
      }
    }

    scored.sort((left, right) => right.score - left.score || left.index - right.index);
    return scored.slice(0, topK);
  };

  return { search };
}
