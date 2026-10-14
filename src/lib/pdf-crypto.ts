// AES-256-GCM with a PBKDF2-SHA256 key. Works in Node 22 and in browsers (WebCrypto only).
// File layout: iv (12 bytes) | ciphertext | GCM tag (16 bytes). The KDF salt is shared and published in data/slides.json.

export const KDF = { name: "PBKDF2-SHA256", iterations: 600000, saltBytes: 16 } as const;
const IV_BYTES = 12;

export interface PdfCryptoInfo { v: 1; kdf: string; iterations: number; salt: string }

const subtle = () => globalThis.crypto.subtle;
const b64 = {
  enc: (u: Uint8Array) => btoa(String.fromCharCode(...u)),
  dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

export function newCryptoInfo(): PdfCryptoInfo {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(KDF.saltBytes));
  return { v: 1, kdf: KDF.name, iterations: KDF.iterations, salt: b64.enc(salt) };
}

export async function deriveKey(password: string, info: PdfCryptoInfo): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: info.iterations, salt: b64.dec(info.salt) as BufferSource },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, data as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function decryptBytes(key: CryptoKey, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  const u = data instanceof Uint8Array ? data : new Uint8Array(data);
  return subtle().decrypt({ name: "AES-GCM", iv: u.slice(0, IV_BYTES) }, key, u.slice(IV_BYTES));
}
