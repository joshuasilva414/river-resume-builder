import type {
  AdminDashboardRequest,
  ResetScoringAllowanceRequest,
  SetScoringLimitRequest,
} from "@river/contracts";
import { ApplicationError, type Principal, scoringUsageWindow } from "@river/domain";
import { and, eq, sql } from "drizzle-orm";
import { conditionGuard, createCommands, type Guard } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

const messages = {
  river_usage_owner_active:
    "Four tasks are already active in your workspace. Wait or cancel a task before starting another.",
  river_usage_global_active:
    "River is processing its current task limit. Please try again shortly.",
} as const;
export function usageFailure(error: unknown): ApplicationError | null {
  let cause = error;
  for (let depth = 0; cause instanceof Error && depth < 8; depth++) {
    for (const [marker, message] of Object.entries(messages))
      if (cause.message.includes(marker))
        return new ApplicationError({ code: "RateLimited", message });
    cause = cause.cause;
  }
  return null;
}
const configuredLimit = (ownerId: string) =>
  sql`COALESCE((SELECT daily_limit FROM scoring_account_policy WHERE owner_id=${ownerId}),(SELECT daily_limit FROM scoring_policy WHERE id='default'),25)`;
const usedToday = (ownerId: string) =>
  sql`COALESCE((SELECT used FROM scoring_usage_days WHERE owner_id=${ownerId} AND day=strftime('%Y-%m-%d','now')),0)`;
const reservations = (ownerId: string) =>
  sql`(SELECT count(*) FROM scoring_usage_reservations WHERE owner_id=${ownerId} AND state='Reserved')`;

/** Reserve all result slots in the same transaction that queues work. Pending slots survive midnight. */
export function prepareScoringAllowance(
  db: Database,
  actor: Principal,
  operationId: string,
  ids: readonly string[],
) {
  const exempt = actor.kind === "owner" && actor.isAdmin === true;
  const condition =
    exempt || !ids.length
      ? sql`1`
      : sql`${usedToday(actor.ownerId)} + ${reservations(actor.ownerId)} + ${ids.length} <= ${configuredLimit(actor.ownerId)}`;
  const guard: Guard = {
    condition,
    check: async () => {
      if (!(await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`))?.valid)
        throw new ApplicationError({
          code: "RateLimited",
          message: `This action needs ${ids.length} scoring result${ids.length === 1 ? "" : "s"}, but your remaining allowance is lower. Allowance resets at midnight UTC. Retained results and failed attempts do not consume another allowance.`,
        });
    },
  };
  return {
    guards: [guard],
    writes: ids.map((id) =>
      db
        .insert(s.scoringReservations)
        .values({
          id,
          ownerId: actor.ownerId,
          operationId,
          state: "Reserved",
          exempt,
          createdAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: s.scoringReservations.id,
          set: { operationId, state: "Reserved", exempt, createdAt: Date.now(), settledAt: null },
          setWhere: eq(s.scoringReservations.state, "Released"),
        }),
    ),
  };
}
export const settleScoringAllowance = (db: Database, operationId: string, id: string) =>
  db
    .update(s.scoringReservations)
    .set({ state: "Consumed", settledAt: Date.now() })
    .where(
      and(
        eq(s.scoringReservations.id, id),
        eq(s.scoringReservations.operationId, operationId),
        eq(s.scoringReservations.state, "Reserved"),
      ),
    );
export const releaseScoringAllowance = (db: Database, operationId: string, id: string) =>
  db
    .update(s.scoringReservations)
    .set({ state: "Released", settledAt: Date.now() })
    .where(
      and(
        eq(s.scoringReservations.id, id),
        eq(s.scoringReservations.operationId, operationId),
        eq(s.scoringReservations.state, "Reserved"),
      ),
    );
function administrator(actor: Principal) {
  if (actor.kind !== "owner" || !actor.isAdmin)
    throw new ApplicationError({ code: "Forbidden", message: "Administrator access is required." });
}

export function createUsageRepository(db: Database) {
  const commands = createCommands(db);
  return {
    async readScoringAllowance(actor: Principal) {
      const counts = await db.get<{ day: string; used: number; reserved: number; limit: number }>(
        sql`SELECT strftime('%Y-%m-%d','now') AS day, ${usedToday(actor.ownerId)} AS used, ${reservations(actor.ownerId)} AS reserved, ${configuredLimit(actor.ownerId)} AS "limit"`,
      );
      const exempt = actor.kind === "owner" && actor.isAdmin === true;
      const used = counts?.used ?? 0,
        reserved = counts?.reserved ?? 0,
        limit = counts?.limit ?? 25;
      return {
        ...scoringUsageWindow(counts ? Date.parse(`${counts.day}T00:00:00.000Z`) : undefined),
        used,
        reserved,
        limit: exempt ? null : limit,
        remaining: exempt ? null : Math.max(0, limit - used - reserved),
        exempt,
      };
    },
    async readUsage(ownerId: string) {
      const counts = await db.get<{ active: number; today: number }>(
        sql`SELECT COALESCE(SUM(state IN ('Pending','Running')),0) AS active, COALESCE(SUM(created_at >= unixepoch('now','start of day')*1000),0) AS today FROM operations WHERE owner_id=${ownerId} AND COALESCE(json_extract(input,'$.type'),'') <> 'database-backup'`,
      );
      return {
        active: counts?.active ?? 0,
        today: counts?.today ?? 0,
        activeLimit: 4,
        dailyLimit: null,
        resetsAt: scoringUsageWindow().resetsAt,
      };
    },
    async setScoringLimit(actor: Principal, input: SetScoringLimitRequest) {
      administrator(actor);
      return commands.commit(actor, "set-scoring-limit", input.idempotencyKey, input, async () => {
        if (input.ownerId === null && input.dailyLimit === null)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "The default daily allowance must be a number.",
          });
        if (
          input.ownerId &&
          !(
            await db
              .select({ id: s.user.id })
              .from(s.user)
              .where(eq(s.user.id, input.ownerId))
              .limit(1)
          )[0]
        )
          throw new ApplicationError({ code: "NotFound", message: "Account not found." });
        const revision = input.revision + 1;
        const guard = conditionGuard(
          db,
          input.ownerId === null
            ? sql`(SELECT revision FROM scoring_policy WHERE id='default')=${input.revision}`
            : sql`COALESCE((SELECT revision FROM scoring_account_policy WHERE owner_id=${input.ownerId}),0)=${input.revision}`,
          "This allowance setting changed. Refresh before saving.",
        );
        const write =
          input.ownerId === null
            ? db
                .update(s.scoringPolicy)
                .set({ dailyLimit: input.dailyLimit ?? 25, revision })
                .where(eq(s.scoringPolicy.id, "default"))
            : db
                .insert(s.scoringAccountPolicy)
                .values({ ownerId: input.ownerId, dailyLimit: input.dailyLimit, revision })
                .onConflictDoUpdate({
                  target: s.scoringAccountPolicy.ownerId,
                  set: { dailyLimit: input.dailyLimit, revision },
                });
        return {
          result: { id: input.ownerId ?? "default", revision, revisionId: null },
          guards: [guard],
          writes: [write],
          history: [
            {
              entityId: input.ownerId ?? "default",
              after: { dailyLimit: input.dailyLimit, revision },
            },
          ],
        };
      });
    },
    async resetScoringAllowance(actor: Principal, input: ResetScoringAllowanceRequest) {
      administrator(actor);
      return commands.commit(
        actor,
        "reset-scoring-allowance",
        input.idempotencyKey,
        input,
        async () => {
          if (
            !(
              await db
                .select({ id: s.user.id })
                .from(s.user)
                .where(eq(s.user.id, input.ownerId))
                .limit(1)
            )[0]
          )
            throw new ApplicationError({ code: "NotFound", message: "Account not found." });
          return {
            result: { id: input.ownerId, revision: 0, revisionId: null },
            guards: [
              conditionGuard(
                db,
                sql`${input.day}=strftime('%Y-%m-%d','now') AND ${usedToday(input.ownerId)}=${input.used}`,
                "This allowance changed. Refresh before resetting it.",
              ),
            ],
            writes: [
              db
                .insert(s.scoringUsageDays)
                .values({ ownerId: input.ownerId, day: input.day, used: 0 })
                .onConflictDoUpdate({
                  target: [s.scoringUsageDays.ownerId, s.scoringUsageDays.day],
                  set: { used: 0 },
                }),
            ],
            history: [
              {
                entityId: input.ownerId,
                before: { day: input.day, used: input.used },
                after: { day: input.day, used: 0 },
              },
            ],
          };
        },
      );
    },
    /** Identity and aggregate counts only: never select source, résumé, job, provider, or audit payloads. */
    async adminDashboard(actor: Principal, input: AdminDashboardRequest) {
      administrator(actor);
      const active = sql`EXISTS (SELECT 1 FROM session se WHERE se.user_id=u.id AND se.updated_at >= unixepoch('now','-30 days')*1000)`;
      const metricColumns = sql`
        (SELECT count(*) FROM job_targets j WHERE j.owner_id=u.id) AS jobs,
        (SELECT count(*) FROM sources so WHERE so.owner_id=u.id)+(SELECT count(*) FROM job_imports ji WHERE ji.owner_id=u.id) AS imports,
        (SELECT count(*) FROM evidence_claims e WHERE e.owner_id=u.id) AS evidence,
        (SELECT count(*) FROM template_designs t WHERE t.owner_id=u.id) AS templates,
        (SELECT count(*) FROM checkpoint_exports e JOIN resume_checkpoints c ON c.id=e.checkpoint_id WHERE c.owner_id=u.id) AS exports,
        (SELECT count(*) FROM operations o WHERE o.owner_id=u.id AND o.state='Succeeded' AND COALESCE(json_extract(o.input,'$.type'),'') <> 'database-backup') AS succeeded,
        (SELECT count(*) FROM operations o WHERE o.owner_id=u.id AND o.state='Failed' AND COALESCE(json_extract(o.input,'$.type'),'') <> 'database-backup') AS failed,
        (SELECT count(*) FROM operations o WHERE o.owner_id=u.id AND o.state='Cancelled' AND COALESCE(json_extract(o.input,'$.type'),'') <> 'database-backup') AS cancelled,
        (SELECT count(*) FROM operations o WHERE o.owner_id=u.id AND o.state IN ('Pending','Running') AND COALESCE(json_extract(o.input,'$.type'),'') <> 'database-backup') AS processing,
        (SELECT count(*) FROM scoring_runs r WHERE r.owner_id=u.id AND r.result IS NOT NULL)+(SELECT count(*) FROM template_scoring_fixtures f JOIN template_scoring_runs r ON r.id=f.run_id WHERE r.owner_id=u.id AND f.raw_response_json IS NOT NULL) AS scores`;
      type Metrics = {
        jobs: number;
        imports: number;
        evidence: number;
        templates: number;
        exports: number;
        succeeded: number;
        failed: number;
        cancelled: number;
        processing: number;
        scores: number;
      };
      type Account = Metrics & {
        id: string;
        name: string;
        email: string;
        active: number;
        used: number;
        reserved: number;
        dailyLimit: number;
        override: number | null;
        revision: number;
      };
      const accounts =
        await db.all<Account>(sql`SELECT u.id,u.name,u.email,${active} AS active,${metricColumns},
        COALESCE((SELECT used FROM scoring_usage_days d WHERE d.owner_id=u.id AND d.day=strftime('%Y-%m-%d','now')),0) AS used,
        (SELECT count(*) FROM scoring_usage_reservations r WHERE r.owner_id=u.id AND r.state='Reserved') AS reserved,
        COALESCE(p.daily_limit,(SELECT daily_limit FROM scoring_policy WHERE id='default'),25) AS dailyLimit,p.daily_limit AS override,COALESCE(p.revision,0) AS revision
        FROM user u LEFT JOIN scoring_account_policy p ON p.owner_id=u.id
        WHERE instr(lower(u.name || ' ' || u.email),${input.query.toLowerCase()}) > 0 ORDER BY u.created_at DESC,u.id LIMIT 51 OFFSET ${input.offset}`);
      const totals = await db.get<
        Metrics & { users: number; activeUsers: number }
      >(sql`SELECT count(*) AS users,COALESCE(sum(active),0) AS activeUsers,
        COALESCE(sum(jobs),0) AS jobs,COALESCE(sum(imports),0) AS imports,COALESCE(sum(evidence),0) AS evidence,COALESCE(sum(templates),0) AS templates,COALESCE(sum(exports),0) AS exports,
        COALESCE(sum(succeeded),0) AS succeeded,COALESCE(sum(failed),0) AS failed,COALESCE(sum(cancelled),0) AS cancelled,COALESCE(sum(processing),0) AS processing,COALESCE(sum(scores),0) AS scores
        FROM (SELECT ${active} AS active,${metricColumns} FROM user u)`);
      const policy = (
        await db.select().from(s.scoringPolicy).where(eq(s.scoringPolicy.id, "default"))
      )[0];
      return {
        totals,
        accounts: accounts.slice(0, 50),
        hasMore: accounts.length > 50,
        policy: { dailyLimit: policy?.dailyLimit ?? 25, revision: policy?.revision ?? 0 },
        ...scoringUsageWindow(),
        activeWindowDays: 30,
      };
    },
  };
}
