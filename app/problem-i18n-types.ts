import type { ProblemExample } from "./problem-detail-types";

export interface ProblemEnglishCopy {
  title: string;
  topic: string;
  summary: string;
  example: string;
  method: string;
  hint: string;
  complexity: string;
  statement: string;
  requirements: string[];
  examples?: ProblemExample[];
}
