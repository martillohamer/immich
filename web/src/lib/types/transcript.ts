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
