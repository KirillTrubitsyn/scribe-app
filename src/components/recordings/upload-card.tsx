"use client";

import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";

interface UploadCardProps {
  onClick?: () => void;
  className?: string;
}

export function UploadCard({ onClick, className }: UploadCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-6",
        "hover:bg-slate-800 hover:border-slate-600 transition-all duration-200",
        "flex flex-col items-center justify-center gap-4 min-h-[180px]",
        "group cursor-pointer",
        className
      )}
    >
      <div className="w-14 h-14 rounded-xl bg-slate-700/50 group-hover:bg-slate-700 flex items-center justify-center transition-colors">
        <Upload className="w-7 h-7 text-slate-400 group-hover:text-white transition-colors" />
      </div>
      <div className="text-center">
        <h3 className="text-white font-semibold text-lg mb-1">Загрузить аудио</h3>
        <p className="text-slate-400 text-sm">MP3, WAV, M4A до 500 МБ</p>
      </div>
    </button>
  );
}
