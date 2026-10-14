import { describe, expect, it } from "vitest";
import { orderSlides } from "../src/lib/slide-order.js";

describe("orderSlides", () => {
  it("orders by kind, then newest first, then key", () => {
    const xs = [
      { key: "2", kind: "ga" as const, publishedJst: "2026-10-01" },
      { key: "1", kind: "preview" as const, publishedJst: "2026-09-01" },
      { key: "4", kind: "ga" as const, publishedJst: "2026-10-09" },
      { key: "3", kind: "ga" as const, publishedJst: "2026-10-09" },
      { key: "5", kind: "retirement" as const, publishedJst: "2026-10-12" },
    ];
    expect(orderSlides(xs).map((x) => x.key)).toEqual(["1", "3", "4", "2", "5"]);
  });
});
