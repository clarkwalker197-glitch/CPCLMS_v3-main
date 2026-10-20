import test from "node:test";
import assert from "node:assert/strict";

const { getPageRange } = await import(new URL("./pagination.ts", import.meta.url).href);

test("shows the first five pages and final page at the beginning", () => {
  assert.deepEqual(getPageRange(41, 1), [1, 2, 3, 4, 5, "end-ellipsis", 41]);
});

test("shows sibling pages with ellipses in the middle", () => {
  assert.deepEqual(getPageRange(41, 20), [
    1,
    "start-ellipsis",
    19,
    20,
    21,
    "end-ellipsis",
    41,
  ]);
});

test("shows the final five pages near the end", () => {
  assert.deepEqual(getPageRange(41, 40), ["start-ellipsis", 37, 38, 39, 40, 41]);
});

test("uses a smaller range in compact mode", () => {
  assert.deepEqual(getPageRange(41, 1, 1, true), [1, 2, "end-ellipsis", 41]);
  assert.deepEqual(getPageRange(41, 20, 1, true), [
    1,
    "start-ellipsis",
    19,
    20,
    21,
    "end-ellipsis",
    41,
  ]);
});

test("shows every page when the total is small", () => {
  assert.deepEqual(getPageRange(5, 3), [1, 2, 3, 4, 5]);
});
