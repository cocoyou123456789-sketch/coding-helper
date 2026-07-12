"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { localizeDetail, type Language } from "./problem-i18n";
import type { Problem } from "./problems";

type LearningStatus = "todo" | "learning" | "solved" | "review";
type Activity = "home" | "lesson" | "cards" | "sprint";

export interface LearningProfile {
  xp: number;
  todayXp: number;
  todayDate: string;
  streak: number;
  lessons: number;
  sprintBest: number;
}

type LearningHubProps = {
  problems: Problem[];
  records: Record<number, { status: LearningStatus } | undefined>;
  profile: LearningProfile;
  language: Language;
  difficultyFilter: "all" | Problem["difficulty"];
  onDifficultyChange: (difficulty: "all" | Problem["difficulty"]) => void;
  onEarnXp: (points: number) => void;
  onFinishLesson: () => void;
  onMarkStatus: (id: number, status: LearningStatus) => void;
  onOpenProblem: (id: number) => void;
  onSprintBest: (score: number) => void;
};

type QuizQuestion = {
  eyebrow: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

const DAILY_GOAL = 20;

const difficultyOrder: Record<Problem["difficulty"], number> = { 简单: 0, 中等: 1, 困难: 2 };

const hubCopy = {
  zh: {
    patternEyebrow: "识别模式",
    patternPrompt: (title: string) => `「${title}」主要属于哪一种题型？`,
    patternExplanation: (topic: string) => `这道题归在「${topic}」。先认出题型，才能快速找到常用工具。`,
    methodEyebrow: "选择思路",
    methodPrompt: (title: string) => `解决「${title}」时，哪一步最关键？`,
    complexityEyebrow: "复杂度判断",
    complexityPrompt: (title: string) => `「${title}」的推荐复杂度是哪一个？`,
    complexityExplanation: (complexity: string) => `这道题的目标是 ${complexity}。先写对，再逐步优化到这个量级。`,
    exitLesson: "退出今日小课",
    hearts: (count: number) => `还剩 ${count} 颗心`,
    stepOne: "第 1 步 · 先读懂，不写代码",
    example: "看一个例子",
    understood: "我看懂题目了",
    step: (step: number, label: string) => `第 ${step} 步 · ${label}`,
    correct: "答对了！+5 XP",
    reviewAgain: "先记下来，下次会再复习",
    finishLesson: "完成小课",
    next: "下一题",
    lessonComplete: "今日小课完成",
    lessonCompleteTitle: "你已经会认这道题了",
    lessonCompleteBody: "现在再进入完整代码题，会比一上来死磕轻松很多。",
    maxXp: "最高 25 XP",
    lessonXp: "本节经验",
    heartsLeft: "剩余心心",
    topicLearned: "学习题型",
    codeChallenge: "进入代码挑战",
    backPath: "先回学习路径",
    exitCards: "退出闪卡复习",
    questionSide: "题目面",
    answerSide: "答案面",
    flip: "翻到答案",
    coreIdea: "核心思路",
    clue: "识别信号",
    complexity: "复杂度",
    forgot: "还没记住",
    remembered: "记住了",
    cardsDone: "这组闪卡复习完了",
    cardsDoneBody: "没记住的题已经放回复习队列，之后会再次出现。",
    backToPath: "回到学习路径",
    exitSprint: "退出极速挑战",
    score: "得分",
    combo: (count: number) => `⚡ 连对 ${count} 题`,
    timeUp: "时间到",
    sprintSummary: (count: number, best: number) => `本局完成 ${count} 题，历史最高 ${best} 分。`,
    again: "再来 60 秒",
    dailyQuest: "YOUR DAILY QUEST",
    heroTitle: <>今天学一点，<br />不用死磕一道题。</>,
    heroBody: "先认题型，再做快问快答和闪卡，最后才进入完整代码。每次 10–15 分钟。",
    startLesson: "开始今日小课",
    sprint: "60 秒极速挑战",
    openPractice: "直接练完整题",
    goalDone: "今日目标完成！",
    dailyGoal: "今日学习目标",
    keepGoing: "保持这个节奏，明天继续。",
    xpLeft: (points: number) => `还差 ${points} XP，约一节小课。`,
    streak: "连续天数",
    totalXp: "总经验值",
    lessons: "完成小课",
    lessonDuration: "10–15 分钟",
    lessonMode: "闯关小课",
    lessonModeBody: "题意卡 → 识别题型 → 选择思路 → 判断复杂度",
    start: "开始 →",
    sprintDuration: "60 秒",
    sprintMode: "极速抢答",
    sprintModeBody: "随机混合题型，连对越多得分越高。",
    challenge: "挑战 →",
    cardsDue: (count: number) => `${count} 张待复习`,
    cardsMode: "算法闪卡",
    cardsModeBody: "快速回忆题型、核心思路和复杂度。",
    review: "复习 →",
    practiceDuration: "不限时 · 边做边记",
    practiceMode: "完整题目练习",
    practiceModeBody: "查看题意重述和官方原题链接，写代码、跑测试并同步记笔记。",
    practice: "练习 →",
    learnByDifficulty: "按难度学习",
    allLevels: "全部",
    difficultyLabels: { 简单: "简单", 中等: "中等", 困难: "困难" } as Record<Problem["difficulty"], string>,
    learningPath: "按题型闯关",
    unitsComplete: (done: number, total: number) => `${done} / ${total} 单元完成`,
    masteredCount: (done: number, total: number) => `${done} / ${total} 道掌握`,
    smartReview: "SMART REVIEW",
    recommended: "今天推荐",
    reviewIntro: "优先安排“待复习”和“学习中”的题，不必按题号硬刷。",
    status: { review: "需要复习", learning: "学习中", solved: "已掌握", todo: "新题" } as Record<LearningStatus, string>,
    flashcardSet: "开始一组闪卡复习",
  },
  en: {
    patternEyebrow: "Recognize the pattern",
    patternPrompt: (title: string) => `Which topic best matches “${title}”?`,
    patternExplanation: (topic: string) => `This problem belongs to ${topic}. Recognizing the pattern helps you choose the right tool quickly.`,
    methodEyebrow: "Choose an approach",
    methodPrompt: (title: string) => `What is the key step for solving “${title}”?`,
    complexityEyebrow: "Judge complexity",
    complexityPrompt: (title: string) => `What is the recommended complexity for “${title}”?`,
    complexityExplanation: (complexity: string) => `The target is ${complexity}. Get a correct solution first, then optimize toward this goal.`,
    exitLesson: "Exit daily lesson",
    hearts: (count: number) => `${count} hearts left`,
    stepOne: "Step 1 · Understand before coding",
    example: "Example",
    understood: "I understand the prompt",
    step: (step: number, label: string) => `Step ${step} · ${label}`,
    correct: "Correct! +5 XP",
    reviewAgain: "Saved for review — you will see it again",
    finishLesson: "Finish lesson",
    next: "Next question",
    lessonComplete: "Daily lesson complete",
    lessonCompleteTitle: "You can recognize this problem now",
    lessonCompleteBody: "The full coding problem will feel much easier after this short warm-up.",
    maxXp: "Up to 25 XP",
    lessonXp: "Lesson XP",
    heartsLeft: "Hearts left",
    topicLearned: "Topic",
    codeChallenge: "Start coding challenge",
    backPath: "Back to learning path",
    exitCards: "Exit flashcards",
    questionSide: "Prompt side",
    answerSide: "Answer side",
    flip: "Reveal answer",
    coreIdea: "Core idea",
    clue: "Recognition clue",
    complexity: "Complexity",
    forgot: "Still learning",
    remembered: "Got it",
    cardsDone: "Flashcard set complete",
    cardsDoneBody: "Anything you forgot is back in the review queue and will appear again.",
    backToPath: "Back to learning path",
    exitSprint: "Exit Sprint",
    score: "Score",
    combo: (count: number) => `⚡ ${count} correct in a row`,
    timeUp: "Time is up",
    sprintSummary: (count: number, best: number) => `You answered ${count} questions. Best score: ${best}.`,
    again: "Play another 60 seconds",
    dailyQuest: "YOUR DAILY QUEST",
    heroTitle: <>Learn a little today.<br />Never grind one problem for hours.</>,
    heroBody: "Recognize the pattern, answer a few quick questions, review flashcards, and only then open the full coding problem. Each session takes 10–15 minutes.",
    startLesson: "Start today’s lesson",
    sprint: "60-second Sprint",
    openPractice: "Practice a full problem",
    goalDone: "Daily goal complete!",
    dailyGoal: "Daily learning goal",
    keepGoing: "Great pace. Come back tomorrow to keep the streak.",
    xpLeft: (points: number) => `${points} XP left — about one short lesson.`,
    streak: "Day streak",
    totalXp: "Total XP",
    lessons: "Lessons",
    lessonDuration: "10–15 minutes",
    lessonMode: "Quest lesson",
    lessonModeBody: "Prompt card → pattern → approach → complexity",
    start: "Start →",
    sprintDuration: "60 seconds",
    sprintMode: "Speed quiz",
    sprintModeBody: "Mixed topics, fast answers, and a growing combo score.",
    challenge: "Play →",
    cardsDue: (count: number) => `${count} cards due`,
    cardsMode: "Algorithm flashcards",
    cardsModeBody: "Recall the topic, core idea, clue, and complexity.",
    review: "Review →",
    practiceDuration: "Untimed · Code and take notes",
    practiceMode: "Full problem practice",
    practiceModeBody: "Read a clear paraphrase, open the official prompt, run tests, and take line notes.",
    practice: "Practice →",
    learnByDifficulty: "Learn by difficulty",
    allLevels: "All",
    difficultyLabels: { 简单: "Easy", 中等: "Medium", 困难: "Hard" } as Record<Problem["difficulty"], string>,
    learningPath: "Topic quests",
    unitsComplete: (done: number, total: number) => `${done} / ${total} units complete`,
    masteredCount: (done: number, total: number) => `${done} / ${total} mastered`,
    smartReview: "SMART REVIEW",
    recommended: "Recommended today",
    reviewIntro: "Review and in-progress problems come first, so you never have to grind by problem number.",
    status: { review: "Review", learning: "Learning", solved: "Mastered", todo: "New" } as Record<LearningStatus, string>,
    flashcardSet: "Start a flashcard set",
  },
} as const;

const statusOrder: Record<LearningStatus, number> = {
  review: 0,
  learning: 1,
  todo: 2,
  solved: 3,
};

function rotate<T>(items: T[], amount: number): T[] {
  if (!items.length) return [];
  const offset = ((amount % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function optionsFor(correct: string, candidates: string[], seed: number): string[] {
  const choices = [correct, ...candidates.filter((item) => item && item !== correct)]
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 4);
  return rotate(choices, seed % Math.max(choices.length, 1));
}

function makeQuestion(problem: Problem, round: number, allProblems: Problem[], language: Language): QuizQuestion {
  const text = hubCopy[language];
  if (round % 3 === 0) {
    const topics = Array.from(new Set(allProblems.map((item) => item.topic)));
    return {
      eyebrow: text.patternEyebrow,
      prompt: text.patternPrompt(problem.title),
      options: optionsFor(problem.topic, topics, problem.id + round),
      answer: problem.topic,
      explanation: text.patternExplanation(problem.topic),
    };
  }

  if (round % 3 === 1) {
    const methods = allProblems
      .filter((item) => item.id !== problem.id && item.topic !== problem.topic)
      .map((item) => item.method);
    return {
      eyebrow: text.methodEyebrow,
      prompt: text.methodPrompt(problem.title),
      options: optionsFor(problem.method, methods, problem.id + round),
      answer: problem.method,
      explanation: problem.hint,
    };
  }

  const complexities = Array.from(new Set(allProblems.map((item) => item.complexity)));
  return {
    eyebrow: text.complexityEyebrow,
    prompt: text.complexityPrompt(problem.title),
    options: optionsFor(problem.complexity, complexities, problem.id + round),
    answer: problem.complexity,
    explanation: text.complexityExplanation(problem.complexity),
  };
}

export default function LearningHub({
  problems,
  records,
  profile,
  language,
  difficultyFilter,
  onDifficultyChange,
  onEarnXp,
  onFinishLesson,
  onMarkStatus,
  onOpenProblem,
  onSprintBest,
}: LearningHubProps) {
  const [activity, setActivity] = useState<Activity>("home");
  const [lessonProblemId, setLessonProblemId] = useState(problems[0].id);
  const [lessonStep, setLessonStep] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [sprintTime, setSprintTime] = useState(60);
  const [sprintIndex, setSprintIndex] = useState(0);
  const [sprintScore, setSprintScore] = useState(0);
  const [sprintCombo, setSprintCombo] = useState(0);

  const text = hubCopy[language];
  const scopedProblems = useMemo(
    () => problems
      .filter((problem) => difficultyFilter === "all" || problem.difficulty === difficultyFilter)
      .sort((first, second) => difficultyOrder[first.difficulty] - difficultyOrder[second.difficulty]),
    [difficultyFilter, problems],
  );

  const dailyQueue = useMemo(() => {
    return [...scopedProblems]
      .sort((first, second) => {
        const firstStatus = records[first.id]?.status ?? "todo";
        const secondStatus = records[second.id]?.status ?? "todo";
        return statusOrder[firstStatus] - statusOrder[secondStatus];
      })
      .slice(0, 10);
  }, [records, scopedProblems]);

  const topics = useMemo(() => {
    return Array.from(new Set(scopedProblems.map((problem) => problem.topic))).map((topic) => {
      const topicProblems = scopedProblems.filter((problem) => problem.topic === topic);
      const solved = topicProblems.filter((problem) => records[problem.id]?.status === "solved").length;
      const nextProblem = topicProblems.find((problem) => records[problem.id]?.status !== "solved") ?? topicProblems[0];
      return { topic, total: topicProblems.length, solved, nextProblem };
    });
  }, [records, scopedProblems]);

  const lessonProblem = scopedProblems.find((problem) => problem.id === lessonProblemId) ?? dailyQueue[0] ?? scopedProblems[0] ?? problems[0];
  const lessonDetail = localizeDetail(lessonProblem, language);
  const lessonQuestions = useMemo(
    () => [0, 1, 2].map((round) => makeQuestion(lessonProblem, round, scopedProblems, language)),
    [language, lessonProblem, scopedProblems],
  );
  const activeLessonQuestion = lessonStep > 0 && lessonStep <= 3 ? lessonQuestions[lessonStep - 1] : null;

  const flashcards = dailyQueue.length ? dailyQueue : scopedProblems.slice(0, 10);
  const activeCard = flashcards[cardIndex] ?? flashcards[0];
  const activeCardDetail = activeCard ? localizeDetail(activeCard, language) : undefined;

  const sprintProblems = dailyQueue.length ? dailyQueue : scopedProblems.slice(0, 10);
  const sprintProblem = sprintProblems[sprintIndex % sprintProblems.length];
  const sprintQuestion = useMemo(
    () => makeQuestion(sprintProblem, sprintIndex, scopedProblems, language),
    [language, scopedProblems, sprintProblem, sprintIndex],
  );

  useEffect(() => {
    if (activity !== "sprint" || sprintTime <= 0) return;
    const timer = window.setInterval(() => setSprintTime((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [activity, sprintTime]);

  useEffect(() => {
    if (activity === "sprint" && sprintTime === 0) onSprintBest(sprintScore);
  }, [activity, sprintScore, sprintTime, onSprintBest]);

  function startLesson(problem = dailyQueue[0] ?? scopedProblems[0] ?? problems[0]) {
    setLessonProblemId(problem.id);
    setLessonStep(0);
    setHearts(3);
    setSelectedAnswer("");
    setActivity("lesson");
  }

  function advanceLesson() {
    setSelectedAnswer("");
    setLessonStep((current) => current + 1);
  }

  function answerLesson(option: string) {
    if (!activeLessonQuestion || selectedAnswer) return;
    setSelectedAnswer(option);
    if (option === activeLessonQuestion.answer) {
      onEarnXp(5);
      onMarkStatus(lessonProblem.id, "learning");
    } else {
      setHearts((current) => Math.max(0, current - 1));
      onMarkStatus(lessonProblem.id, "review");
    }
  }

  function finishConceptCard() {
    onEarnXp(3);
    onMarkStatus(lessonProblem.id, "learning");
    setLessonStep(1);
  }

  function finishLesson() {
    onEarnXp(7);
    onFinishLesson();
    onMarkStatus(lessonProblem.id, hearts > 0 ? "learning" : "review");
    setLessonStep(4);
  }

  function startCards() {
    setCardIndex(0);
    setCardRevealed(false);
    setActivity("cards");
  }

  function rateCard(remembered: boolean) {
    if (!activeCard) return;
    onEarnXp(remembered ? 4 : 1);
    onMarkStatus(activeCard.id, remembered ? "learning" : "review");
    setCardRevealed(false);
    setCardIndex((current) => current + 1);
  }

  function startSprint() {
    setSprintTime(60);
    setSprintIndex(0);
    setSprintScore(0);
    setSprintCombo(0);
    setActivity("sprint");
  }

  function answerSprint(option: string) {
    if (sprintTime <= 0) return;
    if (option === sprintQuestion.answer) {
      const nextCombo = sprintCombo + 1;
      setSprintCombo(nextCombo);
      setSprintScore((current) => current + 100 + Math.min(nextCombo * 20, 100));
      onEarnXp(2);
    } else {
      setSprintCombo(0);
      onMarkStatus(sprintProblem.id, "review");
    }
    setSprintIndex((current) => current + 1);
  }

  const todayProgress = Math.min(100, Math.round((profile.todayXp / DAILY_GOAL) * 100));

  if (activity === "lesson") {
    const isComplete = lessonStep >= 4;
    return (
      <section className="activity-screen" aria-label={text.startLesson}>
        <div className="activity-topbar">
          <button type="button" onClick={() => setActivity("home")} aria-label={text.exitLesson}>×</button>
          <div className="lesson-progress"><span style={{ width: `${Math.min(100, (lessonStep / 4) * 100)}%` }} /></div>
          <div className="heart-count" aria-label={text.hearts(hearts)}>♥ {hearts}</div>
        </div>

        <div className="lesson-stage">
          {lessonStep === 0 && (
            <article className="concept-card">
              <div className="activity-kicker">{text.stepOne}</div>
              <span className="topic-chip">{lessonProblem.topic}</span>
              <h1>{lessonProblem.id}. {lessonProblem.title}</h1>
              <p>{lessonDetail.statement}</p>
              <div className="concept-example"><span>{text.example}</span><code>{lessonProblem.example}</code></div>
              <ul>
                {lessonDetail.requirements.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <button className="learn-primary" type="button" onClick={finishConceptCard}>{text.understood} <b>+3 XP</b></button>
            </article>
          )}

          {activeLessonQuestion && (
            <article className="quiz-card">
              <div className="activity-kicker">{text.step(lessonStep + 1, activeLessonQuestion.eyebrow)}</div>
              <h1>{activeLessonQuestion.prompt}</h1>
              <div className="quiz-options">
                {activeLessonQuestion.options.map((option, index) => {
                  const isChosen = selectedAnswer === option;
                  const isCorrect = selectedAnswer && option === activeLessonQuestion.answer;
                  const isWrong = isChosen && option !== activeLessonQuestion.answer;
                  return (
                    <button
                      type="button"
                      key={option}
                      className={`${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}`}
                      onClick={() => answerLesson(option)}
                      disabled={Boolean(selectedAnswer)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>{option}
                    </button>
                  );
                })}
              </div>
              {selectedAnswer && (
                <div className={`answer-feedback ${selectedAnswer === activeLessonQuestion.answer ? "is-correct" : "is-wrong"}`} aria-live="polite">
                  <strong>{selectedAnswer === activeLessonQuestion.answer ? text.correct : text.reviewAgain}</strong>
                  <p>{activeLessonQuestion.explanation}</p>
                  <button type="button" onClick={lessonStep === 3 ? finishLesson : advanceLesson}>
                    {lessonStep === 3 ? text.finishLesson : text.next}
                  </button>
                </div>
              )}
            </article>
          )}

          {isComplete && (
            <article className="lesson-complete">
              <div className="completion-burst" aria-hidden="true">+25</div>
              <div className="activity-kicker">{text.lessonComplete}</div>
              <h1>{text.lessonCompleteTitle}</h1>
              <p>{text.lessonCompleteBody}</p>
              <div className="completion-stats">
                <div><strong>{text.maxXp}</strong><span>{text.lessonXp}</span></div>
                <div><strong>{hearts}/3</strong><span>{text.heartsLeft}</span></div>
                <div><strong>{lessonProblem.topic}</strong><span>{text.topicLearned}</span></div>
              </div>
              <button className="learn-primary" type="button" onClick={() => onOpenProblem(lessonProblem.id)}>{text.codeChallenge}</button>
              <button className="learn-secondary" type="button" onClick={() => setActivity("home")}>{text.backPath}</button>
            </article>
          )}
        </div>
      </section>
    );
  }

  if (activity === "cards") {
    const cardsFinished = cardIndex >= flashcards.length;
    return (
      <section className="activity-screen flashcard-screen" aria-label={text.cardsMode}>
        <div className="activity-topbar">
          <button type="button" onClick={() => setActivity("home")} aria-label={text.exitCards}>×</button>
          <div className="lesson-progress"><span style={{ width: `${Math.min(100, (cardIndex / flashcards.length) * 100)}%` }} /></div>
          <div className="card-count">{Math.min(cardIndex + 1, flashcards.length)} / {flashcards.length}</div>
        </div>
        <div className="lesson-stage">
          {!cardsFinished && activeCard ? (
            <article className={`study-flashcard ${cardRevealed ? "is-revealed" : ""}`}>
              <div className="activity-kicker">{cardRevealed ? text.answerSide : text.questionSide}</div>
              <span className="topic-chip">{activeCard.topic}</span>
              <h1>{activeCard.title}</h1>
              {!cardRevealed ? (
                <>
                  <p>{activeCardDetail?.statement ?? activeCard.summary}</p>
                  <button className="learn-primary" type="button" onClick={() => setCardRevealed(true)}>{text.flip}</button>
                </>
              ) : (
                <>
                  <div className="flashcard-answer"><span>{text.coreIdea}</span><p>{activeCard.method}</p></div>
                  <div className="flashcard-answer"><span>{text.clue}</span><p>{activeCard.hint}</p></div>
                  <div className="flashcard-answer"><span>{text.complexity}</span><p>{activeCard.complexity}</p></div>
                  <div className="flashcard-actions">
                    <button type="button" onClick={() => rateCard(false)}>{text.forgot} <b>+1 XP</b></button>
                    <button type="button" onClick={() => rateCard(true)}>{text.remembered} <b>+4 XP</b></button>
                  </div>
                </>
              )}
            </article>
          ) : (
            <article className="lesson-complete">
              <div className="completion-burst" aria-hidden="true">✓</div>
              <h1>{text.cardsDone}</h1>
              <p>{text.cardsDoneBody}</p>
              <button className="learn-primary" type="button" onClick={() => setActivity("home")}>{text.backToPath}</button>
            </article>
          )}
        </div>
      </section>
    );
  }

  if (activity === "sprint") {
    const sprintFinished = sprintTime <= 0;
    return (
      <section className="activity-screen sprint-screen" aria-label={text.sprint}>
        <div className="activity-topbar sprint-topbar">
          <button type="button" onClick={() => setActivity("home")} aria-label={text.exitSprint}>×</button>
          <div className="sprint-score"><span>{text.score}</span><strong>{sprintScore}</strong></div>
          <div className="sprint-timer" aria-live="polite">{sprintTime}s</div>
        </div>
        <div className="lesson-stage">
          {!sprintFinished ? (
            <article className="sprint-card">
              <div className="activity-kicker">{text.combo(sprintCombo)}</div>
              <h1>{sprintQuestion.prompt}</h1>
              <div className="sprint-options">
                {sprintQuestion.options.map((option, index) => (
                  <button type="button" key={option} onClick={() => answerSprint(option)}>
                    <span>{index + 1}</span>{option}
                  </button>
                ))}
              </div>
            </article>
          ) : (
            <article className="lesson-complete">
              <div className="completion-burst" aria-hidden="true">⚡</div>
              <div className="activity-kicker">{text.timeUp}</div>
              <h1>{sprintScore}</h1>
              <p>{text.sprintSummary(sprintIndex, Math.max(profile.sprintBest, sprintScore))}</p>
              <button className="learn-primary" type="button" onClick={startSprint}>{text.again}</button>
              <button className="learn-secondary" type="button" onClick={() => setActivity("home")}>{text.backToPath}</button>
            </article>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="learning-hub" aria-label={text.learningPath}>
      <div className="learn-hero">
        <div className="learn-hero-copy">
          <div className="activity-kicker">{text.dailyQuest}</div>
          <h1>{text.heroTitle}</h1>
          <p>{text.heroBody}</p>
          <div className="hero-actions">
            <button className="learn-primary" type="button" onClick={() => startLesson()}>{text.startLesson}</button>
            <button className="learn-secondary" type="button" onClick={startSprint}>{text.sprint}</button>
            <button className="learn-secondary" type="button" onClick={() => onOpenProblem(dailyQueue[0]?.id ?? problems[0].id)}>{text.openPractice}</button>
          </div>
        </div>
        <div className="daily-goal-card">
          <div className="goal-ring" style={{ "--goal-progress": `${todayProgress * 3.6}deg` } as CSSProperties}>
            <div><strong>{profile.todayXp}</strong><span>/ {DAILY_GOAL} XP</span></div>
          </div>
          <h2>{todayProgress >= 100 ? text.goalDone : text.dailyGoal}</h2>
          <p>{todayProgress >= 100 ? text.keepGoing : text.xpLeft(Math.max(0, DAILY_GOAL - profile.todayXp))}</p>
          <div className="profile-stats">
            <div><strong>🔥 {profile.streak}</strong><span>{text.streak}</span></div>
            <div><strong>✦ {profile.xp}</strong><span>{text.totalXp}</span></div>
            <div><strong>{profile.lessons}</strong><span>{text.lessons}</span></div>
          </div>
        </div>
      </div>

      <div className="difficulty-filter-bar" role="group" aria-label={text.learnByDifficulty}>
        <strong>{text.learnByDifficulty}</strong>
        <button type="button" className={difficultyFilter === "all" ? "is-active" : ""} onClick={() => onDifficultyChange("all")}>{text.allLevels}</button>
        {(Object.keys(difficultyOrder) as Problem["difficulty"][]).map((difficulty) => (
          <button type="button" key={difficulty} className={difficultyFilter === difficulty ? `is-active difficulty-${difficultyOrder[difficulty]}` : ""} onClick={() => onDifficultyChange(difficulty)}>
            {text.difficultyLabels[difficulty]}
          </button>
        ))}
      </div>

      <div className="learning-modes">
        <button type="button" className="mode-card mode-lesson" onClick={() => startLesson()}>
          <span className="mode-icon">01</span>
          <div><small>{text.lessonDuration}</small><h2>{text.lessonMode}</h2><p>{text.lessonModeBody}</p></div>
          <b>{text.start}</b>
        </button>
        <button type="button" className="mode-card mode-sprint" onClick={startSprint}>
          <span className="mode-icon">⚡</span>
          <div><small>{text.sprintDuration}</small><h2>{text.sprintMode}</h2><p>{text.sprintModeBody}</p></div>
          <b>{text.challenge}</b>
        </button>
        <button type="button" className="mode-card mode-cards" onClick={startCards}>
          <span className="mode-icon">↻</span>
          <div><small>{text.cardsDue(dailyQueue.filter((problem) => records[problem.id]?.status === "review").length || dailyQueue.length)}</small><h2>{text.cardsMode}</h2><p>{text.cardsModeBody}</p></div>
          <b>{text.review}</b>
        </button>
        <button type="button" className="mode-card mode-practice" onClick={() => onOpenProblem(dailyQueue[0]?.id ?? problems[0].id)}>
          <span className="mode-icon">{">_"}</span>
          <div><small>{text.practiceDuration}</small><h2>{text.practiceMode}</h2><p>{text.practiceModeBody}</p></div>
          <b>{text.practice}</b>
        </button>
      </div>

      <div className="hub-grid">
        <section className="path-panel">
          <div className="hub-section-head">
            <div><div className="activity-kicker">LEARNING PATH</div><h2>{text.learningPath}</h2></div>
            <span>{text.unitsComplete(topics.filter((item) => item.solved === item.total).length, topics.length)}</span>
          </div>
          <div className="topic-path">
            {topics.map((item, index) => {
              const percent = Math.round((item.solved / item.total) * 100);
              return (
                <button type="button" key={item.topic} className={`topic-node ${percent === 100 ? "is-complete" : ""}`} onClick={() => startLesson(item.nextProblem)}>
                  <span className="topic-order">{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{item.topic}</strong><small>{text.masteredCount(item.solved, item.total)}</small><i><b style={{ width: `${percent}%` }} /></i></div>
                  <em>{percent === 100 ? "✓" : "→"}</em>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="review-panel">
          <div className="hub-section-head">
            <div><div className="activity-kicker">{text.smartReview}</div><h2>{text.recommended}</h2></div>
          </div>
          <p className="review-intro">{text.reviewIntro}</p>
          <div className="review-list">
            {dailyQueue.slice(0, 6).map((problem, index) => {
              const status = records[problem.id]?.status ?? "todo";
              return (
                <button type="button" key={problem.id} onClick={() => startLesson(problem)}>
                  <span>{index + 1}</span>
                  <div><strong>{problem.title}</strong><small>{problem.topic} · {text.status[status]}</small></div>
                  <b>+25 XP</b>
                </button>
              );
            })}
          </div>
          <button className="review-all" type="button" onClick={startCards}>{text.flashcardSet}</button>
        </aside>
      </div>
    </section>
  );
}
