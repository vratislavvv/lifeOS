'use client';

import { useState, useRef, useEffect } from 'react';
import { LennaText } from '@/lib/renderMarkdown';
import type { ChatMessage } from '@/lib/llm/chat';
import styles from './lenna-panel.module.css';

type Props = {
  messages: ChatMessage[];
  inputText: string;
  onInputChange: (text: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  placeholder?: string;
  label?: string;
  chatEndRef?: React.RefObject<HTMLDivElement | null>;
};

export default function LennaPanel({
  messages,
  inputText,
  onInputChange,
  onSubmit,
  pending,
  error,
  placeholder = 'Ask Lenna…',
  label = 'Lenna',
  chatEndRef: externalRef,
}: Props) {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(260);
  const dragging = useRef(false);
  const internalRef = useRef<HTMLDivElement>(null);
  const endRef = externalRef ?? internalRef;

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      setWidth(Math.min(Math.max(window.innerWidth - e.clientX, 180), 520));
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <>
      {/* Resize handle */}
      {open && (
        <div
          className={styles.resizeHandle}
          onMouseDown={e => {
            e.preventDefault();
            dragging.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        >
          <div className={styles.handleDots}>
            <div className={styles.handleDot} />
            <div className={styles.handleDot} />
            <div className={styles.handleDot} />
          </div>
        </div>
      )}

      {open ? (
        <aside className={styles.panel} style={{ width }}>
          <div className={styles.header}>
            <span className={styles.title}>{label}</span>
            <button className={styles.collapseBtn} onClick={() => setOpen(false)}>←</button>
          </div>

          <div className={styles.body}>
            {messages.length === 0 && (
              <div className={styles.lennaMsg}>
                <div className={styles.lennaMsgLabel}>lenna</div>
                <div className={styles.lennaMsgText}>
                  {placeholder === 'What moved today?'
                    ? "Tell me what moved today and I'll log it."
                    : 'How can I help?'}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className={styles.userMsg}>{m.text}</div>
              ) : (
                <div key={i} className={styles.lennaMsg}>
                  <div className={styles.lennaMsgLabel}>lenna</div>
                  <LennaText text={m.text} className={styles.lennaMsgText} />
                </div>
              )
            )}
            {pending && (
              <div className={styles.lennaMsg}>
                <div className={styles.lennaMsgLabel}>lenna</div>
                <div className={`${styles.lennaMsgText} ${styles.pending}`}>…</div>
              </div>
            )}
            {error && (
              <div className={styles.error}>{error}</div>
            )}
            <div ref={endRef} />
          </div>

          <div className={styles.inputWrap}>
            <textarea
              className={styles.input}
              placeholder={placeholder}
              rows={2}
              value={inputText}
              disabled={pending}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {inputText.trim() && !pending && (
              <div className={styles.inputHint}>↵ send · shift+↵ newline</div>
            )}
          </div>
        </aside>
      ) : (
        <div className={styles.strip} onClick={() => setOpen(true)} title="Open Lenna">
          <span className={styles.stripLabel}>Lenna →</span>
        </div>
      )}
    </>
  );
}
