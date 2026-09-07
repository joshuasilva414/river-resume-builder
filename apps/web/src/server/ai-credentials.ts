import { type AiConnectionBinding, ApplicationError, canonicalJson } from "@river/domain";

const encoder = new TextEncoder();
const unavailable = () =>
  new ApplicationError({
    code: "Unavailable",
    message:
      "AI key storage is unavailable. Contact the service administrator or continue manually.",
  });
async function encryptionKey(secret: string | undefined) {
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) throw unavailable();
  const bytes = Uint8Array.from(secret.match(/../g) ?? [], (part) => Number.parseInt(part, 16));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function associatedData(ownerId: string, connection: AiConnectionBinding) {
  // Stored rows contain additional fields; authenticate only the stable connection identity.
  const { id, provider, revision } = connection;
  return encoder.encode(canonicalJson({ ownerId, id, provider, revision, format: 1 }));
}
/** Only ciphertext leaves this module. Binding the owner and revision prevents credential swaps. */
export async function encryptAiKey(
  secret: string | undefined,
  ownerId: string,
  connection: AiConnectionBinding,
  apiKey: string,
) {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: associatedData(ownerId, connection) },
      key,
      encoder.encode(apiKey),
    ),
  );
  const bytes = new Uint8Array(iv.length + ciphertext.length);
  bytes.set(iv);
  bytes.set(ciphertext, iv.length);
  return `v1.${btoa(String.fromCharCode(...bytes))}`;
}
export async function decryptAiKey(
  secret: string | undefined,
  ownerId: string,
  connection: AiConnectionBinding,
  encrypted: string,
) {
  const key = await encryptionKey(secret);
  try {
    if (!encrypted.startsWith("v1.")) throw unavailable();
    const bytes = Uint8Array.from(atob(encrypted.slice(3)), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes.slice(0, 12),
          additionalData: associatedData(ownerId, connection),
        },
        key,
        bytes.slice(12),
      ),
    );
  } catch {
    throw unavailable();
  }
}
