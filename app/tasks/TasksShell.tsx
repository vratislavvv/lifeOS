'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { sendToLenna } from '../today/actions';
import { toggleTask, deleteTask, addTask, createGroup, deleteGroup } from '../today/taskActions';
import type { tasks, taskGroups } from '@/lib/db/schema';
import styles from './tasks.module.css';
import LennaPanel from '@/components/LennaPanel';
import { useLennaMessages } from '@/lib/hooks/useLennaMessages';

type Task      = typeof tasks.$inferSelect;
type TaskGroup = typeof taskGroups.$inferSelect;
type GroupNode = TaskGroup & { children: GroupNode[] };

type Props = {
  groups: TaskGroup[];
  tasks:  Task[];
  today:  string;
};

const TODAY_STR = new Date().toLocaleDateString('en-CA');

function dueDatePill(dueDate: string | null): { text: string; soon: boolean; overdue: boolean } | null {
  if (!dueDate) return null;
  if (dueDate < TODAY_STR) return { text: 'overdue', soon: true, overdue: true };
  if (dueDate === TODAY_STR) return { text: 'today', soon: true, overdue: false };
  const d = new Date(dueDate + 'T00:00:00');
  const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return { text: d.toLocaleDateString('en-US', { weekday: 'short' }), soon: diff <= 3, overdue: false };
}

function buildTree(groups: TaskGroup[]): GroupNode[] {
  const map = new Map<string, GroupNode>(groups.map(g => [g.id, { ...g, children: [] }]));
  const roots: GroupNode[] = [];
  for (const node of map.values()) {
    if (node.parentId) map.get(node.parentId)?.children.push(node);
    else roots.push(node);
  }
  const sort = (arr: GroupNode[]) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const node of map.values()) sort(node.children);
  return sort(roots);
}

export default function TasksShell({ groups, tasks: allTasks, today }: Props) {
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed]           = useState<Set<string>>(new Set());
  const [inputText, setInputText]           = useState('');
  const [messages, setMessages]             = useLennaMessages();
  const [inputError, setInputError]         = useState<string | null>(null);
  const [pending, startTransition]          = useTransition();
  const [taskPending, startTaskTransition]  = useTransition();
  const [quickAdd, setQuickAdd]             = useState<Record<string, string>>({});
  const [newSublist, setNewSublist]         = useState<Record<string, string>>({});
  const [newListName, setNewListName]       = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  function toggleGroupFilter(groupId: string) {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleCollapsed(groupId: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const tree = buildTree(groups);
  const roots = tree; // top-level only for filter pills

  const displayRoots = selectedGroups.size === 0
    ? roots
    : roots.filter(g => selectedGroups.has(g.id));

  const openCount = allTasks.filter(t => !t.done).length;

  function handleNewTask() {
    if (displayRoots.length > 0) {
      const firstId = displayRoots[0].id;
      setCollapsed(prev => { const n = new Set(prev); n.delete(firstId); return n; });
      setQuickAdd(q => ({ ...q, [firstId]: '' }));
    }
  }

  // Recursive group renderer
  function renderGroup(group: GroupNode, depth: number = 0) {
    const groupTasks = allTasks.filter(t => t.groupId === group.id);
    const isCollapsed = collapsed.has(group.id);
    const isRoot = depth === 0;

    // Count all tasks in subtree for the root header badge
    function subtreeCount(node: GroupNode): number {
      return allTasks.filter(t => t.groupId === node.id).length
        + node.children.reduce((s, c) => s + subtreeCount(c), 0);
    }

    return (
      <div
        key={group.id}
        className={isRoot ? styles.group : styles.subgroup}
      >
        {/* Header */}
        <div className={styles.groupHeader}>
          <button
            className={`${styles.groupChevron} ${isCollapsed ? styles.groupChevronCollapsed : ''}`}
            onClick={() => toggleCollapsed(group.id)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {group.color && <span className={styles.colorDot} style={{ background: group.color }} />}
          <span className={styles.groupName}>{group.name}</span>
          <span className={styles.groupCount}>{isRoot ? subtreeCount(group) : groupTasks.length}</span>
          <button
            className={styles.groupAddBtn}
            onClick={() => {
              setCollapsed(prev => { const n = new Set(prev); n.delete(group.id); return n; });
              setQuickAdd(q => ({ ...q, [group.id]: '' }));
            }}
            title="Add task"
          >+</button>
          {!group.isDefault && (
            <button
              className={styles.groupDeleteBtn}
              onClick={() => startTaskTransition(() => deleteGroup(group.id))}
              title="Delete list"
            >×</button>
          )}
        </div>

        {/* Animated body */}
        <div className={`${styles.groupTasksWrap} ${isCollapsed ? styles.groupTasksCollapsed : ''}`}>
          <div className={styles.groupTasksInner}>
            {/* Tasks in this group */}
            {groupTasks.map(task => {
              const due = dueDatePill(task.dueDate);
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
                  >
                    {task.done && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <div className={styles.taskBody}>
                    <span className={`${styles.taskTitle} ${task.done ? styles.taskDone : ''}`}>
                      {task.title}
                    </span>
                  </div>
                  {due && !task.done && (
                    <span className={`${styles.duePill} ${due.soon ? styles.duePillSoon : ''}`}>
                      {due.text}
                    </span>
                  )}
                  <button
                    className={styles.taskDelete}
                    onClick={() => startTaskTransition(() => deleteTask(task.id))}
                    title="Delete"
                  >×</button>
                </div>
              );
            })}

            {groupTasks.length === 0 && group.children.length === 0 && quickAdd[group.id] === undefined && (
              <div className={styles.groupEmpty}>No tasks yet.</div>
            )}

            {/* Quick-add input */}
            {quickAdd[group.id] !== undefined && (
              <div className={styles.quickAddRow}>
                <input
                  autoFocus
                  className={styles.quickAddInput}
                  placeholder="Task name…"
                  value={quickAdd[group.id]}
                  onChange={e => setQuickAdd(q => ({ ...q, [group.id]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (quickAdd[group.id]?.trim()) {
                        startTaskTransition(() => addTask(quickAdd[group.id], group.id, today));
                      }
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
            )}

            {/* Nested sublists */}
            {group.children.map(child => renderGroup(child, depth + 1))}

            {/* New sublist row or button */}
            {newSublist[group.id] !== undefined ? (
              <div className={`${styles.quickAddRow} ${styles.newSublistRow}`}>
                <input
                  autoFocus
                  className={styles.quickAddInput}
                  placeholder="Sublist name…"
                  value={newSublist[group.id]}
                  onChange={e => setNewSublist(q => ({ ...q, [group.id]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (newSublist[group.id]?.trim()) {
                        startTaskTransition(() => createGroup(newSublist[group.id], group.id));
                      }
                      setNewSublist(q => { const n = { ...q }; delete n[group.id]; return n; });
                    }
                    if (e.key === 'Escape') setNewSublist(q => { const n = { ...q }; delete n[group.id]; return n; });
                  }}
                  onBlur={() => {
                    if (!newSublist[group.id]?.trim()) setNewSublist(q => { const n = { ...q }; delete n[group.id]; return n; });
                  }}
                />
                <span className={styles.quickAddHint}>↵ create · esc cancel</span>
              </div>
            ) : (
              <button
                className={styles.newSublistBtn}
                onClick={() => {
                  setCollapsed(prev => { const n = new Set(prev); n.delete(group.id); return n; });
                  setNewSublist(q => ({ ...q, [group.id]: '' }));
                }}
              >
                + New sublist
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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

      {/* ── Center ── */}
      <div className={styles.center}>

        {/* Header */}
        <div className={styles.centerHeader}>
          <div className={styles.centerTitleRow}>
            <div>
              <div className={styles.centerTitle}>Tasks</div>
              <div className={styles.centerSummary}>{roots.length} {roots.length === 1 ? 'list' : 'lists'} · {openCount} open</div>
            </div>
            <button className={styles.newTaskBtn} onClick={handleNewTask}>+ New task</button>
          </div>
        </div>

        {/* Filter bar — root groups only */}
        <div className={styles.filterBar}>
          <span className={styles.filterCaption}>LISTS</span>
          <div className={styles.filterPills}>
            <button
              className={`${styles.filterPill} ${selectedGroups.size === 0 ? styles.filterPillActive : ''}`}
              onClick={() => setSelectedGroups(new Set())}
            >All</button>
            {roots.map(g => (
              <button
                key={g.id}
                className={`${styles.filterPill} ${selectedGroups.has(g.id) ? styles.filterPillActive : ''}`}
                onClick={() => toggleGroupFilter(g.id)}
              >
                {g.color && <span className={styles.colorDot} style={{ background: g.color }} />}
                {g.name}
              </button>
            ))}
          </div>
        </div>

        {/* Task body */}
        <div className={styles.centerBody}>
          {displayRoots.map(group => renderGroup(group))}

          {displayRoots.length === 0 && newListName === null && (
            <div className={styles.emptyState}>No groups yet.</div>
          )}

          {newListName !== null ? (
            <div className={styles.newListRow}>
              <input
                autoFocus
                className={styles.quickAddInput}
                placeholder="List name…"
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (newListName.trim()) startTaskTransition(() => createGroup(newListName));
                    setNewListName(null);
                  }
                  if (e.key === 'Escape') setNewListName(null);
                }}
                onBlur={() => { if (!newListName.trim()) setNewListName(null); }}
              />
              <span className={styles.quickAddHint}>↵ create · esc cancel</span>
            </div>
          ) : (
            <button className={styles.newListBtn} onClick={() => setNewListName('')}>
              + New list
            </button>
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
