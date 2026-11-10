import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO, subMonths, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle, Clock, ArrowLeft, Laptop, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getEffectiveAttendanceStatus } from '@/lib/shift-utils';
import { safeFormatTime, safeFormatDate, safeParseDate } from '@/lib/utils';
import { RegularizeDialog } from '@/components/shared/RegularizeDialog';
import { resolveCurrentEmployee, getCachedEmployee } from '@/lib/employee-utils';

export default function HistoryPage({ session }: { session: any }) {
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [records, setRecords] = useState<any[]>([]);
  const [employeeShift, setEmployeeShift] = useState<any>(() => {
    try {
      const r = localStorage.getItem('attendance_shift');
      return r ? JSON.parse(r) : null;
    } catch {
      return null;
    }
  });
  const [regularizationsMap, setRegularizationsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(() => !getCachedEmployee());
  const { toast } = useToast();

  // Dialog state
  const [regDialogOpen, setRegDialogOpen] = useState(false);
  const [selectedRegDate, setSelectedRegDate] = useState<string>('');
  const [selectedClockIn, setSelectedClockIn] = useState<string | null>(null);
  const [selectedClockOut, setSelectedClockOut] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const empData = await resolveCurrentEmployee(session?.user);

      if (empData) {
        setEmployee(empData);
        const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
        
        // Server-side auto clock-out trigger (non-blocking in background)
        if (empData.org_id) {
          try {
            await supabase.rpc('auto_clock_out_expired_punches', { p_org_id: empData.org_id } as any);
          } catch (_rpcErr) { /* non-critical, ignore */ }
        }

        const [
          { data: monthData },
          { data: orgData },
          { data: holsData },
          { data: leavesData },
          { data: shiftData },
          { data: regData },
          singMonthData
        ] = await Promise.all([
          supabase
            .from('attendances')
            .select('*')
            .eq('employee_id', empData.id)
            .gte('date', start)
            .lte('date', end),
          supabase
            .from('organizations')
            .select('weekly_offs')
            .eq('id', empData.org_id)
            .single(),
          supabase
            .from('holidays')
            .select('*')
            .eq('org_id', empData.org_id)
            .gte('date', start)
            .lte('date', end),
          supabase
            .from('leaves')
            .select('*')
            .eq('employee_id', empData.id)
            .eq('status', 'approved')
            .lte('start_date', end)
            .gte('end_date', start),
          (supabase as any)
            .from('employee_shifts')
            .select('*, shifts(*)')
            .eq('employee_id', empData.id)
            .maybeSingle(),
          (async () => {
            const q1 = await supabase.from('attendance_regularizations').select('*').eq('employee_id', empData.id).gte('date', start).lte('date', end);
            let combined = q1.data || [];
            if (empData.auth_user_id && empData.auth_user_id !== empData.id) {
              const q2 = await supabase.from('attendance_regularizations').select('*').eq('employee_id', empData.auth_user_id).gte('date', start).lte('date', end);
              if (q2.data && q2.data.length > 0) {
                const existingIds = new Set(combined.map((x: any) => x.id));
                q2.data.forEach((x: any) => { if (!existingIds.has(x.id)) combined.push(x); });
              }
            }
            return { data: combined, error: q1.error };
          })(),
          (supabase as any)
            .from('attendance')
            .select('*')
            .eq('employee_id', empData.id)
            .gte('attendance_date', start)
            .lte('attendance_date', end),
        ]);

        let shift = shiftData?.shifts || null;
        const targetShiftId = shiftData?.shift_id || empData.shift_id;
        if (!shift && targetShiftId) {
          const { data: directShift } = await supabase.from('shifts').select('*').eq('id', targetShiftId).maybeSingle();
          if (directShift) shift = directShift;
        }
        if (!shift) {
          const { data: orgShifts } = await (supabase as any)
            .from('shifts')
            .select('*')
            .eq('org_id', empData.org_id)
            .order('is_default', { ascending: false });
          if (orgShifts && orgShifts.length > 0) {
            shift = orgShifts.find((s: any) => s.is_default) || orgShifts[0];
          }
        }
        setEmployeeShift(shift);

        const rMap: Record<string, any> = {};
        (regData || []).forEach((r: any) => {
          const dStr = (r.date || r.attendance_date || '').slice(0, 10);
          if (dStr) {
            if (rMap[dStr]?.status === 'approved' && r.status !== 'approved') return;
            rMap[dStr] = r;
          }
        });
        setRegularizationsMap(rMap);

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const weeklyOffs = orgData?.weekly_offs || [0];
        const holidays = holsData || [];
        const leaves = leavesData || [];
        const attMap: Record<string, any> = {};
        (monthData || []).forEach(r => { attMap[r.date] = r; });
        (singMonthData?.data || []).forEach((r: any) => {
          const ds = r.attendance_date;
          if (ds) {
            const existing = attMap[ds] || {};
            const isReg = r.is_regularized || r.override_status === 'present' || existing.is_regularized || existing.status === 'present';
            attMap[ds] = {
              ...existing,
              id: existing.id || r.id,
              date: ds,
              employee_id: r.employee_id,
              clock_in_time: existing.clock_in_time || r.clock_in_time,
              clock_out_time: existing.clock_out_time || r.clock_out_time,
              status: isReg ? 'present' : (r.override_status || existing.status || r.status),
              override_status: r.override_status,
              is_regularized: isReg,
            };
          }
        });

        const joiningDateStr = empData.joining_date || safeFormatDate(empData.created_at || new Date(), 'yyyy-MM-dd');
        const monthDays = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
        // Show days up to today for past/current month
        const eligibleDays = monthDays.filter(d => {
          const dStr = format(d, 'yyyy-MM-dd');
          const hasRecord = !!attMap[dStr] || !!rMap[dStr] || leaves.some(l => dStr >= l.start_date && dStr <= (l.end_date || l.start_date));
          return dStr <= todayStr && (dStr >= joiningDateStr || hasRecord);
        });

        const fullRecords = eligibleDays.map(d => {
          const ds = format(d, 'yyyy-MM-dd');
          const isWeekOff = weeklyOffs.includes(d.getDay());
          const isHol = holidays.some(h => h.date === ds);
          const hasLeave = leaves.some(l => ds >= l.start_date && ds <= (l.end_date || l.start_date));
          const existing = attMap[ds];
          const reg = rMap[ds];
          const isApprovedReg = reg && reg.status === 'approved';
          const isPendingReg = reg && reg.status === 'pending';

          if (hasLeave) {
            return {
              id: existing?.id || `leave-${ds}`,
              date: ds,
              status: 'approved_leave',
              clock_in_time: existing?.clock_in_time || null,
              clock_out_time: existing?.clock_out_time || null
            };
          }

          if (isApprovedReg) {
            const clkIn = reg.requested_clock_in
              ? (reg.requested_clock_in.includes('T') ? reg.requested_clock_in : `${ds}T${reg.requested_clock_in}`)
              : (existing?.clock_in_time || `${ds}T09:30:00`);
            const clkOut = reg.requested_clock_out
              ? (reg.requested_clock_out.includes('T') ? reg.requested_clock_out : `${ds}T${reg.requested_clock_out}`)
              : (existing?.clock_out_time || `${ds}T18:30:00`);

            return {
              id: existing?.id || `reg-${ds}`,
              date: ds,
              status: 'present',
              clock_in_time: clkIn,
              clock_out_time: clkOut,
              is_regularized: true,
              clock_in_location: existing?.clock_in_location || null,
              clock_out_location: existing?.clock_out_location || null,
            };
          }

          if (existing) {
            const isReg = isApprovedReg || existing.is_regularized || existing.override_status === 'present' || existing.status === 'present';
            const calculatedStatus = getEffectiveAttendanceStatus(existing, shift, isReg);
            return {
              ...existing,
              status: isReg ? 'present' : calculatedStatus,
              is_regularized: isReg,
            };
          }

          if (isWeekOff || isHol) {
            return {
              id: `hol-${ds}`,
              date: ds,
              status: 'holiday',
              clock_in_time: null,
              clock_out_time: null
            };
          }

          // Past day without attendance -> Absent or Pending Regularization
          let isAbsent = true;
          if (ds === todayStr) {
            const now = new Date();
            const toMins = (t: string) => { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; };
            const halfEnd = toMins(shift?.half_day_end || '14:00');
            if (now.getHours() * 60 + now.getMinutes() <= halfEnd) {
              isAbsent = false;
            }
          }

          if (isAbsent || isPendingReg) {
            const clkIn = reg?.requested_clock_in
              ? (reg.requested_clock_in.includes('T') ? reg.requested_clock_in : `${ds}T${reg.requested_clock_in}`)
              : (existing?.clock_in_time || null);
            const clkOut = reg?.requested_clock_out
              ? (reg.requested_clock_out.includes('T') ? reg.requested_clock_out : `${ds}T${reg.requested_clock_out}`)
              : (existing?.clock_out_time || null);
            return {
              id: existing?.id || `absent-${ds}`,
              date: ds,
              status: existing ? getEffectiveAttendanceStatus(existing, shift, false) : 'absent',
              clock_in_time: clkIn,
              clock_out_time: clkOut,
              clock_in_location: existing?.clock_in_location || null,
              clock_out_location: existing?.clock_out_location || null,
            };
          }
          
          return null;
        }).filter(Boolean);

        setRecords(fullRecords.reverse());
      }
    } catch (err: any) {
      const msg = err?.message || '';
      const isBenign = msg.includes('relation') || msg.includes('does not exist') || msg.includes('function') || msg.includes('rpc');
      if (!isBenign) {
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      } else {
        console.error('[HistoryPage] loadData error:', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [session, currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    if (next <= new Date()) setCurrentMonth(next);
  };

  const openRegularizeModal = (dateStr: string, inTime: string | null, outTime: string | null) => {
    setSelectedRegDate(dateStr);
    setSelectedClockIn(inTime);
    setSelectedClockOut(outTime);
    setRegDialogOpen(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present': return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'late': return <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'absent': return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      case 'half-day': case 'half_day': return <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
      case 'approved_leave': case 'paid_leave': return <AlertCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case 'holiday': return <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      default: return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      case 'late': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      case 'absent': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      case 'half-day': case 'half_day': return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
      case 'approved_leave': case 'paid_leave': return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
      case 'holiday': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      default: return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
    }
  };

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'present': return 'Present';
      case 'late': return 'Late Coming';
      case 'half-day': case 'half_day': return 'Half Day';
      case 'absent': return 'Absent';
      case 'approved_leave': return 'Approved Leave';
      case 'paid_leave': return 'Paid Leave';
      case 'holiday': return 'Holiday / Off';
      default: return status;
    }
  };

  return (
    <div className="relative w-full max-w-lg mx-auto md:max-w-5xl pb-4 px-4 sm:px-0">
      <div className="relative z-10 space-y-5 mt-4">
        {/* Header and Month Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="rounded-xl h-9">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="text-gray-900 dark:text-white">
              <h1 className="text-2xl font-bold mb-0.5">Attendance History</h1>
              {employeeShift && (
                <p className="text-xs opacity-90 font-medium text-slate-500 dark:text-slate-400">
                  Shift: {employeeShift.name} ({employeeShift.start_time?.slice(0,5)} - {employeeShift.end_time?.slice(0,5)}) &bull; Grace: {employeeShift.grace_minutes ?? 15}m
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-4 bg-white dark:bg-slate-800 px-5 py-2.5 rounded-full shadow-sm border border-gray-100 dark:border-slate-700 self-start sm:self-auto shrink-0 w-full sm:w-auto justify-between sm:justify-start">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8 rounded-full dark:hover:bg-slate-700 hover:bg-orange-50 text-orange-600 dark:text-orange-400">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="font-bold text-gray-800 dark:text-white w-28 text-center text-sm">
              {format(currentMonth, 'MMM yyyy')}
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleNextMonth}
              disabled={new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1) > new Date()}
              className="h-8 w-8 rounded-full dark:hover:bg-slate-700 hover:bg-orange-50 text-orange-600 dark:text-orange-400"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Attendance Calendar */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 mt-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Monthly Attendance</h3>
            <span className="text-xs font-semibold px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-[10px] font-bold text-gray-400 dark:text-slate-500">{day}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {(() => {
              const validCurrent = safeParseDate(currentMonth) || new Date();
              const monthStart = startOfMonth(validCurrent);
              const monthEnd = endOfMonth(monthStart);
              const startDate = startOfWeek(monthStart);
              const endDate = endOfWeek(monthEnd);
              const dateFormat = "yyyy-MM-dd";
              let days: Date[] = [];
              try {
                days = eachDayOfInterval({ start: startDate, end: endDate });
              } catch {
                days = [];
              }

              return days.map((day, i) => {
                const dateStr = format(day, dateFormat);
                const record = records.find(r => r.date === dateStr);
                
                let bgColor = "bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300"; // default/future
                let dotColor = null;

                if (!isSameMonth(day, monthStart)) {
                  bgColor = "text-gray-300 dark:text-slate-600 opacity-50"; // out of month
                } else if (new Date(dateStr) > new Date()) {
                  // Future days in current month
                  bgColor = "bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500";
                } else if (record) {
                  const status = record.status;
                  if (status === 'present') {
                    bgColor = "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold";
                    dotColor = "bg-green-500";
                  } else if (status === 'absent') {
                    bgColor = "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-bold";
                    dotColor = "bg-red-500";
                  } else if (status === 'half_day' || status === 'half-day') {
                    bgColor = "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-bold";
                    dotColor = "bg-orange-500";
                  } else if (status === 'late') {
                    bgColor = "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-bold";
                    dotColor = "bg-amber-500";
                  } else if (status === 'holiday') {
                    bgColor = "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-bold";
                  } else if (status === 'approved_leave' || status === 'paid_leave') {
                    bgColor = "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 font-bold";
                  }
                } else if (day.getDay() === 0 || day.getDay() === 6) {
                   // Weekend fallback if no record
                   bgColor = "bg-gray-100 dark:bg-slate-800 text-gray-500";
                } else {
                   // Past weekday with no record = Absent normally, but let's just make it red
                   bgColor = "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-bold";
                   dotColor = "bg-red-500";
                }

                const isToday = isSameDay(day, new Date());
                if (isToday) {
                  bgColor += " ring-2 ring-orange-500 ring-offset-1 dark:ring-offset-slate-900";
                }

                return (
                  <div key={i} className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs relative ${bgColor}`}>
                    <span>{format(day, 'd')}</span>
                    {dotColor && <div className={`w-1 h-1 rounded-full absolute bottom-1 ${dotColor}`}></div>}
                  </div>
                );
              });
            })()}
          </div>
          
          {/* Legend */}
            <div className="flex flex-wrap justify-center gap-3 mt-4 text-[10px] font-medium text-gray-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Present</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Absent</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Late</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Half Day</span>
            </div>
          </div>

        
<div className="mt-8">
<h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 px-1">Attendance List</h2>
{/* Desktop View */}
        <Card className="hidden md:block rounded-3xl shadow-sm border-gray-100 dark:border-slate-700 overflow-hidden dark:bg-slate-800 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[600px]">
              <thead className="bg-gray-50/80 dark:bg-slate-900/50 text-gray-500 dark:text-slate-400 font-semibold border-b border-gray-100 dark:border-slate-700 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Clock In</th>
                  <th className="px-6 py-4">Clock Out</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50 bg-white dark:bg-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium">Loading records...</td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium">No attendance records found for this month.</td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const reg = regularizationsMap[record.date];
                    const isPendingReg = reg && reg.status === 'pending';
                    const isApprovedReg = reg && reg.status === 'approved';

                    return (
                      <tr key={record.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white">
                          {safeFormatDate(record.date, 'EEE, MMM dd')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border ${getStatusColor(record.status)}`}>
                            {getStatusIcon(record.status)}
                            <span className="ml-1.5">{formatStatusLabel(record.status)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-slate-200 font-medium">
                          {record.clock_in_time ? (
                            <div className="flex flex-col">
                              <div className="flex items-center">
                                <Clock className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                                {safeFormatTime(record.clock_in_time, '-', 'hh:mm a')}
                              </div>
                              {record.clock_in_location?.address && (
                                <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate max-w-[200px] mt-0.5 flex items-center gap-1 font-normal" title={record.clock_in_location.address}>
                                  {record.clock_in_location.source === 'laptop' || record.clock_in_location.address.toLowerCase().includes('laptop') ? (
                                    <Laptop className="w-3 h-3 text-indigo-500 shrink-0" />
                                  ) : (
                                    <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                                  )}
                                  <span>{record.clock_in_location.address}</span>
                                </div>
                              )}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-slate-200 font-medium">
                          {record.clock_out_time ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center">
                                  <Clock className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                                  {safeFormatTime(record.clock_out_time, '-', 'hh:mm a')}
                                </div>
                                {(record.is_auto_clock_out || record.clock_out_location?.auto || record.clock_out_location?.is_auto_clock_out) && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                                    Auto Logout
                                  </span>
                                )}
                              </div>
                              {record.clock_out_location?.address && (
                                <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate max-w-[200px] mt-0.5 flex items-center gap-1 font-normal" title={record.clock_out_location.address}>
                                  {record.clock_out_location.source === 'laptop' || record.clock_out_location.address.toLowerCase().includes('laptop') ? (
                                    <Laptop className="w-3 h-3 text-indigo-500 shrink-0" />
                                  ) : (
                                    <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                                  )}
                                  <span>{record.clock_out_location.address}</span>
                                </div>
                              )}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {isPendingReg ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                              <Clock className="w-3 h-3 mr-1" /> Pending
                            </span>
                          ) : isApprovedReg ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Regularized
                            </span>
                          ) : (
                            record.status !== 'holiday' && record.status !== 'approved_leave' && (
                              <Button 
                                variant="outline" 
                                onClick={() => openRegularizeModal(record.date, record.clock_in_time, record.clock_out_time)}
                                className="text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-900/30 h-8 rounded-xl font-bold text-xs"
                              >
                                Regularize
                              </Button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile View */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <p className="text-center text-gray-500 py-8 font-medium">Loading records...</p>
          ) : records.length === 0 ? (
            <p className="text-center text-gray-500 py-8 font-medium">No attendance records found.</p>
          ) : (
            records.map((record) => {
              const reg = regularizationsMap[record.date];
              const isPendingReg = reg && reg.status === 'pending';
              const isApprovedReg = reg && reg.status === 'approved';
              
              const leftBorderColor = () => {
                 switch (record.status) {
                    case 'present': return 'border-l-green-500';
                    case 'late': return 'border-l-amber-500';
                    case 'absent': return 'border-l-red-500';
                    case 'half-day': case 'half_day': return 'border-l-orange-500';
                    case 'approved_leave': case 'paid_leave': return 'border-l-purple-500';
                    case 'holiday': return 'border-l-blue-500';
                    default: return 'border-l-gray-300 dark:border-l-slate-600';
                 }
              };

              return (
                <div key={record.id} className={`flex items-center justify-between p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 border-l-4 ${leftBorderColor()}`}>
                  <div className="flex flex-col gap-1 min-w-[60px]">
                    <div className="font-bold text-gray-900 dark:text-white text-xs">
                      {safeFormatDate(record.date, 'MMM dd')}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">
                      {safeFormatDate(record.date, 'EEE')}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center gap-1 flex-1 px-2">
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${getStatusColor(record.status)}`}>
                      {getStatusIcon(record.status)}
                      <span className="ml-1">{formatStatusLabel(record.status)}</span>
                    </div>
                    <div className="flex items-center text-[10px] font-medium text-gray-600 dark:text-slate-300 gap-1.5 flex-wrap justify-center">
                       <span>{safeFormatTime(record.clock_in_time, '--:--', 'HH:mm')}</span>
                       <span className="text-gray-300 dark:text-slate-600">-</span>
                       <span>{safeFormatTime(record.clock_out_time, '--:--', 'HH:mm')}</span>
                       {(record.is_auto_clock_out || record.clock_out_location?.auto || record.clock_out_location?.is_auto_clock_out) && (
                         <span className="text-[8px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded border border-amber-200/50">
                           Auto Logout
                         </span>
                       )}
                    </div>
                    {record.clock_in_location?.address && (
                      <div className="text-[9px] text-gray-400 dark:text-slate-500 truncate max-w-[200px] mt-0.5 flex items-center gap-1 justify-center" title={record.clock_in_location.address}>
                        {record.clock_in_location.source === 'laptop' || record.clock_in_location.address.toLowerCase().includes('laptop') ? (
                          <Laptop className="w-3 h-3 text-indigo-500 shrink-0" />
                        ) : (
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                        )}
                        <span>{record.clock_in_location.address}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="min-w-[70px] flex justify-end">
                    {isPendingReg ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md text-center w-full">Pending</span>
                    ) : isApprovedReg ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded-md text-center w-full">Resolved</span>
                    ) : (
                      record.status !== 'holiday' && record.status !== 'approved_leave' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openRegularizeModal(record.date, record.clock_in_time, record.clock_out_time)}
                          className="text-[10px] h-7 px-2 rounded-lg border-orange-200 text-orange-600 hover:bg-orange-50 font-bold w-full"
                        >
                          Action
                        </Button>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        </div>
<RegularizeDialog
          open={regDialogOpen}
          onOpenChange={setRegDialogOpen}
          employee={employee}
          defaultDate={selectedRegDate}
          defaultClockIn={selectedClockIn}
          defaultClockOut={selectedClockOut}
          onSuccess={loadData}
        />
      </div>
    </div>
  );
}
