'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { sendToLenna } from '../today/actions';
import { toggleTask, deleteTask, addTask } from '../today/taskActions';
import type { vectors, tasks, taskGroups, user } from '@/lib/db/schema';
import styles from './tasks.module.css';
import LennaPanel from '@/components/LennaPanel';
import { useLennaMessages } from '@/lib/hooks/useLennaMessages';

type User      = typeof user.$inferSelect;
type Vector    = typeof vectors.$inferSelect;
type Task      = typeof tasks.$inferSelect;
type TaskGroup = typeof taskGroups.$inferSelect;

type Props = {
  user:    User;
  vectors: Vector[];
  groups:  TaskGroup[];
  tasks:   Task[];
  today:   string;
};

const TODAY_STR = new Date().toISOString().split('T')[0];

function dueDateLabel(dueDate: string | null): { text: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const overdue = dueDate < TODAY_STR;
  if (overdue) return { text: 'overdue', overdue: true };
  if (dueDate === TODAY_STR) return { text: 'due today', overdue: false };
  const d = new Date(dueDate + 'T00:00:00');
  return { text: `due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, overdue: false };
}

function priorityClass(important: boolean, urgent: boolean, s: Record<string, string>) {
  if (important && urgent)  return s.prioHighHigh;
  if (important && !urgent) return s.prioHighLow;
  if (!important && urgent) return s.prioLowHigh;
  return '';
}

export default function TasksShell({ user, vectors, groups, tasks: allTasks, today }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [inputText, setInputText]             = useState('');
  const [messages, setMessages]               = useLennaMessages();
  const [inputError, setInputError]           = useState<string | null>(null);
  const [pending, startTransition]            = useTransition();
  const [taskPending, startTaskTransition]    = useTransition();
  const [quickAdd, setQuickAdd]               = useState<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const firstName  = user.name.trim().split(' ')[0] || 'you';

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending]);

  function handleSubmit() {
    const text = inputText.trim();
    if (!text || pending) return;
    setInputError(null);
    const prev = [...messages];
    setMessages(m => [...m, { role: 'user', text }]);
    setInputText('');
    startTransition(async () => {
      const result = await sendToLenna(text, prev);
      if (result.error) { setInputError(result.error); setMessages(m => m.slice(0, -1)); }
      else if (result.reply) setMessages(m => [...m, { role: 'lenna', text: result.reply! }]);
    });
  }

  void firstName;

  const displayGroups = selectedGroupId
    ? groups.filter(g => g.id === selectedGroupId)
    : groups;

  return (
    <div className={styles.shell}>

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBody}>
          <div className={styles.sidebarLogo}>lifeOS</div>
          <div className={styles.navTree}>
            <div className={styles.navItem}>
              <Link href="/today" className={styles.navLink}>Today</Link>
            </div>
            <div className={styles.navItem}>
              <Link href="/quarter" className={styles.navLink}>Quarter</Link>
            </div>
            <div className={styles.navItem}>
              <Link href="/tasks" className={`${styles.navLink} ${styles.navLinkActive}`}>Tasks</Link>
            </div>
          </div>
        </div>
        <div className={styles.sidebarFooter}>
          <Link href="/settings" className={styles.sidebarFooterLink}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75, marginRight: 7 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </Link>
        </div>
      </aside>

      {/* ── Center: task groups ── */}
      <div className={styles.center}>
        <div className={styles.centerHeader}>
          <div className={styles.centerTitle}>Tasks</div>
          <div className={styles.groupTabs}>
            <button
              className={`${styles.groupTab} ${selectedGroupId === null ? styles.groupTabActive : ''}`}
              onClick={() => setSelectedGroupId(null)}
            >
              All
            </button>
            {groups.map(g => (
              <button
                key={g.id}
                className={`${styles.groupTab} ${selectedGroupId === g.id ? styles.groupTabActive : ''}`}
                onClick={() => setSelectedGroupId(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.centerBody}>
          {displayGroups.map(group => {
            const groupTasks = allTasks
              .filter(t => t.groupId === group.id)
              .sort((a, b) => {
                const p = (t: Task) => t.important && t.urgent ? 0 : t.important ? 1 : t.urgent ? 2 : 3;
                return p(a) - p(b);
              });
            return (
              <div key={group.id} className={styles.group}>
                <div className={styles.groupHeader}>
                  <span className={styles.groupName}>{group.name}</span>
                  <span className={styles.groupCount}>{groupTasks.length}</span>
                </div>
                {groupTasks.length === 0 && quickAdd[group.id] === undefined && (
                  <div className={styles.groupEmpty}>No tasks yet.</div>
                )}
                {groupTasks.map(task => {
                  const due = dueDateLabel(task.dueDate);
                  const isToday = task.date === today;
                  return (
                    <div
                      key={task.id}
                      className={[
                        styles.taskRow,
                        priorityClass(task.important, task.urgent, styles as Record<string, string>),
                        taskPending ? styles.taskPending : '',
                      ].join(' ')}
                    >
                      <button
                        className={`${styles.taskCheck} ${task.done ? styles.taskCheckDone : ''}`}
                        onClick={() => startTaskTransition(() => toggleTask(task.id))}
                        title={task.done ? 'Mark undone' : 'Mark done'}
                      />
                      <div className={styles.taskBody}>
                        <span className={`${styles.taskTitle} ${task.done ? styles.taskDone : ''}`}>
                          {task.title}
                        </span>
                        <div className={styles.taskMeta}>
                          {isToday && <span className={styles.taskDateBadge}>today</span>}
                          {due && (
                            <span className={`${styles.taskDueDate} ${due.overdue ? styles.taskDueDateOverdue : ''}`}>
                              {due.text}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className={styles.taskDelete}
                        onClick={() => startTaskTransition(() => deleteTask(task.id))}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {quickAdd[group.id] !== undefined ? (
                  <div className={styles.quickAddRow}>
                    <input
                      autoFocus
                      className={styles.quickAddInput}
                      placeholder="Task name…"
                      value={quickAdd[group.id]}
                      onChange={e => setQuickAdd(q => ({ ...q, [group.id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          startTaskTransition(() => addTask(quickAdd[group.id], group.id, today));
                          setQuickAdd(q => { const n = { ...q }; delete n[group.id]; return n; });
                        }
                        if (e.key === 'Escape') setQuickAdd(q => { const n = { ...q }; delete n[group.id]; return n; });
                      }}
                      onBlur={() => {
                        if (!quickAdd[group.id]?.trim()) setQuickAdd(q => { const n = { ...q }; delete n[group.id]; return n; });
                      }}
                    />
                    <span className={styles.quickAddHint}>↵ add · esc cancel</span>
                  </div>
                ) : (
                  <button className={styles.quickAddBtn} onClick={() => setQuickAdd(q => ({ ...q, [group.id]: '' }))}>
                    + Add task
                  </button>
                )}
              </div>
            );
          })}

          {displayGroups.length === 0 && (
            <div className={styles.emptyState}>No groups yet — ask Lenna to create one.</div>
          )}
        </div>
      </div>

      <LennaPanel
        messages={messages}
        inputText={inputText}
        onInputChange={setInputText}
        onSubmit={handleSubmit}
        pending={pending}
        error={inputError}
        placeholder="Add tasks, ask about your work…"
        chatEndRef={chatEndRef}
      />

    </div>
  );
}
