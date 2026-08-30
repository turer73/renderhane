import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reserveCredits,
  reserveCreditBundle,
  confirmSpend,
  refundCredits,
  addCredits,
  CreditError,
} from '../engine';

// Mock Supabase admin client
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  mockRpc.mockReset();
});

describe('reserveCredits', () => {
  it('returns transaction id on success', async () => {
    mockRpc.mockResolvedValue({ data: 'tx-123', error: null });
    const txId = await reserveCredits('user-1', 10, 'test job');
    expect(txId).toBe('tx-123');
    expect(mockRpc).toHaveBeenCalledWith('reserve_credits', {
      p_user_id: 'user-1', p_amount: 10, p_description: 'test job',
    });
  });

  it('throws INSUFFICIENT on insufficient credits', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'insufficient_credits' } });
    await expect(reserveCredits('user-1', 100, 'test')).rejects.toThrow(CreditError);
    await expect(reserveCredits('user-1', 100, 'test')).rejects.toThrow('Insufficient credits');
  });

  it('throws NOT_FOUND on user not found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found' } });
    await expect(reserveCredits('bad-user', 10, 'test')).rejects.toThrow('User not found');
  });

  it('throws on invalid amount (zero)', async () => {
    await expect(reserveCredits('user-1', 0, 'test')).rejects.toThrow('positive integer');
  });

  it('throws on invalid amount (negative)', async () => {
    await expect(reserveCredits('user-1', -5, 'test')).rejects.toThrow('positive integer');
  });

  it('throws on invalid amount (float)', async () => {
    await expect(reserveCredits('user-1', 1.5, 'test')).rejects.toThrow('positive integer');
  });

  it('throws generic error for unknown errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'database_timeout' } });
    await expect(reserveCredits('user-1', 10, 'test')).rejects.toThrow('Failed to reserve credits');
  });
});

describe('reserveCreditBundle', () => {
  const items = [
    { amount: 8, description: 'social-kit scene 1' },
    { amount: 35, description: 'social-kit video' },
  ];

  it('reserves every item in one RPC call', async () => {
    mockRpc.mockResolvedValue({ data: ['tx-scene', 'tx-video'], error: null });

    await expect(reserveCreditBundle('user-1', items)).resolves.toEqual([
      'tx-scene',
      'tx-video',
    ]);
    expect(mockRpc).toHaveBeenCalledWith('reserve_credit_bundle', {
      p_user_id: 'user-1',
      p_amounts: [8, 35],
      p_descriptions: ['social-kit scene 1', 'social-kit video'],
    });
  });

  it('maps insufficient balance to CreditError', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'insufficient_credits' } });
    await expect(reserveCreditBundle('user-1', items)).rejects.toMatchObject({
      name: 'CreditError',
      code: 'INSUFFICIENT',
    });
  });

  it('rejects invalid bundles before calling the database', async () => {
    await expect(reserveCreditBundle('user-1', [])).rejects.toThrow('at least one item');
    await expect(
      reserveCreditBundle('user-1', [{ amount: 0, description: 'bad' }])
    ).rejects.toThrow('positive integer');
    await expect(
      reserveCreditBundle('user-1', [{ amount: 1, description: ' ' }])
    ).rejects.toThrow('description is required');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an incomplete transaction list', async () => {
    mockRpc.mockResolvedValue({ data: ['tx-only'], error: null });
    await expect(reserveCreditBundle('user-1', items)).rejects.toThrow(
      'invalid transaction list'
    );
  });
});

describe('confirmSpend', () => {
  it('succeeds on valid transaction', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(confirmSpend('tx-1', 'job-1')).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('confirm_spend', {
      p_tx_id: 'tx-1', p_job_id: 'job-1',
    });
  });

  it('throws ALREADY_PROCESSED when data is false', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(confirmSpend('tx-1', 'job-1')).rejects.toThrow('already processed');
  });

  it('throws on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(confirmSpend('tx-1', 'job-1')).rejects.toThrow('Failed to confirm spend');
  });
});

describe('refundCredits', () => {
  it('succeeds on valid transaction', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(refundCredits('tx-1')).resolves.toBeUndefined();
  });

  it('throws on rpc error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(refundCredits('tx-1')).rejects.toThrow('Failed to refund credits');
  });
});

describe('addCredits', () => {
  it('returns transaction id on success', async () => {
    mockRpc.mockResolvedValue({ data: 'tx-456', error: null });
    const txId = await addCredits('user-1', 50, 'pay-123', 'Standard paket');
    expect(txId).toBe('tx-456');
  });

  it('throws NOT_FOUND on user not found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found' } });
    await expect(addCredits('bad-user', 50, 'pay-1', 'test')).rejects.toThrow('User not found');
  });

  it('throws on invalid amount', async () => {
    await expect(addCredits('user-1', 0, 'pay-1', 'test')).rejects.toThrow('positive integer');
    await expect(addCredits('user-1', -1, 'pay-1', 'test')).rejects.toThrow('positive integer');
    await expect(addCredits('user-1', Infinity, 'pay-1', 'test')).rejects.toThrow('positive integer');
  });
});
