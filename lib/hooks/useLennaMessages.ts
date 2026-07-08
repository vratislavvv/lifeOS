'use client';

import { useState, useEffect } from 'react';
import type { ChatMessage } from '@/lib/llm/chat';

const STORAGE_KEY = 'lenna_messages';

export function useLennaMessages(): [ChatMessage[], React.Dispatch<React.SetStateAction<ChatMessage[]>>] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);

  // Load after hydration so server and client both start with []
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setMessages(JSON.parse(stored) as ChatMessage[]);
    } catch {}
    setReady(true);
  }, []);

  // Save only after the initial load, so we don't overwrite stored messages with []
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages, ready]);

  return [messages, setMessages];
}
