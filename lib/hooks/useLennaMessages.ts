'use client';

import { useState, useEffect } from 'react';
import type { ChatMessage } from '@/lib/llm/chat';

const STORAGE_KEY = 'lenna_messages';

export function useLennaMessages(): [ChatMessage[], React.Dispatch<React.SetStateAction<ChatMessage[]>>] {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  return [messages, setMessages];
}
