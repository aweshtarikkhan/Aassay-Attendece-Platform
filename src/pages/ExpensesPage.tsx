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
import { format, parseISO } from 'date-fns';
import { 
  Receipt, 
  Bike, 
  Car, 
  Bus, 
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
  ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee, getCachedEmployee } from '@/lib/employee-utils';

export interface ExpenseRecord {
  id: string;
  org_id: string;
  employee_id: string;
  category_name: string;
  expense_type: string;
  expense_date: string;
  amount: number;
  approved_amount?: number;
  vehicle_type?: string;
  distance_km?: number;
  rate_per_km?: number;
  travel_from?: string;
  travel_to?: string;
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
  const [categories, setCategories] = useState<any[]>([]);
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
  const [claimType, setClaimType] = useState<'travel' | 'bill'>('travel');

  // Form Fields - Travel
  const [travelVehicle, setTravelVehicle] = useState('bike');
  const [travelDate, setTravelDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [travelFrom, setTravelFrom] = useState('');
  const [travelTo, setTravelTo] = useState('');
  const [travelKM, setTravelKM] = useState<string>('');
  const [travelPurpose, setTravelPurpose] = useState('');

  // Form Fields - Bill / General
  const DEFAULT_CATEGORIES = [
    'Food & Meals',
    'Travel & Fuel',
    'Hotel & Accommodation',
    'Toll & Parking',
    'Client Entertainment',
    'Office Supplies & Stationery',
    'Mobile & Internet',
    'Courier & Shipping',
    'Medical & First Aid',
    'Repair & Maintenance',
    'Miscellaneous'
  ];

  const [billCategory, setBillCategory] = useState('Food & Meals');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [billDate, setBillDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [billAmount, setBillAmount] = useState<string>('');
  const [billMerchant, setBillMerchant] = useState('');
  const [billInvoiceNo, setBillInvoiceNo] = useState('');
  const [billDescription, setBillDescription] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Receipt Preview Dialog
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

        // 2. Fetch Categories
        const { data: cats } = await supabase
          .from('expense_categories' as any)
          .select('*')
          .eq('org_id', empData.org_id)
          .eq('is_active', true);
        if (cats && cats.length > 0) {
          setCategories(cats);
        }
      }

      // 3. Fetch Expenses for current employee
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

  // Real-time calculation for bike / travel claim
  const currentRate = vehicleRates[travelVehicle] || 3.50;
  const parsedKM = parseFloat(travelKM) || 0;
  const calculatedTravelAmount = Math.round(parsedKM * currentRate * 100) / 100;

  // Validate File (Max 2MB, JPG, JPEG, PNG, BMP, WEBP, PDF; GIF strictly disallowed)
  const validateReceiptFile = (file: File): { valid: boolean; error?: string } => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = file.type.toLowerCase();

    // 1. Explicitly reject GIF
    if (ext === 'gif' || mime === 'image/gif') {
      return {
        valid: false,
        error: 'GIF files are not supported. Please upload a receipt in JPG, JPEG, PNG, BMP, WEBP, or PDF format.'
      };
    }

    // 2. Strict file size cap: Max 2MB (2 * 1024 * 1024 bytes)
    const MAX_SIZE_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `File size exceeds 2MB limit (Selected: ${sizeMB} MB). Please select an image or PDF under 2MB.`
      };
    }

    // 3. Supported image types (JPG, JPEG, PNG, BMP, WEBP, and screenshots) + PDF
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
  const uploadReceipt = async (file: File): Promise<string | null> => {
    try {
      const check = validateReceiptFile(file);
      if (!check.valid) {
        toast({ title: 'Upload Rejected', description: check.error, variant: 'destructive' });
        return null;
      }
      const ext = file.name.split('.').pop();
      const fileName = `${employee.org_id}/${employee.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      
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
    try {
      let uploadedUrl: string | null = null;
      if (receiptFile) {
        uploadedUrl = await uploadReceipt(receiptFile);
      }

      const todayStr = format(new Date(), 'yyyy-MM-dd');

      if (claimType === 'travel') {
        if (travelDate > todayStr) {
          toast({
            title: 'Future Date Not Allowed',
            description: 'You cannot claim travel expenses for a future date. Please select today or a past date.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        if (!parsedKM || parsedKM <= 0) {
          toast({
            title: 'Invalid Distance',
            description: 'Please enter a valid travel distance in kilometers (KM).',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        const payload: any = {
          org_id: employee.org_id,
          employee_id: employee.id,
          category_name: 'Travel & Fuel',
          expense_type: 'travel_km',
          expense_date: travelDate,
          amount: calculatedTravelAmount,
          vehicle_type: travelVehicle,
          distance_km: parsedKM,
          rate_per_km: currentRate,
          travel_from: travelFrom.trim() || null,
          travel_to: travelTo.trim() || null,
          description: travelPurpose.trim() || null,
          receipt_url: uploadedUrl,
          status: 'submitted',
        };

        const { error } = await supabase.from('employee_expenses' as any).insert(payload);
        if (error) throw error;

        toast({
          title: 'Travel Claim Submitted!',
          description: `₹${calculatedTravelAmount.toFixed(2)} (${parsedKM} KM) submitted for HR approval.`,
        });
      } else {
        if (billDate > todayStr) {
          toast({
            title: 'Future Date Not Allowed',
            description: 'You cannot claim bill expenses for a future date. Please select today or a past date.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        const amt = parseFloat(billAmount);
        if (!amt || amt <= 0) {
          toast({
            title: 'Invalid Amount',
            description: 'Please enter a valid expense amount in ₹.',
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        const finalCategoryName = (isCustomCategory && customCategoryText.trim()) 
          ? customCategoryText.trim() 
          : (billCategory || 'Food & Meals');

        // If custom category was typed, also save to expense_categories table so it persists for the org
        if (isCustomCategory && customCategoryText.trim() && employee.org_id) {
          try {
            await supabase.from('expense_categories' as any).insert({
              org_id: employee.org_id,
              name: customCategoryText.trim(),
              code: customCategoryText.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20),
              is_active: true
            });
          } catch (_e) {}
        }

        const payload: any = {
          org_id: employee.org_id,
          employee_id: employee.id,
          category_name: finalCategoryName,
          expense_type: 'manual',
          expense_date: billDate,
          amount: amt,
          merchant_name: billMerchant.trim() || null,
          invoice_number: billInvoiceNo.trim() || null,
          description: billDescription.trim() || null,
          receipt_url: uploadedUrl,
          status: 'submitted',
        };

        const { error } = await supabase.from('employee_expenses' as any).insert(payload);
        if (error) throw error;

        toast({
          title: 'Expense Claim Submitted!',
          description: `₹${amt.toFixed(2)} (${billCategory}) submitted for HR approval.`,
        });
      }

      // Reset form & reload
      setModalOpen(false);
      setTravelKM('');
      setTravelFrom('');
      setTravelTo('');
      setTravelPurpose('');
      setBillAmount('');
      setBillMerchant('');
      setBillInvoiceNo('');
      setBillDescription('');
      setReceiptFile(null);
      setIsCustomCategory(false);
      setCustomCategoryText('');
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
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">Pending Review</Badge>;
      case 'approved':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">Approved</Badge>;
      case 'paid':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100">Paid / Disbursed</Badge>;
      case 'rejected':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100">Rejected</Badge>;
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
            Submit your daily bike travel logs, meal & hotel bills, and track your reimbursement approvals.
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
            onClick={() => setModalOpen(true)}
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
              <p className="text-xs text-slate-400 mt-1">Click "+ New Expense Claim" above to log a bike trip or bill.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead>Type & Category</TableHead>
                  <TableHead>Trip / Description</TableHead>
                  <TableHead className="text-right">Claim Amount</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center w-16">Receipt</TableHead>
                  <TableHead className="text-right w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredList.map((exp) => (
                  <TableRow key={exp.id} className="hover:bg-slate-50/70">
                    <TableCell className="text-xs text-slate-600 font-medium">
                      {format(parseISO(exp.expense_date), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-800 text-xs">
                        {exp.category_name}
                      </div>
                      {exp.expense_type === 'travel_km' && (
                        <div className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mt-0.5">
                          <Bike className="h-3 w-3" />
                          <span>{exp.distance_km} KM @ ₹{exp.rate_per_km}/KM</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-slate-600">
                      {exp.expense_type === 'travel_km' ? (
                        <div className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{exp.travel_from || 'Start'} → {exp.travel_to || 'End'}</span>
                        </div>
                      ) : (
                        <span className="truncate block">{exp.description || exp.merchant_name || '—'}</span>
                      )}
                      {exp.rejection_reason && (
                        <div className="text-rose-600 text-[11px] font-semibold mt-0.5 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Reason: {exp.rejection_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-slate-900 text-sm">
                      ₹{Number(exp.amount).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-700 text-sm">
                      {exp.status === 'approved' || exp.status === 'paid' ? (
                        `₹${Number(exp.approved_amount !== undefined ? exp.approved_amount : exp.amount).toLocaleString('en-IN')}`
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {exp.receipt_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewUrl(exp.receipt_url!)}
                          className="h-7 w-7 p-0 text-orange-600 hover:text-orange-800 hover:bg-orange-50"
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

      {/* NEW CLAIM DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-600" /> New Expense Claim
            </DialogTitle>
            <DialogDescription>
              Submit your bike journey distance or upload bills for HR verification.
            </DialogDescription>
          </DialogHeader>

          {/* Type Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setClaimType('travel')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                claimType === 'travel'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bike className="h-4 w-4" /> Bike / Travel by KM
            </button>
            <button
              type="button"
              onClick={() => setClaimType('bill')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                claimType === 'bill'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="h-4 w-4" /> Bill / Receipt
            </button>
          </div>

          <form onSubmit={handleSubmitClaim} className="space-y-4 pt-2">
            {claimType === 'travel' ? (
              <>
                {/* Vehicle Selection & Live Rate Badge */}
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-amber-950">Select Vehicle Type *</Label>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">HR Approved Rate: </span>
                      <span className="text-sm font-extrabold text-amber-950">₹{currentRate.toFixed(2)} / KM</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setTravelVehicle('bike')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                        travelVehicle === 'bike'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      <Bike className="h-4 w-4 shrink-0" />
                      <span>Bike (2W)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTravelVehicle('car')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                        travelVehicle === 'car'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      <Car className="h-4 w-4 shrink-0" />
                      <span>Car (4W)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTravelVehicle('auto')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                        travelVehicle === 'auto'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      <Bus className="h-4 w-4 shrink-0" />
                      <span>Auto / Cab</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Travel Date *</Label>
                    <Input
                      type="date"
                      value={travelDate}
                      max={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => setTravelDate(e.target.value)}
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
                      value={travelKM}
                      onChange={(e) => setTravelKM(e.target.value)}
                      required
                      className="mt-1 h-9 text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Auto Calculated Preview Card */}
                {parsedKM > 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="text-xs text-emerald-800">
                      <span>Calculation: <b>{parsedKM} KM</b> × <b>₹{currentRate}</b></span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-emerald-700 block">Total Claim Amount</span>
                      <span className="text-lg font-bold text-emerald-800">₹{calculatedTravelAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">From Location</Label>
                    <Input
                      placeholder="e.g. Office / Client A"
                      value={travelFrom}
                      onChange={(e) => setTravelFrom(e.target.value)}
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">To Location</Label>
                    <Input
                      placeholder="e.g. Client Site B"
                      value={travelTo}
                      onChange={(e) => setTravelTo(e.target.value)}
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Trip Purpose / Client Note</Label>
                  <Input
                    placeholder="e.g. Machine installation and client demo"
                    value={travelPurpose}
                    onChange={(e) => setTravelPurpose(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Expense Category *</Label>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !isCustomCategory;
                          setIsCustomCategory(nextVal);
                          if (!nextVal) {
                            setCustomCategoryText('');
                            setBillCategory('Food & Meals');
                          }
                        }}
                        className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                      >
                        {isCustomCategory ? '← Choose from List' : '+ Write Custom'}
                      </button>
                    </div>

                    {!isCustomCategory ? (
                      <select
                        value={billCategory}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setIsCustomCategory(true);
                            setCustomCategoryText('');
                          } else {
                            setBillCategory(e.target.value);
                          }
                        }}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer font-medium text-slate-800"
                      >
                        {Array.from(new Set([
                          ...categories.map((c: any) => c.name),
                          ...DEFAULT_CATEGORIES
                        ])).map((name: string) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        <option value="__custom__" className="font-bold text-orange-600">
                          + Write Custom Category...
                        </option>
                      </select>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <Input
                          placeholder="e.g. Printing, Marketing, Courier..."
                          value={customCategoryText}
                          onChange={(e) => {
                            setCustomCategoryText(e.target.value);
                            setBillCategory(e.target.value);
                          }}
                          autoFocus
                          required
                          className="h-9 text-xs font-semibold border-orange-300 focus-visible:ring-orange-500"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Expense Date *</Label>
                    <Input
                      type="date"
                      value={billDate}
                      max={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => setBillDate(e.target.value)}
                      required
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Amount (₹) *</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-2 text-slate-400 text-xs">₹</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        placeholder="0.00"
                        value={billAmount}
                        onChange={(e) => setBillAmount(e.target.value)}
                        required
                        className="pl-7 h-9 text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Vendor / Merchant Name</Label>
                    <Input
                      placeholder="e.g. Hotel Rajhans"
                      value={billMerchant}
                      onChange={(e) => setBillMerchant(e.target.value)}
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Description</Label>
                  <Textarea
                    rows={2}
                    placeholder="Brief description of the expense..."
                    value={billDescription}
                    onChange={(e) => setBillDescription(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
              </>
            )}

            {/* Receipt Upload (Applicable for both travel and bills) */}
            <div>
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span>Upload Receipt / Bill Ticket (JPG, PNG, BMP, PDF)</span>
                <span className="text-[10px] text-slate-500 font-normal">Max 2MB • No GIF</span>
              </Label>
              <Input
                type="file"
                accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf,image/jpeg,image/png,image/bmp,image/webp,application/pdf"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (!selected) {
                    setReceiptFile(null);
                    return;
                  }
                  const check = validateReceiptFile(selected);
                  if (!check.valid) {
                    toast({
                      title: 'File Not Allowed',
                      description: check.error,
                      variant: 'destructive',
                    });
                    e.target.value = '';
                    setReceiptFile(null);
                    return;
                  }
                  setReceiptFile(selected);
                }}
                className="mt-1 h-9 text-xs cursor-pointer bg-white"
              />
              {receiptFile ? (
                <div className="flex items-center justify-between mt-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-700 font-medium">
                  <span className="truncate max-w-[280px]">✓ {receiptFile.name} ({(receiptFile.size / 1024).toFixed(1)} KB)</span>
                  <button
                    type="button"
                    onClick={() => setReceiptFile(null)}
                    className="text-emerald-800 hover:text-red-600 ml-2 font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1">
                  Supports JPG, JPEG, PNG, BMP, WEBP, PDF & Screenshots. Max 2MB per file. (GIF is not supported).
                </p>
              )}
            </div>

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
                  'Submit for HR Approval'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RECEIPT PREVIEW DIALOG */}
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
        onClick={() => setModalOpen(true)}
        className="sm:hidden fixed right-4 bottom-20 z-40 flex items-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full shadow-2xl font-bold text-xs active:scale-95 transition-all border-2 border-white shadow-orange-500/30"
        title="Submit New Expense Claim"
      >
        <Plus className="w-4 h-4 stroke-[3]" />
        <span>+ Claim</span>
      </button>
    </div>
  );
}
