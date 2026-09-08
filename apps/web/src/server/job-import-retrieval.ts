import { ApplicationError } from "@river/domain";
import { Schema } from "effect";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 120000;
const DNS = Schema.Struct({
  Status: Schema.Number,
  Answer: Schema.optionalKey(
    Schema.Array(Schema.Struct({ type: Schema.Number, data: Schema.String })),
  ),
});
const fail = (message: string): never => {
  throw new ApplicationError({ code: "InvalidInput", message });
};

/** Reject all IP literals and local names, including URL-normalized alternate IPv4 spellings. */
export function publicPostingUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("Enter a complete public HTTP or HTTPS posting URL.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    /(?:^|\.)(?:localhost|local|internal|intranet|test|invalid|example|onion)$/.test(host)
  )
    return fail("Use a public posting URL without credentials, IP addresses, or custom ports.");
  url.hostname = host;
  url.hash = "";
  return url;
}
export function publicAddress(address: string): boolean {
  if (address.includes(":")) {
    try {
      new URL(`http://[${address}]/`);
    } catch {
      return false;
    }
    const value = address.toLowerCase();
    const [first = "", second = "0"] = value.split(":");
    const prefix = Number.parseInt(first, 16),
      subnet = Number.parseInt(second || "0", 16);
    // Permit global-unicast IPv6 only; exclude special-purpose and documentation ranges.
    return (
      /^[23][0-9a-f]{3}:/.test(value) &&
      prefix !== 0x2002 &&
      prefix !== 0x3fff &&
      !(prefix === 0x2001 && (subnet < 0x200 || subnet === 0xdb8))
    );
  }
  const bytes = address.split(".").map(Number);
  if (bytes.length !== 4 || bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a = 0, b = 0, c = 0] = bytes;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    await response.body?.cancel();
    return fail("This page is too large. Paste the job description instead.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = "";
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES)
        return fail("This page is too large. Paste the job description instead.");
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
  }
}
async function validateDns(url: URL, transport: typeof fetch, signal: AbortSignal) {
  const answers = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const query = new URL("https://cloudflare-dns.com/dns-query");
      query.searchParams.set("name", url.hostname);
      query.searchParams.set("type", type);
      const response = await transport(query, {
        headers: { accept: "application/dns-json" },
        redirect: "error",
        signal,
      });
      if (!response.ok)
        return fail("The posting address could not be checked. Try again or paste its text.");
      const dns = Schema.decodeUnknownSync(DNS)(JSON.parse(await boundedText(response, signal)));
      if (dns.Status !== 0)
        return fail("The posting address could not be checked. Try again or paste its text.");
      return (dns.Answer ?? [])
        .filter((item) => item.type === 1 || item.type === 28)
        .map((item) => item.data);
    }),
  );
  const addresses = answers.flat();
  if (!addresses.length || addresses.some((address) => !publicAddress(address)))
    return fail("This posting address does not resolve exclusively to a public destination.");
}
function decodeEntities(text: string) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&nbsp;": " ",
    };
    if (!entity.startsWith("&#")) return named[entity.toLowerCase()] ?? entity;
    const n =
      entity[2]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(3, -1), 16)
        : Number(entity.slice(2, -1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  });
}
/** Extract readable data only. HTML and embedded instructions are never executed by the application UI. */
export function postingText(html: string) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(clean)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
const incomplete = (text: string) =>
  text.length < 300 ||
  /(?:enable javascript|access denied|verify you are human|sign in to (?:view|continue)|captcha|checking your browser)/i.test(
    text.slice(0, 3000),
  );
export type JobBrowser = {
  quickAction: (action: "content", options: BrowserRunContentOptions) => Promise<Response>;
};
const BrowserContent = Schema.Struct({
  success: Schema.Literal(true),
  result: Schema.String,
  meta: Schema.Struct({
    status: Schema.Number,
    finalUrl: Schema.optionalKey(Schema.String),
    redirectChain: Schema.optionalKey(Schema.Array(Schema.Struct({ url: Schema.String }))),
  }),
});

function renderBeforeDeadline(
  browser: JobBrowser,
  options: BrowserRunContentOptions,
  signal: AbortSignal,
): Promise<Response> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        new ApplicationError({
          code: "Unavailable",
          message: "Retrieval timed out. Retry or paste the posting text.",
        }),
      );
    signal.addEventListener("abort", abort, { once: true });
    // Attach the listener before dispatch so even an immediate deadline stops publication.
    browser
      .quickAction("content", options)
      .then((response) => {
        if (signal.aborted) void response.body?.cancel().catch(() => {});
        else resolve(response);
      }, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Every HTTP redirect is revalidated; browser requests are limited to validated origins. */
export async function retrievePosting(
  value: string,
  browser: JobBrowser | undefined,
  transport: typeof fetch = fetch,
  signal = AbortSignal.timeout(30000),
) {
  signal.throwIfAborted();
  let url = publicPostingUrl(value),
    html = "",
    text = "";
  for (let redirects = 0; redirects <= 5; redirects++) {
    await validateDns(url, transport, signal);
    const response = await transport(url, {
      redirect: "manual",
      signal,
      headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "RiverJobImport/1.2" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 5)
        return fail("The posting redirected too many times. Paste its text instead.");
      url = publicPostingUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return fail(
        "This posting is blocked or requires sign-in. Paste the job description instead.",
      );
    }
    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!["text/html", "text/plain", "application/xhtml+xml"].includes(contentType)) {
      await response.body?.cancel();
      return fail("This URL is not a readable job page. Paste the job description instead.");
    }
    html = await boundedText(response, signal);
    text = contentType === "text/plain" ? html : postingText(html);
    break;
  }
  let method: "html" | "browser" = "html";
  if (incomplete(text)) {
    if (!browser)
      return fail(
        "This page needs browser rendering, which is unavailable. Paste the job description instead.",
      );
    const origins = new Set([url.origin]);
    // External script origins are bounded and checked before allowing them into the rendered page.
    for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
      if (origins.size >= 8) break;
      try {
        const script = publicPostingUrl(new URL(match[1] ?? "", url).href);
        await validateDns(script, transport, signal);
        origins.add(script.origin);
      } catch {
        signal.throwIfAborted();
        /* Unverified third-party resources remain blocked. */
      }
    }
    const response = await renderBeforeDeadline(
      browser,
      {
        url: url.href,
        gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
        allowRequestPattern: [...origins].map(
          (origin) => `^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`,
        ),
        rejectResourceTypes: ["image", "media", "font", "stylesheet", "websocket"],
      },
      signal,
    );
    if (!response.ok) {
      await response.body?.cancel();
      return fail("The rendered page is blocked. Paste the job description instead.");
    }
    const content = Schema.decodeUnknownSync(BrowserContent)(
      JSON.parse(await boundedText(response, signal)),
    );
    if (content.meta.status < 200 || content.meta.status >= 300)
      return fail("The rendered posting is blocked. Paste the job description instead.");
    if ((content.meta.redirectChain?.length ?? 0) > 5)
      return fail("The rendered posting redirected too many times. Paste its text instead.");
    for (const address of [
      ...(content.meta.redirectChain ?? []).map((hop) => hop.url),
      content.meta.finalUrl ?? url.href,
    ]) {
      const destination = publicPostingUrl(address);
      if (!origins.has(destination.origin))
        return fail(
          "The rendered posting changed to an unapproved destination. Paste the description instead.",
        );
      await validateDns(destination, transport, signal);
    }
    url = publicPostingUrl(content.meta.finalUrl ?? url.href);
    text = postingText(content.result);
    method = "browser";
  }
  if (incomplete(text))
    return fail(
      "The page did not include a complete public posting. Paste the job description instead.",
    );
  if (text.length > MAX_TEXT)
    return fail("This page contains too much text. Paste only the job description instead.");
  return { text, url: url.href, method };
}
