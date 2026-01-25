import { createClient } from "@/lib/supabase/server";
import { RecordingsPageClient } from "@/components/recordings/recordings-page-client";
import type { RecordingWithRelations } from "@/components/recordings/recordings-table";

async function getRecordings(): Promise<RecordingWithRelations[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recordings")
    .select("*, transcripts(word_count), speakers(count)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching recordings:", error);
    return [];
  }

  return (data as RecordingWithRelations[]) || [];
}

export default async function RecordingsPage() {
  const recordings = await getRecordings();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RecordingsPageClient recordings={recordings} />
    </div>
  );
}
