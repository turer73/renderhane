import { describe, expect, it } from "vitest";

import { getAcceptedProviderRequestId } from "../provider-webhook";

describe("getAcceptedProviderRequestId", () => {
  it("reads accepted IDs from objects and functions", () => {
    const functionError = Object.assign(() => undefined, {
      requestId: "fal-function-request",
    });

    expect(getAcceptedProviderRequestId({ requestId: "fal-object-request" }))
      .toBe("fal-object-request");
    expect(getAcceptedProviderRequestId(functionError))
      .toBe("fal-function-request");
  });

  it("returns null for missing, invalid, or unreadable IDs", () => {
    const throwingGetter = Object.defineProperty({}, "requestId", {
      get() {
        throw new Error("request ID is unreadable");
      },
    });

    expect(getAcceptedProviderRequestId(throwingGetter)).toBeNull();
    expect(getAcceptedProviderRequestId({ requestId: "" })).toBeNull();
    expect(getAcceptedProviderRequestId("fal-primitive-request")).toBeNull();
    expect(getAcceptedProviderRequestId(null)).toBeNull();
  });
});
