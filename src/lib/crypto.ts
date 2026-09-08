import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Cifra um segredo (ex.: senha do VendPago) com AES-256-GCM.
 * `encryptionKeyBase64` deve decodificar para exatamente 32 bytes.
 * Saída: "<iv>:<authTag>:<ciphertext>", tudo em base64.
 */
export function encrypt(plaintext: string, encryptionKeyBase64: string): string {
  const key = Buffer.from(encryptionKeyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY inválida: esperado 32 bytes em base64");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(payload: string, encryptionKeyBase64: string): string {
  const key = Buffer.from(encryptionKeyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY inválida: esperado 32 bytes em base64");
  }
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Payload cifrado malformado");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Token de dispositivo: 32 bytes aleatórios, codificados em hex para caber numa URL. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Comparação em tempo constante entre dois hashes hex de mesmo comprimento esperado. */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Comparação em tempo constante entre dois segredos em texto puro (ex.: CRON_SECRET). */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const SCRYPT_KEYLEN = 64;

/**
 * Hash da senha de administração com `scrypt` (nativo do Node, sem binário
 * externo) — `argon2` foi descartado por depender de um addon nativo que não
 * tem build disponível no runtime serverless da Vercel (Decision 7 do DESIGN).
 * Formato: "scrypt:<salt hex>:<derivedKey hex>".
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN);
  return "scrypt:" + salt.toString("hex") + ":" + derivedKey.toString("hex");
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, expectedHex] = parts as [string, string, string];
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  const derivedKey = scryptSync(password, salt, expected.length);
  if (derivedKey.length !== expected.length) return false;
  return timingSafeEqual(derivedKey, expected);
}
