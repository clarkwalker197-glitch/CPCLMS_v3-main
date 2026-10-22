import test from "node:test";
import assert from "node:assert/strict";

const { sanitizeIsbnInput } = await import(new URL("./isbn.ts", import.meta.url).href);

test("keeps ISBN digits and hyphens", () => {
  assert.equal(sanitizeIsbnInput("978-0132350884"), "978-0132350884");
});

test("removes letters, spaces, and punctuation from ISBN input", () => {
  assert.equal(sanitizeIsbnInput("ISBN 978-X013.235/0884"), "978-0132350884");
});
