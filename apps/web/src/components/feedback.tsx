import {
  type FeedbackKind,
  type FeedbackStatus,
  feedbackKinds,
  feedbackStatuses,
} from "@river/contracts";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { FeedbackForm, type FeedbackReport, FeedbackUpdate } from "~/components/feedback-forms";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getFeedback } from "~/server/feedback-functions";

const selectClass = "h-10 rounded-sm border bg-background px-3 text-sm";
export function Feedback({ user }: { user: { id: string; isAdmin: boolean } }) {
  const [inbox, setInbox] = useState(false);
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FeedbackReport | null>(null);
  const [message, setMessage] = useState("");
  const reports = useQuery({
    queryKey: ["feedback", user.id, inbox, kind, status, offset],
    queryFn: async () => {
      const result = await getFeedback({ data: { inbox, kind, status, offset } });
      if (!result.ok) throw Error(result.error.title);
      return result.value;
    },
  });
  return (
    <div className="flex max-w-6xl flex-col gap-7 px-6 pt-8 pb-12 lg:gap-10 lg:px-12 lg:py-11">
      <div className="flex max-w-185 flex-col gap-3.5">
        <p className="eyebrow">Help improve River</p>
        <h1 className="text-[40px] leading-11">Feedback</h1>
        <p className="text-base leading-6 text-muted-foreground">
          Report a problem or suggest an improvement. Track updates from the River administrator
          here.
        </p>
      </div>
      {message && (
        <p role="status" className="text-approved">
          {message}
        </p>
      )}
      <Tabs
        value={inbox ? "inbox" : "mine"}
        onValueChange={(value) => {
          setInbox(value === "inbox" && user.isAdmin);
          setOffset(0);
          setMessage("");
        }}
      >
        <div className="flex flex-col-reverse gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList variant="line" className="max-w-full">
            <TabsTrigger value="mine">Your feedback</TabsTrigger>
            {user.isAdmin && <TabsTrigger value="inbox">Administrator inbox</TabsTrigger>}
          </TabsList>
          <Button
            className="h-11"
            onClick={() => {
              setMessage("");
              setCreating(true);
            }}
          >
            <Plus aria-hidden="true" /> New feedback
          </Button>
        </div>
        <TabsContent value={inbox ? "inbox" : "mine"} className="mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              Type
              <select
                className={selectClass}
                value={kind ?? "all"}
                onChange={(event) => {
                  setKind(feedbackKinds.find((value) => value === event.target.value) ?? null);
                  setOffset(0);
                }}
              >
                <option value="all">All types</option>
                {feedbackKinds.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Status
              <select
                className={selectClass}
                value={status ?? "all"}
                onChange={(event) => {
                  setStatus(feedbackStatuses.find((value) => value === event.target.value) ?? null);
                  setOffset(0);
                }}
              >
                <option value="all">All statuses</option>
                {feedbackStatuses.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              className="h-10"
              disabled={reports.isFetching}
              onClick={() => void reports.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Refresh
            </Button>
          </div>
          {reports.isPending && (
            <p role="status" className="py-8">
              Loading feedback…
            </p>
          )}
          {reports.error && (
            <Alert variant="destructive" className="mt-5">
              <AlertDescription>{reports.error.message}</AlertDescription>
            </Alert>
          )}
          {reports.data?.items.length === 0 && (
            <div className="border-b py-10">
              <h2 className="text-2xl">
                {kind || status || offset
                  ? "No matching feedback"
                  : inbox
                    ? "The inbox is empty"
                    : "No feedback yet"}
              </h2>
              <p className="mt-3 text-muted-foreground">
                {kind || status || offset
                  ? "Change the filters or return to the first page."
                  : inbox
                    ? "Reports from River accounts will appear here."
                    : "Submit a bug report or feature request to send feedback to the River administrator."}
              </p>
            </div>
          )}
          {reports.data?.items.map((report) => (
            <details key={report.id} className="group border-b py-6">
              <summary className="flex cursor-pointer list-none items-start gap-4 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-sans text-[17px] leading-6 font-semibold">
                    {report.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <span>
                      {report.kind} · {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                    <Badge variant="outline">{report.status}</Badge>
                  </div>
                  {inbox && (
                    <p className="mt-1 break-words text-[13px] text-muted-foreground">
                      {report.reporterName} · {report.reporterEmail}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className="mt-1 size-4 shrink-0 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="mt-5 flex max-w-190 flex-col gap-5">
                <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                  {report.description}
                </p>
                {report.response && (
                  <div className="border-l-2 border-primary pl-4">
                    <h3 className="font-sans text-[13px] font-semibold">Administrator response</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5.5 text-muted-foreground">
                      {report.response}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(report.updatedAt).toLocaleString()}
                </p>
                {inbox &&
                  (editing?.id === report.id ? (
                    <FeedbackUpdate
                      report={editing}
                      onClose={() => setEditing(null)}
                      onSuccess={() => {
                        setEditing(null);
                        setMessage("Feedback updated.");
                      }}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="self-start"
                      onClick={() => setEditing(report)}
                    >
                      Update status
                    </Button>
                  ))}
              </div>
            </details>
          ))}
          {(offset > 0 || reports.data?.hasMore) && (
            <div className="mt-6 flex items-center gap-3">
              <Button
                variant="outline"
                disabled={offset === 0 || reports.isFetching}
                onClick={() => setOffset((value) => Math.max(0, value - 20))}
              >
                Previous
              </Button>
              <span className="text-sm">Page {offset / 20 + 1}</span>
              <Button
                variant="outline"
                disabled={!reports.data?.hasMore || reports.isFetching}
                onClick={() => setOffset((value) => value + 20)}
              >
                Next
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <p className="text-sm leading-5.5 text-muted-foreground">
        Your feedback is visible to you and the River administrator. No résumé content or
        diagnostics are attached automatically.
      </p>
      <FeedbackForm
        open={creating}
        onOpenChange={setCreating}
        onSuccess={() => {
          setCreating(false);
          setInbox(false);
          setKind(null);
          setStatus(null);
          setOffset(0);
          setMessage("Feedback submitted. You can track updates under Your feedback.");
        }}
      />
    </div>
  );
}
