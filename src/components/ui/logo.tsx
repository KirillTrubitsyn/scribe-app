import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Logo({ size = "md", className }: LogoProps) {
  const sizes = {
    sm: { icon: 32, text: "text-lg" },
    md: { icon: 40, text: "text-xl" },
    lg: { icon: 48, text: "text-2xl" },
  };

  const { icon, text } = sizes[size];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg width={icon} height={icon} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="12" fill="url(#logoGrad)" />
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
        </defs>
        <path
          d="M20 10v20M15 14v12M25 14v12M10 17v6M30 17v6"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className={cn("font-semibold text-white", text)}>
        SGC <span className="text-orange-400">Scribe</span>
      </span>
    </div>
  );
}
