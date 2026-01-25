export type RecordingStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";

export interface Recording {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  file_url: string;
  file_size: number;
  duration: number;
  status: RecordingStatus;
  transcription?: string;
  summary?: string;
  action_items?: ActionItem[];
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  deadline?: string;
  completed: boolean;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      recordings: {
        Row: Recording;
        Insert: Omit<Recording, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Recording, "id" | "created_at">>;
      };
      users: {
        Row: User;
        Insert: Omit<User, "id" | "created_at">;
        Update: Partial<Omit<User, "id" | "created_at">>;
      };
    };
  };
}
