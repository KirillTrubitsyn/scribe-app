"use client";

import { cn } from "@/lib/utils";

interface AudioSpinnerProps {
  className?: string;
  barCount?: number;
  size?: "sm" | "md" | "lg";
}

/**
 * Animated audio equalizer spinner for transcription processes
 */
export function AudioSpinner({
  className,
  barCount = 5,
  size = "lg",
}: AudioSpinnerProps) {
  const sizeClasses = {
    sm: "h-8 gap-0.5",
    md: "h-12 gap-1",
    lg: "h-16 gap-1.5",
  };

  const barWidths = {
    sm: "w-1",
    md: "w-1.5",
    lg: "w-2",
  };

  // Animation delays for each bar to create wave effect
  const delays = [0, 0.15, 0.3, 0.15, 0];

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        sizeClasses[size],
        className
      )}
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full bg-gradient-to-t from-orange-500 to-amber-400 animate-equalizer",
            barWidths[size]
          )}
          style={{
            animationDelay: `${delays[i % delays.length]}s`,
          }}
        />
      ))}
    </div>
  );
}

interface TranscriptionSpinnerProps {
  className?: string;
}

/**
 * Combined spinner showing audio-to-text transformation
 */
export function TranscriptionSpinner({ className }: TranscriptionSpinnerProps) {
  return (
    <div className={cn("relative w-28 h-28", className)}>
      {/* Outer rotating ring */}
      <div className="absolute inset-0 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />

      {/* Middle pulsing ring */}
      <div className="absolute inset-2 rounded-full border border-amber-400/20 animate-pulse" />

      {/* Inner content - equalizer */}
      <div className="absolute inset-4 rounded-full bg-slate-800/80 flex items-center justify-center">
        <AudioSpinner size="md" barCount={5} />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-orange-400 animate-particle"
            style={{
              top: "50%",
              left: "50%",
              animationDuration: `${2 + i * 0.5}s`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
