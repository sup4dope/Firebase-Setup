import { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, Upload, FileText, Send, Bot, User as UserIcon, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Customer, User, CustomerDocument, StatusCode } from '@shared/types';
import { format, differenceInYears, parseISO } from 'date-fns';
import DaumPostcodeEmbed from 'react-daum-postcode';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface MemoItem {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  created_at: Date;
}

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

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

// Helper to safely format dates (handles Firestore Timestamps and Date objects)
function safeFormatDate(date: any, formatStr: string): string {
  try {
    if (!date) return '';
    // Handle Firestore Timestamp
    if (date?.toDate && typeof date.toDate === 'function') {
      return format(date.toDate(), formatStr);
    }
    // Handle Date object
    if (date instanceof Date && !isNaN(date.getTime())) {
      return format(date, formatStr);
    }
    // Handle date string or number
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      return format(parsedDate, formatStr);
    }
    return '';
  } catch {
    return '';
  }
}

const ENTRY_SOURCES = ['광고랜딩명', '외주', '고객소개'];
const CARRIERS = ['SKT', 'KT', 'LG U+', '알뜰폰'];
const BUSINESS_TYPES = ['음식점', '소매업', '서비스업', '제조업', '도매업', '건설업', '운수업', 'IT/소프트웨어', '기타'];
const RETRY_OPTIONS = ['해당없음', '폐업', '이전', '변경'];
const INNOVATION_OPTIONS = ['해당없음', '배달앱', '효율화', '매출신장', '기타'];

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
  const [formData, setFormData] = useState<Partial<Customer> & {
    entry_source?: string;
    ssn_front?: string;
    ssn_back?: string;
    phone_part1?: string;
    phone_part2?: string;
    phone_part3?: string;
    carrier?: string;
    home_address?: string;
    home_address_detail?: string;
    is_home_owned?: boolean;
    is_same_as_business?: boolean;
    business_type?: string;
    business_item?: string;
    retry_type?: string;
    innovation_type?: string;
    business_address?: string;
    business_address_detail?: string;
    is_business_owned?: boolean;
    sales_y1?: number;
    sales_y2?: number;
    sales_y3?: number;
  }>({});
  
  const [isSaving, setIsSaving] = useState(false);
  const [showHomeAddressSearch, setShowHomeAddressSearch] = useState(false);
  const [showBusinessAddressSearch, setShowBusinessAddressSearch] = useState(false);
  
  // Documents state
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<CustomerDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Memo state
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const memoScrollRef = useRef<HTMLDivElement>(null);
  
  // AI Chat state
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const aiScrollRef = useRef<HTMLDivElement>(null);

  // Initialize form data
  useEffect(() => {
    if (customer) {
      const phoneParts = customer.phone?.split('-') || ['010', '', ''];
      setFormData({
        ...customer,
        entry_source: customer.entry_source || '광고랜딩명',
        ssn_front: customer.ssn_front || '',
        ssn_back: customer.ssn_back || '',
        phone_part1: phoneParts[0] || '010',
        phone_part2: phoneParts[1] || '',
        phone_part3: phoneParts[2] || '',
        carrier: customer.carrier || 'SKT',
        home_address: customer.home_address || '',
        home_address_detail: customer.home_address_detail || '',
        is_home_owned: customer.is_home_owned || false,
        is_same_as_business: customer.is_same_as_business || false,
        business_type: customer.business_type || '기타',
        business_item: customer.business_item || '',
        retry_type: customer.retry_type || '해당없음',
        innovation_type: customer.innovation_type || '해당없음',
        business_address: customer.business_address || customer.address || '',
        business_address_detail: customer.business_address_detail || '',
        is_business_owned: customer.is_business_owned || false,
        sales_y1: customer.sales_y1 || 0,
        sales_y2: customer.sales_y2 || 0,
        sales_y3: customer.sales_y3 || 0,
      });
      setMemos(customer.memo_history?.map((m, i) => ({
        id: `memo_${i}`,
        content: m.content,
        author_id: m.author_id,
        author_name: m.author_name,
        created_at: m.created_at instanceof Date ? m.created_at : new Date(m.created_at),
      })) || []);
      setDocuments(customer.documents || []);
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
        entry_source: '광고랜딩명',
        phone_part1: '010',
        carrier: 'SKT',
        business_type: '기타',
        retry_type: '해당없음',
        innovation_type: '해당없음',
      });
      setMemos([]);
      setDocuments([]);
    }
    setAiMessages([]);
  }, [customer, isNewCustomer, currentUser]);

  // Calculate 7-year status
  const handleFoundingDateChange = (date: string) => {
    const foundingDate = parseISO(date);
    const yearsOld = differenceInYears(new Date(), foundingDate);
    setFormData(prev => ({
      ...prev,
      founding_date: date,
      over_7_years: yearsOld > 7,
    }));
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const customerId = customer?.id || `new_${Date.now()}`;
      const storageRef = ref(storage, `customers/${customerId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const newDoc: CustomerDocument = {
        id: `doc_${Date.now()}`,
        customer_id: customerId,
        file_name: file.name,
        file_url: downloadURL,
        file_type: file.type,
        uploaded_by: currentUser?.uid || '',
        uploaded_by_name: currentUser?.name,
        uploaded_at: new Date(),
      };

      setDocuments(prev => [...prev, newDoc]);
      setSelectedDocument(newDoc);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle memo submit
  const handleMemoSubmit = () => {
    if (!newMemo.trim() || !currentUser) return;
    
    const memo: MemoItem = {
      id: `memo_${Date.now()}`,
      content: newMemo.trim(),
      author_id: currentUser.uid,
      author_name: currentUser.name,
      created_at: new Date(),
    };
    
    setMemos(prev => [...prev, memo]);
    setNewMemo('');
    
    setTimeout(() => {
      memoScrollRef.current?.scrollTo({ top: memoScrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  // Handle AI query submit
  const handleAISubmit = () => {
    if (!aiInput.trim()) return;
    
    const userMsg: AIMessage = {
      id: `ai_${Date.now()}`,
      role: 'user',
      content: aiInput.trim(),
      created_at: new Date(),
    };
    
    setAiMessages(prev => [...prev, userMsg]);
    setAiInput('');
    
    // Simulate AI response
    setTimeout(() => {
      const aiResponse: AIMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: 'AI 기능은 현재 개발 중입니다. 추후 고객 분석 및 추천 기능이 제공될 예정입니다.',
        created_at: new Date(),
      };
      setAiMessages(prev => [...prev, aiResponse]);
      aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 500);
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const phone = `${formData.phone_part1}-${formData.phone_part2}-${formData.phone_part3}`;
      const customerData: Partial<Customer> = {
        ...formData,
        phone,
        memo_history: memos.map(m => ({
          content: m.content,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at: m.created_at,
        })),
        documents,
      };
      await onSave(customerData);
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
    if (!window.confirm('정말 이 고객을 삭제하시겠습니까?')) return;
    
    try {
      await onDelete(customer.id);
      onClose();
    } catch (error) {
      console.error('Error deleting customer:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 bg-gray-900 border-gray-700 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>
            {isNewCustomer ? '신규 고객 등록' : `${customer?.name || '고객'} 상세정보`}
          </DialogTitle>
        </VisuallyHidden>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900/80">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-100">
              {isNewCustomer ? '신규 고객 등록' : `${customer?.name || '고객'} 상세정보`}
            </h2>
            {customer?.id && (
              <Badge variant="outline" className="text-gray-400 border-gray-600">
                {customer.id}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onDelete && customer?.id && (
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
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Main Content - 4 Section Grid */}
        <div className="flex-1 grid grid-cols-[30%_70%] h-[calc(90vh-72px)] overflow-hidden">
          
          {/* Section 1: Left Panel - Input Form */}
          <div className="border-r border-gray-700 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-5 space-y-5">
                
                {/* 유입경로 (최상단) */}
                <div className="space-y-2">
                  <Label className="text-gray-300">유입경로</Label>
                  <Select 
                    value={formData.entry_source || '광고랜딩명'} 
                    onValueChange={(v) => setFormData(p => ({ ...p, entry_source: v }))}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {ENTRY_SOURCES.map(src => (
                        <SelectItem key={src} value={src} className="text-gray-200">{src}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 고객 정보 그룹 (Border Box) */}
                <div className="border border-gray-700 rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">고객 정보</h3>
                  
                  {/* Row 2-1: 이름, 신용점수, 주민등록번호 */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[100px]">
                      <Label className="text-xs text-gray-400">이름</Label>
                      <Input 
                        value={formData.name || ''} 
                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                        className="bg-gray-800 border-gray-600 text-gray-200"
                        data-testid="input-customer-name"
                      />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs text-gray-400">신용점수</Label>
                      <Input 
                        type="number"
                        value={formData.credit_score || ''} 
                        onChange={(e) => setFormData(p => ({ ...p, credit_score: Number(e.target.value) }))}
                        className="bg-gray-800 border-gray-600 text-gray-200"
                      />
                    </div>
                    <div className="flex items-end gap-1">
                      <div className="w-24">
                        <Label className="text-xs text-gray-400">주민번호(앞)</Label>
                        <Input 
                          maxLength={6}
                          value={formData.ssn_front || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, ssn_front: e.target.value }))}
                          className="bg-gray-800 border-gray-600 text-gray-200"
                          placeholder="YYMMDD"
                        />
                      </div>
                      <span className="text-gray-500 pb-2">-</span>
                      <div className="w-24">
                        <Label className="text-xs text-gray-400">(뒤7자리)</Label>
                        <Input 
                          maxLength={7}
                          value={formData.ssn_back || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, ssn_back: e.target.value }))}
                          className="bg-gray-800 border-gray-600 text-gray-200"
                          placeholder="0000000"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2-2: 연락처, 통신사 */}
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex items-end gap-1">
                      <div className="w-16">
                        <Label className="text-xs text-gray-400">연락처</Label>
                        <Input 
                          value={formData.phone_part1 || '010'} 
                          onChange={(e) => setFormData(p => ({ ...p, phone_part1: e.target.value }))}
                          className="bg-gray-800 border-gray-600 text-gray-200"
                        />
                      </div>
                      <span className="text-gray-500 pb-2">-</span>
                      <Input 
                        maxLength={4}
                        value={formData.phone_part2 || ''} 
                        onChange={(e) => setFormData(p => ({ ...p, phone_part2: e.target.value }))}
                        className="bg-gray-800 border-gray-600 text-gray-200 w-16"
                      />
                      <span className="text-gray-500 pb-2">-</span>
                      <Input 
                        maxLength={4}
                        value={formData.phone_part3 || ''} 
                        onChange={(e) => setFormData(p => ({ ...p, phone_part3: e.target.value }))}
                        className="bg-gray-800 border-gray-600 text-gray-200 w-16"
                      />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs text-gray-400">통신사</Label>
                      <Select 
                        value={formData.carrier || 'SKT'} 
                        onValueChange={(v) => setFormData(p => ({ ...p, carrier: v }))}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {CARRIERS.map(c => (
                            <SelectItem key={c} value={c} className="text-gray-200">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 2-3: 자택주소, 상세주소, 자가여부, 상동여부 */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-400">자택주소</Label>
                        <div className="flex gap-2">
                          <Input 
                            value={formData.home_address || ''} 
                            readOnly
                            className="bg-gray-800 border-gray-600 text-gray-200 flex-1"
                            placeholder="주소 검색 버튼 클릭"
                          />
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="icon"
                            onClick={() => setShowHomeAddressSearch(true)}
                            className="border-gray-600"
                          >
                            <Search className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center">
                      <div className="flex-1 min-w-[120px]">
                        <Label className="text-xs text-gray-400">상세주소</Label>
                        <Input 
                          value={formData.home_address_detail || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, home_address_detail: e.target.value }))}
                          className="bg-gray-800 border-gray-600 text-gray-200"
                          placeholder="동/호수"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Checkbox 
                          id="home-owned"
                          checked={formData.is_home_owned || false}
                          onCheckedChange={(c) => setFormData(p => ({ ...p, is_home_owned: !!c }))}
                        />
                        <Label htmlFor="home-owned" className="text-xs text-gray-400">자가</Label>
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Checkbox 
                          id="same-address"
                          checked={formData.is_same_as_business || false}
                          onCheckedChange={(c) => {
                            setFormData(p => ({ 
                              ...p, 
                              is_same_as_business: !!c,
                              business_address: c ? p.home_address : p.business_address,
                              business_address_detail: c ? p.home_address_detail : p.business_address_detail,
                            }));
                          }}
                        />
                        <Label htmlFor="same-address" className="text-xs text-gray-400">사업장 동일</Label>
                      </div>
                    </div>
                  </div>

                  {/* Daum Postcode Modal for Home */}
                  {showHomeAddressSearch && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-white rounded-lg p-4 w-[400px]">
                        <DaumPostcodeEmbed 
                          onComplete={(data) => {
                            setFormData(p => ({ ...p, home_address: data.address }));
                            setShowHomeAddressSearch(false);
                          }}
                        />
                        <Button 
                          variant="outline" 
                          className="w-full mt-2"
                          onClick={() => setShowHomeAddressSearch(false)}
                        >
                          닫기
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 사업자 정보 그룹 (Border Box) */}
                <div className="border border-gray-700 rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3">사업자 정보</h3>
                  
                  {/* Row 3-1: 상호명, 개업일 */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[150px]">
                      <Label className="text-xs text-gray-400">상호명</Label>
                      <Input 
                        value={formData.company_name || ''} 
                        onChange={(e) => setFormData(p => ({ ...p, company_name: e.target.value }))}
                        className="bg-gray-800 border-gray-600 text-gray-200"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="w-40">
                      <Label className="text-xs text-gray-400">개업일</Label>
                      <Input 
                        type="date"
                        value={formData.founding_date || ''} 
                        onChange={(e) => handleFoundingDateChange(e.target.value)}
                        className="bg-gray-800 border-gray-600 text-gray-200"
                      />
                      {formData.over_7_years && (
                        <Badge variant="secondary" className="mt-1 text-xs bg-orange-600/20 text-orange-400">
                          7년 초과
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Row 3-2: 업종, 종목 */}
                  <div className="flex flex-wrap gap-3">
                    <div className="w-32">
                      <Label className="text-xs text-gray-400">업종</Label>
                      <Select 
                        value={formData.business_type || '기타'} 
                        onValueChange={(v) => setFormData(p => ({ ...p, business_type: v }))}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {BUSINESS_TYPES.map(t => (
                            <SelectItem key={t} value={t} className="text-gray-200">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs text-gray-400">종목</Label>
                      <Input 
                        value={formData.business_item || ''} 
                        onChange={(e) => setFormData(p => ({ ...p, business_item: e.target.value }))}
                        className="bg-gray-800 border-gray-600 text-gray-200"
                      />
                    </div>
                  </div>

                  {/* Row 3-3: 사업자등록번호, 재도전, 혁신 */}
                  <div className="flex flex-wrap gap-3">
                    <div className="w-36">
                      <Label className="text-xs text-gray-400">사업자등록번호</Label>
                      <Input 
                        value={formData.business_registration_number || ''} 
                        onChange={(e) => setFormData(p => ({ ...p, business_registration_number: e.target.value }))}
                        className="bg-gray-800 border-gray-600 text-gray-200"
                        placeholder="000-00-00000"
                      />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs text-gray-400">재도전</Label>
                      <Select 
                        value={formData.retry_type || '해당없음'} 
                        onValueChange={(v) => setFormData(p => ({ ...p, retry_type: v }))}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {RETRY_OPTIONS.map(o => (
                            <SelectItem key={o} value={o} className="text-gray-200">{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28">
                      <Label className="text-xs text-gray-400">혁신기술</Label>
                      <Select 
                        value={formData.innovation_type || '해당없음'} 
                        onValueChange={(v) => setFormData(p => ({ ...p, innovation_type: v }))}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {INNOVATION_OPTIONS.map(o => (
                            <SelectItem key={o} value={o} className="text-gray-200">{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 3-4: 사업장 소재지, 상세주소, 자가여부 */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-400">사업장 소재지</Label>
                        <div className="flex gap-2">
                          <Input 
                            value={formData.business_address || ''} 
                            readOnly
                            className="bg-gray-800 border-gray-600 text-gray-200 flex-1"
                            placeholder="주소 검색 버튼 클릭"
                          />
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="icon"
                            onClick={() => setShowBusinessAddressSearch(true)}
                            className="border-gray-600"
                            disabled={formData.is_same_as_business}
                          >
                            <Search className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center">
                      <div className="flex-1 min-w-[120px]">
                        <Label className="text-xs text-gray-400">상세주소</Label>
                        <Input 
                          value={formData.business_address_detail || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, business_address_detail: e.target.value }))}
                          className="bg-gray-800 border-gray-600 text-gray-200"
                          placeholder="동/호수"
                          disabled={formData.is_same_as_business}
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Checkbox 
                          id="business-owned"
                          checked={formData.is_business_owned || false}
                          onCheckedChange={(c) => setFormData(p => ({ ...p, is_business_owned: !!c }))}
                        />
                        <Label htmlFor="business-owned" className="text-xs text-gray-400">자가</Label>
                      </div>
                    </div>
                  </div>

                  {/* Daum Postcode Modal for Business */}
                  {showBusinessAddressSearch && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-white rounded-lg p-4 w-[400px]">
                        <DaumPostcodeEmbed 
                          onComplete={(data) => {
                            setFormData(p => ({ ...p, business_address: data.address }));
                            setShowBusinessAddressSearch(false);
                          }}
                        />
                        <Button 
                          variant="outline" 
                          className="w-full mt-2"
                          onClick={() => setShowBusinessAddressSearch(false)}
                        >
                          닫기
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Row 3-5: 매출 (최근, Y-1, Y-2, Y-3) */}
                  <div className="flex flex-wrap gap-3">
                    <div className="w-24">
                      <Label className="text-xs text-gray-400">최근매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.recent_sales || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, recent_sales: Number(e.target.value) }))}
                          className="bg-gray-800 border-gray-600 text-gray-200 pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">억</span>
                      </div>
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-gray-400">Y-1 매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.sales_y1 || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, sales_y1: Number(e.target.value) }))}
                          className="bg-gray-800 border-gray-600 text-gray-200 pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">억</span>
                      </div>
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-gray-400">Y-2 매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.sales_y2 || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, sales_y2: Number(e.target.value) }))}
                          className="bg-gray-800 border-gray-600 text-gray-200 pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">억</span>
                      </div>
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-gray-400">Y-3 매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.sales_y3 || ''} 
                          onChange={(e) => setFormData(p => ({ ...p, sales_y3: Number(e.target.value) }))}
                          className="bg-gray-800 border-gray-600 text-gray-200 pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">억</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Split into top and bottom */}
          <div className="flex flex-col h-full overflow-hidden">
            
            {/* Section 2: Top - Document Viewer (50% height) */}
            <div className="h-1/2 border-b border-gray-700 flex flex-col overflow-hidden">
              {/* Document Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
                <div className="flex items-center gap-2 flex-1 overflow-x-auto">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="border-gray-600 shrink-0"
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    {isUploading ? '업로드 중...' : '파일 업로드'}
                  </Button>
                  
                  {/* File Tabs */}
                  <div className="flex gap-1 overflow-x-auto">
                    {documents.map((doc) => (
                      <Button
                        key={doc.id}
                        variant={selectedDocument?.id === doc.id ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setSelectedDocument(doc)}
                        className={cn(
                          "shrink-0 max-w-[150px]",
                          selectedDocument?.id === doc.id 
                            ? "bg-blue-600/20 text-blue-400" 
                            : "text-gray-400"
                        )}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        <span className="truncate">{doc.file_name}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Document Viewer */}
              <div className="flex-1 p-4 overflow-auto bg-gray-950/50">
                {selectedDocument ? (
                  <div className="h-full flex items-center justify-center">
                    {selectedDocument.file_type.includes('pdf') ? (
                      <iframe 
                        src={selectedDocument.file_url} 
                        className="w-full h-full rounded border border-gray-700"
                        title={selectedDocument.file_name}
                      />
                    ) : selectedDocument.file_type.includes('image') ? (
                      <img 
                        src={selectedDocument.file_url} 
                        alt={selectedDocument.file_name}
                        className="max-w-full max-h-full object-contain rounded"
                      />
                    ) : (
                      <div className="text-gray-500 text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                        <p>미리보기를 지원하지 않는 파일 형식입니다</p>
                        <a 
                          href={selectedDocument.file_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline mt-2 inline-block"
                        >
                          다운로드
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <Upload className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                      <p>파일을 업로드하세요</p>
                      <p className="text-xs text-gray-600 mt-1">PDF, PNG, JPG 지원</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Section - Split into 2 columns */}
            <div className="h-1/2 flex overflow-hidden">
              
              {/* Section 3: Memo Chat (Left 50%) */}
              <div className="w-1/2 border-r border-gray-700 flex flex-col overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-700 bg-gray-800/30">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    상담 메모
                  </h3>
                </div>
                
                {/* Memo Messages */}
                <div ref={memoScrollRef} className="flex-1 overflow-auto p-3 space-y-3 bg-gray-900/50">
                  {memos.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <p className="text-sm">상담 메모가 없습니다</p>
                    </div>
                  ) : (
                    memos.map((memo) => (
                      <div key={memo.id} className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-blue-400">{memo.author_name}</span>
                          <span className="text-xs text-gray-500">
                            {safeFormatDate(memo.created_at, 'MM/dd HH:mm')}
                          </span>
                        </div>
                        <div className="bg-blue-600/20 border border-blue-600/30 rounded-lg px-3 py-2 max-w-[90%]">
                          <p className="text-sm text-gray-200 whitespace-pre-wrap">{memo.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Memo Input */}
                <div className="p-3 border-t border-gray-700 bg-gray-800/30">
                  <div className="flex gap-2">
                    <Textarea
                      value={newMemo}
                      onChange={(e) => setNewMemo(e.target.value)}
                      placeholder="메모 입력..."
                      className="bg-gray-800 border-gray-600 text-gray-200 resize-none min-h-[60px]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleMemoSubmit();
                        }
                      }}
                    />
                    <Button 
                      onClick={handleMemoSubmit}
                      disabled={!newMemo.trim()}
                      size="icon"
                      className="shrink-0 self-end"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Section 4: AI Chat (Right 50%) */}
              <div className="w-1/2 flex flex-col overflow-hidden bg-gray-950/30">
                <div className="px-4 py-2 border-b border-gray-700 bg-purple-900/20">
                  <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    AI 질의
                  </h3>
                </div>
                
                {/* AI Messages */}
                <div ref={aiScrollRef} className="flex-1 overflow-auto p-3 space-y-3">
                  {aiMessages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Bot className="w-10 h-10 mx-auto mb-2 text-purple-600/50" />
                      <p className="text-sm">AI에게 질문하세요</p>
                      <p className="text-xs text-gray-600 mt-1">고객 분석 및 추천 기능</p>
                    </div>
                  ) : (
                    aiMessages.map((msg) => (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "flex flex-col",
                          msg.role === 'user' ? 'items-end' : 'items-start'
                        )}
                      >
                        <div className={cn(
                          "rounded-lg px-3 py-2 max-w-[90%]",
                          msg.role === 'user' 
                            ? "bg-purple-600/30 border border-purple-600/40" 
                            : "bg-gray-700/50 border border-gray-600/50"
                        )}>
                          <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <span className="text-xs text-gray-500 mt-1">
                          {safeFormatDate(msg.created_at, 'HH:mm')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                
                {/* AI Input */}
                <div className="p-3 border-t border-gray-700 bg-purple-900/10">
                  <div className="flex gap-2">
                    <Textarea
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="AI에게 질문하기..."
                      className="bg-gray-800 border-gray-600 text-gray-200 resize-none min-h-[60px]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAISubmit();
                        }
                      }}
                    />
                    <Button 
                      onClick={handleAISubmit}
                      disabled={!aiInput.trim()}
                      size="icon"
                      className="shrink-0 self-end bg-purple-600 hover:bg-purple-700"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
