import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {  LayoutDashboard, History, CalendarDays, Umbrella, HelpCircle, Bell, LogOut, Moon, Sun, X, CheckCircle2, Menu, ChevronRight, ArrowLeft, Fingerprint, Settings, Home, FileCheck, CheckSquare, Receipt, LayoutGrid } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee, getCachedBusinessName, getCachedOrganization, getCachedEmployee, saveEmployeeCache, clearEmployeeCache } from '@/lib/employee-utils';
import { captureAccurateLocation } from '@/lib/geo-utils';
import { computeShiftStatus } from '@/lib/shift-utils';
import logoImg from '@/assets/logo.png';




/**
 * Format business/organization name for mobile display:
 * Limits name to maximum 4 words AND maximum 40 characters (whichever is reached first)
 * and appends '...' gracefully so mobile top header never breaks or overflows.
 */
function formatBusinessName(name?: string, maxChars = 40): string {
  const effective = (name || getCachedBusinessName() || '').trim();
  if (!effective) return '';

  if (effective.length > maxChars) {
    return effective.slice(0, maxChars).trim() + '...';
  }
  return effective;
}

export default function DashboardLayout() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadLeaves, setUnreadLeaves] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const [organization, setOrganization] = useState<any>(() => getCachedOrganization());
  const [businessName, setBusinessName] = useState<string>(() => getCachedBusinessName());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Force light mode
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  const fetchTodayRecord = async (empData: any) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: todayData } = await supabase
      .from('attendances')
      .select('*')
      .eq('employee_id', empData.id)
      .eq('date', today)
      .maybeSingle();
    setTodayRecord(todayData);
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      const empData = await resolveCurrentEmployee(session?.user);
      if (!empData || empData.is_active === false) {
        setEmployee(null);
        clearEmployeeCache();
        await supabase.auth.signOut();
        toast({
          title: 'Access Denied',
          description: 'Email ID & password mismatch or you do not have access to Attendance Portal. Please contact your organization administrator.',
          variant: 'destructive',
        });
        navigate('/login');
        return;
      }

      setEmployee(empData);
      const resolvedOrg = empData.organization;
      if (resolvedOrg?.name) {
        setOrganization(resolvedOrg);
        setBusinessName(resolvedOrg.name);
      } else if (empData.org_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', empData.org_id)
          .maybeSingle();
        if (orgData) {
          setOrganization(orgData);
          setBusinessName(orgData.name || '');
          saveEmployeeCache(empData, orgData);
        }
      }

      const { data: notifs } = await supabase
        .from('notifications').select('*').eq('user_id', empData.auth_user_id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (notifs) {
        setNotifications(notifs);
        // Count unread leave notifications
        const leaveNotifs = notifs.filter((n: any) => !n.is_read && (n.type === 'leave_approved' || n.type === 'leave_rejected' || n.type === 'leave_request'));
        setUnreadLeaves(leaveNotifs.length);
      }

      // Check active tasks count (both primary and team assignees)
      try {
        const { data: aRows } = await supabase
          .from('task_assignees')
          .select('task_id')
          .eq('employee_id', empData.id);
        const aTaskIds = aRows?.map((r: any) => r.task_id) || [];

        let tQ = supabase.from('employee_tasks').select('id, status');
        if (aTaskIds.length > 0) {
          tQ = tQ.or(`employee_id.eq.${empData.id},id.in.(${aTaskIds.join(',')})`);
        } else {
          tQ = tQ.eq('employee_id', empData.id);
        }

        const { data: activeTasks } = await tQ;
        if (activeTasks) {
          const pendingCount = activeTasks.filter(
            (t: any) => !['done', 'completed'].includes((t.status || '').toLowerCase())
          ).length;
          setPendingTasks(pendingCount);
        }
      } catch (tErr) {
        console.error("Error fetching tasks count:", tErr);
      }
    };
    checkUser();
  }, [navigate]);

  const handleClockInOut = async (type: 'in' | 'out') => {
    if (!employee) return;
    
    const confirmMessage = type === 'in' ? "Are you sure you want to Clock In?" : "Are you sure you want to Clock Out?";
    if (!window.confirm(confirmMessage)) return;

    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      const today = format(new Date(), 'yyyy-MM-dd');

      // Capture GPS and IP fallback location
      const locationData = await captureAccurateLocation();

      if (type === 'in') {
        let empShift = null;
        try {
          const { data: sData } = await supabase.from('employee_shifts').select('shifts(*)').eq('employee_id', employee.id).maybeSingle();
          empShift = sData?.shifts;
        } catch {}
        const computedStatus = computeShiftStatus(now, empShift);

        const { error, data } = await supabase.from('attendances').upsert({
          employee_id: employee.id,
          org_id: employee.org_id,
          date: today,
          clock_in_time: now,
          clock_in_location: locationData,
          status: computedStatus
        }, { onConflict: 'employee_id,date' }).select().single();
        if (error) throw error;

        // Also sync to attendance (singular) table
        try {
          await (supabase as any).from('attendance').upsert({
            employee_id: employee.id,
            org_id: employee.org_id,
            attendance_date: today,
            clock_in_time: now,
            clock_in_location: locationData,
            status: computedStatus
          }, { onConflict: 'employee_id,attendance_date' });
        } catch (syncErr) {
          console.warn("Sync to attendance (singular) failed:", syncErr);
        }

        setTodayRecord(data);
        toast({ 
          title: 'Clocked In', 
          description: locationData?.address ? `Attendance marked: ${locationData.address}` : 'Attendance marked.' 
        });
        window.dispatchEvent(new Event('attendance_updated'));
      } else {
        let punchId = todayRecord?.id;
        if (!punchId) {
          const { data: openPunch } = await supabase
            .from('attendances')
            .select('id')
            .eq('employee_id', employee.id)
            .not('clock_in_time', 'is', null)
            .is('clock_out_time', null)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();
          punchId = openPunch?.id;
        }

        if (!punchId) {
          toast({
            title: 'No Active Clock-In Found',
            description: 'Could not find an active clock-in session to clock out.',
            variant: 'destructive',
          });
          return;
        }

        const { error, data } = await supabase.from('attendances').update({
          clock_out_time: now,
          clock_out_location: locationData,
        }).eq('id', punchId).select().maybeSingle();
        if (error) throw error;

        // Also sync clock out to attendance (singular) table
        try {
          await (supabase as any).from('attendance').update({
            clock_out_time: now,
            clock_out_location: locationData,
          })
          .eq('employee_id', employee.id)
          .eq('attendance_date', today);
        } catch (syncErr) {
          console.warn("Sync clock out to attendance (singular) failed:", syncErr);
        }

        setTodayRecord(data);
        toast({ 
          title: 'Clocked Out', 
          description: locationData?.address ? `Clock-out saved: ${locationData.address}` : 'Your shift has ended.' 
        });
        window.dispatchEvent(new Event('attendance_updated'));
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    clearEmployeeCache();
    await supabase.auth.signOut();
    navigate('/login');
  };


  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // Audio autoplay policy
    }
  };

  useEffect(() => {
    if (!employee) return;

    // Real-time listener for new chat messages

    // Real-time listener for notifications table (for group chat notifications)
    const notifChannel = supabase
      .channel('dashboard-notifications-' + employee.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${employee.auth_user_id}` },
        (payload) => {
          const notif = payload.new as any;
          if (notif.type !== 'chat') {
            setNotifications(prev => {
              if (prev.find(n => n.id === notif.id)) return prev;
              return [notif, ...prev].slice(0, 15);
            });
          }
          // Update leave unread count
          if (['leave_approved', 'leave_rejected', 'leave_request'].includes(notif.type)) {
            setUnreadLeaves(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [employee]);

  // Auto-clear leave notifications when visiting /leaves
  useEffect(() => {
    if (location.pathname === '/leaves' && employee) {
      setNotifications(prev => prev.filter(n => !['leave_approved', 'leave_rejected', 'leave_request'].includes(n.type)));
      supabase.from('notifications')
        .update({ is_read: true })
        .in('type', ['leave_approved', 'leave_rejected', 'leave_request'])
        .eq('user_id', employee.auth_user_id)
        .eq('is_read', false)
        .then();
    }
  }, [location.pathname, employee]);

  // Listen for custom 'open-mobile-menu' event (mobile only) and close if resized to desktop
  useEffect(() => {
    const handleOpenMenu = () => {
      if (window.innerWidth < 768) {
        setMobileMenuOpen(true);
      }
    };
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('open-mobile-menu', handleOpenMenu);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('open-mobile-menu', handleOpenMenu);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Listen for 'tasks_updated' event to refresh pending task count
  useEffect(() => {
    const refreshTasksCount = async () => {
      if (!employee?.id) return;
      try {
        const { data: aRows } = await supabase
          .from('task_assignees')
          .select('task_id')
          .eq('employee_id', employee.id);
        const aTaskIds = aRows?.map((r: any) => r.task_id) || [];

        let tQ = supabase.from('employee_tasks').select('id, status');
        if (aTaskIds.length > 0) {
          tQ = tQ.or(`employee_id.eq.${employee.id},id.in.(${aTaskIds.join(',')})`);
        } else {
          tQ = tQ.eq('employee_id', employee.id);
        }

        const { data: activeTasks } = await tQ;
        if (activeTasks) {
          const pendingCount = activeTasks.filter(
            (t: any) => !['done', 'completed'].includes((t.status || '').toLowerCase())
          ).length;
          setPendingTasks(pendingCount);
        }
      } catch (err) {}
    };

    window.addEventListener('tasks_updated', refreshTasksCount);
    return () => window.removeEventListener('tasks_updated', refreshTasksCount);
  }, [employee]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllAsRead = async () => {
    if (!employee) return;
    await supabase
      .from('notifications')
      .update({ is_read: true }).eq('user_id', employee.auth_user_id)
      .eq('is_read', false);
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    setUnreadLeaves(0);
  };

  const navItems = [
    { name: 'History', icon: History, path: '/history', isMenu: false },
    { name: 'Leaves', icon: Umbrella, path: '/leaves', isMenu: false },
    { name: 'Home', icon: Home, path: '/dashboard', isMenu: false },
    { name: 'Tasks', icon: CheckSquare, path: '/tasks', isMenu: false },
    { name: 'Manage', icon: LayoutGrid, path: '#', isMenu: true },
  ];

  const sidebarNavItems = [
    { name: 'Home', icon: Home, path: '/dashboard' },
    { name: 'Tasks', icon: CheckSquare, path: '/tasks' },
    { name: 'History', icon: History, path: '/history' },
    { name: 'Leaves', icon: Umbrella, path: '/leaves' },
    { name: 'Expenses', icon: Receipt, path: '/expenses' },
    { name: 'Documents', icon: FileCheck, path: '/documents' },
    { name: 'Holidays', icon: CalendarDays, path: '/holidays' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  const manageTileItems = [
    { name: 'Home', subtitle: 'Punch & Overview', icon: Home, path: '/dashboard', iconBg: 'bg-orange-500 text-white' },
    { name: 'Tasks', subtitle: pendingTasks > 0 ? `${pendingTasks} Pending` : 'Work & Goals', icon: CheckSquare, path: '/tasks', iconBg: 'bg-amber-500 text-white' },
    { name: 'Expenses', subtitle: 'Travel & Claims', icon: Receipt, path: '/expenses', iconBg: 'bg-emerald-500 text-white' },
    { name: 'Leaves', subtitle: unreadLeaves > 0 ? `${unreadLeaves} New Update` : 'Apply & Balance', icon: Umbrella, path: '/leaves', iconBg: 'bg-blue-500 text-white' },
    { name: 'History', subtitle: 'Punches & Logs', icon: History, path: '/history', iconBg: 'bg-indigo-500 text-white' },
    { name: 'Documents', subtitle: 'Files & Letters', icon: FileCheck, path: '/documents', iconBg: 'bg-violet-500 text-white' },
    { name: 'Holidays', subtitle: 'Holiday List', icon: CalendarDays, path: '/holidays', iconBg: 'bg-cyan-600 text-white' },
    { name: 'Settings', subtitle: 'App Preferences', icon: Settings, path: '/settings', iconBg: 'bg-slate-700 text-white' },
  ];

  // Get dot indicator for nav items
  const getNavDot = (itemName: string) => {
    if (itemName === 'Tasks' && pendingTasks > 0) return true;
    if (itemName === 'Leaves' && unreadLeaves > 0) return true;
    return false;
  };
  
  const sidebarContent = (
    <>
      <div className="h-16 flex items-center px-6 border-b border-white/10 bg-[#0a192f] text-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/95 px-4 py-2 rounded-xl shadow-sm w-full flex justify-center border border-white/20">
            <img src={logoImg} alt="AassayBiz" className="h-9 w-auto object-contain" />
          </div>
        </div>
      </div>
      
      {/* Profile section in sidebar */}
      <NavLink to="/profile" onClick={() => setMobileMenuOpen(false)} className="p-4 border-b border-white/10 bg-[#0d213b] hover:bg-white/5 transition-colors flex items-center justify-between cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-lg shadow-sm shrink-0 overflow-hidden">
            {employee?.avatar_url || employee?.profile_image ? (
              <img src={employee.avatar_url || employee.profile_image} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              employee?.name?.charAt(0) || 'E'
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white">{employee?.name || 'Employee'}</span>
            <span className="text-xs text-blue-200">{employee?.designation || 'Staff'}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-white/50" />
      </NavLink>

      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto bg-[#0a192f]">
        {sidebarNavItems.map((item) => {
          const hasDot = getNavDot(item.name);
          return (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'text-blue-100 hover:bg-white/10'
                }`
              }
            >
              <div className="flex items-center">
                <div className="relative mr-3 shrink-0">
                  <item.icon className="w-5 h-5" />
                  {hasDot && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0a192f] animate-pulse" />
                  )}
                </div>
                <span>{item.name}</span>
              </div>
              {hasDot && item.name === 'Tasks' && pendingTasks > 0 && (
                <span className="flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white shadow-sm">
                  {pendingTasks}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-white/10 bg-[#0a192f]">
        <button 
          onClick={handleLogout}
          className="flex items-center justify-center w-full px-4 py-2.5 text-sm font-medium text-white bg-white/10 border border-white/20 rounded-lg hover:bg-red-500 hover:border-red-500 transition-all shadow-sm active:scale-95"
        >
          <LogOut className="w-4 h-4 mr-2 shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  );

  const manageSheetContent = (
    <div className="flex flex-col h-full bg-white text-slate-900">
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 bg-white shrink-0 pr-12">
        <img src={logoImg} alt="AassayBiz" className="h-8 w-auto object-contain" />
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
          Manage
        </span>
      </div>

      {/* Employee Profile Tile */}
      <div className="px-4 pt-4 pb-2 bg-white">
        <NavLink
          to="/profile"
          onClick={() => setMobileMenuOpen(false)}
          className="p-3 rounded-2xl border border-slate-200 bg-slate-50/80 hover:border-orange-300 hover:bg-orange-50/40 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-base shrink-0 overflow-hidden border border-orange-200">
              {employee?.avatar_url || employee?.profile_image ? (
                <img src={employee.avatar_url || employee.profile_image} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                employee?.name?.charAt(0) || 'E'
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-900 truncate">{employee?.name || 'Employee'}</span>
              <span className="text-xs text-slate-500 truncate">{employee?.designation || 'Staff'} • Profile</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </NavLink>
      </div>

      {/* White-Background Tiles Grid for All Pages */}
      <div className="flex-1 px-4 py-3 overflow-y-auto bg-white">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 px-1">
          Manage Pages
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {manageTileItems.map((item) => {
            const hasDot = getNavDot(item.name);
            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center text-center gap-2 p-3.5 rounded-2xl border transition-all active:scale-95 ${
                    isActive
                      ? 'bg-orange-50/80 border-orange-400 shadow-sm ring-1 ring-orange-200'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`
                }
              >
                {hasDot && item.name === 'Tasks' && pendingTasks > 0 ? (
                  <span className="absolute top-2.5 right-2.5 min-w-[20px] h-5 px-1.5 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingTasks}
                  </span>
                ) : hasDot ? (
                  <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                ) : null}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-xs shrink-0 ${item.iconBg}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 w-full">
                  <div className="text-sm font-bold text-slate-900 leading-tight truncate">{item.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">{item.subtitle}</div>
                </div>
              </NavLink>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5 shrink-0" />
          Back
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all active:scale-95"
        >
          <LogOut className="w-3.5 h-3.5 mr-1.5 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full bg-gray-50 dark:bg-slate-900 overflow-hidden transition-colors">
      {/* Mobile-Only Full-Page Bottom Pop-Up Manage Sheet (White Background Tiles) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden p-0 inset-0 w-full max-w-full h-[100dvh] bg-white border-0 text-slate-900 flex flex-col z-[100000] data-[state=open]:duration-300 data-[state=closed]:duration-200"
        >
          {manageSheetContent}
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#0a192f] flex-col transition-colors z-20 shadow-xl">
        {sidebarContent}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
        {/* Header - Dark Blue AassayBiz Theme */}
        <header className="h-14 bg-[#0a192f] flex items-center justify-between px-4 md:px-8 z-10 shrink-0 shadow-md">
          <div className="flex items-center min-w-0 mr-2 flex-1">
            {/* Mobile Hamburger Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden mr-2.5 p-1.5 -ml-1 text-white hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center shrink-0 cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Mobile App Title */}
            <div className="md:hidden flex flex-col min-w-0 flex-1 mr-2" title={businessName || 'AassayBiz'}>
              <span className="text-white font-bold text-sm sm:text-base tracking-wide truncate leading-tight">
                {businessName || 'AassayBiz Attendance'}
              </span>
              <span className="text-[10px] text-orange-400 font-semibold tracking-wider uppercase">
                Employee Portal
              </span>
            </div>

            {/* Desktop Title */}
            <div className="hidden md:block text-sm text-white min-w-0" title={businessName || ''}>
              {businessName ? (
                <div className="font-bold tracking-wide text-base capitalize truncate max-w-md">
                  {businessName}
                </div>
              ) : (
                <div className="h-5 w-44 bg-white/20 rounded-md animate-pulse" />
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-1 md:space-x-4">

            {/* Notifications */}
            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications && unreadCount > 0) markAllAsRead();
                }}
                className="relative p-2 text-white/80 hover:bg-white/10 rounded-full transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-[#0a192f]">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Profile - Mobile Hidden (since we have bottom nav and sidebar) */}
            <div className="hidden md:flex items-center ml-2">
              <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold shrink-0 shadow-sm border border-orange-400 overflow-hidden">
                {employee?.avatar_url || employee?.profile_image ? (
                  <img src={employee.avatar_url || employee.profile_image} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  employee?.name?.charAt(0) || 'E'
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Notification Panel - Fixed overlay on top */}
        {showNotifications && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
            <div className="fixed top-14 left-0 right-0 md:left-auto md:right-8 md:w-96 z-50 mx-4 md:mx-0">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden max-h-[70vh]">
                <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-900/50">
                  <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                    <div className="flex items-center gap-2">
                      {notifications.length > 0 && (
                        <button 
                          onClick={async () => {
                            setNotifications([]);
                            setUnreadLeaves(0);
                            if (employee) {
                              await supabase.from('notifications').update({ is_read: true }).eq('user_id', employee.auth_user_id);
                            }
                          }} 
                          className="text-xs text-orange-600 dark:text-orange-400 hover:underline mr-2"
                        >
                          Clear All
                        </button>
                      )}
                      <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                    <X className="w-4 h-4" />
                    </button>
                  </div>
                  </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-slate-400 text-sm">
                      No notifications yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-slate-700/50">
                      {notifications.map(n => (
                        <div 
                          key={n.id} 
                          onClick={async () => {
                            setShowNotifications(false);
                            setNotifications(prev => prev.filter(item => item.id !== n.id));
                            await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
                            if (n.type?.startsWith('leave')) {
                              navigate('/leaves');
                            }
                          }}
                          className={`p-4 relative group transition-colors cursor-pointer hover:bg-orange-50/70 dark:hover:bg-slate-700/50 ${!n.is_read ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}
                        >
                            <div className="pr-6">
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{n.title}</p>
                              <p className="text-xs text-gray-600 dark:text-slate-300 mt-1">{n.message}</p>
                            </div>
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                setNotifications(prev => prev.filter(item => item.id !== n.id));
                                await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
                              }}
                              className="absolute right-4 top-4 p-1 text-gray-400 hover:text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Clear notification"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Page Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-slate-900 transition-colors relative pb-28 md:pb-8 pt-4 md:pt-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="min-h-full flex flex-col">
              <div className="flex-1">
                <Outlet />
              </div>
              <div className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 mt-8 shrink-0 pb-4">
                <span>Powered by</span>
                <img src={logoImg} alt="AassayBiz" className="h-8 md:h-9 w-auto object-contain opacity-95" />
              </div>
            </div>
          </div>
        

        {/* Mobile Bottom Navigation - AassayBiz Modern Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 grid grid-cols-5 items-center px-1 z-[9999] shadow-[0_-6px_25px_rgba(0,0,0,0.08)] h-16 pb-1">
          {navItems.map((item, index) => {
            const isCenter = index === 2; // Home button at index 2
            const hasDot = getNavDot(item.name);
            
            if (isCenter) {
              return (
                <div key={item.name} className="flex justify-center items-center w-full">
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `flex flex-col items-center justify-center -mt-3.5 w-full active:scale-95 transition-transform`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-all ${
                            isActive
                              ? 'bg-orange-600 text-white shadow-orange-500/40 ring-2 ring-white dark:ring-slate-900'
                              : 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-orange-500/25 ring-2 ring-white dark:ring-slate-900'
                          }`}
                        >
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                        <span
                          className={`text-[9.5px] font-bold mt-0.5 tracking-tight ${
                            isActive ? 'text-orange-600 font-extrabold' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.name}
                        </span>
                      </>
                    )}
                  </NavLink>
                </div>
              );
            }

            if (item.isMenu) {
              const isOtherPageActive = ['/expenses', '/documents', '/holidays', '/settings', '/profile'].some(p => location.pathname.startsWith(p));
              return (
                <div key={item.name} className="flex justify-center items-center w-full">
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className={`flex flex-col items-center justify-center py-1 w-full active:scale-95 transition-all ${
                      isOtherPageActive || mobileMenuOpen
                        ? 'text-orange-600 font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <div className="relative flex items-center justify-center w-6 h-6">
                      <item.icon className="w-5 h-5" />
                      {unreadLeaves > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
                      )}
                    </div>
                    <span className="text-[9.5px] font-semibold tracking-tight leading-tight mt-1 truncate">
                      {item.name}
                    </span>
                  </button>
                </div>
              );
            }
            
            return (
              <div key={item.name} className="flex justify-center items-center w-full">
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 w-full active:scale-95 transition-all ${
                      isActive ? 'text-orange-600 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`
                  }
                >
                  <div className="relative flex items-center justify-center w-6 h-6">
                    <item.icon className="w-5 h-5" />
                    {hasDot && (
                      <span className="absolute -top-1 -right-1.5 min-w-[15px] h-3.5 px-0.5 bg-orange-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-white dark:border-slate-900">
                        {item.name === 'Tasks' && pendingTasks > 0 ? pendingTasks : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-[9.5px] font-semibold tracking-tight leading-tight mt-1 truncate">
                    {item.name}
                  </span>
                </NavLink>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

