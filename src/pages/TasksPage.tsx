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

      const updatePayload: any = {
        status: newStatusName,
        status_id: matchedStatus?.id || null,
        completed_at: isCompleted ? new Date().toISOString() : null,
      };

      // Optimistic state update
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, ...updatePayload } : t))
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
      const { error } = await supabase
        .from('employee_tasks')
        .update({ notes: noteText.trim() || null })
        .eq('id', noteTask.id);

      if (error) throw error;

      setTasks((prev) =>
        prev.map((t) => (t.id === noteTask.id ? { ...t, notes: noteText.trim() || null } : t))
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
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto px-2 sm:px-4 pb-32">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#0d213b] to-[#1e3a5f] rounded-2xl p-4 sm:p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <CheckSquare className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
          </div>
          <p className="text-sm text-blue-100/80 max-w-xl mt-1">
            View tasks assigned by your HR, schedule your work, and update task progress (Working on it, On Hold, or Done).
          </p>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/15">
              <span className="text-xs text-blue-200 font-medium">All Tasks</span>
              <p className="text-xl font-bold text-white mt-0.5">{counts.total}</p>
            </div>
            <div className="bg-amber-500/20 backdrop-blur-sm rounded-xl p-3 border border-amber-500/30">
              <span className="text-xs text-amber-200 font-medium">⏳ Pending</span>
              <p className="text-xl font-bold text-amber-300 mt-0.5">{counts.pending}</p>
            </div>
            <div className="bg-blue-500/20 backdrop-blur-sm rounded-xl p-3 border border-blue-500/30">
              <span className="text-xs text-blue-200 font-medium">🚀 Working On It</span>
              <p className="text-xl font-bold text-blue-300 mt-0.5">{counts.inProgress}</p>
            </div>
            <div className="bg-emerald-500/20 backdrop-blur-sm rounded-xl p-3 border border-emerald-500/30">
              <span className="text-xs text-emerald-200 font-medium">✅ Done</span>
              <p className="text-xl font-bold text-emerald-300 mt-0.5">{counts.completed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
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
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
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
            className="pl-9 h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white"
          />
        </div>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <RefreshCw className="w-7 h-7 animate-spin text-orange-500 mb-2" />
          <p className="text-sm">Loading your tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="p-12 text-center bg-white border-slate-200 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto mb-3">
            <CheckSquare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No tasks found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {searchQuery
              ? 'No tasks match your search query.'
              : activeTab === 'all'
              ? 'You do not have any tasks assigned by HR right now.'
              : `No tasks currently marked as "${activeTab.replace('_', ' ')}".`}
          </p>
        </Card>
      ) : (
        <div className="space-y-3.5">
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
                className={`p-4 bg-white border transition-all shadow-xs hover:shadow-md ${
                  isCompleted
                    ? 'border-emerald-200/80 bg-emerald-50/20'
                    : isOverdue
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Task Info */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-base font-bold text-slate-900 leading-snug ${isCompleted ? 'line-through text-slate-500' : ''}`}>
                        {task.title}
                      </h3>
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${priorityClass}`}>
                        <Flag className="w-2.5 h-2.5 mr-1" />
                        {task.priority}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-bold border ${colorMeta.bg} ${colorMeta.text} ${colorMeta.border}`}>
                        {colorMeta.icon} {task.status}
                      </Badge>
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line pt-0.5">
                        {task.description}
                      </p>
                    )}

                    {/* Due Date & Assignment info */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 pt-1">
                      {task.due_date && (
                        <div className="flex items-center gap-1.5 font-medium">
                          <Calendar className={`w-3.5 h-3.5 ${isOverdue ? 'text-rose-600' : isDueToday ? 'text-amber-600' : 'text-slate-400'}`} />
                          <span className={isOverdue ? 'text-rose-600 font-bold' : isDueToday ? 'text-amber-600 font-bold' : 'text-slate-700'}>
                            Due: {format(parseISO(task.due_date), 'dd MMM yyyy')}
                            {task.due_time && ` at ${task.due_time}`}
                          </span>
                          {isOverdue && (
                            <span className="text-[10px] text-rose-600 font-bold uppercase bg-rose-100 px-1.5 py-0.2 rounded">
                              Overdue
                            </span>
                          )}
                          {isDueToday && (
                            <span className="text-[10px] text-amber-700 font-bold uppercase bg-amber-100 px-1.5 py-0.2 rounded">
                              Due Today
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <User className="w-3 h-3" />
                        <span>Assigned by {task.assigned_by_name || 'HR Admin'}</span>
                      </div>

                      {task.assigned_employee_names && task.assigned_employee_names.length > 1 && (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          <Users className="w-3 h-3 text-indigo-600" />
                          <span>Team Task ({task.assigned_employee_names.length}): {task.assigned_employee_names.join(', ')}</span>
                        </div>
                      )}

                      {task.completed_at && (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Finished {format(new Date(task.completed_at), 'dd MMM, hh:mm a')}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons: Google Calendar + Join Meeting Link */}
                    <div className="flex flex-wrap items-center gap-2 pt-1.5">
                      {task.due_date && (
                        <a
                          href={getGoogleCalendarUrl(task)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors shadow-2xs"
                          title="Open and sync with Google Calendar"
                        >
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          <span>Add to Google Calendar</span>
                        </a>
                      )}

                      {task.meeting_link && (
                        <a
                          href={task.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm active:scale-95 transition-all"
                          title="Join Online Meeting / Video Call"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Join Meeting</span>
                          <ExternalLink className="w-3 h-3 opacity-80" />
                        </a>
                      )}
                    </div>

                    {/* Employee Remarks / Notes if present */}
                    {task.notes && (
                      <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                        <strong className="text-slate-800 font-semibold block text-[11px] mb-0.5">Your Work Note:</strong>
                        {task.notes}
                      </div>
                    )}
                  </div>

                  {/* Status & Actions Strip (Mobile Friendly) */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Change Status:
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNoteTask(task);
                          setNoteText(task.notes || '');
                        }}
                        className="sm:hidden h-7 px-2.5 text-[11px] font-medium gap-1 text-slate-700 bg-slate-50 border-slate-200"
                      >
                        <MessageSquare className="w-3 h-3 text-slate-500" />
                        {task.notes ? 'Edit Note' : 'Add Note'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 xs:grid-cols-4 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto">
                      {statuses.length > 0 ? (
                        statuses.map((s) => {
                          const isCurrent = task.status.toLowerCase() === s.name.toLowerCase();
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={updatingTaskId === task.id}
                              onClick={() => handleUpdateStatus(task, s.name)}
                              className={`py-1.5 px-2 text-xs rounded-lg font-semibold transition-all border text-center ${
                                isCurrent
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 active:scale-95'
                              }`}
                            >
                              {s.name}
                            </button>
                          );
                        })
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(task, 'Pending')}
                            className={`py-1.5 px-2 text-xs rounded-lg font-semibold border text-center ${
                              task.status === 'Pending' ? 'bg-amber-600 text-white' : 'bg-white text-amber-700 border-amber-300'
                            }`}
                          >
                            Pending
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(task, 'Working on it')}
                            className={`py-1.5 px-2 text-xs rounded-lg font-semibold border text-center ${
                              task.status === 'Working on it' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border-blue-300'
                            }`}
                          >
                            Working on it
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(task, 'On Hold')}
                            className={`py-1.5 px-2 text-xs rounded-lg font-semibold border text-center ${
                              task.status === 'On Hold' ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border-purple-300'
                            }`}
                          >
                            On Hold
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(task, 'Done')}
                            className={`py-1.5 px-2 text-xs rounded-lg font-semibold border text-center ${
                              task.status === 'Done' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 border-emerald-300'
                            }`}
                          >
                            Done
                          </button>
                        </>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNoteTask(task);
                        setNoteText(task.notes || '');
                      }}
                      className="hidden sm:inline-flex h-8 px-2.5 text-xs text-slate-700 hover:bg-slate-50 gap-1.5 shrink-0"
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

      {/* Note Update Dialog */}
      <Dialog open={!!noteTask} onOpenChange={(open) => { if (!open) setNoteTask(null); }}>
        <DialogContent className="max-w-md bg-white border-slate-200 text-slate-900 shadow-2xl p-6">
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
              className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNoteTask(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={savingNote}
              onClick={handleSaveNotes}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            >
              {savingNote ? 'Saving...' : 'Save Work Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
