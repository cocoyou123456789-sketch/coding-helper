import assert from "node:assert/strict";
import test from "node:test";

import {
  filterProblemsByStatus,
  practiceRecordStatus,
  practiceStatusAfterActivity,
  practiceStatusCounts,
  recommendedPracticeProblemId,
} from "../app/practice-library.ts";

const problems = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

test("missing or damaged practice status safely behaves as not started", () => {
  assert.equal(practiceRecordStatus(undefined), "todo");
  assert.equal(practiceRecordStatus({ status: "unknown" }), "todo");
  for (const status of ["todo", "learning", "review", "solved"]) {
    assert.equal(practiceRecordStatus({ status }), status);
  }
});

test("real work starts a todo problem without downgrading review or mastery", () => {
  assert.equal(practiceStatusAfterActivity("todo", "edit"), "learning");
  assert.equal(practiceStatusAfterActivity("todo", "run"), "learning");
  for (const status of ["learning", "review", "solved"]) {
    assert.equal(practiceStatusAfterActivity(status, "edit"), status);
    assert.equal(practiceStatusAfterActivity(status, "run"), status);
    assert.equal(practiceStatusAfterActivity(status, "reset"), status);
    assert.equal(practiceStatusAfterActivity(status, "open"), status);
  }
  assert.equal(practiceStatusAfterActivity("todo", "reset"), "todo");
});

test("status filters and counts use the same normalized status", () => {
  const records = {
    1: { status: "learning" },
    2: { status: "review" },
    3: { status: "solved" },
  };

  assert.deepEqual(filterProblemsByStatus(problems, records, "all"), problems);
  assert.deepEqual(filterProblemsByStatus(problems, records, "review"), [{ id: 2 }]);
  assert.deepEqual(practiceStatusCounts(problems, records), {
    all: 4,
    todo: 1,
    learning: 1,
    solved: 1,
    review: 1,
  });
  for (const status of ["todo", "learning", "review", "solved"]) {
    assert.equal(filterProblemsByStatus(problems, records, status).length, practiceStatusCounts(problems, records)[status]);
  }
});

test("continue recommendation prefers learning, review, then a new problem", () => {
  assert.equal(recommendedPracticeProblemId(problems, {
    1: { status: "review" },
    2: { status: "learning" },
  }, 1), 2);
  assert.equal(recommendedPracticeProblemId(problems, {
    2: { status: "learning" },
  }, 1), 2);
  assert.equal(recommendedPracticeProblemId(problems, {
    1: { status: "review" },
  }, 1), 1);
  assert.equal(recommendedPracticeProblemId(problems, {
    1: { status: "solved" },
    2: { status: "review" },
  }, 1), 2);
  assert.equal(recommendedPracticeProblemId(problems, {}, 3), 3);
});

test("continue recommendation stays inside the supplied scope and stops when it is mastered", () => {
  assert.equal(recommendedPracticeProblemId([], {}, 1), null);
  assert.equal(recommendedPracticeProblemId([{ id: 3 }, { id: 4 }], {
    1: { status: "learning" },
    3: { status: "solved" },
  }, 1), 4);
  assert.equal(recommendedPracticeProblemId(problems, {
    1: { status: "solved" },
    2: { status: "solved" },
    3: { status: "solved" },
    4: { status: "solved" },
  }, 1), null);
});
