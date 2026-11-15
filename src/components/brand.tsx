import { cn } from "@/lib/utils";
export function Brand({ className, small = false }: { className?: string; small?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid place-items-center rounded-[11px] bg-primary text-white",
          small ? "size-8" : "size-9",
        )}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6.2 6.2a3.3 3.3 0 0 1 4.7 0l1.1 1.1 1.1-1.1a3.3 3.3 0 1 1 4.7 4.7L12 16.7l-5.8-5.8a3.3 3.3 0 0 1 0-4.7Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M8 17.7h8M12 15v6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className={cn("font-bold tracking-[-.8px]", small ? "text-xl" : "text-[23px]")}>
        Care<span className="text-primary">Relay</span>
        <span className="ml-0.5 align-top text-xs font-medium text-primary">®</span>
      </span>
    </div>
  );
}
