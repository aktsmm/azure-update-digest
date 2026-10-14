import { describe, expect, it } from "vitest";
import { decryptBytes, deriveKey, encryptBytes, newCryptoInfo } from "../src/lib/pdf-crypto.js";

describe("pdf-crypto", () => {
  const info = { ...newCryptoInfo(), iterations: 1000 };
  const data = new TextEncoder().encode("%PDF-1.7 test payload");

  it("round-trips with the right password", async () => {
    const enc = await encryptBytes(await deriveKey("correct horse battery", info), data);
    expect(enc.length).toBe(12 + data.length + 16);
    const dec = new Uint8Array(await decryptBytes(await deriveKey("correct horse battery", info), enc));
    expect(new TextDecoder().decode(dec)).toBe("%PDF-1.7 test payload");
  });
  it("rejects a wrong password", async () => {
    const enc = await encryptBytes(await deriveKey("right", info), data);
    await expect(decryptBytes(await deriveKey("wrong", info), enc)).rejects.toBeDefined();
  });
  it("uses a fresh IV per file", async () => {
    const k = await deriveKey("pw", info);
    const a = await encryptBytes(k, data);
    const b = await encryptBytes(k, data);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});
