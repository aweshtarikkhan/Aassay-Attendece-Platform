import React, { useEffect, useState, useMemo } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee, getCachedEmployee } from '@/lib/employee-utils';

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
  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
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
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto px-3 sm:px-6 pb-32 pt-2">
      {/* Top Header & Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 border border-slate-200/90 dark:border-slate-700 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                My Assigned Tasks
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Review tasks assigned by HR, join scheduled meetings, and update your work progress.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Clean High-Contrast Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">All Tasks</span>
              <span className="text-sm text-slate-400">📋</span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{counts.total}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Assigned to you</p>
          </div>

          <div className="bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl p-3.5 border border-amber-200/80 dark:border-amber-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Pending</span>
              <span className="text-sm">⏳</span>
            </div>
            <p className="text-2xl font-extrabold text-amber-800 dark:text-amber-300 mt-1">{counts.pending}</p>
            <p className="text-[11px] text-amber-600/80 mt-0.5">Awaiting start</p>
          </div>

          <div className="bg-blue-50/70 dark:bg-blue-950/20 rounded-2xl p-3.5 border border-blue-200/80 dark:border-blue-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">In Progress</span>
              <span className="text-sm">🚀</span>
            </div>
            <p className="text-2xl font-extrabold text-blue-800 dark:text-blue-300 mt-1">{counts.inProgress}</p>
            <p className="text-[11px] text-blue-600/80 mt-0.5">Working on it</p>
          </div>

          <div className="bg-emerald-50/70 dark:bg-emerald-950/20 rounded-2xl p-3.5 border border-emerald-200/80 dark:border-emerald-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Done</span>
              <span className="text-sm">✅</span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-300 mt-1">{counts.completed}</p>
            <p className="text-[11px] text-emerald-600/80 mt-0.5">Completed</p>
          </div>
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
