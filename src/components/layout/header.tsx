"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Главная", href: "/" },
  { name: "Записи", href: "/recordings" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="px-6 py-4 border-b border-slate-800">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>

        <nav className="flex items-center gap-1">
          {navigation.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {item.name}
              </Link>
            );
          })}

          <div className="w-px h-6 bg-slate-700 mx-3" />

          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-sm font-medium">
            КТ
          </div>
        </nav>
      </div>
    </header>
  );
}
