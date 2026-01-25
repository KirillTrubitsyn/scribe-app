"use client";

import { cn } from "@/lib/utils";
import { Mic } from "lucide-react";

interface StartCardProps {
  onClick?: () => void;
  className?: string;
}

export function StartCard({ onClick, className }: StartCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-6",
        "hover:from-orange-600 hover:to-amber-600 transition-all duration-200",
        "flex flex-col items-center justify-center gap-4 min-h-[180px]",
        "group cursor-pointer shadow-lg shadow-orange-500/20",
        className
      )}
    >
      <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
        <Mic className="w-7 h-7 text-white" />
      </div>
      <div className="text-center">
        <h3 className="text-white font-semibold text-lg mb-1">Начать запись</h3>
        <p className="text-white/80 text-sm">Запись в реальном времени</p>
      </div>
    </button>
  );
}
