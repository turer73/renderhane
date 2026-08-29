import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PUT } from "../route";

describe("fal proxy cost gate", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
    ["PUT", PUT],
  ] as const)("rejects direct %s access", async (method, handler) => {
    const response = await handler(new NextRequest("https://renderhane.com/api/fal/proxy", { method }));
    expect(response.status).toBe(410);
  });
});
