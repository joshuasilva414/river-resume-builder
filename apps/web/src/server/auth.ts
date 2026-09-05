import { createDatabase, createRepository, schema } from "@river/db";
import { fingerprint, type Principal } from "@river/domain";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { Env } from "./env";

type AuthMail = { to: string; subject: string; text: string };

/** Request-scoped auth avoids retaining one request's Cloudflare bindings in another. */
export function createAuth(env: Env, deliver?: (message: AuthMail) => Promise<void>) {
  const ownerEmail = env.OWNER_EMAIL.toLowerCase().trim();
  const send = async (message: AuthMail) => {
    if (message.to.toLowerCase() !== ownerEmail) throw new APIError("FORBIDDEN");
    if (deliver) return deliver(message);
    if (
      env.ENVIRONMENT === "development" &&
      ["localhost", "127.0.0.1"].includes(new URL(env.APP_URL).hostname)
    ) {
      await env.ARTIFACTS.put("development/auth/latest.json", JSON.stringify(message), {
        httpMetadata: { contentType: "application/json" },
      });
      return;
    }
    if (!env.EMAIL)
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "Authentication email is not configured.",
      });
    await env.EMAIL.send({ ...message, from: env.EMAIL_FROM });
  };

  return betterAuth({
    appName: "River",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(createDatabase(env.DB), {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        send({
          to: user.email,
          subject: "Reset your River password",
          text: `Reset your password using this link:\n${url}\n\nIf you did not request this, you can ignore this email.`,
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send({
          to: user.email,
          subject: "Verify your River account",
          text: `Verify your email to open your private River workspace:\n${url}`,
        }),
    },
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
          }
        : {},
    session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: false } },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (user.email.toLowerCase() !== ownerEmail)
              throw new APIError("FORBIDDEN", { message: "This workspace is private." });
            return { data: user };
          },
        },
      },
    },
    // Authentication mutations use /api/auth, whose responses carry Set-Cookie directly.
  });
}

export async function authenticate(env: Env, headers: Headers) {
  const session = await createAuth(env).api.getSession({ headers });
  if (
    !session?.user.emailVerified ||
    session.user.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()
  )
    return null;
  return session;
}

/** Agent secrets are independent of Owner sessions and are checked against live lifecycle state. */
export async function authenticatePrincipal(env: Env, headers: Headers): Promise<Principal | null> {
  const authorization = headers.get("authorization");
  if (authorization) {
    const match = /^Bearer river_([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(authorization);
    if (!match?.[1] || !match[2]) return null;
    const repository = createRepository(env.DB);
    const credential = await repository.getCredential(match[1]);
    if (
      !credential ||
      credential.revokedAt !== null ||
      (credential.expiresAt !== null && credential.expiresAt <= Date.now())
    )
      return null;
    const digest = await fingerprint(match[2]);
    let difference = digest.length ^ credential.secretHash.length;
    for (let index = 0; index < digest.length; index++)
      difference |= digest.charCodeAt(index) ^ credential.secretHash.charCodeAt(index);
    if (difference !== 0) return null;
    const owner = (
      await repository.db
        .select({ email: schema.user.email, verified: schema.user.emailVerified })
        .from(schema.user)
        .where(eq(schema.user.id, credential.ownerId))
        .limit(1)
    )[0];
    if (!owner?.verified || owner.email.toLowerCase() !== env.OWNER_EMAIL.trim().toLowerCase())
      return null;
    await repository.credentialUsed(credential.id);
    return {
      kind: "agent",
      id: credential.id,
      ownerId: credential.ownerId,
      scopes: credential.scopes,
    };
  }
  const session = await authenticate(env, headers);
  return session ? { kind: "owner", id: session.user.id, ownerId: session.user.id } : null;
}
