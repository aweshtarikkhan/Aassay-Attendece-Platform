import { useLocation } from 'react-router-dom';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { format, isToday, isYesterday } from 'date-fns';
import { Send, UserCircle2, Users, MessageSquare, Plus, Check, CheckCheck, UserPlus, X, ShieldAlert, Search, ChevronLeft, Phone, Video, Info, MessageCircle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';


function GroupMembersList({ groupId, supabase, currentUserId, employeeList }: any) {
  const [members, setMembers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('chat_group_members')
        .select('employee_id')
        .eq('group_id', groupId);
      
      if (data) {
        const memberIds = data.map((d: any) => d.employee_id);
        const mems = employeeList.filter((e: any) => memberIds.includes(e.id));
        setMembers(mems);
      }
      setLoading(false);
    };
    if (groupId) fetchMembers();
  }, [groupId]);

  if (loading) return <div className="text-sm text-gray-400">Loading members...</div>;
  if (members.length === 0) return <div className="text-sm text-gray-400">No members found.</div>;

  return (
    <>
      {members.map(m => (
        <div key={m.id} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-slate-300 overflow-hidden">
            {m.avatar_url || m.profile_image ? <img src={m.avatar_url || m.profile_image} className="w-full h-full object-cover" /> : (m.name || '?').charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{m.name} {m.id === currentUserId && '(You)'}</p>
            <p className="text-[10px] text-gray-500 truncate">{m.designation || 'Employee'}</p>
          </div>
        </div>
      ))}
    </>
  );
}

function ChatPage({ session }: { session: any }) {
  const [employee, setEmployee] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");

  
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [employeeList, setEmployeeList] = useState<any[]>([]);
  const [groupList, setGroupList] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  
  const [selectedType, setSelectedType] = useState<'dm' | 'group' | 'request' | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [selectedConnection, setSelectedConnection] = useState<any>(null);
  
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [processingRequest, setProcessingRequest] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [lastMsgTimeMap, setLastMsgTimeMap] = useState<Record<string, number>>({});

  const selectedTargetRef = useRef(selectedTarget);
  const selectedTypeRef = useRef(selectedType);
  useEffect(() => { selectedTargetRef.current = selectedTarget; }, [selectedTarget]);
  useEffect(() => { selectedTypeRef.current = selectedType; }, [selectedType]);

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // Audio autoplay policy
    }
  };

const [showMentions, setShowMentions] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState('');
  const [groupMembers, setGroupMembers] = React.useState<any[]>([]);

  // When selectedTarget changes (if group), fetch members for mentions
  React.useEffect(() => {
    if (selectedType === 'group' && selectedTarget) {
      supabase.from('chat_group_members').select('employee_id').eq('group_id', selectedTarget.id).then(({data}) => {
        if (data) {
          const ids = data.map((d: any) => d.employee_id);
          setGroupMembers(employeeList.filter(e => ids.includes(e.id)));
        }
      });
    }
  }, [selectedTarget, selectedType, employeeList]);

  const handleInputText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    
    if (selectedType === 'group') {
      const lastWord = val.split(' ').pop() || '';
      if (lastWord.startsWith('@')) {
        setShowMentions(true);
        setMentionQuery(lastWord.substring(1).toLowerCase());
      } else {
        setShowMentions(false);
      }
    }
  };

  const handleMentionSelect = (user: any) => {
    const words = newMessage.split(' ');
    words.pop();
    const newMsg = words.join(' ') + (words.length > 0 ? ' ' : '') + '@' + user.name.replace(/\s+/g, '') + ' ';
    setNewMessage(newMsg);
    setShowMentions(false);
  };

  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const location = useLocation();

  useEffect(() => {
    if (location.search.includes('support=true') && employeeList.length > 0) {
      // Find HR admin - prefer 'hr admin' designation, then hr, then admin, then manager
      const hr = employeeList.find(e => e.designation?.toLowerCase().includes('hr admin')) ||
        employeeList.find(e => e.designation?.toLowerCase().includes('hr')) ||
        employeeList.find(e => e.designation?.toLowerCase().includes('admin')) ||
        employeeList.find(e => e.designation?.toLowerCase().includes('manager')) ||
        employeeList[0];
      if (hr) {
        setSelectedType('dm');
        setSelectedTarget(hr);
      }
    }
  }, [location.search, employeeList]);


  // Load current employee profile
  useEffect(() => {
    const loadEmployee = async () => {
      if (!session?.user) return;
      let emp = null;
      if (session.user.id) {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .limit(1);
        if (data && data.length > 0) emp = data[0];
      }
      if (!emp && session.user.email) {
        const cleanEmail = session.user.email.replace(/^attendance_/, '');
        const { data } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', cleanEmail)
          .limit(1);
        if (data && data.length > 0) {
          emp = data[0];
          await supabase.from('employees').update({ auth_user_id: session.user.id }).eq('id', emp.id);
        }
      }
      if (emp) {
        setEmployee(emp);
      }
    };
    loadEmployee();
  }, [session]);

  // Load sidebar data
  const loadSidebarData = async () => {
    if (!employee) return;
    
    // Load all other employees in org
    const { data: emps, error: empErr } = await supabase
      .from('employees')
      .select('id, name, username, designation, org_id, auth_user_id, avatar_url')
      .eq('org_id', employee.org_id)
      .neq('id', employee.id)
      .order('name');
      
    if (empErr) {
      console.error('Error loading employees:', empErr);
    }

    // Load all Org Members (HR/Admins) so employee can chat with them without a fake employee profile
    let managerContacts: any[] = [];
    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, owner_id, email')
        .eq('id', employee.org_id)
        .maybeSingle();

      const { data: orgMembers } = await supabase
        .from('organization_members')
        .select('user_id, role')
        .eq('org_id', employee.org_id);

      const memberIds = new Set<string>();
      if (orgData?.owner_id) memberIds.add(orgData.owner_id);
      if (orgMembers) {
        orgMembers.forEach(m => {
          if (m.user_id) memberIds.add(m.user_id);
        });
      }

      if (employee.auth_user_id) {
        memberIds.delete(employee.auth_user_id);
      }

      if (memberIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, first_name, last_name, avatar_url')
          .in('user_id', Array.from(memberIds));

        if (profiles) {
          managerContacts = profiles.map(prof => {
            const mRole = orgMembers?.find(m => m.user_id === prof.user_id)?.role || 'member';
            const fallbackName = orgData?.owner_id === prof.user_id && orgData?.email 
              ? orgData.email.split('@')[0] 
              : 'HR & Admin';
            const managerName = prof.first_name
              ? `${prof.first_name} ${prof.last_name || ''}`.trim()
              : fallbackName;
              
            const empRecord = emps?.find(e => e.auth_user_id === prof.user_id);
              
            return {
              id: empRecord ? empRecord.id : prof.user_id,
              name: managerName,
              username: `hr_admin_${prof.user_id.substring(0, 4)}`,
              designation: mRole === 'owner' ? 'HR & Owner' : 'HR & Admin',
              org_id: employee.org_id,
              auth_user_id: prof.user_id,
              avatar_url: prof.avatar_url || null,
              is_manager: true
            };
          });
        }
      }
    } catch (e) {
      console.error('Error loading manager contacts:', e);
    }

    const allContacts = [...managerContacts];
    (emps || []).forEach(emp => {
      if (!allContacts.some(c => c.id === emp.auth_user_id || c.id === emp.id)) {
        allContacts.push(emp);
      }
    });

    setEmployeeList(allContacts);

    // Load connections
    const { data: conns } = await supabase
      .from('chat_connections')
      .select('*')
      .or(`sender_id.eq.${employee.id},receiver_id.eq.${employee.id}`);
      
    setConnections(conns || []);

    // Load groups user is part of
    const { data: grps } = await supabase
      .from('chat_groups')
      .select('id, name, created_at, created_by, chat_group_members!inner(employee_id)')
      .eq('org_id', employee.org_id)
      .eq('chat_group_members.employee_id', employee.id)
      .order('created_at');
      
    setGroupList(grps || []);

    // Load unread counts and recent message activity
    try {
      const groupIds = (grps || []).map(g => g.id);
      const groupFilter = groupIds.length > 0 ? `,group_id.in.(${groupIds.join(',')})` : '';
      const { data: recentMsgs } = await supabase
        .from('chat_messages')
        .select('id, sender_id, receiver_id, group_id, status, created_at')
        .or(`receiver_id.eq.${employee.id},sender_id.eq.${employee.id}${groupFilter}`)
        .order('created_at', { ascending: false })
        .limit(300);

      if (recentMsgs) {
        const unreads: Record<string, number> = {};
        const lastTimes: Record<string, number> = {};
        for (const m of recentMsgs) {
          const otherId = m.sender_id === employee.id ? m.receiver_id : m.sender_id;
          const targetKey = m.group_id || otherId;
          if (!targetKey) continue;
          
          const msgTime = new Date(m.created_at).getTime();
          if (!lastTimes[targetKey] || msgTime > lastTimes[targetKey]) {
            lastTimes[targetKey] = msgTime;
          }
          
          if (m.sender_id !== employee.id && m.status === 'sent') {
            unreads[targetKey] = (unreads[targetKey] || 0) + 1;
          }
        }
        setUnreadMap(unreads);
        setLastMsgTimeMap(lastTimes);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    loadSidebarData();
    const interval = setInterval(() => {
      loadSidebarData();
    }, 4000);
    return () => clearInterval(interval);
  }, [employee]);

  // Read messages when opened
  const markMessagesAsRead = async (targetId: string, type: string) => {
    if (!employee) return;
    setUnreadMap(prev => ({ ...prev, [targetId]: 0 }));
    let query = supabase.from('chat_messages').update({ status: 'read' }).eq('status', 'sent');
    
    if (type === 'dm') {
      query = query.eq('sender_id', targetId).eq('receiver_id', employee.id);
    } else if (type === 'group') {
      query = query.eq('group_id', targetId).neq('sender_id', employee.id);
    }
    
    await query;
    window.dispatchEvent(new CustomEvent('chat-read', { detail: { targetId, type } }));
  };

  // Load messages when target changes + 2.5s fast sync polling fallback
  useEffect(() => {
    if (!employee || !selectedTarget || !selectedType) {
      setMessages([]);
      return;
    }

    let isSubscribed = true;

    const loadMessages = async (isInitial = false) => {
      try {
        if (isInitial) {
          setMessages([]); // Clear stale messages immediately when switching conversations
          setLoadingMessages(true);
          setLoading(true);
        }
        let query = supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: true });

        if (selectedType === 'dm' || selectedType === 'request') {
          const authId = selectedTarget.auth_user_id;
          if (authId && authId !== selectedTarget.id) {
            query = query.or(`and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${employee.id}),and(sender_id.eq.${employee.id},receiver_id.eq.${selectedTarget.id}),and(sender_id.eq.${authId},receiver_id.eq.${employee.id}),and(sender_id.eq.${employee.id},receiver_id.eq.${authId})`);
          } else {
            query = query.or(`and(sender_id.eq.${selectedTarget.id},receiver_id.eq.${employee.id}),and(sender_id.eq.${employee.id},receiver_id.eq.${selectedTarget.id})`);
          }
        } else if (selectedType === 'group') {
          query = query.eq('group_id', selectedTarget.id);
        }

        const { data, error } = await query;
        if (!isSubscribed) return;
        if (error) throw error;
        
        if (data) {
          setMessages(prev => {
            const map = new Map<string, any>();
            for (const m of prev) {
              map.set(m.id, m);
            }
            for (const d of data) {
              for (const [k, v] of map.entries()) {
                if (String(k).startsWith("temp-") && v.message === d.message && v.sender_id === d.sender_id) {
                  map.delete(k);
                }
              }
              const senderObj = d.sender_id === employee?.id 
                ? { id: employee.id, name: employee.name || 'You', username: employee.username } 
                : (employeeList.find((e: any) => e.id === d.sender_id) || { id: d.sender_id, name: 'Employee' });
              map.set(d.id, { ...map.get(d.id), ...d, sender: senderObj });
            }
            return Array.from(map.values()).sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
        
        // Auto mark as read if it's an accepted DM or Group
        if (selectedType === 'dm' || selectedType === 'group') {
          await markMessagesAsRead(selectedTarget.id, selectedType);
        }
      } catch (err: any) {
        if (isInitial) {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
      } finally {
        if (isInitial && isSubscribed) {
          setLoading(false);
          setLoadingMessages(false);
        }
      }
    };

    loadMessages(true);

    // Fast sync poll fallback every 2.5 seconds
    const pollInterval = setInterval(() => {
      loadMessages(false);
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [employee?.id, selectedTarget?.id, selectedType]);

  // Realtime subscription (stable channel)
  useEffect(() => {
    if (!employee) return;

    const channel = supabase
      .channel(`chat-realtime-${employee.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const msg = payload.new as any;
          const isMyDM = msg.sender_id === employee.id || msg.receiver_id === employee.id;
          const isMyGroup = msg.group_id && groupList.some((g: any) => g.id === msg.group_id);
          if (isMyDM || isMyGroup) {
            const currentTarget = selectedTargetRef.current;
            const currentType = selectedTypeRef.current;
            let isRelevant = false;

            if ((currentType === 'dm' || currentType === 'request') && currentTarget) {
              const targetAuthId = currentTarget.auth_user_id;
              isRelevant = !msg.group_id && (
                msg.sender_id === currentTarget.id || msg.receiver_id === currentTarget.id ||
                (targetAuthId && (msg.sender_id === targetAuthId || msg.receiver_id === targetAuthId))
              );
            } else if (currentType === 'group' && currentTarget) {
              isRelevant = msg.group_id === currentTarget.id;
            }

            const targetKey = msg.group_id || (msg.sender_id === employee.id ? msg.receiver_id : msg.sender_id);
            if (targetKey) {
              setLastMsgTimeMap(prev => ({ ...prev, [targetKey]: Date.now() }));
            }

            if (isRelevant) {
              let senderData: any = employeeList.find((e: any) => e.id === msg.sender_id);
              if (!senderData) {
                const { data } = await supabase.from('employees').select('id, name, username').eq('id', msg.sender_id).maybeSingle();
                senderData = data || (currentTarget?.id === msg.sender_id ? currentTarget : { id: msg.sender_id, name: 'HR Admin' });
              }
              const enrichedMsg = { ...msg, sender: senderData };
              
              setMessages(prev => {
                if (prev.find(m => m.id === enrichedMsg.id)) return prev;
                const filtered = prev.filter(m => !(String(m.id).startsWith('temp-') && m.message === enrichedMsg.message && m.sender_id === enrichedMsg.sender_id));
                return [...filtered, enrichedMsg];
              });

              if (msg.sender_id !== employee.id) {
                playNotificationSound();
                if (currentType === 'dm' || currentType === 'group') {
                  await supabase.from('chat_messages').update({ status: 'read' }).eq('id', msg.id);
                  window.dispatchEvent(new CustomEvent('chat-read', { detail: { targetId: currentTarget.id } }));
                }
              }
            } else {
              if (msg.sender_id !== employee.id) {
                playNotificationSound();
                if (targetKey) {
                  setUnreadMap(prev => ({ ...prev, [targetKey]: (prev[targetKey] || 0) + 1 }));
                }
              }
              loadSidebarData();
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new as any;
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: msg.status } : m));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_connections' },
        () => loadSidebarData()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_connections' },
        (payload) => {
           loadSidebarData();
           const conn = payload.new as any;
           if (selectedConnection && selectedConnection.id === conn.id && conn.status === 'accepted') {
             setSelectedType('dm');
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee?.id, selectedConnection?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, selectedTarget]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMessage.trim();
    if (!trimmed || !employee || !selectedTarget) return;

    const tempId = 'temp-' + Date.now();
    const optimisticMsg: any = {
      id: tempId,
      org_id: employee.org_id,
      sender_id: employee.id,
      receiver_id: selectedType === 'dm' ? selectedTarget.id : null,
      group_id: selectedType === 'group' ? selectedTarget.id : null,
      message: trimmed,
      status: 'sent',
      created_at: new Date().toISOString(),
      sender: { id: employee.id, name: employee.name, username: employee.username }
    };

    // Instant 0ms optimistic display
    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage("");
    setSending(true);
    setLastMsgTimeMap(prev => ({ ...prev, [selectedTarget.id]: Date.now() }));

    try {
      // Create connection if sending first DM
      if (selectedType === 'dm' && !selectedConnection) {
        const { data: newConn, error: connErr } = await supabase.from('chat_connections').insert({
          org_id: employee.org_id,
          sender_id: employee.id,
          receiver_id: selectedTarget.id,
          status: 'accepted'
        }).select().single();
        if (!connErr && newConn) {
          setSelectedConnection(newConn);
        }
      }

      const payload: any = {
        org_id: employee.org_id,
        sender_id: employee.id,
        message: trimmed,
        status: 'sent'
      };
      
      if (selectedType === 'dm') {
        payload.receiver_id = selectedTarget.id;
      } else {
        payload.group_id = selectedTarget.id;
      }

      const { error, data: insertedMsg } = await supabase.from('chat_messages').insert(payload).select().single();
      if (error) throw error;
      
      if (insertedMsg) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...insertedMsg, sender: optimisticMsg.sender } : m));
      }

      // Notify recipients consistently
      if (selectedType === 'group') {
        const { data: members } = await supabase.from('chat_group_members')
          .select('employee_id')
          .eq('group_id', selectedTarget.id);
        if (members && members.length > 0) {
          const otherMemberIds = members
            .map(m => m.employee_id)
            .filter(id => id !== employee.id);
          
          if (otherMemberIds.length > 0) {
            const { data: empUsers } = await supabase.from('employees')
              .select('auth_user_id')
              .in('id', otherMemberIds);
            
            const notificationsToInsert = (empUsers || [])
              .filter(e => e.auth_user_id)
              .map(e => ({
                org_id: employee.org_id,
                user_id: e.auth_user_id,
                title: "New message in " + selectedTarget.name,
                message: employee.name + ": " + payload.message.substring(0, 50) + (payload.message.length > 50 ? '...' : ''),
                type: 'chat',
                reference_id: insertedMsg?.id || null
              }));
              
            if (notificationsToInsert.length > 0) {
              await supabase.from('notifications').insert(notificationsToInsert);
            }
          }
        }
      } else if (selectedType === 'dm') {
        const { data: targetUser } = await supabase.from('employees').select('auth_user_id').eq('id', selectedTarget.id).maybeSingle();
        const notifyTargetId = targetUser?.auth_user_id || selectedTarget.auth_user_id || (selectedTarget.is_manager ? selectedTarget.id : null);
        if (notifyTargetId) {
          await supabase.from('notifications').insert({
            org_id: employee.org_id,
            user_id: notifyTargetId,
            title: "New message from " + employee.name,
            message: payload.message.substring(0, 50) + (payload.message.length > 50 ? '...' : ''),
            type: 'chat',
            reference_id: insertedMsg?.id || null
          });
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      toast({ title: 'Failed to send', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleConnectionResponse = async (status: 'accepted' | 'rejected') => {
    if (!selectedConnection) return;
    setProcessingRequest(true);
    try {
      const { error } = await supabase.from('chat_connections').update({ status }).eq('id', selectedConnection.id);
      if (error) throw error;
      if (status === 'accepted') {
        setSelectedType('dm');
        await markMessagesAsRead(selectedTarget.id, 'dm');
      } else {
        setSelectedType(null);
        setSelectedTarget(null);
      }
      toast({ title: 'Success', description: `Request ${status} successfully.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setProcessingRequest(false);
      loadSidebarData();
    }
  };
  
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) {
      toast({ title: 'Validation', description: 'Enter group name and select at least 1 member.', variant: 'destructive' });
      return;
    }
    
    setCreatingGroup(true);
    try {
      const { data: groupData, error: groupErr } = await supabase
        .from('chat_groups')
        .insert({ org_id: employee.org_id, name: newGroupName.trim(), created_by: employee.id })
        .select().single();
        
      if (groupErr) throw groupErr;
      
      const memberInserts = [...selectedMembers, employee.id].map(id => ({
        group_id: groupData.id,
        employee_id: id
      }));
      
      const { error: memErr } = await supabase.from('chat_group_members').insert(memberInserts);
      if (memErr) throw memErr;
      
      toast({ title: 'Success', description: 'Group created successfully!' });
      setShowCreateGroup(false);
      setNewGroupName("");
      setSelectedMembers([]);
      loadSidebarData();
      
      setSelectedType('group');
      setSelectedTarget(groupData);
    } catch (err: any) {
      toast({ title: 'Failed to create group', description: err.message, variant: 'destructive' });
    } finally {
      setCreatingGroup(false);
    }
  };

  // Derived lists
  const pendingRequests = connections.filter(c => c.receiver_id === employee?.id && c.status === 'pending');
  const activeConnections = connections.filter(c => c.status === 'accepted' || (c.sender_id === employee?.id && c.status === 'pending'));

  const pendingUsers = pendingRequests.map(c => {
    const u = employeeList.find(e => e.id === c.sender_id);
    return u ? { ...u, connection: c } : null;
  }).filter(Boolean);

  const activeUsers = employeeList.map(emp => {
    const conn = activeConnections.find(c => c.sender_id === emp.id || c.receiver_id === emp.id);
    return { ...emp, connection: conn || null };
  }).filter(emp => !pendingRequests.some(c => c.sender_id === emp.id));


  const connectionsMap = connections.reduce((acc: any, conn: any) => {
    const otherId = conn.sender_id === employee?.id ? conn.receiver_id : conn.sender_id;
    acc[otherId] = conn;
    return acc;
  }, {});

  const requests = connections.filter(c => c.status === 'pending' && c.receiver_id === employee?.id);
  const pendingRequestsCount = requests.length;

  const filteredEmployees = employeeList.filter(emp => 
    (emp?.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) || 
    (emp?.username || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  // Dynamic sorting: whoever sent the latest message or has unread messages jumps to the TOP!
  const sortedGroupList = useMemo(() => {
    return [...groupList].sort((a, b) => {
      const unreadA = unreadMap[a.id] || 0;
      const unreadB = unreadMap[b.id] || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      const timeA = lastMsgTimeMap[a.id] || 0;
      const timeB = lastMsgTimeMap[b.id] || 0;
      if (timeA !== timeB) return timeB - timeA;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [groupList, unreadMap, lastMsgTimeMap]);

  const isHrOrMgmt = (des?: string) => {
    if (!des) return false;
    const d = des.toLowerCase();
    return d.includes('hr') || d.includes('admin') || d.includes('manager') || d.includes('owner') || d.includes('director') || d.includes('founder') || d.includes('management');
  };

  const hrEmployees = useMemo(() => {
    const list = filteredEmployees.filter(e => isHrOrMgmt(e.designation));
    return [...list].sort((a, b) => {
      const unreadA = unreadMap[a.id] || 0;
      const unreadB = unreadMap[b.id] || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      const timeA = lastMsgTimeMap[a.id] || 0;
      const timeB = lastMsgTimeMap[b.id] || 0;
      if (timeA !== timeB) return timeB - timeA;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [filteredEmployees, unreadMap, lastMsgTimeMap]);

  const colleagueEmployees = useMemo(() => {
    const list = filteredEmployees.filter(e => !isHrOrMgmt(e.designation));
    return [...list].sort((a, b) => {
      const unreadA = unreadMap[a.id] || 0;
      const unreadB = unreadMap[b.id] || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      const timeA = lastMsgTimeMap[a.id] || 0;
      const timeB = lastMsgTimeMap[b.id] || 0;
      if (timeA !== timeB) return timeB - timeA;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [filteredEmployees, unreadMap, lastMsgTimeMap]);

  const handleUserSelect = (emp: any) => {
    setUnreadMap(prev => ({ ...prev, [emp.id]: 0 }));
    const conn = connectionsMap[emp.id];
    setSelectedTarget(emp);
    
    if (!conn) {
      // Logic for new connection would go here if needed, or handled when sending message
      setSelectedType('dm');
      setSelectedConnection(null);
    } else if (conn.status === 'pending') {
      setSelectedType(conn.receiver_id === employee?.id ? 'request' : 'dm');
      setSelectedConnection(conn);
    } else {
      setSelectedType('dm');
      setSelectedConnection(conn);
    }
  };

  if (!employee) {
    return <div className="flex items-center justify-center h-full dark:text-slate-300">Loading...</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col pb-4 px-2 pt-2">
      <div className={`relative z-10 flex justify-between items-end mb-4 px-2 shrink-0 ${selectedTarget ? 'hidden md:flex' : 'flex'}`}>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Team Chat</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">Connect directly or in groups</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* Sidebar */}
        <div className={`w-full md:w-80 flex flex-col shrink-0 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 ${selectedTarget ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-gray-100 dark:border-slate-700/50 hidden">
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-[calc(100vh-14rem)] md:max-h-none">
            <>
                {/* Groups Section */}
                <div className="mb-4">
                  <div className="flex items-center justify-between px-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Groups</span>
                    <button onClick={() => setShowCreateGroup(true)} className="text-orange-500 hover:text-orange-600 p-1 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {sortedGroupList.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 italic font-medium">No groups yet.</p>
                  ) : (
                    sortedGroupList.map(group => {
                      const unread = unreadMap[group.id] || 0;
                      return (
                        <button
                          key={`group-${group.id}`}
                          onClick={() => {
                            setUnreadMap(prev => ({ ...prev, [group.id]: 0 }));
                            setSelectedType('group');
                            setSelectedTarget(group);
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                            selectedType === 'group' && selectedTarget?.id === group.id
                              ? 'bg-orange-50 dark:bg-slate-700'
                               : 'hover:bg-gray-50 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="relative">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-orange-100 dark:bg-slate-800 text-orange-600 font-bold text-lg">
                              {group.name.substring(0, 2).toUpperCase()}
                            </div>
                            {unread > 0 && (
                              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-white dark:border-slate-800 animate-pulse" />
                            )}
                          </div>
                          <div className="flex-1 text-left overflow-hidden">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-sm font-bold truncate text-gray-900 dark:text-white">{group.name}</p>
                                {unread > 0 && (
                                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                                )}
                              </div>
                              {unread > 0 && (
                                <span className="flex h-5 min-w-[20px] px-1 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                                  {unread}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              {group.created_by === employee?.id ? 'Admin' : 'Member'}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* HR & Management Section */}
                <div className="mb-4 mt-6">
                  <div className="px-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">HR & Management</span>
                  </div>
                  {hrEmployees.map(emp => {
                    const unread = unreadMap[emp.id] || 0;
                    return (
                      <button
                        key={`emp-${emp.id}`}
                        onClick={() => handleUserSelect(emp)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                          selectedType === 'dm' && selectedTarget?.id === emp.id
                            ? 'bg-orange-50 dark:bg-orange-900/20 shadow-sm border border-orange-100 dark:border-orange-900/50'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-800/50 border border-transparent'
                        }`}
                      >
                        <div className="relative">
                          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-lg shadow-sm overflow-hidden">
                            {emp.avatar_url ? <img src={emp.avatar_url} className="w-full h-full object-cover" alt="" /> : (emp.name || '?').charAt(0)}
                          </div>
                          {unread > 0 && (
                            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-white dark:border-slate-800 animate-pulse" />
                          )}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {emp.name}
                              </p>
                              {unread > 0 && (
                                <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                              )}
                              <span className="ml-1 inline-flex items-center text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold shrink-0">
                                {emp.designation || 'HR'}
                              </span>
                            </div>
                            {unread > 0 && (
                              <span className="flex h-5 min-w-[20px] px-1 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                                {unread}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-gray-500 truncate">
                            @{emp.username || emp.name.toLowerCase().replace(/\s+/g, '')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Direct Messages Section */}
                <div>
                  <div className="px-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Colleagues</span>
                  </div>
                  {colleagueEmployees.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 italic font-medium">No users found.</p>
                  ) : (
                    colleagueEmployees.map(emp => {
                      const unread = unreadMap[emp.id] || 0;
                      return (
                        <button
                          key={`emp-${emp.id}`}
                          onClick={() => handleUserSelect(emp)}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                            selectedType === 'dm' && selectedTarget?.id === emp.id
                              ? 'bg-orange-50 dark:bg-orange-900/20 shadow-sm border border-orange-100 dark:border-orange-900/50'
                              : 'hover:bg-gray-50 dark:hover:bg-slate-800/50 border border-transparent'
                          }`}
                        >
                          <div className="relative">
                            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 flex items-center justify-center font-bold text-lg shadow-sm overflow-hidden">
                              {emp.avatar_url ? <img src={emp.avatar_url} className="w-full h-full object-cover" alt="" /> : (emp.name || '?').charAt(0)}
                            </div>
                            {unread > 0 && (
                              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-white dark:border-slate-800 animate-pulse" />
                            )}
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{emp.name}</p>
                                {unread > 0 && (
                                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                                )}
                              </div>
                              {unread > 0 && (
                                <span className="flex h-5 min-w-[20px] px-1 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                                  {unread}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-gray-500 truncate">
                              @{emp.username || emp.name.toLowerCase().replace(/\s+/g, '')}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
          </div>
        </div>

        {/* Chat Window */}
        <div className={`flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden ${!selectedTarget ? 'hidden md:flex' : 'flex'}`}>
          {!selectedTarget ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-20 h-20 bg-blue-50 dark:bg-slate-900 rounded-full flex items-center justify-center mb-4 shadow-sm">
                <MessageCircle className="w-10 h-10 text-blue-400 dark:text-slate-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Your Messages</h2>
              <p className="text-gray-500 dark:text-slate-400 text-sm max-w-xs font-medium">Select a colleague or group from the sidebar to start chatting.</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between px-4 bg-white dark:bg-slate-800 shrink-0">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowInfoDialog(true)}>
                  <button onClick={() => setSelectedTarget(null)} className="md:hidden p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-full">
                    <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-slate-300" />
                  </button>
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center font-bold overflow-hidden">
                    {selectedType === 'group' ? <span className="text-lg">{selectedTarget.name.substring(0, 2).toUpperCase()}</span> : (
    selectedTarget.avatar_url || selectedTarget.profile_image ? <img src={selectedTarget.avatar_url || selectedTarget.profile_image} className="w-full h-full object-cover" alt="" /> : (selectedTarget.name || '?').charAt(0)
  )}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">{selectedTarget.name}</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {selectedType === 'group' ? 'Group Chat' : `@${selectedTarget.username}`}
                    </p>
                  </div>
                </div>
                {(selectedType === 'dm' || selectedType === 'group') && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 rounded-full" onClick={() => setShowInfoDialog(true)}><Info className="w-4 h-4" /></Button>
                    </div>
                  )}
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-slate-900/30">
                {loadingMessages ? (
                  <div className="flex-1 flex justify-center items-center h-full">
                    <div className="animate-pulse flex space-x-2">
                      <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                      <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                      <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 space-y-3">
                    <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700">
                      <MessageCircle className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm font-bold">Say hello to {selectedType === 'group' ? 'the group' : selectedTarget.name}!</p>
                  </div>
                ) : (() => {
                    let lastDateKey = '';
                    return (messages || []).map((msg, idx) => {
                      const isMine = msg.sender_id === employee.id;
                      const showSender = selectedType === 'group' && !isMine && (idx === 0 || messages[idx-1].sender_id !== msg.sender_id);
                      const msgDate = new Date(msg.created_at);
                      const dateKey = safeFormatDate(m.created_at, 'yyyy-MM-dd');
                      const showDateSeparator = dateKey !== lastDateKey;
                      if (showDateSeparator) lastDateKey = dateKey;

                      const dateLabel = isToday(msgDate)
                        ? 'Today'
                        : isYesterday(msgDate)
                        ? 'Yesterday'
                        : safeFormatDate(m.created_at, 'MMMM d, yyyy');

                      return (
                        <React.Fragment key={msg.id}>
                          {showDateSeparator && (
                            <div className="flex items-center gap-3 my-2">
                              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
                              <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap px-2">
                                {dateLabel}
                              </span>
                              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
                            </div>
                          )}
                          <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                            {showSender && (
                              <span className="text-[10px] font-bold text-gray-400 mb-1 ml-1 uppercase tracking-wider">@{msg.sender?.name}</span>
                            )}
                            <div
                              className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl flex flex-col shadow-sm ${
                                isMine
                                  ? 'bg-orange-500 text-white rounded-tr-sm'
                                  : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-100 dark:border-slate-700 rounded-tl-sm'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap break-words font-medium">{msg.message}</p>
                              
                              {/* Read Receipts */}
                              <div className={`flex items-center gap-1 self-end mt-1.5 ${isMine ? 'text-orange-100' : 'text-gray-400 dark:text-slate-500'}`}>
                                <span className="text-[9px] font-bold">
                                  {safeFormatTime(m.created_at, '', 'HH:mm')}
                                </span>
                                {isMine && (
                                  <>
                                    {msg.status === 'sent' && <Check className="w-3 h-3 opacity-70" />}
                                    {msg.status === 'delivered' && <CheckCheck className="w-3 h-3 opacity-70" />}
                                    {msg.status === 'read' && <CheckCheck className="w-3 h-3 text-[#0a192f]" />}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    });
                  })()
                }
                <div ref={messagesEndRef} />
              </div>

              

              {/* Input Area */}
              {(selectedType === 'dm' || selectedType === 'group') && selectedTarget && (
                <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 shrink-0">
                  
                  <form onSubmit={handleSendMessage} className="flex gap-2 relative">
{showMentions && groupMembers.length > 0 && (
                    <div className="absolute bottom-full mb-2 right-0 left-0 mx-0 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                      <div className="p-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-slate-700">Mentions</div>
                      
                      {groupMembers
                        .filter(m => m.name.toLowerCase().includes(mentionQuery) || (m.username && m.username.toLowerCase().includes(mentionQuery)))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(m => (

                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleMentionSelect(m)}
                          className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 text-left"
                        >
                          <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center text-[10px] font-bold overflow-hidden">
                            {m.avatar_url || m.profile_image ? <img src={m.avatar_url || m.profile_image} className="w-full h-full object-cover" /> : (m.name || '?').charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 dark:text-white">{m.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                    <Input
                      value={newMessage}
                      onChange={handleInputText}
                      placeholder={`Message ${selectedType === 'group' ? selectedTarget.name : '@' + (selectedTarget?.username || selectedTarget?.name?.replace(/\s+/g, '').toLowerCase() || 'user')}...`}
                      className="flex-1 bg-gray-50 dark:bg-slate-900 border-gray-100 dark:border-slate-700 text-gray-900 dark:text-white rounded-full pl-5 pr-14 h-12 font-medium"
                      disabled={sending}
                    />
                    <Button 
                      type="submit" 
                      size="icon"
                      disabled={!newMessage.trim() || sending} 
                      className="absolute right-1 top-1 w-10 h-10 bg-[#0a192f] hover:bg-[#0a192f]/90 text-white rounded-full shadow-md transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </Button>
                  </form>
                  
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      
      {/* Info Dialog */}
      <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <DialogContent className="sm:max-w-sm dark:bg-slate-800 dark:border-slate-700 rounded-3xl z-[100]">
          <DialogHeader>
            <DialogTitle className="dark:text-white font-bold">
              {selectedType === 'dm' ? 'Profile Info' : 'Group Info'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {selectedType === 'dm' && selectedTarget && (
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-24 h-24 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-3xl flex items-center justify-center font-bold text-3xl overflow-hidden">
                  {selectedTarget.avatar_url || selectedTarget.profile_image ? (
                    <img src={selectedTarget.avatar_url || selectedTarget.profile_image} className="w-full h-full object-cover" alt="" />
                  ) : (
                    (selectedTarget.name || '?').charAt(0)
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedTarget.name}</h3>
                  <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{selectedTarget.designation || 'Employee'}</p>
                  {selectedTarget.username && (
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider">@{selectedTarget.username}</p>
                  )}
                </div>
              </div>
            )}
            
            {selectedType === 'group' && selectedTarget && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-3xl flex items-center justify-center font-bold text-3xl">
                    {selectedTarget.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedTarget.name}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Created by {selectedTarget.created_by === employee?.id ? 'You' : 'Admin'}</p>
                  </div>
                </div>
                
                <div className="mt-6 border-t border-gray-100 dark:border-slate-700 pt-4">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Group Members</h4>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    <GroupMembersList groupId={selectedTarget.id} supabase={supabase} currentUserId={employee?.id} employeeList={employeeList} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="sm:max-w-md dark:bg-slate-800 dark:border-slate-700 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="dark:text-white font-bold">Create New Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Group Name</label>
              <Input
                placeholder="e.g. Project Alpha Team"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="dark:bg-slate-900 border-gray-200 dark:border-slate-700 dark:text-white rounded-xl h-12 font-medium"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Select Members</label>
              <div className="border border-gray-100 dark:border-slate-700 rounded-2xl max-h-48 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700/50 bg-white dark:bg-slate-900/30">
                {employeeList.map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(emp.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMembers([...selectedMembers, emp.id]);
                        else setSelectedMembers(selectedMembers.filter(id => id !== emp.id));
                      }}
                      className="rounded border-gray-200 dark:border-slate-600 text-orange-500 focus:ring-orange-500 w-4 h-4"
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-sm">
                        {(emp.name || '?').charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{emp.name}</p>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-400">@{emp.username}</p>
                      </div>
                    </div>
                  </label>
                ))}
                {employeeList.length === 0 && (
                  <div className="p-4 text-sm font-bold text-gray-400 text-center">No other employees found.</div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-3 sm:gap-4 sm:space-x-0 pt-4 mt-2 border-t border-gray-100 dark:border-slate-700/50">
            <Button variant="outline" onClick={() => setShowCreateGroup(false)} disabled={creatingGroup} className="border-gray-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold h-10">
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim() || selectedMembers.length === 0} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold h-10 shadow-md shadow-orange-500/20">
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("CHAT PAGE ERROR:", error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', backgroundColor: '#fee' }}>
          <h2>Something went wrong in ChatPage.</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.info && this.state.info.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ChatPageWrapper(props: any) {
  return <ErrorBoundary><ChatPage {...props} /></ErrorBoundary>;
}




