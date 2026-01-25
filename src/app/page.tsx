import { Logo } from "@/components/ui/logo";
import { WaveformBars } from "@/components/ui/waveform";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <p className="text-slate-400 mb-8">Система транскрипции совещаний</p>
        <WaveformBars count={25} height="h-20" className="mb-8" />
        <p className="text-slate-500 text-sm">Проект инициализирован. Следующий шаг: настройка Supabase.</p>
      </div>
    </div>
  );
}
