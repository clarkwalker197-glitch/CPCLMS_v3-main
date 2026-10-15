export type ApprovalInputResult = {
  approvalCode?: string;
  token?: string;
  requestId?: string;
  error?: string;
};

export function parseApprovalInput(rawValue: string): ApprovalInputResult {
  const input = rawValue.trim();

  if (!input) {
    return { error: 'No transaction ID was provided.' };
  }

  let approvalCode = '';
  let token = '';
  let requestId = '';

  if (input.includes('://')) {
    try {
      const url = new URL(input);
      approvalCode = (url.searchParams.get('code') || '').trim().toUpperCase();
      token = url.searchParams.get('token') || '';
      requestId = url.searchParams.get('request') || '';
    } catch {
      return { error: 'Invalid QR code format' };
    }
  } else {
    approvalCode = input.toUpperCase().trim();
  }

  if (!approvalCode) {
    return { error: 'Could not extract transaction ID from QR code' };
  }

  if (!/^(?:\d{8}|BRW-\d{4}-\d{4})$/.test(approvalCode)) {
    return { error: 'Invalid transaction ID format. Expected BRW-XXXX-XXXX' };
  }

  return { approvalCode, token, requestId };
}
