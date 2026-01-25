export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">
          SGC <span className="text-orange-500">Scribe</span>
        </h1>
        <p className="text-slate-400">Система транскрипции совещаний</p>
        <p className="text-slate-500 text-sm mt-8">Проект инициализирован. Следующий шаг: настройка Supabase.</p>
      </div>
    </div>
  );
}
