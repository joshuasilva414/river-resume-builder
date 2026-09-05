import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Brand } from "~/components/brand";
import { Button } from "~/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { authClient } from "~/lib/auth-client";
export const Route = createFileRoute("/reset-password")({ component: ResetPassword });
function ResetPassword() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-8 py-20">
      <Brand />
      <h1 className="page-heading">Set a new password</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const password = new FormData(event.currentTarget).get("password");
          const token = new URL(window.location.href).searchParams.get("token");
          if (typeof password !== "string" || !token) {
            setMessage("This reset link is invalid. Request another from sign in.");
            setBusy(false);
            return;
          }
          try {
            const result = await authClient.resetPassword({ newPassword: password, token });
            setMessage(result.error?.message ?? "Password updated. You can now sign in.");
          } catch {
            setMessage("Unable to update your password. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              name="password"
              id="password"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </Field>
          <Button disabled={busy}>Update password</Button>
          <p role="status">{message}</p>
          <a href="/sign-in" className="text-primary underline">
            Return to sign in
          </a>
        </FieldGroup>
      </form>
    </main>
  );
}
