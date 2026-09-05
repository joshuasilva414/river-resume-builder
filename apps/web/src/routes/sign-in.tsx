import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Appearance } from "~/components/appearance";
import { Brand } from "~/components/brand";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { authClient } from "~/lib/auth-client";
import { getSession } from "~/server/functions";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: async () => {
    const data = await getSession();
    if (data.user) throw redirect({ to: "/" });
    return data;
  },
  component: SignIn,
});
function SignIn() {
  const { githubEnabled } = Route.useRouteContext();
  const [mode, setMode] = useState<"sign-in" | "create" | "recover">("sign-in");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setMessage(null);
      setError(false);
      try {
        const result =
          mode === "create"
            ? await authClient.signUp.email({ ...value, name: "Joshua", callbackURL: "/" })
            : mode === "recover"
              ? await authClient.requestPasswordReset({
                  email: value.email,
                  redirectTo: "/reset-password",
                })
              : await authClient.signIn.email(value);
        if (result.error) {
          setError(true);
          setMessage(result.error.message ?? "Unable to sign in. Please try again.");
          return;
        }
        if (mode === "sign-in") window.location.assign("/");
        else
          setMessage(
            mode === "create"
              ? "Check your email to verify your account."
              : "Check your email for a password reset link.",
          );
      } catch {
        setError(true);
        setMessage("Unable to reach River. Please try again.");
      }
    },
  });
  return (
    <main className="relative grid min-h-dvh bg-muted lg:grid-cols-[minmax(420px,1fr)_1.2fr]">
      <section className="relative flex flex-col bg-background px-7 py-7 sm:px-12 lg:px-20">
        <header className="flex items-center justify-between">
          <Brand />
          <Appearance />
        </header>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 py-12">
          <div className="flex flex-col gap-4">
            <p className="eyebrow">Personal workspace</p>
            <h1 className="font-editorial text-4xl leading-10">
              {mode === "create"
                ? "Make it your own."
                : mode === "recover"
                  ? "Find your way back."
                  : "Open your workspace."}
            </h1>
            <p className="text-[15px] leading-[21px] text-muted-foreground">
              Sign in to access your evidence, job targets, and résumé history.
            </p>
          </div>
          {githubEnabled && mode === "sign-in" && (
            <Button
              variant="outline"
              onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/" })}
            >
              Continue with GitHub
            </Button>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </Field>
                )}
              </form.Field>
              {mode !== "recover" && (
                <form.Field name="password">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        autoComplete={mode === "create" ? "new-password" : "current-password"}
                        minLength={12}
                        required
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      {mode === "create" && (
                        <FieldDescription>Use at least 12 characters.</FieldDescription>
                      )}
                    </Field>
                  )}
                </form.Field>
              )}
              {message && (
                <Alert variant={error ? "destructive" : "default"}>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(busy) => (
                  <Button type="submit" disabled={busy}>
                    {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                    {mode === "create"
                      ? "Create owner account"
                      : mode === "recover"
                        ? "Send reset link"
                        : "Sign in"}
                    {!busy && <ArrowRight data-icon="inline-end" />}
                  </Button>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
          <div className="flex justify-between gap-4">
            <Button
              size="sm"
              variant="link"
              onClick={() => {
                setMode(mode === "create" ? "sign-in" : "create");
                setMessage(null);
              }}
            >
              {mode === "create" ? "Back to sign in" : "First time here?"}
            </Button>
            <Button
              size="sm"
              variant="link"
              onClick={() => {
                setMode(mode === "recover" ? "sign-in" : "recover");
                setMessage(null);
              }}
            >
              {mode === "recover" ? "Back to sign in" : "Forgot password?"}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Access is limited to the workspace owner.
          </p>
        </div>
        <footer className="flex flex-col gap-3">
          <p className="eyebrow">Evidence → Content → Résumé</p>
          <p className="text-muted-foreground">Your words. Your decisions.</p>
        </footer>
      </section>
      <aside className="grain relative hidden flex-col justify-between border-l px-16 py-12 lg:flex">
        <p className="eyebrow">Your next chapter</p>
        <div className="flex flex-col gap-6">
          <h2 className="max-w-lg font-editorial text-6xl leading-[1.07]">
            Build from
            <br />
            your evidence.
          </h2>
          <p className="max-w-md text-lg leading-7 text-muted-foreground">
            A place for what you’ve done, what you’ve learned, and where you want to go next.
          </p>
          <div className="mt-8 h-px w-20 bg-primary" />
        </div>
        <p className="eyebrow">Private by design · Directed by you</p>
      </aside>
    </main>
  );
}
