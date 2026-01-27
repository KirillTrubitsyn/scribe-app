import { WaveformBars } from "@/components/ui/waveform";
import { FeatureCard, DashboardClient } from "@/components/recordings";
import { Users, Brain, FileText } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto w-full">
        {/* Waveform Animation - above title */}
        <div className="flex justify-center mb-4">
          <WaveformBars count={25} height="h-20" animated />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Транскрипция
          </h1>
          <p className="text-slate-400 text-lg">
            Совещания &bull; Переговоры &bull; Судебные заседания
          </p>
        </div>

        {/* Main Action Cards */}
        <div className="mb-8">
          <DashboardClient />
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard
            icon={<Users className="w-5 h-5" />}
            title="Спикеры"
            description="Автоматическое определение и разделение голосов участников"
          />
          <FeatureCard
            icon={<Brain className="w-5 h-5" />}
            title="AI-анализ"
            description="Выделение ключевых тем, решений и задач"
          />
          <FeatureCard
            icon={<FileText className="w-5 h-5" />}
            title="Протокол"
            description="Готовый документ с итогами встречи"
          />
        </div>
      </div>
    </div>
  );
}
