import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { GuideSlug } from "./guides";

export const guideGroups = ["Tutorials", "How-to guides", "Reference", "Explanation"] as const;

export type Guide = {
  slug: string;
  title: string;
  description: string;
  group: (typeof guideGroups)[number];
  sections: readonly { id: string; title: string; body: ReactNode }[];
};

export function GuideLink({ slug, children }: { slug: GuideSlug; children: ReactNode }) {
  return (
    <Link to="/docs/$slug" params={{ slug }}>
      {children}
    </Link>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <aside className="my-6 border-l-2 border-primary bg-accent/50 px-5 py-4 text-sm leading-6">
      {children}
    </aside>
  );
}
