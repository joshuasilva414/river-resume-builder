import type { CreateCredentialRequest } from "@river/contracts";
import { type AgentScope, agentScopes, canonicalJson, fingerprint, newId } from "@river/domain";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check, KeyRound, Monitor, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Appearance } from "~/components/appearance";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { WorkspaceShell } from "~/components/workspace-shell";
import { authClient } from "~/lib/auth-client";
import {
  createAgentCredential,
  getSession,
  getSettings,
  revokeAgentCredential,
} from "~/server/functions";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session.user) throw redirect({ to: "/sign-in" });
    return { user: session.user, environment: session.environment };
  },
  component: Settings,
});
const labels: Record<AgentScope, string> = {
  "source:read": "Read sources",
  "source:write": "Add sources",
  "evidence:read": "Read evidence",
  "evidence:write": "Add and update evidence",
  "evidence:verify": "Verify evidence",
  "evidence:merge": "Merge evidence",
  "evidence:archive": "Archive and restore evidence",
  "jobs:read": "Read job targets",
  "jobs:write": "Add and update job targets",
};
const date = (value: string) => new Date(value).toLocaleString();
function Settings() {
  const { user, environment } = Route.useRouteContext();
  const client = useQueryClient();
  const [tab, setTab] = useState("agents");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pending = useRef<{
    input: CreateCredentialRequest;
    secret: string;
    formFingerprint: string;
  } | null>(null);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const result = await getSettings();
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  const create = useMutation({
    mutationFn: async (input: CreateCredentialRequest) => {
      const result = await createAgentCredential({ data: input });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["settings"] }),
  });
  const revoke = useMutation({
    mutationFn: async ({ id, revision }: { id: string; revision: number }) => {
      const result = await revokeAgentCredential({
        data: { id, revision, idempotencyKey: crypto.randomUUID() },
      });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["settings"] }),
  });
  const form = useForm({
    defaultValues: {
      name: "",
      scopes: ["source:read", "evidence:read"] as AgentScope[],
      expiry: "30",
    },
    onSubmit: async ({ value }) => {
      const formFingerprint = canonicalJson(value);
      if (!pending.current || pending.current.formFingerprint !== formFingerprint) {
        const id = newId();
        const random = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        pending.current = {
          formFingerprint,
          secret: `river_${id}.${random}`,
          input: {
            id,
            idempotencyKey: crypto.randomUUID(),
            name: value.name.trim(),
            scopes: value.scopes,
            expiresInDays: value.expiry === "never" ? null : Number(value.expiry),
            secretHash: await fingerprint(random),
          },
        };
      }
      try {
        await create.mutateAsync(pending.current.input);
        setSecret(pending.current.secret);
        setCopied(false);
        pending.current = null;
        form.reset();
      } catch {
        /* Keep the same request and secret in memory for a safe retry. */
      }
    },
  });
  const activity = settings.data?.activity ?? [];
  return (
    <WorkspaceShell user={user} environment={environment}>
      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col gap-0">
        <div className="flex flex-col gap-4 border-b px-6 pt-7 md:px-8">
          <p className="eyebrow">Personal workspace</p>
          <h1 className="page-heading">Settings</h1>
          <TabsList variant="line" className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="agents">Agent access</TabsTrigger>
            <TabsTrigger value="account">Account & sessions</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>
        {settings.error && (
          <Alert variant="destructive" className="m-6 w-auto">
            <AlertDescription>{settings.error.message}</AlertDescription>
          </Alert>
        )}
        <TabsContent value="agents" className="m-0 grid flex-1 lg:grid-cols-[minmax(0,1fr)_404px]">
          <section className="flex flex-col gap-6 px-6 py-7 md:px-8">
            <div className="flex flex-col gap-2">
              <h2 className="text-[28px] font-semibold tracking-tight">
                Your agents, with clear boundaries.
              </h2>
              <p className="text-muted-foreground">
                Give each agent only the access it needs. You can revoke it at any time.
              </p>
            </div>
            {settings.isPending && <p role="status">Loading credentials…</p>}
            {settings.data?.credentials.length === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <KeyRound />
                  </EmptyMedia>
                  <EmptyTitle>No agent credentials</EmptyTitle>
                  <EmptyDescription>
                    Create a named credential to give an agent access to your sources, evidence, or
                    jobs.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {revoke.error && (
              <Alert variant="destructive">
                <AlertDescription>{revoke.error.message}</AlertDescription>
              </Alert>
            )}
            {settings.data?.credentials.map((credential) => {
              const state = credential.revokedAt
                ? "Revoked"
                : credential.expiresAt && new Date(credential.expiresAt).getTime() <= Date.now()
                  ? "Expired"
                  : "Active";
              return (
                <article key={credential.id} className="flex flex-col gap-3 border-t py-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-sans text-[17px] font-semibold">{credential.name}</h3>
                    <Badge variant="outline" className={state === "Active" ? "text-approved" : ""}>
                      {state}
                    </Badge>
                    {state === "Active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(credential)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                  <p className="text-[13px] leading-6 text-muted-foreground">
                    {credential.scopes.map((scope) => labels[scope]).join(" · ")}
                  </p>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {credential.lastUsedAt
                        ? `Last used ${date(credential.lastUsedAt)}`
                        : "Not used yet"}
                    </span>
                    <span className="font-mono">
                      {credential.expiresAt
                        ? `Expires ${date(credential.expiresAt)}`
                        : "No expiration"}
                    </span>
                  </div>
                </article>
              );
            })}
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-sans text-[15px] font-semibold">Recent credential activity</h3>
              <Button variant="link" size="sm" onClick={() => setTab("activity")}>
                View full history →
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Changes retain the actor, prior revision, and source history.
            </p>
            {activity
              .filter((entry) => entry.command.includes("credential"))
              .slice(0, 3)
              .map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 border-b pb-4">
                  <Check className="size-4 text-approved" />
                  <div>
                    <p>{entry.command.replaceAll("-", " ")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{date(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
          </section>
          <aside className="border-t bg-muted p-7 lg:border-t-0 lg:border-l">
            <h2 className="text-[26px] font-semibold tracking-tight">Create a credential</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">The secret will be shown once.</p>
            <form
              className="mt-7"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.Field name="name">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="credential-name">Name</FieldLabel>
                      <Input
                        id="credential-name"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="Research assistant"
                        maxLength={80}
                        required
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="scopes">
                  {(field) => (
                    <fieldset className="flex flex-col gap-4">
                      <legend className="mb-4 text-[13px] font-semibold">Permissions</legend>
                      {agentScopes.map((scope) => (
                        <Field key={scope} orientation="horizontal">
                          <Checkbox
                            id={`scope-${scope}`}
                            checked={field.state.value.includes(scope)}
                            onCheckedChange={(checked) =>
                              field.handleChange(
                                checked === true
                                  ? [...field.state.value, scope]
                                  : field.state.value.filter((item) => item !== scope),
                              )
                            }
                          />
                          <FieldLabel htmlFor={`scope-${scope}`} className="font-normal">
                            {labels[scope]}
                          </FieldLabel>
                        </Field>
                      ))}
                    </fieldset>
                  )}
                </form.Field>
                <form.Field name="expiry">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="credential-expiry">Expires after</FieldLabel>
                      <Select value={field.state.value} onValueChange={field.handleChange}>
                        <SelectTrigger id="credential-expiry" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="7">7 days</SelectItem>
                            <SelectItem value="30">30 days</SelectItem>
                            <SelectItem value="90">90 days</SelectItem>
                            <SelectItem value="365">1 year</SelectItem>
                            <SelectItem value="never">Never</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                {create.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{create.error.message}</AlertDescription>
                  </Alert>
                )}
                <form.Subscribe
                  selector={(state) => [state.values.name, state.values.scopes.length] as const}
                >
                  {([name, count]) => (
                    <Button
                      type="submit"
                      disabled={create.isPending || !name.trim() || count === 0}
                    >
                      {create.isPending ? "Creating…" : "Create credential"}
                    </Button>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </form>
          </aside>
        </TabsContent>
        <TabsContent value="account" className="p-6 md:p-8">
          <Account user={user} />
        </TabsContent>
        <TabsContent value="appearance" className="flex flex-col items-start gap-5 p-6 md:p-8">
          <h2 className="text-2xl">Appearance</h2>
          <p className="text-muted-foreground">
            Choose the light or dark palette for this browser.
          </p>
          <Appearance />
        </TabsContent>
        <TabsContent value="activity" className="flex flex-col gap-5 p-6 md:p-8">
          <h2 className="text-2xl">Activity history</h2>
          {activity.length === 0 && (
            <p className="text-muted-foreground">Changes will appear here.</p>
          )}
          {activity.map((entry) => (
            <details key={entry.id} className="rounded-sm border p-4">
              <summary className="cursor-pointer">
                <span className="font-medium">{entry.command.replaceAll("-", " ")}</span>
                <span className="ml-4 text-xs text-muted-foreground">{date(entry.createdAt)}</span>
              </summary>
              <dl className="mt-4 grid gap-2 text-xs">
                <dt className="text-muted-foreground">Actor</dt>
                <dd className="break-all font-mono">{entry.actorId}</dd>
                <dt className="text-muted-foreground">Record</dt>
                <dd className="break-all font-mono">{entry.entityId}</dd>
              </dl>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="eyebrow mb-2">Before</p>
                  <pre className="overflow-auto whitespace-pre-wrap break-words text-xs">
                    {entry.before}
                  </pre>
                </div>
                <div>
                  <p className="eyebrow mb-2">After</p>
                  <pre className="overflow-auto whitespace-pre-wrap break-words text-xs">
                    {entry.after}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </TabsContent>
      </Tabs>
      <Dialog
        open={secret !== null}
        onOpenChange={(open) => {
          if (!open) setSecret(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your agent secret</DialogTitle>
            <DialogDescription>
              Copy this secret now. River stores only its hash and cannot show it again.
            </DialogDescription>
          </DialogHeader>
          <code className="break-all rounded-sm border bg-muted p-4 text-xs">{secret}</code>
          <p className="text-xs text-muted-foreground">
            Use it as a Bearer token. Check the credential at{" "}
            <span className="font-mono">/api/v1/me</span>.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                if (secret) {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                }
              }}
            >
              {copied ? "Copied" : "Copy secret"}
            </Button>
            <Button onClick={() => setSecret(null)}>I saved the secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceShell>
  );
}
function Account({ user }: { user: { name: string; email: string } }) {
  const currentSession = authClient.useSession();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const result = await authClient.listSessions();
      if (result.error) throw Error(result.error.message ?? "Unable to load sessions.");
      return result.data;
    },
  });
  const revoke = useMutation({
    mutationFn: async () => {
      const result = await authClient.revokeOtherSessions();
      if (result.error) throw Error(result.error.message ?? "Unable to revoke sessions.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
  const revokeOne = useMutation({
    mutationFn: async (token: string) => {
      const result = await authClient.revokeSession({ token });
      if (result.error) throw Error(result.error.message ?? "Unable to revoke this session.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-2xl">Account & sessions</h2>
        <p className="mt-3 font-medium">{user.name}</p>
        <p className="mt-1 text-muted-foreground">{user.email}</p>
        <Badge variant="outline" className="mt-3 text-approved">
          <ShieldCheck /> Verified Owner
        </Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <h3 className="text-xl">Active sessions</h3>
        <Button variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
          Revoke other sessions
        </Button>
      </div>
      {(sessions.error || revoke.error || revokeOne.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {sessions.error?.message ?? revoke.error?.message ?? revokeOne.error?.message}
          </AlertDescription>
        </Alert>
      )}
      {sessions.isPending && <p role="status">Loading sessions…</p>}
      {sessions.data?.map((session) => (
        <article key={session.id} className="flex items-start gap-3 border-b pb-4">
          <Monitor className="mt-1 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            {session.id === currentSession.data?.session.id && (
              <Badge variant="outline" className="mb-2">
                This session
              </Badge>
            )}
            <p className="break-words text-[13px]">{session.userAgent || "Unknown browser"}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Created {new Date(session.createdAt).toLocaleString()} · Expires{" "}
              {new Date(session.expiresAt).toLocaleString()}
            </p>
          </div>
          {currentSession.data && session.id !== currentSession.data.session.id && (
            <Button
              variant="outline"
              size="sm"
              disabled={revokeOne.isPending}
              onClick={() => revokeOne.mutate(session.token)}
            >
              Revoke session
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}
