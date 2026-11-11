import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { CalendarDays, User, LogOut, ChevronRight, Download, FileText, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage({ session }: { session: any }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const settingsOptions = [
    { name: 'Profile Settings', icon: User, path: '/profile', description: 'Update your personal details' },
    { name: 'My Documents', icon: FileText, path: '/documents', description: 'View & download employee documents' },
    { name: 'Holiday List', icon: CalendarDays, path: '/holidays', description: 'View company holidays' },
  ];

  return (
    <div className="w-full max-w-lg mx-auto md:max-w-3xl pb-4 px-4 pt-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden divide-y divide-gray-50 dark:divide-slate-700/50">
          {settingsOptions.map((option, i) => (
            <div 
              key={i}
              onClick={() => navigate(option.path)}
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center shrink-0">
                  <option.icon className="w-5 h-5 text-[#0a192f] dark:text-slate-300" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">{option.name}</h3>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mt-0.5">{option.description}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden mt-6">
          <div 
            onClick={() => window.dispatchEvent(new Event('trigger-install-prompt'))}
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group border-b border-gray-100 dark:border-slate-700"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-900/20 group-hover:bg-orange-100 flex items-center justify-center shrink-0 transition-colors">
                <Download className="w-5 h-5 text-orange-600 dark:text-orange-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Add to Home Screen</h3>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mt-0.5">Install app for quick access</p>
              </div>
            </div>
          </div>

          {/* Sign Out */}
          <div 
            onClick={handleLogout}
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-900/20 group-hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors">
                <LogOut className="w-5 h-5 text-red-600 dark:text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-red-600 dark:text-red-500 text-sm">Sign Out</h3>
                <p className="text-xs font-medium text-red-500/70 dark:text-red-400/70 mt-0.5">Log out of your account</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
