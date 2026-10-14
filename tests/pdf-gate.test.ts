import { describe, expect, it } from "vitest";
import { checkGate, makeGate } from "../src/lib/pdf-gate.js";

describe("pdf-gate", () => {
  it("accepts the right password and rejects others", async () => {
    const gate = await makeGate("Sukiazu", 1000);
    expect(await checkGate("Sukiazu", gate)).toBe(true);
    expect(await checkGate("sukiazu", gate)).toBe(false);
    expect(await checkGate("", gate)).toBe(false);
  });
  it("never contains the password", async () => {
    expect(JSON.stringify(await makeGate("Sukiazu", 1000))).not.toContain("Sukiazu");
  });
});
