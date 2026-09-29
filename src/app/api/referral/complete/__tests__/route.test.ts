import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createAdminClient: vi.fn(), userRpc: vi.fn(), adminRpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.userRpc }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
import { POST } from '../route';

function request(body: unknown) {
  return new NextRequest('https://renderhane.com/api/referral/complete', { method: 'POST', body: JSON.stringify(body) });
}

describe('server-only referral completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'session-user' } } });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.adminRpc });
    mocks.adminRpc.mockResolvedValue({ data: true, error: null });
  });

  it('uses verified session identity with the server-only RPC', async () => {
    const result = await POST(request({ referralCode: 'ABCDEF12', userId: 'victim', p_referee_id: 'victim' }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ completed: true });
    expect(mocks.adminRpc).toHaveBeenCalledWith('complete_referral', { p_referral_code: 'ABCDEF12', p_referee_id: 'session-user' });
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers before creating a privileged client', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request({ referralCode: 'ABCDEF12' }))).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([{}, { referralCode: 'invalid' }, { referralCode: 123 }])('rejects invalid input %j before privileged execution', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
