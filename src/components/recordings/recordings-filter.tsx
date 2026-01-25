"use client";

import { cn } from "@/lib/utils";

export type FilterValue = "all" | "ready" | "processing";

interface RecordingsFilterProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  className?: string;
}

const filters: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "ready", label: "Готовые" },
  { value: "processing", label: "В работе" },
];

export function RecordingsFilter({
  value,
  onChange,
  className,
}: RecordingsFilterProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-lg bg-slate-800/50 border border-slate-700/50",
        className
      )}
    >
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onChange(filter.value)}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all",
            value === filter.value
              ? "bg-slate-700 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-700/50"
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
