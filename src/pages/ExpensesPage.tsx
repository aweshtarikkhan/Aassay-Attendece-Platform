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
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
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
  Paperclip
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee, getCachedEmployee } from '@/lib/employee-utils';

export interface ExpenseRecord {
  id: string;
  org_id: string;
  employee_id: string;
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
  created_at: string;
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

  // New Claim Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Claim Type: 'local' (लोकल) vs 'outstation' (आउट स्टेशन)
  const [claimType, setClaimType] = useState<'local' | 'outstation'>('local');

  // ================= Form Fields - LOCAL (लोकल) =================
  const [localVehicle, setLocalVehicle] = useState<'bike' | 'car' | 'auto'>('bike');
  const [localDate, setLocalDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [localFrom, setLocalFrom] = useState('');
  const [localTo, setLocalTo] = useState('');
  const [localKM, setLocalKM] = useState<string>('');
  const [localPurpose, setLocalPurpose] = useState('');
  const [localReceiptFile, setLocalReceiptFile] = useState<File | null>(null);

  // ================= Form Fields - OUTSTATION (आउट स्टेशन) =================
  const [outFromCity, setOutFromCity] = useState('');
  const [outToCity, setOutToCity] = useState('');
  const [outStartDate, setOutStartDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [outEndDate, setOutEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [outPurpose, setOutPurpose] = useState('');

  // 1. Travel Fare (ट्रेवलिंग बिल)
  const [travelMode, setTravelMode] = useState('Train');
  const [travelBookingRef, setTravelBookingRef] = useState('');
  const [travelAmount, setTravelAmount] = useState<string>('');
  const [travelBillFile, setTravelBillFile] = useState<File | null>(null);

  // 2. Hotel / Stay (होटल बिल)
  const [hotelName, setHotelName] = useState('');
  const [hotelNights, setHotelNights] = useState<string>('1');
  const [hotelAmount, setHotelAmount] = useState<string>('');
  const [hotelBillFile, setHotelBillFile] = useState<File | null>(null);

  // 3. Food / Meals (फूड बिल)
  const [foodDesc, setFoodDesc] = useState('');
  const [foodAmount, setFoodAmount] = useState<string>('');
  const [foodBillFile, setFoodBillFile] = useState<File | null>(null);

  // 4. Other - Laundry & Other Expenses (लॉन्ड्री एंड अदर एक्सपेंसेस)
  const [otherDesc, setOtherDesc] = useState('');
  const [otherAmount, setOtherAmount] = useState<string>('');
  const [otherBillFile, setOtherBillFile] = useState<File | null>(null);

  // 5. DA (Daily Allowance / दैनिक भत्ता)
  const [daMode, setDaMode] = useState<'per_day' | 'direct'>('per_day');
  const [daDailyRate, setDaDailyRate] = useState<string>('500');
  const [daCustomAmount, setDaCustomAmount] = useState<string>('');

  // Receipt Preview Dialog
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Outstation Breakdown View Modal
  const [selectedOutstationRecord, setSelectedOutstationRecord] = useState<ExpenseRecord | null>(null);

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
      setExpenses((expList as any) || []);
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
  const valDA = calculatedDaAmount();
  const calculatedOutstationGross = Math.round((valTravel + valHotel + valFood + valOther + valDA) * 100) / 100;

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

  // Submit Claim Handler
  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.id || !employee?.org_id) return;

    setSubmitting(true);
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    try {
      if (claimType === 'local') {
        // Validation for Local
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

        let uploadedUrl: string | null = null;
        if (localReceiptFile) {
          uploadedUrl = await uploadReceipt(localReceiptFile, 'local');
        }

        const vehicleLabels: Record<string, string> = {
          bike: 'Bike (2-Wheeler)',
          car: 'Car (4-Wheeler)',
          auto: 'Cab / Auto',
        };

        const payload: any = {
          org_id: employee.org_id,
          employee_id: employee.id,
          category_name: `Local Travel (${vehicleLabels[localVehicle] || localVehicle})`,
          expense_type: 'travel_km',
          expense_date: localDate,
          amount: calculatedLocalAmount,
          vehicle_type: localVehicle,
          distance_km: parsedLocalKM,
          rate_per_km: currentLocalRate,
          travel_from: localFrom.trim() || null,
          travel_to: localTo.trim() || null,
          description: localPurpose.trim() || `Local travel by ${vehicleLabels[localVehicle] || localVehicle}`,
          receipt_url: uploadedUrl,
          status: 'submitted',
        };

        const { error } = await supabase.from('employee_expenses' as any).insert(payload);
        if (error) throw error;

        toast({
          title: 'Local Travel Claim Submitted!',
          description: `₹${calculatedLocalAmount.toFixed(2)} (${parsedLocalKM} KM via ${vehicleLabels[localVehicle]}) submitted for HR approval.`,
        });

      } else {
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

        if (outStartDate > todayStr || outEndDate > todayStr) {
          toast({
            title: 'Future Date Not Allowed',
            description: 'Travel dates cannot be in the future. Please select completed or current trip dates.',
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

        if (calculatedOutstationGross <= 0) {
          toast({
            title: 'Amount Required',
            description: 'Please enter at least one expense amount (Travel, Hotel, Food, Other, or DA).',
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

        const uploadResults = await Promise.all(uploadTasks);
        const urlMap: Record<string, string | null> = {};
        uploadResults.forEach(r => { urlMap[r.key] = r.url; });

        const receiptsList: Array<{ type: string; label: string; url: string }> = [];
        if (urlMap['travel']) receiptsList.push({ type: 'travel', label: 'Travel Ticket', url: urlMap['travel']! });
        if (urlMap['hotel']) receiptsList.push({ type: 'hotel', label: 'Hotel Bill', url: urlMap['hotel']! });
        if (urlMap['food']) receiptsList.push({ type: 'food', label: 'Food Bills', url: urlMap['food']! });
        if (urlMap['other']) receiptsList.push({ type: 'other', label: 'Other / Laundry Bills', url: urlMap['other']! });

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
              receipt_url: urlMap['travel'] || null,
            },
            hotel: {
              hotel_name: hotelName.trim() || null,
              nights: parseInt(hotelNights) || 1,
              amount: valHotel,
              receipt_url: urlMap['hotel'] || null,
            },
            food: {
              description: foodDesc.trim() || null,
              amount: valFood,
              receipt_url: urlMap['food'] || null,
            },
            other: {
              description: otherDesc.trim() || null,
              amount: valOther,
              receipt_url: urlMap['other'] || null,
            },
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

        const summaryDesc = `${outFromCity.trim()} → ${outToCity.trim()} (${tripDays} Days) | Travel: ₹${valTravel}, Hotel: ₹${valHotel}, Food: ₹${valFood}, Other: ₹${valOther}, DA: ₹${valDA}${outPurpose.trim() ? ` — ${outPurpose.trim()}` : ''}`;

        const payload: any = {
          org_id: employee.org_id,
          employee_id: employee.id,
          category_name: 'Outstation Travel',
          expense_type: 'outstation',
          expense_date: outStartDate,
          trip_start_date: outStartDate,
          trip_end_date: outEndDate,
          amount: calculatedOutstationGross,
          travel_from: outFromCity.trim(),
          travel_to: outToCity.trim(),
          description: summaryDesc,
          receipt_url: primaryReceiptUrl,
          outstation_details: outstationDetails,
          status: 'submitted',
        };

        const { error } = await supabase.from('employee_expenses' as any).insert(payload);
        if (error) throw error;

        toast({
          title: 'Outstation Travel Claim Submitted!',
          description: `₹${calculatedOutstationGross.toLocaleString('en-IN')} for ${tripDays} days trip (${outFromCity} → ${outToCity}) submitted for HR approval.`,
        });
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
    setLocalKM('');
    setLocalFrom('');
    setLocalTo('');
    setLocalPurpose('');
    setLocalReceiptFile(null);

    setOutFromCity('');
    setOutToCity('');
    setOutPurpose('');
    setTravelBookingRef('');
    setTravelAmount('');
    setTravelBillFile(null);
    setHotelName('');
    setHotelNights('1');
    setHotelAmount('');
    setHotelBillFile(null);
    setFoodDesc('');
    setFoodAmount('');
    setFoodBillFile(null);
    setOtherDesc('');
    setOtherAmount('');
    setOtherBillFile(null);
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
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-5 pb-32">
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
            className="flex-1 sm:flex-initial bg-orange-600 hover:bg-orange-700 text-white gap-1.5 shadow-sm h-9 text-xs font-semibold px-3 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" /> New Claim
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Claimed</p>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5">₹{totalClaimed.toLocaleString('en-IN')}</h3>
            <p className="text-[11px] text-slate-400 mt-1">{filteredList.length} claims</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-amber-600 uppercase">Pending Review</p>
            <h3 className="text-xl font-bold text-amber-700 mt-0.5">₹{totalPending.toLocaleString('en-IN')}</h3>
            <p className="text-[11px] text-slate-400 mt-1">Awaiting HR</p>
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

      {/* Expense History Table / Cards */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base font-semibold text-slate-900">Claim History</CardTitle>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs bg-white">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {filteredList.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Receipt className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium">No expenses submitted for this month.</p>
              <p className="text-xs text-slate-400 mt-1">Click "+ New Expense Claim" above to log a Local or Outstation claim.</p>
            </div>
          ) : (
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
                {filteredList.map((exp) => (
                  <TableRow key={exp.id} className="hover:bg-slate-50/70">
                    <TableCell className="text-xs text-slate-600 font-medium whitespace-nowrap">
                      {format(parseISO(exp.expense_date), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      {exp.expense_type === 'outstation' ? (
                        <div>
                          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 gap-1 font-semibold text-[11px]">
                            <Plane className="h-3 w-3" /> Outstation Travel
                          </Badge>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {exp.travel_from && exp.travel_to ? `${exp.travel_from} → ${exp.travel_to}` : 'Tour Trip'}
                          </div>
                        </div>
                      ) : exp.expense_type === 'travel_km' ? (
                        <div>
                          <Badge className="bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 gap-1 font-semibold text-[11px]">
                            {exp.vehicle_type === 'car' ? <Car className="h-3 w-3" /> : exp.vehicle_type === 'auto' ? <Bus className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
                            Local ({exp.vehicle_type === 'car' ? 'Car' : exp.vehicle_type === 'auto' ? 'Cab/Auto' : 'Bike'})
                          </Badge>
                          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                            {exp.distance_km} KM @ ₹{exp.rate_per_km}/KM
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
                            {exp.outstation_details?.trip_from || exp.travel_from} → {exp.outstation_details?.trip_to || exp.travel_to} ({exp.outstation_details?.trip_days || 1} Days)
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {exp.outstation_details?.purpose || exp.description || 'Outstation official trip'}
                          </div>
                        </div>
                      ) : exp.expense_type === 'travel_km' ? (
                        <div>
                          <div className="flex items-center gap-1 truncate font-medium text-slate-800">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{exp.travel_from || 'Start'} → {exp.travel_to || 'End'}</span>
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
                      {exp.expense_type === 'outstation' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOutstationRecord(exp)}
                          className="h-7 text-xs px-2 gap-1 text-indigo-700 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Breakdown
                        </Button>
                      ) : exp.receipt_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewUrl(exp.receipt_url!)}
                          className="h-7 w-7 p-0 text-orange-600 hover:text-orange-800 hover:bg-orange-50 mx-auto"
                          title="View Receipt"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {exp.status === 'submitted' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(exp.id)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                          title="Cancel Claim"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ================= NEW CLAIM DIALOG (Local vs Outstation) ================= */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-600" /> New Expense Claim
            </DialogTitle>
            <DialogDescription>
              Select whether this is a Local trip or an Outstation tour claim.
            </DialogDescription>
          </DialogHeader>

          {/* Top 2 Big Choice Buttons: Local vs Outstation */}
          <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setClaimType('local')}
              className={`p-3 rounded-lg text-left transition-all border ${
                claimType === 'local'
                  ? 'bg-white text-orange-700 border-orange-300 shadow-sm ring-1 ring-orange-500'
                  : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Bike className="h-4 w-4 text-orange-600" /> Local (लोकल)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Bike, Car या Cab/Auto से स्थानीय यात्रा (KM दर अनुसार)
              </p>
            </button>

            <button
              type="button"
              onClick={() => setClaimType('outstation')}
              className={`p-3 rounded-lg text-left transition-all border ${
                claimType === 'outstation'
                  ? 'bg-white text-indigo-700 border-indigo-300 shadow-sm ring-1 ring-indigo-500'
                  : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Plane className="h-4 w-4 text-indigo-600" /> Outstation (आउट स्टेशन)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ट्रेवल टिकट, होटल, भोजन, DA और अन्य टूर खर्चे (ऑप्शनल बिल)
              </p>
            </button>
          </div>

          <form onSubmit={handleSubmitClaim} className="space-y-4 pt-2">
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
                  {localReceiptFile && (
                    <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-700 font-medium">
                      <span className="truncate max-w-[320px]">✓ {localReceiptFile.name} ({(localReceiptFile.size / 1024).toFixed(1)} KB)</span>
                      <button type="button" onClick={() => setLocalReceiptFile(null)} className="text-rose-600 font-bold px-1">✕</button>
                    </div>
                  )}
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Trip Start Date (प्रारंभ तिथि) *</Label>
                      <Input
                        type="date"
                        value={outStartDate}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => {
                          setOutStartDate(e.target.value);
                          if (outEndDate < e.target.value) setOutEndDate(e.target.value);
                        }}
                        required
                        className="mt-1 h-9 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Trip End Date (समाप्ति तिथि) *</Label>
                      <Input
                        type="date"
                        value={outEndDate}
                        min={outStartDate}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => setOutEndDate(e.target.value)}
                        required
                        className="mt-1 h-9 text-xs bg-white"
                      />
                    </div>
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

                {/* Sub-Card 5: DA (Daily Allowance / दैनिक भत्ता) */}
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-amber-700" />
                      <span className="font-bold text-xs text-amber-950">5. DA (Daily Allowance / दैनिक भत्ता)</span>
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
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting Claim...
                  </>
                ) : (
                  `Submit ${claimType === 'local' ? 'Local' : 'Outstation'} Claim for HR Approval`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= OUTSTATION BREAKDOWN MODAL ================= */}
      <Dialog open={!!selectedOutstationRecord} onOpenChange={(open) => !open && setSelectedOutstationRecord(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-indigo-900">
              <Plane className="h-5 w-5 text-indigo-600" /> Outstation Tour Claim Breakdown
            </DialogTitle>
            <DialogDescription>
              {selectedOutstationRecord?.travel_from} → {selectedOutstationRecord?.travel_to}
              {selectedOutstationRecord?.outstation_details?.trip_days && ` (${selectedOutstationRecord.outstation_details.trip_days} Days)`}
            </DialogDescription>
          </DialogHeader>

          {selectedOutstationRecord && (
            <div className="space-y-4 pt-2">
              {/* Tour Overview Banner */}
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Dates:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedOutstationRecord.trip_start_date ? format(parseISO(selectedOutstationRecord.trip_start_date), 'dd MMM yyyy') : selectedOutstationRecord.expense_date}
                    {selectedOutstationRecord.trip_end_date && ` to ${format(parseISO(selectedOutstationRecord.trip_end_date), 'dd MMM yyyy')}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Status:</span>
                  <div>{getStatusBadge(selectedOutstationRecord.status)}</div>
                </div>
                {selectedOutstationRecord.description && (
                  <div className="col-span-2 pt-1 border-t border-indigo-100 text-slate-600">
                    <span className="text-slate-500 block">Purpose / Note:</span>
                    <span className="font-medium">{selectedOutstationRecord.description}</span>
                  </div>
                )}
              </div>

              {/* Itemized Cards */}
              <div className="space-y-2 text-xs">
                {/* 1. Travel */}
                <div className="p-3 border rounded-lg bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-blue-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800">Travel Fare / Tickets</span>
                      <p className="text-[11px] text-slate-500">
                        {selectedOutstationRecord.outstation_details?.items?.travel?.mode || 'Travel'}
                        {selectedOutstationRecord.outstation_details?.items?.travel?.booking_ref ? ` • Ref: ${selectedOutstationRecord.outstation_details.items.travel.booking_ref}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      ₹{(selectedOutstationRecord.outstation_details?.items?.travel?.amount || 0).toLocaleString('en-IN')}
                    </span>
                    {selectedOutstationRecord.outstation_details?.items?.travel?.receipt_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewUrl(selectedOutstationRecord.outstation_details.items.travel.receipt_url)}
                        className="h-7 text-xs px-2 gap-1 text-blue-600 border-blue-200"
                      >
                        <Eye className="h-3 w-3" /> Bill
                      </Button>
                    )}
                  </div>
                </div>

                {/* 2. Hotel */}
                <div className="p-3 border rounded-lg bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hotel className="h-4 w-4 text-purple-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800">Hotel / Lodging</span>
                      <p className="text-[11px] text-slate-500">
                        {selectedOutstationRecord.outstation_details?.items?.hotel?.hotel_name || 'Hotel Stay'}
                        {selectedOutstationRecord.outstation_details?.items?.hotel?.nights ? ` • ${selectedOutstationRecord.outstation_details.items.hotel.nights} Nights` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      ₹{(selectedOutstationRecord.outstation_details?.items?.hotel?.amount || 0).toLocaleString('en-IN')}
                    </span>
                    {selectedOutstationRecord.outstation_details?.items?.hotel?.receipt_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewUrl(selectedOutstationRecord.outstation_details.items.hotel.receipt_url)}
                        className="h-7 text-xs px-2 gap-1 text-purple-600 border-purple-200"
                      >
                        <Eye className="h-3 w-3" /> Bill
                      </Button>
                    )}
                  </div>
                </div>

                {/* 3. Food */}
                <div className="p-3 border rounded-lg bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Utensils className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800">Food / Meals</span>
                      <p className="text-[11px] text-slate-500">
                        {selectedOutstationRecord.outstation_details?.items?.food?.description || 'Tour meals'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      ₹{(selectedOutstationRecord.outstation_details?.items?.food?.amount || 0).toLocaleString('en-IN')}
                    </span>
                    {selectedOutstationRecord.outstation_details?.items?.food?.receipt_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewUrl(selectedOutstationRecord.outstation_details.items.food.receipt_url)}
                        className="h-7 text-xs px-2 gap-1 text-emerald-600 border-emerald-200"
                      >
                        <Eye className="h-3 w-3" /> Bill
                      </Button>
                    )}
                  </div>
                </div>

                {/* 4. Other */}
                <div className="p-3 border rounded-lg bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shirt className="h-4 w-4 text-cyan-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800">Other (लॉन्ड्री & अन्य खर्च)</span>
                      <p className="text-[11px] text-slate-500">
                        {selectedOutstationRecord.outstation_details?.items?.other?.description || 'Incidentals, laundry, local transit'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      ₹{(selectedOutstationRecord.outstation_details?.items?.other?.amount || 0).toLocaleString('en-IN')}
                    </span>
                    {selectedOutstationRecord.outstation_details?.items?.other?.receipt_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewUrl(selectedOutstationRecord.outstation_details.items.other.receipt_url)}
                        className="h-7 text-xs px-2 gap-1 text-cyan-600 border-cyan-200"
                      >
                        <Eye className="h-3 w-3" /> Bill
                      </Button>
                    )}
                  </div>
                </div>

                {/* 5. DA */}
                <div className="p-3 border rounded-lg bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800">DA (Daily Allowance)</span>
                      <p className="text-[11px] text-slate-500">
                        {selectedOutstationRecord.outstation_details?.items?.da?.days || selectedOutstationRecord.outstation_details?.trip_days || 1} Days
                        {selectedOutstationRecord.outstation_details?.items?.da?.daily_rate ? ` @ ₹${selectedOutstationRecord.outstation_details.items.da.daily_rate}/day` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">
                      ₹{(selectedOutstationRecord.outstation_details?.items?.da?.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Card */}
              <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Total Claimed Amount</span>
                  <span className="text-base font-bold text-emerald-400">
                    Approved: ₹{(selectedOutstationRecord.approved_amount !== undefined ? selectedOutstationRecord.approved_amount : selectedOutstationRecord.amount).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold">₹{Number(selectedOutstationRecord.amount).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          )}
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
        <span>+ Claim</span>
      </button>
    </div>
  );
}
