export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface ProblemDetail {
  statement: string;
  requirements: string[];
  examples?: ProblemExample[];
}
