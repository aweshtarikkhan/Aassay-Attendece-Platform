import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { format, isPast, isToday, parseISO } from 'date-fns';
import {
  CheckSquare, Calendar, Clock, AlertCircle, CheckCircle2,
  Filter, Search, RefreshCw, Flag, ArrowRight, PlayCircle,
  PauseCircle, Check, MessageSquare, User, Sparkles, Users,
  History,
  Video,
  Link2,
  ExternalLink,
  ArrowLeft,
  Building2,
  Layers
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee, getCachedEmployee, getCachedBusinessName } from '@/lib/employee-utils';

export interface EmployeeTask {
  id: string;
  org_id: string;
  employee_id: string;
  assigned_employee_ids?: string[];
  assigned_employee_names?: string[];
  title: string;
  description: string | null;
  meeting_link?: string | null;
  task_type?: string;
  status_id: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  activity_history?: Array<{ at: string; actor: string; role: string; action: string; details?: string }> | null;
}

export interface TaskStatus {
  id: string;
  name: string;
  color: string;
  is_completed: boolean;
  order_index: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  amber: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: '⏳' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: '🚀' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', icon: '⏸️' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: '✅' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', icon: '⚠️' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', icon: '📌' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200', icon: '🔹' },
  slate: { bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200', icon: '⚪' },
};

const PRIORITY_BADGES: Record<string, string> = {
  Urgent: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
  High: 'bg-amber-100 text-amber-800 border-amber-300 font-semibold',
  Medium: 'bg-blue-100 text-blue-800 border-blue-300 font-medium',
  Low: 'bg-slate-100 text-slate-700 border-slate-300 font-medium',
};

export default function TasksPage({ session }: { session: any }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (location.state?.fromManage) {
      navigate(-1);
      setTimeout(() => {
        window.dispatchEvent(new Event('open-mobile-menu'));
      }, 50);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  };

  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
  const [businessName, setBusinessName] = useState<string>(() => getCachedBusinessName() || "AassayBiz");
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // Note dialog
  const [noteTask, setNoteTask] = useState<EmployeeTask | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [selectedTask, setSelectedTask] = useState<EmployeeTask | null>(null);

  const getTaskTimeline = (task: EmployeeTask) => {
    if (Array.isArray(task.activity_history) && task.activity_history.length > 0) {
      return task.activity_history;
    }
    const items: Array<{ at: string; actor: string; role: string; action: string; details?: string }> = [];
    if (task.created_at) {
      items.push({
        at: task.created_at,
        actor: task.assigned_by_name || 'Business HR',
        role: 'hr',
        action: 'Task Assigned',
        details: `Priority: ${task.priority || 'Medium'} • Initial Status: ${task.status || 'Pending'}`,
      });
    }
    if (task.updated_at && task.updated_at !== task.created_at) {
      items.push({
        at: task.updated_at,
        actor: 'Team / HR',
        role: 'system',
        action: 'Task Updated',
        details: `Current Status: ${task.status}`,
      });
    }
    if (task.notes) {
      items.push({
        at: task.updated_at || task.created_at,
        actor: employee?.name || 'Employee',
        role: 'employee',
        action: 'Work Note Saved',
        details: task.notes,
      });
    }
    if (task.completed_at) {
      items.push({
        at: task.completed_at,
        actor: employee?.name || 'Employee',
        role: 'employee',
        action: 'Task Completed',
        details: `Marked ${task.status}`,
      });
    }
    return items;
  };

  const { toast } = useToast();

  const getGoogleCalendarUrl = (t: EmployeeTask) => {
    let datesParam = '';
    if (t.due_date) {
      if (t.due_time) {
        const startDt = new Date(`${t.due_date}T${t.due_time}:00+05:30`);
        const endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
        datesParam = `${startDt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}/${endDt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
      } else {
        const cleanStart = t.due_date.replace(/-/g, '');
        const nextDay = new Date(t.due_date);
        nextDay.setDate(nextDay.getDate() + 1);
        const cleanEnd = nextDay.toISOString().slice(0, 10).replace(/-/g, '');
        datesParam = `${cleanStart}/${cleanEnd}`;
      }
    } else {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      datesParam = `${today}/${today}`;
    }

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: t.title,
      details: `${t.description || ''}\n\nAssigned by: ${t.assigned_by_name || 'HR Admin'}\nEmployee Portal: https://attendance.aassaybiz.com/tasks`,
      dates: datesParam,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const empData = await resolveCurrentEmployee(session?.user);
      if (!empData?.id) return;
      setEmployee(empData);
      const bName = empData.organization?.name || getCachedBusinessName();
      if (bName) setBusinessName(bName);

      // 1. Fetch task statuses for the org
      const { data: statusData } = await supabase
        .from('task_statuses')
        .select('*')
        .eq('org_id', empData.org_id)
        .order('order_index', { ascending: true });

      setStatuses(statusData || []);

      // 2. Fetch employee's assigned tasks (both direct assignee and team/multiple assignees)
      const { data: assigneeRows } = await supabase
        .from('task_assignees')
        .select('task_id')
        .eq('employee_id', empData.id);

      const assignedTaskIds = assigneeRows?.map((r: any) => r.task_id) || [];

      let query = supabase.from('employee_tasks').select('*');
      if (assignedTaskIds.length > 0) {
        query = query.or(`employee_id.eq.${empData.id},id.in.(${assignedTaskIds.join(',')})`);
      } else {
        query = query.eq('employee_id', empData.id);
      }

      const { data: taskData, error: taskErr } = await query.order('created_at', { ascending: false });

      if (taskErr) throw taskErr;
      setTasks(taskData || []);
    } catch (err: any) {
      console.error('Error loading employee tasks:', err);
      toast({
        title: 'Error loading tasks',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session?.user?.id]);

  // Handle status update by employee
  const handleUpdateStatus = async (task: EmployeeTask, newStatusName: string) => {
    try {
      setUpdatingTaskId(task.id);
      const matchedStatus = statuses.find((s) => s.name.toLowerCase() === newStatusName.toLowerCase());
      const isCompleted = matchedStatus?.is_completed || newStatusName.toLowerCase() === 'done' || newStatusName.toLowerCase() === 'completed';

      const nowIso = new Date().toISOString();
      const nextHistory = [
        ...getTaskTimeline(task),
        {
          at: nowIso,
          actor: employee?.name || 'Employee',
          role: 'employee',
          action: 'Status Updated',
          details: `${task.status} → ${newStatusName}`,
        },
      ];
      const updatePayload: any = {
        status: newStatusName,
        status_id: matchedStatus?.id || null,
        completed_at: isCompleted ? nowIso : null,
        updated_at: nowIso,
        activity_history: nextHistory,
      };

      // Optimistic state update
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, ...updatePayload } : t))
      );
      setSelectedTask((prev) =>
        prev && prev.id === task.id ? { ...prev, ...updatePayload } : prev
      );

      const { error } = await supabase
        .from('employee_tasks')
        .update(updatePayload)
        .eq('id', task.id);

      if (error) throw error;

      window.dispatchEvent(new Event('tasks_updated'));

      toast({
        title: isCompleted ? '🎉 Task Completed!' : 'Status Updated',
        description: `Task "${task.title}" is now marked as "${newStatusName}".`,
      });
    } catch (err: any) {
      console.error('Failed to update task status:', err);
      toast({
        title: 'Update Failed',
        description: err.message,
        variant: 'destructive',
      });
      loadData();
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Save notes
  const handleSaveNotes = async () => {
    if (!noteTask) return;
    setSavingNote(true);
    try {
      const nowIso = new Date().toISOString();
      const trimmedNote = noteText.trim() || null;
      const nextHistory = [
        ...getTaskTimeline(noteTask),
        {
          at: nowIso,
          actor: employee?.name || 'Employee',
          role: 'employee',
          action: 'Work Note Updated',
          details: trimmedNote || 'Cleared work note',
        },
      ];
      const { error } = await supabase
        .from('employee_tasks')
        .update({ notes: trimmedNote, updated_at: nowIso, activity_history: nextHistory })
        .eq('id', noteTask.id);
      if (error) throw error;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === noteTask.id ? { ...t, notes: trimmedNote, updated_at: nowIso, activity_history: nextHistory } : t
        )
      );
      setSelectedTask((prev) =>
        prev && prev.id === noteTask.id
          ? { ...prev, notes: trimmedNote, updated_at: nowIso, activity_history: nextHistory }
          : prev
      );

      toast({ title: 'Note Saved', description: 'Your task update has been saved.' });
      setNoteTask(null);
    } catch (err: any) {
      toast({ title: 'Error saving note', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title?.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }

      // 2. Tab Filter
      if (activeTab === 'all') return true;
      if (activeTab === 'pending') return t.status.toLowerCase() === 'pending';
      if (activeTab === 'in_progress') {
        const s = t.status.toLowerCase();
        return s === 'working on it' || s === 'in progress' || s === 'in-progress';
      }
      if (activeTab === 'on_hold') {
        const s = t.status.toLowerCase();
        return s === 'on hold' || s === 'hold';
      }
      if (activeTab === 'completed') {
        const s = t.status.toLowerCase();
        return s === 'done' || s === 'completed';
      }
      return t.status.toLowerCase() === activeTab.toLowerCase();
    });
  }, [tasks, searchQuery, activeTab]);

  // Statistics
  const counts = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let onHold = 0;
    let completed = 0;

    tasks.forEach((t) => {
      const s = (t.status || '').toLowerCase();
      if (s === 'pending') pending++;
      else if (s === 'working on it' || s === 'in progress') inProgress++;
      else if (s === 'on hold' || s === 'hold') onHold++;
      else if (s === 'done' || s === 'completed') completed++;
    });

    return { total: tasks.length, pending, inProgress, onHold, completed };
  }, [tasks]);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto px-4 sm:px-6 pb-32 pt-3 sm:pt-4">
      {/* Modern Curved Hero Banner */}
      <div className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] bg-gradient-to-r from-[#0a192f] via-[#0d284e] to-[#1e3a8a] p-5 sm:p-7 shadow-[0_12px_36px_rgba(10,25,47,0.18)] text-white">
        {/* Glow Accents */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-gradient-to-br from-[#2563eb]/30 to-[#ff6b00]/20 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-cyan-400/10 blur-xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center">
              <div className="w-1.5 h-12 sm:h-14 rounded-full bg-gradient-to-b from-cyan-400 via-[#ff6b00] to-[#ff6b00] mr-3 shrink-0 shadow-sm" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                  Task<br />Management
                </h1>
              </div>
            </div>
            <p className="text-xs sm:text-sm font-medium text-blue-100/90 mt-2 sm:mt-2.5 max-w-[260px] sm:max-w-md">
              Organize, track and manage your daily tasks
            </p>
          </div>

          {/* 3D Illustrated Task / Clipboard Graphic */}
          <div className="relative shrink-0 w-24 h-20 sm:w-32 sm:h-28 select-none pointer-events-none">
            <svg viewBox="0 0 140 120" className="w-full h-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M125 15C132 18 135 28 130 35C124 33 120 25 125 15Z" fill="#ff6b00" opacity="0.8" />
              <path d="M132 45C138 48 140 55 136 60C132 58 130 52 132 45Z" fill="#f97316" opacity="0.6" />
              <rect x="24" y="24" width="92" height="80" rx="18" fill="#1e40af" opacity="0.35" transform="rotate(-4 70 64)" />
              <g transform="rotate(-3 70 60)">
                <rect x="26" y="16" width="88" height="84" rx="16" fill="white" />
                <path d="M26 28C26 21.3726 31.3726 16 38 16H102C108.627 16 114 21.3726 114 28V36H26V28Z" fill="url(#task_head)" />
                <rect x="52" y="10" width="36" height="12" rx="4" fill="#ff6b00" />
                <circle cx="70" cy="14" r="2.5" fill="white" />
                <rect x="36" y="46" width="10" height="10" rx="3" fill="#ff6b00" />
                <rect x="52" y="48" width="48" height="6" rx="3" fill="#cbd5e1" />
                <rect x="36" y="62" width="10" height="10" rx="3" fill="#2563eb" />
                <rect x="52" y="64" width="40" height="6" rx="3" fill="#cbd5e1" />
                <rect x="36" y="78" width="10" height="10" rx="3" fill="#10b981" />
                <rect x="52" y="80" width="32" height="6" rx="3" fill="#cbd5e1" />
                <circle cx="98" cy="78" r="15" fill="url(#task_badge)" filter="drop-shadow(0 4px 8px rgba(255,107,0,0.4))" />
                <path d="M93 78L96 81L103 74" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <defs>
                <linearGradient id="task_head" x1="26" y1="16" x2="114" y2="36" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff6b00" />
                  <stop offset="1" stopColor="#ea580c" />
                </linearGradient>
                <linearGradient id="task_badge" x1="84" y1="64" x2="112" y2="92" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff8c00" />
                  <stop offset="1" stopColor="#ff6b00" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* 4 Clean High-Contrast Metric Cards (Compact Height, High Contrast BG & Hover Lift) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div
          onClick={() => setActiveTab('all')}
          className="rounded-2xl p-2.5 sm:p-3 border flex flex-col justify-between transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] bg-gradient-to-br from-white via-slate-50 to-slate-100/70 border-slate-200 shadow-[0_2px_10px_rgba(15,23,42,0.05)] hover:border-slate-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider">All Tasks</span>
            <div className="w-6.5 h-6.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs shadow-2xs">📋</div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-[#0a192f] mt-1">{counts.total}</p>
          <p className="text-[10px] font-semibold text-slate-500 mt-0.5">Assigned to you</p>
        </div>

        <div
          onClick={() => setActiveTab('pending')}
          className="rounded-2xl p-2.5 sm:p-3 border flex flex-col justify-between transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] bg-gradient-to-br from-white via-amber-50/70 to-amber-100/50 border-amber-200/90 shadow-[0_2px_10px_rgba(217,119,6,0.07)] hover:border-amber-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 uppercase tracking-wider">Pending</span>
            <div className="w-6.5 h-6.5 rounded-lg bg-amber-100/80 border border-amber-200 flex items-center justify-center text-xs shadow-2xs">⏳</div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-600 mt-1">{counts.pending}</p>
          <p className="text-[10px] font-semibold text-amber-700 mt-0.5">Awaiting start</p>
        </div>

        <div
          onClick={() => setActiveTab('in_progress')}
          className="rounded-2xl p-2.5 sm:p-3 border flex flex-col justify-between transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] bg-gradient-to-br from-white via-blue-50/70 to-blue-100/50 border-blue-200/90 shadow-[0_2px_10px_rgba(37,99,235,0.07)] hover:border-blue-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-blue-800 uppercase tracking-wider">In Progress</span>
            <div className="w-6.5 h-6.5 rounded-lg bg-blue-100/80 border border-blue-200 flex items-center justify-center text-xs shadow-2xs">🚀</div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-600 mt-1">{counts.inProgress}</p>
          <p className="text-[10px] font-semibold text-blue-700 mt-0.5">Working on it</p>
        </div>

        <div
          onClick={() => setActiveTab('completed')}
          className="rounded-2xl p-2.5 sm:p-3 border flex flex-col justify-between transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] bg-gradient-to-br from-white via-emerald-50/70 to-emerald-100/50 border-emerald-200/90 shadow-[0_2px_10px_rgba(5,150,105,0.07)] hover:border-emerald-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Done</span>
            <div className="w-6.5 h-6.5 rounded-lg bg-emerald-100/80 border border-emerald-200 flex items-center justify-center text-xs shadow-2xs">✅</div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">{counts.completed}</p>
          <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">Completed</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: `All (${counts.total})` },
            { id: 'pending', label: `Pending (${counts.pending})` },
            { id: 'in_progress', label: `In Progress (${counts.inProgress})` },
            { id: 'on_hold', label: `On Hold (${counts.onHold})` },
            { id: 'completed', label: `Done (${counts.completed})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/70 dark:border-slate-700/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white"
          />
        </div>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 text-slate-400 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin text-orange-500 mb-2" />
          <p className="text-sm font-medium">Loading your tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="p-16 text-center bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-3xl shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/30 text-orange-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <CheckSquare className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">No tasks found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
            {searchQuery
              ? 'No tasks match your search query.'
              : activeTab === 'all'
              ? 'You do not have any tasks assigned by HR right now.'
              : `No tasks currently marked as "${activeTab.replace('_', ' ')}".`}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const isCompleted = task.status.toLowerCase() === 'done' || task.status.toLowerCase() === 'completed';
            const isOverdue = task.due_date && task.due_date < todayStr && !isCompleted;
            const isDueToday = task.due_date === todayStr;

            const statusMatch = statuses.find((s) => s.name.toLowerCase() === task.status.toLowerCase());
            const colorMeta = STATUS_COLORS[statusMatch?.color || 'blue'] || STATUS_COLORS.blue;
            const priorityClass = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.Medium;

            return (
              <Card
                key={task.id}
                onClick={() => setSelectedTask(task)}
                title="Click to view task details & activity history"
                className={`p-4 sm:p-5 bg-white dark:bg-slate-800 border rounded-2xl transition-all shadow-xs hover:shadow-md cursor-pointer ${
                  isCompleted
                    ? 'border-emerald-200/90 bg-emerald-50/15'
                    : isOverdue
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-slate-200/90 dark:border-slate-700'
                }`}
              >
                {/* Vertical Structured Content - No Column Squishing */}
                <div className="flex flex-col gap-3">
                  
                  {/* Row 1: Header (Title, Badges, Join Meeting Link) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug ${
                        isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : ''
                      }`}>
                        {task.title}
                      </h3>

                      <Badge variant="outline" className={`text-[11px] px-2.5 py-0.5 rounded-md font-semibold ${priorityClass}`}>
                        <Flag className="w-3 h-3 mr-1" />
                        {task.priority} Priority
                      </Badge>

                      <Badge variant="outline" className={`text-[11px] px-2.5 py-0.5 font-bold rounded-md border ${colorMeta.bg} ${colorMeta.text} ${colorMeta.border}`}>
                        {colorMeta.icon} {task.status}
                      </Badge>

                      {task.assigned_employee_names && task.assigned_employee_names.length > 1 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                          <Users className="w-3 h-3 text-indigo-600" />
                          Team Task ({task.assigned_employee_names.length})
                        </span>
                      )}
                    </div>

                    {/* Quick Meeting & Calendar Launchers */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {task.meeting_link && (
                        <a
                          href={task.meeting_link}
                          onClick={(e) => e.stopPropagation()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm active:scale-95 transition-all"
                          title="Join Online Meeting / Video Call"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Join Meeting</span>
                          <ExternalLink className="w-3 h-3 opacity-80" />
                        </a>
                      )}

                      {task.due_date && (
                        <a
                          href={getGoogleCalendarUrl(task)}
                          onClick={(e) => e.stopPropagation()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                          title="Add to Google Calendar"
                        >
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          <span className="hidden sm:inline">Add to Calendar</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Description */}
                  {task.description && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {task.description}
                    </div>
                  )}

                  {/* Row 3: Metadata Details */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                    {task.due_date && (
                      <div className="flex items-center gap-1.5 font-medium">
                        <Calendar className={`w-3.5 h-3.5 ${isOverdue ? 'text-rose-600' : isDueToday ? 'text-amber-600' : 'text-slate-400'}`} />
                        <span className={isOverdue ? 'text-rose-600 font-bold' : isDueToday ? 'text-amber-600 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                          Due: {format(parseISO(task.due_date), 'dd MMM yyyy')}
                          {task.due_time && ` at ${task.due_time}`}
                        </span>
                        {isOverdue && (
                          <span className="text-[10px] text-rose-700 font-bold uppercase bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded">
                            Overdue
                          </span>
                        )}
                        {isDueToday && (
                          <span className="text-[10px] text-amber-800 font-bold uppercase bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                            Due Today
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Assigned by <strong className="text-slate-700 dark:text-slate-200 font-semibold">{task.assigned_by_name || 'Business HR'}</strong></span>
                    </div>

                    {task.completed_at && (
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Finished {format(new Date(task.completed_at), 'dd MMM, hh:mm a')}</span>
                      </div>
                    )}
                  </div>

                  {/* Row 4: Work Note (if present) */}
                  {task.notes && (
                    <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <strong className="text-amber-900 dark:text-amber-300 font-semibold block text-[11px] mb-0.5">Your Work Note:</strong>
                        <p className="whitespace-pre-line">{task.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Row 5: Footer Actions Strip (Change Status Buttons & Add Note) */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
                        Change Status:
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {statuses.length > 0 ? (
                          statuses.map((s) => {
                            const isCurrent = task.status.toLowerCase() === s.name.toLowerCase();
                            return (
                              <button
                                key={s.id}
                                type="button"
                                disabled={updatingTaskId === task.id}
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(task, s.name); }}
                                className={`py-1.5 px-3 text-xs rounded-xl font-semibold transition-all border ${
                                  isCurrent
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95'
                                }`}
                              >
                                {s.name}
                              </button>
                            );
                          })
                        ) : (
                          ['Pending', 'Working on it', 'On Hold', 'Done'].map((st) => {
                            const isCurrent = task.status.toLowerCase() === st.toLowerCase();
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={updatingTaskId === task.id}
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(task, st); }}
                                className={`py-1.5 px-3 text-xs rounded-xl font-semibold transition-all border ${
                                  isCurrent
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95'
                                }`}
                              >
                                {st}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNoteTask(task);
                        setNoteText(task.notes || '');
                      }}
                      className="h-8 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 rounded-xl gap-1.5 shrink-0 self-start sm:self-auto"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                      {task.notes ? 'Edit Note' : 'Add Note'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Task Detail & Activity History Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => { if (!open) setSelectedTask(null); }}>
        <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto bg-white border-slate-200 text-slate-900 shadow-2xl p-6 rounded-3xl">
          {selectedTask && (() => {
            const timeline = getTaskTimeline(selectedTask);
            const isCompleted = selectedTask.status.toLowerCase() === 'done' || selectedTask.status.toLowerCase() === 'completed';
            return (
              <>
                <DialogHeader className="border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${PRIORITY_BADGES[selectedTask.priority] || PRIORITY_BADGES.Medium}`}>
                      {selectedTask.priority} Priority
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {selectedTask.status}
                    </span>
                  </div>
                  <DialogTitle className={`text-lg font-bold text-slate-900 ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                    {selectedTask.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Assigned by {selectedTask.assigned_by_name || 'Business HR'}
                    {selectedTask.due_date ? ` • Due: ${format(parseISO(selectedTask.due_date), 'dd MMM yyyy')}${selectedTask.due_time ? ` at ${selectedTask.due_time}` : ''}` : ''}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  {selectedTask.description && (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {selectedTask.description}
                    </div>
                  )}

                  {selectedTask.assigned_employee_names && selectedTask.assigned_employee_names.length > 0 && (
                    <div className="text-xs">
                      <span className="font-semibold text-slate-600 block mb-1.5">Assigned Team Members:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.assigned_employee_names.map((memberName: string, idx: number) => (
                          <span key={idx} className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium text-[11px]">
                            {memberName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedTask.meeting_link || selectedTask.due_date) && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.meeting_link && (
                        <a
                          href={selectedTask.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                        >
                          <Video className="w-3.5 h-3.5" /> Join Meeting <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <a
                        href={getGoogleCalendarUrl(selectedTask)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Add to Google Calendar
                      </a>
                    </div>
                  )}

                  {selectedTask.notes && (
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950">
                      <span className="font-bold block mb-0.5">Your Latest Work Note:</span>
                      {selectedTask.notes}
                    </div>
                  )}

                  {/* Quick Status Change */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Update Status</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(statuses.length > 0 ? statuses.map((s) => s.name) : ['Pending', 'Working on it', 'On Hold', 'Done']).map((stName) => {
                        const active = selectedTask.status.toLowerCase() === stName.toLowerCase();
                        return (
                          <button
                            key={stName}
                            type="button"
                            disabled={updatingTaskId === selectedTask.id}
                            onClick={() => handleUpdateStatus(selectedTask, stName)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {stName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Task Activity History Timeline */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                      <History className="w-3.5 h-3.5 text-orange-600" />
                      Task Activity History ({timeline.length})
                    </div>
                    {timeline.length === 0 ? (
                      <p className="text-xs text-slate-400">No activity recorded yet.</p>
                    ) : (
                      <div className="space-y-2.5 border-l-2 border-slate-200 pl-3 ml-1">
                        {timeline.map((ev, idx) => (
                          <div key={idx} className="relative text-xs">
                            <span className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-semibold text-slate-800">{ev.action}</span>
                              <span className="text-[11px] text-slate-400">
                                {ev.at ? format(parseISO(ev.at), 'dd MMM yyyy, hh:mm a') : ''}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              By {ev.actor}{ev.details ? ` — ${ev.details}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="border-t border-slate-100 pt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNoteText(selectedTask.notes || '');
                      setNoteTask(selectedTask);
                    }}
                    className="gap-1.5 text-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {selectedTask.notes ? 'Edit Work Note' : 'Add Work Note'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedTask(null)}
                    className="text-xs"
                  >
                    Close
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Note Update Dialog */}
      <Dialog open={!!noteTask} onOpenChange={(open) => { if (!open) setNoteTask(null); }}>
        <DialogContent className="max-w-md bg-white border-slate-200 text-slate-900 shadow-2xl p-6 rounded-3xl">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-base font-bold text-slate-900">
              Add Task Work Note
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Enter any update, questions, or completion remarks for HR regarding "{noteTask?.title}".
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            <textarea
              rows={4}
              placeholder="e.g. Completed initial draft, waiting on client approval, need invoice copies..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNoteTask(null)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={savingNote}
              onClick={handleSaveNotes}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
            >
              {savingNote ? 'Saving...' : 'Save Work Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
