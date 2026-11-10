import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { FileText, Eye, ExternalLink, Download, Upload, Loader2, FileCheck, Plus, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveCurrentEmployee, getCachedEmployee } from '@/lib/employee-utils';

const DOC_TYPES = ["Aadhaar", "PAN", "Offer Letter", "Appointment Letter", "Salary Slip", "Bank Proof", "Resume", "Other"];

const isImage = (name?: string) => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name || "");
const isPdf = (name?: string) => /\.pdf$/i.test(name || "");

export default function DocumentsPage({ session }: { session: any }) {
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<any>(() => getCachedEmployee());
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(() => !getCachedEmployee());
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('Other');
  const [file, setFile] = useState<File | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  
  // Document Viewer Modal State
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string>('');
  const [viewerLoading, setViewerLoading] = useState(false);

  const { toast } = useToast();

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const empData = await resolveCurrentEmployee(session?.user);

      if (empData) {
        setEmployee(empData);
        const { data: docData, error } = await supabase
          .from('employee_documents' as any)
          .select('*')
          .eq('employee_id', empData.id)
          .order('uploaded_at', { ascending: false });

        if (error) throw error;
        setDocs(docData || []);
      }
    } catch (err: any) {
      toast({ title: 'Error loading documents', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [session]);

  const getDocUrl = async (filePath: string) => {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    try {
      const { data } = await supabase.storage.from('employee-documents').createSignedUrl(filePath, 3600);
      if (data?.signedUrl) return data.signedUrl;
    } catch (e) {
      console.warn('createSignedUrl error, falling back to public url:', e);
    }
    const { data: pubData } = supabase.storage.from('employee-documents').getPublicUrl(filePath);
    return pubData?.publicUrl || '';
  };

  const handleView = async (d: any) => {
    setViewerDoc(d);
    setViewerLoading(true);
    const url = await getDocUrl(d.file_path);
    setViewerUrl(url);
    setViewerLoading(false);
  };

  const handleOpen = async (d: any) => {
    const url = await getDocUrl(d.file_path);
    if (!url) {
      toast({ title: 'Unable to open file', variant: 'destructive' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async (d: any) => {
    try {
      const url = await getDocUrl(d.file_path);
      if (!url) throw new Error('File URL not found');
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = d.file_name || 'document';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch (e) {
      console.warn('Direct blob download failed, falling back to window.open', e);
    }
    const fallbackUrl = await getDocUrl(d.file_path);
    if (fallbackUrl) window.open(fallbackUrl, '_blank');
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.id || !employee?.org_id || !file) {
      toast({ title: 'Please select a file', variant: 'destructive' });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 25MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${employee.org_id}/${employee.id}/${Date.now()}_${safeName}`;
      
      const { error: upErr } = await supabase.storage.from('employee-documents').upload(path, file);
      if (upErr) throw upErr;

      const { error: insErr } = await (supabase as any).from('employee_documents').insert({
        org_id: employee.org_id,
        employee_id: employee.id,
        doc_type: docType,
        file_path: path,
        file_name: file.name,
      });
      if (insErr) throw insErr;

      toast({ title: 'Document uploaded successfully!' });
      setFile(null);
      setDocType('Other');
      setShowUpload(false);
      loadDocuments();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative w-full max-w-lg mx-auto md:max-w-4xl pb-24 px-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">My Documents</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm font-medium">View and download your official documents</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="rounded-xl font-semibold text-xs h-9"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button
            onClick={() => setShowUpload(!showUpload)}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-sm font-semibold text-xs px-3 h-9"
          >
            {showUpload ? 'Close' : (
              <>
                <Plus className="w-4 h-4 mr-1" /> Upload
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Upload Form Modal / Collapsible */}
      {showUpload && (
        <Card className="mb-6 border-orange-200 dark:border-orange-900/40 bg-gradient-to-br from-orange-50/50 to-white dark:from-slate-900 dark:to-slate-900/80 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              <Upload className="w-4 h-4 text-orange-500" />
              Upload Document
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <form onSubmit={handleUpload} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Document Type</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="mt-1 h-9 rounded-xl bg-white dark:bg-slate-900 border-gray-200 text-xs">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 dark:text-gray-300">File (Max 25MB)</Label>
                  <Input
                    type="file"
                    className="mt-1 h-9 rounded-xl bg-white dark:bg-slate-900 border-gray-200 text-xs"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 25 * 1024 * 1024) {
                          toast({ title: 'File too large', description: 'Max file size is 25MB', variant: 'destructive' });
                          e.target.value = '';
                          setFile(null);
                        } else {
                          setFile(f);
                        }
                      } else {
                        setFile(null);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowUpload(false); setFile(null); }}
                  className="rounded-xl h-9 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={uploading || !file}
                  className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl h-9 text-xs font-semibold"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Uploading...
                    </>
                  ) : (
                    'Upload Document'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      {loading ? (
        <div className="py-12 text-center text-gray-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading documents...
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 text-center border border-gray-100 dark:border-slate-700 shadow-sm space-y-3">
          <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-slate-600" />
          <h3 className="font-bold text-gray-900 dark:text-white text-base">No Documents Found</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
            Your uploaded ID proofs, contracts, salary slips, or other documents will appear here.
          </p>
          <Button
            onClick={() => setShowUpload(true)}
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold mt-2"
          >
            Upload First Document
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d: any) => (
            <Card
              key={d.id}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-all overflow-hidden"
            >
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px] font-bold shrink-0">
                        {d.doc_type || 'Document'}
                      </Badge>
                      <span className="text-xs text-gray-400 dark:text-slate-500 font-medium">
                        {safeFormatDate(d.uploaded_at, 'dd MMM yyyy', '')}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-xs sm:max-w-md" title={d.file_name}>
                      {d.file_name}
                    </p>
                  </div>
                </div>

                {/* Actions: View, Open, Download, Delete */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-slate-700 w-full sm:w-auto justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleView(d)}
                    className="h-8 px-2.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpen(d)}
                    className="h-8 px-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(d)}
                    className="h-8 px-2.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Download
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Document Preview Modal */}
      <Dialog open={!!viewerDoc} onOpenChange={(isOpen) => { if (!isOpen) { setViewerDoc(null); setViewerUrl(''); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-4 sm:p-6 bg-white dark:bg-slate-900">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Badge variant="outline">{viewerDoc?.doc_type || 'Document'}</Badge>
                <span className="truncate max-w-sm text-sm">{viewerDoc?.file_name}</span>
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 pr-6">
              <Button size="sm" variant="outline" onClick={() => handleOpen(viewerDoc)} className="h-8 text-xs">
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open in Tab
              </Button>
              <Button size="sm" onClick={() => handleDownload(viewerDoc)} className="h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white">
                <Download className="w-3.5 h-3.5 mr-1" /> Download
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto flex items-center justify-center p-2 min-h-[350px] bg-slate-50 dark:bg-slate-950 rounded-2xl my-3 border border-gray-100 dark:border-slate-800">
            {viewerLoading ? (
              <div className="text-center text-sm text-muted-foreground animate-pulse flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading preview...
              </div>
            ) : !viewerUrl ? (
              <div className="text-center text-sm text-red-500">Unable to load document preview.</div>
            ) : isImage(viewerDoc?.file_name) ? (
              <img src={viewerUrl} alt={viewerDoc?.file_name} className="max-h-[70vh] max-w-full object-contain rounded-xl shadow" />
            ) : isPdf(viewerDoc?.file_name) ? (
              <iframe src={viewerUrl} title={viewerDoc?.file_name} className="w-full h-[65vh] rounded-xl border-0" />
            ) : (
              <div className="text-center p-6 space-y-3">
                <FileText className="w-16 h-16 mx-auto text-orange-500 opacity-60" />
                <p className="text-sm font-medium">{viewerDoc?.file_name}</p>
                <p className="text-xs text-muted-foreground">Inline preview is not supported for this file format.</p>
                <div className="flex justify-center gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => handleOpen(viewerDoc)}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open File
                  </Button>
                  <Button size="sm" onClick={() => handleDownload(viewerDoc)} className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Download className="w-3.5 h-3.5 mr-1" /> Download File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
