import { problemDetailsA } from "./problem-details-a";
import { problemDetailsB } from "./problem-details-b";
import { problemDetailsC } from "./problem-details-c";
import type { ProblemDetail } from "./problem-detail-types";

export const problemDetails: Record<number, ProblemDetail> = {
  ...problemDetailsA,
  ...problemDetailsB,
  ...problemDetailsC,
};
