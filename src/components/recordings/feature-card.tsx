import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({ icon, title, description, className }: FeatureCardProps) {
  return (
    <div
      className={cn(
        "bg-slate-800/50 border border-slate-700/50 rounded-xl p-5",
        "hover:bg-slate-800/70 hover:border-slate-600/50 transition-all duration-200",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center text-orange-400">
          {icon}
        </div>
        <div>
          <h3 className="text-white font-medium mb-1">{title}</h3>
          <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
