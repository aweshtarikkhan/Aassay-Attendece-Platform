import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { Umbrella, CheckCircle2, XCircle, Clock, ChevronRight, CalendarIcon, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, safeFormatDate } from "@/lib/utils";
import { resolveCurrentEmployee, getCachedEmployee } from "@/lib/employee-utils";

const LEAVE_OPTIONS = [
  { key: "casual",    label: "Casual Leave" },
  { key: "sick",      label: "Sick Leave" },
  { key: "el_pl",     label: "Paid / Earned Leave" },
  { key: "comp_off",  label: "Compensatory Off" },
  { key: "wfh",       label: "Work From Home" },
  { key: "lwp",       label: "Leave Without Pay" },
  { key: "half_day",  label: "Half Day Leave" },
  { key: "maternity", label: "Maternity / Paternity Leave" },
];

export default function LeaveManagementPage({ session }: { session: any }) {
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(() => !getCachedEmployee());
  const [applyOpen, setApplyOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();
  const [leaveBalances, setLeaveBalances] = useState<Record<string, { used: number; accrued: number; annual: number }>>({});
  const [insufficientError, setInsufficientError] = useState<{remaining: number, days: number, typeName: string} | null>(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [leaveToWithdraw, setLeaveToWithdraw] = useState<string | null>(null);

  const [leaveData, setLeaveData] = useState({
    startDate: "",
    endDate: "",
    leaveType: "casual",
    reason: ""
  });

  const [durationType, setDurationType] = useState<"single" | "multiple">("single");
  const [calOpen1, setCalOpen1] = useState(false);
  const [calOpen2, setCalOpen2] = useState(false);
  const [calOpen3, setCalOpen3] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const currentUser = session?.user || (await supabase.auth.getUser()).data?.user;
      const empData = (await resolveCurrentEmployee(currentUser)) || getCachedEmployee();
      if (empData) {
        setEmployee(empData);
        const [leavesRes, balancesRes, policiesRes, attRes] = await Promise.all([
          supabase.from("leaves").select("*").eq("employee_id", empData.id).order("created_at", { ascending: false }),
          (supabase as any).from("employee_leave_balances").select("*").eq("employee_id", empData.id),
          (supabase as any).from("leave_policies").select("*").eq("org_id", empData.org_id),
          supabase.from("attendances").select("date, clock_in_time").eq("employee_id", empData.id).not("clock_in_time", "is", null)
        ]);
        
        const leaves = leavesRes.data || [];
        setLeaves(leaves);
        const attendances = attRes.data || [];
        const attSet = new Set(attendances.map(a => a.date));

        const DEFAULT_ANNUAL: Record<string, number> = { casual: 12, sick: 5, el_pl: 15, comp_off: 0 };
        const bmap: Record<string, { used: number; accrued: number; annual: number }> = {};
        
        ["casual", "sick", "el_pl", "comp_off", "half_day", "wfh", "lwp"].forEach((t) => {
          const bal = (balancesRes.data || []).find((b: any) => b.leave_type === t);
          const pol = (policiesRes.data || []).find((p: any) => p.leave_type === t);
          
          // Calculate used dynamically: approved leaves unless employee clocked in on start_date
          const dynamicUsed = leaves
            .filter(l => l.leave_type === t && l.status === 'approved' && !attSet.has(l.start_date))
            .reduce((sum, l) => sum + (Number(l.days) || 1), 0);

          const polLimit = pol?.annual_limit !== undefined && pol?.annual_limit !== null ? Number(pol.annual_limit) : NaN;
          const baseAnnual = (t !== "comp_off" && (isNaN(polLimit) || polLimit === 0))
            ? (DEFAULT_ANNUAL[t] ?? 0)
            : (!isNaN(polLimit) ? polLimit : (DEFAULT_ANNUAL[t] ?? 0));
          const accrued = Number(bal?.accrued ?? 0);

          bmap[t] = {
            used: dynamicUsed,
            accrued,
            annual: Math.max(0, baseAnnual + accrued),
          };
        });
        setLeaveBalances(bmap);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [session]);

  const handleApplyLeave = async () => {
    if (!leaveData.startDate || !leaveData.reason) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    const effectiveEnd = durationType === "single" ? leaveData.startDate : leaveData.endDate;
    if (!effectiveEnd) {
      toast({ title: "Error", description: "Please select end date", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      let days = (new Date(effectiveEnd).getTime() - new Date(leaveData.startDate).getTime()) / (1000 * 3600 * 24) + 1;
      if (leaveData.leaveType === "half_day") days = 0.5;
      const TRACKED = ["casual", "sick", "el_pl", "comp_off"];
      if (TRACKED.includes(leaveData.leaveType)) {
        const bal = leaveBalances[leaveData.leaveType] || { used: 0, annual: 0 };
        const remaining = Math.max(0, bal.annual - bal.used);
        if (days > remaining) {
          const typeName = LEAVE_OPTIONS.find(t => t.key === leaveData.leaveType)?.label || leaveData.leaveType;
          setInsufficientError({ remaining, days, typeName });
          setActionLoading(false);
          return;
        }
      }

      const { error } = await supabase.from("leaves").insert({
        org_id: employee.org_id,
        employee_id: employee.id,
        start_date: leaveData.startDate,
        end_date: effectiveEnd,
        leave_type: leaveData.leaveType,
        reason: leaveData.reason,
        days,
        status: "pending"
      });
      if (error) throw error;
      toast({ title: "Success", description: "Leave request submitted successfully" });
      setApplyOpen(false);
      setLeaveData({ startDate: "", endDate: "", leaveType: "casual", reason: "" });
      setDurationType("single");
      loadData();
      await supabase.from("notifications").insert({
        org_id: employee.org_id,
        title: "New Leave Request",
        message: `${employee.name} applied for ${days} day(s) leave.`,
        type: "leave_request"
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelLeaveRequest = async (leaveId: string) => {
    try {
      setActionLoading(true);
      const { error } = await supabase.from("leaves").delete().eq("id", leaveId);
      if (error) {
        const { error: updErr } = await supabase.from("leaves").update({ status: "cancelled" }).eq("id", leaveId);
        if (updErr) throw updErr;
      }
      toast({ title: "Leave Request Withdrawn", description: "Your leave request has been cancelled." });
      await loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</span>;
      case "rejected": return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200"><XCircle className="w-3 h-3 mr-1" /> Rejected</span>;
      case "cancelled": return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200"><XCircle className="w-3 h-3 mr-1" /> Cancelled</span>;
      default: return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Pending</span>;
    }
  };

  const getBorderColor = (status: string) => {
    switch (status) {
      case "approved": return "border-l-green-500";
      case "rejected": return "border-l-red-500";
      case "cancelled": return "border-l-gray-300 opacity-60";
      default: return "border-l-yellow-500";
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto md:max-w-5xl px-5 pt-8 pb-24">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0a192f] tracking-tight mb-1.5">Leave Management</h1>
          <p className="text-sm font-medium text-gray-500">Track and apply for leaves</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="rounded-xl font-bold">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <div className="mb-8 overflow-x-auto pb-2 -mx-5 px-5">
        <div className="flex gap-4 min-w-max">
          {[
            { key: "casual",   label: "Casual",    color: "bg-blue-600",   iconColor: "text-blue-600",   iconBg: "bg-blue-50" },
            { key: "el_pl",    label: "Earned/PL", color: "bg-indigo-600", iconColor: "text-indigo-600", iconBg: "bg-indigo-50" },
            { key: "sick",     label: "Sick",      color: "bg-[#ff6b00]",  iconColor: "text-[#ff6b00]",  iconBg: "bg-orange-50" },
            { key: "comp_off", label: "Comp-Off",  color: "bg-teal-500",   iconColor: "text-teal-500",   iconBg: "bg-teal-50" },
          ].map(({ key, label, color, iconColor, iconBg }) => {
            const b = leaveBalances[key] || { used: 0, accrued: 0, annual: 0 };
            const remaining = Math.max(0, b.annual - b.used);
            const pct = b.annual > 0 ? Math.min(100, (b.used / b.annual) * 100) : 0;
            return (
              <div key={key} className="w-[145px] p-5 rounded-[24px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex-shrink-0 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`p-2 rounded-full ${iconBg}`}>
                    <Umbrella className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <span className="font-bold text-[#0a192f] text-[15px]">{label}</span>
                </div>
                <div className="flex flex-col mt-auto">
                  <span className={`text-[42px] font-black ${iconColor} leading-none tracking-tighter mb-1`}>{remaining}</span>
                  <span className="text-xs font-bold text-gray-400 mb-3">
                    / {b.annual} {b.used > 0 ? `(${b.used} used)` : "left"}
                  </span>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${pct >= 100 ? "bg-red-500" : color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {loading && <p className="text-xs font-bold text-gray-400 mt-2">Loading balances...</p>}
      </div>

      <div onClick={() => setApplyOpen(true)} className="w-full h-[64px] mb-8 bg-gradient-to-r from-[#ff6b00] to-[#ff8c00] hover:from-[#e66000] hover:to-[#e67e00] text-white rounded-[20px] shadow-[0_8px_24px_rgba(255,107,0,0.25)] flex justify-between items-center px-6 cursor-pointer active:scale-95 transition-all">
        <div className="flex items-center gap-4">
          <Umbrella className="w-6 h-6" />
          <span className="font-bold text-[17px]">Apply for Leave</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <ChevronRight className="w-5 h-5 text-white" />
        </div>
      </div>

      <div className="space-y-4 mb-4">
        <h3 className="text-[19px] font-black text-[#0a192f]">Leave History</h3>
        {loading ? (
          <p className="text-xs font-bold text-gray-500">Loading history...</p>
        ) : leaves.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col items-center justify-center mt-4">
            <div className="w-28 h-28 bg-[#f5f8ff] rounded-[40px] flex items-center justify-center mb-5">
              <Umbrella className="w-14 h-14 text-indigo-400" />
            </div>
            <h4 className="text-[17px] font-black text-[#0a192f] mb-2">No requests yet</h4>
            <p className="text-sm font-medium text-gray-500">You have not applied for any leaves.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaves.map((leave) => (
              <div key={leave.id} className={`flex flex-col p-4 rounded-2xl bg-white shadow-sm border border-gray-100 border-l-4 ${getBorderColor(leave.status)}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[15px] text-[#0a192f]">
                      {LEAVE_OPTIONS.find(l => l.key === leave.leave_type)?.label || leave.leave_type}
                    </span>
                    <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                      {safeFormatDate(leave.start_date, "MMM d")} - {safeFormatDate(leave.end_date, "MMM d")}
                    </span>
                  </div>
                  {getStatusBadge(leave.status)}
                </div>
                <div className="flex items-center justify-between mt-1 gap-2">
                  <p className="text-[13px] text-gray-500 font-medium truncate flex-1">{leave.reason}</p>
                  {leave.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actionLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLeaveToWithdraw(leave.id);
                        setWithdrawDialogOpen(true);
                      }}
                      className="h-7 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 shrink-0"
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={applyOpen} onOpenChange={(open) => { setApplyOpen(open); if (!open) { setLeaveData({ startDate: "", endDate: "", leaveType: "casual", reason: "" }); setDurationType("single"); } }}>
        <DialogContent className="rounded-2xl w-[92vw] max-w-md p-0 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="p-6 pb-2 shrink-0">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-lg font-bold text-[#0a192f]">Apply for Leave</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">Fill in the details to submit a leave request.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-2 overflow-y-auto flex-1 space-y-4" style={{ WebkitOverflowScrolling: 'touch' as any }}>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Leave Type</label>
              <select className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 text-[#0a192f]" value={leaveData.leaveType} onChange={e => setLeaveData({ ...leaveData, leaveType: e.target.value })}>
                {LEAVE_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Duration</label>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setDurationType("single")} className={`flex-1 py-2.5 text-sm font-semibold transition-all ${durationType === "single" ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-50"}`}>Single Day</button>
                <button onClick={() => setDurationType("multiple")} className={`flex-1 py-2.5 text-sm font-semibold transition-all ${durationType === "multiple" ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-50"}`}>Multiple Days</button>
              </div>
            </div>
            {durationType === "single" ? (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Leave Date</label>
                <Popover open={calOpen1} onOpenChange={setCalOpen1}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full h-11 justify-start text-left font-normal rounded-xl", !leaveData.startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {leaveData.startDate ? safeFormatDate(leaveData.startDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={leaveData.startDate ? parseISO(leaveData.startDate) : undefined} onSelect={d => { if (d) { const str = format(d, "yyyy-MM-dd"); setLeaveData({ ...leaveData, startDate: str, endDate: str }); setCalOpen1(false); } }} disabled={d => d < new Date(new Date().setHours(0,0,0,0))} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">From</label>
                  <Popover open={calOpen2} onOpenChange={setCalOpen2}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-11 justify-start text-left font-normal rounded-xl px-3", !leaveData.startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">{leaveData.startDate ? safeFormatDate(leaveData.startDate, "dd/MM/yyyy") : "Pick a date"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={leaveData.startDate ? parseISO(leaveData.startDate) : undefined} onSelect={d => { if (d) { const newStart = format(d, "yyyy-MM-dd"); const updates: any = { startDate: newStart }; if (leaveData.endDate && d > parseISO(leaveData.endDate)) { updates.endDate = newStart; } setLeaveData({ ...leaveData, ...updates }); setCalOpen2(false); } }} disabled={d => d < new Date(new Date().setHours(0,0,0,0))} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">To</label>
                  <Popover open={calOpen3} onOpenChange={setCalOpen3}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-11 justify-start text-left font-normal rounded-xl px-3", !leaveData.endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">{leaveData.endDate ? safeFormatDate(leaveData.endDate, "dd/MM/yyyy") : "Pick a date"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={leaveData.endDate ? parseISO(leaveData.endDate) : undefined} onSelect={d => { if (d) { setLeaveData({ ...leaveData, endDate: format(d, "yyyy-MM-dd") }); setCalOpen3(false); } }} disabled={d => leaveData.startDate ? d < parseISO(leaveData.startDate) : d < new Date(new Date().setHours(0,0,0,0))} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Reason</label>
              <div className="relative">
                <textarea className="w-full min-h-[70px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 text-[#0a192f]" placeholder="Brief reason for your leave..." maxLength={500} value={leaveData.reason} onChange={e => setLeaveData({ ...leaveData, reason: e.target.value })} />
                <span className="absolute bottom-2 right-3 text-[10px] text-gray-400">{leaveData.reason.length}/500</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3 p-6 pt-3 shrink-0 border-t border-gray-100 bg-white">
            <Button variant="outline" onClick={() => setApplyOpen(false)} className="flex-1 h-11 rounded-xl font-bold">Cancel</Button>
            <Button onClick={handleApplyLeave} disabled={actionLoading} className="flex-1 h-11 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold">
              {actionLoading ? "Submitting..." : "Submit Leave"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!insufficientError} onOpenChange={(o) => !o && setInsufficientError(null)}>
        <DialogContent className="sm:max-w-md text-center max-w-[90%] rounded-2xl p-6 z-[200000]">
          <div className="flex flex-col items-center justify-center gap-4 py-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-2">
              <XCircle className="w-8 h-8" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-center">Insufficient Leave Balance</DialogTitle>
              <DialogDescription className="text-center text-base mt-2 text-gray-600 dark:text-gray-300">
                You have <strong className="text-gray-900 dark:text-white">{insufficientError?.remaining} day(s)</strong> of {insufficientError?.typeName} remaining but you are applying for <strong className="text-gray-900 dark:text-white">{insufficientError?.days} day(s)</strong>.
              </DialogDescription>
            </DialogHeader>
            <Button className="w-full mt-4 h-11 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold dark:bg-gray-700 dark:hover:bg-gray-600" onClick={() => setInsufficientError(null)}>
              Okay, I understand
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw Leave Themed Confirmation Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-[92%] rounded-3xl p-6 text-center shadow-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex flex-col items-center justify-center pt-2">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mb-4 shadow-sm">
              <XCircle className="w-8 h-8" />
            </div>

            <DialogHeader className="text-center space-y-1.5">
              <DialogTitle className="text-xl font-bold text-center text-[#0a192f] dark:text-white">
                Withdraw Leave Request
              </DialogTitle>
              <DialogDescription className="text-center text-sm text-gray-500 dark:text-slate-400">
                Are you sure you want to cancel and withdraw this pending leave request?
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-3 w-full mt-6">
              <Button
                variant="outline"
                onClick={() => setWithdrawDialogOpen(false)}
                disabled={actionLoading}
                className="flex-1 h-11 rounded-xl font-bold border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Keep Request
              </Button>
              <Button
                onClick={async () => {
                  if (leaveToWithdraw) {
                    const id = leaveToWithdraw;
                    setWithdrawDialogOpen(false);
                    setLeaveToWithdraw(null);
                    await handleCancelLeaveRequest(id);
                  }
                }}
                disabled={actionLoading}
                className="flex-1 h-11 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/25 active:scale-95 transition-all"
              >
                {actionLoading ? 'Cancelling…' : 'Yes, Withdraw'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
