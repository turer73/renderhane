import { describe, expect, it } from "vitest";
import {
  isPrivateShareRoute,
  sanitizePrivateShareText,
  scrubSentryEvent,
} from "../sentry-privacy";

describe("Sentry privacy scrubbing", () => {
  it("removes private share query data from absolute and relative URLs", () => {
    expect(
      sanitizePrivateShareText(
        "https://www.renderhane.com/tr/k?n=Turgut&p=%2B90555#contact"
      )
    ).toBe("https://www.renderhane.com/tr/k");
    expect(sanitizePrivateShareText("/en/s/?i=renderhane")).toBe("/en/s/");
    expect(isPrivateShareRoute("/tr/k")).toBe(true);
    expect(isPrivateShareRoute("GET /en/s?i=renderhane")).toBe(true);
    expect(isPrivateShareRoute("/api/contact-card?n=Ada")).toBe(true);
    expect(
      sanitizePrivateShareText(
        "https://www.renderhane.com/api/contact-card?n=Ada&e=ada%40example.com"
      )
    ).toBe("https://www.renderhane.com/api/contact-card");
    expect(sanitizePrivateShareText("/tr/araclar/nfc-yaz?x=1")).toBe(
      "/tr/araclar/nfc-yaz?x=1"
    );
  });

  it("scrubs request, transaction, breadcrumbs, and spans", () => {
    const event = {
      request: {
        url: "https://www.renderhane.com/tr/k?n=Ada&e=ada%40example.com",
        query_string: "n=Ada&e=ada%40example.com",
        headers: {
          Referer: "https://www.renderhane.com/tr/k?n=Ada&e=ada%40example.com",
        },
      },
      transaction: "GET /tr/s?i=renderhane",
      breadcrumbs: [{ data: { from: "/tr/k?n=Ada", to: "/tr/" } }],
      spans: [{ description: "GET https://www.renderhane.com/en/s?i=renderhane" }],
    };
    expect(scrubSentryEvent(event)).toEqual({
      request: {
        url: "https://www.renderhane.com/tr/k",
        headers: { Referer: "https://www.renderhane.com/tr/k" },
      },
      transaction: "GET /tr/s",
      breadcrumbs: [{ data: { from: "/tr/k", to: "/tr/" } }],
      spans: [{ description: "GET https://www.renderhane.com/en/s" }],
    });
  });
});
