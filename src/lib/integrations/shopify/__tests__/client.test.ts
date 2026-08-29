import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeShopDomain, ShopifyClient } from "../client";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("decodes Link header cursors before URLSearchParams re-encodes them", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ products: [] }),
        {
          status: 200,
          headers: {
            Link: '<https://shop.myshopify.com/admin/api/2024-01/products.json?page_info=cursor%3D%3D&limit=50>; rel="next"',
          },
        }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ products: [] }),
        { status: 200 }
      ));
    vi.stubGlobal("fetch", fetchMock);

    const client = new ShopifyClient("shop.myshopify.com", "token");
    const firstPage = await client.getProducts();
    expect(firstPage.nextPageInfo).toBe("cursor==");

    await client.getProducts(50, firstPage.nextPageInfo!);
    const secondUrl = fetchMock.mock.calls[1][0] as URL;
    expect(secondUrl.searchParams.get("page_info")).toBe("cursor==");
    expect(secondUrl.toString()).toContain("page_info=cursor%3D%3D");
    expect(secondUrl.toString()).not.toContain("%253D");
  });
});
