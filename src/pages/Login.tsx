import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Building2, Eye, EyeOff } from 'lucide-react';
import { resolveCurrentEmployee, clearEmployeeCache } from '@/lib/employee-utils';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Clear any previous stale employee cache before authenticating
    clearEmployeeCache();

    const clean = email.trim().toLowerCase();
    const attEmail = clean.startsWith('attendance_') ? clean : `attendance_${clean}`;

    // 1. First attempt sign in with attendance-namespaced email
    let { data, error } = await supabase.auth.signInWithPassword({
      email: attEmail,
      password,
    });

    // 2. Fallback to direct clean email for legacy accounts created before namespacing
    if (error && !clean.startsWith('attendance_')) {
      const fallback = await supabase.auth.signInWithPassword({
        email: clean,
        password,
      });
      if (!fallback.error) {
        error = null;
        data = fallback.data;
      }
    }

    if (error) {
      toast({
        title: 'Login Failed',
        description: 'Email ID & password mismatch or you do not have access to Attendance Portal. Please contact your organization administrator.',
        variant: 'destructive',
      });
    } else if (data?.user) {
      // Proactively ensure employee record is linked with auth_user_id and is an active employee
      try {
        const emp = await resolveCurrentEmployee(data.user);
        if (!emp || emp.is_active === false) {
          // User is authenticated in Supabase (e.g. org admin or invoice portal user), but NOT an active employee
          await supabase.auth.signOut();
          clearEmployeeCache();
          toast({
            title: 'Access Denied',
            description: 'Email ID & password mismatch or you do not have access to Attendance Portal. Please contact your organization administrator.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
      } catch (linkErr) {
        console.warn('Initial employee resolve error:', linkErr);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 dark:bg-slate-900 p-4 transition-colors">
      <Card className="w-full max-w-md shadow-lg border-primary/10 dark:border-slate-800 dark:bg-slate-800 transition-colors">
        <CardHeader className="text-center pb-8">
          <div className="mx-auto w-12 h-12 bg-primary/10 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold dark:text-white">Employee Portal</CardTitle>
          <CardDescription className="dark:text-slate-400">Sign in to manage your attendance</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="dark:text-slate-300">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="dark:text-slate-300">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="dark:bg-slate-900 dark:border-slate-700 dark:text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
