import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { CalendarDays, MapPin, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee } from '@/lib/employee-utils';
import { safeFormatDate, safeParseDate } from '@/lib/utils';

export default function HolidaysPage({ session }: { session: any }) {
  const navigate = useNavigate();
  const [holidays, setHolidays] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('attendance_holidays');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => !localStorage.getItem('attendance_holidays'));
  const { toast } = useToast();

  useEffect(() => {
    const loadHolidays = async () => {
      try {
        if (!holidays.length) setLoading(true);
        const empData = await resolveCurrentEmployee(session?.user);

        if (empData?.org_id) {
          const { data } = await supabase
            .from('holidays')
            .select('*')
            .eq('org_id', empData.org_id)
            .order('date', { ascending: true });
          
          setHolidays(data || []);
          if (data) {
            try { localStorage.setItem('attendance_holidays', JSON.stringify(data)); } catch {}
          }
        }
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    loadHolidays();
  }, [session]);

  const upcomingHolidays = holidays.filter(h => { const d = safeParseDate(h.date); return d ? d >= new Date() : false; });
  const pastHolidays = holidays.filter(h => { const d = safeParseDate(h.date); return d ? d < new Date() : false; });

  // Group by month
  const groupedHolidays = upcomingHolidays.reduce((acc, curr) => {
    const month = safeFormatDate(curr.date, 'MMMM yyyy');
    if (!acc[month]) acc[month] = [];
    acc[month].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="relative w-full max-w-lg mx-auto md:max-w-5xl pb-4 px-4 pt-4">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Company Holidays</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">Public and company holidays for the year</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-slate-400 py-8 text-center font-bold">Loading holidays...</p>
      ) : (
        <div className="space-y-6">
          {Object.keys(groupedHolidays).length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-slate-700 text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <CalendarDays className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-gray-900 dark:text-white font-bold">No upcoming holidays.</p>
            </div>
          ) : (
            Object.entries(groupedHolidays).map(([month, monthHolidays]) => (
              <div key={month} className="space-y-3">
                <h2 className="text-sm font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider pl-1">{month}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {monthHolidays.map((holiday) => (
                    <div key={holiday.id} className="bg-white dark:bg-slate-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex gap-4 items-center">
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex flex-col items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-orange-600 dark:text-orange-400 leading-none mb-1">{safeFormatDate(holiday.date, 'MMM')}</span>
                          <span className="text-lg font-black text-[#0a192f] dark:text-white leading-none">{safeFormatDate(holiday.date, 'dd')}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white text-base">{holiday.name}</h3>
                          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500 mt-0.5">{safeFormatDate(holiday.date, 'EEEE')} • {holiday.type} Holiday</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {pastHolidays.length > 0 && (
            <div className="pt-4">
              <h2 className="text-sm font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider pl-1 mb-3">Past Holidays</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-60">
                {pastHolidays.map((holiday) => (
                  <div key={holiday.id} className="bg-gray-50/80 dark:bg-slate-900/40 rounded-3xl p-4 border border-gray-100 dark:border-slate-700/50 flex items-center justify-between">
                    <div className="flex gap-4 items-center">
                      <div className="w-12 h-12 rounded-2xl bg-gray-200/50 dark:bg-slate-800 flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-gray-500 dark:text-slate-400 leading-none mb-1">{safeFormatDate(holiday.date, 'MMM')}</span>
                        <span className="text-lg font-black text-gray-700 dark:text-slate-300 leading-none">{safeFormatDate(holiday.date, 'dd')}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-600 dark:text-slate-300 text-base">{holiday.name}</h3>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500 mt-0.5">{safeFormatDate(holiday.date, 'EEEE')} • {holiday.type}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
