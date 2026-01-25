"use client";

import { useState } from "react";
import { StartCard } from "./start-card";
import { UploadCard } from "./upload-card";
import { UploadModal } from "./upload-modal";
import { RecordingModal } from "./recording-modal";

export function DashboardClient() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StartCard onClick={() => setIsRecordingModalOpen(true)} />
        <UploadCard onClick={() => setIsUploadModalOpen(true)} />
      </div>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />

      <RecordingModal
        isOpen={isRecordingModalOpen}
        onClose={() => setIsRecordingModalOpen(false)}
      />
    </>
  );
}
