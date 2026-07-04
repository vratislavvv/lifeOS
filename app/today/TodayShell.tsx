'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import styles from './today.module.css';
import { LennaText } from '@/lib/renderMarkdown';
import Clock from './Clock';
import FocusTimer from './FocusTimer';
import CalSection from './CalSection';
import { sendToLenna } from './actions';
import { toggleTask, deleteTask } from './taskActions';
import type { ChatMessage } from '@/lib/llm/chat';
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
};

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(d: Date) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const TODAY_STR = new Date().toISOString().split('T')[0];

function priorityClass(important: boolean, urgent: boolean) {
  if (important && urgent)  return styles.prioHighHigh;
  if (important && !urgent) return styles.prioHighLow;
  if (!important && urgent) return styles.prioLowHigh;
  return '';
}

function dueDateLabel(dueDate: string | null): { text: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const overdue = dueDate < TODAY_STR;
  if (overdue) return { text: 'overdue', overdue: true };
  if (dueDate === TODAY_STR) return { text: 'due today', overdue: false };
  const d = new Date(dueDate + 'T00:00:00');
  const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { text: `due ${label}`, overdue: false };
}

export default function TodayShell({ user, vectors, score, groups, todayTasks, currentQuarter, quarterPace }: Props) {
  const today = new Date();
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputError, setInputError] = useState<string | null>(null);
  const [lastLogged, setLastLogged] = useState<{ vectorId: string; summary: string; progressDelta: number } | null>(null);
  const [lennaOpen, setLennaOpen] = useState(true);
  const [lennaWidth, setLennaWidth] = useState(260);
  const [fullscreen, setFullscreen] = useState<'clock' | 'focus' | null>(null);
  const [pending, startTransition] = useTransition();
  const [taskPending, startTaskTransition] = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 180), 520);
      setLennaWidth(newWidth);
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

  const [qYear, qNum] = currentQuarter.split('-Q');
  const quarterLabel = `Q${qNum} ${qYear}`;
  const firstName = user.name.trim().split(' ')[0] || 'you';

  const breakdown = score
    ? (score.vectorBreakdown as Record<string, number>)
    : {};

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
    const userMessage: ChatMessage = { role: 'user', text };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');

    startTransition(async () => {
      const result = await sendToLenna(text, previousMessages, lastLogged ?? undefined);
      if (result.error) {
        setInputError(result.error);
        setMessages(prev => prev.slice(0, -1));
      } else if (result.reply) {
        setMessages(prev => [...prev, { role: 'lenna', text: result.reply! }]);
        if (result.justLogged) setLastLogged(result.justLogged);
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
          <div className={styles.sidebarFooterLink}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.75 }}>
              <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
              <circle cx="9" cy="8" r="2.3" fill="var(--bg)" /><circle cx="15" cy="16" r="2.3" fill="var(--bg)" />
            </svg>
            Settings
          </div>
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
          <div className={styles.fullscreenIsland}>
            <button className={styles.fullscreenClose} onClick={() => setFullscreen(null)}>✕</button>
            <Clock timeFormat={user.timeFormat} timezone={user.timezone} />
          </div>
        )}
        {fullscreen === 'focus' && (
          <div className={styles.fullscreenIsland}>
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
                        const groupTasks = todayTasks
                          .filter(t => t.groupId === group.id)
                          .sort((a, b) => {
                            const priority = (t: Task) =>
                              t.important && t.urgent ? 0 :
                              t.important ? 1 :
                              t.urgent ? 2 : 3;
                            return priority(a) - priority(b);
                          });
                        return (
                          <div key={group.id} className={styles.taskGroup}>
                            <div className={styles.taskGroupHeader}>{group.name}</div>
                            {groupTasks.map(task => {
                              const due = dueDateLabel(task.dueDate);
                              return (
                                <div
                                  key={task.id}
                                  className={[
                                    styles.taskRow,
                                    priorityClass(task.important, task.urgent),
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
                <div className={styles.islandLabel}>
                  Quarter · {quarterLabel}
                </div>
                {vectors.map(v => {
                  const paceGap = breakdown[v.id] ?? null;
                  const progress = paceGap !== null
                    ? Math.min(Math.max(paceGap + quarterPace, 0), 1)
                    : null;
                  const ahead = paceGap !== null && paceGap >= 0;
                  const deltaLabel = paceGap !== null
                    ? `${ahead ? '+' : ''}${Math.round(paceGap * 100)}pp`
                    : '—';
                  return (
                    <div key={v.id} className={styles.vectorRow}>
                      <div className={styles.vdot} style={{ background: v.color }} />
                      <span className={styles.vlabel}>{v.label}</span>
                      <div className={styles.vtrack}>
                        <div className={styles.vtrackBg} />
                        <div className={styles.vpace} style={{ left: `${quarterPace * 100}%` }} />
                        {progress !== null && (
                          <div
                            className={styles.vnow}
                            style={{ left: `${progress * 100}%`, background: v.color }}
                          />
                        )}
                      </div>
                      <span
                        className={styles.vdelta}
                        style={{ color: paceGap !== null ? (ahead ? 'var(--positive)' : 'var(--attention)') : undefined }}
                      >
                        {deltaLabel}
                      </span>
                    </div>
                  );
                })}
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

      {/* ── Resize handle ── */}
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

      {/* ── Lenna ── */}
      {lennaOpen ? (
        <aside className={styles.assistant} style={{ width: lennaWidth }}>
          <div className={styles.assistantHeader}>
            <span className={styles.assistantTitle}>Lenna</span>
            <button
              className={styles.assistantCollapse}
              onClick={() => setLennaOpen(false)}
              title="Close Lenna"
            >
              ←
            </button>
          </div>

          <div className={styles.assistantBody}>
            {messages.length === 0 ? (
              <div className={styles.chatLenna}>
                <div className={styles.chatLennaLabel}>lenna</div>
                <div className={styles.chatLennaText}>
                  {score
                    ? `Operating level is ${Math.round(score.operatingLevel)}. What else moved today, ${firstName}?`
                    : `Setup complete, ${firstName}. Tell me what moved today and I'll compute your first operating level.`
                  }
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className={styles.chatUser}>{m.text}</div>
                ) : (
                  <div key={i} className={styles.chatLenna}>
                    <div className={styles.chatLennaLabel}>lenna</div>
                    <LennaText text={m.text} className={styles.chatLennaText} />
                  </div>
                )
              )
            )}
            {pending && (
              <div className={styles.chatLenna}>
                <div className={styles.chatLennaLabel}>lenna</div>
                <div className={`${styles.chatLennaText} ${styles.chatPending}`}>…</div>
              </div>
            )}
            {inputError && (
              <div style={{ fontSize: 11, color: 'var(--attention)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>
                {inputError}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className={styles.assistantInputWrap}>
            <textarea
              className={styles.assistantInput}
              placeholder="What moved today?"
              rows={2}
              value={inputText}
              disabled={pending}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            {inputText.trim() && !pending && (
              <div className={styles.assistantInputHint}>↵ send · shift+↵ newline</div>
            )}
          </div>
        </aside>
      ) : (
        <div className={styles.lennaStrip} onClick={() => setLennaOpen(true)} title="Open Lenna">
          <span className={styles.lennaStripLabel}>Lenna →</span>
        </div>
      )}

    </div>
  );
}
