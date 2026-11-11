import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { 
  Receipt, 
  Bike, 
  Car, 
  Bus, 
  Plane,
  Hotel,
  Utensils,
  Shirt,
  Coins,
  Plus, 
  Eye, 
  Upload, 
  Loader2, 
  IndianRupee, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  MapPin, 
  FileText, 
  AlertCircle,
  CreditCard,
  Trash2,
  ExternalLink,
  ChevronRight,
  Info,
  Paperclip,
  ArrowLeft,
  FolderPlus,
  Tag,
  Pencil,
  History,
  Lock,
  Send,
  Hash
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee, getCachedEmployee } from '@/lib/employee-utils';

export interface ActivityHistoryItem {
  at: string;
  actor: string;
  role: 'employee' | 'hr' | 'system';
  action: string;
  details?: string;
}

export interface CustomOutstationItem {
  id: string;
  name: string;
  description: string;
  amount: string;
  file: File | null;
  existingReceiptUrl?: string | null;
}

export interface ExpenseRecord {
  id: string;
  org_id: string;
  employee_id: string;
  claim_number?: string | null;
  category_name: string;
  expense_type: string; // 'travel_km' (local) | 'outstation' | 'manual'
  expense_date: string;
  amount: number;
  approved_amount?: number;
  vehicle_type?: string;
  distance_km?: number;
  rate_per_km?: number;
  travel_from?: string;
  travel_to?: string;
  trip_start_date?: string;
  trip_end_date?: string;
  outstation_details?: any;
  description?: string;
  merchant_name?: string;
  invoice_number?: string;
  receipt_url?: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  rejection_reason?: string;
  reviewed_at?: string;
  paid_at?: string;
  payment_method?: string;
  payment_ref_no?: string;
  activity_history?: ActivityHistoryItem[];
  entries?: any[];
  created_at: string;
  updated_at?: string;
}

export default function ExpensesPage({ session }: { session: any }) {
  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [vehicleRates, setVehicleRates] = useState<Record<string, number>>({
    bike: 3.50,
    car: 8.00,
    auto: 5.00,
  });

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [statusFilter, setStatusFilter] = useState('all');

  // New / Edit Claim Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [targetCardForAddon, setTargetCardForAddon] = useState<ExpenseRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMonthDialogOpen, setSubmitMonthDialogOpen] = useState(false);
  const [submittingMonth, setSubmittingMonth] = useState(false);
  
  // Claim Type: null (Step 1 choose) | 'local' (लोकल) | 'outstation' (आउट स्टेशन)
  const [claimType, setClaimType] = useState<'local' | 'outstation' | null>(null);

  // ================= Form Fields - LOCAL (लोकल) =================
  const [localVehicle, setLocalVehicle] = useState<'bike' | 'car' | 'auto'>('bike');
  const [localDate, setLocalDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [localFrom, setLocalFrom] = useState('');
  const [localTo, setLocalTo] = useState('');
  const [localKM, setLocalKM] = useState<string>('');
  const [localPurpose, setLocalPurpose] = useState('');
  const [localReceiptFile, setLocalReceiptFile] = useState<File | null>(null);
  const [existingLocalReceiptUrl, setExistingLocalReceiptUrl] = useState<string | null>(null);

  // ================= Form Fields - OUTSTATION (आउट स्टेशन) =================
  const [outFromCity, setOutFromCity] = useState('');
  const [outToCity, setOutToCity] = useState('');
  const [outStartDate, setOutStartDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [outEndDate, setOutEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [tripDaysInput, setTripDaysInput] = useState<string>('1');
  const [outPurpose, setOutPurpose] = useState('');

  // 1. Travel Fare (ट्रेवलिंग बिल)
  const [travelMode, setTravelMode] = useState('Train');
  const [travelBookingRef, setTravelBookingRef] = useState('');
  const [travelAmount, setTravelAmount] = useState<string>('');
  const [travelBillFile, setTravelBillFile] = useState<File | null>(null);
  const [existingTravelReceiptUrl, setExistingTravelReceiptUrl] = useState<string | null>(null);

  // 2. Hotel / Stay (होटल बिल)
  const [hotelName, setHotelName] = useState('');
  const [hotelNights, setHotelNights] = useState<string>('1');
  const [hotelAmount, setHotelAmount] = useState<string>('');
  const [hotelBillFile, setHotelBillFile] = useState<File | null>(null);
  const [existingHotelReceiptUrl, setExistingHotelReceiptUrl] = useState<string | null>(null);

  // 3. Food / Meals (फूड बिल)
  const [foodDesc, setFoodDesc] = useState('');
  const [foodAmount, setFoodAmount] = useState<string>('');
  const [foodBillFile, setFoodBillFile] = useState<File | null>(null);
  const [existingFoodReceiptUrl, setExistingFoodReceiptUrl] = useState<string | null>(null);

  // 4. Other - Laundry & Other Expenses (लॉन्ड्री एंड अदर एक्सपेंसेस)
  const [otherDesc, setOtherDesc] = useState('');
  const [otherAmount, setOtherAmount] = useState<string>('');
  const [otherBillFile, setOtherBillFile] = useState<File | null>(null);
  const [existingOtherReceiptUrl, setExistingOtherReceiptUrl] = useState<string | null>(null);

  // 5. Custom "Create New" Options added by user
  const [customItems, setCustomItems] = useState<CustomOutstationItem[]>([]);

  // 6. DA (Daily Allowance / दैनिक भत्ता)
  const [daMode, setDaMode] = useState<'per_day' | 'direct'>('per_day');
  const [daDailyRate, setDaDailyRate] = useState<string>('500');
  const [daCustomAmount, setDaCustomAmount] = useState<string>('');

  // Receipt Preview Dialog
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Unified Detail & History View Modal (Local, Outstation, Manual)
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<ExpenseRecord | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('employee-expenses-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_expenses' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const empData = await resolveCurrentEmployee(session?.user);
      if (!empData) return;
      setEmployee(empData);

      // 1. Fetch Vehicle Rates for Org
      if (empData.org_id) {
        const { data: rates } = await supabase
          .from('vehicle_rate_configs' as any)
          .select('*')
          .eq('org_id', empData.org_id);
        if (rates && rates.length > 0) {
          const rMap: Record<string, number> = { bike: 3.50, car: 8.00, auto: 5.00 };
          rates.forEach((r: any) => {
            rMap[r.vehicle_type] = Number(r.rate_per_km);
          });
          setVehicleRates(rMap);
        }
      }

      // 2. Fetch Expenses for current employee
      let expQuery = supabase
        .from('employee_expenses' as any)
        .select('*');

      if (empData.auth_user_id && empData.auth_user_id !== empData.id) {
        expQuery = expQuery.or(`employee_id.eq.${empData.id},employee_id.eq.${empData.auth_user_id}`);
      } else {
        expQuery = expQuery.eq('employee_id', empData.id);
      }

      const { data: expList, error } = await expQuery.order('expense_date', { ascending: false });

      if (error) throw error;
      const loadedList = (expList as any[]) || [];
      setExpenses(loadedList);
      setSelectedDetailRecord((prev) =>
        prev ? loadedList.find((r) => r.id === prev.id) || null : null
      );
    } catch (err: any) {
      console.error('Error loading expenses:', err);
      toast({
        title: 'Error loading expenses',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Local Travel Real-time Calculation
  const currentLocalRate = vehicleRates[localVehicle] || (localVehicle === 'car' ? 8.00 : localVehicle === 'auto' ? 5.00 : 3.50);
  const parsedLocalKM = parseFloat(localKM) || 0;
  const calculatedLocalAmount = Math.round(parsedLocalKM * currentLocalRate * 100) / 100;

  // Outstation Trip Days Calculation
  const calculateTripDays = () => {
    try {
      if (!outStartDate || !outEndDate) return 1;
      const start = parseISO(outStartDate);
      const end = parseISO(outEndDate);
      const diff = differenceInCalendarDays(end, start);
      return diff >= 0 ? diff + 1 : 1;
    } catch {
      return 1;
    }
  };

  const tripDays = calculateTripDays();

  const handleTripDaysChange = (newDaysRaw: string) => {
    const sanitized = newDaysRaw.replace(/[^0-9]/g, '');
    setTripDaysInput(sanitized);
    if (!sanitized) return;
    const parsed = parseInt(sanitized, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      const clamped = Math.min(365, parsed);
      if (clamped !== parsed) setTripDaysInput(String(clamped));
      const baseStart = outStartDate ? parseISO(outStartDate) : new Date();
      const nextEnd = addDays(baseStart, clamped - 1);
      setOutEndDate(format(nextEnd, 'yyyy-MM-dd'));
    }
  };

  const syncDatesFromPickers = (nextStart: string, nextEnd: string) => {
    setOutStartDate(nextStart);
    setOutEndDate(nextEnd);
    try {
      if (nextStart && nextEnd) {
        const diff = differenceInCalendarDays(parseISO(nextEnd), parseISO(nextStart));
        setTripDaysInput(String(diff >= 0 ? diff + 1 : 1));
      }
    } catch {
      setTripDaysInput('1');
    }
  };

  // Custom Outstation Items Helpers
  const addCustomOutstationItem = () => {
    setCustomItems((prev) => [
      ...prev,
      {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        description: '',
        amount: '',
        file: null,
      },
    ]);
  };

  const updateCustomOutstationItem = (id: string, patch: Partial<CustomOutstationItem>) => {
    setCustomItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeCustomOutstationItem = (id: string) => {
    setCustomItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Outstation DA Calculation
  const calculatedDaAmount = () => {
    if (daMode === 'direct') {
      return parseFloat(daCustomAmount) || 0;
    }
    const rate = parseFloat(daDailyRate) || 0;
    return tripDays * rate;
  };

  // Outstation Gross Auto-Sum Calculation
  const valTravel = parseFloat(travelAmount) || 0;
  const valHotel = parseFloat(hotelAmount) || 0;
  const valFood = parseFloat(foodAmount) || 0;
  const valOther = parseFloat(otherAmount) || 0;
  const valCustomTotal = customItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const valDA = calculatedDaAmount();
  const calculatedOutstationGross = Math.round((valTravel + valHotel + valFood + valOther + valCustomTotal + valDA) * 100) / 100;

  // Validate File (Max 2MB, JPG, JPEG, PNG, BMP, WEBP, PDF; GIF strictly disallowed)
  const validateReceiptFile = (file: File): { valid: boolean; error?: string } => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = file.type.toLowerCase();

    if (ext === 'gif' || mime === 'image/gif') {
      return {
        valid: false,
        error: 'GIF files are not supported. Please upload a receipt in JPG, JPEG, PNG, BMP, WEBP, or PDF format.'
      };
    }

    const MAX_SIZE_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `File size exceeds 2MB limit (Selected: ${sizeMB} MB). Please select an image or PDF under 2MB.`
      };
    }

    const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'pdf'];
    if (!ALLOWED_EXTS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported format (.${ext}). Supported formats: JPG, JPEG, PNG, BMP, WEBP, and PDF.`
      };
    }

    return { valid: true };
  };

  // File Upload Helper
  const uploadReceipt = async (file: File, folderPrefix = ''): Promise<string | null> => {
    try {
      const check = validateReceiptFile(file);
      if (!check.valid) {
        toast({ title: 'Upload Rejected', description: check.error, variant: 'destructive' });
        return null;
      }
      const ext = file.name.split('.').pop();
      const sanitizedPrefix = folderPrefix ? `${folderPrefix}_` : '';
      const fileName = `${employee.org_id}/${employee.id}/${sanitizedPrefix}${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('expense-receipts')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('expense-receipts')
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (err: any) {
      console.error('Receipt upload failed:', err);
      return null;
    }
  };

  const canEditExpense = (exp: ExpenseRecord) => exp.status === 'submitted' || exp.status === 'draft';

  const getExpenseTimeline = (exp: ExpenseRecord): ActivityHistoryItem[] => {
    if (Array.isArray(exp.activity_history) && exp.activity_history.length > 0) {
      return exp.activity_history;
    }
    const entries: ActivityHistoryItem[] = [
      {
        at: exp.created_at,
        actor: employee?.name || 'Employee',
        role: 'employee',
        action: exp.status === 'draft' ? 'Saved as Monthly Draft' : 'Claim Submitted',
        details: `${exp.category_name} • Claimed ₹${Number(exp.amount || 0).toLocaleString('en-IN')}`,
      },
    ];
    if (exp.updated_at && exp.updated_at !== exp.created_at && !exp.reviewed_at) {
      entries.push({
        at: exp.updated_at,
        actor: employee?.name || 'Employee',
        role: 'employee',
        action: 'Claim Updated',
        details: `Updated claim amount: ₹${Number(exp.amount || 0).toLocaleString('en-IN')}`,
      });
    }
    if (exp.reviewed_at) {
      entries.push({
        at: exp.reviewed_at,
        actor: 'Business HR',
        role: 'hr',
        action: exp.status === 'rejected' ? 'Claim Rejected' : 'Claim Approved',
        details:
          exp.status === 'rejected'
            ? exp.rejection_reason || 'Rejected by HR'
            : `Approved ₹${Number(exp.approved_amount !== undefined ? exp.approved_amount : exp.amount).toLocaleString('en-IN')}`,
      });
    }
    if (exp.paid_at) {
      entries.push({
        at: exp.paid_at,
        actor: 'Business HR',
        role: 'hr',
        action: 'Paid / Disbursed',
        details: `${exp.payment_method ? `Via ${exp.payment_method}` : 'Settled'}${exp.payment_ref_no ? ` • Ref: ${exp.payment_ref_no}` : ''}`,
      });
    }
    return entries;
  };

  const getNormalizedEntries = (exp: ExpenseRecord): any[] => {
    if (Array.isArray(exp.entries) && exp.entries.length > 0) {
      return exp.entries;
    }
    if (exp.expense_type === 'outstation') {
      const d = exp.outstation_details || {};
      return [
        {
          id: `legacy_${exp.id}`,
          trip_start_date: exp.trip_start_date || d.start_date || exp.expense_date,
          trip_end_date: exp.trip_end_date || d.end_date || exp.trip_start_date || exp.expense_date,
          trip_days: d.trip_days || 1,
          travel_from: d.trip_from || exp.travel_from || '',
          travel_to: d.trip_to || exp.travel_to || '',
          purpose: d.purpose || '',
          amount: Number(exp.amount || 0),
          receipt_url: exp.receipt_url || null,
          outstation_details: d,
          created_at: exp.created_at,
        },
      ];
    }
    return [
      {
        id: `legacy_${exp.id}`,
        expense_date: exp.expense_date,
        vehicle_type: exp.vehicle_type || 'bike',
        distance_km: Number(exp.distance_km || 0),
        rate_per_km: Number(exp.rate_per_km || 0),
        amount: Number(exp.amount || 0),
        travel_from: exp.travel_from || '',
        travel_to: exp.travel_to || '',
        description: exp.description || '',
        receipt_url: exp.receipt_url || null,
        created_at: exp.created_at,
      },
    ];
  };

  const buildParentSummaryPayload = (expType: 'travel_km' | 'outstation', entriesList: any[], fallbackDate: string) => {
    const totalAmount = Math.round(entriesList.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;
    const firstReceipt = entriesList.find((x) => x.receipt_url)?.receipt_url || null;

    if (expType === 'travel_km') {
      const sorted = [...entriesList].sort((a, b) => (a.expense_date || '').localeCompare(b.expense_date || ''));
      const totalKm = Math.round(sorted.reduce((s, x) => s + (Number(x.distance_km) || 0), 0) * 100) / 100;
      const latest = sorted[sorted.length - 1] || {};
      const first = sorted[0] || {};
      const vehicleLabels: Record<string, string> = {
        bike: 'Bike (2-Wheeler)',
        car: 'Car (4-Wheeler)',
        auto: 'Cab / Auto',
      };
      return {
        category_name: sorted.length === 1 ? `Local Travel (${vehicleLabels[first.vehicle_type] || first.vehicle_type || 'Bike'})` : 'Local Travel (Monthly Sheet)',
        expense_type: 'travel_km',
        expense_date: latest.expense_date || fallbackDate,
        amount: totalAmount,
        vehicle_type: latest.vehicle_type || 'bike',
        distance_km: totalKm,
        rate_per_km: latest.rate_per_km || 0,
        travel_from: sorted.length === 1 ? first.travel_from || null : `${sorted.length} Local Entries`,
        travel_to: sorted.length === 1 ? first.travel_to || null : `${first.expense_date} → ${latest.expense_date}`,
        description:
          sorted.length === 1
            ? first.description || `Local travel by ${vehicleLabels[first.vehicle_type] || 'Bike'}`
            : `${sorted.length} daily local entries • Total ${totalKm} KM`,
        receipt_url: firstReceipt,
        entries: sorted,
      };
    }

    const sorted = [...entriesList].sort((a, b) => (a.trip_start_date || '').localeCompare(b.trip_start_date || ''));
    const first = sorted[0] || {};
    const last = sorted[sorted.length - 1] || {};
    const minStart = sorted[0]?.trip_start_date || fallbackDate;
    const maxEnd = sorted.reduce(
      (maxD, x) => ((x.trip_end_date || x.trip_start_date || '') > maxD ? x.trip_end_date || x.trip_start_date : maxD),
      minStart
    );
    const totalDays = sorted.reduce((s, x) => s + (Number(x.trip_days) || 1), 0);
    return {
      category_name: sorted.length === 1 ? 'Outstation Travel' : 'Outstation Travel (Monthly Sheet)',
      expense_type: 'outstation',
      expense_date: minStart,
      trip_start_date: minStart,
      trip_end_date: maxEnd,
      amount: totalAmount,
      travel_from: sorted.length === 1 ? first.travel_from || null : `${sorted.length} Outstation Trips`,
      travel_to:
        sorted.length === 1
          ? first.travel_to || null
          : sorted.map((t) => `${t.travel_from || '?'}→${t.travel_to || '?'}`).join(', ').slice(0, 140),
      description:
        sorted.length === 1
          ? first.outstation_details?.purpose || `${first.travel_from} → ${first.travel_to} (${first.trip_days || 1} Days)`
          : `${sorted.length} outstation trips (${totalDays} total days)`,
      receipt_url: firstReceipt,
      outstation_details: {
        ...(first.outstation_details || {}),
        trips_count: sorted.length,
        trip_days: totalDays,
        gross_amount: totalAmount,
      },
      entries: sorted,
    };
  };

  const findOpenDraftCard = (expType: 'travel_km' | 'outstation', dateStr: string): ExpenseRecord | null => {
    const monthKey = (dateStr || '').slice(0, 7);
    if (
      targetCardForAddon &&
      targetCardForAddon.status === 'draft' &&
      targetCardForAddon.expense_type === expType &&
      (!monthKey || targetCardForAddon.expense_date.startsWith(monthKey))
    ) {
      return targetCardForAddon;
    }
    if (!monthKey) return null;
    return (
      expenses.find(
        (e) => e.status === 'draft' && e.expense_type === expType && e.expense_date.startsWith(monthKey)
      ) || null
    );
  };

  const openAddEntryToCard = (card: ExpenseRecord) => {
    if (card.status !== 'draft') {
      toast({
        title: 'Card Already Sent',
        description: 'Is month ka card already HR ko bheja ja chuka hai. Naya entry log karne ke liye "+ New Claim" dabayein.',
        variant: 'destructive',
      });
      return;
    }
    resetForm();
    const isOut = card.expense_type === 'outstation';
    const cardMonth = (card.expense_date || '').slice(0, 7);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const defaultDate = todayStr.startsWith(cardMonth) ? todayStr : card.expense_date;

    setTargetCardForAddon(card);
    setClaimType(isOut ? 'outstation' : 'local');
    if (isOut) {
      setOutStartDate(defaultDate);
      setOutEndDate(defaultDate);
      setTripDaysInput('1');
    } else {
      setLocalDate(defaultDate);
    }
    setSelectedDetailRecord(null);
    setModalOpen(true);
  };

  const openEditSubEntry = (exp: ExpenseRecord, entryToEdit?: any) => {
    if (!canEditExpense(exp)) {
      toast({
        title: 'Editing Locked',
        description: 'Approved ya settled expense claims ko edit nahi kiya ja sakta.',
        variant: 'destructive',
      });
      return;
    }

    const normalized = getNormalizedEntries(exp);
    const targetEntry = entryToEdit || normalized[0];
    if (!targetEntry) return;

    resetForm();
    setEditingExpense(exp);
    setEditingEntryId(targetEntry.id);

    if (exp.expense_type === 'outstation') {
      setClaimType('outstation');
      const d = targetEntry.outstation_details || exp.outstation_details || {};
      const items = d.items || {};
      setOutFromCity(targetEntry.travel_from || d.trip_from || exp.travel_from || '');
      setOutToCity(targetEntry.travel_to || d.trip_to || exp.travel_to || '');
      const sDate = targetEntry.trip_start_date || d.start_date || exp.expense_date;
      const eDate = targetEntry.trip_end_date || d.end_date || sDate;
      setOutStartDate(sDate);
      setOutEndDate(eDate);
      try {
        const diff = differenceInCalendarDays(parseISO(eDate), parseISO(sDate));
        setTripDaysInput(String(diff >= 0 ? diff + 1 : targetEntry.trip_days || d.trip_days || 1));
      } catch {
        setTripDaysInput(String(targetEntry.trip_days || d.trip_days || 1));
      }
      setOutPurpose(targetEntry.purpose || d.purpose || '');

      setTravelMode(items.travel?.mode || 'Train');
      setTravelBookingRef(items.travel?.booking_ref || '');
      setTravelAmount(items.travel?.amount ? String(items.travel.amount) : '');
      setExistingTravelReceiptUrl(items.travel?.receipt_url || null);

      setHotelName(items.hotel?.hotel_name || '');
      setHotelNights(items.hotel?.nights ? String(items.hotel.nights) : '1');
      setHotelAmount(items.hotel?.amount ? String(items.hotel.amount) : '');
      setExistingHotelReceiptUrl(items.hotel?.receipt_url || null);

      setFoodDesc(items.food?.description || '');
      setFoodAmount(items.food?.amount ? String(items.food.amount) : '');
      setExistingFoodReceiptUrl(items.food?.receipt_url || null);

      setOtherDesc(items.other?.description || '');
      setOtherAmount(items.other?.amount ? String(items.other.amount) : '');
      setExistingOtherReceiptUrl(items.other?.receipt_url || null);

      if (Array.isArray(items.custom_items)) {
        setCustomItems(
          items.custom_items.map((c: any, idx: number) => ({
            id: c.id || `custom_edit_${idx}`,
            name: c.name || '',
            description: c.description || '',
            amount: c.amount ? String(c.amount) : '',
            file: null,
            existingReceiptUrl: c.receipt_url || null,
          }))
        );
      }

      if (items.da?.mode === 'direct') {
        setDaMode('direct');
        setDaCustomAmount(items.da?.amount ? String(items.da.amount) : '');
      } else {
        setDaMode('per_day');
        setDaDailyRate(items.da?.daily_rate !== undefined && items.da?.daily_rate !== null ? String(items.da.daily_rate) : '500');
      }
    } else {
      setClaimType('local');
      const vType = targetEntry.vehicle_type === 'car' || targetEntry.vehicle_type === 'auto' ? targetEntry.vehicle_type : 'bike';
      setLocalVehicle(vType);
      setLocalDate(targetEntry.expense_date || exp.expense_date || format(new Date(), 'yyyy-MM-dd'));
      setLocalFrom(targetEntry.travel_from || '');
      setLocalTo(targetEntry.travel_to || '');
      setLocalKM(targetEntry.distance_km ? String(targetEntry.distance_km) : '');
      setLocalPurpose(targetEntry.description || '');
      setExistingLocalReceiptUrl(targetEntry.receipt_url || null);
    }

    setSelectedDetailRecord(null);
    setModalOpen(true);
  };

  const handleDeleteSubEntry = async (exp: ExpenseRecord, entryId: string) => {
    if (!canEditExpense(exp)) {
      toast({ title: 'Locked', description: 'Approved claim ki entries delete nahi ho sakti.', variant: 'destructive' });
      return;
    }
    const existingList = getNormalizedEntries(exp);
    const remaining = existingList.filter((item) => item.id !== entryId);
    if (remaining.length === 0) {
      await handleDelete(exp.id);
      return;
    }
    if (!confirm('Kya aap is single day entry ko card se remove karna chahte hain?')) return;

    try {
      const nowIso = new Date().toISOString();
      const summaryFields = buildParentSummaryPayload(
        exp.expense_type === 'outstation' ? 'outstation' : 'travel_km',
        remaining,
        exp.expense_date
      );
      const nextHist: ActivityHistoryItem[] = [
        ...getExpenseTimeline(exp),
        {
          at: nowIso,
          actor: employee?.name || 'Employee',
          role: 'employee',
          action: 'Entry Removed from Sheet',
          details: `Remaining ${remaining.length} entr${remaining.length > 1 ? 'ies' : 'y'} • New Total ₹${Number(summaryFields.amount).toLocaleString('en-IN')}`,
        },
      ];
      const { error } = await supabase
        .from('employee_expenses' as any)
        .update({
          ...summaryFields,
          activity_history: nextHist,
          updated_at: nowIso,
        })
        .eq('id', exp.id)
        .in('status', ['draft', 'submitted']);
      if (error) throw error;

      toast({ title: 'Entry Removed', description: `Card updated (${remaining.length} entries left).` });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Remove Failed', description: err.message, variant: 'destructive' });
    }
  };

  // Submit Claim Handler (Add to Monthly Card / Create Card / Edit specific entry)
  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.id || !employee?.org_id) return;

    if (editingExpense && !canEditExpense(editingExpense)) {
      toast({
        title: 'Editing Not Allowed',
        description: 'This expense has already been reviewed/approved and cannot be edited.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const nowIso = new Date().toISOString();

    try {
      if (claimType === 'local') {
        if (localDate > todayStr) {
          toast({
            title: 'Future Date Not Allowed',
            description: 'You cannot claim travel expenses for a future date. Please select today or a past date.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        if (!parsedLocalKM || parsedLocalKM <= 0) {
          toast({
            title: 'Invalid Distance',
            description: 'Please enter a valid travel distance in kilometers (KM).',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        let uploadedUrl: string | null = existingLocalReceiptUrl;
        if (localReceiptFile) {
          uploadedUrl = await uploadReceipt(localReceiptFile, 'local');
        }

        const vehicleLabels: Record<string, string> = {
          bike: 'Bike (2-Wheeler)',
          car: 'Car (4-Wheeler)',
          auto: 'Cab / Auto',
        };

        const newLocalEntry = {
          id: editingEntryId || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          expense_date: localDate,
          vehicle_type: localVehicle,
          distance_km: parsedLocalKM,
          rate_per_km: currentLocalRate,
          amount: calculatedLocalAmount,
          travel_from: localFrom.trim() || null,
          travel_to: localTo.trim() || null,
          description: localPurpose.trim() || `Local travel by ${vehicleLabels[localVehicle] || localVehicle}`,
          receipt_url: uploadedUrl,
          created_at: editingEntryId ? undefined : nowIso,
          updated_at: nowIso,
        };

        const targetCard = editingExpense || findOpenDraftCard('travel_km', localDate);

        if (targetCard) {
          const prevEntries = getNormalizedEntries(targetCard);
          const nextEntries = editingExpense && editingEntryId
            ? prevEntries.map((item) => (item.id === editingEntryId ? { ...item, ...newLocalEntry, created_at: item.created_at || nowIso } : item))
            : [...prevEntries, newLocalEntry];

          const summaryFields = buildParentSummaryPayload('travel_km', nextEntries, localDate);
          const historyEntry: ActivityHistoryItem = {
            at: nowIso,
            actor: employee.name || 'Employee',
            role: 'employee',
            action: editingExpense ? 'Entry Edited' : 'Added Entry to Monthly Local Card',
            details: `${localDate} • ${parsedLocalKM} KM (${vehicleLabels[localVehicle]}) • ₹${calculatedLocalAmount.toFixed(2)} • Sheet Total: ₹${Number(summaryFields.amount).toLocaleString('en-IN')}`,
          };

          const { error } = await supabase
            .from('employee_expenses' as any)
            .update({
              ...summaryFields,
              status: targetCard.status,
              activity_history: [...getExpenseTimeline(targetCard), historyEntry],
              updated_at: nowIso,
            })
            .eq('id', targetCard.id)
            .in('status', ['submitted', 'draft']);
          if (error) throw error;

          toast({
            title: editingExpense ? 'Entry Updated!' : 'Added to Same Monthly Local Card!',
            description: `${nextEntries.length} entr${nextEntries.length > 1 ? 'ies' : 'y'} in Local card • Sheet Total: ₹${Number(summaryFields.amount).toLocaleString('en-IN')}.`,
          });
        } else {
          const summaryFields = buildParentSummaryPayload('travel_km', [newLocalEntry], localDate);
          const historyEntry: ActivityHistoryItem = {
            at: nowIso,
            actor: employee.name || 'Employee',
            role: 'employee',
            action: 'Monthly Local Card Started (Draft)',
            details: `${localDate} • ${parsedLocalKM} KM (${vehicleLabels[localVehicle]}) • ₹${calculatedLocalAmount.toFixed(2)}`,
          };

          const { error } = await supabase.from('employee_expenses' as any).insert({
            org_id: employee.org_id,
            employee_id: employee.id,
            ...summaryFields,
            status: 'draft',
            activity_history: [historyEntry],
            updated_at: nowIso,
          });
          if (error) throw error;

          toast({
            title: 'Monthly Local Card Created (Draft)!',
            description: `₹${calculatedLocalAmount.toFixed(2)} saved. Kal isi card par "+ Add Entry" dabakar agle din ki entry jod sakte hain.`,
          });
        }
      } else if (claimType === 'outstation') {
        // ================= Validation for Outstation =================
        if (!outFromCity.trim() || !outToCity.trim()) {
          toast({
            title: 'Missing Route Details',
            description: 'Please enter From City and Destination City.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        if (!outStartDate || !outEndDate) {
          toast({
            title: 'Trip Dates Required',
            description: 'Please select both Trip Start Date and Trip End Date.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        if (outEndDate < outStartDate) {
          toast({
            title: 'Invalid Date Range',
            description: 'Trip End Date cannot be before Trip Start Date.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        // Validate custom items
        const activeCustomItems = customItems.filter(
          (item) => item.name.trim() || (parseFloat(item.amount) || 0) > 0 || item.description.trim() || item.file || item.existingReceiptUrl
        );
        const unnamedCustom = activeCustomItems.find((item) => !item.name.trim());
        if (unnamedCustom) {
          toast({
            title: 'Custom Option Name Required',
            description: 'Please enter an Expense Name for your custom created option.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        if (calculatedOutstationGross <= 0) {
          toast({
            title: 'Amount Required',
            description: 'Please enter at least one expense amount (Travel, Hotel, Food, Other, Custom, or DA).',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        // Upload optional files in parallel
        const uploadTasks: Promise<{ key: string; url: string | null }>[] = [];
        if (travelBillFile) {
          uploadTasks.push(uploadReceipt(travelBillFile, 'out_travel').then(url => ({ key: 'travel', url })));
        }
        if (hotelBillFile) {
          uploadTasks.push(uploadReceipt(hotelBillFile, 'out_hotel').then(url => ({ key: 'hotel', url })));
        }
        if (foodBillFile) {
          uploadTasks.push(uploadReceipt(foodBillFile, 'out_food').then(url => ({ key: 'food', url })));
        }
        if (otherBillFile) {
          uploadTasks.push(uploadReceipt(otherBillFile, 'out_other').then(url => ({ key: 'other', url })));
        }
        activeCustomItems.forEach((cItem) => {
          if (cItem.file) {
            uploadTasks.push(
              uploadReceipt(cItem.file, 'out_custom').then((url) => ({ key: `custom_${cItem.id}`, url }))
            );
          }
        });

        const uploadResults = await Promise.all(uploadTasks);
        const urlMap: Record<string, string | null> = {};
        uploadResults.forEach(r => { urlMap[r.key] = r.url; });

        const finalTravelUrl = urlMap['travel'] ?? existingTravelReceiptUrl;
        const finalHotelUrl = urlMap['hotel'] ?? existingHotelReceiptUrl;
        const finalFoodUrl = urlMap['food'] ?? existingFoodReceiptUrl;
        const finalOtherUrl = urlMap['other'] ?? existingOtherReceiptUrl;

        const receiptsList: Array<{ type: string; label: string; url: string }> = [];
        if (finalTravelUrl) receiptsList.push({ type: 'travel', label: 'Travel Ticket', url: finalTravelUrl });
        if (finalHotelUrl) receiptsList.push({ type: 'hotel', label: 'Hotel Bill', url: finalHotelUrl });
        if (finalFoodUrl) receiptsList.push({ type: 'food', label: 'Food Bills', url: finalFoodUrl });
        if (finalOtherUrl) receiptsList.push({ type: 'other', label: 'Other / Laundry Bills', url: finalOtherUrl });

        const serializedCustomItems = activeCustomItems.map((cItem) => {
          const uploadedCustomUrl = urlMap[`custom_${cItem.id}`] ?? cItem.existingReceiptUrl ?? null;
          if (uploadedCustomUrl) {
            receiptsList.push({ type: 'custom', label: cItem.name.trim(), url: uploadedCustomUrl });
          }
          return {
            id: cItem.id,
            name: cItem.name.trim(),
            description: cItem.description.trim() || null,
            amount: parseFloat(cItem.amount) || 0,
            receipt_url: uploadedCustomUrl,
          };
        });

        const primaryReceiptUrl = receiptsList.length > 0 ? receiptsList[0].url : null;

        const outstationDetails = {
          trip_from: outFromCity.trim(),
          trip_to: outToCity.trim(),
          start_date: outStartDate,
          end_date: outEndDate,
          trip_days: tripDays,
          purpose: outPurpose.trim(),
          items: {
            travel: {
              mode: travelMode,
              booking_ref: travelBookingRef.trim() || null,
              amount: valTravel,
              receipt_url: finalTravelUrl || null,
            },
            hotel: {
              hotel_name: hotelName.trim() || null,
              nights: parseInt(hotelNights) || 1,
              amount: valHotel,
              receipt_url: finalHotelUrl || null,
            },
            food: {
              description: foodDesc.trim() || null,
              amount: valFood,
              receipt_url: finalFoodUrl || null,
            },
            other: {
              description: otherDesc.trim() || null,
              amount: valOther,
              receipt_url: finalOtherUrl || null,
            },
            custom_items: serializedCustomItems,
            da: {
              mode: daMode,
              days: tripDays,
              daily_rate: daMode === 'per_day' ? (parseFloat(daDailyRate) || 0) : null,
              amount: valDA,
            }
          },
          receipts: receiptsList,
          gross_amount: calculatedOutstationGross,
        };

        const customSummaryParts = serializedCustomItems.map((c) => `${c.name}: ₹${c.amount}`);
        const summaryDesc = `${outFromCity.trim()} → ${outToCity.trim()} (${tripDays} Days) | Travel: ₹${valTravel}, Hotel: ₹${valHotel}, Food: ₹${valFood}, Other: ₹${valOther}${customSummaryParts.length > 0 ? `, ${customSummaryParts.join(', ')}` : ''}, DA: ₹${valDA}${outPurpose.trim() ? ` — ${outPurpose.trim()}` : ''}`;

        const newOutEntry = {
          id: editingEntryId || `out_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          trip_start_date: outStartDate,
          trip_end_date: outEndDate,
          trip_days: tripDays,
          travel_from: outFromCity.trim(),
          travel_to: outToCity.trim(),
          purpose: outPurpose.trim() || null,
          amount: calculatedOutstationGross,
          receipt_url: primaryReceiptUrl,
          outstation_details: outstationDetails,
          created_at: editingEntryId ? undefined : nowIso,
          updated_at: nowIso,
        };

        const targetOutCard = editingExpense || findOpenDraftCard('outstation', outStartDate);

        if (targetOutCard) {
          const prevEntries = getNormalizedEntries(targetOutCard);
          const nextEntries = editingExpense && editingEntryId
            ? prevEntries.map((item) => (item.id === editingEntryId ? { ...item, ...newOutEntry, created_at: item.created_at || nowIso } : item))
            : [...prevEntries, newOutEntry];

          const summaryFields = buildParentSummaryPayload('outstation', nextEntries, outStartDate);
          const historyEntry: ActivityHistoryItem = {
            at: nowIso,
            actor: employee.name || 'Employee',
            role: 'employee',
            action: editingExpense ? 'Outstation Trip Edited' : 'Added Trip to Monthly Outstation Card',
            details: `${outFromCity.trim()} → ${outToCity.trim()} (${tripDays} Days) • ₹${calculatedOutstationGross.toLocaleString('en-IN')} • Sheet Total: ₹${Number(summaryFields.amount).toLocaleString('en-IN')}`,
          };

          const { error } = await supabase
            .from('employee_expenses' as any)
            .update({
              ...summaryFields,
              status: targetOutCard.status,
              activity_history: [...getExpenseTimeline(targetOutCard), historyEntry],
              updated_at: nowIso,
            })
            .eq('id', targetOutCard.id)
            .in('status', ['submitted', 'draft']);
          if (error) throw error;

          toast({
            title: editingExpense ? 'Outstation Trip Updated!' : 'Added to Same Monthly Outstation Card!',
            description: `${nextEntries.length} trip${nextEntries.length > 1 ? 's' : ''} in Outstation card • Sheet Total: ₹${Number(summaryFields.amount).toLocaleString('en-IN')}.`,
          });
        } else {
          const summaryFields = buildParentSummaryPayload('outstation', [newOutEntry], outStartDate);
          const historyEntry: ActivityHistoryItem = {
            at: nowIso,
            actor: employee.name || 'Employee',
            role: 'employee',
            action: 'Monthly Outstation Card Started (Draft)',
            details: `${outFromCity.trim()} → ${outToCity.trim()} (${tripDays} Days) • ₹${calculatedOutstationGross.toLocaleString('en-IN')}`,
          };

          const { error } = await supabase.from('employee_expenses' as any).insert({
            org_id: employee.org_id,
            employee_id: employee.id,
            ...summaryFields,
            status: 'draft',
            activity_history: [historyEntry],
            updated_at: nowIso,
          });
          if (error) throw error;

          toast({
            title: 'Monthly Outstation Card Created (Draft)!',
            description: `₹${calculatedOutstationGross.toLocaleString('en-IN')} (${outFromCity} → ${outToCity}) saved. Agli outstation trip bhi isi card mein "+ Add Entry" se jodein.`,
          });
        }
      }

      // Reset form & reload
      setModalOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingExpense(null);
    setEditingEntryId(null);
    setTargetCardForAddon(null);
    setClaimType(null);
    setLocalVehicle('bike');
    setLocalDate(format(new Date(), 'yyyy-MM-dd'));
    setLocalKM('');
    setLocalFrom('');
    setLocalTo('');
    setLocalPurpose('');
    setLocalReceiptFile(null);
    setExistingLocalReceiptUrl(null);

    const todayDefault = format(new Date(), 'yyyy-MM-dd');
    setOutFromCity('');
    setOutToCity('');
    setOutStartDate(todayDefault);
    setOutEndDate(todayDefault);
    setTripDaysInput('1');
    setOutPurpose('');
    setTravelBookingRef('');
    setTravelAmount('');
    setTravelBillFile(null);
    setExistingTravelReceiptUrl(null);
    setHotelName('');
    setHotelNights('1');
    setHotelAmount('');
    setHotelBillFile(null);
    setExistingHotelReceiptUrl(null);
    setFoodDesc('');
    setFoodAmount('');
    setFoodBillFile(null);
    setExistingFoodReceiptUrl(null);
    setOtherDesc('');
    setOtherAmount('');
    setOtherBillFile(null);
    setExistingOtherReceiptUrl(null);
    setCustomItems([]);
    setDaCustomAmount('');
  };

  // Delete/Cancel draft or submitted claim
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to cancel and delete this expense claim?')) return;
    try {
      const { error } = await supabase
        .from('employee_expenses' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Claim Removed' });
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    }
  };

  // Monthly Drafts Ready to Submit to HR
  const monthAllExpenses = expenses.filter((e) =>
    selectedMonth ? e.expense_date.startsWith(selectedMonth) : true
  );
  const draftExpensesInMonth = monthAllExpenses.filter((e) => e.status === 'draft');
  const draftTotalAmount = draftExpensesInMonth.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const otherMonthDraftsCount = expenses.filter(
    (e) => e.status === 'draft' && selectedMonth && !e.expense_date.startsWith(selectedMonth)
  ).length;

  // Submit all draft expenses of selectedMonth together to HR
  const handleSubmitMonthToHR = async () => {
    if (!employee?.id || draftExpensesInMonth.length === 0) return;
    setSubmittingMonth(true);
    try {
      const nowIso = new Date().toISOString();
      const monthLabel = selectedMonth
        ? format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')
        : 'Selected Period';

      const results = await Promise.all(
        draftExpensesInMonth.map((exp) => {
          const hist = getExpenseTimeline(exp);
          const nextHist: ActivityHistoryItem[] = [
            ...hist,
            {
              at: nowIso,
              actor: employee.name || 'Employee',
              role: 'employee',
              action: 'Submitted to HR (Monthly Batch)',
              details: `Sent ${monthLabel} expense entry (₹${Number(exp.amount || 0).toLocaleString('en-IN')}) for HR approval`,
            },
          ];
          return supabase
            .from('employee_expenses' as any)
            .update({
              status: 'submitted',
              activity_history: nextHist,
              updated_at: nowIso,
            })
            .eq('id', exp.id)
            .eq('status', 'draft')
            .select('id, claim_number');
        })
      );

      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;

      const generatedNumbers = results
        .flatMap((r) => (Array.isArray(r.data) ? r.data : []))
        .map((row: any) => row.claim_number)
        .filter(Boolean);

      toast({
        title: `${draftExpensesInMonth.length} Expense${draftExpensesInMonth.length > 1 ? 's' : ''} Sent to HR!`,
        description:
          generatedNumbers.length > 0
            ? `Unique 6-digit claim numbers generated: ${generatedNumbers.slice(0, 4).map((n) => `#${n}`).join(', ')}${generatedNumbers.length > 4 ? ` +${generatedNumbers.length - 4} more` : ''}`
            : `${monthLabel} claims submitted to HR for approval.`,
      });

      setSubmitMonthDialogOpen(false);
      await loadData();
    } catch (err: any) {
      toast({
        title: 'Monthly Submit Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmittingMonth(false);
    }
  };

  // Filtered List
  const filteredList = expenses.filter((e) => {
    if (selectedMonth && !e.expense_date.startsWith(selectedMonth)) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    return true;
  });

  // Summary Metrics
  const totalClaimed = filteredList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalApproved = filteredList
    .filter((e) => e.status === 'approved' || e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.approved_amount !== undefined ? e.approved_amount : e.amount), 0);
  const totalPending = filteredList
    .filter((e) => e.status === 'submitted')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalPaid = filteredList
    .filter((e) => e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.approved_amount !== undefined ? e.approved_amount : e.amount), 0);
  const totalDistanceKM = filteredList
    .filter((e) => e.expense_type === 'travel_km')
    .reduce((sum, e) => sum + Number(e.distance_km || 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-100 font-semibold text-[11px]">Draft (Not Sent)</Badge>;
      case 'submitted':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 font-semibold text-[11px]">Pending Review</Badge>;
      case 'approved':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-semibold text-[11px]">Approved</Badge>;
      case 'paid':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100 font-semibold text-[11px]">Paid / Disbursed</Badge>;
      case 'rejected':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100 font-semibold text-[11px]">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-5 pb-32 overflow-x-hidden">
      {/* Header (Fully Mobile Responsive) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 shrink-0" />
            My Expenses & Claims
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Submit Local travel logs (Bike, Car, Cab) or Outstation travel claims (Tickets, Hotel, Food, DA) and track your reimbursement approvals.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="flex-1 sm:w-36 bg-white shadow-sm h-9 text-xs"
          />
          <Button
            onClick={() => {
              resetForm();
              setModalOpen(true);
            }}
            className="hidden sm:inline-flex bg-orange-600 hover:bg-orange-700 text-white gap-1.5 shadow-sm h-9 text-xs font-semibold px-3 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" /> New Claim
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Total Logged</p>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5">₹{totalClaimed.toLocaleString('en-IN')}</h3>
            <p className="text-[11px] text-slate-400 mt-1">
              {filteredList.length} entries{draftExpensesInMonth.length > 0 ? ` (${draftExpensesInMonth.length} draft)` : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-amber-600 uppercase">Pending Review</p>
            <h3 className="text-xl font-bold text-amber-700 mt-0.5">₹{totalPending.toLocaleString('en-IN')}</h3>
            <p className="text-[11px] text-slate-400 mt-1">Sent to HR</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-600 uppercase">Approved</p>
            <h3 className="text-xl font-bold text-emerald-700 mt-0.5">₹{totalApproved.toLocaleString('en-IN')}</h3>
            <p className="text-[11px] text-slate-400 mt-1">Ready for payment</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-blue-600 uppercase">Settled / Paid</p>
            <h3 className="text-xl font-bold text-blue-700 mt-0.5">₹{totalPaid.toLocaleString('en-IN')}</h3>
            <p className="text-[11px] text-slate-400 mt-1">{totalDistanceKM > 0 ? `${totalDistanceKM.toFixed(1)} KM logged` : 'Disbursed'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Bulk Submit Banner (Send Month's Drafts to HR Together) */}
      {(draftExpensesInMonth.length > 0 || otherMonthDraftsCount > 0) && (
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50/70 to-white shadow-sm">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-orange-600 text-white hover:bg-orange-600 text-[11px] font-bold">
                  Monthly Batch Ready
                </Badge>
                <span className="text-sm font-bold text-slate-900">
                  {draftExpensesInMonth.length > 0
                    ? `${draftExpensesInMonth.reduce((sum, e) => sum + getNormalizedEntries(e).length, 0)} Entries across ${draftExpensesInMonth.length} Monthly Card${draftExpensesInMonth.length > 1 ? 's' : ''} in Draft (₹${draftTotalAmount.toLocaleString('en-IN')})`
                    : `${otherMonthDraftsCount} Draft Card${otherMonthDraftsCount > 1 ? 's' : ''} in Another Month`}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {draftExpensesInMonth.length > 0
                  ? `${selectedMonth ? format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy') : 'Selected month'} ke Local aur Outstation monthly cards ek saath HR approval ke liye bhejein.`
                  : 'Apne baaki month ke saved drafts bhejne ke liye upar se us month ko select karein.'}
              </p>
            </div>
            {draftExpensesInMonth.length > 0 && (
              <Button
                type="button"
                onClick={() => setSubmitMonthDialogOpen(true)}
                disabled={submittingMonth}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold gap-2 shadow-sm shrink-0 h-9 text-xs px-4"
              >
                <Send className="h-3.5 w-3.5" />
                Submit Month to HR ({draftExpensesInMonth.length})
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Expense History Table / Cards */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-3.5 sm:p-4 border-b flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-slate-500 shrink-0" />
            <CardTitle className="text-sm sm:text-base font-semibold text-slate-900 truncate">Claim History</CardTitle>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 sm:w-36 h-8 text-xs bg-white shrink-0">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft (Unsent)</SelectItem>
              <SelectItem value="submitted">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {filteredList.length === 0 ? (
            <div className="py-16 px-4 text-center text-slate-500">
              <Receipt className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium">No expenses submitted for this month.</p>
              <p className="text-xs text-slate-400 mt-1">Tap &quot;+ New Claim&quot; to log a Local or Outstation claim.</p>
            </div>
          ) : (
            <>
              {/* Mobile Native Card View (Zero Horizontal Scroll) */}
              <div className="md:hidden p-3 space-y-3 bg-slate-50/50">
                {filteredList.map((exp) => {
                  const rowEntries = getNormalizedEntries(exp);
                  const entryCount = rowEntries.length;
                  return (
                    <div
                      key={exp.id}
                      onClick={() => setSelectedDetailRecord(exp)}
                      className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2.5 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      {/* Top row: Type + Count Badges & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          {exp.expense_type === 'outstation' ? (
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1 font-semibold text-[11px]">
                              <Plane className="h-3 w-3 shrink-0" /> Outstation
                            </Badge>
                          ) : exp.expense_type === 'travel_km' ? (
                            <Badge className="bg-amber-50 text-amber-800 border-amber-300 gap-1 font-semibold text-[11px]">
                              {exp.vehicle_type === 'car' ? <Car className="h-3 w-3 shrink-0" /> : exp.vehicle_type === 'auto' ? <Bus className="h-3 w-3 shrink-0" /> : <Bike className="h-3 w-3 shrink-0" />}
                              Local Monthly
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-800 border-slate-200 font-semibold text-[11px]">
                              {exp.category_name}
                            </Badge>
                          )}
                          <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold">
                            {entryCount} {exp.expense_type === 'outstation' ? (entryCount === 1 ? 'Trip' : 'Trips') : (entryCount === 1 ? 'Entry' : 'Entries')}
                          </Badge>
                        </div>
                        <div className="shrink-0">{getStatusBadge(exp.status)}</div>
                      </div>

                      {/* Middle row: Date, Tracking # & Amount */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-600 font-medium">
                            <span>{format(parseISO(exp.expense_date), 'dd MMM yyyy')}</span>
                            {exp.claim_number ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] font-bold">
                                #{exp.claim_number}
                              </span>
                            ) : exp.status === 'draft' ? (
                              <span className="text-[10px] text-orange-600 font-semibold">Draft Card</span>
                            ) : null}
                          </div>
                          {exp.expense_type === 'travel_km' && (
                            <div className="text-[11px] text-amber-700 font-semibold mt-0.5">
                              {entryCount > 1
                                ? `Total ${exp.distance_km} KM logged`
                                : `${exp.distance_km} KM @ ₹${exp.rate_per_km}/KM`}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-extrabold text-slate-900 leading-tight">
                            ₹{Number(exp.amount).toLocaleString('en-IN')}
                          </div>
                          {(exp.status === 'approved' || exp.status === 'paid') && (
                            <div className="text-[11px] font-bold text-emerald-700 mt-0.5">
                              Appr: ₹{Number(exp.approved_amount !== undefined ? exp.approved_amount : exp.amount).toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Route / Description / Rejection */}
                      <div className="text-xs text-slate-700 bg-slate-50/90 rounded-xl px-2.5 py-2 border border-slate-100 space-y-1">
                        {exp.expense_type === 'outstation' ? (
                          <>
                            <div className="font-semibold text-slate-900 flex items-start gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                              <span className="break-words">
                                {entryCount > 1
                                  ? `${rowEntries[0]?.travel_from || exp.travel_from || 'Tour'} → ${rowEntries[0]?.travel_to || exp.travel_to || ''} + ${entryCount - 1} more trip${entryCount - 1 > 1 ? 's' : ''}`
                                  : `${exp.outstation_details?.trip_from || exp.travel_from} → ${exp.outstation_details?.trip_to || exp.travel_to} (${exp.outstation_details?.trip_days || 1} Days)`}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 pl-5">
                              {exp.outstation_details?.purpose || exp.description || 'Outstation official tour'}
                            </p>
                          </>
                        ) : exp.expense_type === 'travel_km' ? (
                          <>
                            <div className="font-semibold text-slate-900 flex items-start gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                              <span className="break-words">
                                {entryCount > 1
                                  ? `${rowEntries[0]?.travel_from || 'Start'} → ${rowEntries[0]?.travel_to || 'End'} + ${entryCount - 1} more`
                                  : `${exp.travel_from || 'Start'} → ${exp.travel_to || 'End'}`}
                              </span>
                            </div>
                            {exp.description && (
                              <p className="text-[11px] text-slate-500 line-clamp-2 pl-5">{exp.description}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-600 line-clamp-2">{exp.description || exp.merchant_name || '—'}</p>
                        )}
                        {exp.rejection_reason && (
                          <div className="text-rose-600 text-[11px] font-semibold flex items-start gap-1 pt-0.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="break-words">Reason: {exp.rejection_reason}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {exp.status === 'draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAddEntryToCard(exp);
                              }}
                              className="h-7 text-[11px] px-2.5 gap-1 font-semibold border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100"
                            >
                              <Plus className="h-3 w-3" /> Add Entry
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDetailRecord(exp);
                            }}
                            className="h-7 text-[11px] px-2.5 gap-1 text-indigo-700 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100"
                          >
                            <Eye className="h-3 w-3" /> {entryCount > 1 ? `Entries (${entryCount})` : 'Details'}
                          </Button>
                          {entryCount <= 1 && exp.receipt_url && exp.expense_type !== 'outstation' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewUrl(exp.receipt_url!);
                              }}
                              className="h-7 w-7 p-0 text-orange-600 hover:bg-orange-50"
                              title="View Receipt"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {canEditExpense(exp) ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (entryCount <= 1) {
                                    openEditSubEntry(exp, rowEntries[0]);
                                  } else {
                                    setSelectedDetailRecord(exp);
                                  }
                                }}
                                className="h-7 w-7 p-0 text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                                title={entryCount <= 1 ? 'Edit Entry' : 'Open Card to Edit Entries'}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(exp.id);
                                }}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                title="Delete Card"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <span className="inline-flex items-center px-1.5 text-slate-300" title="Locked after review">
                              <Lock className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead>Type & Category</TableHead>
                  <TableHead>Trip / Breakdown</TableHead>
                  <TableHead className="text-right">Claim Amount</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center w-24">Details & Bills</TableHead>
                  <TableHead className="text-right w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredList.map((exp) => {
                  const rowEntries = getNormalizedEntries(exp);
                  const entryCount = rowEntries.length;
                  return (
                  <TableRow
                    key={exp.id}
                    onClick={() => setSelectedDetailRecord(exp)}
                    className="hover:bg-orange-50/40 cursor-pointer transition-colors"
                    title="Click to view entries, details & history"
                  >
                    <TableCell className="text-xs text-slate-600 font-medium whitespace-nowrap">
                      <div>{format(parseISO(exp.expense_date), 'dd MMM yyyy')}</div>
                      {exp.claim_number ? (
                        <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] font-bold">
                          #{exp.claim_number}
                        </span>
                      ) : exp.status === 'draft' ? (
                        <span className="inline-block mt-1 text-[10px] text-orange-600 font-semibold">
                          Monthly Draft Card
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {exp.expense_type === 'outstation' ? (
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 gap-1 font-semibold text-[11px]">
                              <Plane className="h-3 w-3" /> Outstation Monthly
                            </Badge>
                            <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold">
                              {entryCount} {entryCount === 1 ? 'Trip' : 'Trips'}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {entryCount > 1
                              ? `${entryCount} trips combined in this month card`
                              : exp.travel_from && exp.travel_to
                              ? `${exp.travel_from} → ${exp.travel_to}`
                              : 'Tour Trip'}
                          </div>
                        </div>
                      ) : exp.expense_type === 'travel_km' ? (
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className="bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 gap-1 font-semibold text-[11px]">
                              {exp.vehicle_type === 'car' ? <Car className="h-3 w-3" /> : exp.vehicle_type === 'auto' ? <Bus className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
                              Local Monthly
                            </Badge>
                            <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold">
                              {entryCount} {entryCount === 1 ? 'Entry' : 'Entries'}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                            {entryCount > 1
                              ? `Total ${exp.distance_km} KM logged`
                              : `${exp.distance_km} KM @ ₹${exp.rate_per_km}/KM`}
                          </div>
                        </div>
                      ) : (
                        <div className="font-semibold text-slate-800 text-xs">
                          {exp.category_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-slate-600">
                      {exp.expense_type === 'outstation' ? (
                        <div>
                          <div className="font-medium text-slate-800 truncate">
                            {entryCount > 1
                              ? `${rowEntries[0]?.travel_from || exp.travel_from || 'Tour'} → ${rowEntries[0]?.travel_to || exp.travel_to || ''} + ${entryCount - 1} more trip${entryCount - 1 > 1 ? 's' : ''}`
                              : `${exp.outstation_details?.trip_from || exp.travel_from} → ${exp.outstation_details?.trip_to || exp.travel_to} (${exp.outstation_details?.trip_days || 1} Days)`}
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {exp.outstation_details?.purpose || exp.description || 'Outstation official tour'}
                          </div>
                        </div>
                      ) : exp.expense_type === 'travel_km' ? (
                        <div>
                          <div className="flex items-center gap-1 truncate font-medium text-slate-800">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>
                              {entryCount > 1
                                ? `${rowEntries[0]?.travel_from || 'Start'} → ${rowEntries[0]?.travel_to || 'End'} + ${entryCount - 1} more`
                                : `${exp.travel_from || 'Start'} → ${exp.travel_to || 'End'}`}
                            </span>
                          </div>
                          {exp.description && (
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {exp.description}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="truncate block">{exp.description || exp.merchant_name || '—'}</span>
                      )}
                      {exp.rejection_reason && (
                        <div className="text-rose-600 text-[11px] font-semibold mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" /> Reason: {exp.rejection_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-slate-900 text-sm whitespace-nowrap">
                      ₹{Number(exp.amount).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-700 text-sm whitespace-nowrap">
                      {exp.status === 'approved' || exp.status === 'paid' ? (
                        `₹${Number(exp.approved_amount !== undefined ? exp.approved_amount : exp.amount).toLocaleString('en-IN')}`
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(exp.status)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDetailRecord(exp);
                          }}
                          className="h-7 text-xs px-2 gap-1 text-indigo-700 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100"
                          title="Open All Entries & History"
                        >
                          <Eye className="h-3.5 w-3.5" /> {entryCount > 1 ? `Entries (${entryCount})` : exp.expense_type === 'outstation' ? 'Breakdown' : 'Details'}
                        </Button>
                        {entryCount <= 1 && exp.receipt_url && exp.expense_type !== 'outstation' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(exp.receipt_url!);
                            }}
                            className="h-7 w-7 p-0 text-orange-600 hover:text-orange-800 hover:bg-orange-50"
                            title="View Receipt"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {exp.status === 'draft' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAddEntryToCard(exp);
                            }}
                            className="h-7 text-[11px] px-2 gap-1 font-semibold border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100"
                            title="Add next day / addon entry into this same card"
                          >
                            <Plus className="h-3 w-3" /> Add Entry
                          </Button>
                        )}
                        {canEditExpense(exp) ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (entryCount <= 1) {
                                  openEditSubEntry(exp, rowEntries[0]);
                                } else {
                                  setSelectedDetailRecord(exp);
                                }
                              }}
                              className="h-7 w-7 p-0 text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                              title={entryCount <= 1 ? 'Edit Entry (Allowed before approval)' : 'Open Card to Edit Individual Entries'}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(exp.id);
                              }}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                              title="Delete Entire Card"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <span className="inline-flex items-center justify-end text-slate-300" title="Locked after review">
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ================= NEW CLAIM DIALOG (Step 1: Choose Type -> Step 2: Form) ================= */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-600" />
              {editingExpense
                ? `Edit ${claimType === 'local' ? 'Local' : 'Outstation'} Claim`
                : claimType === null
                ? 'New Expense Claim'
                : claimType === 'local'
                ? 'Local Travel Claim (लोकल यात्रा)'
                : 'Outstation Tour Claim (आउट स्टेशन)'}
            </DialogTitle>
            <DialogDescription>
              {editingExpense
                ? 'अप्रूवल से पहले आप अपने क्लेम की जानकारी और बिल अपडेट कर सकते हैं।'
                : claimType === null
                ? 'पहले चुनें कि यह लोकल यात्रा है या आउट स्टेशन टूर क्लेम।'
                : claimType === 'local'
                ? 'Bike, Car या Cab/Auto से स्थानीय यात्रा का किलोमीटर (KM) विवरण भरें।'
                : 'मल्टी-डे आउट स्टेशन टूर, बिल (ऑप्शनल), DA और नया कस्टम खर्च जोड़ें।'}
            </DialogDescription>
          </DialogHeader>

          {claimType === null ? (
            /* ================= STEP 1: CHOOSE LOCAL VS OUTSTATION ================= */
            <div className="space-y-3 py-2">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Step 1: Select Claim Type (क्लेम का प्रकार चुनें)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setClaimType('local')}
                  className="group p-4 rounded-2xl text-left border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50/60 hover:border-orange-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2.5 rounded-xl bg-orange-600 text-white shadow-sm">
                      <Bike className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-5 w-5 text-orange-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="font-bold text-base text-slate-900">Local Travel (लोकल)</div>
                  <p className="text-xs text-slate-600 mt-1">
                    Bike, Car या Cab / Auto से शहर के अंदर यात्रा (HR स्वीकृत ₹/KM रेट के अनुसार)।
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setClaimType('outstation')}
                  className="group p-4 rounded-2xl text-left border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50/60 hover:border-indigo-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-sm">
                      <Plane className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-5 w-5 text-indigo-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="font-bold text-base text-slate-900">Outstation Tour (आउट स्टेशन)</div>
                  <p className="text-xs text-slate-600 mt-1">
                    ट्रेवल, होटल, फूड, अन्य, DA + खुद का नया ऑप्शन बनाएं (कितने भी दिन की ट्रिप)।
                  </p>
                </button>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ================= STEP 2: ONLY SELECTED CLAIM TYPE FORM ================= */
            <form onSubmit={handleSubmitClaim} className="space-y-4 pt-1">
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                {!editingExpense && !targetCardForAddon ? (
                  <button
                    type="button"
                    onClick={() => setClaimType(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-orange-600 transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Change Type
                  </button>
                ) : editingExpense ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700">
                    <Pencil className="h-3.5 w-3.5" /> Editing Entry in Monthly Card
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-700">
                    <Plus className="h-3.5 w-3.5" /> Adding Addon Entry to Monthly Card
                  </span>
                )}
                <Badge
                  className={
                    claimType === 'local'
                      ? 'bg-orange-100 text-orange-800 border-orange-200'
                      : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                  }
                >
                  {claimType === 'local' ? 'Local Travel' : 'Outstation Tour'}
                </Badge>
              </div>

              {!editingExpense && (() => {
                const openDraft = findOpenDraftCard(
                  claimType === 'local' ? 'travel_km' : 'outstation',
                  claimType === 'local' ? localDate : outStartDate
                );
                if (!openDraft) return null;
                const existingCount = getNormalizedEntries(openDraft).length;
                return (
                  <div className="px-3 py-2 rounded-xl bg-orange-50/90 border border-orange-200 text-xs text-orange-900 flex items-center justify-between gap-2">
                    <span>
                      Ye entry aapke is month ke existing{' '}
                      <strong>{claimType === 'local' ? 'Local Monthly Card' : 'Outstation Monthly Card'}</strong>{' '}
                      me add hogi ({existingCount} {claimType === 'local' ? 'entries' : 'trips'} already saved).
                    </span>
                    <Badge className="bg-white text-orange-700 border-orange-300 shrink-0 font-bold">
                      ₹{Number(openDraft.amount || 0).toLocaleString('en-IN')}
                    </Badge>
                  </div>
                );
              })()}

              {/* ================= OPTION 1: LOCAL (लोकल) ================= */}
              {claimType === 'local' ? (
              <div className="space-y-4">
                {/* 3 Vehicle Options with HR Rates */}
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                      वाहन चुनें (Vehicle Type) *
                    </Label>
                    <div className="text-right">
                      <span className="text-[11px] font-medium text-amber-800">HR स्वीकृत दर: </span>
                      <span className="text-sm font-extrabold text-amber-950">₹{currentLocalRate.toFixed(2)} / KM</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setLocalVehicle('bike')}
                      className={`p-2.5 rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                        localVehicle === 'bike'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      <Bike className="h-5 w-5" />
                      <span>Bike (बाइक)</span>
                      <span className={`text-[10px] ${localVehicle === 'bike' ? 'text-amber-100' : 'text-slate-500'}`}>
                        ₹{(vehicleRates.bike || 3.50).toFixed(2)}/KM
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLocalVehicle('car')}
                      className={`p-2.5 rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                        localVehicle === 'car'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      <Car className="h-5 w-5" />
                      <span>Car (कार)</span>
                      <span className={`text-[10px] ${localVehicle === 'car' ? 'text-amber-100' : 'text-slate-500'}`}>
                        ₹{(vehicleRates.car || 8.00).toFixed(2)}/KM
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLocalVehicle('auto')}
                      className={`p-2.5 rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                        localVehicle === 'auto'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      <Bus className="h-5 w-5" />
                      <span>Cab / Auto (कैब)</span>
                      <span className={`text-[10px] ${localVehicle === 'auto' ? 'text-amber-100' : 'text-slate-500'}`}>
                        ₹{(vehicleRates.auto || 5.00).toFixed(2)}/KM
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Travel Date (यात्रा तिथि) *</Label>
                    <Input
                      type="date"
                      value={localDate}
                      max={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => setLocalDate(e.target.value)}
                      required
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Distance Traveled (KM) *</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      placeholder="e.g. 24.5"
                      value={localKM}
                      onChange={(e) => setLocalKM(e.target.value)}
                      required
                      className="mt-1 h-9 text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Auto Calculated Preview Card */}
                {parsedLocalKM > 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="text-xs text-emerald-800">
                      <span>गणना: <b>{parsedLocalKM} KM</b> × <b>₹{currentLocalRate.toFixed(2)}</b></span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-emerald-700 block">Total Claim Amount</span>
                      <span className="text-lg font-bold text-emerald-800">₹{calculatedLocalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">From Location (कहाँ से)</Label>
                    <Input
                      placeholder="e.g. Office / Client A"
                      value={localFrom}
                      onChange={(e) => setLocalFrom(e.target.value)}
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">To Location (कहाँ तक)</Label>
                    <Input
                      placeholder="e.g. Client Site B"
                      value={localTo}
                      onChange={(e) => setLocalTo(e.target.value)}
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Trip Purpose / Client Note (यात्रा का उद्देश्य)</Label>
                  <Input
                    placeholder="e.g. Client visit, product delivery, meeting"
                    value={localPurpose}
                    onChange={(e) => setLocalPurpose(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>

                {/* Optional Receipt Upload for Local */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                      <span>Upload Fuel Bill / Toll Slip (Optional / ऐच्छिक)</span>
                    </Label>
                    <span className="text-[10px] text-slate-400">Max 2MB (JPG, PNG, PDF)</span>
                  </div>
                  <Input
                    type="file"
                    accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf,image/jpeg,image/png,image/bmp,image/webp,application/pdf"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (!selected) {
                        setLocalReceiptFile(null);
                        return;
                      }
                      const check = validateReceiptFile(selected);
                      if (!check.valid) {
                        toast({ title: 'File Error', description: check.error, variant: 'destructive' });
                        e.target.value = '';
                        setLocalReceiptFile(null);
                        return;
                      }
                      setLocalReceiptFile(selected);
                    }}
                    className="h-9 text-xs bg-white cursor-pointer"
                  />
                  {localReceiptFile ? (
                    <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-700 font-medium">
                      <span className="truncate max-w-[320px]">✓ {localReceiptFile.name} ({(localReceiptFile.size / 1024).toFixed(1)} KB)</span>
                      <button type="button" onClick={() => setLocalReceiptFile(null)} className="text-rose-600 font-bold px-1">✕</button>
                    </div>
                  ) : existingLocalReceiptUrl ? (
                    <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-md text-[11px] text-blue-700 font-medium">
                      <button type="button" onClick={() => setPreviewUrl(existingLocalReceiptUrl)} className="flex items-center gap-1 hover:underline">
                        <Eye className="h-3 w-3" /> Existing receipt attached (View)
                      </button>
                      <button type="button" onClick={() => setExistingLocalReceiptUrl(null)} className="text-rose-600 font-bold px-1">Remove</button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              /* ================= OPTION 2: OUTSTATION (आउट स्टेशन) ================= */
              <div className="space-y-4">
                {/* Outstation Trip Header */}
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Plane className="h-4 w-4 text-indigo-600" /> Outstation Trip Details (टूर विवरण)
                    </Label>
                    <Badge className="bg-indigo-600 text-white font-bold text-xs">
                      {tripDays} {tripDays === 1 ? 'Day' : 'Days'} Trip
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">From City (प्रारंभ शहर) *</Label>
                      <Input
                        placeholder="e.g. Bhopal / Indore"
                        value={outFromCity}
                        onChange={(e) => setOutFromCity(e.target.value)}
                        required
                        className="mt-1 h-9 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Destination City (गंतव्य शहर) *</Label>
                      <Input
                        placeholder="e.g. Mumbai / Delhi"
                        value={outToCity}
                        onChange={(e) => setOutToCity(e.target.value)}
                        required
                        className="mt-1 h-9 text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Start Date (प्रारंभ तिथि) *</Label>
                      <Input
                        type="date"
                        value={outStartDate}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          const nextEnd = newStart && outEndDate < newStart ? newStart : outEndDate;
                          syncDatesFromPickers(newStart, nextEnd);
                        }}
                        required
                        className="mt-1 h-9 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">End Date (समाप्ति तिथि) *</Label>
                      <Input
                        type="date"
                        value={outEndDate}
                        min={outStartDate}
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          syncDatesFromPickers(outStartDate, newEnd);
                        }}
                        required
                        className="mt-1 h-9 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Trip Days (कितने दिन) *</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 5"
                        value={tripDaysInput}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleTripDaysChange(e.target.value)}
                        onBlur={() => {
                          const parsed = parseInt(tripDaysInput, 10);
                          if (!tripDaysInput || isNaN(parsed) || parsed < 1) {
                            setTripDaysInput(String(tripDays));
                          }
                        }}
                        className="mt-1 h-9 text-xs font-bold bg-white text-indigo-800"
                      />
                    </div>
                  </div>

                  {/* Quick Multi-Day Selection Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold text-indigo-900 mr-1">Quick Days:</span>
                    {[1, 2, 3, 5, 7, 10, 15].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleTripDaysChange(String(d))}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all ${
                          tripDays === d
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                        }`}
                      >
                        {d} {d === 1 ? 'Day' : 'Days'}
                      </button>
                    ))}
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Tour Purpose / Note (टूर का उद्देश्य)</Label>
                    <Input
                      placeholder="e.g. Client meetings, branch technical audit, exhibition"
                      value={outPurpose}
                      onChange={(e) => setOutPurpose(e.target.value)}
                      className="mt-1 h-9 text-xs bg-white"
                    />
                  </div>
                </div>

                {/* Sub-Card 1: Travel Fare (ट्रेवलिंग बिल) */}
                <div className="p-3.5 border border-slate-200 rounded-xl space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plane className="h-4 w-4 text-blue-600" />
                      <span className="font-bold text-xs text-slate-800">1. Travel Fare / Tickets (ट्रेवलिंग बिल)</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">बिल अपलोड ऐच्छिक है</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-slate-600">Mode (माध्यम)</Label>
                      <select
                        value={travelMode}
                        onChange={(e) => setTravelMode(e.target.value)}
                        className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        <option value="Train">Train (ट्रेन)</option>
                        <option value="Flight">Flight (फ्लाइट)</option>
                        <option value="Bus">Bus (बस)</option>
                        <option value="Intercity Cab">Intercity Cab (कैब)</option>
                        <option value="Personal Car">Personal Car</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <Label className="text-[11px] text-slate-600">Ticket / PNR No.</Label>
                      <Input
                        placeholder="PNR / Ticket Ref"
                        value={travelBookingRef}
                        onChange={(e) => setTravelBookingRef(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-slate-600">Amount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={travelAmount}
                        onChange={(e) => setTravelAmount(e.target.value)}
                        className="mt-1 h-8 text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-500">Travel Ticket / Bill (Optional)</Label>
                    <Input
                      type="file"
                      accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf,image/jpeg,image/png,image/bmp,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const check = validateReceiptFile(file);
                          if (!check.valid) {
                            toast({ title: 'Invalid File', description: check.error, variant: 'destructive' });
                            e.target.value = '';
                            setTravelBillFile(null);
                            return;
                          }
                          setTravelBillFile(file);
                        } else {
                          setTravelBillFile(null);
                        }
                      }}
                      className="h-8 text-[11px] cursor-pointer"
                    />
                    {travelBillFile && (
                      <div className="flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                        <span className="truncate max-w-[260px]">✓ {travelBillFile.name}</span>
                        <button type="button" onClick={() => setTravelBillFile(null)} className="text-rose-600 font-bold">✕</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-Card 2: Hotel / Stay (होटल बिल) */}
                <div className="p-3.5 border border-slate-200 rounded-xl space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Hotel className="h-4 w-4 text-purple-600" />
                      <span className="font-bold text-xs text-slate-800">2. Hotel / Lodging (होटल बिल)</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">बिल अपलोड ऐच्छिक है</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-slate-600">Hotel Name</Label>
                      <Input
                        placeholder="e.g. Hotel Grand"
                        value={hotelName}
                        onChange={(e) => setHotelName(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-slate-600">Nights (रातें)</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={hotelNights}
                        onChange={(e) => setHotelNights(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-slate-600">Total Hotel Bill (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={hotelAmount}
                        onChange={(e) => setHotelAmount(e.target.value)}
                        className="mt-1 h-8 text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-500">Hotel Invoice / Receipt (Optional)</Label>
                    <Input
                      type="file"
                      accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf,image/jpeg,image/png,image/bmp,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const check = validateReceiptFile(file);
                          if (!check.valid) {
                            toast({ title: 'Invalid File', description: check.error, variant: 'destructive' });
                            e.target.value = '';
                            setHotelBillFile(null);
                            return;
                          }
                          setHotelBillFile(file);
                        } else {
                          setHotelBillFile(null);
                        }
                      }}
                      className="h-8 text-[11px] cursor-pointer"
                    />
                    {hotelBillFile && (
                      <div className="flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                        <span className="truncate max-w-[260px]">✓ {hotelBillFile.name}</span>
                        <button type="button" onClick={() => setHotelBillFile(null)} className="text-rose-600 font-bold">✕</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-Card 3: Food / Meals (फूड बिल) */}
                <div className="p-3.5 border border-slate-200 rounded-xl space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Utensils className="h-4 w-4 text-emerald-600" />
                      <span className="font-bold text-xs text-slate-800">3. Food / Meals (फूड बिल)</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">बिल अपलोड ऐच्छिक है</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-slate-600">Details (नाश्ता, लंच, डिनर)</Label>
                      <Input
                        placeholder="e.g. Tour meals & client lunch"
                        value={foodDesc}
                        onChange={(e) => setFoodDesc(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-slate-600">Total Food Amount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={foodAmount}
                        onChange={(e) => setFoodAmount(e.target.value)}
                        className="mt-1 h-8 text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-500">Food Bills / Restaurant Slips (Optional)</Label>
                    <Input
                      type="file"
                      accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf,image/jpeg,image/png,image/bmp,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const check = validateReceiptFile(file);
                          if (!check.valid) {
                            toast({ title: 'Invalid File', description: check.error, variant: 'destructive' });
                            e.target.value = '';
                            setFoodBillFile(null);
                            return;
                          }
                          setFoodBillFile(file);
                        } else {
                          setFoodBillFile(null);
                        }
                      }}
                      className="h-8 text-[11px] cursor-pointer"
                    />
                    {foodBillFile && (
                      <div className="flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                        <span className="truncate max-w-[260px]">✓ {foodBillFile.name}</span>
                        <button type="button" onClick={() => setFoodBillFile(null)} className="text-rose-600 font-bold">✕</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-Card 4: Other - Laundry & Other Expenses (लॉन्ड्री एंड अन्य खर्च) */}
                <div className="p-3.5 border border-slate-200 rounded-xl space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shirt className="h-4 w-4 text-cyan-600" />
                      <span className="font-bold text-xs text-slate-800">4. Other (लॉन्ड्री & अन्य खर्च)</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">बिल अपलोड ऐच्छिक है</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-slate-600">Description (लॉन्ड्री, लोकल ऑटो, टोल)</Label>
                      <Input
                        placeholder="e.g. Laundry, local taxi, station auto, tolls"
                        value={otherDesc}
                        onChange={(e) => setOtherDesc(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] text-slate-600">Total Other Amount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={otherAmount}
                        onChange={(e) => setOtherAmount(e.target.value)}
                        className="mt-1 h-8 text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-500">Other Bills / Laundry Slips (Optional)</Label>
                    <Input
                      type="file"
                      accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf,image/jpeg,image/png,image/bmp,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const check = validateReceiptFile(file);
                          if (!check.valid) {
                            toast({ title: 'Invalid File', description: check.error, variant: 'destructive' });
                            e.target.value = '';
                            setOtherBillFile(null);
                            return;
                          }
                          setOtherBillFile(file);
                        } else {
                          setOtherBillFile(null);
                        }
                      }}
                      className="h-8 text-[11px] cursor-pointer"
                    />
                    {otherBillFile && (
                      <div className="flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                        <span className="truncate max-w-[260px]">✓ {otherBillFile.name}</span>
                        <button type="button" onClick={() => setOtherBillFile(null)} className="text-rose-600 font-bold">✕</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-Card 5: Create New Expense Option (नया कस्टम खर्च जोड़ें) */}
                <div className="p-3.5 border-2 border-dashed border-orange-200 bg-orange-50/40 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FolderPlus className="h-4 w-4 text-orange-600 shrink-0" />
                      <div>
                        <span className="font-bold text-xs text-slate-800 block">
                          5. Create New Option (अपना नया खर्च बनाएं)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ऊपर दिए गए 1-4 के अलावा कोई और खर्च (जैसे Gift, Wi-Fi, Porter, Medical) जोड़ें
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addCustomOutstationItem}
                      className="h-8 text-xs px-2.5 gap-1 border-orange-300 bg-white text-orange-700 hover:bg-orange-100 font-bold shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create New
                    </Button>
                  </div>

                  {customItems.length > 0 && (
                    <div className="space-y-3 pt-1">
                      {customItems.map((cItem, idx) => (
                        <div key={cItem.id} className="p-3 bg-white border border-orange-200 rounded-xl space-y-2.5 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-orange-700 flex items-center gap-1">
                              <Tag className="h-3 w-3" /> Custom Option #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeCustomOutstationItem(cItem.id)}
                              className="text-slate-400 hover:text-rose-600 p-0.5"
                              title="Remove option"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[11px] text-slate-600">Option Name (खर्च का नाम) *</Label>
                              <Input
                                placeholder="e.g. Client Gift, Wi-Fi, Parking"
                                value={cItem.name}
                                onChange={(e) => updateCustomOutstationItem(cItem.id, { name: e.target.value })}
                                className="mt-1 h-8 text-xs font-semibold"
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] text-slate-600">Amount (₹) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={cItem.amount}
                                onChange={(e) => updateCustomOutstationItem(cItem.id, { amount: e.target.value })}
                                className="mt-1 h-8 text-xs font-bold"
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-[11px] text-slate-600">Note / Details (विवरण - Optional)</Label>
                            <Input
                              placeholder="Any details for HR approval..."
                              value={cItem.description}
                              onChange={(e) => updateCustomOutstationItem(cItem.id, { description: e.target.value })}
                              className="mt-1 h-8 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-slate-500">Bill / Receipt (Optional)</Label>
                            <Input
                              type="file"
                              accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf,image/jpeg,image/png,image/bmp,image/webp,application/pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const check = validateReceiptFile(file);
                                  if (!check.valid) {
                                    toast({ title: 'Invalid File', description: check.error, variant: 'destructive' });
                                    e.target.value = '';
                                    updateCustomOutstationItem(cItem.id, { file: null });
                                    return;
                                  }
                                  updateCustomOutstationItem(cItem.id, { file });
                                } else {
                                  updateCustomOutstationItem(cItem.id, { file: null });
                                }
                              }}
                              className="h-8 text-[11px] cursor-pointer"
                            />
                            {cItem.file && (
                              <div className="flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                                <span className="truncate max-w-[260px]">✓ {cItem.file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => updateCustomOutstationItem(cItem.id, { file: null })}
                                  className="text-rose-600 font-bold"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sub-Card 6: DA (Daily Allowance / दैनिक भत्ता) */}
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-amber-700" />
                      <span className="font-bold text-xs text-amber-950">6. DA (Daily Allowance / दैनिक भत्ता)</span>
                    </div>
                    <div className="flex items-center gap-1 bg-amber-100 p-0.5 rounded text-[11px]">
                      <button
                        type="button"
                        onClick={() => setDaMode('per_day')}
                        className={`px-2 py-0.5 rounded font-semibold ${daMode === 'per_day' ? 'bg-white text-amber-900 shadow-xs' : 'text-amber-700'}`}
                      >
                        Per Day Rate
                      </button>
                      <button
                        type="button"
                        onClick={() => setDaMode('direct')}
                        className={`px-2 py-0.5 rounded font-semibold ${daMode === 'direct' ? 'bg-white text-amber-900 shadow-xs' : 'text-amber-700'}`}
                      >
                        Direct Amount
                      </button>
                    </div>
                  </div>

                  {daMode === 'per_day' ? (
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <div>
                        <Label className="text-[11px] text-amber-900">Trip Days (दिन)</Label>
                        <Input value={`${tripDays} Days`} disabled className="mt-1 h-8 text-xs bg-amber-100/50 font-bold text-amber-950" />
                      </div>
                      <div>
                        <Label className="text-[11px] text-amber-900">DA Rate (₹ / Day)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={daDailyRate}
                          onChange={(e) => setDaDailyRate(e.target.value)}
                          className="mt-1 h-8 text-xs font-bold bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-amber-900">Total DA (₹)</Label>
                        <Input
                          value={`₹${valDA.toFixed(2)}`}
                          disabled
                          className="mt-1 h-8 text-xs bg-amber-100/50 font-bold text-amber-950"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-[11px] text-amber-900">Direct DA Amount (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 2000"
                        value={daCustomAmount}
                        onChange={(e) => setDaCustomAmount(e.target.value)}
                        className="mt-1 h-8 text-xs font-bold bg-white"
                      />
                    </div>
                  )}
                </div>

                {/* Real-time Outstation Summary Card */}
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-indigo-900 block">Outstation Tour Total Claim</span>
                      <span className="text-[11px] text-slate-500">
                        {outFromCity || 'Start'} → {outToCity || 'End'} ({tripDays} Days)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-extrabold text-indigo-950">₹{calculatedOutstationGross.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Micro Breakdown Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-indigo-100 text-[10px]">
                    {valTravel > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">Travel: ₹{valTravel}</span>}
                    {valHotel > 0 && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium">Hotel: ₹{valHotel}</span>}
                    {valFood > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">Food: ₹{valFood}</span>}
                    {valOther > 0 && <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 font-medium">Other: ₹{valOther}</span>}
                    {customItems.map((c) => {
                      const amt = parseFloat(c.amount) || 0;
                      return amt > 0 ? (
                        <span key={c.id} className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-medium">
                          {c.name || 'Custom'}: ₹{amt}
                        </span>
                      ) : null;
                    })}
                    {valDA > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">DA: ₹{valDA}</span>}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {editingExpense ? 'Updating Entry...' : 'Adding to Card...'}
                  </>
                ) : editingExpense ? (
                  'Save Entry Changes'
                ) : findOpenDraftCard(
                    claimType === 'local' ? 'travel_km' : 'outstation',
                    claimType === 'local' ? localDate : outStartDate
                  ) ? (
                  `Add Entry to Monthly ${claimType === 'local' ? 'Local' : 'Outstation'} Card`
                ) : (
                  `Create Monthly ${claimType === 'local' ? 'Local' : 'Outstation'} Card (Draft)`
                )}
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= UNIFIED EXPENSE DETAIL & HISTORY MODAL ================= */}
      <Dialog open={!!selectedDetailRecord} onOpenChange={(open) => !open && setSelectedDetailRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              {selectedDetailRecord?.expense_type === 'outstation' ? (
                <Plane className="h-5 w-5 text-indigo-600" />
              ) : selectedDetailRecord?.expense_type === 'travel_km' ? (
                <Bike className="h-5 w-5 text-amber-600" />
              ) : (
                <Receipt className="h-5 w-5 text-orange-600" />
              )}
              {selectedDetailRecord?.expense_type === 'outstation'
                ? 'Outstation Monthly Card & History'
                : selectedDetailRecord?.expense_type === 'travel_km'
                ? 'Local Monthly Card & History'
                : 'Expense Claim Details & History'}
            </DialogTitle>
            <DialogDescription>
              {selectedDetailRecord && (() => {
                const count = getNormalizedEntries(selectedDetailRecord).length;
                if (selectedDetailRecord.expense_type === 'outstation') {
                  return count > 1
                    ? `${count} Outstation trips combined in this monthly card`
                    : `${selectedDetailRecord?.travel_from || ''} → ${selectedDetailRecord?.travel_to || ''}${
                        selectedDetailRecord?.outstation_details?.trip_days
                          ? ` (${selectedDetailRecord.outstation_details.trip_days} Days)`
                          : ''
                      }`;
                }
                if (selectedDetailRecord.expense_type === 'travel_km') {
                  return count > 1
                    ? `${count} Daily local travel entries in this monthly card • Total ${selectedDetailRecord.distance_km} KM`
                    : selectedDetailRecord.category_name;
                }
                return selectedDetailRecord.category_name;
              })()}
            </DialogDescription>
          </DialogHeader>

          {selectedDetailRecord && (() => {
            const modalEntries = getNormalizedEntries(selectedDetailRecord);
            const isEditable = canEditExpense(selectedDetailRecord);
            return (
            <div className="space-y-4 pt-1">
              {/* Tracking Number & Overview Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="col-span-2 sm:col-span-3 flex items-center justify-between gap-2 pb-2 border-b border-slate-200 flex-wrap">
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5 text-orange-600" /> Claim Tracking No.
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedDetailRecord.claim_number ? (
                      <Badge className="bg-slate-900 text-white hover:bg-slate-900 font-mono text-xs px-2.5 py-0.5 tracking-wider">
                        #{selectedDetailRecord.claim_number}
                      </Badge>
                    ) : (
                      <span className="text-[11px] font-medium text-orange-600 italic">
                        Draft — HR ko bhejne par generate hoga
                      </span>
                    )}
                    {selectedDetailRecord.status === 'draft' && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openAddEntryToCard(selectedDetailRecord)}
                        className="h-7 text-xs px-2.5 gap-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Entry
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block">Card Month / Latest Date:</span>
                  <span className="font-semibold text-slate-800">
                    {format(parseISO(selectedDetailRecord.expense_date), 'dd MMM yyyy')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Entries Inside Card:</span>
                  <span className="font-semibold text-slate-800">
                    {modalEntries.length} {selectedDetailRecord.expense_type === 'outstation' ? (modalEntries.length === 1 ? 'Trip' : 'Trips') : (modalEntries.length === 1 ? 'Entry' : 'Entries')}
                    {selectedDetailRecord.expense_type === 'travel_km' ? ` (${selectedDetailRecord.distance_km} KM)` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Current Status:</span>
                  <div className="mt-0.5">{getStatusBadge(selectedDetailRecord.status)}</div>
                </div>
                {selectedDetailRecord.rejection_reason && (
                  <div className="col-span-2 sm:col-span-3 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                    Rejection Reason: {selectedDetailRecord.rejection_reason}
                  </div>
                )}
              </div>

              {/* Daily Local / Manual Entries List */}
              {selectedDetailRecord.expense_type !== 'outstation' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Local Daily Entries ({modalEntries.length})
                    </h4>
                    {selectedDetailRecord.status === 'draft' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openAddEntryToCard(selectedDetailRecord)}
                        className="h-7 text-xs px-2.5 gap-1 border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Another Day Entry
                      </Button>
                    )}
                  </div>

                  {modalEntries.map((entry: any, idx: number) => {
                    const vLabel =
                      entry.vehicle_type === 'car'
                        ? 'Car'
                        : entry.vehicle_type === 'auto'
                        ? 'Cab / Auto'
                        : 'Bike';
                    return (
                      <div key={entry.id || idx} className="p-3 border border-slate-200 rounded-xl bg-white space-y-2 text-xs shadow-xs">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-amber-50 text-amber-800 border-amber-200 font-bold text-[10px]">
                              #{idx + 1} • {entry.expense_date ? format(parseISO(entry.expense_date), 'dd MMM yyyy') : ''}
                            </Badge>
                            {selectedDetailRecord.expense_type === 'travel_km' && (
                              <span className="font-semibold text-slate-800">
                                {vLabel} • {entry.distance_km || 0} KM @ ₹{entry.rate_per_km || 0}/KM
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900 mr-1">
                              ₹{Number(entry.amount || 0).toLocaleString('en-IN')}
                            </span>
                            {entry.receipt_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPreviewUrl(entry.receipt_url)}
                                className="h-7 text-[11px] px-2 gap-1 text-orange-600 border-orange-200"
                              >
                                <Eye className="h-3 w-3" /> Bill
                              </Button>
                            )}
                            {isEditable && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditSubEntry(selectedDetailRecord, entry)}
                                  className="h-7 w-7 p-0 text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                                  title="Edit this entry"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteSubEntry(selectedDetailRecord, entry.id)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                  title="Delete this entry"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {(entry.travel_from || entry.travel_to) && (
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            <span>{entry.travel_from || 'Start'} → {entry.travel_to || 'End'}</span>
                          </div>
                        )}
                        {entry.description && (
                          <p className="text-[11px] text-slate-600 bg-slate-50 rounded-md px-2.5 py-1.5 border border-slate-100">
                            {entry.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Itemized Trips List (Outstation Monthly Card) */}
              {selectedDetailRecord.expense_type === 'outstation' && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Outstation Trips ({modalEntries.length})
                    </h4>
                    {selectedDetailRecord.status === 'draft' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openAddEntryToCard(selectedDetailRecord)}
                        className="h-7 text-xs px-2.5 gap-1 border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Another Outstation Trip
                      </Button>
                    )}
                  </div>

                  {modalEntries.map((trip: any, tripIdx: number) => {
                    const details = trip.outstation_details || {};
                    const items = details.items || {};
                    return (
                      <div key={trip.id || tripIdx} className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/25 space-y-2.5">
                        <div className="flex items-start justify-between gap-2 pb-2 border-b border-indigo-100 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-indigo-600 text-white border-indigo-600 text-[10px] font-bold">
                                Trip #{tripIdx + 1}
                              </Badge>
                              <span className="font-bold text-slate-900">
                                {details.trip_from || trip.travel_from || 'Origin'} → {details.trip_to || trip.travel_to || 'Destination'} ({details.trip_days || 1} Days)
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {trip.trip_start_date
                                ? format(parseISO(trip.trip_start_date), 'dd MMM yyyy')
                                : trip.expense_date
                                ? format(parseISO(trip.expense_date), 'dd MMM yyyy')
                                : ''}
                              {trip.trip_end_date ? ` to ${format(parseISO(trip.trip_end_date), 'dd MMM yyyy')}` : ''}
                              {details.purpose || trip.description ? ` • ${details.purpose || trip.description}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-indigo-900 mr-1">
                              ₹{Number(trip.amount || 0).toLocaleString('en-IN')}
                            </span>
                            {isEditable && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditSubEntry(selectedDetailRecord, trip)}
                                  className="h-7 w-7 p-0 text-slate-500 hover:text-indigo-700 hover:bg-indigo-100"
                                  title="Edit this trip"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteSubEntry(selectedDetailRecord, trip.id)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                  title="Delete this trip"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {/* 1. Travel */}
                          <div className="p-2.5 border rounded-lg bg-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Plane className="h-4 w-4 text-blue-600 shrink-0" />
                              <div>
                                <span className="font-bold text-slate-800">Travel Fare / Tickets</span>
                                <p className="text-[11px] text-slate-500">
                                  {items?.travel?.mode || 'Travel'}
                                  {items?.travel?.booking_ref ? ` • Ref: ${items.travel.booking_ref}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">
                                ₹{(items?.travel?.amount || 0).toLocaleString('en-IN')}
                              </span>
                              {items?.travel?.receipt_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewUrl(items.travel.receipt_url)}
                                  className="h-6 text-[11px] px-2 gap-1 text-blue-600 border-blue-200"
                                >
                                  <Eye className="h-3 w-3" /> Bill
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* 2. Hotel */}
                          <div className="p-2.5 border rounded-lg bg-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Hotel className="h-4 w-4 text-purple-600 shrink-0" />
                              <div>
                                <span className="font-bold text-slate-800">Hotel / Lodging</span>
                                <p className="text-[11px] text-slate-500">
                                  {items?.hotel?.hotel_name || 'Hotel Stay'}
                                  {items?.hotel?.nights ? ` • ${items.hotel.nights} Nights` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">
                                ₹{(items?.hotel?.amount || 0).toLocaleString('en-IN')}
                              </span>
                              {items?.hotel?.receipt_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewUrl(items.hotel.receipt_url)}
                                  className="h-6 text-[11px] px-2 gap-1 text-purple-600 border-purple-200"
                                >
                                  <Eye className="h-3 w-3" /> Bill
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* 3. Food */}
                          <div className="p-2.5 border rounded-lg bg-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Utensils className="h-4 w-4 text-emerald-600 shrink-0" />
                              <div>
                                <span className="font-bold text-slate-800">Food / Meals</span>
                                <p className="text-[11px] text-slate-500">
                                  {items?.food?.description || 'Tour meals'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">
                                ₹{(items?.food?.amount || 0).toLocaleString('en-IN')}
                              </span>
                              {items?.food?.receipt_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewUrl(items.food.receipt_url)}
                                  className="h-6 text-[11px] px-2 gap-1 text-emerald-600 border-emerald-200"
                                >
                                  <Eye className="h-3 w-3" /> Bill
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* 4. Other */}
                          <div className="p-2.5 border rounded-lg bg-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Shirt className="h-4 w-4 text-cyan-600 shrink-0" />
                              <div>
                                <span className="font-bold text-slate-800">Other (लॉन्ड्री & अन्य खर्च)</span>
                                <p className="text-[11px] text-slate-500">
                                  {items?.other?.description || 'Incidentals, laundry, local transit'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">
                                ₹{(items?.other?.amount || 0).toLocaleString('en-IN')}
                              </span>
                              {items?.other?.receipt_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewUrl(items.other.receipt_url)}
                                  className="h-6 text-[11px] px-2 gap-1 text-cyan-600 border-cyan-200"
                                >
                                  <Eye className="h-3 w-3" /> Bill
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Custom Created Items */}
                          {Array.isArray(items?.custom_items) &&
                            items.custom_items.map((cItem: any, idx: number) => (
                              <div
                                key={cItem.id || idx}
                                className="p-2.5 border border-orange-200 rounded-lg bg-orange-50/40 flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Tag className="h-4 w-4 text-orange-600 shrink-0" />
                                  <div>
                                    <span className="font-bold text-slate-800">{cItem.name}</span>
                                    {cItem.description && (
                                      <p className="text-[11px] text-slate-500">{cItem.description}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">
                                    ₹{Number(cItem.amount || 0).toLocaleString('en-IN')}
                                  </span>
                                  {cItem.receipt_url && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setPreviewUrl(cItem.receipt_url)}
                                      className="h-6 text-[11px] px-2 gap-1 text-orange-600 border-orange-200"
                                    >
                                      <Eye className="h-3 w-3" /> Bill
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}

                          {/* 5. DA */}
                          <div className="p-2.5 border rounded-lg bg-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Coins className="h-4 w-4 text-amber-600 shrink-0" />
                              <div>
                                <span className="font-bold text-slate-800">DA (Daily Allowance)</span>
                                <p className="text-[11px] text-slate-500">
                                  {items?.da?.days || details?.trip_days || 1} Days
                                  {items?.da?.daily_rate ? ` @ ₹${items.da.daily_rate}/day` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="font-bold text-slate-900">
                              ₹{(items?.da?.amount || 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Total Card */}
              <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">
                    Total Monthly Card Amount ({modalEntries.length} {modalEntries.length === 1 ? 'Entry' : 'Entries'})
                  </span>
                  {selectedDetailRecord.status === 'approved' || selectedDetailRecord.status === 'paid' ? (
                    <span className="text-sm font-bold text-emerald-400">
                      Approved: ₹
                      {(selectedDetailRecord.approved_amount !== undefined
                        ? selectedDetailRecord.approved_amount
                        : selectedDetailRecord.amount
                      ).toLocaleString('en-IN')}
                    </span>
                  ) : selectedDetailRecord.status === 'draft' ? (
                    <span className="text-xs text-slate-300 font-medium">Saved in Draft Card — Add more daily entries or submit month</span>
                  ) : (
                    <span className="text-xs text-amber-300 font-medium">Awaiting HR Review</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold">₹{Number(selectedDetailRecord.amount).toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Activity History Timeline */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <History className="h-3.5 w-3.5 text-orange-600" />
                  <span>Claim History & Activity</span>
                </div>
                <div className="space-y-2.5 pl-2 border-l-2 border-orange-200">
                  {getExpenseTimeline(selectedDetailRecord).map((item, idx) => (
                    <div key={idx} className="relative pl-3 text-xs">
                      <span className="w-2 h-2 rounded-full bg-orange-500 absolute -left-[5px] top-1.5 ring-2 ring-white" />
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-bold text-slate-900">{item.action}</span>
                        <span className="text-[10px] text-slate-400">
                          {item.at ? format(new Date(item.at), 'dd MMM yyyy, hh:mm a') : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        <span className="font-medium text-slate-700">{item.actor}</span>
                        {item.details ? ` — ${item.details}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Edit / Lock Footer */}
              <DialogFooter className="pt-1 flex items-center justify-between sm:justify-between gap-2 flex-wrap">
                {selectedDetailRecord.status === 'draft' ? (
                  <Button
                    type="button"
                    onClick={() => openAddEntryToCard(selectedDetailRecord)}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-semibold gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Entry to Card
                  </Button>
                ) : isEditable ? (
                  <Button
                    type="button"
                    onClick={() => openEditSubEntry(selectedDetailRecord, modalEntries[0])}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-semibold gap-1.5 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit {modalEntries.length > 1 ? 'First Entry' : 'Claim'}
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    {selectedDetailRecord.status === 'approved' || selectedDetailRecord.status === 'paid'
                      ? 'Approved card cannot be edited'
                      : 'Claim closed'}
                  </span>
                )}
                <Button type="button" variant="outline" onClick={() => setSelectedDetailRecord(null)} className="text-xs">
                  Close
                </Button>
              </DialogFooter>
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ================= MONTHLY BULK SUBMIT CONFIRMATION DIALOG ================= */}
      <Dialog open={submitMonthDialogOpen} onOpenChange={setSubmitMonthDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Send className="h-4 w-4 text-orange-600" />
              Submit Month&apos;s Expenses to HR
            </DialogTitle>
            <DialogDescription>
              {selectedMonth ? format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy') : 'Selected month'} ke sabhi saved draft expenses ek saath HR approval ke liye bheje jayenge.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 text-xs">
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-between">
              <div>
                <span className="text-slate-600 block">Monthly Cards to Submit</span>
                <span className="text-base font-bold text-slate-900">
                  {draftExpensesInMonth.length} Card{draftExpensesInMonth.length > 1 ? 's' : ''} (
                  {draftExpensesInMonth.reduce((sum, e) => sum + getNormalizedEntries(e).length, 0)} Entries)
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-600 block">Total Amount</span>
                <span className="text-base font-bold text-orange-700">₹{draftTotalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setSubmitMonthDialogOpen(false)} disabled={submittingMonth}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitMonthToHR}
              disabled={submittingMonth}
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold gap-1.5"
            >
              {submittingMonth ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending to HR...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> Confirm & Send ({draftExpensesInMonth.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= RECEIPT PREVIEW DIALOG ================= */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-sm font-bold flex items-center justify-between">
              Expense Receipt
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-normal text-orange-600 flex items-center gap-1 hover:underline"
                >
                  Open in New Tab <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-900/5">
            {previewUrl?.toLowerCase().includes('.pdf') ? (
              <iframe src={previewUrl} className="w-full h-[60vh] border rounded" />
            ) : (
              <img src={previewUrl || ''} alt="Receipt" className="max-h-[60vh] object-contain rounded shadow" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Floating Action Button (Always visible on mobile) */}
      <button
        type="button"
        onClick={() => {
          resetForm();
          setModalOpen(true);
        }}
        className="sm:hidden fixed right-4 bottom-20 z-40 flex items-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full shadow-2xl font-bold text-xs active:scale-95 transition-all border-2 border-white shadow-orange-500/30"
        title="Submit New Expense Claim"
      >
        <Plus className="w-4 h-4 stroke-[3]" />
        <span>New Claim</span>
      </button>
    </div>
  );
}
