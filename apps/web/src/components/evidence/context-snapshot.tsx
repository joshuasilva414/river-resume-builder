import type { ContextData } from "@river/domain";

export function ContextSnapshot({ data, revisionId }: { data: ContextData; revisionId: string }) {
  return (
    <details className="rounded-sm border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {data.kind} · {data.label}
      </summary>
      <div className="mt-3 space-y-2 whitespace-pre-wrap break-words">
        <p>
          {[data.organization, data.role, data.startDate, data.endDate].filter(Boolean).join(" · ")}
        </p>
        <p>{data.details}</p>
        {data.contact && (
          <p>
            {[data.contact.email, data.contact.phone, data.contact.location, ...data.contact.links]
              .filter(Boolean)
              .join("\n")}
          </p>
        )}
        <p className="break-all font-mono text-xs">{revisionId}</p>
      </div>
    </details>
  );
}
