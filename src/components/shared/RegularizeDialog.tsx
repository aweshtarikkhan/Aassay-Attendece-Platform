import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { safeFormatDate, safeFormatTime, toSafeIsoTime } from "@/lib/utils";

interface RegularizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: any;
  defaultDate?: string;
  defaultClockIn?: string | null;
  defaultClockOut?: string | null;
  onSuccess?: () => void;
}

export function RegularizeDialog({
  open,
  onOpenChange,
  employee: initialEmployee,
  defaultDate,
  defaultClockIn,
  defaultClockOut,
  onSuccess,
}: RegularizeDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<any>(initialEmployee);
  const [date, setDate] = useState(defaultDate || format(new Date(), 'yyyy-MM-dd'));
  const [clockInTime, setClockInTime] = useState('09:00');
  const [clockOutTime, setClockOutTime] = useState('18:00');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (initialEmployee) {
      setEmployee(initialEmployee);
    } else if (open) {
      // Auto fetch employee profile if not provided
      const fetchEmp = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('employees')
            .select('*')
            .eq('auth_user_id', user.id)
            .maybeSingle();
          if (data) setEmployee(data);
        }
      };
      fetchEmp();
    }
  }, [open, initialEmployee]);

  useEffect(() => {
    if (open) {
      setDate(defaultDate || format(new Date(), 'yyyy-MM-dd'));
      setClockInTime(safeFormatTime(defaultClockIn, '09:00', 'HH:mm'));
      setClockOutTime(safeFormatTime(defaultClockOut, '18:00', 'HH:mm'));
      setReason('');
    }
  }, [open, defaultDate, defaultClockIn, defaultClockOut]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let currentEmp = employee;
    if (!currentEmp?.id || !currentEmp?.org_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        currentEmp = data;
        if (data) setEmployee(data);
      }
    }

    if (!currentEmp?.id || !currentEmp?.org_id) {
      toast({ title: 'Error', description: 'Employee profile not found. Please re-login.', variant: 'destructive' });
      return;
    }
    if (!date) {
      toast({ title: 'Missing Date', description: 'Please select a date for regularization.', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'Missing Reason', description: 'Please provide a reason for regularization.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const requestedInIso = toSafeIsoTime(date, clockInTime);
      const requestedOutIso = toSafeIsoTime(date, clockOutTime);

      // 1. Insert regularization request
      const { error: regError } = await supabase.from('attendance_regularizations').insert({
        org_id: currentEmp.org_id,
        employee_id: currentEmp.id,
        date: date,
        requested_clock_in: requestedInIso,
        requested_clock_out: requestedOutIso,
        reason: reason.trim(),
        status: 'pending'
      });

      if (regError) throw regError;

      // 2. Notify HR
      try {
        await supabase.from('notifications').insert({
          org_id: currentEmp.org_id,
          title: 'Attendance Regularization Request',
          message: `${currentEmp.name} requested attendance regularization for ${date}. Reason: ${reason.trim()}`,
          type: 'regularization_request'
        });
      } catch (notifErr) {
        console.warn('Failed to send notification to HR:', notifErr);
      }

      toast({
        title: 'Request Submitted',
        description: `Your regularization request for ${date} has been sent to HR for approval.`,
      });

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err.message || 'Could not submit regularization request.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg dark:bg-slate-800 dark:text-white dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Attendance Regularization
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Missed a punch, clocked in late by accident, or were on field duty? Request attendance correction from HR.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reg-date" className="text-sm font-medium dark:text-slate-200">
              Date to Regularize <span className="text-red-500">*</span>
            </Label>
            <Input
              id="reg-date"
              type="date"
              value={date}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
              className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="clock-in" className="text-sm font-medium dark:text-slate-200">
                Requested Clock In
              </Label>
              <Input
                id="clock-in"
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clock-out" className="text-sm font-medium dark:text-slate-200">
                Requested Clock Out
              </Label>
              <Input
                id="clock-out"
                type="time"
                value={clockOutTime}
                onChange={(e) => setClockOutTime(e.target.value)}
                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-sm font-medium dark:text-slate-200">
              Reason / Explanation <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="e.g. Forgot to punch in on arrival, client on-site visit, network issue, etc."
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              required
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 p-3 rounded-lg flex items-start gap-2.5 text-xs text-blue-800 dark:text-blue-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>
              Your request will be submitted to your HR manager for review. Once approved, your attendance log and status will update automatically.
            </span>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
            >
              {loading ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
