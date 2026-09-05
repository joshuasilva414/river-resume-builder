# Deployed request-lifetime proof

Updated 2026-09-05. Personal staging Worker `230d70d0-0600-4020-818c-e46daf72f84a` completed a server-observed cancellation and subsequent authenticated document workflow. No application code or credentials changed for this check.

## Evidence

The probe calls `GET /api/v1/me` with a deliberately nonexistent, syntactically valid credential. This takes the request-scoped authentication path through D1 without granting access or creating an account. A unique request header restricts the temporary Wrangler tail to the probe's own requests.

The capture first observed a normal 401 control. After a complete request was sent, the client disconnected at 25 milliseconds. Cloudflare reported invocation outcome `canceled` for `lifetime-proof=river-lifetime-20260905-c&stage=abort-25`, with no exception records. The following completed identity request returned 401. A client-side timeout alone was not accepted as proof.

The Owner's subsequent normal UI compile created Operation `01a07398-58ea-7eaa-a692-1d36e78579cf`. D1 confirms Succeeded with retained artifacts. It took 16.412 seconds end to end; the document stage took approximately 9.59 seconds. The browser rendered the actual one-page PDF and reported passing text integrity. Existing Owner authentication remained usable.

Earlier incomplete-body probes disconnected at the client without producing a captured Worker invocation. They do not establish server-side cancellation. The successful probe uses an ordinary complete request and awaits an observed control before testing cancellation. The original private capture is `/tmp/river-lifetime-tail-c.jsonl`.

## Reproduce

Run `node scripts/probe-request-lifetime.mjs` from the workspace with Node 24.20.0, pnpm 10.33.0 and Wrangler 4.129.0 available. The command pins the personal account and `river-staging`, captures at most one minute of its own filtered logs, tries three bounded disconnect timings, and checks a subsequent 401 response. It writes permission-restricted logs and a content-free report below ignored `test-results/runtime/`.

The saved command passed with report `test-results/runtime/river-lifetime-4c7f4b67-b5c5-4ed2-b735-86101a834fc2/report.json`. Its capture includes the normal control, the canceled 25-millisecond invocation, and the subsequent normal 401. The initial command's shorter startup window stopped before any blind probes because the log connection was not yet observed. The final command permits up to twelve control observations within the same one-minute capture and retains an inconclusive report on setup failure. Node syntax and focused Biome checks passed. Application code was unchanged, so the 142-test Workers suite was not repeated.

The command exits unsuccessfully with an inconclusive report if it sees only client disconnects. Cancellation timing and log delivery are nondeterministic; a missed observation is not proof of a failed application. Inspect the recorded evidence before repeating. To complete the authenticated portion, use the existing Document runtime page to compile its synthetic fixture and inspect PDF/text/report output. No real résumé or credential is needed for the command-line portion.

This verifies sampled deployed request boundaries, alongside the first hosted and warm-render measurements in `phase-0.md` and `render-cache.md`. It does not prove that Cloudflare scheduled separate requests in the same isolate or inject a failure between every possible application write. Atomic cancellation, late-result suppression and interrupted dispatch/artifact recovery have separate Workers integration tests.

Cloudflare defines `canceled` as an invocation ending before completion, including an early client disconnect. See [Tail handler outcomes](https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/). A normal 401 can still have invocation outcome `ok`; status and runtime outcome describe different things.
