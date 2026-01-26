"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RecordingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Recordings error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-md">
        <AlertTriangle className="w-14 h-14 text-red-500 mx-auto mb-5" />
        <h1 className="text-xl font-semibold text-white mb-3">
          Ошибка загрузки записей
        </h1>
        <p className="text-slate-400 mb-5">
          Не удалось загрузить данные записи. Пожалуйста, попробуйте ещё раз.
        </p>
        {error.message && (
          <details className="mb-5 text-left">
            <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-400">
              Подробности
            </summary>
            <pre className="mt-2 p-3 bg-slate-800 rounded text-xs text-red-400 overflow-auto max-h-32">
              {error.message}
            </pre>
          </details>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>
          <Link
            href="/recordings"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            К списку записей
          </Link>
        </div>
      </div>
    </div>
  );
}
