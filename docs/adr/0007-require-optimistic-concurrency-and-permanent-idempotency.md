# Require optimistic concurrency and permanent idempotency

Every mutation identifies its actor and idempotency key, while updates also identify the revision observed by the caller. Stale updates fail with a conflict rather than overwriting newer work. Idempotency results remain in the permanent activity history so delayed retries from owners or agents cannot replay an old mutation as new work.
