"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { problemDetails } from "./problem-details";
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

function makeQuestion(problem: Problem, round: number, allProblems: Problem[]): QuizQuestion {
  if (round % 3 === 0) {
    const topics = Array.from(new Set(allProblems.map((item) => item.topic)));
    return {
      eyebrow: "识别模式",
      prompt: `「${problem.title}」主要属于哪一种题型？`,
      options: optionsFor(problem.topic, topics, problem.id + round),
      answer: problem.topic,
      explanation: `这道题归在「${problem.topic}」。先认出题型，才能快速找到常用工具。`,
    };
  }

  if (round % 3 === 1) {
    const methods = allProblems
      .filter((item) => item.id !== problem.id && item.topic !== problem.topic)
      .map((item) => item.method);
    return {
      eyebrow: "选择思路",
      prompt: `解决「${problem.title}」时，哪一步最关键？`,
      options: optionsFor(problem.method, methods, problem.id + round),
      answer: problem.method,
      explanation: problem.hint,
    };
  }

  const complexities = Array.from(new Set(allProblems.map((item) => item.complexity)));
  return {
    eyebrow: "复杂度判断",
    prompt: `「${problem.title}」的推荐复杂度是哪一个？`,
    options: optionsFor(problem.complexity, complexities, problem.id + round),
    answer: problem.complexity,
    explanation: `这道题的目标是 ${problem.complexity}。先写对，再逐步优化到这个量级。`,
  };
}

export default function LearningHub({
  problems,
  records,
  profile,
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

  const dailyQueue = useMemo(() => {
    return [...problems]
      .sort((first, second) => {
        const firstStatus = records[first.id]?.status ?? "todo";
        const secondStatus = records[second.id]?.status ?? "todo";
        return statusOrder[firstStatus] - statusOrder[secondStatus];
      })
      .slice(0, 10);
  }, [problems, records]);

  const topics = useMemo(() => {
    return Array.from(new Set(problems.map((problem) => problem.topic))).map((topic) => {
      const topicProblems = problems.filter((problem) => problem.topic === topic);
      const solved = topicProblems.filter((problem) => records[problem.id]?.status === "solved").length;
      const nextProblem = topicProblems.find((problem) => records[problem.id]?.status !== "solved") ?? topicProblems[0];
      return { topic, total: topicProblems.length, solved, nextProblem };
    });
  }, [problems, records]);

  const lessonProblem = problems.find((problem) => problem.id === lessonProblemId) ?? dailyQueue[0] ?? problems[0];
  const lessonDetail = problemDetails[lessonProblem.id];
  const lessonQuestions = useMemo(
    () => [0, 1, 2].map((round) => makeQuestion(lessonProblem, round, problems)),
    [lessonProblem, problems],
  );
  const activeLessonQuestion = lessonStep > 0 && lessonStep <= 3 ? lessonQuestions[lessonStep - 1] : null;

  const flashcards = dailyQueue.length ? dailyQueue : problems.slice(0, 10);
  const activeCard = flashcards[cardIndex] ?? flashcards[0];
  const activeCardDetail = activeCard ? problemDetails[activeCard.id] : undefined;

  const sprintProblems = dailyQueue.length ? dailyQueue : problems.slice(0, 10);
  const sprintProblem = sprintProblems[sprintIndex % sprintProblems.length];
  const sprintQuestion = useMemo(
    () => makeQuestion(sprintProblem, sprintIndex, problems),
    [sprintProblem, sprintIndex, problems],
  );

  useEffect(() => {
    if (activity !== "sprint" || sprintTime <= 0) return;
    const timer = window.setInterval(() => setSprintTime((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [activity, sprintTime]);

  useEffect(() => {
    if (activity === "sprint" && sprintTime === 0) onSprintBest(sprintScore);
  }, [activity, sprintScore, sprintTime, onSprintBest]);

  function startLesson(problem = dailyQueue[0] ?? problems[0]) {
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
      <section className="activity-screen" aria-label="今日小课">
        <div className="activity-topbar">
          <button type="button" onClick={() => setActivity("home")} aria-label="退出今日小课">×</button>
          <div className="lesson-progress"><span style={{ width: `${Math.min(100, (lessonStep / 4) * 100)}%` }} /></div>
          <div className="heart-count" aria-label={`还剩 ${hearts} 颗心`}>♥ {hearts}</div>
        </div>

        <div className="lesson-stage">
          {lessonStep === 0 && (
            <article className="concept-card">
              <div className="activity-kicker">第 1 步 · 先读懂，不写代码</div>
              <span className="topic-chip">{lessonProblem.topic}</span>
              <h1>{lessonProblem.id}. {lessonProblem.title}</h1>
              <p>{lessonDetail?.statement ?? lessonProblem.summary}</p>
              <div className="concept-example"><span>看一个例子</span><code>{lessonProblem.example}</code></div>
              <ul>
                {(lessonDetail?.requirements ?? ["先说清输入和输出。", "再考虑边界情况。"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
              <button className="learn-primary" type="button" onClick={finishConceptCard}>我看懂题目了 <b>+3 XP</b></button>
            </article>
          )}

          {activeLessonQuestion && (
            <article className="quiz-card">
              <div className="activity-kicker">第 {lessonStep + 1} 步 · {activeLessonQuestion.eyebrow}</div>
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
                  <strong>{selectedAnswer === activeLessonQuestion.answer ? "答对了！+5 XP" : "先记下来，下次会再复习"}</strong>
                  <p>{activeLessonQuestion.explanation}</p>
                  <button type="button" onClick={lessonStep === 3 ? finishLesson : advanceLesson}>
                    {lessonStep === 3 ? "完成小课" : "下一题"}
                  </button>
                </div>
              )}
            </article>
          )}

          {isComplete && (
            <article className="lesson-complete">
              <div className="completion-burst" aria-hidden="true">+25</div>
              <div className="activity-kicker">今日小课完成</div>
              <h1>你已经会认这道题了</h1>
              <p>现在再进入完整代码题，会比一上来死磕轻松很多。</p>
              <div className="completion-stats">
                <div><strong>最高 25 XP</strong><span>本节经验</span></div>
                <div><strong>{hearts}/3</strong><span>剩余心心</span></div>
                <div><strong>{lessonProblem.topic}</strong><span>学习题型</span></div>
              </div>
              <button className="learn-primary" type="button" onClick={() => onOpenProblem(lessonProblem.id)}>进入代码挑战</button>
              <button className="learn-secondary" type="button" onClick={() => setActivity("home")}>先回学习路径</button>
            </article>
          )}
        </div>
      </section>
    );
  }

  if (activity === "cards") {
    const cardsFinished = cardIndex >= flashcards.length;
    return (
      <section className="activity-screen flashcard-screen" aria-label="闪卡复习">
        <div className="activity-topbar">
          <button type="button" onClick={() => setActivity("home")} aria-label="退出闪卡复习">×</button>
          <div className="lesson-progress"><span style={{ width: `${Math.min(100, (cardIndex / flashcards.length) * 100)}%` }} /></div>
          <div className="card-count">{Math.min(cardIndex + 1, flashcards.length)} / {flashcards.length}</div>
        </div>
        <div className="lesson-stage">
          {!cardsFinished && activeCard ? (
            <article className={`study-flashcard ${cardRevealed ? "is-revealed" : ""}`}>
              <div className="activity-kicker">{cardRevealed ? "答案面" : "题目面"}</div>
              <span className="topic-chip">{activeCard.topic}</span>
              <h1>{activeCard.title}</h1>
              {!cardRevealed ? (
                <>
                  <p>{activeCardDetail?.statement ?? activeCard.summary}</p>
                  <button className="learn-primary" type="button" onClick={() => setCardRevealed(true)}>翻到答案</button>
                </>
              ) : (
                <>
                  <div className="flashcard-answer"><span>核心思路</span><p>{activeCard.method}</p></div>
                  <div className="flashcard-answer"><span>识别信号</span><p>{activeCard.hint}</p></div>
                  <div className="flashcard-answer"><span>复杂度</span><p>{activeCard.complexity}</p></div>
                  <div className="flashcard-actions">
                    <button type="button" onClick={() => rateCard(false)}>还没记住 <b>+1 XP</b></button>
                    <button type="button" onClick={() => rateCard(true)}>记住了 <b>+4 XP</b></button>
                  </div>
                </>
              )}
            </article>
          ) : (
            <article className="lesson-complete">
              <div className="completion-burst" aria-hidden="true">✓</div>
              <h1>这组闪卡复习完了</h1>
              <p>没记住的题已经放回复习队列，之后会再次出现。</p>
              <button className="learn-primary" type="button" onClick={() => setActivity("home")}>回到学习路径</button>
            </article>
          )}
        </div>
      </section>
    );
  }

  if (activity === "sprint") {
    const sprintFinished = sprintTime <= 0;
    return (
      <section className="activity-screen sprint-screen" aria-label="六十秒极速挑战">
        <div className="activity-topbar sprint-topbar">
          <button type="button" onClick={() => setActivity("home")} aria-label="退出极速挑战">×</button>
          <div className="sprint-score"><span>得分</span><strong>{sprintScore}</strong></div>
          <div className="sprint-timer" aria-live="polite">{sprintTime}s</div>
        </div>
        <div className="lesson-stage">
          {!sprintFinished ? (
            <article className="sprint-card">
              <div className="activity-kicker">⚡ 连对 {sprintCombo} 题</div>
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
              <div className="activity-kicker">时间到</div>
              <h1>{sprintScore} 分</h1>
              <p>本局完成 {sprintIndex} 题，历史最高 {Math.max(profile.sprintBest, sprintScore)} 分。</p>
              <button className="learn-primary" type="button" onClick={startSprint}>再来 60 秒</button>
              <button className="learn-secondary" type="button" onClick={() => setActivity("home")}>回到学习路径</button>
            </article>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="learning-hub" aria-label="游戏化学习路径">
      <div className="learn-hero">
        <div className="learn-hero-copy">
          <div className="activity-kicker">YOUR DAILY QUEST</div>
          <h1>今天学一点，<br />不用死磕一道题。</h1>
          <p>先认题型，再做快问快答和闪卡，最后才进入完整代码。每次 10–15 分钟。</p>
          <div className="hero-actions">
            <button className="learn-primary" type="button" onClick={() => startLesson()}>开始今日小课</button>
            <button className="learn-secondary" type="button" onClick={startSprint}>60 秒极速挑战</button>
          </div>
        </div>
        <div className="daily-goal-card">
          <div className="goal-ring" style={{ "--goal-progress": `${todayProgress * 3.6}deg` } as CSSProperties}>
            <div><strong>{profile.todayXp}</strong><span>/ {DAILY_GOAL} XP</span></div>
          </div>
          <h2>{todayProgress >= 100 ? "今日目标完成！" : "今日学习目标"}</h2>
          <p>{todayProgress >= 100 ? "保持这个节奏，明天继续。" : `还差 ${Math.max(0, DAILY_GOAL - profile.todayXp)} XP，约一节小课。`}</p>
          <div className="profile-stats">
            <div><strong>🔥 {profile.streak}</strong><span>连续天数</span></div>
            <div><strong>✦ {profile.xp}</strong><span>总经验值</span></div>
            <div><strong>{profile.lessons}</strong><span>完成小课</span></div>
          </div>
        </div>
      </div>

      <div className="learning-modes">
        <button type="button" className="mode-card mode-lesson" onClick={() => startLesson()}>
          <span className="mode-icon">01</span>
          <div><small>10–15 分钟</small><h2>闯关小课</h2><p>题意卡 → 识别题型 → 选择思路 → 判断复杂度</p></div>
          <b>开始 →</b>
        </button>
        <button type="button" className="mode-card mode-sprint" onClick={startSprint}>
          <span className="mode-icon">⚡</span>
          <div><small>60 秒</small><h2>极速抢答</h2><p>随机混合题型，连对越多得分越高。</p></div>
          <b>挑战 →</b>
        </button>
        <button type="button" className="mode-card mode-cards" onClick={startCards}>
          <span className="mode-icon">↻</span>
          <div><small>{dailyQueue.filter((problem) => records[problem.id]?.status === "review").length || dailyQueue.length} 张待复习</small><h2>算法闪卡</h2><p>快速回忆题型、核心思路和复杂度。</p></div>
          <b>复习 →</b>
        </button>
      </div>

      <div className="hub-grid">
        <section className="path-panel">
          <div className="hub-section-head">
            <div><div className="activity-kicker">LEARNING PATH</div><h2>按题型闯关</h2></div>
            <span>{topics.filter((item) => item.solved === item.total).length} / {topics.length} 单元完成</span>
          </div>
          <div className="topic-path">
            {topics.map((item, index) => {
              const percent = Math.round((item.solved / item.total) * 100);
              return (
                <button type="button" key={item.topic} className={`topic-node ${percent === 100 ? "is-complete" : ""}`} onClick={() => startLesson(item.nextProblem)}>
                  <span className="topic-order">{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{item.topic}</strong><small>{item.solved} / {item.total} 道掌握</small><i><b style={{ width: `${percent}%` }} /></i></div>
                  <em>{percent === 100 ? "✓" : "→"}</em>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="review-panel">
          <div className="hub-section-head">
            <div><div className="activity-kicker">SMART REVIEW</div><h2>今天推荐</h2></div>
          </div>
          <p className="review-intro">优先安排“待复习”和“学习中”的题，不必按题号硬刷。</p>
          <div className="review-list">
            {dailyQueue.slice(0, 6).map((problem, index) => {
              const status = records[problem.id]?.status ?? "todo";
              return (
                <button type="button" key={problem.id} onClick={() => startLesson(problem)}>
                  <span>{index + 1}</span>
                  <div><strong>{problem.title}</strong><small>{problem.topic} · {status === "review" ? "需要复习" : status === "learning" ? "学习中" : status === "solved" ? "已掌握" : "新题"}</small></div>
                  <b>+25 XP</b>
                </button>
              );
            })}
          </div>
          <button className="review-all" type="button" onClick={startCards}>开始一组闪卡复习</button>
        </aside>
      </div>
    </section>
  );
}
