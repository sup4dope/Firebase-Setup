import { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, Upload, FileText, MessageCircle, History, CheckSquare, Search, Calendar, Send, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Customer, User, Todo, CustomerDocument, CustomerHistoryLog, StatusCode } from '@shared/types';
import { format, differenceInYears, parseISO } from 'date-fns';
import DaumPostcodeEmbed from 'react-daum-postcode';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// Status badge colors (sync with CustomerTable)
const STAGE_COLORS: Record<string, string> = {
  '0': 'bg-gray-600 text-white',
  '1': 'bg-purple-600 text-white',
  '2': 'bg-green-600 text-white',
  '3': 'bg-blue-600 text-white',
  '4': 'bg-orange-600 text-white',
  '5': 'bg-teal-600 text-white',
};

// Status labels
const STATUS_OPTIONS = [
  { value: '0-1', label: '단기부재' },
  { value: '0-2', label: '장기부재' },
  { value: '1-1', label: '상담대기' },
  { value: '1-2', label: '상담진행' },
  { value: '2-1', label: '계약완료(선불)' },
  { value: '2-2', label: '계약완료(후불)' },
  { value: '3-1', label: '서류취합(선불)' },
  { value: '3-2', label: '서류취합(후불)' },
  { value: '4-1', label: '신청완료(선불)' },
  { value: '4-2', label: '신청완료(외주)' },
  { value: '5-1', label: '집행완료' },
  { value: '5-2', label: '최종부결' },
];

// Processing organizations
const PROCESSING_ORGS = ['신보', '기보', '지역신보', '기은', '농협', '기타'];

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  isNewCustomer?: boolean;
  currentUser: User | null;
  users: User[];
  onSave: (customer: Partial<Customer>) => Promise<void>;
  onDelete?: (customerId: string) => Promise<void>;
}

export function CustomerDetailModal({
  isOpen,
  onClose,
  customer,
  isNewCustomer = false,
  currentUser,
  users,
  onSave,
  onDelete,
}: CustomerDetailModalProps) {
  // Form state
  const [formData, setFormData] = useState<Partial<Customer>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const [activeTab, setActiveTab] = useState('memo');
  
  // Memo state
  const [newMemo, setNewMemo] = useState('');
  const [memoHistory, setMemoHistory] = useState<Customer['memo_history']>([]);
  
  // Documents state
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<CustomerDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // History state
  const [historyLogs, setHistoryLogs] = useState<CustomerHistoryLog[]>([]);
  
  // Todos state
  const [customerTodos, setCustomerTodos] = useState<Todo[]>([]);
  const [newTodoContent, setNewTodoContent] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');

  // Initialize form data when customer changes
  useEffect(() => {
    if (customer) {
      setFormData({ ...customer });
      setMemoHistory(customer.memo_history || []);
    } else if (isNewCustomer) {
      setFormData({
        name: '',
        company_name: '',
        business_registration_number: '',
        phone: '',
        status_code: '1-1' as StatusCode,
        manager_id: currentUser?.uid || '',
        manager_name: currentUser?.name || '',
        team_id: currentUser?.team_id || '',
        team_name: currentUser?.team_name || '',
        entry_date: format(new Date(), 'yyyy-MM-dd'),
        credit_score: 0,
        over_7_years: false,
        avg_revenue_3y: 0,
        recent_sales: 0,
        approved_amount: 0,
        commission_rate: 0,
        processing_org: '기타',
      });
      setMemoHistory([]);
    }
  }, [customer, isNewCustomer, currentUser]);

  // Calculate 7-year status based on founding date
  const handleFoundingDateChange = (date: string) => {
    setFormData(prev => {
      const foundingDate = parseISO(date);
      const yearsOld = differenceInYears(new Date(), foundingDate);
      return {
        ...prev,
        founding_date: date,
        over_7_years: yearsOld > 7,
      };
    });
  };

  // Handle address selection from Daum Postcode
  const handleAddressComplete = (data: any) => {
    setFormData(prev => ({
      ...prev,
      address: data.address,
    }));
    setShowAddressSearch(false);
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customer?.id) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `customers/${customer.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const newDoc: CustomerDocument = {
        id: `doc_${Date.now()}`,
        customer_id: customer.id,
        file_name: file.name,
        file_url: downloadURL,
        file_type: file.type,
        uploaded_by: currentUser?.uid || '',
        uploaded_by_name: currentUser?.name,
        uploaded_at: new Date(),
      };

      setDocuments(prev => [...prev, newDoc]);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle document delete
  const handleDeleteDocument = async (doc: CustomerDocument) => {
    try {
      const storageRef = ref(storage, doc.file_url);
      await deleteObject(storageRef);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      if (selectedDocument?.id === doc.id) {
        setSelectedDocument(null);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  // Handle memo submit
  const handleMemoSubmit = () => {
    if (!newMemo.trim() || !currentUser) return;

    const memo = {
      date: new Date().toISOString(),
      content: newMemo.trim(),
      author: currentUser.name,
      author_id: currentUser.uid,
    };

    setMemoHistory(prev => [...(prev || []), memo]);
    setFormData(prev => ({
      ...prev,
      memo_history: [...(prev.memo_history || []), memo],
      latest_memo: newMemo.trim(),
    }));
    setNewMemo('');
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving customer:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!customer?.id || !onDelete) return;
    if (!confirm('정말로 이 고객을 삭제하시겠습니까?')) return;
    
    try {
      await onDelete(customer.id);
      onClose();
    } catch (error) {
      console.error('Error deleting customer:', error);
    }
  };

  const getStatusBadgeColor = (statusCode: string) => {
    const stage = statusCode?.charAt(0) || '1';
    return STAGE_COLORS[stage] || STAGE_COLORS['1'];
  };

  const getStatusLabel = (statusCode: string) => {
    return STATUS_OPTIONS.find(s => s.value === statusCode)?.label || statusCode;
  };

  const isSuperAdmin = currentUser?.role === 'super_admin';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-11/12 max-w-7xl h-[90vh] p-0 bg-gray-900 border-gray-700 overflow-hidden">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between gap-4 px-6 py-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl font-bold text-gray-100">
              {isNewCustomer ? '새 고객 등록' : formData.name || '고객 상세'}
            </DialogTitle>
            {!isNewCustomer && formData.status_code && (
              <Badge className={cn("text-xs", getStatusBadgeColor(formData.status_code))}>
                {getStatusLabel(formData.status_code)}
              </Badge>
            )}
            {formData.readable_id && (
              <span className="text-sm text-gray-500">{formData.readable_id}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && !isNewCustomer && onDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                data-testid="button-delete-customer"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                삭제
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={isSaving}
              data-testid="button-save-customer"
            >
              <Save className="w-4 h-4 mr-1" />
              {isSaving ? '저장 중...' : '저장'}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-modal">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content - Two Column Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Form (40%) */}
          <ScrollArea className="w-2/5 border-r border-gray-700">
            <div className="p-6 space-y-6">
              {/* 기본 정보 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">기본 정보</h3>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="name" className="text-gray-300">고객명</Label>
                    <Input
                      id="name"
                      value={formData.name || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-gray-800 border-gray-600 text-gray-100"
                      data-testid="input-customer-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="business_registration_number" className="text-gray-300">
                      사업자등록번호 <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="business_registration_number"
                      value={formData.business_registration_number || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_registration_number: e.target.value }))}
                      placeholder="000-00-00000"
                      className="bg-gray-800 border-gray-600 text-gray-100"
                      data-testid="input-business-number"
                    />
                  </div>

                  <div>
                    <Label htmlFor="company_name" className="text-gray-300">상호명</Label>
                    <Input
                      id="company_name"
                      value={formData.company_name || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                      className="bg-gray-800 border-gray-600 text-gray-100"
                      data-testid="input-company-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone" className="text-gray-300">연락처</Label>
                    <Input
                      id="phone"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="010-0000-0000"
                      className="bg-gray-800 border-gray-600 text-gray-100"
                      data-testid="input-phone"
                    />
                  </div>

                  <div>
                    <Label htmlFor="founding_date" className="text-gray-300">설립일</Label>
                    <div className="flex gap-2">
                      <Input
                        id="founding_date"
                        type="date"
                        value={formData.founding_date || ''}
                        onChange={(e) => handleFoundingDateChange(e.target.value)}
                        className="bg-gray-800 border-gray-600 text-gray-100 flex-1"
                        data-testid="input-founding-date"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="over_7_years"
                      checked={formData.over_7_years || false}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, over_7_years: !!checked }))}
                      data-testid="checkbox-over-7-years"
                    />
                    <Label htmlFor="over_7_years" className="text-gray-300">
                      7년 초과 (자동 계산됨)
                    </Label>
                  </div>

                  <div>
                    <Label className="text-gray-300">주소</Label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={formData.address || ''}
                          readOnly
                          placeholder="주소를 검색하세요"
                          className="bg-gray-800 border-gray-600 text-gray-100 flex-1"
                          data-testid="input-address"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowAddressSearch(true)}
                          className="border-gray-600"
                          data-testid="button-search-address"
                        >
                          <Search className="w-4 h-4 mr-1" />
                          검색
                        </Button>
                      </div>
                      {showAddressSearch && (
                        <div className="border border-gray-600 rounded-md overflow-hidden">
                          <DaumPostcodeEmbed
                            onComplete={handleAddressComplete}
                            style={{ height: 400 }}
                          />
                        </div>
                      )}
                      <Input
                        value={formData.address_detail || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, address_detail: e.target.value }))}
                        placeholder="상세주소"
                        className="bg-gray-800 border-gray-600 text-gray-100"
                        data-testid="input-address-detail"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 재무 정보 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">재무 정보</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="credit_score" className="text-gray-300">신용점수</Label>
                    <Input
                      id="credit_score"
                      type="number"
                      value={formData.credit_score || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, credit_score: parseInt(e.target.value) || 0 }))}
                      className="bg-gray-800 border-gray-600 text-gray-100"
                      data-testid="input-credit-score"
                    />
                  </div>

                  <div>
                    <Label htmlFor="recent_sales" className="text-gray-300">작년 매출 (억원)</Label>
                    <Input
                      id="recent_sales"
                      type="number"
                      step="0.1"
                      value={formData.recent_sales || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, recent_sales: parseFloat(e.target.value) || 0 }))}
                      className="bg-gray-800 border-gray-600 text-gray-100"
                      data-testid="input-recent-sales"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="avg_revenue_3y" className="text-gray-300">3년 평균 매출 (억원)</Label>
                    <Input
                      id="avg_revenue_3y"
                      type="number"
                      step="0.1"
                      value={formData.avg_revenue_3y || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, avg_revenue_3y: parseFloat(e.target.value) || 0 }))}
                      className="bg-gray-800 border-gray-600 text-gray-100"
                      data-testid="input-avg-revenue"
                    />
                  </div>
                </div>
              </div>

              {/* 관리 정보 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">관리 정보</h3>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="manager" className="text-gray-300">담당자</Label>
                    <Select
                      value={formData.manager_id || ''}
                      onValueChange={(value) => {
                        const selectedUser = users.find(u => u.uid === value);
                        setFormData(prev => ({
                          ...prev,
                          manager_id: value,
                          manager_name: selectedUser?.name || '',
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-100" data-testid="select-manager">
                        <SelectValue placeholder="담당자 선택" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {users.map(user => (
                          <SelectItem key={user.uid} value={user.uid} className="text-gray-100">
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="processing_org" className="text-gray-300">진행기관</Label>
                    <Select
                      value={formData.processing_org || '기타'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, processing_org: value }))}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-100" data-testid="select-processing-org">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {PROCESSING_ORGS.map(org => (
                          <SelectItem key={org} value={org} className="text-gray-100">
                            {org}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="status" className="text-gray-300">상태</Label>
                    <Select
                      value={formData.status_code || '1-1'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, status_code: value as StatusCode }))}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-100" data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {STATUS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-gray-100">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 수수료율 - 총관리자만 표시 */}
                  {isSuperAdmin && (
                    <div>
                      <Label htmlFor="commission_rate" className="text-gray-300">
                        수수료율 (%)
                        <span className="ml-2 text-xs text-yellow-500">(총관리자 전용)</span>
                      </Label>
                      <Input
                        id="commission_rate"
                        type="number"
                        step="0.1"
                        value={formData.commission_rate || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, commission_rate: parseFloat(e.target.value) || 0 }))}
                        className="bg-gray-800 border-gray-600 text-gray-100"
                        data-testid="input-commission-rate"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Right Panel - Tabs (60%) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="w-full justify-start bg-gray-800 border-b border-gray-700 rounded-none p-0 h-12">
                <TabsTrigger
                  value="memo"
                  className="flex-1 h-full rounded-none data-[state=active]:bg-gray-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500"
                  data-testid="tab-memo"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  상담 메모
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="flex-1 h-full rounded-none data-[state=active]:bg-gray-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500"
                  data-testid="tab-documents"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  문서 관리
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex-1 h-full rounded-none data-[state=active]:bg-gray-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500"
                  data-testid="tab-history"
                >
                  <History className="w-4 h-4 mr-2" />
                  변경 이력
                </TabsTrigger>
                <TabsTrigger
                  value="todos"
                  className="flex-1 h-full rounded-none data-[state=active]:bg-gray-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-500"
                  data-testid="tab-todos"
                >
                  <CheckSquare className="w-4 h-4 mr-2" />
                  할 일
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: 상담 메모 (Chat Style) */}
              <TabsContent value="memo" className="flex-1 flex flex-col mt-0 overflow-hidden">
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {(!memoHistory || memoHistory.length === 0) ? (
                      <div className="text-center text-gray-500 py-12">
                        아직 등록된 메모가 없습니다.
                      </div>
                    ) : (
                      memoHistory.map((memo, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex flex-col max-w-[80%]",
                            memo.author_id === currentUser?.uid ? "ml-auto items-end" : "items-start"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-500">{memo.author}</span>
                            <span className="text-xs text-gray-600">
                              {format(new Date(memo.date), 'yyyy-MM-dd HH:mm')}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "px-4 py-2 rounded-2xl text-sm",
                              memo.author_id === currentUser?.uid
                                ? "bg-blue-600 text-white rounded-br-sm"
                                : "bg-gray-700 text-gray-100 rounded-bl-sm"
                            )}
                          >
                            {memo.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                <div className="p-4 border-t border-gray-700 bg-gray-800/50">
                  <div className="flex gap-2">
                    <Textarea
                      value={newMemo}
                      onChange={(e) => setNewMemo(e.target.value)}
                      placeholder="메모를 입력하세요..."
                      className="bg-gray-800 border-gray-600 text-gray-100 resize-none min-h-[60px]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleMemoSubmit();
                        }
                      }}
                      data-testid="textarea-memo"
                    />
                    <Button onClick={handleMemoSubmit} className="self-end" data-testid="button-send-memo">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: 문서 관리 */}
              <TabsContent value="documents" className="flex-1 flex flex-col mt-0 overflow-hidden">
                <div className="p-4 border-b border-gray-700 bg-gray-800/30">
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isNewCustomer}
                      data-testid="button-upload-file"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploading ? '업로드 중...' : '파일 업로드'}
                    </Button>
                    {isNewCustomer && (
                      <span className="text-xs text-gray-500">저장 후 파일 업로드가 가능합니다</span>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* File List */}
                  <div className="w-1/3 border-r border-gray-700 overflow-y-auto">
                    {documents.length === 0 ? (
                      <div className="text-center text-gray-500 py-8 text-sm">
                        업로드된 문서가 없습니다
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-700">
                        {documents.map(doc => (
                          <div
                            key={doc.id}
                            className={cn(
                              "p-3 cursor-pointer hover:bg-gray-800 transition-colors",
                              selectedDocument?.id === doc.id && "bg-gray-800"
                            )}
                            onClick={() => setSelectedDocument(doc)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-200 truncate">
                                  {doc.file_name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {format(new Date(doc.uploaded_at), 'yyyy-MM-dd HH:mm')}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDocument(doc);
                                }}
                                data-testid={`button-delete-doc-${doc.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Document Preview */}
                  <div className="flex-1 bg-gray-950 flex items-center justify-center">
                    {selectedDocument ? (
                      selectedDocument.file_type === 'application/pdf' ? (
                        <iframe
                          src={selectedDocument.file_url}
                          className="w-full h-full"
                          title="PDF Preview"
                        />
                      ) : selectedDocument.file_type.startsWith('image/') ? (
                        <img
                          src={selectedDocument.file_url}
                          alt={selectedDocument.file_name}
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-gray-500">
                          <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          <p>미리보기를 지원하지 않는 파일 형식입니다</p>
                          <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => window.open(selectedDocument.file_url, '_blank')}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            다운로드
                          </Button>
                        </div>
                      )
                    ) : (
                      <div className="text-center text-gray-500">
                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p>파일을 선택하면 미리보기가 표시됩니다</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: 변경 이력 */}
              <TabsContent value="history" className="flex-1 mt-0 overflow-hidden">
                <ScrollArea className="h-full p-4">
                  {historyLogs.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">
                      변경 이력이 없습니다.
                    </div>
                  ) : (
                    <div className="relative pl-6 border-l-2 border-gray-700 space-y-6">
                      {historyLogs.map((log, index) => (
                        <div key={log.id} className="relative">
                          <div className="absolute -left-[25px] w-4 h-4 rounded-full bg-blue-600 border-2 border-gray-900" />
                          <div className="bg-gray-800 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-200">
                                {log.description}
                              </span>
                              <span className="text-xs text-gray-500">
                                {format(new Date(log.changed_at), 'yyyy-MM-dd HH:mm')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">
                              {log.changed_by_name}
                            </p>
                            {log.old_value && log.new_value && (
                              <div className="mt-2 text-xs">
                                <span className="text-red-400 line-through">{log.old_value}</span>
                                <span className="text-gray-500 mx-2">&rarr;</span>
                                <span className="text-green-400">{log.new_value}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Tab 4: 할 일 */}
              <TabsContent value="todos" className="flex-1 flex flex-col mt-0 overflow-hidden">
                <ScrollArea className="flex-1 p-4">
                  {customerTodos.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">
                      이 고객과 연동된 할 일이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customerTodos.map(todo => (
                        <div
                          key={todo.id}
                          className={cn(
                            "flex items-start gap-3 p-4 rounded-lg bg-gray-800 border border-gray-700",
                            todo.is_completed && "opacity-60"
                          )}
                        >
                          <Checkbox
                            checked={todo.is_completed}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <p className={cn(
                              "text-sm text-gray-200",
                              todo.is_completed && "line-through"
                            )}>
                              {todo.content}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                              <span>{todo.assigned_to_name}</span>
                              <span>|</span>
                              <span>마감: {todo.due_date}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {/* Add Todo Form */}
                <div className="p-4 border-t border-gray-700 bg-gray-800/50">
                  <div className="flex gap-2">
                    <Input
                      value={newTodoContent}
                      onChange={(e) => setNewTodoContent(e.target.value)}
                      placeholder="할 일을 입력하세요..."
                      className="bg-gray-800 border-gray-600 text-gray-100 flex-1"
                      data-testid="input-new-todo"
                    />
                    <Input
                      type="date"
                      value={newTodoDueDate}
                      onChange={(e) => setNewTodoDueDate(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-gray-100 w-40"
                      data-testid="input-todo-due-date"
                    />
                    <Button data-testid="button-add-todo">
                      추가
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerDetailModal;
