import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeShopDomain } from "../client";

describe("normalizeShopDomain", () => {
  it.each([
    ["renderhane.myshopify.com", "renderhane.myshopify.com"],
    ["https://Renderhane.myshopify.com/", "renderhane.myshopify.com"],
    ["shop-123.myshopify.com", "shop-123.myshopify.com"],
  ])("accepts a canonical Shopify domain", (input, expected) => {
    expect(normalizeShopDomain(input)).toBe(expected);
  });

  it.each([
    "http://renderhane.myshopify.com",
    "renderhane.example.com",
    "myshopify.com",
    "renderhane.myshopify.com.evil.test",
    "renderhane.myshopify.com/admin",
    "user@renderhane.myshopify.com",
    "renderhane.myshopify.com:8443",
  ])("rejects an unsafe Shopify domain: %s", (input) => {
    expect(() => normalizeShopDomain(input)).toThrow();
  });
});
