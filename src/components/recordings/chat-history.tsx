"use client";

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Check,
  History,
  Plus,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChatSession,
  getChatSessions,
  renameChatSession,
  deleteChatSession,
  deleteAllChatSessions,
} from "@/lib/chat-storage";

interface ChatHistoryProps {
  recordingId: string;
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  refreshTrigger?: number; // Increment to trigger refresh
}

export function ChatHistory({
  recordingId,
  currentChatId,
  onSelectChat,
  onNewChat,
  refreshTrigger = 0,
}: ChatHistoryProps) {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load chats
  const loadChats = () => {
    const sessions = getChatSessions(recordingId);
    // Filter out empty chats with default title for display
    const filteredChats = sessions.filter(
      (chat) => chat.title !== "Новый чат" || chat.messages.length > 0
    );
    setChats(filteredChats);
  };

  useEffect(() => {
    loadChats();
  }, [recordingId, refreshTrigger]);

  useEffect(() => {
    if (editingChatId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingChatId]);

  const handleRename = (chatId: string) => {
    if (!editTitle.trim()) {
      setEditingChatId(null);
      return;
    }

    renameChatSession(recordingId, chatId, editTitle.trim());
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, title: editTitle.trim() } : chat
      )
    );
    setEditingChatId(null);
  };

  const handleDelete = (chatId: string) => {
    deleteChatSession(recordingId, chatId);
    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    setShowDeleteConfirm(null);

    if (chatId === currentChatId) {
      onNewChat();
    }
  };

  const handleClearAll = () => {
    deleteAllChatSessions(recordingId);
    setChats([]);
    setShowClearConfirm(false);
    onNewChat();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Вчера";
    } else if (diffDays < 7) {
      return date.toLocaleDateString("ru-RU", { weekday: "short" });
    } else {
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  if (chats.length === 0) {
    return (
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-orange-500" />
          <span className="font-medium text-white text-sm">История чатов</span>
        </div>
        <div className="text-center py-4">
          <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Нет сохранённых чатов</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-orange-500" />
            <span className="font-medium text-white text-sm">История чатов</span>
          </div>
          <button
            onClick={onNewChat}
            className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Новый чат"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {/* Counter */}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                chats.length >= 20 ? "bg-red-500" : "bg-orange-500"
              )}
              style={{ width: `${(chats.length / 20) * 100}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">{chats.length}/20</span>
        </div>
      </div>

      {/* Chat List */}
      <div className="max-h-[300px] overflow-y-auto p-2">
        <div className="space-y-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group relative rounded-lg transition-all",
                chat.id === currentChatId
                  ? "bg-orange-500/20 border border-orange-500/30"
                  : "hover:bg-slate-700/50"
              )}
            >
              {editingChatId === chat.id ? (
                <div className="flex items-center gap-1 p-2">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(chat.id);
                      if (e.key === "Escape") setEditingChatId(null);
                    }}
                    className="flex-1 bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={() => handleRename(chat.id)}
                    className="p-1 text-green-400 hover:text-green-300"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditingChatId(null)}
                    className="p-1 text-slate-400 hover:text-slate-300"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : showDeleteConfirm === chat.id ? (
                <div className="p-2">
                  <p className="text-xs text-slate-300 mb-2">Удалить этот чат?</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(chat.id)}
                      className="flex-1 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(null)}
                      className="flex-1 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded"
                    >
                      Нет
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    onClick={() => onSelectChat(chat.id)}
                    className="flex-1 text-left p-2 pr-12"
                  >
                    <div className="text-xs text-white truncate">{chat.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {formatDate(chat.updatedAt)} • {chat.messages.length} сообщ.
                    </div>
                  </button>

                  {/* Action buttons */}
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTitle(chat.title);
                        setEditingChatId(chat.id);
                      }}
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-600 rounded"
                      title="Переименовать"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(chat.id);
                      }}
                      className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded"
                      title="Удалить"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer - Clear All */}
      <div className="p-2 border-t border-slate-700/30">
        {showClearConfirm ? (
          <div className="p-2">
            <p className="text-xs text-slate-300 mb-2 text-center">
              Удалить все {chats.length} чатов?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleClearAll}
                className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded"
              >
                Удалить
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full py-1.5 text-slate-500 hover:text-red-400 text-xs flex items-center justify-center gap-1 rounded transition-colors"
          >
            <Trash2 size={12} />
            <span>Очистить историю</span>
          </button>
        )}
      </div>
    </div>
  );
}
