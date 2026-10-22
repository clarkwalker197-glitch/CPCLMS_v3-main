import test from "node:test";
import assert from "node:assert/strict";
import type { LocalBook } from "./offline-types";

const { searchCachedBooks } = await import(new URL("./offline-api.ts", import.meta.url).href);

const books: LocalBook[] = [
  { id: "1", title: "Foundations of Science", author: "A. Smith" },
  { id: "2", title: "The Final Chapter", author: "A. Smith" },
  { id: "3", title: "History of Fiction", author: "J. Jones" },
];

test("matches cached titles from the beginning, case-insensitively", () => {
  assert.deepEqual(
    searchCachedBooks(books, { search: "f" }).map((book: LocalBook) => book.id),
    ["1"],
  );
});

test("retains partial search matches for author and other searchable fields", () => {
  assert.deepEqual(
    searchCachedBooks(books, { search: "jones" }).map((book: LocalBook) => book.id),
    ["3"],
  );
});
