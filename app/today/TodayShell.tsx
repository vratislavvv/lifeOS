'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './today.module.css';
import Clock from './Clock';
import FocusTimer from './FocusTimer';
import CalSection from './CalSection';
import LennaPanel from '@/components/LennaPanel';
import RadarChart from '@/components/RadarChart';
import { sendToLenna } from './actions';
import { toggleTask, deleteTask } from './taskActions';
import { useLennaMessages } from '@/lib/hooks/useLennaMessages';
import type { vectors, scores, tasks, taskGroups, user } from '@/lib/db/schema';

type User = typeof user.$inferSelect;
type Vector = typeof vectors.$inferSelect;
type Score = typeof scores.$inferSelect;
type Task = typeof tasks.$inferSelect;
type TaskGroup = typeof taskGroups.$inferSelect;

type Props = {
  user: User;
  vectors: Vector[];
  score: Score | null;
  groups: TaskGroup[];
  todayTasks: Task[];
  currentQuarter: string;
  quarterPace: number;
  vectorCompletion: Record<string, { c: number; e: number }>;
};

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(d: Date) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const TODAY_STR = new Date().toLocaleDateString('en-CA');


function dueDateLabel(dueDate: string | null): { text: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const overdue = dueDate < TODAY_STR;
  if (overdue) return { text: 'overdue', overdue: true };
  if (dueDate === TODAY_STR) return { text: 'due today', overdue: false };
  const d = new Date(dueDate + 'T00:00:00');
  const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { text: `due ${label}`, overdue: false };
}

export default function TodayShell({ user, vectors, score, groups, todayTasks, currentQuarter, quarterPace, vectorCompletion }: Props) {
  const today = new Date();
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useLennaMessages();
  const [inputError, setInputError] = useState<string | null>(null);
  const [lastLogged, setLastLogged] = useState<{ vectorId: string; summary: string; progressDelta: number } | null>(null);
  const [fullscreen, setFullscreen] = useState<'clock' | 'focus' | null>(null);
  const [pending, startTransition] = useTransition();
  const [taskPending, startTaskTransition] = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [qYear, qNum] = currentQuarter.split('-Q');
  const quarterLabel = `Q${qNum} ${qYear}`;

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  // Reload at midnight so done tasks clear and the date updates
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = midnight.getTime() - now.getTime();
    const t = setTimeout(() => window.location.reload(), ms);
    return () => clearTimeout(t);
  }, []);

  function handleSubmit() {
    const text = inputText.trim();
    if (!text || pending) return;
    setInputError(null);

    const previousMessages = [...messages];
    const userMessage = { role: 'user' as const, text };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');

    startTransition(async () => {
      const result = await sendToLenna(text, previousMessages, lastLogged ?? undefined);
      if (result.error) {
        setInputError(result.error);
        setMessages(prev => prev.slice(0, -1));
      } else if (result.reply) {
        setMessages(prev => [...prev, { role: 'lenna', text: result.reply! }]);
        if (result.justLogged) {
          setLastLogged(result.justLogged);
          router.refresh();
        }
      }
    });
  }

  return (
    <div className={styles.app}>

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBody}>
          <div className={styles.sidebarLogo}>lifeOS</div>
          <div className={styles.navTree}>
            <div className={styles.navItem}>
              <Link href="/today" className={`${styles.navLink} ${styles.navLinkActive}`}>Today</Link>
            </div>
            <div className={styles.navItem}>
              <Link href="/quarter" className={styles.navLink}>Quarter</Link>
            </div>
            <div className={styles.navItem}>
              <Link href="/tasks" className={styles.navLink}>Tasks</Link>
            </div>
          </div>
        </div>
        <div className={styles.sidebarFooter}>
          <Link href="/settings" className={styles.sidebarFooterLink}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={styles.content}>

        {/* Header */}
        <div className={styles.contentHeader}>
          <div>
            <div className={styles.headerTitle}>{user.name}</div>
            <div className={styles.headerDate}>{formatDate(today)}</div>
          </div>
          <div className={styles.headerScore}>
            <div className={`${styles.scoreNum} ${score ? styles.scoreNumSet : ''}`}>
              {score ? Math.round(score.operatingLevel) : '—'}
            </div>
            <div className={styles.scoreLabel}>operating level</div>
          </div>
        </div>

        {/* Fullscreen island overlay */}
        {fullscreen === 'clock' && (
          <div className={`${styles.fullscreenIsland} ${styles.fullscreenClock}`}>
            <button className={styles.fullscreenClose} onClick={() => setFullscreen(null)}>✕</button>
            <Clock timeFormat={user.timeFormat} timezone={user.timezone} />
          </div>
        )}
        {fullscreen === 'focus' && (
          <div className={`${styles.fullscreenIsland} ${styles.fullscreenFocus}`}>
            <button className={styles.fullscreenClose} onClick={() => setFullscreen(null)}>✕</button>
            <FocusTimer />
          </div>
        )}

        {/* Normal grid — hidden when fullscreen */}
        {!fullscreen && (
          <>
            {/* Row 1: Today island + Clock */}
            <div className={styles.row}>
              <div className={`${styles.island} ${styles.todayIsland}`}>
                <div className={styles.islandLabel}>Today</div>
                {todayTasks.length === 0 ? (
                  <div className={styles.emptyState}>No tasks yet — ask Lenna to add one.</div>
                ) : (
                  <div className={styles.taskList}>
                    {groups
                      .filter(g => todayTasks.some(t => t.groupId === g.id))
                      .map(group => {
                        const groupTasks = todayTasks.filter(t => t.groupId === group.id);
                        return (
                          <div key={group.id} className={styles.taskGroup}>
                            <div className={styles.taskGroupHeader}>{group.name}</div>
                            {groupTasks.map(task => {
                              const due = dueDateLabel(task.dueDate);
                              const isOverdue = due?.overdue ?? false;
                              return (
                                <div
                                  key={task.id}
                                  className={[
                                    styles.taskRow,
                                    isOverdue && !task.done ? styles.taskOverdue : '',
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
                                    {due && (
                                      <span className={`${styles.taskDueDate} ${due.overdue ? styles.taskDueDateOverdue : ''}`}>
                                        {due.text}
                                      </span>
                                    )}
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
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>
              <div className={`${styles.island} ${styles.islandSunk} ${styles.clockIsland}`}>
                <button className={styles.islandFullscreen} onClick={() => setFullscreen('clock')} title="Fullscreen">⤢</button>
                <Clock timeFormat={user.timeFormat} timezone={user.timezone} />
              </div>
            </div>

            {/* Row 2: Quarter island + Focus */}
            <div className={styles.row}>
              <div className={`${styles.island} ${styles.quarterIsland}`}>
                <RadarChart
                  vectors={vectors.map(v => {
                    const vc = vectorCompletion[v.id];
                    return {
                      id:    v.id,
                      label: v.label,
                      color: v.color,
                      c:     vc?.c ?? 0,
                      e:     vc?.e ?? quarterPace,
                    };
                  })}
                />
              </div>
              <div className={`${styles.island} ${styles.islandSunk} ${styles.focusIsland}`}>
                <button className={styles.islandFullscreen} onClick={() => setFullscreen('focus')} title="Fullscreen">⤢</button>
                <FocusTimer />
              </div>
            </div>

            {/* Calendar */}
            <CalSection weekStart={user.weekStart} />
          </>
        )}

      </main>

      <LennaPanel
        messages={messages}
        inputText={inputText}
        onInputChange={setInputText}
        onSubmit={handleSubmit}
        pending={pending}
        error={inputError}
        placeholder="What moved today?"
        chatEndRef={chatEndRef}
      />

    </div>
  );
}
