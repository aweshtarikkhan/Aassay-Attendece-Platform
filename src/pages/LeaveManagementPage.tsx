import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { 
  Umbrella, CheckCircle2, XCircle, Clock, ChevronRight, ChevronDown, 
  Calendar as CalendarIcon, ArrowLeft, Layers, Building2, Crown, 
  HeartPulse, CalendarX, History 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, safeFormatDate } from "@/lib/utils";
import { resolveCurrentEmployee, getCachedEmployee, getCachedBusinessName } from "@/lib/employee-utils";

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
        const bName = empData.organization?.name || getCachedBusinessName();
        if (bName) setBusinessName(bName);
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
    <div className="w-full max-w-lg mx-auto md:max-w-5xl px-4 sm:px-6 pt-3 sm:pt-4 pb-24">
      {/* Modern Curved Hero Banner */}
      <div className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] bg-gradient-to-r from-[#0a192f] via-[#0d284e] to-[#1e3a8a] p-5 sm:p-7 shadow-[0_12px_36px_rgba(10,25,47,0.18)] text-white mb-6">
        {/* Glow Accents */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-gradient-to-br from-[#2563eb]/30 to-[#ff6b00]/20 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-cyan-400/10 blur-xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center">
              <div className="w-1.5 h-12 sm:h-14 rounded-full bg-gradient-to-b from-cyan-400 via-[#ff6b00] to-[#ff6b00] mr-3 shrink-0 shadow-sm" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                  Leave<br />Management
                </h1>
              </div>
            </div>
            <p className="text-xs sm:text-sm font-medium text-blue-100/90 mt-2 sm:mt-2.5 max-w-[260px] sm:max-w-md">
              Track, manage and apply for your leaves
            </p>
          </div>

          {/* 3D Illustrated Calendar graphic */}
          <div className="relative shrink-0 w-24 h-20 sm:w-32 sm:h-28 select-none pointer-events-none">
            <svg viewBox="0 0 140 120" className="w-full h-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M125 15C132 18 135 28 130 35C124 33 120 25 125 15Z" fill="#34d399" opacity="0.85" />
              <path d="M132 45C138 48 140 55 136 60C132 58 130 52 132 45Z" fill="#6ee7b7" opacity="0.7" />
              <rect x="24" y="24" width="92" height="80" rx="18" fill="#1e40af" opacity="0.35" transform="rotate(-4 70 64)" />
              <g transform="rotate(-3 70 60)">
                <rect x="25" y="16" width="90" height="84" rx="16" fill="white" />
                <path d="M25 28C25 21.3726 30.3726 16 37 16H103C109.627 16 115 21.3726 115 28V38H25V28Z" fill="url(#cal_head)" />
                <rect x="42" y="10" width="6" height="14" rx="3" fill="#cbd5e1" stroke="#f1f5f9" strokeWidth="1.5" />
                <rect x="67" y="10" width="6" height="14" rx="3" fill="#cbd5e1" stroke="#f1f5f9" strokeWidth="1.5" />
                <rect x="92" y="10" width="6" height="14" rx="3" fill="#cbd5e1" stroke="#f1f5f9" strokeWidth="1.5" />
                <rect x="35" y="46" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="52" y="46" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="69" y="46" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="86" y="46" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="35" y="60" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="52" y="60" width="12" height="10" rx="3" fill="#93c5fd" />
                <rect x="69" y="60" width="12" height="10" rx="3" fill="#93c5fd" />
                <rect x="86" y="60" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="35" y="74" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="52" y="74" width="12" height="10" rx="3" fill="#e2e8f0" />
                <rect x="69" y="74" width="12" height="10" rx="3" fill="#e2e8f0" />
                <circle cx="96" cy="78" r="16" fill="url(#check_grad)" filter="drop-shadow(0 4px 8px rgba(16,185,129,0.4))" />
                <path d="M90 78L94 82L102 73" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <defs>
                <linearGradient id="cal_head" x1="25" y1="16" x2="115" y2="38" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#1d4ed8" />
                </linearGradient>
                <linearGradient id="check_grad" x1="80" y1="62" x2="112" y2="94" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#34d399" />
                  <stop offset="1" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Leave Balance Section Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg sm:text-xl font-black text-[#0a192f] tracking-tight">Leave Balance</h2>
        </div>
        <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 shadow-xs text-xs font-bold text-slate-700">
          <span>This Year</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>

      {/* 2x2 Grid of Balance Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        {[
          { key: "casual",   label: "Casual",    icon: Umbrella,   color: "bg-blue-600",   numColor: "text-blue-600",   iconColor: "text-blue-600",   iconBg: "bg-blue-50",   bgGrad: "from-white to-blue-50/20" },
          { key: "el_pl",    label: "Earned/PL", icon: Crown,      color: "bg-purple-600", numColor: "text-purple-600", iconColor: "text-purple-600", iconBg: "bg-purple-50", bgGrad: "from-white to-purple-50/20" },
          { key: "sick",     label: "Sick",      icon: HeartPulse, color: "bg-[#ff6b00]",  numColor: "text-[#ff6b00]",  iconColor: "text-[#ff6b00]",  iconBg: "bg-orange-50", bgGrad: "from-white to-orange-50/20" },
          { key: "comp_off", label: "Comp Off",  icon: CalendarX,  color: "bg-rose-600",   numColor: "text-rose-600",   iconColor: "text-rose-600",   iconBg: "bg-rose-50",   bgGrad: "from-white to-rose-50/20" },
        ].map(({ key, label, icon: Icon, color, numColor, iconColor, iconBg, bgGrad }) => {
          const b = leaveBalances[key] || { used: 0, accrued: 0, annual: 0 };
          const remaining = Math.max(0, b.annual - b.used);
          const pct = b.annual > 0 ? Math.min(100, (remaining / b.annual) * 100) : 0;
          return (
            <div
              key={key}
              className={cn(
                "relative overflow-hidden rounded-[24px] sm:rounded-[28px] bg-gradient-to-br bg-white p-4 sm:p-5 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col justify-between transition-all hover:shadow-md",
                bgGrad
              )}
            >
              <div className="flex items-center gap-2 sm:gap-2.5 mb-2 sm:mb-3">
                <div className={cn("w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs", iconBg)}>
                  <Icon className={cn("w-4 h-4 sm:w-5 sm:h-5", iconColor)} />
                </div>
                <span className="font-extrabold text-[#0a192f] text-sm sm:text-base leading-tight truncate">
                  {label}
                </span>
              </div>

              <div className="mt-1">
                <div className="flex items-baseline gap-1">
                  <span className={cn("text-2xl sm:text-3xl font-black tracking-tight", numColor)}>
                    {remaining}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-400">
                    / {b.annual}
                  </span>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-1.5 sm:h-2 mt-2.5 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", color)}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <p className="text-[11px] font-semibold text-slate-400 mt-2">
                  {b.used} used
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Apply for Leave CTA Button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setApplyOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setApplyOpen(true); }}
        className="w-full h-14 sm:h-16 mb-6 bg-gradient-to-r from-[#ff6b00] via-[#ff7817] to-[#ea580c] hover:opacity-95 text-white rounded-2xl sm:rounded-3xl shadow-[0_10px_25px_rgba(255,107,0,0.35)] flex items-center justify-between px-5 sm:px-6 cursor-pointer active:scale-[0.98] transition-all"
      >
        <div className="flex items-center gap-3">
          <Umbrella className="w-6 h-6 text-white" />
          <span className="font-black text-base sm:text-lg tracking-wide">Apply for Leave</span>
        </div>
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/25 flex items-center justify-center shadow-xs">
          <ChevronRight className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Leave History Section */}
      <div className="space-y-3.5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-800" />
            <h3 className="text-lg sm:text-xl font-black text-[#0a192f] tracking-tight">Leave History</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("leave-history-list");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="text-xs sm:text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
          >
            <span>View All</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <p className="text-xs font-bold text-slate-400 py-4 text-center">Loading history...</p>
        ) : leaves.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-[#f5f8ff] rounded-3xl flex items-center justify-center mb-4">
              <Umbrella className="w-10 h-10 text-indigo-400" />
            </div>
            <h4 className="text-base font-black text-[#0a192f] mb-1">No requests yet</h4>
            <p className="text-xs font-medium text-slate-400">You have not applied for any leaves.</p>
          </div>
        ) : (
          <div id="leave-history-list" className="space-y-3">
            {leaves.map((leave) => (
              <div
                key={leave.id}
                className={cn(
                  "flex flex-col p-4 rounded-2xl sm:rounded-3xl bg-white shadow-xs border border-slate-100 border-l-4 transition-all hover:shadow-sm",
                  getBorderColor(leave.status)
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-extrabold text-sm sm:text-base text-[#0a192f] truncate">
                      {LEAVE_OPTIONS.find(l => l.key === leave.leave_type)?.label || leave.leave_type}
                    </span>
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg shrink-0">
                      {safeFormatDate(leave.start_date, "MMM d")} - {safeFormatDate(leave.end_date, "MMM d")}
                    </span>
                  </div>
                  {getStatusBadge(leave.status)}
                </div>
                <div className="flex items-center justify-between mt-1 gap-2">
                  <p className="text-xs sm:text-sm text-slate-500 font-medium truncate flex-1">
                    {leave.reason || "No reason specified"}
                  </p>
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
                      className="h-7 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 rounded-lg shrink-0"
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
