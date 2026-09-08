import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { operations, user } from "./schema";

export const scoringPolicy = sqliteTable("scoring_policy", {
  id: text("id").primaryKey(),
  dailyLimit: integer("daily_limit").notNull().default(25),
  revision: integer("revision").notNull().default(0),
});
export const scoringAccountPolicy = sqliteTable("scoring_account_policy", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id),
  dailyLimit: integer("daily_limit"),
  revision: integer("revision").notNull().default(0),
});
export const scoringUsageDays = sqliteTable(
  "scoring_usage_days",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    day: text("day").notNull(),
    used: integer("used").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.day] })],
);
export const scoringReservations = sqliteTable(
  "scoring_usage_reservations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id),
    state: text("state").$type<"Reserved" | "Consumed" | "Released">().notNull(),
    exempt: integer("exempt", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    settledAt: integer("settled_at"),
  },
  (table) => [
    index("scoring_usage_owner_state").on(table.ownerId, table.state),
    index("scoring_usage_operation").on(table.operationId),
  ],
);
