import type { ResetScoringAllowanceRequest, SetScoringLimitRequest } from "@river/contracts";
import { canonicalJson } from "@river/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue, useRef, useState } from "react";
import { BackupSettings } from "~/components/backup-settings";
import { EvidenceDialog, Failure, FormField, unwrap } from "~/components/evidence/shared";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import {
  getAdminDashboard,
  resetScoringAllowance,
  setScoringLimit,
} from "~/server/admin-functions";
import { getSession } from "~/server/functions";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    if (!session.user.isAdmin) throw redirect({ to: "/" });
    return { user: session.user, environment: session.environment };
  },
  component: Administration,
});
type Dashboard = Extract<Awaited<ReturnType<typeof getAdminDashboard>>, { ok: true }>["value"];
type Account = Dashboard["accounts"][number];
function useLimit(onSaved?: () => void) {
  const client = useQueryClient(),
    pending = useRef<{ payload: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (input: Omit<SetScoringLimitRequest, "idempotencyKey">) => {
      const payload = canonicalJson(input);
      if (pending.current?.payload !== payload)
        pending.current = { payload, key: crypto.randomUUID() };
      return unwrap(
        await setScoringLimit({ data: { ...input, idempotencyKey: pending.current.key } }),
      );
    },
    onSuccess: async () => {
      pending.current = null;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin"] }),
        client.invalidateQueries({ queryKey: ["scoring-allowance"] }),
      ]);
      onSaved?.();
    },
  });
}
function Administration() {
  const session = Route.useRouteContext(),
    client = useQueryClient();
  const [search, setSearch] = useState(""),
    query = useDeferredValue(search),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string>();
  const dashboard = useQuery({
    queryKey: ["admin", query, offset],
    queryFn: async () => unwrap(await getAdminDashboard({ data: { query, offset } })),
  });
  const [resetMessage, setResetMessage] = useState("");
  const resetRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const reset = useMutation({
    mutationFn: async (input: Omit<ResetScoringAllowanceRequest, "idempotencyKey">) => {
      const fingerprint = canonicalJson(input);
      if (resetRequest.current?.fingerprint !== fingerprint)
        resetRequest.current = { fingerprint, key: crypto.randomUUID() };
      return unwrap(
        await resetScoringAllowance({
          data: { ...input, idempotencyKey: resetRequest.current.key },
        }),
      );
    },
    onSuccess: async () => {
      resetRequest.current = null;
      setResetMessage(
        "The account's successful scoring count was reset. Pending scoring remains reserved.",
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin"] }),
        client.invalidateQueries({ queryKey: ["scoring-allowance"] }),
      ]);
    },
  });
  const data = dashboard.data,
    account = data?.accounts.find((item) => item.id === selected);
  const labels = {
    users: "Total users",
    activeUsers: "Active users · 30 days",
    jobs: "Jobs added",
    imports: "Imports",
    evidence: "Evidence added",
    templates: "Saved templates",
    exports: "Exports",
    scores: "Successful scores",
  } as const;
  return (
    <WorkspaceShell {...session}>
      <header className="space-y-4 border-b px-6 py-8 md:px-8">
        <p className="eyebrow">Administration</p>
        <h1 className="page-heading">Usage and account controls</h1>
        <p className="text-muted-foreground">Account activity, scoring allowances, and backups.</p>
      </header>
      <Tabs defaultValue="overview" className="gap-0">
        <TabsList variant="line" className="mx-6 mt-5 justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="controls">Controls & backups</TabsTrigger>
        </TabsList>
        <div className="px-6 pt-5">
          <Failure error={dashboard.error ?? reset.error} />
          {dashboard.error && (
            <Button variant="outline" onClick={() => void dashboard.refetch()}>
              Refresh dashboard
            </Button>
          )}
        </div>
        <TabsContent value="overview" className="space-y-6 p-6 md:p-8">
          {dashboard.isPending && <p role="status">Loading usage…</p>}
          {data?.totals && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(labels).map(([key, label]) => {
                  const count = data.totals?.[key as keyof typeof labels];
                  return (
                    <article key={key} className="rounded-lg border p-6">
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="mt-4 font-editorial text-4xl">{count?.toLocaleString()}</p>
                    </article>
                  );
                })}
              </div>
              <section className="rounded-lg border p-6">
                <h2 className="text-2xl">Processing outcomes</h2>
                <div className="mt-5 flex flex-wrap gap-8">
                  {(
                    [
                      ["succeeded", "Succeeded"],
                      ["failed", "Failed"],
                      ["cancelled", "Cancelled"],
                      ["processing", "Processing"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="mt-2 text-2xl">{data.totals?.[key]}</p>
                    </div>
                  ))}
                </div>
              </section>
              <p className="text-xs text-muted-foreground">
                Active users have an updated session in the last 30 days. Imports include sources
                and URL job imports. Each template sample contributes one successful score.
              </p>
            </>
          )}
        </TabsContent>
        <TabsContent value="accounts" className="space-y-5 p-6 md:p-8">
          <Input
            aria-label="Search accounts"
            placeholder="Search name or email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
          {resetMessage && (
            <p role="status" className="text-sm text-approved">
              {resetMessage}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b bg-muted">
                <tr>
                  {[
                    "Account",
                    "Jobs",
                    "Imports",
                    "Evidence",
                    "Templates",
                    "Exports",
                    "Scores",
                    "Processing",
                    "Today",
                    "Actions",
                  ].map((label) => (
                    <th className="p-4 font-medium" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.accounts.map((item) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="p-4">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.active ? "Active in the last 30 days" : "No recent session activity"}
                      </p>
                    </td>
                    {(
                      ["jobs", "imports", "evidence", "templates", "exports", "scores"] as const
                    ).map((key) => (
                      <td className="p-4" key={key}>
                        {item[key]}
                      </td>
                    ))}
                    <td className="p-4 text-xs">
                      <p>{item.processing} active</p>
                      <p className="mt-1 text-muted-foreground">
                        {item.succeeded} succeeded · {item.failed} failed · {item.cancelled}{" "}
                        cancelled
                      </p>
                    </td>
                    <td className="p-4">
                      {item.administrator ? "Unlimited" : `${item.used} / ${item.dailyLimit}`}
                      <p className="mt-1 text-xs text-muted-foreground">{item.reserved} reserved</p>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setSelected(item.id)}>
                          Manage
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!item.used || reset.isPending || item.administrator}
                          onClick={() =>
                            data &&
                            reset.mutate({ ownerId: item.id, day: data.day, used: item.used })
                          }
                        >
                          Reset allowance
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <Button
              variant="outline"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!data?.hasMore}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="controls" className="space-y-8 p-6 md:p-8">
          {data && <DefaultLimit key={data.policy.revision} policy={data.policy} />}
          <section className="border-t pt-6">
            <h2 className="mb-4 text-2xl">Backups</h2>
            <BackupSettings />
          </section>
        </TabsContent>
      </Tabs>
      {account && data && (
        <AccountLimit
          key={`${account.id}:${account.revision}`}
          account={account}
          defaultLimit={data.policy.dailyLimit}
          onClose={() => setSelected(undefined)}
        />
      )}
    </WorkspaceShell>
  );
}
function DefaultLimit({ policy }: { policy: Dashboard["policy"] }) {
  const [limit, setLimit] = useState(String(policy.dailyLimit)),
    save = useLimit();
  return (
    <form
      className="max-w-xl space-y-5 rounded-lg border p-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ ownerId: null, dailyLimit: Number(limit), revision: policy.revision });
      }}
    >
      <h2 className="text-2xl">Daily scoring allowance</h2>
      <p className="text-sm text-muted-foreground">
        The default applies to ordinary accounts. Administrators have no daily cap. Failed attempts
        are free. Pending scoring remains reserved when limits change.
      </p>
      <FormField label="Successful results per account per day">
        <Input
          type="number"
          min={0}
          max={10000}
          required
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
        />
      </FormField>
      <Failure error={save.error} />
      <Button disabled={save.isPending} type="submit">
        Save default allowance
      </Button>
    </form>
  );
}
function AccountLimit({
  account,
  defaultLimit,
  onClose,
}: {
  account: Account;
  defaultLimit: number;
  onClose: () => void;
}) {
  const [limit, setLimit] = useState(account.override === null ? "" : String(account.override)),
    save = useLimit(onClose);
  return (
    <EvidenceDialog
      title={`Scoring allowance · ${account.name}`}
      description={account.email}
      onClose={onClose}
      pending={save.isPending}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({
            ownerId: account.id,
            dailyLimit: limit === "" ? null : Number(limit),
            revision: account.revision,
          });
        }}
      >
        {account.administrator ? (
          <p>Administrators have unlimited scoring.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Leave blank to use the default of {defaultLimit} successful results per day.
            </p>
            <FormField label="Daily allowance override">
              <Input
                type="number"
                min={0}
                max={10000}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </FormField>
          </>
        )}
        <Failure error={save.error} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending || account.administrator}>Save allowance</Button>
        </div>
      </form>
    </EvidenceDialog>
  );
}
