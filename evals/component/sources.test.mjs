// evals/component/sources.test.mjs — trackedBoardsToSources mapping.

import test from "node:test";
import assert from "node:assert/strict";
import { trackedBoardsToSources } from "../../.claude/workflows/lib/intake-core.mjs";

test("trackedBoardsToSources: passes through a well-formed board unchanged plus configError: null", () => {
  const [s] = trackedBoardsToSources(
    [{ name: "Board A", filteredSearch: "https://board.example/search?x=1", depth: 10 }],
    25
  );
  assert.deepEqual(s, {
    name: "Board A",
    filteredSearch: "https://board.example/search?x=1",
    depth: 10,
    configError: null,
  });
});

test("trackedBoardsToSources: falls back to defaultDepth on a non-positive-integer depth", () => {
  const [bad, missing] = trackedBoardsToSources(
    [
      { name: "Board A", filteredSearch: "https://board.example/search", depth: 0 },
      { name: "Board B", filteredSearch: "https://board.example/search" },
    ],
    25
  );
  assert.equal(bad.depth, 25);
  assert.match(bad.configError, /not a positive integer/);
  assert.equal(missing.depth, 25);
});

test("trackedBoardsToSources: empty filteredSearch is a config error, not a depth fallback", () => {
  const [s] = trackedBoardsToSources(
    [{ name: "Board A", filteredSearch: "   ", depth: 10 }],
    25
  );
  assert.equal(s.configError, "filteredSearch is empty");
});

test("trackedBoardsToSources: an unnamed board defaults its display name", () => {
  const [s] = trackedBoardsToSources(
    [{ filteredSearch: "https://board.example/search", depth: 10 }],
    25
  );
  assert.equal(s.name, "(unnamed source)");
});

test("trackedBoardsToSources: absent trackedBoards yields an empty list", () => {
  assert.deepEqual(trackedBoardsToSources(undefined, 25), []);
});
