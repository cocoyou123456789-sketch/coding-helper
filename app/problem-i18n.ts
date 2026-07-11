import { problemDetails } from "./problem-details";
import { problemEnglishA } from "./problem-i18n-a";
import { problemEnglishB } from "./problem-i18n-b";
import { problemEnglishC } from "./problem-i18n-c";
import type { ProblemDetail } from "./problem-detail-types";
import type { ProblemEnglishCopy } from "./problem-i18n-types";
import type { Problem } from "./problems";

export type Language = "zh" | "en";

export const problemEnglish: Record<number, ProblemEnglishCopy> = {
  ...problemEnglishA,
  ...problemEnglishB,
  ...problemEnglishC,
};

function englishStarterCode(code: string): string {
  return code
    .replace("# 写下你的解法", "# Write your solution")
    .replace("# 在这里初始化哈希表与双向链表", "# Initialize the hash map and doubly linked list")
    .replace("# 在这里初始化两个堆", "# Initialize the two heaps");
}

export function localizeProblem(problem: Problem, language: Language): Problem {
  if (language === "zh") return problem;
  const copy = problemEnglish[problem.id];
  if (!copy) return problem;
  return {
    ...problem,
    title: copy.title,
    topic: copy.topic,
    summary: copy.summary,
    example: copy.example,
    method: copy.method,
    hint: copy.hint,
    complexity: copy.complexity,
    starterCode: englishStarterCode(problem.starterCode),
  };
}

export function localizeDetail(problem: Problem, language: Language): ProblemDetail {
  if (language === "en" && problemEnglish[problem.id]) {
    return {
      statement: problemEnglish[problem.id].statement,
      requirements: problemEnglish[problem.id].requirements,
    };
  }
  return problemDetails[problem.id] ?? {
    statement: problem.summary,
    requirements: language === "en"
      ? ["Complete the required function for the given input.", "Return or mutate the result exactly as requested."]
      : ["按照题目给出的输入完成函数。", "返回值或原地修改结果需要符合题目要求。"],
  };
}
