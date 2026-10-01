import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createAdminClient: vi.fn(), from: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
import { POST, PATCH } from '../route';

describe('subscription authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'session-user' } } });
  });

  it('does not activate subscriptions from unverified client input', async () => {
    const response = await POST(); // The retired route deliberately cannot read a paymentId/body.
    expect(response.status).toBe(410);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'subscription_activation_unavailable' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('still requires authentication on the retired route', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST()).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('preserves cancellation of only the authenticated user active subscriptions', async () => {
    const lastEq = vi.fn().mockResolvedValue({ error: null });
    const firstEq = vi.fn().mockReturnValue({ eq: lastEq });
    const update = vi.fn().mockReturnValue({ eq: firstEq });
    const from = vi.fn().mockReturnValue({ update });
    mocks.createAdminClient.mockReturnValue({ from });
    const result = await PATCH(new NextRequest('https://renderhane.com/api/subscriptions', {
      method: 'PATCH', body: JSON.stringify({ action: 'cancel', userId: 'other-user' }),
    }));
    expect(result.status).toBe(200);
    expect(from).toHaveBeenCalledWith('subscriptions');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(firstEq).toHaveBeenCalledWith('user_id', 'session-user');
    expect(lastEq).toHaveBeenCalledWith('status', 'active');
  });
});
