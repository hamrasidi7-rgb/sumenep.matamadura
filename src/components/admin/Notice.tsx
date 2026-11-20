import { CircleAlert, CircleCheck } from "lucide-react";

/** Status or error box. Errors are announced immediately (role="alert"). */
export function Notice({ tone, children, id }: { tone: "error" | "success" | "info"; children: React.ReactNode; id?: string }) {
  const styles = {
    error: "border-brand/30 bg-blush text-brand-deep",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    info: "border-line bg-paper text-ink",
  }[tone];
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      id={id}
      data-notice={tone}
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm leading-relaxed ${styles}`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
      <div>{children}</div>
    </div>
  );
}
