"use client";

import { useState } from "react";
import { StartCard } from "./start-card";
import { UploadCard } from "./upload-card";
import { UploadModal } from "./upload-modal";

export function DashboardClient() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleStartRecording = () => {
    // TODO: Implement live recording
    alert("Функция записи в реальном времени скоро будет доступна!");
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StartCard onClick={handleStartRecording} />
        <UploadCard onClick={() => setIsUploadModalOpen(true)} />
      </div>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </>
  );
}
