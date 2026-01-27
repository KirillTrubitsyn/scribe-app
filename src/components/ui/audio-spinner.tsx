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
            "rounded-full bg-gradient-to-t from-orange-500 to-amber-400",
            barWidths[size]
          )}
          style={{
            animation: `equalizer 1s ease-in-out infinite`,
            animationDelay: `${delays[i % delays.length]}s`,
            height: "40%",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes equalizer {
          0%,
          100% {
            height: 20%;
          }
          50% {
            height: 100%;
          }
        }
      `}</style>
    </div>
  );
}

interface WaveformSpinnerProps {
  className?: string;
}

/**
 * Animated waveform spinner - sound wave being processed
 */
export function WaveformSpinner({ className }: WaveformSpinnerProps) {
  return (
    <div className={cn("relative w-24 h-24", className)}>
      {/* Background glow */}
      <div className="absolute inset-0 rounded-full bg-orange-500/10" />

      {/* Pulsing border */}
      <div className="absolute inset-0 rounded-full border-2 border-orange-500/20 animate-pulse" />

      {/* Waveform container */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          viewBox="0 0 100 50"
          className="w-16 h-8"
          preserveAspectRatio="none"
        >
          <path
            d="M0,25 Q10,10 20,25 T40,25 T60,25 T80,25 T100,25"
            fill="none"
            stroke="url(#waveGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            className="animate-wave"
          />
          <defs>
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <style jsx>{`
        @keyframes wave {
          0% {
            d: path("M0,25 Q10,10 20,25 T40,25 T60,25 T80,25 T100,25");
          }
          25% {
            d: path("M0,25 Q10,35 20,25 T40,25 T60,25 T80,25 T100,25");
          }
          50% {
            d: path("M0,25 Q10,25 20,15 T40,35 T60,15 T80,35 T100,25");
          }
          75% {
            d: path("M0,25 Q10,15 20,30 T40,20 T60,30 T80,20 T100,25");
          }
          100% {
            d: path("M0,25 Q10,10 20,25 T40,25 T60,25 T80,25 T100,25");
          }
        }
        .animate-wave {
          animation: wave 2s ease-in-out infinite;
        }
      `}</style>
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
            className="absolute w-1.5 h-1.5 rounded-full bg-orange-400"
            style={{
              top: "50%",
              left: "50%",
              animation: `particle ${2 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes particle {
          0%, 100% {
            transform: translate(-50%, -50%) rotate(0deg) translateX(40px) scale(0);
            opacity: 0;
          }
          50% {
            transform: translate(-50%, -50%) rotate(180deg) translateX(40px) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
