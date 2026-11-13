import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, User, Phone, MapPin, Calendar, ShieldCheck, Key, Camera, Loader2, ArrowLeft } from 'lucide-react';
import { resolveCurrentEmployee, saveEmployeeCache } from '@/lib/employee-utils';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<any>(null);
  const [userEmail, setUserEmail] = useState('');
  
  // States for Email change & OTP
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [otp, setOtp] = useState('');
  const [showOtpField, setShowOtpField] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  
  // States for Password change
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  
  // States for Profile update
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsEmailVerified(!!user.email_confirmed_at);
        
        const empData = await resolveCurrentEmployee(user);
          
        const displayEmail = (empData?.email || user.email || '').replace(/^attendance_/, '');
        setUserEmail(displayEmail);

        if (empData) {
          setEmployee(empData);
          setPhone(empData.phone || empData.phone_number || '');
          setAddress(empData.address || '');
          let rawDob = empData.dob || empData.date_of_birth || '';
          if (rawDob && typeof rawDob === 'string' && rawDob.includes('T')) {
            rawDob = rawDob.split('T')[0];
          }
          setDob(rawDob);
          setAvatar(empData.avatar_url || empData.profile_image || '');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendEmailOtp = async () => {
    setLoadingEmail(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: userEmail
      });
      if (error) throw error;
      setShowOtpField(true);
      toast({ title: 'OTP sent!', description: 'Please check your email for the verification OTP.' });
    } catch (error: any) {
      toast({ title: 'Error sending OTP', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) return;
    setLoadingEmail(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: otp,
        type: 'signup'
      });
      if (error) throw error;
      toast({ title: 'Email successfully verified!' });
      setIsEmailVerified(true);
      setShowOtpField(false);
      setOtp('');
    } catch (error: any) {
      toast({ title: 'Error verifying OTP', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!oldPassword) {
      toast({ title: 'Please enter your current password.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'New passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setLoadingPassword(true);
    try {
      // Verify old password
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      });
      
      if (verifyError) {
        throw new Error('Current password is incorrect.');
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      
      toast({ title: 'Password updated successfully!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({ title: 'Error updating password', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!employee?.id) return;
    
    // Phone validation (10 digits if provided)
    const cleanPhone = phone.replace(/\D/g, '');
    if (phone && cleanPhone.length !== 10) {
      toast({ title: 'Invalid Phone Number', description: 'Please enter a valid 10-digit phone number.', variant: 'destructive' });
      return;
    }
    
    setLoadingProfile(true);
    try {
      const cleanDob = dob && dob.trim() ? dob.trim() : null;
      const cleanAddress = address && address.trim() ? address.trim() : null;
      const cleanPhoneVal = cleanPhone || null;

      let savedEmployee: any = null;

      // 1. Primary: Use dedicated SECURITY DEFINER RPC
      const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc('update_employee_profile', {
        p_employee_id: employee.id,
        p_phone: cleanPhoneVal,
        p_address: cleanAddress,
        p_dob: cleanDob,
      });

      if (!rpcErr && rpcRes?.success && rpcRes?.employee) {
        savedEmployee = rpcRes.employee;
      } else {
        if (rpcErr) console.warn("RPC update_employee_profile failed, falling back to direct update:", rpcErr);
        
        // 2. Fallback: Direct UPDATE on employees table
        const payload: any = {
          phone: cleanPhoneVal,
          address: cleanAddress,
          dob: cleanDob,
          date_of_birth: cleanDob,
        };
        const { data: updateData, error: updateErr } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', employee.id)
          .select()
          .maybeSingle();

        if (updateErr) throw updateErr;
        savedEmployee = updateData;
      }

      // Merge and update local state and cache
      const mergedEmp = {
        ...employee,
        ...(savedEmployee || {}),
        phone: cleanPhoneVal || '',
        address: cleanAddress || '',
        dob: cleanDob || '',
        date_of_birth: cleanDob || '',
      };

      setEmployee(mergedEmp);
      saveEmployeeCache(mergedEmp);
      window.dispatchEvent(new CustomEvent('employee-profile-updated', { detail: mergedEmp }));

      toast({ title: 'Profile details saved successfully!' });
    } catch (error: any) {
      console.error("Profile update failed:", error);
      toast({ title: 'Error saving profile', description: error?.message || 'Could not save profile details to database.', variant: 'destructive' });
    } finally {
      setLoadingProfile(false);
    }
  };

  // Calculate max date for 18 years old
  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 18);
  const maxDobString = maxDobDate.toISOString().split('T')[0];

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file', description: 'Only JPG and PNG images are allowed.', variant: 'destructive' });
      return;
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 2MB.', variant: 'destructive' });
      return;
    }

    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max_size = 400; // max size for small base64

        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress heavily (quality 0.6) to keep it well under 100kb
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        setAvatar(compressedBase64);

        try {
          let savedEmployee: any = null;

          // 1. Primary: Use dedicated SECURITY DEFINER RPC
          const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc('update_employee_profile', {
            p_employee_id: employee.id,
            p_avatar_url: compressedBase64,
          });

          if (!rpcErr && rpcRes?.success && rpcRes?.employee) {
            savedEmployee = rpcRes.employee;
          } else {
            if (rpcErr) console.warn("RPC update_employee_profile failed, falling back to direct update:", rpcErr);

            // 2. Fallback: Direct UPDATE on employees table
            const { data: updateData, error: updateErr } = await supabase
              .from('employees')
              .update({ avatar_url: compressedBase64 })
              .eq('id', employee.id)
              .select()
              .maybeSingle();

            if (updateErr) {
              const { data: altData, error: err2 } = await supabase
                .from('employees')
                .update({ profile_image: compressedBase64 })
                .eq('id', employee.id)
                .select()
                .maybeSingle();
              if (err2) throw err2;
              savedEmployee = altData;
            } else {
              savedEmployee = updateData;
            }
          }

          const mergedEmp = {
            ...employee,
            ...(savedEmployee || {}),
            avatar_url: compressedBase64,
            profile_image: compressedBase64,
          };

          setEmployee(mergedEmp);
          saveEmployeeCache(mergedEmp);
          window.dispatchEvent(new CustomEvent('employee-profile-updated', { detail: mergedEmp }));

          toast({ title: 'Profile picture updated successfully!' });
        } catch (err: any) {
          console.error("Could not save avatar to DB directly:", err);
          toast({ title: 'Error saving picture', description: err?.message || 'Failed to save profile picture to database.', variant: 'destructive' });
        } finally {
          setUploadingAvatar(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-4 px-4 pt-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
          <p className="text-xs text-muted-foreground">Manage your personal and account details</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center mb-8 mt-2">
        <div className="relative group mb-4">
          <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-4xl shadow-sm overflow-hidden border-2 border-white dark:border-slate-800">
            {avatar ? (
              <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              employee?.name?.charAt(0) || 'U'
            )}
          </div>
          
          <Label 
            htmlFor="avatar-upload" 
            className="absolute bottom-0 right-0 w-8 h-8 bg-[#0a192f] rounded-full flex items-center justify-center text-white cursor-pointer shadow-md hover:bg-[#0d213b] transition-colors border-2 border-white dark:border-slate-800"
          >
            {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </Label>
          <Input 
            id="avatar-upload" 
            type="file" 
            accept=".jpg,.jpeg,.png,image/jpeg,image/png" 
            className="hidden" 
            onChange={handleAvatarUpload}
            disabled={uploadingAvatar}
          />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center">
          {employee?.name || 'My Profile'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium text-center">
          {employee?.designation || 'Manage your account settings'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Email & OTP Section */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-gray-50 dark:border-slate-700/50">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white"><Mail className="w-5 h-5 text-orange-500"/> Email Verification</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Current Email</Label>
              <div className="flex gap-2">
                <Input value={userEmail} disabled className="bg-gray-50 dark:bg-slate-900 border-gray-100 dark:border-slate-700 rounded-xl" />
                {isEmailVerified ? (
                  <Button variant="outline" disabled className="bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-900 rounded-xl font-bold">
                    Verified
                  </Button>
                ) : (
                  <Button onClick={handleSendEmailOtp} disabled={loadingEmail || showOtpField} className="rounded-xl font-bold bg-[#0a192f] text-white hover:bg-[#0a192f]/90">
                    {loadingEmail ? 'Sending...' : 'Verify'}
                  </Button>
                )}
              </div>
            </div>
            
            {!isEmailVerified && showOtpField && (
              <div className="space-y-2 p-4 bg-orange-50 dark:bg-slate-900 rounded-2xl border border-orange-100 dark:border-slate-700 mt-2">
                <Label className="text-orange-600 dark:text-orange-400 font-bold text-xs">Enter OTP sent to {userEmail}</Label>
                <div className="flex gap-2">
                  <Input 
                    value={otp} 
                    onChange={e => setOtp(e.target.value)} 
                    placeholder="6-digit OTP"
                    maxLength={6}
                    className="bg-white dark:bg-slate-800 tracking-widest font-mono rounded-xl border-orange-200"
                  />
                  <Button onClick={handleVerifyOtp} disabled={loadingEmail || !otp} className="bg-orange-500 hover:bg-orange-600 rounded-xl font-bold text-white">
                    Verify
                  </Button>
                </div>
                <Button variant="link" size="sm" onClick={() => setShowOtpField(false)} className="px-0 text-slate-500 font-bold h-auto mt-1">
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Basic Info Section */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-gray-50 dark:border-slate-700/50">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white"><User className="w-5 h-5 text-orange-500"/> Personal Details</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Phone Number</Label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <Input maxLength={15} 
                  value={phone} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setPhone(val);
                  }} 
                  placeholder="10-digit mobile number" 
                  className="pl-9 dark:bg-slate-900 border-gray-100 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Date of Birth</Label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <Input 
                  type="date"
                  value={dob} 
                  onChange={e => setDob(e.target.value)} 
                  max={maxDobString}
                  className="pl-9 dark:bg-slate-900 border-gray-100 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Residential Address</Label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <textarea 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  placeholder="Your full address" 
                  className="flex min-h-[100px] w-full rounded-xl border border-gray-100 bg-transparent px-3 py-2 pl-9 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-orange-500"
                />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={handleUpdateProfile} disabled={loadingProfile} className="bg-orange-500 hover:bg-orange-600 w-full rounded-xl font-bold text-white shadow-md shadow-orange-500/20">
                {loadingProfile ? 'Saving...' : 'Save Profile Details'}
              </Button>
            </div>
          </div>
        </div>

        {/* Password Update Section */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-gray-50 dark:border-slate-700/50">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white"><Key className="w-5 h-5 text-orange-500"/> Change Password</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Current Password</Label>
              <Input 
                type="password" 
                value={oldPassword} 
                onChange={e => setOldPassword(e.target.value)} 
                placeholder="Enter current password"
                className="dark:bg-slate-900 border-gray-100 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">New Password</Label>
              <Input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="Minimum 6 characters"
                className="dark:bg-slate-900 border-gray-100 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Confirm Password</Label>
              <Input 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="Re-enter new password"
                className="dark:bg-slate-900 border-gray-100 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="pt-2">
              <Button 
                className="w-full bg-[#0a192f] hover:bg-[#0a192f]/90 text-white rounded-xl font-bold" 
                onClick={handleUpdatePassword} 
                disabled={loadingPassword || !oldPassword || !newPassword || !confirmPassword}
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                {loadingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
