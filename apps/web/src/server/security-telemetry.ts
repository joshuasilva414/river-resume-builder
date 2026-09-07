/** Only these application-authored fields may cross into persisted telemetry. */
export function sanitizedRequestLog(value: unknown) {
  if (!value || typeof value !== "object") return null;
  if (!("event" in value) || value.event !== "river.request") return null;
  if (
    !("traceId" in value) ||
    typeof value.traceId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(value.traceId)
  )
    return null;
  if (
    !("status" in value) ||
    typeof value.status !== "number" ||
    !Number.isInteger(value.status) ||
    value.status < 100 ||
    value.status > 599
  )
    return null;
  return { event: "river.request", traceId: value.traceId, status: value.status };
}

/** Raw events exist only in transit. Never log the event, URL, headers, arguments or exception. */
export default {
  async tail(events) {
    for (const event of events) {
      for (const log of event.logs) {
        for (const message of log.message) {
          if (typeof message !== "string") continue;
          try {
            const safe = sanitizedRequestLog(JSON.parse(message));
            if (safe) console.info(JSON.stringify(safe));
          } catch {
            /* Framework text logs are intentionally discarded. */
          }
        }
      }
      if (event.outcome !== "ok")
        console.warn(JSON.stringify({ event: "river.invocation.failed" }));
    }
  },
} satisfies ExportedHandler;
