import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TasksPage from './pages/TasksPage';
import HistoryPage from './pages/HistoryPage';
import LeaveManagementPage from './pages/LeaveManagementPage';
import HolidaysPage from './pages/HolidaysPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import DocumentsPage from './pages/DocumentsPage';
import ExpensesPage from './pages/ExpensesPage';
import DashboardLayout from './components/layout/DashboardLayout';
import InstallPrompt from './components/InstallPrompt';
import { Toaster } from '@/components/ui/toaster';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={session ? <Navigate to="/dashboard" replace /> : <Login />} 
        />
        <Route 
          path="/login" 
          element={session ? <Navigate to="/dashboard" replace /> : <Login />} 
        />
        {session && (
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard session={session} />} />
            <Route path="/tasks" element={<TasksPage session={session} />} />
            <Route path="/history" element={<HistoryPage session={session} />} />
            <Route path="/leaves" element={<LeaveManagementPage session={session} />} />
            <Route path="/holidays" element={<HolidaysPage session={session} />} />
            <Route path="/chat" element={<ChatPage session={session} />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/documents" element={<DocumentsPage session={session} />} />
            <Route path="/expenses" element={<ExpensesPage session={session} />} />
            <Route path="/settings" element={<SettingsPage session={session} />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to={session ? "/dashboard" : "/"} replace />} />
      </Routes>
      <InstallPrompt />
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
