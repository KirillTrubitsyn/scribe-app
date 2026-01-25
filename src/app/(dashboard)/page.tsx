import { WaveformBars } from "@/components/ui/waveform";
import { FeatureCard, RecentList, DashboardClient } from "@/components/recordings";
import { createClient } from "@/lib/supabase/server";
import { Users, Brain, FileText } from "lucide-react";
import type { Recording } from "@/types/database";

async function getRecentRecordings(): Promise<Recording[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("recordings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      console.error("Error fetching recordings:", error);
      return [];
    }

    return (data as Recording[]) || [];
  } catch (error) {
    console.error("Error connecting to database:", error);
    return [];
  }
}

export default async function DashboardPage() {
  const recentRecordings = await getRecentRecordings();

  return (
    <div className="min-h-full">
      {/* Hero Section */}
      <div className="relative pt-8 pb-12 px-4 sm:px-6 lg:px-8">
        {/* Decorative Waveform */}
        <div className="absolute top-0 left-0 right-0 overflow-hidden opacity-30 pointer-events-none">
          <WaveformBars count={25} height="h-16" animated />
        </div>

        {/* Content */}
        <div className="relative max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Транскрипция
            </h1>
            <p className="text-slate-400 text-lg">
              Совещания &bull; Переговоры &bull; Судебные заседания
            </p>
          </div>

          {/* Main Action Cards */}
          <div className="mb-10">
            <DashboardClient />
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
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

          {/* Recent Recordings */}
          <div className="bg-slate-800/30 rounded-2xl border border-slate-800 p-6">
            <RecentList recordings={recentRecordings} />
          </div>
        </div>
      </div>
    </div>
  );
}
