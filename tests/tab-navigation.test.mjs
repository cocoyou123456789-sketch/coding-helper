import assert from "node:assert/strict";
import test from "node:test";

import { nextTabIndex } from "../app/tab-navigation.ts";

test("arrow keys wrap through a tab list", () => {
  assert.equal(nextTabIndex(0, 3, "ArrowRight"), 1);
  assert.equal(nextTabIndex(2, 3, "ArrowRight"), 0);
  assert.equal(nextTabIndex(0, 3, "ArrowLeft"), 2);
  assert.equal(nextTabIndex(2, 3, "ArrowDown"), 0);
  assert.equal(nextTabIndex(0, 3, "ArrowUp"), 2);
});

test("Home and End jump while unrelated keys leave focus alone", () => {
  assert.equal(nextTabIndex(1, 3, "Home"), 0);
  assert.equal(nextTabIndex(1, 3, "End"), 2);
  assert.equal(nextTabIndex(1, 3, "Tab"), null);
  assert.equal(nextTabIndex(0, 0, "ArrowRight"), null);
});
