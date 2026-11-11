import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, subDays, subMonths, addDays } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LayoutGrid, ArrowRight, Clock, CalendarDays, MapPin, CheckCircle2, AlertCircle, XCircle, FileText, Lock, User, ChevronRight, Fingerprint, Umbrella, Navigation, Loader2, Laptop, Sparkles, CheckSquare, Receipt, FileCheck, History, MessageCircle, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getEffectiveAttendanceStatus, computeShiftStatus } from '@/lib/shift-utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RegularizeDialog } from '@/components/shared/RegularizeDialog';
import { safeFormatTime, safeFormatDate, safeParseDate } from '@/lib/utils';
import { resolveCurrentEmployee, getCachedEmployee } from '@/lib/employee-utils';
import { captureAccurateLocation, checkLocationPermission, isLaptopOrDesktop } from '@/lib/geo-utils';

export default function Dashboard({ session }: { session: any }) {
  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
  const [stats, setStats] = useState(() => {
    try {
      const raw = localStorage.getItem('attendance_stats');
      return raw ? JSON.parse(raw) : { present: 0, late: 0, absent: 0, half_day: 0, leaves_left: 15 };
    } catch {
      return { present: 0, late: 0, absent: 0, half_day: 0, leaves_left: 15 };
    }
  });
  const [upcomingHolidays, setUpcomingHolidays] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('attendance_holidays');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [todayRecord, setTodayRecord] = useState<any>(() => {
    try {
      const raw = localStorage.getItem('attendance_today_record');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [employeeShift, setEmployeeShift] = useState<any>(() => {
    try {
      const raw = localStorage.getItem('attendance_shift');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [monthRecords, setMonthRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(() => !getCachedEmployee());
  const [approvedLeaveToday, setApprovedLeaveToday] = useState<any>(null);
  const [isTodayRegApproved, setIsTodayRegApproved] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [currentAdSlide, setCurrentAdSlide] = useState(0);
  const [adAutoSlideInterval, setAdAutoSlideInterval] = useState(5000);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();



  // Modals
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  
  // Clock In / Out Confirmation Modal
  const [clockConfirmOpen, setClockConfirmOpen] = useState(false);
  const [clockType, setClockType] = useState<'in' | 'out'>('in');
  const [capturingLocation, setCapturingLocation] = useState(false);

  // Regularize Modal
  const [regularizeOpen, setRegularizeOpen] = useState(false);
  const [selectedRegDate, setSelectedRegDate] = useState<string>('');
  const [selectedRegIn, setSelectedRegIn] = useState<string | null>(null);
  const [selectedRegOut, setSelectedRegOut] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const empData = await resolveCurrentEmployee(session?.user);

      if (empData) {
        setEmployee(empData);
        
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        
        let startDate, endDate;
        if (dateFilter === 'this_month') {
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
        } else if (dateFilter === 'last_month') {
          const lastMonth = subMonths(now, 1);
          startDate = startOfMonth(lastMonth);
          endDate = endOfMonth(lastMonth);
        } else if (dateFilter === 'last_7_days') {
          startDate = subDays(now, 6); 
          endDate = now;
        } else if (dateFilter === 'custom' && customStart && customEnd) {
          startDate = parseISO(customStart);
          endDate = parseISO(customEnd);
        } else {
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
        }

        const start = format(startDate, 'yyyy-MM-dd');
        const end = format(endDate, 'yyyy-MM-dd');

        // 1. Server-side auto clock-out trigger (isolated try/catch — never aborts stats load)
        if (empData.org_id) {
          try {
            await supabase.rpc('auto_clock_out_expired_punches', { p_org_id: empData.org_id } as any);
          } catch (_rpcErr) {
            // Silently ignore — RPC may not exist yet; never abort main data load
          }
        }

        const [
          { data: monthData },
          { data: todayData },
          { data: holsData },
          { data: shiftData },
          { data: leaveBalData },
          { data: orgData },
          { data: monthHolsData },
          { data: monthLeavesData },
          { data: allLeavesData },
          { data: leavePoliciesData },
          { data: allAttendancesData },
          { data: todayRegData },
          { data: monthRegData },
          singMonthData
        ] = await Promise.all([
          supabase.from('attendances').select('*').eq('employee_id', empData.id).gte('date', start).lte('date', end),
          supabase.from('attendances').select('*').eq('employee_id', empData.id).eq('date', todayStr).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('holidays').select('*').eq('org_id', empData.org_id).gte('date', todayStr).order('date', { ascending: true }).limit(2),
          (supabase as any).from('employee_shifts').select('*, shifts(*)').eq('employee_id', empData.id).maybeSingle(),
          (supabase as any).from('employee_leave_balances').select('*').eq('employee_id', empData.id),
          supabase.from('organizations').select('weekly_offs').eq('id', empData.org_id).maybeSingle(),
          supabase.from('holidays').select('*').eq('org_id', empData.org_id).gte('date', start).lte('date', end),
          supabase.from('leaves').select('*').eq('employee_id', empData.id).eq('status', 'approved').lte('start_date', end).gte('end_date', start),
          supabase.from('leaves').select('*').eq('employee_id', empData.id).eq('status', 'approved'),
          (supabase as any).from('leave_policies').select('*').eq('org_id', empData.org_id),
          supabase.from('attendances').select('date, clock_in_time').eq('employee_id', empData.id).not('clock_in_time', 'is', null),
          supabase.from('attendance_regularizations').select('*').eq('employee_id', empData.id).eq('date', todayStr).maybeSingle(),
          supabase.from('attendance_regularizations').select('*').eq('employee_id', empData.id).gte('date', start).lte('date', end),
          (supabase as any).from('attendance').select('*').eq('employee_id', empData.id).gte('attendance_date', start).lte('attendance_date', end)
        ]);

        const isTodayRegApprovedLocal = todayRegData && todayRegData.status === 'approved';
        setIsTodayRegApproved(isTodayRegApprovedLocal);

        if (todayData) {
          setTodayRecord(todayData);
          try { localStorage.setItem('attendance_today_record', JSON.stringify(todayData)); } catch {}
        }
        if (monthData) setMonthRecords(monthData);

        try {
          const { data: aRows } = await supabase
            .from('task_assignees')
            .select('task_id')
            .eq('employee_id', empData.id);
          const aTaskIds = aRows?.map((r: any) => r.task_id) || [];

          let tQ = supabase.from('employee_tasks').select('*');
          if (aTaskIds.length > 0) {
            tQ = tQ.or(`employee_id.eq.${empData.id},id.in.(${aTaskIds.join(',')})`);
          } else {
            tQ = tQ.eq('employee_id', empData.id);
          }

          const { data: tData } = await tQ
            .order('created_at', { ascending: false })
            .limit(5);
          if (tData) {
            const activeOnly = tData.filter((t: any) => !['done', 'completed'].includes((t.status || '').toLowerCase()));
            setMyTasks(activeOnly.slice(0, 3));
          }
        } catch (_tErr) {}
        if (holsData) {
          setUpcomingHolidays(holsData);
          try { localStorage.setItem('attendance_holidays', JSON.stringify(holsData)); } catch {}
        }

        let resolvedShift = shiftData?.shifts || null;
        const targetShiftId = shiftData?.shift_id || empData.shift_id;
        if (!resolvedShift && targetShiftId) {
          const { data: directShift } = await supabase.from('shifts').select('*').eq('id', targetShiftId).maybeSingle();
          if (directShift) resolvedShift = directShift;
        }
        if (!resolvedShift) {
          const { data: orgShifts } = await (supabase as any)
            .from('shifts')
            .select('*')
            .eq('org_id', empData.org_id)
            .order('is_default', { ascending: false });
          if (orgShifts && orgShifts.length > 0) {
            resolvedShift = orgShifts.find((s: any) => s.is_default) || orgShifts[0];
          }
        }
        setEmployeeShift(resolvedShift);

        // 2. Client-side check for unclosed punch & auto-clockout cutoff (1 minute before shift start)
        let activeRecord = todayData;
        const { data: unclosedPunch } = await supabase
          .from('attendances')
          .select('*')
          .eq('employee_id', empData.id)
          .not('clock_in_time', 'is', null)
          .is('clock_out_time', null)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (unclosedPunch) {
          const shiftStartTime = resolvedShift?.start_time || '09:00:00';
          const [sH, sM] = shiftStartTime.split(':').map(Number);
          let cutoffH = sH;
          let cutoffM = (sM || 0) - 1;
          if (cutoffM < 0) {
            cutoffM = 59;
            cutoffH = (cutoffH - 1 + 24) % 24;
          }

          const punchDateObj = parseISO(unclosedPunch.date);
          const nextDayObj = addDays(punchDateObj, 1);
          const nextDayStr = format(nextDayObj, 'yyyy-MM-dd');
          const cutoffDateTime = new Date(`${nextDayStr}T${String(cutoffH).padStart(2, '0')}:${String(cutoffM).padStart(2, '0')}:00`);

          const currentTime = new Date();

          if (currentTime >= cutoffDateTime) {
            // Cutoff has passed! Auto clock out the record
            const autoOutTimeIso = cutoffDateTime.toISOString();
            const reasonStr = `Auto Clock Out at ${String(cutoffH).padStart(2, '0')}:${String(cutoffM).padStart(2, '0')}`;

            try {
              await supabase.from('attendances').update({
                clock_out_time: autoOutTimeIso,
                is_auto_clock_out: true,
                clock_out_location: {
                  auto: true,
                  is_auto_clock_out: true,
                  reason: reasonStr
                }
              }).eq('id', unclosedPunch.id);
            } catch (_autoErr) {
              // Silently ignore auto-clockout update errors — never abort stats
            }

            if (unclosedPunch.date === todayStr) {
              activeRecord = {
                ...unclosedPunch,
                clock_out_time: autoOutTimeIso,
                is_auto_clock_out: true
              };
            }
          } else {
            // Cutoff has not passed: User is still clocked in from this session
            activeRecord = unclosedPunch;
          }
        }

        if (monthData) setMonthRecords(monthData);

        try {
          const { data: aRows } = await supabase
            .from('task_assignees')
            .select('task_id')
            .eq('employee_id', empData.id);
          const aTaskIds = aRows?.map((r: any) => r.task_id) || [];

          let tQ = supabase.from('employee_tasks').select('*');
          if (aTaskIds.length > 0) {
            tQ = tQ.or(`employee_id.eq.${empData.id},id.in.(${aTaskIds.join(',')})`);
          } else {
            tQ = tQ.eq('employee_id', empData.id);
          }

          const { data: tData } = await tQ
            .order('created_at', { ascending: false })
            .limit(5);
          if (tData) {
            const activeOnly = tData.filter((t: any) => !['done', 'completed'].includes((t.status || '').toLowerCase()));
            setMyTasks(activeOnly.slice(0, 3));
          }
        } catch (_tErr) {}
        setTodayRecord(activeRecord);
        if (holsData) setUpcomingHolidays(holsData);

        const weeklyOffs = orgData?.weekly_offs || [0, 6];
        const holidays = monthHolsData || [];
        const leaves = monthLeavesData || [];
        
        const attMap: Record<string, any> = {};
        (monthData || []).forEach(r => { attMap[r.date] = r; });
        (singMonthData?.data || []).forEach((r: any) => {
          const ds = r.attendance_date;
          if (ds) {
            const existing = attMap[ds] || {};
            attMap[ds] = {
              ...existing,
              id: existing.id || r.id,
              date: ds,
              employee_id: r.employee_id,
              clock_in_time: existing.clock_in_time || r.clock_in_time,
              clock_out_time: existing.clock_out_time || r.clock_out_time,
              status: existing.status || r.override_status || r.status,
              override_status: r.override_status,
            };
          }
        });

        const rMap: Record<string, any> = {};
        (monthRegData || []).forEach(r => {
          if (r.status === 'approved') {
            rMap[(r.date || r.attendance_date || '').slice(0, 10)] = r;
          }
        });

        let dateInterval: Date[] = [];
        try {
          dateInterval = eachDayOfInterval({ start: startDate, end: endDate });
        } catch (e) {
          dateInterval = [];
        }

        const joiningDateStr = empData.joining_date || safeFormatDate(empData.created_at || now, 'yyyy-MM-dd');
        
        const eligibleDays = dateInterval.filter(d => {
          const dStr = format(d, 'yyyy-MM-dd');
          const hasRecord = !!attMap[dStr] || !!rMap[dStr] || leaves.some(l => dStr >= l.start_date && dStr <= (l.end_date || l.start_date));
          return dStr <= todayStr && (dStr >= joiningDateStr || hasRecord);
        });

        let p = 0, l = 0, a = 0, h = 0;
        
        eligibleDays.forEach(d => {
          const ds = format(d, 'yyyy-MM-dd');
          const isWeekOff = weeklyOffs.includes(d.getDay());
          const isHol = holidays.some(hol => hol.date === ds);
          const hasLeave = leaves.some(leave => ds >= leave.start_date && ds <= (leave.end_date || leave.start_date));
          const existing = attMap[ds];

          if (hasLeave) {
            // Counted under leave, not present or absent
            return;
          }

          if (rMap[ds]) {
            // Approved regularization is ALWAYS Present!
            p++;
            return;
          }

          if (existing) {
            const isReg = !!rMap[ds];
            const status = getEffectiveAttendanceStatus(existing, resolvedShift, isReg);
            if (status === 'present') p++;
            else if (status === 'late') l++;
            else if (status === 'half_day' || status === 'half-day') h++;
            else if (status === 'absent') a++;
          } else {
            if (!isWeekOff && !isHol) {
              if (ds === todayStr) {
                const now = new Date();
                const toMins = (t: string) => { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };
                const halfEnd = toMins(resolvedShift?.half_day_end || '14:00');
                if (now.getHours() * 60 + now.getMinutes() > halfEnd) {
                  a++;
                }
              } else {
                a++;
              }
            }
          }
        });

        const attendances = allAttendancesData || [];
        const attSet = new Set(attendances.map(a => a.date));
        const DEFAULT_ANNUAL: Record<string, number> = { casual: 12, sick: 5, el_pl: 0, comp_off: 0 };
        const ACCRUED_TYPES = ["el_pl", "comp_off"];

        let leavesLeft = 0;
        ["casual", "sick", "el_pl", "comp_off"].forEach((t) => {
          const bal = (leaveBalData || []).find((b: any) => b.leave_type === t);
          const pol = (leavePoliciesData || []).find((p: any) => p.leave_type === t);
          const isAccrued = ACCRUED_TYPES.includes(t);
          
          const dynamicUsed = (allLeavesData || [])
            .filter(l => l.leave_type === t && l.start_date <= todayStr && !attSet.has(l.start_date))
            .reduce((sum, l) => sum + (Number(l.days) || 1), 0);

          const annual = isAccrued ? (bal?.accrued ?? 0) : (pol?.annual_limit ?? DEFAULT_ANNUAL[t] ?? 0);
          leavesLeft += Math.max(0, annual - dynamicUsed);
        });

        const computedStats = { present: p, late: l, half_day: h, absent: a, leaves_left: leavesLeft };
        setStats(computedStats);
        try {
          localStorage.setItem('attendance_stats', JSON.stringify(computedStats));
          if (resolvedShift) {
            localStorage.setItem('attendance_shift', JSON.stringify(resolvedShift));
          }
        } catch {}
      }
    } catch (err: any) {
      console.error('Dashboard loadData error:', err);
      // Only show toast for critical user-facing errors, not internal RPC/table errors
      if (err?.message && !err.message.includes('rpc') && !err.message.includes('relation') && !err.message.includes('does not exist')) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      if (dateFilter === 'custom' && (!customStart || !customEnd)) return;
      loadData();
    }
  }, [session, dateFilter, customStart, customEnd]);

  // Real-time ticker to auto-check cutoff (08:59 AM) while user has portal open
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [session, dateFilter, customStart, customEnd]);

  // Fetch portal ads
  useEffect(() => {
    const fetchAds = async () => {
      try {
        const { data } = await (supabase as any)
          .from('portal_ads')
          .select('*')
          .eq('is_active', true)
          .neq('title', '__platform_socials__')
          .order('sort_order', { ascending: true });
        if (data) {
          const validAds = data.filter((ad: any) => ad.title !== '__platform_socials__');
          setAds(validAds);
        }
      } catch (e) {
        // portal_ads table may not exist yet, silently fail
      }
    };
    fetchAds();
  }, []);

  // Auto-slide ads
  useEffect(() => {
    if (ads.length <= 1) return;
    
    let currentDuration = 5000;
    try {
      const parsed = JSON.parse(ads[currentAdSlide]?.title || '{}');
      if (parsed.duration) {
         currentDuration = parseInt(parsed.duration) * 1000;
      }
    } catch(e) {}

    const timer = setTimeout(() => {
      setCurrentAdSlide(prev => (prev + 1) % ads.length);
    }, currentDuration);
    
    return () => clearTimeout(timer);
  }, [ads, currentAdSlide]);

  
  const handleCancelLeave = async (leaveId: string) => {
    try {
      setActionLoading(true);
      const { data: leaveReq } = await supabase.from('leaves').select('*').eq('id', leaveId).single();
      if (!leaveReq) throw new Error("Leave not found");

      const { error } = await supabase.from('leaves').update({ status: 'cancelled' }).eq('id', leaveId);
      if (error) throw error;
      
      // Refund balance
      try {
        const { data: bData } = await supabase.from('employee_leave_balances')
          .select('used')
          .eq('employee_id', leaveReq.employee_id)
          .eq('leave_type', leaveReq.leave_type)
          .maybeSingle();
          
        let currentUsed = bData?.used || 0;
        currentUsed = Math.max(0, currentUsed - leaveReq.days);
        
        await supabase.from('employee_leave_balances').upsert({
          org_id: leaveReq.org_id,
          employee_id: leaveReq.employee_id,
          leave_type: leaveReq.leave_type,
          used: currentUsed
        }, { onConflict: 'employee_id,leave_type' });
      } catch(e) {
        console.error("Failed to refund balance", e);
      }
      
      toast({ title: 'Leave Cancelled', description: 'Your leave has been cancelled. You can now clock in.' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };



  // Mobile auto-punch trigger when opened via scanned QR code
  useEffect(() => {
    const action = searchParams.get('action');
    if (action && (action === 'in' || action === 'out') && employee?.id) {
      if (action === 'in' && todayRecord?.clock_in_time) return;
      if (action === 'out' && (!todayRecord?.clock_in_time || todayRecord?.clock_out_time)) return;
      setSearchParams({}, { replace: true });
      handleClockInOut(action as 'in' | 'out');
    }
  }, [searchParams, employee?.id, todayRecord]);

  const requestClockInOut = (type: 'in' | 'out') => {
    setClockType(type);
    setClockConfirmOpen(true);
  };

  const executeClockInOut = async () => {
    setClockConfirmOpen(false);
    await handleClockInOut(clockType);
  };

  const handleClockInOut = async (type: 'in' | 'out') => {
    try {
      setActionLoading(true);
      let now = new Date().toISOString();
      let today = format(new Date(), 'yyyy-MM-dd');
      try {
        const timeController = new AbortController();
        const timeTimeoutId = setTimeout(() => timeController.abort(), 2000); // 2s timeout
        const timeRes = await fetch('https://worldtimeapi.org/api/timezone/Asia/Kolkata', { signal: timeController.signal });
        clearTimeout(timeTimeoutId);
        if (timeRes.ok) {
          const timeData = await timeRes.json();
          now = timeData.datetime;
          today = timeData.datetime.substring(0, 10);
        }
      } catch (e) {
        console.warn("Real-time API failed, falling back to local time", e);
      }

      let currentEmp = employee;
      if (!currentEmp) {
        currentEmp = await resolveCurrentEmployee(session?.user);
        if (currentEmp) {
          setEmployee(currentEmp);
        }
      }

      if (!currentEmp?.id) {
        toast({
          title: 'Employee Profile Missing',
          description: 'Unable to find an employee profile linked to your account. Please contact your administrator.',
          variant: 'destructive',
        });
        return;
      }
      
      // Location handling: Laptop/Desktop records "Login from Laptop/Desktop" directly without GPS prompt
      let locationData: any = null;
      if (isLaptopOrDesktop()) {
        locationData = {
          lat: null,
          lng: null,
          address: "Login from Laptop/Desktop",
          source: "laptop",
          device: "Laptop/Desktop"
        };
      } else {
        // Pre-check browser location permission for mobile devices
        const permState = await checkLocationPermission();
        if (permState === 'denied') {
          toast({
            title: 'Location Permission Blocked',
            description: 'Please enable Location in your browser address bar (lock icon) for pinpoint GPS attendance tracking.',
            variant: 'destructive',
          });
        }

        // Capture precise GPS / WiFi location on Mobile
        setCapturingLocation(true);
        toast({ title: 'Capturing Location...', description: 'Acquiring precise coordinates from your device...' });
        locationData = await captureAccurateLocation();
        setCapturingLocation(false);
      }

      if (type === 'in') {
        // Ensure any previous unclosed punches are auto closed before marking new punch
        if (currentEmp.org_id) {
          try {
            await (supabase as any).rpc('auto_clock_out_expired_punches', { p_org_id: currentEmp.org_id });
          } catch (e) {}
        }

        const computedShiftStatus = computeShiftStatus(now, employeeShift);
        const punchPayload = {
          employee_id: currentEmp.id,
          org_id: currentEmp.org_id,
          date: today,
          clock_in_time: now,
          clock_in_location: locationData,
          status: computedShiftStatus
        };

        const { data: savedRecord, error: clockErr } = await supabase
          .from('attendances')
          .upsert(punchPayload, { onConflict: 'employee_id,date' })
          .select()
          .single();

        if (clockErr) throw clockErr;

        // Also sync to attendance (singular) table so both tables stay 100% aligned
        try {
          await (supabase as any).from('attendance').upsert({
            employee_id: currentEmp.id,
            org_id: currentEmp.org_id,
            attendance_date: today,
            clock_in_time: now,
            clock_in_location: locationData,
            status: computedShiftStatus,
            override_status: null,
            hr_note: null,
            notes: null
          }, { onConflict: 'employee_id,attendance_date' });
        } catch (syncErr) {
          console.warn("Sync to attendance (singular) failed:", syncErr);
        }

        setTodayRecord(savedRecord);
        try { localStorage.setItem('attendance_today_record', JSON.stringify(savedRecord)); } catch {}
        if (isLaptopOrDesktop()) {
          toast({ title: '✅ Clocked In', description: 'Login from Laptop/Desktop' });
        } else if (locationData?.source === 'fallback') {
          toast({ title: 'Clocked In', description: 'Attendance recorded via Web Check-In (Location access was unavailable on this device).' });
        } else {
          toast({ title: '✅ Clocked In', description: locationData?.address ? `Attendance marked: ${locationData.address}` : 'Attendance marked.' });
        }
        window.dispatchEvent(new Event('attendance_updated'));
      } else {
        let punchId = todayRecord?.id;
        if (!punchId) {
          const { data: openPunch } = await supabase
            .from('attendances')
            .select('id')
            .eq('employee_id', currentEmp.id)
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

        const { data: updatedRecord, error: outErr } = await supabase
          .from('attendances')
          .update({
            clock_out_time: now,
            clock_out_location: locationData
          })
          .eq('id', punchId)
          .select()
          .single();

        if (outErr) throw outErr;

        // Also sync clock out to attendance (singular) table
        try {
          await (supabase as any).from('attendance').update({
            clock_out_time: now,
            clock_out_location: locationData
          })
          .eq('employee_id', currentEmp.id)
          .eq('attendance_date', today);
        } catch (syncErr) {
          console.warn("Sync clock out to attendance (singular) failed:", syncErr);
        }

        setTodayRecord(updatedRecord);
        try { localStorage.setItem('attendance_today_record', JSON.stringify(updatedRecord)); } catch {}
        if (isLaptopOrDesktop()) {
          toast({ title: '✅ Clocked Out', description: 'Login from Laptop/Desktop' });
        } else if (locationData?.source === 'fallback') {
          toast({ title: 'Clocked Out', description: 'Clock-out recorded via Web Check-In.' });
        } else {
          toast({ title: '✅ Clocked Out', description: locationData?.address ? `Clock-out saved: ${locationData.address}` : 'Your shift has ended.' });
        }
        window.dispatchEvent(new Event('attendance_updated'));
      }
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    try {
      setActionLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Success', description: 'Password updated successfully' });
      setChangePasswordOpen(false);
      setNewPassword('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const WaveSVG = ({ color }: { color: string }) => (
    <svg className="absolute bottom-0 left-0 w-full h-12 opacity-50 pointer-events-none rounded-b-2xl" viewBox="0 0 1440 320" preserveAspectRatio="none">
      <path fill={color} fillOpacity="1" d="M0,224L48,224C96,224,192,224,288,208C384,192,480,160,576,149.3C672,139,768,149,864,170.7C960,192,1056,224,1152,213.3C1248,203,1344,149,1392,122.7L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
    </svg>
  );

  const todayEffectiveStatus = todayRecord ? getEffectiveAttendanceStatus(todayRecord, employeeShift, isTodayRegApproved) : null;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 17) return 'Good Afternoon,';
    return 'Good Evening,';
  };
  
  return (
    <div className="relative w-full max-w-lg mx-auto md:max-w-4xl pb-6">
      {/* Background Top Banner (AassayBiz Blue) */}
      <div className="absolute -top-8 -left-4 -right-4 h-64 bg-[#0a192f] rounded-b-[40px] z-0 hidden sm:block md:hidden"></div>

      <div className="relative z-10 space-y-5 mt-2">
        
        {/* Welcome Card */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex justify-between items-center border border-gray-100 dark:border-slate-700">
          <div className="flex-1">
            <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">{getGreeting()}</p>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              {employee?.name ? employee.name.split(' ')[0] : 'Employee'}! 👋
            </h2>
            
            {employeeShift ? (
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-lg whitespace-nowrap">
                  Shift: {employeeShift.name}
                </span>
                <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-lg whitespace-nowrap">
                  {employeeShift.start_time?.slice(0,5)} - {employeeShift.end_time?.slice(0,5)}
                </span>
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-[10px] font-bold rounded-lg whitespace-nowrap">
                  Grace: {employeeShift.grace_minutes}m
                </span>
              </div>
            ) : (
              <div className="text-xs text-gray-400 mb-3">No shift assigned</div>
            )}
            
            <div className="flex gap-4 text-[10px] font-semibold text-orange-600 dark:text-orange-500">
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></div> Late up to {employeeShift?.late_end?.slice(0,5) || "10:30"}</span>
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></div> Half day up to {employeeShift?.half_day_end?.slice(0,5) || "14:00"}</span>
            </div>
          </div>
          
          {/* Avatar / Profile Picture */}
          <div className="w-24 h-24 shrink-0 bg-blue-100 dark:bg-slate-700 rounded-full flex items-center justify-center shadow-inner relative overflow-hidden ml-2 border-2 border-white dark:border-slate-800">
            {(employee?.avatar_url || employee?.profile_image) ? (
              <img 
                src={employee.avatar_url || employee.profile_image} 
                alt="Profile" 
                className="w-full h-full object-cover" 
              />
            ) : (
              <User className="w-12 h-12 text-blue-300 dark:text-slate-500" />
            )}
          </div>
        </div>

        {/* Ad Banner Carousel */}
        {ads.length > 0 && (
          <div className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800">
            {/* Top Right Sponsored Badge */}
            <div className="bg-black/60 dark:bg-black/70 text-white text-[10px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-bl-xl absolute top-0 right-0 z-20 shadow-xs backdrop-blur-xs pointer-events-none">
              Sponsored
            </div>

            <div className="relative w-full" style={{ minHeight: '120px' }}>
              {ads.map((ad, idx) => {
                return (
                  <div
                    key={ad.id}
                    className={`w-full transition-opacity duration-500 ${idx === currentAdSlide ? 'block opacity-100' : 'hidden opacity-0'}`}
                  >
                    {ad.link_url ? (
                      <a href={ad.link_url} target="_blank" rel="noopener noreferrer">
                        <img src={ad.image_url} alt={ad.title || 'Ad'} className="w-full h-auto object-cover rounded-2xl" style={{ maxHeight: '200px' }} />
                      </a>
                    ) : (
                      <img src={ad.image_url} alt={ad.title || 'Ad'} className="w-full h-auto object-cover rounded-2xl" style={{ maxHeight: '200px' }} />
                    )}
                  </div>
                );
              })}
            </div>
            {ads.length > 1 && (
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1.5">
                {ads.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentAdSlide(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${idx === currentAdSlide ? 'bg-orange-500 w-4' : 'bg-gray-300 dark:bg-slate-600'}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Space for Ad (fallback when no ads) */}
        {ads.length === 0 && (
          <div className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800 dark:to-slate-800/80 rounded-2xl p-6 shadow-sm border border-dashed border-gray-200 dark:border-slate-700 flex items-center justify-center min-h-[100px]">
            <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 tracking-wider uppercase">Space for Ad</p>
          </div>
        )}

          {/* Clock In / Out Main Action Widget */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Daily Attendance</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              {todayRecord?.clock_in_time 
                ? `Clocked in at ${safeFormatTime(todayRecord.clock_in_time)}${todayRecord.date !== format(new Date(), 'yyyy-MM-dd') ? ` (${todayRecord.date})` : ''}` 
                : 'You have not clocked in yet.'}
            </p>
            {todayRecord?.clock_in_location?.address && (
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 font-medium">
                {todayRecord.clock_in_location.source === 'laptop' || todayRecord.clock_in_location.address.toLowerCase().includes('laptop') ? (
                  <Laptop className="w-3 h-3 text-indigo-500 shrink-0" />
                ) : (
                  <MapPin className="w-3 h-3 text-orange-500 shrink-0" />
                )}
                <span>{todayRecord.clock_in_location.address}</span>
              </p>
            )}
            {todayRecord?.clock_out_time && (todayRecord.is_auto_clock_out || todayRecord.clock_out_location?.auto || todayRecord.clock_out_location?.is_auto_clock_out) && (
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200">
                <AlertCircle className="w-3 h-3" /> Auto Logout ({safeFormatTime(todayRecord.clock_out_time)})
              </span>
            )}
          </div>
          
          {!todayRecord || (todayRecord.clock_out_time && todayRecord.date !== format(new Date(), 'yyyy-MM-dd')) ? (
             <Button 
               size="lg" 
               className="h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 font-bold active:scale-95 transition-all"
               onClick={() => requestClockInOut('in')}
               disabled={actionLoading}
             >
               <Fingerprint className="w-5 h-5 mr-2" /> Clock In
             </Button>
          ) : !todayRecord.clock_out_time ? (
             <Button 
               size="lg" 
               className="h-12 rounded-xl bg-[#0a192f] hover:bg-slate-800 text-white shadow-lg shadow-slate-900/30 font-bold active:scale-95 transition-all"
               onClick={() => requestClockInOut('out')}
               disabled={actionLoading}
             >
               <MapPin className="w-5 h-5 mr-2" /> Clock Out
             </Button>
          ) : (
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" /> Completed
              </div>
              {(todayRecord.is_auto_clock_out || todayRecord.clock_out_location?.auto || todayRecord.clock_out_location?.is_auto_clock_out) && (
                <span className="text-[10px] text-amber-600 font-bold mt-1">Auto Logged Out</span>
              )}
            </div>
          )}
        </div>

        
        {/* Quick Access Portal Services - History, Leaves, Tasks, Expenses, All Pages */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-4 bg-orange-500 rounded-full" />
              <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">Quick Access & Services</h3>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-mobile-menu'))}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 active:scale-95 transition-transform"
            >
              <span>All Pages</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Primary 4 Hero Feature Cards (2x2 on mobile, 4 columns on desktop) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* 1. Tasks */}
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-br from-orange-50/90 to-amber-50/40 dark:from-orange-950/20 dark:to-slate-800 border border-orange-100 dark:border-orange-900/40 hover:shadow-md transition-all active:scale-95 group text-left relative overflow-hidden"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <CheckSquare className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight">Tasks</span>
                  {myTasks.length > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-orange-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {myTasks.length}
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                  {myTasks.length > 0 ? `${myTasks.length} Pending` : 'View & Manage'}
                </p>
              </div>
            </button>

            {/* 2. Expenses */}
            <button
              type="button"
              onClick={() => navigate('/expenses')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-br from-emerald-50/90 to-teal-50/40 dark:from-emerald-950/20 dark:to-slate-800 border border-emerald-100 dark:border-emerald-900/40 hover:shadow-md transition-all active:scale-95 group text-left relative overflow-hidden"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight">Expenses</span>
                <p className="text-[10.5px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                  Bike KM & Bills
                </p>
              </div>
            </button>

            {/* 3. Leaves */}
            <button
              type="button"
              onClick={() => navigate('/leaves')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-br from-blue-50/90 to-indigo-50/40 dark:from-blue-950/20 dark:to-slate-800 border border-blue-100 dark:border-blue-900/40 hover:shadow-md transition-all active:scale-95 group text-left relative overflow-hidden"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <Umbrella className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight">Leaves</span>
                <p className="text-[10.5px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                  {stats?.leaves_left ?? 15} Days Left
                </p>
              </div>
            </button>

            {/* 4. History */}
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-br from-indigo-50/90 to-violet-50/40 dark:from-indigo-950/20 dark:to-slate-800 border border-indigo-100 dark:border-indigo-900/40 hover:shadow-md transition-all active:scale-95 group text-left relative overflow-hidden"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <History className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight">History</span>
                <p className="text-[10.5px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                  Punches & Logs
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* My Assigned Tasks Widget */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center shrink-0">
                <CheckSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">My Assigned Tasks</h3>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  {myTasks.length === 0 ? 'No pending tasks assigned' : `${myTasks.length} active task${myTasks.length > 1 ? 's' : ''} in progress`}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/tasks')}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30 text-xs font-semibold rounded-xl"
            >
              View All <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {myTasks.length === 0 ? (
            <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-2xl text-center text-xs text-gray-500 dark:text-slate-400">
              🎉 All caught up! No pending tasks right now.
            </div>
          ) : (
            <div className="space-y-2">
              {myTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate('/tasks')}
                  className="p-3 bg-gray-50 dark:bg-slate-900/50 hover:bg-orange-50/50 dark:hover:bg-slate-800 transition-colors rounded-2xl flex items-center justify-between cursor-pointer border border-transparent hover:border-orange-200"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-bold text-xs text-gray-900 dark:text-white truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-white dark:bg-slate-800 border text-gray-600 dark:text-slate-300">
                        {t.status}
                      </span>
                      {t.due_date && (
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">
                          Due: {safeFormatDate(t.due_date, 'dd MMM')} {t.due_time || ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats Section with Filter */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Attendance Overview</h3>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 rounded-xl">
                <SelectValue placeholder="Select Period" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="custom">Custom Dates</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dateFilter === 'custom' && (
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <Label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Start Date</Label>
                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-8 text-xs rounded-xl" />
              </div>
              <div className="flex-1">
                <Label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">End Date</Label>
                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-8 text-xs rounded-xl" />
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Present */}
            <div className="relative overflow-hidden bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[100px]">
              <div className="relative z-10 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white shadow-sm">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                </div>
                <div className="flex flex-col pt-0.5">
                  <span className="text-xl font-black text-gray-900 dark:text-white leading-none">{stats.present}</span>
                  <span className="text-[10px] font-bold text-green-500 tracking-wider mt-1 uppercase">Present</span>
                </div>
              </div>
              <WaveSVG color="#22c55e22" />
            </div>

            {/* Late */}
            <div className="relative overflow-hidden bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[100px]">
              <div className="relative z-10 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-sm">
                    <Clock className="w-3 h-3" />
                  </div>
                </div>
                <div className="flex flex-col pt-0.5">
                  <span className="text-xl font-black text-gray-900 dark:text-white leading-none">{stats.late}</span>
                  <span className="text-[10px] font-bold text-amber-500 tracking-wider mt-1 uppercase">Late Coming</span>
                </div>
              </div>
              <WaveSVG color="#f59e0b22" />
            </div>

            {/* Half Days */}
            <div className="relative overflow-hidden bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[100px]">
              <div className="relative z-10 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white shadow-sm">
                    <AlertCircle className="w-3 h-3" />
                  </div>
                </div>
                <div className="flex flex-col pt-0.5">
                  <span className="text-xl font-black text-gray-900 dark:text-white leading-none">{stats.half_day}</span>
                  <span className="text-[10px] font-bold text-orange-500 tracking-wider mt-1 uppercase">Half Days</span>
                </div>
              </div>
              <WaveSVG color="#f9731622" />
            </div>

            {/* Absent */}
            <div className="relative overflow-hidden bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[100px]">
              <div className="relative z-10 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white shadow-sm">
                    <XCircle className="w-3 h-3" />
                  </div>
                </div>
                <div className="flex flex-col pt-0.5">
                  <span className="text-xl font-black text-gray-900 dark:text-white leading-none">{stats.absent}</span>
                  <span className="text-[10px] font-bold text-red-500 tracking-wider mt-1 uppercase">Absent</span>
                </div>
              </div>
              <WaveSVG color="#ef444422" />
            </div>
          </div>
        </div>

        {/* Apply for Leave Action */}
          <div 
            onClick={() => navigate('/leaves')}
            className="bg-blue-50 dark:bg-blue-900/20 rounded-3xl p-5 shadow-sm border border-blue-100 dark:border-blue-800 flex justify-between items-center relative overflow-hidden cursor-pointer hover:shadow-md transition-all active:scale-95 mt-3"
          >
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-black text-gray-900 dark:text-white leading-none mb-1">Apply for Leave</span>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">Request Time Off</span>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-blue-300 dark:text-blue-500 relative z-10" />
            <FileText className="w-24 h-24 text-blue-500/10 dark:text-blue-400/5 absolute -right-4 -bottom-4 transform rotate-12 pointer-events-none" />
          </div>

        {/* Expenses & Travel Claims Action */}
          <div 
            onClick={() => navigate('/expenses')}
            className="bg-orange-50 dark:bg-orange-950/20 rounded-3xl p-5 shadow-sm border border-orange-100 dark:border-orange-800 flex justify-between items-center relative overflow-hidden cursor-pointer hover:shadow-md transition-all active:scale-95 mt-3"
          >
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center shrink-0">
                <Receipt className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-black text-gray-900 dark:text-white leading-none mb-1">Expenses & Travel Claims</span>
                <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 tracking-wider uppercase">Log Bike Travel & Bills</span>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-orange-300 dark:text-orange-500 relative z-10" />
            <Receipt className="w-24 h-24 text-orange-500/10 dark:text-orange-400/5 absolute -right-4 -bottom-4 transform rotate-12 pointer-events-none" />
          </div>

        {/* Upcoming Holiday (moved below Apply for Leave) */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/80 rounded-2xl p-4 shadow-sm border border-blue-100 dark:border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 text-blue-900 dark:text-white font-bold text-sm">
                <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Next Holiday
              </div>
              <Button variant="ghost" className="h-6 text-xs text-blue-600 dark:text-blue-400 p-0 hover:bg-transparent hover:text-blue-800" onClick={() => navigate('/holidays')}>View All</Button>
            </div>
            
            {upcomingHolidays.length === 0 ? (
              <p className="text-xs text-blue-500/80 dark:text-slate-400">No upcoming holidays.</p>
            ) : (
              <div>
                {upcomingHolidays.slice(0, 1).map((h, i) => (
                  <div key={i} className="flex justify-between items-center bg-white dark:bg-slate-900/50 p-3 rounded-xl shadow-sm border border-white dark:border-slate-700/50">
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{h.name}</p>
                      <p className="text-[10px] font-medium text-gray-500 dark:text-slate-400 mt-1">{safeFormatDate(h.date, 'dd MMMM yyyy')}</p>
                    </div>
                    <div className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold whitespace-nowrap shadow-inner">
                      In {(() => { const hd = safeParseDate(h.date); return hd ? Math.max(0, Math.ceil((hd.getTime() - Date.now()) / (1000 * 3600 * 24))) : 0; })()} days
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

      </div>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="dark:bg-slate-800 dark:text-white dark:border-slate-700 rounded-2xl">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription className="dark:text-slate-400">Update your portal login password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-slate-300">New Password</Label>
              <Input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Must be at least 6 characters"
                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)} className="rounded-xl dark:border-slate-700">Cancel</Button>
            <Button onClick={handlePasswordChange} disabled={actionLoading || newPassword.length < 6} className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white">
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clock In / Out Themed Confirmation Dialog */}
      <Dialog open={clockConfirmOpen} onOpenChange={setClockConfirmOpen}>
        <DialogContent className="sm:max-w-md max-w-[92%] rounded-3xl p-6 text-center shadow-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex flex-col items-center justify-center pt-2">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm ${
              clockType === 'in' 
                ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600' 
                : 'bg-slate-100 dark:bg-slate-800 text-[#0a192f] dark:text-white'
            }`}>
              {clockType === 'in' ? (
                <Fingerprint className="w-8 h-8" />
              ) : (
                <MapPin className="w-8 h-8" />
              )}
            </div>

            <DialogHeader className="text-center space-y-1.5">
              <DialogTitle className="text-xl font-bold text-center text-gray-900 dark:text-white">
                {clockType === 'in' ? 'Confirm Clock In' : 'Confirm Clock Out'}
              </DialogTitle>
              <DialogDescription className="text-center text-sm text-gray-500 dark:text-slate-400">
                {isLaptopOrDesktop()
                  ? `Clocking ${clockType === 'in' ? 'in' : 'out'} from this laptop/desktop will record "Login from Laptop/Desktop" as your location.`
                  : (clockType === 'in' 
                      ? 'Are you ready to mark your attendance for today? Your live GPS location will be captured.' 
                      : 'Are you sure you want to end your shift and clock out for today?')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 mt-4 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
              {isLaptopOrDesktop() ? (
                <>
                  <Laptop className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium leading-snug">
                    Clocking from Laptop/Desktop. Location will be automatically recorded as <strong>Login from Laptop/Desktop</strong>.
                  </p>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 animate-pulse" />
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium leading-snug">
                    Precise GPS location will be captured with pin-point accuracy. Please keep your GPS/Location Services ON.
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-3 w-full mt-4">
              <Button
                variant="outline"
                onClick={() => setClockConfirmOpen(false)}
                disabled={actionLoading}
                className="flex-1 h-11 rounded-xl font-bold border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={executeClockInOut}
                disabled={actionLoading}
                className={`flex-1 h-11 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-all ${
                  clockType === 'in'
                    ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/25'
                    : 'bg-[#0a192f] hover:bg-slate-800 shadow-slate-900/25'
                }`}
              >
                {actionLoading ? 'Processing…' : clockType === 'in' ? 'Yes, Clock In' : 'Yes, Clock Out'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  );
}


