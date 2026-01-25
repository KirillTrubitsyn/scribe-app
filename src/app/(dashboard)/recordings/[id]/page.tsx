export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-4">Запись #{id}</h1>
      <p className="text-slate-400">Детали записи совещания</p>
    </div>
  );
}
