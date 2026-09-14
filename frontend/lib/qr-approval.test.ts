import test from "node:test";
import assert from "node:assert/strict";

import { parseApprovalInput } from "./qr-approval";

test("accepts a raw transaction ID", () => {
  assert.deepEqual(parseApprovalInput("BRW-1354-34845"), {
    approvalCode: "BRW-1354-34845",
    token: "",
  });
});

test("accepts a QR deep-link input with code and token", () => {
  assert.deepEqual(
    parseApprovalInput(
      "https://example.com/scan-approve?request=req_123&token=my-token&code=BRW-1354-34845"
    ),
    {
      approvalCode: "BRW-1354-34845",
      token: "my-token",
    }
  );
});

test("rejects malformed transaction IDs", () => {
  assert.equal(
    parseApprovalInput("INVALID-ID").error,
    "Invalid transaction ID format. Expected BRW-XXXX-XXXXX"
  );
});
