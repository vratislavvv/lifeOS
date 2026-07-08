'use client';

import { useState, useEffect } from 'react';
import type { ChatMessage } from '@/lib/llm/chat';

// Module-level store: persists across client-side route changes, resets on page reload / new tab
let store: ChatMessage[] = [];
let listeners = new Set<(msgs: ChatMessage[]) => void>();

function dispatch(action: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) {
  store = typeof action === 'function' ? action(store) : action;
  listeners.forEach(fn => fn(store));
}

export function useLennaMessages(): [ChatMessage[], typeof dispatch] {
  const [messages, setMessages] = useState<ChatMessage[]>(store);

  useEffect(() => {
    listeners.add(setMessages);
    return () => { listeners.delete(setMessages); };
  }, []);

  return [messages, dispatch];
}
