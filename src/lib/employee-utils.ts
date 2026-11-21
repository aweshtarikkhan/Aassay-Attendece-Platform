import { supabase } from '@/integrations/supabase/client';

export function clearEmployeeCache() {
  try {
    localStorage.removeItem('attendance_employee');
    localStorage.removeItem('attendance_org_name');
    localStorage.removeItem('attendance_org_data');
    localStorage.removeItem('attendance_today_record');
  } catch (e) {
    console.warn('Failed clearing employee cache:', e);
  }
}

export function getCachedEmployee(expectedUserId?: string): any {
  try {
    const raw = localStorage.getItem('attendance_employee');
    if (!raw) return null;
    const emp = JSON.parse(raw);
    if (expectedUserId && emp?.auth_user_id && emp.auth_user_id !== expectedUserId) {
      clearEmployeeCache();
      return null;
    }
    return emp;
  } catch {
    return null;
  }
}

export function getCachedOrganization(): any {
  try {
    const raw = localStorage.getItem('attendance_org_data');
    if (raw) return JSON.parse(raw);
    const name = localStorage.getItem('attendance_org_name');
    return name ? { name } : null;
  } catch {
    return null;
  }
}

export function getCachedBusinessName(): string {
  try {
    const direct = localStorage.getItem('attendance_org_name');
    if (direct && direct.trim()) return direct.trim();
    const orgRaw = localStorage.getItem('attendance_org_data');
    if (orgRaw) {
      const org = JSON.parse(orgRaw);
      if (org?.name && org.name.trim()) return org.name.trim();
    }
  } catch {}
  return '';
}

export function saveEmployeeCache(emp: any, org?: any) {
  try {
    if (emp) {
      localStorage.setItem('attendance_employee', JSON.stringify(emp));
    }
    const targetOrg = org || emp?.organization;
    if (targetOrg?.name) {
      localStorage.setItem('attendance_org_name', targetOrg.name);
      localStorage.setItem('attendance_org_data', JSON.stringify(targetOrg));
    }
  } catch (e) {
    console.warn('Failed saving employee cache to localStorage:', e);
  }
}

/**
 * Robust helper to resolve an employee record for the current session/user.
 * 1. Checks `employees.auth_user_id == user.id` using safe select('*')
 * 2. If not found, falls back to `employees.email ilike user.email` (and strips `attendance_` prefix if present)
 * 3. Enforces is_active === true
 * 4. Auto-heals auth_user_id if needed
 * 5. Safely fetches organization details (id, name, logo_url, weekly_offs)
 * 6. Strictly returns null if no valid active employee record exists for the authenticated user.
 */
export async function resolveCurrentEmployee(sessionOrUser: any): Promise<any> {
  const user = sessionOrUser?.user || sessionOrUser;
  if (!user) return null;

  try {
    let emp: any = null;

    // 1. Try finding by auth_user_id first with safe select('*')
    if (user.id) {
      const { data: byAuthId, error } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (!error && byAuthId && byAuthId.length > 0) {
        emp = byAuthId[0];
      }
    }

    // 2. Fallback: match by email (case-insensitive)
    if (!emp && user.email) {
      const rawEmail = String(user.email).trim().toLowerCase();
      const cleanEmail = rawEmail.replace(/^attendance_/i, '');

      let { data: byEmail } = await supabase
        .from('employees')
        .select('*')
        .ilike('email', cleanEmail)
        .eq('is_active', true)
        .limit(1);

      if ((!byEmail || byEmail.length === 0) && rawEmail !== cleanEmail) {
        const res = await supabase
          .from('employees')
          .select('*')
          .ilike('email', rawEmail)
          .eq('is_active', true)
          .limit(1);
        byEmail = res.data;
      }

      if (byEmail && byEmail.length > 0) {
        emp = byEmail[0];

        // Auto-heal auth_user_id in database if it was null or mismatched
        if (user.id && emp.auth_user_id !== user.id) {
          try {
            await supabase
              .from('employees')
              .update({ auth_user_id: user.id })
              .eq('id', emp.id);
            emp.auth_user_id = user.id;
          } catch (healErr) {
            console.warn('Auto-healing auth_user_id failed:', healErr);
          }
        }
      }
    }

    if (emp) {
      // Extra safety: ensure employee is active
      if (emp.is_active === false) {
        clearEmployeeCache();
        return null;
      }

      // Safely fetch organization details if not already attached
      if (!emp.organization && emp.org_id) {
        try {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id, name, logo_url, weekly_offs')
            .eq('id', emp.org_id)
            .maybeSingle();
          if (orgData) {
            emp.organization = orgData;
          }
        } catch (orgErr) {
          console.warn('Separate organization fetch failed:', orgErr);
        }
      }

      saveEmployeeCache(emp, emp.organization);
      return emp;
    }
  } catch (err) {
    console.error('Error resolving employee:', err);
  }

  // Strictly no match found — clear stale cache and return null
  clearEmployeeCache();
  return null;
}
