export type KeyConcept = {
  term: string;
  definition: string;
};

export type SummaryData = {
  executiveSummary: string;
  keyConcepts: KeyConcept[];
  reviewQuestions: string[];
};