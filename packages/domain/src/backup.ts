import { Schema } from "effect";

export const BackupObject = Schema.Struct({
  key: Schema.NonEmptyString,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  bytes: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type BackupObject = typeof BackupObject.Type;
export const BackupExport = Schema.Struct({
  format: Schema.Literal("river-d1-export-v2"),
  id: Schema.NonEmptyString,
  createdAt: Schema.NonEmptyString,
  resources: Schema.Struct({
    accountId: Schema.NonEmptyString,
    databaseId: Schema.NonEmptyString,
    database: Schema.NonEmptyString,
    bucket: Schema.NonEmptyString,
  }),
  tables: Schema.Array(Schema.NonEmptyString),
  migrations: Schema.Array(
    Schema.Struct({
      name: Schema.NonEmptyString,
      sql: Schema.NonEmptyString,
      sha256: Schema.NonEmptyString,
    }),
  ),
  data: BackupObject,
});
export type BackupExport = typeof BackupExport.Type;

export const backupCatalogQuery =
  "SELECT name FROM pragma_table_list WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name";
