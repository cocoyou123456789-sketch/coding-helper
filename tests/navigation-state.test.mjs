import assert from "node:assert/strict";
import test from "node:test";

import {
  navigationHref,
  parseNavigationState,
} from "../app/navigation-state.ts";

const knownProblemIds = new Set([1, 21, 283, 2824]);

test("navigation search accepts supported modes and only known workspace problems", () => {
  assert.deepEqual(
    parseNavigationState("?mode=workspace&problem=283", knownProblemIds),
    { mode: "workspace", problemId: 283 },
  );
  assert.deepEqual(
    parseNavigationState("?mode=workspace&problem=2824", knownProblemIds),
    { mode: "workspace", problemId: 2824 },
  );
  assert.deepEqual(
    parseNavigationState("?mode=workspace&problem=999", knownProblemIds),
    { mode: "workspace" },
  );
  assert.deepEqual(
    parseNavigationState("?mode=workspace&problem=1.0", knownProblemIds),
    { mode: "workspace" },
  );
  assert.deepEqual(
    parseNavigationState("?mode=course&problem=21", knownProblemIds),
    { mode: "course" },
  );
  assert.deepEqual(parseNavigationState("?mode=path", knownProblemIds), { mode: "path" });
});

test("missing or invalid modes safely return to the learning path", () => {
  assert.deepEqual(parseNavigationState("", knownProblemIds), { mode: "path" });
  assert.deepEqual(
    parseNavigationState("?mode=unknown&problem=1", knownProblemIds),
    { mode: "path" },
  );
});

test("path and course links remove stale problem state but preserve unrelated URL data", () => {
  const current = "https://example.test/coding-helper/?source=pwa&mode=workspace&problem=283#today";

  assert.equal(
    navigationHref(current, { mode: "path" }),
    "/coding-helper/?source=pwa#today",
  );
  assert.equal(
    navigationHref(current, { mode: "course" }),
    "/coding-helper/?source=pwa&mode=course#today",
  );
});

test("workspace links write a valid problem and remain relative to a GitHub Pages subpath", () => {
  assert.equal(
    navigationHref("/coding-helper/?source=pwa&problem=1#editor", {
      mode: "workspace",
      problemId: 283,
    }),
    "/coding-helper/?source=pwa&problem=283&mode=workspace#editor",
  );
  assert.equal(
    navigationHref("/coding-helper/?source=pwa&problem=283", {
      mode: "workspace",
      problemId: Number.NaN,
    }),
    "/coding-helper/?source=pwa&mode=workspace",
  );
});

test("generating the same navigation state repeatedly is stable", () => {
  const first = navigationHref("/coding-helper/?source=pwa#notes", {
    mode: "workspace",
    problemId: 21,
  });
  const second = navigationHref(first, { mode: "workspace", problemId: 21 });

  assert.equal(second, first);
});

test("Capacitor navigation stays on the local app origin and path", () => {
  assert.equal(
    navigationHref("capacitor://localhost/index.html?source=ios#app", {
      mode: "workspace",
      problemId: 21,
    }),
    "/index.html?source=ios&mode=workspace&problem=21#app",
  );
});
