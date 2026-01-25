"use client";

import { cn } from "@/lib/utils";

interface WaveformBarsProps {
  count?: number;
  animated?: boolean;
  height?: string;
  color?: string;
  className?: string;
}

export function WaveformBars({
  count = 20,
  animated = false,
  height = "h-24",
  color = "from-orange-500 to-amber-400",
  className,
}: WaveformBarsProps) {
  const heights = [40, 60, 35, 80, 50, 90, 45, 70, 55, 85, 40, 75, 50, 65, 45, 80, 55, 70, 40, 60, 45, 75, 55, 85, 50];

  return (
    <div className={cn("flex justify-center items-end gap-1", height, className)}>
      {heights.slice(0, count).map((h, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 rounded-full bg-gradient-to-t",
            color,
            animated && "animate-pulse"
          )}
          style={{
            height: `${h}%`,
            animationDelay: animated ? `${i * 0.05}s` : "0s",
            opacity: animated ? 1 : 0.6,
          }}
        />
      ))}
    </div>
  );
}
