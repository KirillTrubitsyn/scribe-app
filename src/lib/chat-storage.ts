/**
 * Chat storage utilities for managing chat sessions in localStorage
 * Adapted from sgc-legal-ai project for local storage
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  recordingId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY_PREFIX = "scribe_chat_";
const MAX_CHATS_PER_RECORDING = 20;

// Generate unique ID
function generateId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Get storage key for a recording
function getStorageKey(recordingId: string): string {
  return `${STORAGE_KEY_PREFIX}${recordingId}`;
}

// Get all chat sessions for a recording
export function getChatSessions(recordingId: string): ChatSession[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(getStorageKey(recordingId));
    if (!stored) return [];
    const sessions = JSON.parse(stored) as ChatSession[];
    // Sort by updatedAt descending (most recent first)
    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

// Get a specific chat session
export function getChatSession(recordingId: string, chatId: string): ChatSession | null {
  const sessions = getChatSessions(recordingId);
  return sessions.find(s => s.id === chatId) || null;
}

// Save chat sessions to localStorage
function saveChatSessions(recordingId: string, sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(getStorageKey(recordingId), JSON.stringify(sessions));
  } catch (err) {
    console.error("Failed to save chat sessions:", err);
  }
}

// Create a new chat session
export function createChatSession(recordingId: string): ChatSession {
  const sessions = getChatSessions(recordingId);

  const newSession: ChatSession = {
    id: generateId(),
    recordingId,
    title: "Новый чат",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Add new session at the beginning
  sessions.unshift(newSession);

  // Limit the number of chats
  if (sessions.length > MAX_CHATS_PER_RECORDING) {
    sessions.splice(MAX_CHATS_PER_RECORDING);
  }

  saveChatSessions(recordingId, sessions);
  return newSession;
}

// Update a chat session
export function updateChatSession(
  recordingId: string,
  chatId: string,
  messages: ChatMessage[],
  title?: string
): ChatSession | null {
  const sessions = getChatSessions(recordingId);
  const index = sessions.findIndex(s => s.id === chatId);

  if (index === -1) return null;

  const session = sessions[index];
  session.messages = messages;
  session.updatedAt = new Date().toISOString();

  // Auto-generate title from first user message if title is default
  if (title) {
    session.title = title;
  } else if (session.title === "Новый чат" && messages.length > 0) {
    const firstUserMessage = messages.find(m => m.role === "user");
    if (firstUserMessage) {
      // Take first 50 chars of the message as title
      session.title = firstUserMessage.content.slice(0, 50) +
        (firstUserMessage.content.length > 50 ? "..." : "");
    }
  }

  // Move updated session to the beginning
  sessions.splice(index, 1);
  sessions.unshift(session);

  saveChatSessions(recordingId, sessions);
  return session;
}

// Rename a chat session
export function renameChatSession(
  recordingId: string,
  chatId: string,
  newTitle: string
): boolean {
  const sessions = getChatSessions(recordingId);
  const session = sessions.find(s => s.id === chatId);

  if (!session) return false;

  session.title = newTitle;
  session.updatedAt = new Date().toISOString();

  saveChatSessions(recordingId, sessions);
  return true;
}

// Delete a chat session
export function deleteChatSession(recordingId: string, chatId: string): boolean {
  const sessions = getChatSessions(recordingId);
  const index = sessions.findIndex(s => s.id === chatId);

  if (index === -1) return false;

  sessions.splice(index, 1);
  saveChatSessions(recordingId, sessions);
  return true;
}

// Delete all chat sessions for a recording
export function deleteAllChatSessions(recordingId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getStorageKey(recordingId));
}

// Get or create current chat session
// Returns existing non-empty chat or creates a new one
export function getOrCreateCurrentChat(recordingId: string): ChatSession {
  const sessions = getChatSessions(recordingId);

  // Find the most recent chat that has messages (non-empty)
  const recentWithMessages = sessions.find(s => s.messages.length > 0);
  if (recentWithMessages) {
    return recentWithMessages;
  }

  // Find any existing empty "Новый чат" session
  const emptyNewChat = sessions.find(s => s.title === "Новый чат" && s.messages.length === 0);
  if (emptyNewChat) {
    return emptyNewChat;
  }

  // Create new session
  return createChatSession(recordingId);
}
