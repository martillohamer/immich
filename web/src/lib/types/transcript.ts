export type KeyConcept = {
  term: string;
  definition: string;
};

export type SummaryData = {
  executiveSummary: string;
  keyConcepts: KeyConcept[];
  reviewQuestions: string[];
};

export type FlashcardSource = 'concept' | 'question';
export type FlashcardDifficulty = 'easy' | 'medium' | 'hard';
export type FlashcardGrade = 'known' | 'again';

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  source: FlashcardSource;
  difficulty?: FlashcardDifficulty;
};

export type FlashcardDeck = {
  id: string;
  title: string;
  cards: Flashcard[];
};

export type ChatRole = 'user' | 'assistant';

export type ChatCitation = {
  timestampStart: number;
  timestampEnd: number;
  textSnippet: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  citations?: ChatCitation[];
};

export type ChatSession = {
  assetId: string;
  messages: ChatMessage[];
};

export type QuizOption = {
  id: string;
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
  answers: Record<string, string>;
  submitted: boolean;
  score: number;
};

export type ObsidianExportOptions = {
  includeFrontmatter: boolean;
  includeCallouts: boolean;
  includeTranscript: boolean;
  includeQuizHistory: boolean;
  tags: string[];
};
