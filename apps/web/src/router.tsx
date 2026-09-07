import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { routeTree } from "./routeTree.gen";

// The Worker replaces this internal header with a fresh nonce for each request.
const requestNonce = createIsomorphicFn()
  .server(() => getRequestHeader("x-river-csp-nonce"))
  .client(() => document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce);

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
  });
  const router = createRouter({
    routeTree,
    ssr: { nonce: requestNonce() },
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return router;
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
