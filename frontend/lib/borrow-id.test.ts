import test from "node:test";
import assert from "node:assert/strict";

import { formatBorrowId, normalizeBorrowId } from "./borrow-id";

test("normalizes raw and formatted Borrow IDs", () => {
  assert.equal(normalizeBorrowId("12345678"), "12345678");
  assert.equal(normalizeBorrowId("BRW-1234-5678"), "12345678");
  assert.equal(formatBorrowId("12345678"), "BRW-1234-5678");
});

test("extracts a Borrow ID from a scanned transaction URL", () => {
  assert.equal(
    normalizeBorrowId("https://library.example/transactions/lookup?transactionId=12345678"),
    "12345678"
  );
});

test("extracts the formatted Borrow ID from the camera deep link", () => {
  assert.equal(
    normalizeBorrowId("https://library.example/scan-approve?borrowId=BRW-1234-5678"),
    "12345678"
  );
});

test("rejects malformed Borrow IDs", () => {
  assert.equal(normalizeBorrowId("BRW-123-5678"), null);
  assert.equal(normalizeBorrowId("1234567"), null);
});