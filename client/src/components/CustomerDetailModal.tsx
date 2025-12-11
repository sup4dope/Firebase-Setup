import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Trash2, Upload, FileText, Send, Bot, User as UserIcon, Search, Check, Loader2, History, Clock, ArrowRight, UserCog, Lock } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import debounce from 'lodash/debounce';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Customer, User, CustomerDocument, StatusCode, CustomerHistoryLog } from '@shared/types';
import { format, differenceInYears, parseISO } from 'date-fns';
import DaumPostcodeEmbed from 'react-daum-postcode';
import { storage, getCustomerHistoryLogs } from '@/lib/firebase';
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

interface HistoryLogItem {
  id: string;
  action_type: 'status_change' | 'manager_change' | 'info_update' | 'document_upload' | 'memo_added';
  description: string;
  changed_by_name?: string;
  changed_at: Date;
  old_value?: string;
  new_value?: string;
}

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  isNewCustomer?: boolean;
  currentUser: User | null;
  users: User[];
  onSave: (customer: Partial<Customer>) => Promise<string | undefined>;
  onDelete?: (customerId: string) => Promise<void>;
  initialTab?: 'memo' | 'history';
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
const CARRIERS = ['SKT', 'KT', 'LG', 'SKT알뜰폰', 'KT알뜰폰', 'LG알뜰폰'];
const BUSINESS_TYPES = ['음식점', '소매업', '서비스업', '제조업', '도매업', '건설업', '운수업', 'IT/소프트웨어', '기타'];
const RETRY_OPTIONS = ['해당없음', '폐업', '이전', '변경'];
const INNOVATION_OPTIONS = ['해당없음', '배달앱', '효율화', '매출신장', '기타'];
const PROCESSING_ORGS = ['미등록', '신용취약', '재도전', '혁신', '일시적', '상생', '지역재단', '미소금융', '신보', '기보', '중진공', '농신보', '기업인증', '기타'];

export function CustomerDetailModal({
  isOpen,
  onClose,
  customer,
  isNewCustomer = false,
  currentUser,
  users,
  onSave,
  onDelete,
  initialTab = 'memo',
}: CustomerDetailModalProps) {
  // Role-based access control: staff users are read-only
  const isReadOnly = currentUser?.role === 'staff' && !isNewCustomer;
  
  // Active tab state for bottom panel
  const [activeBottomTab, setActiveBottomTab] = useState<'memo' | 'history'>(initialTab);
  
  // History logs state
  const [historyLogs, setHistoryLogs] = useState<CustomerHistoryLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showHomeAddressSearch, setShowHomeAddressSearch] = useState(false);
  const [showBusinessAddressSearch, setShowBusinessAddressSearch] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<Partial<typeof formData> | null>(null);
  
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
        processing_org: '미등록',
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

  // Update tab when initialTab changes
  useEffect(() => {
    setActiveBottomTab(initialTab);
  }, [initialTab]);

  // Load history logs when history tab is selected or customer changes
  useEffect(() => {
    const loadHistoryLogs = async () => {
      if (activeBottomTab === 'history' && customer?.id) {
        setIsLoadingHistory(true);
        try {
          const logs = await getCustomerHistoryLogs(customer.id);
          setHistoryLogs(logs);
        } catch (error) {
          console.error('Error loading history logs:', error);
          setHistoryLogs([]);
        } finally {
          setIsLoadingHistory(false);
        }
      }
    };
    loadHistoryLogs();
  }, [activeBottomTab, customer?.id]);

  // Calculate 7-year status (uses inline logic to avoid hoisting issues)
  const handleFoundingDateChange = (date: string) => {
    const foundingDate = parseISO(date);
    const yearsOld = differenceInYears(new Date(), foundingDate);
    const updatedData = { 
      ...formData, 
      founding_date: date, 
      over_7_years: yearsOld > 7 
    };
    setFormData(updatedData);
    pendingDataRef.current = updatedData;
    // triggerAutoSave will be called after component mounts
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSave(pendingDataRef.current || undefined);
    }, 1000);
  };

  // Handle file upload (shared logic)
  const uploadFile = async (file: File) => {
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

  // Handle file input change
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  // Dropzone for drag & drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadFile(acceptedFiles[0]);
    }
  }, [customer?.id, currentUser]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    noClick: true, // We have a separate button for clicking
    disabled: isReadOnly, // Disable drag & drop for read-only users
  });

  // Handle memo submit - saves immediately to Firestore and syncs with dashboard
  const handleMemoSubmit = async () => {
    if (!newMemo.trim() || !currentUser) return;
    
    const memo: MemoItem = {
      id: `memo_${Date.now()}`,
      content: newMemo.trim(),
      author_id: currentUser.uid,
      author_name: currentUser.name,
      created_at: new Date(),
    };
    
    // Update local state
    const updatedMemos = [...memos, memo];
    setMemos(updatedMemos);
    setNewMemo('');
    
    // Scroll to bottom
    setTimeout(() => {
      memoScrollRef.current?.scrollTo({ top: memoScrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
    
    // Immediately save to Firestore (don't wait for debounce)
    // This ensures memos are persisted and dashboard syncs
    if (formData.id || formData.name?.trim()) {
      const dataToSave = pendingDataRef.current || formData;
      const phone = `${dataToSave.phone_part1 || '010'}-${dataToSave.phone_part2 || ''}-${dataToSave.phone_part3 || ''}`;
      
      const customerData: Partial<Customer> = {
        ...(dataToSave.id && { id: dataToSave.id }),
        name: dataToSave.name || '',
        company_name: dataToSave.company_name || '',
        business_registration_number: dataToSave.business_registration_number || '',
        phone,
        email: dataToSave.email || '',
        status_code: dataToSave.status_code || '1-1',
        manager_id: dataToSave.manager_id || currentUser?.uid || '',
        manager_name: dataToSave.manager_name || currentUser?.name || '',
        team_id: dataToSave.team_id || currentUser?.team_id || '',
        team_name: dataToSave.team_name || currentUser?.team_name || '',
        entry_date: dataToSave.entry_date || '',
        founding_date: dataToSave.founding_date || '',
        credit_score: dataToSave.credit_score || 0,
        ssn_front: dataToSave.ssn_front || '',
        ssn_back: dataToSave.ssn_back || '',
        carrier: dataToSave.carrier || 'SKT',
        home_address: dataToSave.home_address || '',
        home_address_detail: dataToSave.home_address_detail || '',
        is_home_owned: dataToSave.is_home_owned || false,
        is_same_as_business: dataToSave.is_same_as_business || false,
        entry_source: dataToSave.entry_source || '광고랜딩명',
        business_type: dataToSave.business_type || '기타',
        business_item: dataToSave.business_item || '',
        retry_type: dataToSave.retry_type || '해당없음',
        innovation_type: dataToSave.innovation_type || '해당없음',
        over_7_years: dataToSave.over_7_years || false,
        business_address: dataToSave.business_address || '',
        business_address_detail: dataToSave.business_address_detail || '',
        is_business_owned: dataToSave.is_business_owned || false,
        recent_sales: dataToSave.recent_sales || 0,
        sales_y1: dataToSave.sales_y1 || 0,
        sales_y2: dataToSave.sales_y2 || 0,
        sales_y3: dataToSave.sales_y3 || 0,
        avg_revenue_3y: dataToSave.avg_revenue_3y || 0,
        approved_amount: dataToSave.approved_amount || 0,
        commission_rate: dataToSave.commission_rate || 0,
        processing_org: dataToSave.processing_org || '미등록',
        industry: dataToSave.industry || '',
        notes: dataToSave.notes || '',
        // ★핵심: Dashboard sync fields - recent_memo도 함께 업데이트
        recent_memo: memo.content,       // 대시보드가 보는 필드명
        latest_memo: memo.content,       // 호환성용
        last_memo_date: memo.created_at, // 정렬용 시간
        // Full memo history including the new memo
        memo_history: updatedMemos.map(m => ({
          content: m.content,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at: m.created_at,
        })),
        documents,
        updated_at: new Date(),
      };
      
      try {
        const returnedId = await onSave(customerData);
        if (returnedId && !formData.id) {
          setFormData(prev => ({ ...prev, id: returnedId }));
        }
      } catch (error) {
        console.error('Error saving memo:', error);
      }
    }
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

  // Auto-save function - uses pendingDataRef for latest data to avoid async state issues
  const performSave = useCallback(async (dataOverride?: Partial<typeof formData>) => {
    // Use override data (from pendingDataRef) if provided, otherwise fall back to formData
    const dataToSave = dataOverride || pendingDataRef.current || formData;
    
    console.log("💾 Firestore 저장 요청:", dataToSave); // 저장 확인용 로그
    
    if (!dataToSave.name?.trim()) return; // Don't save empty customers
    
    // Clear pending data after reading it
    pendingDataRef.current = null;
    
    setSaveStatus('saving');
    setIsSaving(true);
    try {
      const phone = `${dataToSave.phone_part1 || '010'}-${dataToSave.phone_part2 || ''}-${dataToSave.phone_part3 || ''}`;
      
      // Get latest memo content for dashboard sync
      const latestMemo = memos.length > 0 ? memos[memos.length - 1].content : '';
      
      const customerData: Partial<Customer> = {
        // Include id if it exists (for updates)
        ...(dataToSave.id && { id: dataToSave.id }),
        
        // Basic info
        name: dataToSave.name,
        company_name: dataToSave.company_name || '',
        business_registration_number: dataToSave.business_registration_number || '',
        phone,
        email: dataToSave.email || '',
        status_code: dataToSave.status_code || '1-1',
        
        // Manager/Team info
        manager_id: dataToSave.manager_id || currentUser?.uid || '',
        manager_name: dataToSave.manager_name || currentUser?.name || '',
        team_id: dataToSave.team_id || currentUser?.team_id || '',
        team_name: dataToSave.team_name || currentUser?.team_name || '',
        
        // Dates
        entry_date: dataToSave.entry_date || '',
        founding_date: dataToSave.founding_date || '',
        
        // Customer personal info
        credit_score: dataToSave.credit_score || 0,
        ssn_front: dataToSave.ssn_front || '',
        ssn_back: dataToSave.ssn_back || '',
        carrier: dataToSave.carrier || 'SKT',
        
        // Home address
        home_address: dataToSave.home_address || '',
        home_address_detail: dataToSave.home_address_detail || '',
        is_home_owned: dataToSave.is_home_owned || false,
        is_same_as_business: dataToSave.is_same_as_business || false,
        
        // Business info
        entry_source: dataToSave.entry_source || '광고랜딩명',
        business_type: dataToSave.business_type || '기타',
        business_item: dataToSave.business_item || '',
        retry_type: dataToSave.retry_type || '해당없음',
        innovation_type: dataToSave.innovation_type || '해당없음',
        over_7_years: dataToSave.over_7_years || false,
        
        // Business address
        business_address: dataToSave.business_address || '',
        business_address_detail: dataToSave.business_address_detail || '',
        is_business_owned: dataToSave.is_business_owned || false,
        
        // Sales data
        recent_sales: dataToSave.recent_sales || 0,
        sales_y1: dataToSave.sales_y1 || 0,
        sales_y2: dataToSave.sales_y2 || 0,
        sales_y3: dataToSave.sales_y3 || 0,
        avg_revenue_3y: dataToSave.avg_revenue_3y || 0,
        
        // Contract/Financial info
        approved_amount: dataToSave.approved_amount || 0,
        commission_rate: dataToSave.commission_rate || 0,
        processing_org: dataToSave.processing_org || '미등록',
        industry: dataToSave.industry || '',
        notes: dataToSave.notes || '',
        
        // ★핵심: Dashboard sync fields - recent_memo도 함께 업데이트
        recent_memo: latestMemo,  // 대시보드가 보는 필드명
        latest_memo: latestMemo,  // 호환성용
        memo_history: memos.map(m => ({
          content: m.content,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at: m.created_at,
        })),
        
        // Documents
        documents,
        
        // Updated timestamp for dashboard sync
        updated_at: new Date(),
      };
      
      const returnedId = await onSave(customerData);
      
      // If a new ID was returned (first-time creation), store it for future updates
      // Also preserve phone_part fields in formData for consistent UI rendering
      if (returnedId && !dataToSave.id) {
        setFormData(prev => ({ 
          ...prev, 
          id: returnedId,
          // Preserve phone parts for UI
          phone_part1: prev.phone_part1,
          phone_part2: prev.phone_part2,
          phone_part3: prev.phone_part3,
        }));
      }
      
      setSaveStatus('saved');
      // Reset to idle after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving customer:', error);
      setSaveStatus('idle');
    } finally {
      setIsSaving(false);
    }
  }, [formData, memos, documents, onSave, currentUser]);

  // Debounced save function - useMemo로 메모이제이션하여 타이머 유지
  const debouncedSave = useMemo(
    () => debounce((newData: typeof formData) => {
      console.log("⏳ 자동 저장 실행 중...", newData);
      performSave(newData);
    }, 1000),
    [performSave]
  );

  const handleFieldChange = (e: any) => {
    // 1. 값 추출 (어떤 형태의 입력이든 다 받아줌)
    let name = "";
    let value: any = "";

    if (e && e.target) {
      // 일반 input 태그인 경우 (name 속성이 있는 input)
      name = e.target.name;
      value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    } else if (e && typeof e === 'object') {
      // ★핵심: { fieldName: value } 형태로 호출된 경우
      // 예: { name: "홍길동" }, { credit_score: 750 }, { entry_source: "유튜브" }
      const keys = Object.keys(e);
      if (keys.length > 0) {
        name = keys[0];
        value = e[name];
      }
    }

    // 방어 코드: 이름이 없으면 중단
    if (!name) return;

    // 2. ★핵심: 검사 하지 말고 무조건 State 업데이트 (입력 렉 방지)
    const newData = { ...formData, [name]: value };
    setFormData(newData);

    // 3. 저장 함수 호출 (에러가 나도 입력은 되게 try-catch로 감쌈)
    try {
      if (typeof debouncedSave === 'function') {
        debouncedSave(newData);
      } else {
        console.warn("debouncedSave 없음, performSave 시도");
        performSave(newData);
      }
    } catch (err) {
      console.error("자동 저장 실패 (입력은 유지됨):", err);
    }
  };
  
  // Handle object updates (for complex field changes like founding_date with over_7_years)
  const handleFieldChangeObject = useCallback((updates: Partial<typeof formData>) => {
    setFormData(prev => {
      const updatedData = { ...prev, ...updates };
      // 직접 debouncedSave 호출
      debouncedSave(updatedData);
      return updatedData;
    });
  }, [debouncedSave]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Save on blur (when focus leaves input) - 즉시 저장
  const handleBlurSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    performSave(formData);
  }, [performSave, formData]);

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
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 bg-gray-900 border-gray-700 flex flex-col overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>
            {isNewCustomer ? '신규 고객 등록' : `${customer?.name || '고객'} 상세정보`}
          </DialogTitle>
        </VisuallyHidden>
        {/* Header - h-16 shrink-0 고정 */}
        <div className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-gray-700 bg-gray-900/80">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-100">
              {isNewCustomer ? '신규 고객 등록' : `${customer?.name || '고객'} 상세정보`}
            </h2>
            {customer?.id && (
              <Badge variant="outline" className="text-gray-400 border-gray-600 text-xs">
                {customer.id}
              </Badge>
            )}
            {/* Read-only indicator for staff users */}
            {isReadOnly && (
              <Badge variant="outline" className="bg-yellow-900/30 text-yellow-400 border-yellow-600/30 text-xs">
                <Lock className="w-3 h-3 mr-1" />
                읽기 전용
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save status indicator - hide for read-only users */}
            {!isReadOnly && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>저장 중...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <Check className="w-3 h-3 text-green-500" />
                    <span className="text-green-500">모든 변경사항 저장됨</span>
                  </>
                )}
              </div>
            )}
            {/* Delete button - hide for read-only users */}
            {!isReadOnly && onDelete && customer?.id && (
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
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Main Content - flex-1 h-[calc(100%-4rem)] overflow-hidden */}
        <div className="flex-1 flex flex-row h-[calc(100%-4rem)] overflow-hidden">
          
          {/* Section 1: Left Panel - w-[35%] h-full overflow-hidden (스크롤 제거) */}
          <div className="w-[35%] h-full border-r border-gray-700 overflow-hidden">
              <div className="p-1.5 space-y-1">
                
                {/* 유입경로 (최상단) - 1. 상단에 바짝 붙임 */}
                <div className="space-y-0.5 ml-[6px] mr-[6px] pl-[0px] pr-[0px] pt-[0px] pb-[0px]">
                  <Label className="text-xs text-gray-300 ml-[11px] mr-[11px]">유입경로</Label>
                  <Select 
                    value={formData.entry_source || '광고랜딩명'} 
                    onValueChange={(v) => handleFieldChange({ entry_source: v })}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger className={cn(
                      "border-gray-600 text-gray-200 h-8 text-sm",
                      isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                    )}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {ENTRY_SOURCES.map(src => (
                        <SelectItem key={src} value={src} className="text-gray-200 text-sm">{src}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 고객 정보 그룹 (Border Box) */}
                <div className="border border-gray-700 rounded-lg p-1.5 space-y-1 ml-[6px] mr-[6px] mt-[20px] mb-[20px] pl-[10px] pr-[10px] pt-[10px] pb-[10px]">
                  <h3 className="text-xs font-semibold text-blue-400">고객 정보</h3>
                  
                  {/* Row 2-1: 이름, 신용점수, 주민등록번호 - 이름 flex-1 확장, 나머지 고정폭 */}
                  <div className="flex gap-1.5 items-end">
                    <div className="flex-1">
                      <Label className="text-xs text-gray-400">이름</Label>
                      <Input 
                        value={formData.name || ''} 
                        onChange={(e) => handleFieldChange({ name: e.target.value })}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                        data-testid="input-customer-name"
                      />
                    </div>
                    <div className="w-20">
                      <Label className="text-xs text-gray-400">신용점수</Label>
                      <Input 
                        type="number"
                        value={formData.credit_score || ''} 
                        onChange={(e) => handleFieldChange({ credit_score: Number(e.target.value) })}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                      />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs text-gray-400">주민등록번호(앞)</Label>
                      <Input 
                        maxLength={6}
                        value={formData.ssn_front || ''} 
                        onChange={(e) => handleFieldChange({ ssn_front: e.target.value })}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                        placeholder="YYMMDD"
                      />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs text-gray-400">주민등록번호(뒤)</Label>
                      <Input 
                        maxLength={7}
                        value={formData.ssn_back || ''} 
                        onChange={(e) => handleFieldChange({ ssn_back: e.target.value })}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                        placeholder="0000000"
                      />
                    </div>
                  </div>

                  {/* Row 2-2: 연락처, 통신사 - 2:2:2:4 비율, 하이픈 포함, h-9 강제 */}
                  <div className="flex flex-row items-center w-full gap-2">
                    <div className="flex-[2]">
                      <Label className="text-xs text-gray-400">연락처</Label>
                      <Input 
                        value={formData.phone_part1 || '010'} 
                        onChange={(e) => handleFieldChange({ phone_part1: e.target.value })}
                        onBlur={handleBlurSave}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm text-center w-full",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                      />
                    </div>
                    <span className="text-gray-500 mt-5">-</span>
                    <div className="flex-[2]">
                      <Label className="text-xs text-gray-400 invisible">중간</Label>
                      <Input 
                        maxLength={4}
                        value={formData.phone_part2 || ''} 
                        onChange={(e) => handleFieldChange({ phone_part2: e.target.value })}
                        onBlur={handleBlurSave}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm text-center w-full",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                      />
                    </div>
                    <span className="text-gray-500 mt-5">-</span>
                    <div className="flex-[2]">
                      <Label className="text-xs text-gray-400 invisible">끝</Label>
                      <Input 
                        maxLength={4}
                        value={formData.phone_part3 || ''} 
                        onChange={(e) => handleFieldChange({ phone_part3: e.target.value })}
                        onBlur={handleBlurSave}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm text-center w-full",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                      />
                    </div>
                    <div className="flex-[4]">
                      <Label className="text-xs text-gray-400">통신사</Label>
                      <Select 
                        value={formData.carrier || 'SKT'} 
                        onValueChange={(v) => { handleFieldChange({ carrier: v }); }}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm w-full",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {CARRIERS.map(c => (
                            <SelectItem key={c} value={c} className="text-gray-200 text-sm">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 2-3: 자택주소, 상세주소, 자가여부, 상동여부 */}
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-400">자택주소</Label>
                        <div className="flex gap-1.5">
                          <Input 
                            value={formData.home_address || ''} 
                            readOnly
                            className={cn(
                              "border-gray-600 text-gray-200 flex-1 h-8 text-sm",
                              isReadOnly ? "bg-gray-700 opacity-70" : "bg-gray-800"
                            )}
                            placeholder="주소 검색"
                          />
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => setShowHomeAddressSearch(true)}
                            disabled={isReadOnly}
                            className={cn(
                              "border-gray-600 h-8 w-8 p-0",
                              isReadOnly && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <Search className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="flex-1 min-w-[100px]">
                        <Label className="text-xs text-gray-400">상세주소</Label>
                        <Input 
                          value={formData.home_address_detail || ''} 
                          onChange={(e) => handleFieldChange({ home_address_detail: e.target.value })}
                          disabled={isReadOnly}
                          className={cn(
                            "border-gray-600 text-gray-200 h-8 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}
                          placeholder="동/호수"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 pt-4">
                        <Checkbox 
                          id="home-owned"
                          checked={formData.is_home_owned || false}
                          onCheckedChange={(c) => handleFieldChange({ is_home_owned: !!c })}
                          disabled={isReadOnly}
                          className={cn("h-3.5 w-3.5", isReadOnly && "opacity-50 cursor-not-allowed")}
                        />
                        <Label htmlFor="home-owned" className="text-xs text-gray-400">자가</Label>
                      </div>
                      <div className="flex items-center gap-1.5 pt-4">
                        <Checkbox 
                          id="same-address"
                          checked={formData.is_same_as_business || false}
                          onCheckedChange={(c) => {
                            handleFieldChange({ 
                              is_same_as_business: !!c,
                              business_address: c ? formData.home_address : formData.business_address,
                              business_address_detail: c ? formData.home_address_detail : formData.business_address_detail,
                            });
                          }}
                          disabled={isReadOnly}
                          className={cn("h-3.5 w-3.5", isReadOnly && "opacity-50 cursor-not-allowed")}
                        />
                        <Label htmlFor="same-address" className="text-xs text-gray-400">사업장동일</Label>
                      </div>
                    </div>
                  </div>

                  {/* Daum Postcode Modal for Home */}
                  {showHomeAddressSearch && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-white rounded-lg w-[400px] overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
                          <span className="font-medium text-gray-700">자택 주소 검색</span>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setShowHomeAddressSearch(false)}
                            className="text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="p-4">
                          <DaumPostcodeEmbed 
                            onComplete={(data) => {
                              handleFieldChange({ home_address: data.address });
                              setShowHomeAddressSearch(false);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 사업자 정보 그룹 (Border Box) */}
                <div className="border border-gray-700 rounded-lg p-1.5 space-y-1 ml-[6px] mr-[6px] pl-[10px] pr-[10px] pt-[10px] pb-[10px] mt-[0px] mb-[0px]">
                  <h3 className="text-xs font-semibold text-emerald-400">사업자 정보</h3>
                  
                  {/* Row 3-1: 상호명, 개업일 - grid-cols-2 gap-3 items-end (Row 2와 동일) */}
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <Label className="text-xs text-gray-400">상호명</Label>
                      <Input 
                        value={formData.company_name || ''} 
                        onChange={(e) => handleFieldChange({ company_name: e.target.value })}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                        data-testid="input-company-name"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-gray-400">개업일</Label>
                        {formData.founding_date && formData.over_7_years && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-orange-600/20 text-orange-400 leading-tight">
                            7년초과
                          </Badge>
                        )}
                      </div>
                      <Input 
                        type="date"
                        value={formData.founding_date || ''} 
                        onChange={(e) => handleFoundingDateChange(e.target.value)}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                      />
                    </div>
                  </div>

                  {/* Row 3-2: 업종, 종목 - grid-cols-2 gap-3 items-center, h-9 강제 */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <Label className="text-xs text-gray-400">업종</Label>
                      <Select 
                        value={formData.business_type || '기타'} 
                        onValueChange={(v) => handleFieldChange({ business_type: v })}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {BUSINESS_TYPES.map(t => (
                            <SelectItem key={t} value={t} className="text-gray-200 text-sm">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">종목</Label>
                      <Input 
                        value={formData.business_item || ''} 
                        onChange={(e) => handleFieldChange({ business_item: e.target.value })}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                      />
                    </div>
                  </div>

                  {/* Row 3-3: 사업자번호 | 재도전+혁신 - grid-cols-2 gap-3 items-center, h-9 강제 */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <Label className="text-xs text-gray-400">사업자번호</Label>
                      <Input 
                        value={formData.business_registration_number || ''} 
                        onChange={(e) => handleFieldChange({ business_registration_number: e.target.value })}
                        disabled={isReadOnly}
                        className={cn(
                          "border-gray-600 text-gray-200 h-9 text-sm",
                          isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                        )}
                        placeholder="000-00-00000"
                      />
                    </div>
                    <div className="flex flex-row gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-400">재도전</Label>
                        <Select 
                          value={formData.retry_type || '해당없음'} 
                          onValueChange={(v) => handleFieldChange({ retry_type: v })}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger className={cn(
                            "border-gray-600 text-gray-200 h-9 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-700">
                            {RETRY_OPTIONS.map(o => (
                              <SelectItem key={o} value={o} className="text-gray-200 text-sm">{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-gray-400">혁신</Label>
                        <Select 
                          value={formData.innovation_type || '해당없음'} 
                          onValueChange={(v) => handleFieldChange({ innovation_type: v })}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger className={cn(
                            "border-gray-600 text-gray-200 h-9 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-700">
                            {INNOVATION_OPTIONS.map(o => (
                              <SelectItem key={o} value={o} className="text-gray-200 text-sm">{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Row 3-4: 사업장 소재지, 상세주소, 자가여부 */}
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-400">사업장 소재지</Label>
                        <div className="flex gap-1.5">
                          <Input 
                            value={formData.business_address || ''} 
                            readOnly
                            className={cn(
                              "border-gray-600 text-gray-200 flex-1 h-8 text-sm",
                              isReadOnly ? "bg-gray-700 opacity-70" : "bg-gray-800"
                            )}
                            placeholder="주소 검색"
                          />
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => setShowBusinessAddressSearch(true)}
                            className={cn(
                              "border-gray-600 h-8 w-8 p-0",
                              isReadOnly && "opacity-50 cursor-not-allowed"
                            )}
                            disabled={formData.is_same_as_business || isReadOnly}
                          >
                            <Search className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="flex-1 min-w-[100px]">
                        <Label className="text-xs text-gray-400">상세주소</Label>
                        <Input 
                          value={formData.business_address_detail || ''} 
                          onChange={(e) => handleFieldChange({ business_address_detail: e.target.value })}
                          className={cn(
                            "border-gray-600 text-gray-200 h-8 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}
                          placeholder="동/호수"
                          disabled={formData.is_same_as_business || isReadOnly}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 pt-4">
                        <Checkbox 
                          id="business-owned"
                          checked={formData.is_business_owned || false}
                          onCheckedChange={(c) => handleFieldChange({ is_business_owned: !!c })}
                          disabled={isReadOnly}
                          className={cn("h-3.5 w-3.5", isReadOnly && "opacity-50 cursor-not-allowed")}
                        />
                        <Label htmlFor="business-owned" className="text-xs text-gray-400">자가</Label>
                      </div>
                    </div>
                  </div>

                  {/* Daum Postcode Modal for Business */}
                  {showBusinessAddressSearch && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-white rounded-lg w-[400px] overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
                          <span className="font-medium text-gray-700">사업장 주소 검색</span>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setShowBusinessAddressSearch(false)}
                            className="text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="p-4">
                          <DaumPostcodeEmbed 
                            onComplete={(data) => {
                              handleFieldChange({ business_address: data.address });
                              setShowBusinessAddressSearch(false);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Row 3-5: 매출 - 6. 라벨 수정 및 grid-cols-4 등간격 */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <Label className="text-xs text-gray-400">최근 매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.recent_sales || ''} 
                          onChange={(e) => handleFieldChange({ recent_sales: Number(e.target.value) })}
                          disabled={isReadOnly}
                          className={cn(
                            "border-gray-600 text-gray-200 pr-6 h-8 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">억</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Y-1 매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.sales_y1 || ''} 
                          onChange={(e) => handleFieldChange({ sales_y1: Number(e.target.value) })}
                          disabled={isReadOnly}
                          className={cn(
                            "border-gray-600 text-gray-200 pr-6 h-8 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">억</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Y-2 매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.sales_y2 || ''} 
                          onChange={(e) => handleFieldChange({ sales_y2: Number(e.target.value) })}
                          disabled={isReadOnly}
                          className={cn(
                            "border-gray-600 text-gray-200 pr-6 h-8 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">억</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">Y-3 매출</Label>
                      <div className="relative">
                        <Input 
                          type="number"
                          value={formData.sales_y3 || ''} 
                          onChange={(e) => handleFieldChange({ sales_y3: Number(e.target.value) })}
                          disabled={isReadOnly}
                          className={cn(
                            "border-gray-600 text-gray-200 pr-6 h-8 text-sm",
                            isReadOnly ? "bg-gray-700 cursor-not-allowed opacity-70" : "bg-gray-800"
                          )}
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">억</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </div>

          {/* Right Panel - w-[65%] h-full flex flex-col */}
          <div className="w-[65%] h-full flex flex-col overflow-hidden">
            
            {/* Section 2: Top - Document Viewer (h-[60%]) */}
            <div className="h-[60%] shrink-0 border-b border-gray-700 flex flex-col overflow-hidden">
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
                    disabled={isUploading || isReadOnly}
                    className={cn(
                      "border-gray-600 shrink-0",
                      isReadOnly && "opacity-50 cursor-not-allowed"
                    )}
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
              
              {/* Document Viewer with Drag & Drop */}
              <div 
                {...getRootProps()} 
                className={cn(
                  "flex-1 p-4 overflow-auto bg-gray-950/50 transition-all",
                  isDragActive && "border-2 border-dashed border-blue-500 bg-blue-500/10"
                )}
              >
                <input {...getInputProps()} />
                {isDragActive ? (
                  <div className="h-full flex items-center justify-center text-blue-400">
                    <div className="text-center">
                      <Upload className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                      <p className="text-lg font-medium">파일을 여기에 놓으세요</p>
                    </div>
                  </div>
                ) : selectedDocument ? (
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
                  <div 
                    className="h-full flex items-center justify-center text-gray-500 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="text-center border-2 border-dashed border-gray-700 rounded-lg p-8">
                      <Upload className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                      <p>파일을 드래그하거나 클릭하여 업로드하세요</p>
                      <p className="text-xs text-gray-600 mt-1">PDF, PNG, JPG 지원</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Section - h-[40%] min-h-0 overflow-hidden with Tabs */}
            <div className="h-[40%] min-h-0 overflow-hidden flex flex-col">
              {/* Tab Headers */}
              <div className="h-10 shrink-0 border-b border-gray-700 bg-gray-800/30 flex items-center px-2 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveBottomTab('memo')}
                  className={cn(
                    "h-8 px-3 text-sm",
                    activeBottomTab === 'memo' 
                      ? "bg-blue-600/20 text-blue-400" 
                      : "text-gray-400"
                  )}
                  data-testid="tab-memo"
                >
                  <UserIcon className="w-4 h-4 mr-1.5" />
                  상담 메모
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveBottomTab('history')}
                  className={cn(
                    "h-8 px-3 text-sm",
                    activeBottomTab === 'history' 
                      ? "bg-orange-600/20 text-orange-400" 
                      : "text-gray-400"
                  )}
                  data-testid="tab-history"
                >
                  <History className="w-4 h-4 mr-1.5" />
                  변경 이력
                </Button>
              </div>
              
              {/* Tab Content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeBottomTab === 'memo' ? (
                  <div className="flex flex-row w-full h-full">
                    {/* Section 3: Memo Chat (Left 50%) */}
                    <div className="w-1/2 border-r border-gray-700 flex flex-col h-full">
                      {/* Memo Messages - flex-1 overflow-y-auto min-h-0 */}
                      <div ref={memoScrollRef} className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2 bg-gray-900/50">
                        {memos.length === 0 ? (
                          <div className="text-center text-gray-500 py-3">
                            <p className="text-sm">상담 메모가 없습니다</p>
                          </div>
                        ) : (
                          memos.map((memo) => (
                            <div key={memo.id} className="flex flex-col">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-medium text-blue-400">{memo.author_name}</span>
                                <span className="text-xs text-gray-500">
                                  {safeFormatDate(memo.created_at, 'MM/dd HH:mm')}
                                </span>
                              </div>
                              <div className="bg-blue-600/20 border border-blue-600/30 rounded-lg px-2 py-1.5 max-w-[90%]">
                                <p className="text-sm text-gray-200 whitespace-pre-wrap">{memo.content}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      {/* Memo Input - h-auto shrink-0 py-2 */}
                      <div className="h-auto shrink-0 border-t border-gray-700 bg-gray-800/30 flex items-center px-2 py-2 gap-1.5">
                        <Input
                          value={newMemo}
                          onChange={(e) => setNewMemo(e.target.value)}
                          placeholder="메모 입력..."
                          className="bg-transparent border-gray-600 text-gray-200 h-9 text-sm flex-1"
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
                          className="shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Section 4: AI Chat (Right 50%) */}
                    <div className="w-1/2 flex flex-col h-full bg-gray-950/30">
                      {/* AI Messages - flex-1 overflow-y-auto min-h-0 */}
                      <div ref={aiScrollRef} className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">
                        <div className="h-8 shrink-0 px-2 flex items-center">
                          <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5" />
                            AI 질의
                          </span>
                        </div>
                        {aiMessages.length === 0 ? (
                          <div className="text-center text-gray-500 py-3">
                            <Bot className="w-7 h-7 mx-auto mb-1 text-purple-600/50" />
                            <p className="text-sm">AI에게 질문하세요</p>
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
                                "rounded-lg px-2 py-1.5 max-w-[90%]",
                                msg.role === 'user' 
                                  ? "bg-purple-600/30 border border-purple-600/40" 
                                  : "bg-gray-700/50 border border-gray-600/50"
                              )}>
                                <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg.content}</p>
                              </div>
                              <span className="text-xs text-gray-500 mt-0.5">
                                {safeFormatDate(msg.created_at, 'HH:mm')}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      
                      {/* AI Input - h-auto shrink-0 py-2 */}
                      <div className="h-auto shrink-0 border-t border-gray-700 bg-purple-900/10 flex items-center px-2 py-2 gap-1.5">
                        <Input
                          value={aiInput}
                          onChange={(e) => setAiInput(e.target.value)}
                          placeholder="AI에게 질문하기..."
                          className="bg-transparent border-gray-600 text-gray-200 h-9 text-sm flex-1"
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
                          className="shrink-0 bg-purple-600 hover:bg-purple-700"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* History Tab Content - Timeline View */
                  <div className="h-full overflow-y-auto p-4 bg-gray-900/50">
                    {isLoadingHistory ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                        <span className="ml-2 text-gray-400">이력 로딩 중...</span>
                      </div>
                    ) : historyLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <History className="w-12 h-12 mb-3 text-gray-600" />
                        <p className="text-sm">변경 이력이 없습니다</p>
                        <p className="text-xs text-gray-600 mt-1">상태나 담당자가 변경되면 자동으로 기록됩니다</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {historyLogs.map((log, index) => (
                          <div key={log.id} className="flex gap-3">
                            {/* Timeline line and dot */}
                            <div className="flex flex-col items-center">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                log.action_type === 'status_change' 
                                  ? "bg-blue-600/20 text-blue-400" 
                                  : log.action_type === 'manager_change'
                                  ? "bg-green-600/20 text-green-400"
                                  : "bg-gray-600/20 text-gray-400"
                              )}>
                                {log.action_type === 'status_change' ? (
                                  <ArrowRight className="w-4 h-4" />
                                ) : log.action_type === 'manager_change' ? (
                                  <UserCog className="w-4 h-4" />
                                ) : (
                                  <Clock className="w-4 h-4" />
                                )}
                              </div>
                              {index < historyLogs.length - 1 && (
                                <div className="w-0.5 flex-1 bg-gray-700 my-1" />
                              )}
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 pb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-300">
                                  {log.changed_by_name || '시스템'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {safeFormatDate(log.changed_at, 'yyyy.MM.dd HH:mm')}
                                </span>
                              </div>
                              <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
                                <p className="text-sm text-gray-200">{log.description}</p>
                                {log.old_value && log.new_value && (
                                  <div className="flex items-center gap-2 mt-1.5 text-xs">
                                    <Badge variant="outline" className="bg-gray-700/50 text-gray-400 border-gray-600">
                                      {log.old_value}
                                    </Badge>
                                    <ArrowRight className="w-3 h-3 text-gray-500" />
                                    <Badge variant="outline" className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                                      {log.new_value}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
