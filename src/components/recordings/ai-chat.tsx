"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, MessageSquare, Bot, User, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChatMessage,
  ChatSession,
  getChatSession,
  updateChatSession,
  getOrCreateCurrentChat,
  createChatSession,
} from "@/lib/chat-storage";

interface AIChatProps {
  recordingId: string;
  hasTranscript: boolean;
  currentChatId: string | null;
  onChatChange: (chatId: string) => void;
  onChatUpdate: () => void; // Called when messages are updated to refresh history
}

const SUGGESTED_QUESTIONS = [
  "О чём эта запись?",
  "Какие главные темы обсуждались?",
  "Какие решения были приняты?",
  "Кто участвовал в разговоре?",
  "Были ли назначены какие-то задачи?",
];

export function AIChat({
  recordingId,
  hasTranscript,
  currentChatId,
  onChatChange,
  onChatUpdate,
}: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat when currentChatId changes
  useEffect(() => {
    if (!currentChatId) {
      // Get or create current chat
      const session = getOrCreateCurrentChat(recordingId);
      setMessages(session.messages);
      onChatChange(session.id);
    } else {
      // Load existing chat
      const session = getChatSession(recordingId, currentChatId);
      if (session) {
        setMessages(session.messages);
      } else {
        // Chat not found, create new one
        const newSession = getOrCreateCurrentChat(recordingId);
        setMessages(newSession.messages);
        onChatChange(newSession.id);
      }
    }
  }, [recordingId, currentChatId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Save messages to storage
  const saveMessages = useCallback(
    (newMessages: ChatMessage[]) => {
      if (currentChatId) {
        updateChatSession(recordingId, currentChatId, newMessages);
        onChatUpdate();
      }
    },
    [recordingId, currentChatId, onChatUpdate]
  );

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading || !currentChatId) return;

    setError(null);
    setInput("");

    // Add user message
    const userMessage: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    saveMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/recordings/${recordingId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: messages,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send message");
      }

      const data = await response.json();

      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.message,
      };
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      saveMessages(updatedMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      // Remove the user message if there was an error
      setMessages(messages);
      saveMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewChat = () => {
    const newSession = createChatSession(recordingId);
    setMessages([]);
    onChatChange(newSession.id);
    onChatUpdate();
  };

  if (!hasTranscript) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
        <p>Чат с ИИ недоступен</p>
        <p className="text-sm mt-1">
          Дождитесь завершения транскрипции записи
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-300px)] min-h-[400px] bg-slate-800/30 rounded-xl border border-slate-700/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-orange-500" />
          <span className="font-medium text-white">Чат по транскрипту</span>
        </div>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Новый чат"
        >
          <Plus className="w-4 h-4" />
          <span>Новый чат</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-slate-400 mb-4">
              Задайте вопрос по содержанию записи
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTED_QUESTIONS.map((question, index) => (
                <button
                  key={index}
                  onClick={() => sendMessage(question)}
                  className="px-3 py-1.5 text-sm bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-full transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-orange-500" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] px-4 py-3 rounded-2xl",
                    message.role === "user"
                      ? "bg-orange-500 text-white rounded-br-sm"
                      : "bg-slate-700/50 text-slate-200 rounded-bl-sm"
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </p>
                </div>
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-orange-500" />
                </div>
                <div className="bg-slate-700/50 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Думаю...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Задайте вопрос..."
            rows={2}
            className="flex-1 px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className={cn(
              "px-4 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2",
              input.trim() && !isLoading
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-slate-700/50 text-slate-500 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Shift+Enter для новой строки
        </p>
      </div>
    </div>
  );
}
