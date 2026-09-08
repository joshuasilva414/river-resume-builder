import { Schema } from "effect";

const CapturedInventory = Schema.Struct({
  renderer: Schema.Literals([
    "river-tectonic-0.2.0",
    "river-tectonic-0.3.0",
    "river-tectonic-0.4.0",
    "river-tectonic-0.5.0",
  ]),
});

/** Historical exports and retries use the renderer captured with their immutable template inventory. */
export function capturedRenderer(identity: string | undefined) {
  if (!identity) return undefined;
  try {
    return Schema.decodeUnknownSync(CapturedInventory)(JSON.parse(identity)).renderer;
  } catch {
    return undefined;
  }
}
