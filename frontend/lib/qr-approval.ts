export type ApprovalInputResult = {
  approvalCode?: string;
  token?: string;
  error?: string;
};

export function parseApprovalInput(rawValue: string): ApprovalInputResult {
  const input = rawValue.trim();

  if (!input) {
    return { error: 'No transaction ID was provided.' };
  }

  let approvalCode = '';
  let token = '';

  if (input.includes('://')) {
    try {
      const url = new URL(input);
      approvalCode = (url.searchParams.get('code') || '').trim().toUpperCase();
      token = url.searchParams.get('token') || '';
    } catch {
      return { error: 'Invalid QR code format' };
    }
  } else {
    approvalCode = input.toUpperCase().trim();
  }

  if (!approvalCode) {
    return { error: 'Could not extract transaction ID from QR code' };
  }

  if (!/^BRW-\d{4}-\d{5}$/.test(approvalCode)) {
    return { error: 'Invalid transaction ID format. Expected BRW-XXXX-XXXXX' };
  }

  return { approvalCode, token };
}
