// Soft gate for the "merge PDFs" feature. The per-slide PDFs are public; the password only decides who may use the
// in-browser merge. Only a PBKDF2 verifier is published (never the password). Works in Node 22 and browsers.

export interface PdfGate { v: 1; kdf: "PBKDF2-SHA256"; iterations: number; salt: string; verifier: string }

const ITERATIONS = 600000;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const base = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations, salt: salt as BufferSource }, base, 256);
  return b64(new Uint8Array(bits));
}

export async function makeGate(password: string, iterations = ITERATIONS): Promise<PdfGate> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { v: 1, kdf: "PBKDF2-SHA256", iterations, salt: b64(salt), verifier: await derive(password, salt, iterations) };
}

export async function checkGate(password: string, gate: PdfGate): Promise<boolean> {
  return (await derive(password, unb64(gate.salt), gate.iterations)) === gate.verifier;
}
