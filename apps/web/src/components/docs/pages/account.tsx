import { type Guide, GuideLink } from "../shared";

export const account = {
  slug: "account",
  title: "Access your workspace",
  description: "Create an account with your invited email address or recover an existing account.",
  group: "How-to guides",
  sections: [
    {
      id: "create-account",
      title: "Create an account",
      body: (
        <>
          <p>
            Before you start, ask the person who shared River with you to enable your email address.
          </p>
          <p>To create your account, follow these steps.</p>
          <ol>
            <li>Open the River sign-in page.</li>
            <li>
              Select <strong>First time here?</strong>.
            </li>
            <li>Enter your name, invited email address, and password in the account form.</li>
            <li>
              Select <strong>Create account</strong>.
            </li>
            <li>Open the verification email.</li>
            <li>Follow the verification link.</li>
            <li>Sign in with your email address and password.</li>
          </ol>
        </>
      ),
    },
    {
      id: "sign-in",
      title: "Sign in to an existing account",
      body: (
        <>
          <p>Use the credentials for your River account.</p>
          <ol>
            <li>Enter your email address and password on the sign-in page.</li>
            <li>
              Select <strong>Sign in</strong>.
            </li>
          </ol>
          <p>
            If you use GitHub authentication and the option appears, select{" "}
            <strong>Continue with GitHub</strong> instead.
          </p>
        </>
      ),
    },
    {
      id: "recover-access",
      title: "Reset your password",
      body: (
        <>
          <p>
            A completed password reset signs out your existing sessions. To reset the password,
            follow these steps.
          </p>
          <ol>
            <li>
              On the sign-in page, select <strong>Forgot password?</strong>.
            </li>
            <li>Enter your account email address.</li>
            <li>
              Select <strong>Send reset link</strong>.
            </li>
            <li>Open the reset email.</li>
            <li>Follow the link to set a new password.</li>
            <li>Sign in again.</li>
          </ol>
          <p>
            If the email does not arrive, check your spam folder. Confirm the invited address with
            the person who gave you access.
          </p>
        </>
      ),
    },
    {
      id: "usage",
      title: "Check task usage",
      body: (
        <>
          <p>
            To check your remaining processing allowance, open{" "}
            <strong>Settings → Account &amp; sessions</strong>.
          </p>
          <p>
            For the limits and reset rules, see{" "}
            <GuideLink slug="workspace-reference">Workspace access and limits</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
