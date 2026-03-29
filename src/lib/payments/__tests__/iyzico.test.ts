import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env vars before importing
vi.stubEnv('IYZICO_API_KEY', 'test-api-key');
vi.stubEnv('IYZICO_SECRET_KEY', 'test-secret-key');
vi.stubEnv('IYZICO_BASE_URL', 'https://sandbox-api.iyzipay.com');

import {
  PACKAGES, isValidPackageKey, signBasketId, verifyBasketId,
} from '../iyzico';

describe('PACKAGES', () => {
  it('has starter, standard, pro', () => {
    expect(PACKAGES.starter).toEqual({ credits: 100, price: 199, name: 'Starter' });
    expect(PACKAGES.standard).toEqual({ credits: 300, price: 499, name: 'Standard' });
    expect(PACKAGES.pro).toEqual({ credits: 800, price: 999, name: 'Professional' });
  });
});

describe('isValidPackageKey', () => {
  it('returns true for valid keys', () => {
    expect(isValidPackageKey('starter')).toBe(true);
    expect(isValidPackageKey('standard')).toBe(true);
    expect(isValidPackageKey('pro')).toBe(true);
  });

  it('returns false for invalid keys', () => {
    expect(isValidPackageKey('enterprise')).toBe(false);
    expect(isValidPackageKey('')).toBe(false);
    expect(isValidPackageKey('STARTER')).toBe(false);
  });
});

describe('signBasketId + verifyBasketId', () => {
  it('signs and verifies a basket id', () => {
    const signed = signBasketId('user-123', 'standard', 'tr');
    const result = verifyBasketId(signed);
    expect(result).toEqual({
      userId: 'user-123',
      packageKey: 'standard',
      locale: 'tr',
    });
  });

  it('returns null for tampered signature', () => {
    const signed = signBasketId('user-123', 'standard', 'tr');
    const tampered = signed.slice(0, -4) + 'xxxx';
    expect(verifyBasketId(tampered)).toBeNull();
  });

  it('returns null for tampered userId', () => {
    const signed = signBasketId('user-123', 'standard', 'tr');
    const parts = signed.split(':');
    parts[0] = 'hacker';
    expect(verifyBasketId(parts.join(':'))).toBeNull();
  });

  it('returns null for wrong format', () => {
    expect(verifyBasketId('')).toBeNull();
    expect(verifyBasketId('only:two:parts')).toBeNull();
    expect(verifyBasketId('a:b:c:d:e')).toBeNull();
  });

  it('returns null for empty parts', () => {
    expect(verifyBasketId(':::')).toBeNull();
  });

  it('handles different locales', () => {
    const signed = signBasketId('user-1', 'pro', 'en');
    const result = verifyBasketId(signed);
    expect(result!.locale).toBe('en');
  });
});
