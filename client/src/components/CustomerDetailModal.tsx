import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Trash2,
  Upload,
  FileText,
  Send,
  Bot,
  User as UserIcon,
  Search,
  Check,
  Loader2,
  History,
  Clock,
  ArrowRight,
  UserCog,
  Lock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Download,
  Plus,
  CheckCircle,
  XCircle,
  Building,
  RotateCcw,
  Pencil,
  RefreshCw,
  Eye,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import debounce from "lodash/debounce";
import { compressImage, validateFileSize, formatFileSize } from "@/lib/imageCompressor";
import { startAIConversation, streamAIChat, predictFunding as apiPredictFunding } from "@/lib/aiClient";
import { 
  extractBusinessRegistration, 
  isBusinessRegistrationFile, 
  extractVatCertificate,
  isVatCertificateFile,
  extractCreditReport,
  isCreditReportFile,
  type BusinessRegistrationData,
  type VatCertificateData,
  type CreditReportData
} from "@/lib/geminiOCR";
import { DocumentViewer } from "@/components/DocumentViewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_OPTIONS, getStatusStyle, PROCESSING_ORGS, ORG_STATUS_COLORS, type ProcessingOrgStatus, getStatusTransitionAllowed } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Customer,
  User,
  CustomerDocument,
  StatusCode,
  CustomerHistoryLog,
  FinancialObligation,
  ProcessingOrg,
  Contract,
  ContractStatus,
  PaymentRecord,
} from "@shared/types";
import { FinancialAnalysisTab } from "@/components/FinancialAnalysisTab";
import { ReviewSummaryTab } from "@/components/ReviewSummaryTab";
import { ProposalModal, ProposalPreview, type ProposalFormData } from "@/components/report";
import { format, differenceInDays, parseISO } from "date-fns";
import DaumPostcodeEmbed from "react-daum-postcode";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, FileSignature } from "lucide-react";
import { TodoForm } from "@/components/TodoForm";
import { ContractSendModal } from "@/components/ContractSendModal";
import PaymentSendModal from "@/components/PaymentSendModal";
import { storage, db, getCustomerHistoryLogs } from "@/lib/firebase";
import { 
  getConsultationByCustomerId, 
  generateConsultationMemoSummary,
  processClawbackForFinalRejection,
  syncSingleCustomerSettlement,
  getUsers,
  getContractsByCustomer,
  getPaymentsByCustomer,
  normalizeEntrySource,
} from "@/lib/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";

interface MemoItem {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  created_at: Date;
  is_deleted?: boolean;
  deleted_by?: string;
  deleted_by_name?: string;
  deleted_at?: Date;
}

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
}

interface HistoryLogItem {
  id: string;
  action_type:
    | "status_change"
    | "manager_change"
    | "info_update"
    | "document_upload"
    | "memo_added";
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
  customers?: Customer[]; // TO-DO 폼에서 사용
  onSave: (customer: Partial<Customer>) => Promise<string | undefined>;
  onDelete?: (customerId: string) => Promise<void>;
  initialTab?: "memo" | "history" | "contracts";
  onTodoCreated?: () => void; // TO-DO 생성 후 콜백
}

// Helper to safely format dates (handles Firestore Timestamps and Date objects)
function safeFormatDate(date: any, formatStr: string): string {
  try {
    if (!date) return "";
    // Handle Firestore Timestamp
    if (date?.toDate && typeof date.toDate === "function") {
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
    return "";
  } catch {
    return "";
  }
}

const ENTRY_SOURCES = ["광고", "캐시노트 인앱광고", "구글애즈(dm)", "구글애즈(QS)", "구글애즈(QSe)", "구글애즈(dm-e)", "구글애즈(dm-d)", "구글애즈(dp-e)", "외주", "고객소개"];

// 메모 텍스트 내의 옛 유입경로 라벨을 새 라벨로 치환 (소급 표시용, DB는 변경하지 않음)
function normalizeEntrySourceInText(text: string): string {
  if (!text) return text;
  return text
    .replace(/구글애즈\(D\)/g, '구글애즈(dm-d)')
    .replace(/구글애즈\(e\)/g, '구글애즈(dm-e)')
    // '구글애즈' 단독 (뒤에 '(' 가 오지 않을 때만) → '구글애즈(dm)'
    .replace(/구글애즈(?!\()/g, '구글애즈(dm)');
}
const CARRIERS = ["SKT", "KT", "LG", "SKT알뜰폰", "KT알뜰폰", "LG알뜰폰"];
const BUSINESS_TYPES = [
  "음식점",
  "소매업",
  "서비스업",
  "제조업",
  "도매업",
  "건설업",
  "운수업",
  "IT/소프트웨어",
  "기타",
];
const RETRY_OPTIONS = ["해당없음", "폐업", "이전", "변경"];
const INNOVATION_OPTIONS = ["해당없음", "배달앱", "효율화", "매출신장", "기타"];
const DETAIL_PROCESSING_ORGS = ["미등록", ...PROCESSING_ORGS];

export function CustomerDetailModal({
  isOpen,
  onClose,
  customer,
  isNewCustomer = false,
  currentUser,
  users,
  customers = [],
  onSave,
  onDelete,
  initialTab = "memo",
  onTodoCreated,
}: CustomerDetailModalProps) {
  // Role-based access control: staff users can edit only their own customers
  // staff 사용자는 본인 담당 고객만 수정 가능 (신규 고객 생성 포함)
  const isReadOnly = currentUser?.role === "staff" && !isNewCustomer && customer?.manager_id !== currentUser?.uid;

  // Active tab state for bottom panel
  const [activeBottomTab, setActiveBottomTab] = useState<"memo" | "history" | "contracts">(
    initialTab,
  );
  const [customerContracts, setCustomerContracts] = useState<Contract[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [resendingContractId, setResendingContractId] = useState<string | null>(null);
  const [syncingContractId, setSyncingContractId] = useState<string | null>(null);
  const [checkingReadContractId, setCheckingReadContractId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [downloadingContractId, setDownloadingContractId] = useState<string | null>(null);
  
  // Active tab state for center panel (document viewer, financial analysis, review summary)
  const [activeCenterTab, setActiveCenterTab] = useState<"documents" | "financial" | "summary">("documents");
  
  // File carousel pagination state (max 3 files visible at a time)
  const [fileCarouselStart, setFileCarouselStart] = useState(0);
  const FILES_PER_PAGE = 3;
  
  // Financial obligations state
  const [financialObligations, setFinancialObligations] = useState<FinancialObligation[]>(
    customer?.financial_obligations || []
  );

  // History logs state
  const [historyLogs, setHistoryLogs] = useState<CustomerHistoryLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // TO-DO form modal state
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [reservationTodoOpen, setReservationTodoOpen] = useState(false);
  const [contractSendModalOpen, setContractSendModalOpen] = useState(false);
  const [paymentSendModalOpen, setPaymentSendModalOpen] = useState(false);
  const [customerPayments, setCustomerPayments] = useState<PaymentRecord[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [syncingPaymentId, setSyncingPaymentId] = useState<string | null>(null);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalPreviewOpen, setProposalPreviewOpen] = useState(false);
  const [proposalAgencies, setProposalAgencies] = useState<{
    name: string;
    limit: string;
    rate: string;
    period: string;
    monthlyPayment: string;
  }[]>([]);
  const [proposalDesiredAmount, setProposalDesiredAmount] = useState("");
  const [isSendingBusinessCard, setIsSendingBusinessCard] = useState(false);
  const [addAsReExecution, setAddAsReExecution] = useState(false);
  
  // 진행기관 승인 모달 state (집행일자/금액 입력)
  const [orgApprovalModal, setOrgApprovalModal] = useState<{
    isOpen: boolean;
    orgName: string;
    executionDate: string;
    executionAmount: number;
    isLoading: boolean;
  }>({
    isOpen: false,
    orgName: '',
    executionDate: format(new Date(), 'yyyy-MM-dd'),
    executionAmount: 0,
    isLoading: false,
  });
  
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState<
    Partial<Customer> & {
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
    }
  >({});

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [showHomeAddressSearch, setShowHomeAddressSearch] = useState(false);
  const [showBusinessAddressSearch, setShowBusinessAddressSearch] =
    useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<Partial<typeof formData> | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [selectedDocument, setSelectedDocument] =
    useState<CustomerDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memo state
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [newMemo, setNewMemo] = useState("");
  const memoScrollRef = useRef<HTMLDivElement>(null);
  const [memosLoaded, setMemosLoaded] = useState(false); // 메모 로딩 완료 플래그

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const [aiIsStreaming, setAiIsStreaming] = useState(false);
  const [aiInitError, setAiInitError] = useState<string | null>(null);
  const aiStartedForCustomerRef = useRef<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  // AI 자동 자금 예측 트리거 (마지막 시그니처 추적, 진행 중 플래그)
  const aiPredictedSignatureRef = useRef<string>("");
  const aiPredictingRef = useRef<boolean>(false);
  const aiPredictAbortRef = useRef<AbortController | null>(null);
  const [aiPredictRunning, setAiPredictRunning] = useState(false);

  // OCR 자동 입력 하이라이트 상태
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  
  // OCR 추출 업종 리스트 상태 (드롭다운 상단에 추가)
  const [ocrBusinessTypes, setOcrBusinessTypes] = useState<string[]>([]);
  
  // 신용공여내역 OCR 추출 건수 (탭 배지 표시용)
  const [ocrExtractedCount, setOcrExtractedCount] = useState<number>(0);

  // Status change modal state
  const [statusChangeModal, setStatusChangeModal] = useState<{
    isOpen: boolean;
    targetStatus: string;
    commissionRate: number;
    contractAmount: number;
    contractDate: string;
    executionAmount: number;
    executionDate: string;
    processingOrg: string;
    clawbackDate: string;
    selectedOrgs: ProcessingOrg[];
    existingOrgs: ProcessingOrg[];
    debtAdjTotalRevenue: number;
    debtAdjEmployeeCommission: number;
  }>({
    isOpen: false,
    targetStatus: "",
    commissionRate: 0,
    contractAmount: 0,
    contractDate: new Date().toISOString().split('T')[0],
    executionAmount: 0,
    executionDate: new Date().toISOString().split('T')[0],
    processingOrg: "미등록",
    clawbackDate: new Date().toISOString().split('T')[0],
    selectedOrgs: [],
    existingOrgs: [],
    debtAdjTotalRevenue: 0,
    debtAdjEmployeeCommission: 0,
  });

  // Initialize form data
  useEffect(() => {
    if (customer) {
      const phoneParts = customer.phone?.split("-") || ["010", "", ""];
      // 기존 processing_org를 processing_orgs로 변환 (호환성)
      const migratedProcessingOrgs = (): ProcessingOrg[] => {
        if (customer.processing_orgs && customer.processing_orgs.length > 0) {
          return customer.processing_orgs;
        }
        if (customer.processing_org && customer.processing_org !== '미등록') {
          return [{ org: customer.processing_org, status: '진행중' }];
        }
        return [];
      };
      setFormData({
        ...customer,
        entry_source: customer.entry_source ? normalizeEntrySource(customer.entry_source) : "광고",
        ssn_front: customer.ssn_front || "",
        ssn_back: customer.ssn_back || "",
        phone_part1: phoneParts[0] || "010",
        phone_part2: phoneParts[1] || "",
        phone_part3: phoneParts[2] || "",
        carrier: customer.carrier || "SKT",
        home_address: customer.home_address || "",
        home_address_detail: customer.home_address_detail || "",
        is_home_owned: customer.is_home_owned || false,
        is_same_as_business: customer.is_same_as_business || false,
        business_type: customer.business_type || "기타",
        business_item: customer.business_item || "",
        retry_type: customer.retry_type || "해당없음",
        innovation_type: customer.innovation_type || "해당없음",
        business_address: customer.business_address || customer.address || "",
        business_address_detail: customer.business_address_detail || "",
        is_business_owned: customer.is_business_owned || false,
        sales_y1: customer.sales_y1 || 0,
        sales_y2: customer.sales_y2 || 0,
        sales_y3: customer.sales_y3 || 0,
        processing_orgs: migratedProcessingOrgs(),
      });
      setMemos(
        customer.memo_history?.map((m, i) => ({
          id: (m as any).id || `memo_local_${Date.now()}_${i}`,
          content: m.content,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at:
            m.created_at instanceof Date
              ? m.created_at
              : new Date(m.created_at),
          ...(m.is_deleted ? {
            is_deleted: true,
            deleted_by: m.deleted_by,
            deleted_by_name: m.deleted_by_name,
            deleted_at: m.deleted_at instanceof Date ? m.deleted_at : m.deleted_at ? new Date(m.deleted_at as any) : undefined,
          } : {}),
        })) || [],
      );
      setDocuments(customer.documents || []);
      setSelectedDocument(null); // 이전 고객의 선택된 문서 초기화
      // 금융 채무 데이터 복원 (Firestore에서 불러온 데이터)
      setFinancialObligations(customer.financial_obligations || []);
    } else if (isNewCustomer) {
      setFormData({
        name: "",
        company_name: "",
        business_registration_number: "",
        phone: "",
        status_code: "상담대기" as StatusCode,
        manager_id: currentUser?.uid || "",
        manager_name: currentUser?.name || "",
        team_id: currentUser?.team_id || "",
        team_name: currentUser?.team_name || "",
        entry_date: format(new Date(), "yyyy-MM-dd"),
        credit_score: 0,
        over_7_years: false,
        avg_revenue_3y: 0,
        recent_sales: 0,
        approved_amount: 0,
        commission_rate: 0,
        processing_org: "미등록",
        entry_source: "광고",
        phone_part1: "010",
        carrier: "SKT",
        business_type: "기타",
        retry_type: "해당없음",
        innovation_type: "해당없음",
      });
      setMemos([]);
      setDocuments([]);
      setSelectedDocument(null); // 뷰어 초기화
      // 신규 고객은 빈 금융 채무 배열로 초기화
      setFinancialObligations([]);
    }
    setAiMessages([]);
    // OCR 관련 상태 초기화
    setOcrBusinessTypes([]);
    setOcrExtractedCount(0);
    // 메모 로딩 플래그 초기화
    setMemosLoaded(false);
  }, [customer, isNewCustomer, currentUser]);

  // [핵심] Firestore에서 최신 고객 데이터 강제 재조회 (모달 열릴 때마다)
  useEffect(() => {
    const fetchFreshCustomerData = async () => {
      // 신규 고객이거나 고객 ID가 없으면 건너뜀
      if (isNewCustomer || !customer?.id || !isOpen) {
        return;
      }

      console.log(`[DEBUG] 🔄 Firestore에서 최신 고객 데이터 조회 시작: ${customer.id}`);

      try {
        const customerRef = doc(db, "customers", customer.id);
        const customerSnap = await getDoc(customerRef);

        if (customerSnap.exists()) {
          // RAW DATA 로그 출력 (필드명 확인용)
          const rawData = customerSnap.data();
          console.log(`[RAW DATA] 📋 Firestore 원시 데이터:`, rawData);
          console.log(`[RAW DATA] 📋 financial_obligations 필드:`, rawData.financial_obligations);
          
          const freshData = rawData as Customer;
          
          // 금융 채무 데이터 로그 및 상태 업데이트
          const obligations = freshData.financial_obligations || [];
          const loanCount = obligations.filter((o: FinancialObligation) => o.type === 'loan').length;
          const guaranteeCount = obligations.filter((o: FinancialObligation) => o.type === 'guarantee').length;
          
          console.log(`[DEBUG] ✅ DB로부터 불러온 대출 내역: ${loanCount}건`);
          console.log(`[DEBUG] ✅ DB로부터 불러온 보증 내역: ${guaranteeCount}건`);
          console.log(`[DEBUG] ✅ 업종: ${freshData.business_type || '없음'}`);
          console.log(`[DEBUG] ✅ 최근매출: ${freshData.recent_sales || 0}억`);

          // 금융 채무 상태 업데이트 (핵심!)
          setFinancialObligations(obligations);
          
          const phoneParts = freshData.phone?.split("-") || ["010", "", ""];
          const migratedOrgs: ProcessingOrg[] = (() => {
            if (freshData.processing_orgs && freshData.processing_orgs.length > 0) {
              return freshData.processing_orgs;
            }
            if (freshData.processing_org && freshData.processing_org !== '미등록') {
              return [{ org: freshData.processing_org, status: '진행중' as ProcessingOrgStatus }];
            }
            return [];
          })();
          setFormData(prev => ({
            ...prev,
            ...freshData,
            entry_source: freshData.entry_source ? normalizeEntrySource(freshData.entry_source) : (prev.entry_source || "광고"),
            phone_part1: phoneParts[0] || "010",
            phone_part2: phoneParts[1] || "",
            phone_part3: phoneParts[2] || "",
            financial_obligations: obligations,
            processing_orgs: migratedOrgs.length > 0 ? migratedOrgs : (prev.processing_orgs || []),
          }));

          // 문서 목록 업데이트
          if (freshData.documents) {
            setDocuments(freshData.documents);
          }

          console.log(`[DEBUG] ✅ 전체 데이터 동기화 완료`);
        } else {
          console.warn(`[DEBUG] ⚠️ 고객 문서를 찾을 수 없음: ${customer.id}`);
        }
      } catch (error) {
        console.error(`[DEBUG] ❌ Firestore 조회 실패:`, error);
      }
    };

    fetchFreshCustomerData();
  }, [isOpen, customer?.id, isNewCustomer]);

  // [수정] 메모 실시간 로딩 (로그 추가)
  useEffect(() => {
    const customerId = formData.id;
    if (!customerId) {
      console.log("🚫 customerId 없음, 메모 로딩 건너뜀");
      return;
    }

    console.log(`📢 메모 로딩 시작 (Customer ID: ${customerId})`);

    const q = query(
      collection(db, "counseling_logs"),
      where("customer_id", "==", customerId),
      orderBy("created_at", "asc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(`✅ 메모 로드 성공: ${snapshot.size}개`);
        const logs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            content: data.content || "",
            author_id: data.author_id || "",
            author_name: data.author_name || "",
            created_at: data.created_at?.toDate?.() || new Date(),
            ...(data.is_deleted ? {
              is_deleted: true,
              deleted_by: data.deleted_by,
              deleted_by_name: data.deleted_by_name,
              deleted_at: data.deleted_at?.toDate?.() || undefined,
            } : {}),
          };
        }) as MemoItem[];
        setMemos(logs);
        setMemosLoaded(true); // 메모 로딩 완료
      },
      (error) => {
        console.error("🔥 메모 로딩 실패:", error);
        setMemosLoaded(true); // 에러가 나도 로딩 완료로 표시
      },
    );

    return () => unsubscribe();
  }, [formData.id]);

  // 상담 신청 데이터로부터 자동 메모 생성 (메모가 비어있을 때만)
  // 자동 생성 완료 여부를 추적하는 ref
  const autoMemoGeneratedRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const autoGenerateConsultationMemo = async () => {
      const customerId = formData.id;
      
      // 고객 ID가 없거나, 신규 고객이거나, 모달이 닫혀있으면 건너뜀
      if (!customerId || isNewCustomer || !isOpen) {
        return;
      }

      // 메모 로딩이 완료될 때까지 대기
      if (!memosLoaded) {
        console.log(`⏳ 메모 로딩 중, 자동 생성 대기...`);
        return;
      }

      // 이미 이 고객에 대해 자동 생성을 시도했으면 건너뜀
      if (autoMemoGeneratedRef.current.has(customerId)) {
        console.log(`📋 이미 자동 메모 생성 시도함 (Customer ID: ${customerId})`);
        return;
      }

      // 현재 메모 상태 확인 - 메모가 이미 있으면 건너뜀
      if (memos.length > 0) {
        console.log(`📋 이미 메모가 있음 (${memos.length}개), 자동 생성 건너뜀`);
        autoMemoGeneratedRef.current.add(customerId);
        return;
      }

      console.log(`🔍 상담 신청 데이터 조회 시작 (Customer ID: ${customerId})`);

      try {
        // 연결된 상담 신청 데이터 조회
        const consultation = await getConsultationByCustomerId(customerId);
        
        if (!consultation) {
          console.log(`📋 연결된 상담 신청 데이터 없음`);
          autoMemoGeneratedRef.current.add(customerId);
          return;
        }

        console.log(`✅ 상담 신청 데이터 발견:`, consultation);

        // 메모 요약 생성
        const memoSummary = generateConsultationMemoSummary(consultation);
        console.log(`📝 자동 생성된 메모 요약:\n${memoSummary}`);

        // 자동 생성 완료로 표시
        autoMemoGeneratedRef.current.add(customerId);

        // Firestore counseling_logs에 저장
        const now = new Date();
        const memoEntry = {
          content: memoSummary,
          author_id: "system",
          author_name: "시스템",
          created_at: now,
        };

        await addDoc(collection(db, "counseling_logs"), {
          customer_id: customerId,
          content: memoSummary,
          author_name: "시스템",
          author_id: "system",
          created_at: now,
          type: "auto_consultation_summary",
        });

        // 고객 문서의 memo_history 필드도 업데이트 (모달 재오픈 시 즉시 표시되도록)
        const customerRef = doc(db, "customers", customerId);
        const customerSnap = await getDoc(customerRef);
        if (customerSnap.exists()) {
          const existingMemoHistory = customerSnap.data().memo_history || [];
          await updateDoc(customerRef, {
            memo_history: [...existingMemoHistory, memoEntry],
            recent_memo: memoSummary,
            updated_at: Timestamp.now(),
          });
        }

        console.log(`✅ 상담 신청 요약 메모 자동 저장 완료`);
      } catch (error) {
        console.error("🔥 상담 신청 메모 자동 생성 실패:", error);
        // 에러가 나도 재시도 방지를 위해 표시
        autoMemoGeneratedRef.current.add(customerId);
      }
    };

    autoGenerateConsultationMemo();
  }, [formData.id, isOpen, isNewCustomer, memos.length, memosLoaded]);

  // Update tab when initialTab changes
  useEffect(() => {
    setActiveBottomTab(initialTab);
  }, [initialTab]);

  // Load history logs when history tab is selected or customer changes
  useEffect(() => {
    const loadHistoryLogs = async () => {
      if (activeBottomTab === "history" && customer?.id) {
        setIsLoadingHistory(true);
        try {
          const logs = await getCustomerHistoryLogs(customer.id);
          setHistoryLogs(logs);
        } catch (error) {
          console.error("Error loading history logs:", error);
          setHistoryLogs([]);
        } finally {
          setIsLoadingHistory(false);
        }
      }
    };
    loadHistoryLogs();
  }, [activeBottomTab, customer?.id, isOpen]);

  useEffect(() => {
    const loadContracts = async () => {
      if (customer?.id && isOpen) {
        if (activeBottomTab === "contracts") {
          setIsLoadingContracts(true);
        }
        try {
          const contracts = await getContractsByCustomer(customer.id);
          setCustomerContracts(contracts);
        } catch (error) {
          console.error("Error loading contracts:", error);
          setCustomerContracts([]);
        } finally {
          setIsLoadingContracts(false);
        }
      }
    };
    loadContracts();

    const loadPayments = async () => {
      if (customer?.id && isOpen && activeBottomTab === "contracts") {
        setIsLoadingPayments(true);
        try {
          const payments = await getPaymentsByCustomer(customer.id);
          setCustomerPayments(payments);
        } catch (error) {
          console.error("Error loading payments:", error);
          setCustomerPayments([]);
        } finally {
          setIsLoadingPayments(false);
        }
      }
    };
    loadPayments();
  }, [activeBottomTab, customer?.id, isOpen]);

  const getPaymentStateBadge = (state: string) => {
    const styles: Record<string, string> = {
      'W': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'F': 'bg-green-500/20 text-green-400 border-green-500/30',
      'C': 'bg-red-500/20 text-red-400 border-red-500/30',
      'D': 'bg-gray-500/20 text-gray-500 border-gray-500/30',
    };
    return styles[state] || 'bg-gray-500/20 text-gray-400';
  };

  const getPaymentStateLabel = (state: string) => {
    const labels: Record<string, string> = {
      'W': '미결제',
      'F': '결제완료',
      'C': '취소',
      'D': '파기',
    };
    return labels[state] || state;
  };

  const getContractStatusBadge = (status: ContractStatus) => {
    const displayStatus = (status === '서명대기' || status === '거부') ? '발송완료' : status;
    const styles: Record<string, string> = {
      '초안': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      '발송완료': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      '서명완료': 'bg-green-500/20 text-green-400 border-green-500/30',
      '무효': 'bg-gray-500/20 text-gray-500 border-gray-500/30',
    };
    return styles[displayStatus] || styles['초안'];
  };

  const getContractDisplayStatus = (status: ContractStatus): string => {
    if (status === '서명대기' || status === '거부') return '발송완료';
    return status;
  };

  const safeContractDate = (dateVal: any): string => {
    if (!dateVal) return '-';
    try {
      if (dateVal?.toDate) return format(dateVal.toDate(), 'yyyy-MM-dd HH:mm');
      if (dateVal instanceof Date) return format(dateVal, 'yyyy-MM-dd HH:mm');
      if (typeof dateVal === 'string') return format(new Date(dateVal), 'yyyy-MM-dd HH:mm');
      return '-';
    } catch {
      return '-';
    }
  };

  // Calculate 7-year status (D-2555 기준: 현재일로부터 2555일 초과 시 7년 초과)
  const handleFoundingDateChange = (date: string) => {
    const foundingDate = parseISO(date);
    const daysOld = differenceInDays(new Date(), foundingDate);
    const updatedData = {
      ...formData,
      founding_date: date,
      over_7_years: daysOld > 2555,
    };
    setFormData(updatedData);
    // debouncedSave 호출
    debouncedSave(updatedData);
  };

  // [수정] 단일 파일 업로드 함수 (압축 최적화 적용) - 내부용
  const uploadSingleFile = async (file: File): Promise<CustomerDocument | null> => {
    try {
      // 0. 파일 크기 검증
      const sizeValidation = validateFileSize(file);
      if (!sizeValidation.valid) {
        console.warn(sizeValidation.message);
        return null;
      }

      // 1. 이미지 파일인 경우 80% 품질로 압축
      let fileToUpload = file;
      if (file.type.startsWith('image/')) {
        const compressionResult = await compressImage(file);
        fileToUpload = compressionResult.file;
        
        if (compressionResult.wasCompressed) {
          console.log(
            `이미지 압축: ${formatFileSize(compressionResult.originalSize)} → ${formatFileSize(compressionResult.compressedSize)} (${Math.round((1 - compressionResult.compressedSize / compressionResult.originalSize) * 100)}% 감소)`
          );
        }
      }

      // 2. Storage 경로 설정 (신규 고객이면 temp 경로 사용)
      const currentId = formData.id || `temp_${Date.now()}`;
      const storageRef = ref(
        storage,
        `customers/${currentId}/${Date.now()}_${fileToUpload.name}`,
      );

      // 3. 파일 업로드 (압축된 파일)
      await uploadBytes(storageRef, fileToUpload);
      const downloadURL = await getDownloadURL(storageRef);

      // 4. 문서 객체 생성
      const newDoc: CustomerDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        customer_id: formData.id || "",
        file_name: file.name,
        file_url: downloadURL,
        file_type: file.type,
        uploaded_by: currentUser?.uid || "",
        uploaded_by_name: currentUser?.name || "관리자",
        uploaded_at: new Date(),
      };

      return newDoc;
    } catch (error) {
      console.error(`파일 업로드 실패 (${file.name}):`, error);
      return null;
    }
  };

  // [신규] 다중 파일 업로드 함수
  const uploadMultipleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length, fileName: '파일 업로드 중...' });
    
    try {
      // 병렬 업로드: 모든 파일을 동시에 업로드
      console.log(`🚀 ${files.length}개 파일 병렬 업로드 시작...`);
      const uploadPromises = files.map(file => uploadSingleFile(file));
      const uploadResults = await Promise.all(uploadPromises);
      
      const uploadedDocs = uploadResults.filter((doc): doc is CustomerDocument => doc !== null);
      const currentDocs = [...documents, ...uploadedDocs];
      
      // UI 즉시 반영
      setDocuments(currentDocs);
      if (uploadedDocs.length > 0) {
        setSelectedDocument(uploadedDocs[uploadedDocs.length - 1]);
      }

      // Firestore 저장 (기존 고객일 경우)
      if (formData.id && uploadedDocs.length > 0) {
        const customerRef = doc(db, "customers", formData.id);

        // DB에 모든 새 문서 추가 (arrayUnion으로 원자적 추가)
        for (const newDoc of uploadedDocs) {
          await updateDoc(customerRef, {
            documents: arrayUnion(newDoc),
          });
        }

        // 로컬 formData 동기화
        setFormData((prev) => ({ ...prev, documents: currentDocs }));

        // 대시보드 알림
        if (onSave) {
          onSave({ id: formData.id, documents: currentDocs });
        }

        // 로그 기록 (한 번에)
        await addDoc(collection(db, "counseling_logs"), {
          customer_id: formData.id,
          action_type: "document_upload",
          description: `파일 ${uploadedDocs.length}개 업로드: ${uploadedDocs.map(d => d.file_name).join(", ")}`,
          changed_by_name: currentUser?.name || "관리자",
          changed_at: new Date(),
          type: "log",
        });
      } else if (!formData.id) {
        // 신규 고객일 경우: formData에만 담아둠
        setFormData((prev) => ({ ...prev, documents: currentDocs }));
      }

      if (uploadedDocs.length > 0) {
        console.log(`✅ ${uploadedDocs.length}개 파일 업로드 완료`);
        
        // OCR 대상 파일 수집
        console.log("🔍 OCR 대상 파일 검색 시작...");
        const ocrTasks: { file: File; type: 'business' | 'vat' | 'credit' }[] = [];
        
        for (const uploadedFile of files) {
          const isBusinessReg = isBusinessRegistrationFile(uploadedFile.name);
          const isVatCert = isVatCertificateFile(uploadedFile.name);
          const isCreditReport = isCreditReportFile(uploadedFile.name);
          const isImage = uploadedFile.type.startsWith('image/');
          const isPdf = uploadedFile.type === 'application/pdf' || uploadedFile.type.includes('pdf');
          const isOCRSupported = isImage || isPdf;
          
          if (isBusinessReg && isOCRSupported) {
            ocrTasks.push({ file: uploadedFile, type: 'business' });
          } else if (isVatCert && isOCRSupported) {
            ocrTasks.push({ file: uploadedFile, type: 'vat' });
          } else if (isCreditReport && isOCRSupported) {
            ocrTasks.push({ file: uploadedFile, type: 'credit' });
          }
        }
        
        // OCR 병렬 처리 실행
        if (ocrTasks.length > 0) {
          console.log(`📋 OCR 처리 대상: ${ocrTasks.length}개 파일 (병렬 처리)`);
          processAllOCRFilesParallel(ocrTasks);
        }
      }
    } catch (error) {
      console.error("다중 파일 업로드 실패:", error);
      alert("파일 업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // [신규] 모든 OCR 파일 순차 처리 (누적 업데이트)
  const processAllOCRFiles = async (tasks: { file: File; type: 'business' | 'vat' | 'credit' }[]) => {
    setIsProcessingOCR(true);
    const allHighlightedFields = new Set<string>();
    
    console.log(`🚀 OCR 순차 처리 시작: ${tasks.length}개 파일`);
    
    try {
      for (const task of tasks) {
        console.log(`\n📋 처리 중: ${task.file.name} (${task.type === 'business' ? '사업자등록증' : '부가세 과세표준증명'})`);
        
        if (task.type === 'business') {
          // 사업자등록증 OCR
          const ocrResult = await extractBusinessRegistration(task.file);
          
          if (ocrResult) {
            // 누적 업데이트 (스프레드 연산자로 기존 데이터 유지)
            setFormData(prev => {
              const updatedData = { ...prev };
              
              if (ocrResult.company_name) {
                updatedData.company_name = ocrResult.company_name;
                allHighlightedFields.add('company_name');
              }
              if (ocrResult.ceo_name) {
                updatedData.name = ocrResult.ceo_name;
                allHighlightedFields.add('name');
              }
              if (ocrResult.founding_date) {
                updatedData.founding_date = ocrResult.founding_date;
                allHighlightedFields.add('founding_date');
                // Calculate 7-year status
                const foundingDate = parseISO(ocrResult.founding_date);
                const daysOld = differenceInDays(new Date(), foundingDate);
                updatedData.over_7_years = daysOld > 2555;
              }
              if (ocrResult.business_registration_number) {
                updatedData.business_registration_number = ocrResult.business_registration_number;
                allHighlightedFields.add('business_registration_number');
              }
              if (ocrResult.resident_id_front) {
                updatedData.ssn_front = ocrResult.resident_id_front;
                allHighlightedFields.add('ssn_front');
              }
              if (ocrResult.resident_id_back) {
                updatedData.ssn_back = ocrResult.resident_id_back;
                allHighlightedFields.add('ssn_back');
              }
              if (ocrResult.business_type_list && ocrResult.business_type_list.length > 0) {
                updatedData.business_type = ocrResult.business_type_list[0];
                allHighlightedFields.add('business_type');
                setOcrBusinessTypes(ocrResult.business_type_list);
              }
              if (ocrResult.business_item) {
                updatedData.business_item = ocrResult.business_item;
                allHighlightedFields.add('business_item');
              }
              if (ocrResult.business_address) {
                updatedData.business_address = ocrResult.business_address;
                allHighlightedFields.add('business_address');
              }
              if (ocrResult.business_address_detail) {
                updatedData.business_address_detail = ocrResult.business_address_detail;
                allHighlightedFields.add('business_address_detail');
              }
              
              debouncedSave(updatedData);
              return updatedData;
            });
            
            console.log(`[성공] 사업자등록증 완료: ${task.file.name}`);
          }
        } else if (task.type === 'vat') {
          // 부가세 과세표준증명 OCR
          const ocrResult = await extractVatCertificate(task.file);
          
          if (ocrResult) {
            // 누적 업데이트 (스프레드 연산자로 기존 데이터 유지)
            setFormData(prev => {
              const updatedData = { ...prev };
              
              if (ocrResult.recent_sales !== undefined) {
                updatedData.recent_sales = ocrResult.recent_sales;
                allHighlightedFields.add('recent_sales');
              }
              if (ocrResult.sales_y1 !== undefined) {
                updatedData.sales_y1 = ocrResult.sales_y1;
                allHighlightedFields.add('sales_y1');
              }
              if (ocrResult.sales_y2 !== undefined) {
                updatedData.sales_y2 = ocrResult.sales_y2;
                allHighlightedFields.add('sales_y2');
              }
              if (ocrResult.sales_y3 !== undefined) {
                updatedData.sales_y3 = ocrResult.sales_y3;
                allHighlightedFields.add('sales_y3');
              }
              
              debouncedSave(updatedData);
              return updatedData;
            });
            
            const currentYear = new Date().getFullYear();
            console.log(`[성공] 부가가치세 완료: ${task.file.name}`);
            console.log(`   - 최근매출 (${currentYear}년): ${ocrResult.recent_sales ?? '없음'}억`);
            console.log(`   - Y-1 (${currentYear - 1}년): ${ocrResult.sales_y1 ?? '없음'}억`);
            console.log(`   - Y-2 (${currentYear - 2}년): ${ocrResult.sales_y2 ?? '없음'}억`);
            console.log(`   - Y-3 (${currentYear - 3}년): ${ocrResult.sales_y3 ?? '없음'}억`);
          }
        } else if (task.type === 'credit') {
          // 신용공여내역 OCR
          const ocrResult = await extractCreditReport(task.file);
          
          if (ocrResult && ocrResult.obligations && ocrResult.obligations.length > 0) {
            // 금융 채무 데이터를 financial_obligations에 추가
            const newObligations: FinancialObligation[] = ocrResult.obligations.map((ob, idx) => ({
              id: `ocr-${Date.now()}-${idx}`,
              type: ob.type as 'loan' | 'guarantee',
              institution: ob.institution,
              product_name: ob.product_name,
              account_type: ob.account_type,
              balance: ob.balance,
              occurred_at: ob.occurred_at,
              maturity_date: ob.maturity_date,
            }));
            
            // financialObligations 상태 업데이트 (UI 즉시 반영)
            setFinancialObligations(prevObligations => {
              const mergedObligations = [...prevObligations];
              let addedCount = 0;
              
              newObligations.forEach(newOb => {
                const isDuplicate = mergedObligations.some(
                  existing => 
                    existing.institution === newOb.institution &&
                    existing.product_name === newOb.product_name &&
                    existing.balance === newOb.balance &&
                    existing.occurred_at === newOb.occurred_at
                );
                if (!isDuplicate) {
                  mergedObligations.push(newOb);
                  addedCount++;
                }
              });
              
              // 배지에 표시할 추출 건수 업데이트
              if (addedCount > 0) {
                setOcrExtractedCount(addedCount);
                // 5초 후 배지 숨기기
                setTimeout(() => setOcrExtractedCount(0), 5000);
              }
              
              return mergedObligations;
            });
            
            // formData도 동기화 (Firestore 저장용)
            setFormData(prev => {
              const existingObligations = prev.financial_obligations || [];
              const mergedObligations = [...existingObligations];
              
              newObligations.forEach(newOb => {
                const isDuplicate = mergedObligations.some(
                  existing => 
                    existing.institution === newOb.institution &&
                    existing.product_name === newOb.product_name &&
                    existing.balance === newOb.balance &&
                    existing.occurred_at === newOb.occurred_at
                );
                if (!isDuplicate) {
                  mergedObligations.push(newOb);
                }
              });
              
              const updatedData = { 
                ...prev, 
                financial_obligations: mergedObligations 
              };
              
              debouncedSave(updatedData);
              return updatedData;
            });
            
            // 금융 분석 탭으로 자동 전환
            setActiveCenterTab("financial");
            
            console.log(`[성공] 신용공여내역 완료: ${task.file.name}`);
            console.log(`   - 추출 건수: ${ocrResult.obligations.length}건`);
            console.log(`   - 대출: ${ocrResult.obligations.filter(o => o.type === 'loan').length}건`);
            console.log(`   - 보증: ${ocrResult.obligations.filter(o => o.type === 'guarantee').length}건`);
          }
        }
      }
      
      // 모든 처리 완료 후 하이라이트 적용
      setHighlightedFields(allHighlightedFields);
      setTimeout(() => {
        setHighlightedFields(new Set());
      }, 2000);
      
      console.log(`\n✅ 전체 OCR 처리 완료: ${tasks.length}개 파일`);
      
    } catch (error) {
      console.error("❌ OCR 순차 처리 중 오류:", error);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // [신규] OCR 병렬 처리 함수 - 여러 파일을 동시에 분석하고 결과를 병합
  // ⚠️ 모달이 닫혀도 OCR이 끝까지 진행되어 Firestore에 저장되도록 customerId를 클로저에 캡처
  const processAllOCRFilesParallel = async (tasks: { file: File; type: 'business' | 'vat' | 'credit' }[]) => {
    // 모달 lifecycle 독립을 위해 customer id를 즉시 캡처
    const capturedCustomerId = formData.id;
    setIsProcessingOCR(true);
    const allHighlightedFields = new Set<string>();
    
    console.log(`🚀 OCR 병렬 처리 시작: ${tasks.length}개 파일 (customerId=${capturedCustomerId || '신규'})`);
    
    try {
      // 모든 OCR 작업을 병렬로 실행
      const ocrPromises = tasks.map(async (task) => {
        console.log(`📋 처리 시작: ${task.file.name} (${task.type})`);
        
        if (task.type === 'business') {
          return { type: 'business' as const, result: await extractBusinessRegistration(task.file), file: task.file };
        } else if (task.type === 'vat') {
          return { type: 'vat' as const, result: await extractVatCertificate(task.file), file: task.file };
        } else {
          return { type: 'credit' as const, result: await extractCreditReport(task.file), file: task.file };
        }
      });
      
      const results = await Promise.all(ocrPromises);
      
      // 모든 결과를 먼저 수집 (병합 데이터)
      const mergedFormUpdates: Partial<typeof formData> = {};
      let allNewObligations: FinancialObligation[] = [];
      let lastBusinessTypeList: string[] | null = null;
      
      for (const { type, result, file } of results) {
        if (!result) continue;
        
        if (type === 'business') {
          const ocrResult = result as BusinessRegistrationData;
          
          if (ocrResult.company_name) {
            mergedFormUpdates.company_name = ocrResult.company_name;
            allHighlightedFields.add('company_name');
          }
          if (ocrResult.ceo_name) {
            mergedFormUpdates.name = ocrResult.ceo_name;
            allHighlightedFields.add('name');
          }
          if (ocrResult.founding_date) {
            mergedFormUpdates.founding_date = ocrResult.founding_date;
            allHighlightedFields.add('founding_date');
            const foundingDate = parseISO(ocrResult.founding_date);
            const daysOld = differenceInDays(new Date(), foundingDate);
            mergedFormUpdates.over_7_years = daysOld > 2555;
          }
          if (ocrResult.business_registration_number) {
            mergedFormUpdates.business_registration_number = ocrResult.business_registration_number;
            allHighlightedFields.add('business_registration_number');
          }
          if (ocrResult.resident_id_front) {
            mergedFormUpdates.ssn_front = ocrResult.resident_id_front;
            allHighlightedFields.add('ssn_front');
          }
          if (ocrResult.resident_id_back) {
            mergedFormUpdates.ssn_back = ocrResult.resident_id_back;
            allHighlightedFields.add('ssn_back');
          }
          if (ocrResult.business_type_list && ocrResult.business_type_list.length > 0) {
            mergedFormUpdates.business_type = ocrResult.business_type_list[0];
            allHighlightedFields.add('business_type');
            lastBusinessTypeList = ocrResult.business_type_list;
          }
          if (ocrResult.business_item) {
            mergedFormUpdates.business_item = ocrResult.business_item;
            allHighlightedFields.add('business_item');
          }
          if (ocrResult.business_address) {
            mergedFormUpdates.business_address = ocrResult.business_address;
            allHighlightedFields.add('business_address');
          }
          if (ocrResult.business_address_detail) {
            mergedFormUpdates.business_address_detail = ocrResult.business_address_detail;
            allHighlightedFields.add('business_address_detail');
          }
          console.log(`✅ 사업자등록증 완료: ${file.name}`);
          
        } else if (type === 'vat') {
          const ocrResult = result as VatCertificateData;
          
          if (ocrResult.recent_sales !== undefined) {
            mergedFormUpdates.recent_sales = ocrResult.recent_sales;
            allHighlightedFields.add('recent_sales');
          }
          if (ocrResult.sales_y1 !== undefined) {
            mergedFormUpdates.sales_y1 = ocrResult.sales_y1;
            allHighlightedFields.add('sales_y1');
          }
          if (ocrResult.sales_y2 !== undefined) {
            mergedFormUpdates.sales_y2 = ocrResult.sales_y2;
            allHighlightedFields.add('sales_y2');
          }
          if (ocrResult.sales_y3 !== undefined) {
            mergedFormUpdates.sales_y3 = ocrResult.sales_y3;
            allHighlightedFields.add('sales_y3');
          }
          console.log(`✅ 부가세과세표준증명 완료: ${file.name}`);
          
        } else if (type === 'credit') {
          const ocrResult = result as CreditReportData;
          if (ocrResult.obligations && ocrResult.obligations.length > 0) {
            const newObligations: FinancialObligation[] = ocrResult.obligations.map((ob, idx) => ({
              id: `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${idx}`,
              type: ob.type as 'loan' | 'guarantee',
              institution: ob.institution,
              product_name: ob.product_name,
              account_type: ob.account_type,
              balance: ob.balance,
              occurred_at: ob.occurred_at,
              maturity_date: ob.maturity_date,
            }));
            allNewObligations = [...allNewObligations, ...newObligations];
            console.log(`✅ 신용공여내역 완료: ${file.name} (${ocrResult.obligations.length}건)`);
          }
        }
      }
      
      // 업종 리스트 업데이트 (외부에서 한 번만) - 모달이 열려있을 때만 의미 있음
      if (lastBusinessTypeList) {
        try { setOcrBusinessTypes(lastBusinessTypeList); } catch {}
      }

      // ====== Firestore 직접 저장 (모달 lifecycle 독립) ======
      // 이 블록은 모달이 닫혀도 끝까지 실행되어 결과가 손실되지 않도록 보장
      if (capturedCustomerId && (Object.keys(mergedFormUpdates).length > 0 || allNewObligations.length > 0)) {
        try {
          const customerRef = doc(db, "customers", capturedCustomerId);
          const snap = await getDoc(customerRef);
          const latest: any = snap.exists() ? snap.data() : {};

          const directUpdate: any = { ...mergedFormUpdates };

          // 신용공여 내역 병합 (Firestore 최신 데이터 기준)
          if (allNewObligations.length > 0) {
            const existing: FinancialObligation[] = Array.isArray(latest.financial_obligations) ? latest.financial_obligations : [];
            const merged = [...existing];
            allNewObligations.forEach(newOb => {
              const isDup = merged.some(
                ex =>
                  ex.institution === newOb.institution &&
                  ex.product_name === newOb.product_name &&
                  ex.balance === newOb.balance &&
                  ex.occurred_at === newOb.occurred_at
              );
              if (!isDup) merged.push(newOb);
            });
            directUpdate.financial_obligations = merged;
          }

          directUpdate.updated_at = Timestamp.now();
          await updateDoc(customerRef, directUpdate);
          console.log("💾 OCR 결과 Firestore 직접 저장 완료 (모달 상태 무관)");

          // 부모(대시보드)에도 알림 (best-effort)
          try {
            if (onSave) {
              onSave({ id: capturedCustomerId, ...directUpdate });
            }
          } catch {}
        } catch (persistErr) {
          console.error("❌ OCR 결과 Firestore 직접 저장 실패:", persistErr);
        }
      }

      // ====== UI state 업데이트 (모달이 열려있을 때만 효과) ======
      // unmount 후 setState는 no-op이지만 안전하게 try/catch로 감쌈
      try {
        if (Object.keys(mergedFormUpdates).length > 0) {
          setFormData(prev => ({ ...prev, ...mergedFormUpdates }));
        }

        if (allNewObligations.length > 0) {
          setFinancialObligations(prev => {
            const merged = [...prev];
            let addedCount = 0;
            allNewObligations.forEach(newOb => {
              const isDup = merged.some(
                ex =>
                  ex.institution === newOb.institution &&
                  ex.product_name === newOb.product_name &&
                  ex.balance === newOb.balance &&
                  ex.occurred_at === newOb.occurred_at
              );
              if (!isDup) {
                merged.push(newOb);
                addedCount++;
              }
            });
            if (addedCount > 0) {
              setOcrExtractedCount(addedCount);
              setTimeout(() => setOcrExtractedCount(0), 5000);
            }
            return merged;
          });

          setFormData(prev => {
            const existingObligations = prev.financial_obligations || [];
            const mergedObligations = [...existingObligations];
            allNewObligations.forEach(newOb => {
              const isDup = mergedObligations.some(
                ex =>
                  ex.institution === newOb.institution &&
                  ex.product_name === newOb.product_name &&
                  ex.balance === newOb.balance &&
                  ex.occurred_at === newOb.occurred_at
              );
              if (!isDup) mergedObligations.push(newOb);
            });
            return { ...prev, financial_obligations: mergedObligations };
          });

          setActiveCenterTab("financial");
        }

        // 하이라이트 적용
        setHighlightedFields(allHighlightedFields);
        setTimeout(() => setHighlightedFields(new Set()), 2000);
      } catch {
        // 모달이 이미 unmount된 경우 무시
      }
      
      console.log(`\n✅ 전체 OCR 병렬 처리 완료: ${tasks.length}개 파일`);
      
    } catch (error) {
      console.error("❌ OCR 병렬 처리 중 오류:", error);
    } finally {
      try { setIsProcessingOCR(false); } catch {}
    }
  };

  // [기존] 사업자등록증 OCR 처리 및 자동 입력 (단일 파일용 - 유지)
  const processBusinessRegistrationOCR = async (file: File) => {
    setIsProcessingOCR(true);
    
    try {
      const ocrResult = await extractBusinessRegistration(file);
      
      if (ocrResult) {
        const fieldsToUpdate: Partial<typeof formData> = {};
        const newHighlightedFields = new Set<string>();
        
        if (ocrResult.company_name) {
          fieldsToUpdate.company_name = ocrResult.company_name;
          newHighlightedFields.add('company_name');
        }
        if (ocrResult.ceo_name) {
          fieldsToUpdate.name = ocrResult.ceo_name;
          newHighlightedFields.add('name');
        }
        if (ocrResult.founding_date) {
          fieldsToUpdate.founding_date = ocrResult.founding_date;
          newHighlightedFields.add('founding_date');
          // Calculate 7-year status
          const foundingDate = parseISO(ocrResult.founding_date);
          const daysOld = differenceInDays(new Date(), foundingDate);
          (fieldsToUpdate as any).over_7_years = daysOld > 2555;
        }
        if (ocrResult.business_registration_number) {
          fieldsToUpdate.business_registration_number = ocrResult.business_registration_number;
          newHighlightedFields.add('business_registration_number');
        }
        if (ocrResult.resident_id_front) {
          fieldsToUpdate.ssn_front = ocrResult.resident_id_front;
          newHighlightedFields.add('ssn_front');
        }
        if (ocrResult.resident_id_back) {
          fieldsToUpdate.ssn_back = ocrResult.resident_id_back;
          newHighlightedFields.add('ssn_back');
        }
        if (ocrResult.business_type_list && ocrResult.business_type_list.length > 0) {
          const extractedTypes = ocrResult.business_type_list.filter(t => t && t.trim());
          const uniqueExtracted = extractedTypes.filter(t => !BUSINESS_TYPES.includes(t));
          setOcrBusinessTypes(uniqueExtracted);
          
          fieldsToUpdate.business_type = extractedTypes[0];
          newHighlightedFields.add('business_type');
        } else if (ocrResult.business_type) {
          const extractedTypes = ocrResult.business_type.split(/[\/,]/).map(t => t.trim()).filter(Boolean);
          const uniqueExtracted = extractedTypes.filter(t => !BUSINESS_TYPES.includes(t));
          setOcrBusinessTypes(uniqueExtracted);
          
          fieldsToUpdate.business_type = extractedTypes[0] || ocrResult.business_type;
          newHighlightedFields.add('business_type');
        }
        if (ocrResult.business_item) {
          fieldsToUpdate.business_item = ocrResult.business_item;
          newHighlightedFields.add('business_item');
        }
        if (ocrResult.business_address) {
          fieldsToUpdate.business_address = ocrResult.business_address;
          newHighlightedFields.add('business_address');
        }
        if (ocrResult.business_address_detail) {
          fieldsToUpdate.business_address_detail = ocrResult.business_address_detail;
          newHighlightedFields.add('business_address_detail');
        }
        
        if (Object.keys(fieldsToUpdate).length > 0) {
          const updatedData = { ...formData, ...fieldsToUpdate };
          setFormData(updatedData);
          
          setHighlightedFields(newHighlightedFields);
          
          setTimeout(() => {
            setHighlightedFields(new Set());
          }, 2000);
          
          debouncedSave(updatedData);
          
          console.log("✅ 사업자등록증 정보 자동 입력 완료:", fieldsToUpdate);
        }
      }
    } catch (error) {
      console.error("사업자등록증 OCR 처리 실패:", error);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // [신규] 부가가치세 과세표준증명 OCR 처리 및 자동 입력
  const processVatCertificateOCR = async (file: File) => {
    setIsProcessingOCR(true);
    
    try {
      const ocrResult = await extractVatCertificate(file);
      
      if (ocrResult) {
        const fieldsToUpdate: Partial<typeof formData> = {};
        const newHighlightedFields = new Set<string>();
        
        if (ocrResult.recent_sales !== undefined) {
          fieldsToUpdate.recent_sales = ocrResult.recent_sales;
          newHighlightedFields.add('recent_sales');
        }
        if (ocrResult.sales_y1 !== undefined) {
          fieldsToUpdate.sales_y1 = ocrResult.sales_y1;
          newHighlightedFields.add('sales_y1');
        }
        if (ocrResult.sales_y2 !== undefined) {
          fieldsToUpdate.sales_y2 = ocrResult.sales_y2;
          newHighlightedFields.add('sales_y2');
        }
        if (ocrResult.sales_y3 !== undefined) {
          fieldsToUpdate.sales_y3 = ocrResult.sales_y3;
          newHighlightedFields.add('sales_y3');
        }
        
        if (Object.keys(fieldsToUpdate).length > 0) {
          const updatedData = { ...formData, ...fieldsToUpdate };
          setFormData(updatedData);
          
          setHighlightedFields(newHighlightedFields);
          
          setTimeout(() => {
            setHighlightedFields(new Set());
          }, 2000);
          
          debouncedSave(updatedData);
          
          const currentYear = new Date().getFullYear();
          console.log(`✅ 부가세 과세표준증명 매출 자동 입력 완료:`);
          console.log(`   - 최근매출 (${currentYear}년): ${ocrResult.recent_sales ?? '없음'}억`);
          console.log(`   - Y-1 매출 (${currentYear - 1}년): ${ocrResult.sales_y1 ?? '없음'}억`);
          console.log(`   - Y-2 매출 (${currentYear - 2}년): ${ocrResult.sales_y2 ?? '없음'}억`);
          console.log(`   - Y-3 매출 (${currentYear - 3}년): ${ocrResult.sales_y3 ?? '없음'}억`);
        }
      }
    } catch (error) {
      console.error("부가세 과세표준증명 OCR 처리 실패:", error);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // [추가] 파일 삭제 함수
  const handleDeleteFile = async (docToDelete: CustomerDocument) => {
    if (
      !window.confirm(`"${docToDelete.file_name}" 파일을 삭제하시겠습니까?`)
    ) {
      return;
    }

    try {
      // 1. Storage에서 실제 파일 삭제
      const storageRef = ref(storage, docToDelete.file_url);
      try {
        await deleteObject(storageRef);
      } catch (storageError) {
        console.warn(
          "Storage 파일 삭제 실패 (이미 삭제되었거나 존재하지 않음):",
          storageError,
        );
      }

      // 2. 로컬 상태 업데이트
      const updatedDocs = documents.filter((d) => d.id !== docToDelete.id);
      setDocuments(updatedDocs);
      setSelectedDocument(null);

      // 3. Firestore 업데이트 (기존 고객일 경우)
      if (formData.id) {
        const customerRef = doc(db, "customers", formData.id);
        await updateDoc(customerRef, {
          documents: updatedDocs,
        });

        // 로컬 formData 동기화
        setFormData((prev) => ({ ...prev, documents: updatedDocs }));

        // 대시보드 알림
        if (onSave) {
          onSave({ id: formData.id, documents: updatedDocs });
        }

        // 로그 기록
        await addDoc(collection(db, "counseling_logs"), {
          customer_id: formData.id,
          action_type: "document_delete",
          description: `파일 삭제: ${docToDelete.file_name}`,
          changed_by_name: currentUser?.name || "관리자",
          changed_at: new Date(),
          type: "log",
        });
      } else {
        setFormData((prev) => ({ ...prev, documents: updatedDocs }));
      }

      alert("파일이 삭제되었습니다.");
    } catch (error) {
      console.error("파일 삭제 실패:", error);
      alert("파일 삭제 중 오류가 발생했습니다.");
    }
  };

  // Handle file input change (다중 파일 지원)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadMultipleFiles(Array.from(files));
  };

  // Dropzone for drag & drop (다중 파일 지원)
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        uploadMultipleFiles(acceptedFiles);
      }
    },
    [customer?.id, currentUser, documents, formData.id],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
    },
    noClick: true, // We have a separate button for clicking
    disabled: isReadOnly, // Disable drag & drop for read-only users
    multiple: true, // 다중 파일 선택 허용
  });

  // [헬퍼] 재귀적 데이터 정제 함수 (모든 깊이의 Invalid Date 제거)
  const cleanData = (input: any): any => {
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }
    if (Array.isArray(input)) {
      return input.map(cleanData);
    }
    if (typeof input === "object" && input !== null) {
      const cleanedObj: any = {};
      Object.keys(input).forEach((key) => {
        const value = input[key];
        if (value !== undefined) {
          cleanedObj[key] = cleanData(value);
        }
      });
      return cleanedObj;
    }
    return input;
  };

  // Handle memo submit - saves immediately to Firestore and syncs with dashboard
  // [Gemini 최종 완결] 대시보드 싱크 불일치 해결 버전
  const handleMemoSubmit = async () => {
    // 1. 유효성 검사
    if (!newMemo.trim() || !currentUser) return;

    // ★ 자동저장 팀킬 방지
    debouncedSave.cancel();

    const content = newMemo.trim();
    const now = new Date();

    // 2. 새 메모 객체 생성
    const newLog: MemoItem = {
      id: `memo_${Date.now()}`,
      content,
      author_id: currentUser.uid,
      author_name: currentUser.name || "관리자",
      created_at: now,
    };

    // 3. [핵심] "완전체 리스트" 생성 (기존 + 신규)
    const updatedHistory = [...memos, newLog];

    // 4. UI 즉시 반영
    setMemos(updatedHistory);
    setNewMemo("");

    try {
      // 5. [로그 컬렉션] 저장
      if (formData.id) {
        await addDoc(collection(db, "counseling_logs"), {
          customer_id: formData.id,
          content: content,
          author_name: currentUser.name || "관리자",
          created_at: now,
          type: "memo",
        });
      }

      // 6. [고객 문서] 저장 & 대시보드 동기화
      if (formData.id) {
        // (1) DB 저장용 데이터 정제
        const historyForDB = updatedHistory.map((m) => ({
          content: m.content,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at: m.created_at,
        }));
        const safeHistory = cleanData(historyForDB);

        // (2) DB 업데이트 (덮어쓰기)
        await updateDoc(doc(db, "customers", formData.id), {
          recent_memo: content,
          latest_memo: content,
          last_memo_date: now,
          memo_history: safeHistory, // DB에도 저장하고
          updated_at: Timestamp.now(),
        });

        // (3) 로컬 formData 동기화
        setFormData((prev) => ({
          ...prev,
          recent_memo: content,
          latest_memo: content,
          last_memo_date: now,
          memo_history: updatedHistory,
        }));

        // (4) ★★★ 여기가 진짜 범인이었음!!! ★★★
        // 대시보드(부모)에게 "말풍선 리스트도 바뀌었어!"라고 알려줘야 함.
        // 이걸 안 알려주니까 대시보드가 옛날 리스트를 다시 내려보냈던 것임.
        if (onSave) {
          onSave({
            id: formData.id,
            recent_memo: content,
            latest_memo: content,
            last_memo_date: now,
            memo_history: updatedHistory, // ★ 이 한 줄이 빠져서 계속 증발했던 겁니다!
          });
        }
      }
    } catch (error) {
      console.error("🔥 메모 저장 실패:", error);
    }
  };
  const handleDeleteMemo = async (memoId: string) => {
    if (!currentUser || !formData.id) return;

    const updatedMemos = memos.map((m) =>
      m.id === memoId
        ? {
            ...m,
            is_deleted: true,
            deleted_by: currentUser.uid,
            deleted_by_name: currentUser.name || "관리자",
            deleted_at: new Date(),
          }
        : m
    );

    setMemos(updatedMemos);

    try {
      const historyForDB = updatedMemos.map((m) => ({
        content: m.content,
        author_id: m.author_id,
        author_name: m.author_name,
        created_at: m.created_at,
        ...(m.is_deleted
          ? {
              is_deleted: true,
              deleted_by: m.deleted_by,
              deleted_by_name: m.deleted_by_name,
              deleted_at: m.deleted_at,
            }
          : {}),
      }));
      const safeHistory = cleanData(historyForDB);

      const latestActiveMemo = [...updatedMemos]
        .reverse()
        .find((m) => !m.is_deleted);

      await updateDoc(doc(db, "customers", formData.id), {
        memo_history: safeHistory,
        recent_memo: latestActiveMemo?.content || "",
        latest_memo: latestActiveMemo?.content || "",
        last_memo_date: latestActiveMemo?.created_at || null,
        updated_at: Timestamp.now(),
      });

      const targetMemo = memos.find((m) => m.id === memoId);
      if (targetMemo) {
        const logsQuery = query(
          collection(db, "counseling_logs"),
          where("customer_id", "==", formData.id),
          where("content", "==", targetMemo.content),
          where("author_name", "==", targetMemo.author_name)
        );
        const logsSnapshot = await getDocs(logsQuery);
        for (const logDoc of logsSnapshot.docs) {
          await updateDoc(logDoc.ref, {
            is_deleted: true,
            deleted_by: currentUser.uid,
            deleted_by_name: currentUser.name || "관리자",
            deleted_at: new Date(),
          });
        }
      }

      setFormData((prev) => ({
        ...prev,
        recent_memo: latestActiveMemo?.content || "",
        latest_memo: latestActiveMemo?.content || "",
        memo_history: updatedMemos,
      }));

      if (onSave) {
        onSave({
          id: formData.id,
          recent_memo: latestActiveMemo?.content || "",
          latest_memo: latestActiveMemo?.content || "",
          memo_history: updatedMemos,
        });
      }
    } catch (error) {
      console.error("메모 삭제 실패:", error);
    }
  };

  // Handle AI query submit (실제 로컬 Ollama 연동, SSE 스트리밍)
  const handleAISubmit = async () => {
    const trimmed = aiInput.trim();
    if (!trimmed || aiIsStreaming) return;

    if (!aiConversationId) {
      toast({
        title: "AI 준비 중",
        description: aiInitError || "AI 대화를 초기화하는 중입니다. 잠시 후 다시 시도해주세요.",
        variant: aiInitError ? "destructive" : "default",
      });
      return;
    }

    const userMsg: AIMessage = {
      id: `ai_user_${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date(),
    };
    const assistantId = `ai_asst_${Date.now()}`;
    const assistantMsg: AIMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      created_at: new Date(),
    };
    setAiMessages((prev) => [...prev, userMsg, assistantMsg]);
    setAiInput("");
    setAiIsStreaming(true);

    requestAnimationFrame(() => {
      aiScrollRef.current?.scrollTo({
        top: aiScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });

    aiAbortRef.current?.abort();
    const ac = new AbortController();
    aiAbortRef.current = ac;

    try {
      await streamAIChat({
        conversationId: aiConversationId,
        message: trimmed,
        signal: ac.signal,
        onToken: (token) => {
          setAiMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m,
            ),
          );
          aiScrollRef.current?.scrollTo({
            top: aiScrollRef.current.scrollHeight,
          });
        },
        onDone: () => {
          setAiIsStreaming(false);
        },
        onError: (err) => {
          setAiIsStreaming(false);
          setAiMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `⚠️ 오류: ${err.message}` }
                : m,
            ),
          );
          toast({
            title: "AI 응답 실패",
            description: err.message,
            variant: "destructive",
          });
        },
      });
    } catch (err: any) {
      setAiIsStreaming(false);
      toast({
        title: "AI 호출 실패",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  // 모달 오픈 시 AI 대화 시작/재개 (기존 고객만)
  useEffect(() => {
    const customerId = formData.id;
    if (!isOpen || !customerId || isNewCustomer) {
      return;
    }
    if (aiStartedForCustomerRef.current === customerId) {
      return; // 이미 시작함
    }
    aiStartedForCustomerRef.current = customerId;
    setAiInitError(null);
    setAiConversationId(null);
    setAiMessages([]);

    (async () => {
      try {
        const { conversationId, messages } = await startAIConversation(customerId);
        setAiConversationId(conversationId);
        setAiMessages(messages);
      } catch (err: any) {
        const msg = err?.message || (typeof err === "string" ? err : "AI 대화 초기화 실패");
        setAiInitError(msg);
        console.error("[AI] 대화 초기화 실패:", msg, err);
      }
    })();
  }, [isOpen, formData.id, isNewCustomer]);

  // 모달 닫을 때 상태 초기화 + 진행 중인 스트리밍 중단
  useEffect(() => {
    if (!isOpen) {
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      aiStartedForCustomerRef.current = null;
      setAiConversationId(null);
      setAiMessages([]);
      setAiInitError(null);
      setAiIsStreaming(false);
      aiPredictedSignatureRef.current = "";
      aiPredictingRef.current = false;
      aiPredictAbortRef.current?.abort();
      aiPredictAbortRef.current = null;
      setAiPredictRunning(false);
    }
  }, [isOpen]);

  // 자동 자금 예측: 신용점수 + 사업자등록번호 + 매출 + 신용공여 4종 모두 충족 시 1회 호출
  // 데이터가 바뀔 때마다 시그니처가 갱신되어 재호출됨 (서버에서도 시그니처 비교)
  useEffect(() => {
    const customerId = formData.id;
    if (!isOpen || !customerId || isNewCustomer) return;

    const creditScore = Number(formData.credit_score || 0);
    const brn = (formData.business_registration_number || "").trim();
    const sales =
      Number(formData.recent_sales || 0) +
      Number(formData.sales_y1 || 0) +
      Number(formData.sales_y2 || 0) +
      Number(formData.sales_y3 || 0);
    const obligations = financialObligations || [];

    if (creditScore <= 0) return;
    if (!brn) return;
    if (sales <= 0) return;
    if (obligations.length === 0) return;

    const signature = JSON.stringify({
      cs: creditScore,
      brn,
      s: [formData.recent_sales, formData.sales_y1, formData.sales_y2, formData.sales_y3],
      ob: obligations.length,
      obSum: obligations.reduce((a, x) => a + (Number(x.balance) || 0), 0),
    });
    if (aiPredictedSignatureRef.current === signature) return;
    if (aiPredictingRef.current) return;

    aiPredictingRef.current = true;
    aiPredictedSignatureRef.current = signature;
    setAiPredictRunning(true);

    // 잦은 입력으로 인한 중복 호출을 막기 위해 약간 디바운스
    const timer = setTimeout(async () => {
      // 이전 진행 중 요청 취소
      aiPredictAbortRef.current?.abort();
      const ac = new AbortController();
      aiPredictAbortRef.current = ac;
      try {
        console.log("🤖 [AI 자동 자금 예측] 호출 시작");
        const result = await apiPredictFunding(customerId, { signal: ac.signal });
        const r: any = result;
        if (r?.skipped) {
          console.log("ℹ️ [AI 자동 자금 예측] 스킵:", r.reason);
        } else if (r?.accepted) {
          console.log("⏳ [AI 자동 자금 예측] 백그라운드 분석 시작");
          toast({
            title: "AI 자동 자금 예측 시작",
            description: "분석에 1~2분 정도 소요됩니다. 완료되면 메모 탭에 자동 표시됩니다.",
          });
        } else if (r?.success) {
          console.log("✅ [AI 자동 자금 예측] 메모 저장 완료");
          toast({
            title: "AI 자동 자금 예측 완료",
            description: "분석 결과가 메모에 저장되었습니다.",
          });
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          console.log("⏹️ [AI 자동 자금 예측] 요청 취소됨");
          return;
        }
        console.error("❌ [AI 자동 자금 예측] 실패:", err);
        // 실패 시 시그니처 초기화하여 재시도 가능
        aiPredictedSignatureRef.current = "";
        toast({
          title: "AI 자동 자금 예측 실패",
          description: err?.message || "잠시 후 다시 시도됩니다.",
          variant: "destructive",
        });
      } finally {
        if (aiPredictAbortRef.current === ac) aiPredictAbortRef.current = null;
        aiPredictingRef.current = false;
        setAiPredictRunning(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    isNewCustomer,
    formData.id,
    formData.credit_score,
    formData.business_registration_number,
    formData.recent_sales,
    formData.sales_y1,
    formData.sales_y2,
    formData.sales_y3,
    financialObligations,
  ]);

  // 1. 실제 저장 로직 (매번 재생성되어도 됨 - 최신 상태 참조)
  const runSaveLogic = async (dataToSave: any) => {
    if (!dataToSave?.name?.trim()) return;

    setSaveStatus("saving");
    setIsSaving(true);
    try {
      const phone = `${dataToSave.phone_part1 || "010"}-${dataToSave.phone_part2 || ""}-${dataToSave.phone_part3 || ""}`;
      const latestMemo =
        memos.length > 0 ? memos[memos.length - 1].content : "";

      const customerData: Partial<Customer> = {
        ...(dataToSave.id && { id: dataToSave.id }),
        name: dataToSave.name,
        company_name: dataToSave.company_name || "",
        business_registration_number:
          dataToSave.business_registration_number || "",
        phone,
        email: dataToSave.email || "",
        status_code: dataToSave.status_code || "상담대기",
        manager_id: dataToSave.manager_id || currentUser?.uid || "",
        manager_name: dataToSave.manager_name || currentUser?.name || "",
        team_id: dataToSave.team_id || currentUser?.team_id || "",
        team_name: dataToSave.team_name || currentUser?.team_name || "",
        entry_date: dataToSave.entry_date || "",
        founding_date: dataToSave.founding_date || "",
        credit_score: dataToSave.credit_score || 0,
        ssn_front: dataToSave.ssn_front || "",
        ssn_back: dataToSave.ssn_back || "",
        carrier: dataToSave.carrier || "SKT",
        home_address: dataToSave.home_address || "",
        home_address_detail: dataToSave.home_address_detail || "",
        is_home_owned: dataToSave.is_home_owned || false,
        is_same_as_business: dataToSave.is_same_as_business || false,
        entry_source: dataToSave.entry_source ? normalizeEntrySource(dataToSave.entry_source) : "광고",
        business_type: dataToSave.business_type || "기타",
        business_item: dataToSave.business_item || "",
        retry_type: dataToSave.retry_type || "해당없음",
        innovation_type: dataToSave.innovation_type || "해당없음",
        over_7_years: dataToSave.over_7_years || false,
        business_address: dataToSave.business_address || "",
        business_address_detail: dataToSave.business_address_detail || "",
        is_business_owned: dataToSave.is_business_owned || false,
        recent_sales: dataToSave.recent_sales || 0,
        sales_y1: dataToSave.sales_y1 || 0,
        sales_y2: dataToSave.sales_y2 || 0,
        sales_y3: dataToSave.sales_y3 || 0,
        avg_revenue_3y: dataToSave.avg_revenue_3y || 0,
        approved_amount: dataToSave.approved_amount || 0,
        commission_rate: dataToSave.commission_rate || 0,
        processing_org: dataToSave.processing_org || "미등록",
        industry: dataToSave.industry || "",
        notes: dataToSave.notes || "",
        recent_memo: latestMemo,
        latest_memo: latestMemo,
        memo_history: memos.map((m) => ({
          content: m.content,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at: m.created_at,
        })),
        documents,
        // 금융 채무 데이터 저장 (핵심!)
        financial_obligations: dataToSave.financial_obligations || [],
        // 진행기관 데이터 저장
        processing_orgs: dataToSave.processing_orgs || [],
        updated_at: new Date(),
      };

      // 디버그: 저장되는 금융 채무 데이터 로그
      if (dataToSave.financial_obligations?.length > 0) {
        console.log(`[SAVE] 💾 금융 채무 저장: ${dataToSave.financial_obligations.length}건`);
      }

      // ★핵심: 저장 전 데이터 청소 (Invalid Date, undefined 제거)
      const sanitizedData = cleanData(customerData);
      console.log("💾 Firestore 저장 (Sanitized):", sanitizedData);

      const returnedId = await onSave(sanitizedData);

      if (returnedId && !dataToSave.id) {
        setFormData((prev) => ({
          ...prev,
          id: returnedId,
          phone_part1: prev.phone_part1,
          phone_part2: prev.phone_part2,
          phone_part3: prev.phone_part3,
        }));
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Error saving customer:", error);
      setSaveStatus("idle");
    } finally {
      setIsSaving(false);
    }
  };

  // 2. 최신 저장 로직을 담을 Ref
  const saveLogicRef = useRef(runSaveLogic);

  // 3. 렌더링마다 Ref에 최신 로직 업데이트
  saveLogicRef.current = runSaveLogic;

  // 4. ★무적 타이머: 의존성 배열이 비어있음 -> 절대 재생성 안 됨
  const debouncedSave = useMemo(
    () =>
      debounce((newData: any) => {
        console.log("⏳ 1초 경과, 저장 실행!", newData);
        saveLogicRef.current(newData);
      }, 1000),
    [], // ★핵심: 부모가 리렌더링되든 말든 이 타이머는 영원히 유지됨
  );

  const handleFieldChange = (e: any) => {
    // 1. 값 추출 (어떤 형태의 입력이든 다 받아줌)
    let name = "";
    let value: any = "";

    if (e && e.target) {
      // 일반 input 태그인 경우 (name 속성이 있는 input)
      name = e.target.name;
      value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    } else if (e && typeof e === "object") {
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

    // 3. 저장 함수 호출
    debouncedSave(newData);
  };

  // Handle object updates (for complex field changes like founding_date with over_7_years)
  const handleFieldChangeObject = useCallback(
    (updates: Partial<typeof formData>) => {
      setFormData((prev) => {
        const updatedData = { ...prev, ...updates };
        // 직접 debouncedSave 호출
        debouncedSave(updatedData);
        return updatedData;
      });
    },
    [debouncedSave],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Save on blur (when focus leaves input) - 즉시 저장
  const handleBlurSave = useCallback(() => {
    debouncedSave.flush(); // 대기 중인 저장을 즉시 실행
  }, [debouncedSave]);

  // Handle financial obligations change
  const handleFinancialObligationsChange = useCallback((newObligations: FinancialObligation[]) => {
    setFinancialObligations(newObligations);
    setFormData(prev => {
      const next = { ...prev, financial_obligations: newObligations };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  // Handle proposal generation
  const handleGenerateProposal = useCallback(() => {
    setProposalModalOpen(true);
  }, []);

  const handleProposalFormSubmit = useCallback((data: ProposalFormData) => {
    // Convert agencies to the format expected by ProposalPreview
    const agencies = data.agencies.map(agency => ({
      name: agency.name,
      limit: agency.amount,
      rate: agency.rate || "협의",
      period: agency.period || "5년",
      monthlyPayment: "협의 후 결정"
    }));
    
    setProposalAgencies(agencies);
    setProposalDesiredAmount(data.desiredAmount);
    setProposalModalOpen(false);
    setProposalPreviewOpen(true);
  }, []);

  // Handle delete
  const handleDelete = async () => {
    if (!customer?.id || !onDelete) return;
    if (!window.confirm("정말 이 고객을 삭제하시겠습니까?")) return;

    try {
      await onDelete(customer.id);
      onClose();
    } catch (error) {
      console.error("Error deleting customer:", error);
    }
  };

  const handleSendBusinessCard = async () => {
    if (!customer?.id) return;
    
    const customerPhone = [formData.phone_part1, formData.phone_part2, formData.phone_part3]
      .filter(Boolean)
      .join('-');
    
    if (!customerPhone || customerPhone === '-') {
      toast({
        title: "발송 실패",
        description: "고객 연락처가 없습니다.",
        variant: "destructive",
      });
      return;
    }
    
    const manager = users.find(u => u.uid === customer.manager_id) || currentUser;
    if (!manager) {
      toast({
        title: "발송 실패",
        description: "담당자 정보를 찾을 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSendingBusinessCard(true);
    
    try {
      const { authFetch } = await import('@/lib/firebase');
      const response = await authFetch('/api/solapi/send-businesscard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone,
          customerName: formData.name || '고객',
          managerName: manager.name || manager.email,
          managerPhone: manager.phone_work || manager.phone || '',
          managerEmail: manager.email || '',
          businessAddress: formData.business_address || '',
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "명함 발송 완료",
          description: `${formData.name}님에게 명함이 발송되었습니다.`,
        });
      } else {
        toast({
          title: "발송 실패",
          description: result.message || result.error || "알 수 없는 오류",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "발송 오류",
        description: error.message || "서버 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSendingBusinessCard(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] w-[calc(100%-1rem)] md:w-[90vw] h-[95vh] md:h-[90vh] p-0 bg-card flex flex-col overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>
            {isNewCustomer
              ? "신규 고객 등록"
              : `${customer?.name || "고객"} 상세정보`}
          </DialogTitle>
        </VisuallyHidden>
        {/* Header - h-14 md:h-16 shrink-0 고정 */}
        <div className="h-14 md:h-16 shrink-0 flex items-center justify-between px-3 md:px-6 border-b bg-card/80">
          <div className="flex items-center gap-2 md:gap-3 overflow-x-auto">
            <h2 className="text-base md:text-lg font-bold text-foreground whitespace-nowrap">
              {isNewCustomer
                ? "신규 고객 등록"
                : `${customer?.name || "고객"} 상세정보`}
            </h2>
            {customer?.id && !isNewCustomer && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendBusinessCard}
                disabled={isSendingBusinessCard}
                className="h-7 text-xs"
                data-testid="button-send-businesscard"
              >
                {isSendingBusinessCard ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <CreditCard className="w-3 h-3 mr-1" />
                )}
                명함발송
              </Button>
            )}
            {customer?.id && !isNewCustomer && (() => {
              const completedContract = customerContracts.find(c => c.status === '서명완료');
              if (completedContract && completedContract.document_id) {
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={downloadingContractId === 'header'}
                    onClick={async () => {
                      setDownloadingContractId('header');
                      try {
                        const { authFetch } = await import('@/lib/firebase');
                        const res = await authFetch(`/api/eformsign/documents/${completedContract.document_id}/download`);
                        if (!res.ok) {
                          const errData = await res.json().catch(() => ({}));
                          throw new Error(errData.error || '다운로드에 실패했습니다.');
                        }
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${customer.company_name || customer.name}_계약서.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error: any) {
                        toast({ title: '다운로드 실패', description: error.message, variant: 'destructive' });
                      } finally {
                        setDownloadingContractId(null);
                      }
                    }}
                    className="h-7 text-xs"
                    data-testid="button-download-contract"
                  >
                    {downloadingContractId === 'header' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3 mr-1" />
                    )}
                    다운로드
                  </Button>
                );
              }
              return (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContractSendModalOpen(true)}
                  className="h-7 text-xs"
                  data-testid="button-send-contract"
                >
                  <FileSignature className="w-3 h-3 mr-1" />
                  전자계약
                </Button>
              );
            })()}
            {currentUser?.role === 'super_admin' && formData.id && (
              <Select
                value={formData.db_grade || ''}
                onValueChange={async (value) => {
                  const grade = value as 'S' | 'A' | 'B' | 'C' | 'F';
                  setFormData(prev => ({ ...prev, db_grade: grade }));
                  try {
                    const customerRef = doc(db, "customers", formData.id!);
                    await updateDoc(customerRef, { db_grade: grade, updated_at: new Date() });
                  } catch (error) {
                    console.error('DB등급 저장 실패:', error);
                  }
                }}
              >
                <SelectTrigger className="h-7 w-[80px] text-xs" data-testid="select-db-grade">
                  <SelectValue placeholder="DB등급" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">S등급</SelectItem>
                  <SelectItem value="A">A등급</SelectItem>
                  <SelectItem value="B">B등급</SelectItem>
                  <SelectItem value="C">C등급</SelectItem>
                  <SelectItem value="F">F등급</SelectItem>
                </SelectContent>
              </Select>
            )}
            {/* Read-only indicator for staff users */}
            {isReadOnly && (
              <Badge
                variant="outline"
                className="bg-yellow-900/30 text-yellow-400 border-yellow-600/30 text-xs"
              >
                <Lock className="w-3 h-3 mr-1" />
                읽기 전용
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save status indicator - hide for read-only users */}
            {!isReadOnly && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {isProcessingOCR && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                    <span className="text-blue-400">OCR 분석 중...</span>
                  </>
                )}
                {!isProcessingOCR && saveStatus === "saving" && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>저장 중...</span>
                  </>
                )}
                {!isProcessingOCR && saveStatus === "saved" && (
                  <>
                    <Check className="w-3 h-3 text-green-500" />
                    <span className="text-green-500">데이터가 안전하게 보관되었습니다</span>
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

        {/* Main Content - 3단 레이아웃 (좌-중-우), 모바일은 세로 스크롤 */}
        <div className="flex-1 flex flex-col md:flex-row h-[calc(100%-3.5rem)] md:h-[calc(100%-4rem)] overflow-y-auto md:overflow-hidden">
          {/* Section 1: 좌측 패널 - 상세 정보 입력 (35%) */}
          <div className="w-full md:w-[25%] md:min-w-[260px] h-auto md:h-full border-b md:border-b-0 md:border-r overflow-y-auto shrink-0">
            <div className="p-1.5 space-y-1">
              {/* 유입경로 (최상단) - 1. 상단에 바짝 붙임 */}
              <div className="space-y-0.5 ml-[6px] mr-[6px] pl-[0px] pr-[0px] pt-[0px] pb-[0px]">
                <Label className="text-xs text-muted-foreground ml-[11px] mr-[11px]">
                  유입경로
                </Label>
                <Select
                  value={formData.entry_source || "광고"}
                  onValueChange={(v) => handleFieldChange({ entry_source: v })}
                  disabled={isReadOnly}
                >
                  <SelectTrigger
                    className={cn(
                      "border-border text-foreground h-8 text-sm",
                      isReadOnly
                        ? "bg-muted cursor-not-allowed opacity-70"
                        : "bg-muted",
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    {ENTRY_SOURCES.map((src) => (
                      <SelectItem
                        key={src}
                        value={src}
                        className="text-foreground text-sm"
                      >
                        {src}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 고객 정보 그룹 (Border Box) - 10줄 압축 배치 */}
              <div className="border rounded-lg p-2 space-y-0.5 mx-1.5 pt-[16px] pb-[16px] mt-[30px] mb-[30px]">
                <h3 className="font-semibold text-blue-400 mb-1 text-[14px]">
                  고객 정보
                </h3>

                {/* Row 1: 이름(29%) | 신용점수(21%) | 주민번호 앞(25%) | 주민번호 뒤(25%) = 총 100% */}
                <div className="flex gap-1.5 items-end">
                  {/* 이름: 기존 약 33%에서 29%로 살짝 축소 */}
                  <div className="w-[29%]">
                    <Label className="text-[10px] text-muted-foreground">이름</Label>
                    <Input
                      value={formData.name || ""}
                      onChange={(e) =>
                        handleFieldChange({ name: e.target.value })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full transition-colors duration-300",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                        highlightedFields.has('name') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                      )}
                      data-testid="input-customer-name"
                    />
                  </div>

                  {/* 신용점수: 기존 약 17%에서 21%로 살짝 확대 */}
                  <div className="w-[21%]">
                    <Label className="text-[10px] text-muted-foreground">
                      신용점수
                    </Label>
                    <Input
                      type="number"
                      value={formData.credit_score || ""}
                      onChange={(e) =>
                        handleFieldChange({
                          credit_score: Number(e.target.value),
                        })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                      )}
                    />
                  </div>

                  {/* 주민번호(앞): 완벽한 25% 유지 */}
                  <div className="w-[25%]">
                    <Label className="text-[10px] text-muted-foreground">
                      주민번호(앞)
                    </Label>
                    <Input
                      maxLength={6}
                      value={formData.ssn_front || ""}
                      onChange={(e) =>
                        handleFieldChange({ ssn_front: e.target.value })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                      )}
                      placeholder="YYMMDD"
                    />
                  </div>

                  {/* 주민번호(뒤): 완벽한 25% 유지 */}
                  <div className="w-[25%]">
                    <Label className="text-[10px] text-muted-foreground">
                      주민번호(뒤)
                    </Label>
                    <Input
                      maxLength={7}
                      value={formData.ssn_back || ""}
                      onChange={(e) =>
                        handleFieldChange({ ssn_back: e.target.value })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                      )}
                      placeholder="0000000"
                    />
                  </div>
                </div>
                {/* Row 2: 연락처 (010-0000-0000) | 통신사 */}
                <div className="flex gap-1.5 items-end">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">연락처</Label>
                    <div className="flex items-center gap-0.5">
                      <Input
                        value={formData.phone_part1 || "010"}
                        onChange={(e) =>
                          handleFieldChange({ phone_part1: e.target.value })
                        }
                        onBlur={handleBlurSave}
                        disabled={isReadOnly}
                        className={cn(
                          "border-border text-foreground h-7 text-xs text-center w-16",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      />
                      <span className="text-muted-foreground text-xs">-</span>
                      <Input
                        maxLength={4}
                        value={formData.phone_part2 || ""}
                        onChange={(e) =>
                          handleFieldChange({ phone_part2: e.target.value })
                        }
                        onBlur={handleBlurSave}
                        disabled={isReadOnly}
                        className={cn(
                          "border-border text-foreground h-7 text-xs text-center flex-1",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      />
                      <span className="text-muted-foreground text-xs">-</span>
                      <Input
                        maxLength={4}
                        value={formData.phone_part3 || ""}
                        onChange={(e) =>
                          handleFieldChange({ phone_part3: e.target.value })
                        }
                        onBlur={handleBlurSave}
                        disabled={isReadOnly}
                        className={cn(
                          "border-border text-foreground h-7 text-xs text-center flex-1",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      />
                    </div>
                  </div>
                  <div className="w-[140px]">
                    <Label className="text-[10px] text-muted-foreground">통신사</Label>
                    <Select
                      value={formData.carrier || "SKT"}
                      onValueChange={(v) => handleFieldChange({ carrier: v })}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger
                        className={cn(
                          "border-border text-foreground h-7 text-xs w-full",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        {CARRIERS.map((c) => (
                          <SelectItem
                            key={c}
                            value={c}
                            className="text-foreground text-xs"
                          >
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 3: 자택주소 검색 (전체 너비) */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">자택주소</Label>
                  <div className="flex gap-1">
                    <Input
                      value={formData.home_address || ""}
                      readOnly
                      className={cn(
                        "border-border text-foreground flex-1 h-7 text-xs",
                        isReadOnly ? "bg-muted opacity-70" : "bg-muted",
                      )}
                      placeholder="주소 검색"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowHomeAddressSearch(true)}
                      disabled={formData.is_same_as_business || isReadOnly}
                      className={cn(
                        "border-border h-7 w-7 p-0",
                        (formData.is_same_as_business || isReadOnly) && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <Search className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Row 4: 상세주소 | 자가 */}
                <div className="flex gap-1.5 items-end">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">
                      상세주소
                    </Label>
                    <Input
                      value={formData.home_address_detail || ""}
                      onChange={(e) =>
                        handleFieldChange({
                          home_address_detail: e.target.value,
                        })
                      }
                      disabled={formData.is_same_as_business || isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                      )}
                      placeholder="동/호수"
                    />
                  </div>
                  <div className="flex items-center gap-1 h-7">
                    <Checkbox
                      id="home-owned"
                      checked={formData.is_home_owned || false}
                      onCheckedChange={(c) =>
                        handleFieldChange({ is_home_owned: !!c })
                      }
                      disabled={formData.is_same_as_business || isReadOnly}
                      className={cn(
                        "h-3 w-3",
                        isReadOnly && "opacity-50 cursor-not-allowed",
                      )}
                    />
                    <Label
                      htmlFor="home-owned"
                      className="text-[10px] text-muted-foreground"
                    >
                      자가
                    </Label>
                  </div>
                </div>

                {/* Daum Postcode Modal for Home */}
                {showHomeAddressSearch && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-[400px] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
                        <span className="font-medium text-gray-700">
                          자택 주소 검색
                        </span>
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

              {/* 사업자 정보 그룹 (Border Box) - 10줄 압축 배치 */}
              <div className="border rounded-lg p-2 space-y-0.5 mx-1.5 pl-[8px] pr-[8px] pt-[16px] pb-[16px] mt-[30px] mb-[30px]">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-emerald-400 text-[14px]">
                    사업자 정보
                  </h3>
                  {isProcessingOCR && (
                    <div className="flex items-center gap-1 text-xs text-blue-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>AI 자동 인식 중...</span>
                    </div>
                  )}
                  {highlightedFields.size > 0 && !isProcessingOCR && (
                    <Badge variant="secondary" className="text-[10px] bg-yellow-500/20 text-yellow-500">
                      자동 입력됨
                    </Badge>
                  )}
                </div>

                {/* Row 5: 상호명 | 개업일 */}
                <div className="flex gap-1.5 items-end">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">상호명</Label>
                    <Input
                      value={formData.company_name || ""}
                      onChange={(e) =>
                        handleFieldChange({ company_name: e.target.value })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full transition-colors duration-300",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                        highlightedFields.has('company_name') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                      )}
                      data-testid="input-company-name"
                    />
                  </div>
                  <div className="w-36 min-w-[144px]">
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        개업일
                      </Label>
                      {formData.founding_date && formData.over_7_years && (
                        <Badge
                          variant="secondary"
                          className="text-[8px] px-0.5 py-0 bg-orange-600/20 text-orange-400 leading-tight"
                        >
                          7년초과
                        </Badge>
                      )}
                    </div>
                    <Input
                      type="date"
                      value={formData.founding_date || ""}
                      onChange={(e) => handleFoundingDateChange(e.target.value)}
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full transition-colors duration-300",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                        highlightedFields.has('founding_date') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                      )}
                    />
                  </div>
                </div>

                {/* Row 6: 업종 | 종목 (12분할 그리드 - 각 6칸) */}
                <div className="grid grid-cols-12 gap-1 items-end">
                  <div className="col-span-6">
                    <Label className="text-[10px] text-muted-foreground">업종</Label>
                    <Input
                      value={formData.business_type || ""}
                      onChange={(e) =>
                        handleFieldChange({ business_type: e.target.value })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full transition-colors duration-300",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                        highlightedFields.has('business_type') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                      )}
                      placeholder="업종 입력"
                    />
                  </div>
                  <div className="col-span-6">
                    <Label className="text-[10px] text-muted-foreground">종목</Label>
                    <Input
                      value={formData.business_item || ""}
                      onChange={(e) =>
                        handleFieldChange({ business_item: e.target.value })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full transition-colors duration-300",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                        highlightedFields.has('business_item') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                      )}
                    />
                  </div>
                </div>

                {/* Row 7: 사업자번호 | 재도전 | 혁신 (12분할 그리드 - 6:3:3) */}
                <div className="grid grid-cols-12 gap-1 items-end">
                  <div className="col-span-6">
                    <Label className="text-[10px] text-muted-foreground">
                      사업자번호
                    </Label>
                    <Input
                      value={formData.business_registration_number || ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        let formatted = value;
                        if (value.length > 3 && value.length <= 5) {
                          formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
                        } else if (value.length > 5) {
                          formatted = `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5, 10)}`;
                        }
                        handleFieldChange({
                          business_registration_number: formatted,
                        });
                      }}
                      maxLength={12}
                      disabled={isReadOnly}
                      className={cn(
                        "border-border text-foreground h-7 text-xs w-full transition-colors duration-300",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                        highlightedFields.has('business_registration_number') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                      )}
                      placeholder="000-00-00000"
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[10px] text-muted-foreground">재도전</Label>
                    <Select
                      value={formData.retry_type || "해당없음"}
                      onValueChange={(v) =>
                        handleFieldChange({ retry_type: v })
                      }
                      disabled={isReadOnly}
                    >
                      <SelectTrigger
                        className={cn(
                          "border-border text-foreground h-7 text-xs w-full",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        {RETRY_OPTIONS.map((o) => (
                          <SelectItem
                            key={o}
                            value={o}
                            className="text-foreground text-xs"
                          >
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-[10px] text-muted-foreground">혁신</Label>
                    <Select
                      value={formData.innovation_type || "해당없음"}
                      onValueChange={(v) =>
                        handleFieldChange({ innovation_type: v })
                      }
                      disabled={isReadOnly}
                    >
                      <SelectTrigger
                        className={cn(
                          "border-border text-foreground h-7 text-xs w-full",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-muted border-border">
                        {INNOVATION_OPTIONS.map((o) => (
                          <SelectItem
                            key={o}
                            value={o}
                            className="text-foreground text-xs"
                          >
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 8: 사업장소재지 검색 (전체 너비) */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">
                    사업장 소재지
                  </Label>
                  <div className="flex gap-1">
                    <Input
                      value={formData.business_address || ""}
                      readOnly
                      className={cn(
                        "border-border text-foreground flex-1 h-7 text-xs transition-colors duration-300",
                        isReadOnly ? "bg-muted opacity-70" : "bg-muted",
                        highlightedFields.has('business_address') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                      )}
                      placeholder="주소 검색"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBusinessAddressSearch(true)}
                      className={cn(
                        "border-border h-7 w-7 p-0",
                        isReadOnly && "opacity-50 cursor-not-allowed",
                      )}
                      disabled={isReadOnly}
                    >
                      <Search className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Row 9: 상세주소 | 자가 | 자택동일 */}
                <div className="flex gap-1.5 items-end">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">
                      상세주소
                    </Label>
                    <Input
                      value={formData.business_address_detail || ""}
                      onChange={(e) =>
                        handleFieldChange({
                          business_address_detail: e.target.value,
                        })
                      }
                      className={cn(
                        "border-border text-foreground h-7 text-xs",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                      )}
                      placeholder="동/호수"
                      disabled={isReadOnly}
                    />
                  </div>
                  <div className="flex items-center gap-1 h-7">
                    <Checkbox
                      id="business-owned"
                      checked={formData.is_business_owned || false}
                      onCheckedChange={(c) =>
                        handleFieldChange({ is_business_owned: !!c })
                      }
                      disabled={isReadOnly}
                      className={cn(
                        "h-3 w-3",
                        isReadOnly && "opacity-50 cursor-not-allowed",
                      )}
                    />
                    <Label
                      htmlFor="business-owned"
                      className="text-[10px] text-muted-foreground"
                    >
                      자가
                    </Label>
                  </div>
                  <div className="flex items-center gap-1 h-7">
                    <Checkbox
                      id="same-address"
                      checked={formData.is_same_as_business || false}
                      onCheckedChange={(c) => {
                        handleFieldChangeObject({
                          is_same_as_business: !!c,
                          home_address: c
                            ? formData.business_address
                            : formData.home_address,
                          home_address_detail: c
                            ? formData.business_address_detail
                            : formData.home_address_detail,
                          is_home_owned: c
                            ? formData.is_business_owned
                            : formData.is_home_owned,
                        });
                      }}
                      disabled={isReadOnly}
                      className={cn(
                        "h-3 w-3",
                        isReadOnly && "opacity-50 cursor-not-allowed",
                      )}
                    />
                    <Label
                      htmlFor="same-address"
                      className="text-[10px] text-muted-foreground"
                    >
                      자택동일
                    </Label>
                  </div>
                </div>

                {/* Row 10: 최근 매출 | Y-1 매출 | Y-2 매출 | Y-3 매출 (4등분) */}
                <div className="grid grid-cols-4 gap-1">
                  <div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        최근 매출
                      </Label>
                      {highlightedFields.has('recent_sales') && (
                        <Badge
                          variant="secondary"
                          className="text-[8px] px-1 py-0 bg-blue-600/20 text-blue-400 leading-tight"
                        >
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.recent_sales || ""}
                        onChange={(e) =>
                          handleFieldChange({
                            recent_sales: Number(e.target.value),
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          "border-border text-foreground pr-5 h-7 text-xs w-full transition-colors duration-300",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                          highlightedFields.has('recent_sales') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                        )}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                        억
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Y-1 매출
                      </Label>
                      {highlightedFields.has('sales_y1') && (
                        <Badge
                          variant="secondary"
                          className="text-[8px] px-1 py-0 bg-blue-600/20 text-blue-400 leading-tight"
                        >
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.sales_y1 || ""}
                        onChange={(e) =>
                          handleFieldChange({
                            sales_y1: Number(e.target.value),
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          "border-border text-foreground pr-5 h-7 text-xs w-full transition-colors duration-300",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                          highlightedFields.has('sales_y1') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                        )}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                        억
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Y-2 매출
                      </Label>
                      {highlightedFields.has('sales_y2') && (
                        <Badge
                          variant="secondary"
                          className="text-[8px] px-1 py-0 bg-blue-600/20 text-blue-400 leading-tight"
                        >
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.sales_y2 || ""}
                        onChange={(e) =>
                          handleFieldChange({
                            sales_y2: Number(e.target.value),
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          "border-border text-foreground pr-5 h-7 text-xs w-full transition-colors duration-300",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                          highlightedFields.has('sales_y2') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                        )}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                        억
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">
                        Y-3 매출
                      </Label>
                      {highlightedFields.has('sales_y3') && (
                        <Badge
                          variant="secondary"
                          className="text-[8px] px-1 py-0 bg-blue-600/20 text-blue-400 leading-tight"
                        >
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.sales_y3 || ""}
                        onChange={(e) =>
                          handleFieldChange({
                            sales_y3: Number(e.target.value),
                          })
                        }
                        disabled={isReadOnly}
                        className={cn(
                          "border-border text-foreground pr-5 h-7 text-xs w-full transition-colors duration-300",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                          highlightedFields.has('sales_y3') && "bg-yellow-200 dark:bg-yellow-900/50 border-yellow-400",
                        )}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                        억
                      </span>
                    </div>
                  </div>
                </div>

                {/* Daum Postcode Modal for Business */}
                {showBusinessAddressSearch && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-[400px] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
                        <span className="font-medium text-gray-700">
                          사업장 주소 검색
                        </span>
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
                            handleFieldChange({
                              business_address: data.address,
                            });
                            setShowBusinessAddressSearch(false);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 진행기관 관리 섹션 - 계약완료 이후 상태에서만 표시 */}
              {formData.id && (formData.status_code?.includes('계약완료') || formData.status_code?.includes('서류취합완료') || formData.status_code?.includes('신청완료') || formData.status_code?.includes('집행완료')) && (
                <div className="border rounded-lg p-3 space-y-2 mx-1.5 mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-purple-400 text-[14px] flex items-center gap-1.5">
                      <Building className="w-4 h-4" />
                      진행기관 관리
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {(() => {
                        const orgs = formData.processing_orgs || [];
                        const inProgress = orgs.filter(o => o.status === '진행중').length;
                        const approved = orgs.filter(o => o.status === '승인').length;
                        const rejected = orgs.filter(o => o.status === '부결').length;
                        if (orgs.length === 0) return '등록된 기관 없음';
                        return `진행 ${inProgress} / 승인 ${approved} / 부결 ${rejected}`;
                      })()}
                    </span>
                  </div>

                  {/* 현재 등록된 기관 목록 타임라인 */}
                  {(formData.processing_orgs || []).length > 0 ? (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {(formData.processing_orgs || []).map((org, idx) => {
                        const colors = ORG_STATUS_COLORS[org.status as ProcessingOrgStatus] || ORG_STATUS_COLORS['진행중'];
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-center justify-between p-2 rounded border",
                              colors.border,
                              colors.bg
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className={cn("font-medium text-sm flex items-center gap-1", colors.text)}>
                                {org.status === '부결' && <XCircle className="w-3.5 h-3.5" />}
                                {org.status === '승인' && <CheckCircle className="w-3.5 h-3.5" />}
                                {org.org}
                                {org.is_re_execution && (
                                  <Badge variant="secondary" className="text-[9px] ml-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1 py-0">
                                    <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                                    재집행
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground space-x-2">
                                {org.applied_at && <span>접수: {org.applied_at}</span>}
                                {org.rejected_at && <span className="text-red-500">부결: {org.rejected_at}</span>}
                                {org.approved_at && <span className="text-green-500">승인: {org.approved_at}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5">
                              {org.status === '진행중' && !isReadOnly && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-red-600 hover:bg-red-100"
                                    onClick={async () => {
                                      if (!formData.id) return;
                                      const today = format(new Date(), 'yyyy-MM-dd');
                                      const updatedOrgs = (formData.processing_orgs || []).map(o =>
                                        o.org === org.org ? { ...o, status: '부결' as ProcessingOrgStatus, rejected_at: today } : o
                                      );
                                      
                                      try {
                                        const customerRef = doc(db, "customers", formData.id);
                                        await updateDoc(customerRef, {
                                          processing_orgs: updatedOrgs,
                                          updated_at: new Date(),
                                        });
                                        
                                        setFormData(prev => ({ ...prev, processing_orgs: updatedOrgs }));
                                        
                                        await addDoc(collection(db, "customer_history_logs"), {
                                          customer_id: formData.id,
                                          action_type: "org_change",
                                          description: `진행기관 부결: ${org.org}`,
                                          changed_by: currentUser?.uid || "",
                                          changed_by_name: currentUser?.name || "",
                                          old_value: '진행중',
                                          new_value: '부결',
                                          changed_at: new Date(),
                                        });
                                        
                                        onSave?.({
                                          id: formData.id,
                                          processing_orgs: updatedOrgs,
                                        });
                                        
                                        toast({
                                          title: "부결 처리",
                                          description: `${org.org} 기관이 부결 처리되었습니다.`,
                                        });
                                      } catch (error) {
                                        console.error("부결 처리 실패:", error);
                                      }
                                    }}
                                    data-testid={`btn-detail-reject-${org.org}`}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                  {/* 승인 버튼은 super_admin만 가능 (수당과 직결되는 기록) */}
                                  {currentUser?.role === 'super_admin' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0 text-green-600 hover:bg-green-100"
                                      onClick={() => {
                                        setOrgApprovalModal({
                                          isOpen: true,
                                          orgName: org.org,
                                          executionDate: org.execution_date || format(new Date(), 'yyyy-MM-dd'),
                                          executionAmount: org.execution_amount || 0,
                                          isLoading: false,
                                        });
                                      }}
                                      data-testid={`btn-detail-approve-${org.org}`}
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                  )}
                                </>
                              )}
                              {/* 삭제 버튼: 승인된 기관은 super_admin만 삭제 가능 */}
                              {!isReadOnly && (org.status !== '승인' || currentUser?.role === 'super_admin') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted"
                                  onClick={async () => {
                                    if (!formData.id) return;
                                    const updatedOrgs = (formData.processing_orgs || []).filter(o => o.org !== org.org);
                                    
                                    const recalcExecutionAmount = updatedOrgs
                                      .filter(o => o.status === '승인' && o.execution_amount)
                                      .reduce((sum, o) => sum + (o.execution_amount || 0), 0);
                                    
                                    try {
                                      const newProcessingOrg = updatedOrgs.length > 0 ? updatedOrgs[0].org : '미등록';
                                      const customerRef = doc(db, "customers", formData.id);
                                      await updateDoc(customerRef, {
                                        processing_orgs: updatedOrgs,
                                        processing_org: newProcessingOrg,
                                        execution_amount: recalcExecutionAmount,
                                        approved_amount: recalcExecutionAmount,
                                        updated_at: new Date(),
                                      });
                                      
                                      setFormData(prev => ({
                                        ...prev,
                                        processing_orgs: updatedOrgs,
                                        processing_org: newProcessingOrg,
                                        execution_amount: recalcExecutionAmount,
                                        approved_amount: recalcExecutionAmount,
                                      }));
                                      
                                      await addDoc(collection(db, "customer_history_logs"), {
                                        customer_id: formData.id,
                                        action_type: "org_change",
                                        description: `진행기관 삭제: ${org.org}`,
                                        changed_by: currentUser?.uid || "",
                                        changed_by_name: currentUser?.name || "",
                                        old_value: org.org,
                                        new_value: '',
                                        changed_at: new Date(),
                                      });
                                      
                                      onSave?.({
                                        id: formData.id,
                                        processing_orgs: updatedOrgs,
                                        processing_org: newProcessingOrg,
                                        execution_amount: recalcExecutionAmount,
                                        approved_amount: recalcExecutionAmount,
                                      });
                                    } catch (error) {
                                      console.error("기관 삭제 실패:", error);
                                    }
                                  }}
                                  data-testid={`btn-detail-remove-${org.org}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      등록된 진행기관이 없습니다.
                    </p>
                  )}

                  {/* 기관 추가 섹션 */}
                  {!isReadOnly && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] text-muted-foreground">기관 추가</p>
                        {/* 재집행으로 추가 토글 - 선행 집행건이 있을 때만 표시 */}
                        {(() => {
                          const existingOrgs = formData.processing_orgs || [];
                          const hasExecutedOrg = existingOrgs.some(o => 
                            o.status === '승인' && o.execution_date && o.execution_amount
                          );
                          if (!hasExecutedOrg) return null;
                          return (
                            <label className="flex items-center gap-1 cursor-pointer">
                              <Checkbox
                                checked={addAsReExecution}
                                onCheckedChange={(checked) => setAddAsReExecution(checked === true)}
                                className="h-3 w-3"
                                data-testid="checkbox-add-as-reexecution"
                              />
                              <span className={cn(
                                "text-[10px]",
                                addAsReExecution ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"
                              )}>
                                <RotateCcw className="w-2.5 h-2.5 inline mr-0.5" />
                                재집행으로 추가
                              </span>
                            </label>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {PROCESSING_ORGS.filter(org => {
                          const existingOrgs = formData.processing_orgs || [];
                          return !existingOrgs.find(o => o.org === org);
                        }).slice(0, 8).map(org => (
                          <Badge
                            key={org}
                            variant="outline"
                            className={cn(
                              "text-[10px] cursor-pointer px-1.5 py-0.5",
                              addAsReExecution 
                                ? "hover:bg-amber-100 dark:hover:bg-amber-900/30 border-amber-300 dark:border-amber-700" 
                                : "hover:bg-blue-100 dark:hover:bg-blue-900/30"
                            )}
                            onClick={async () => {
                              if (!formData.id) return;
                              
                              const today = format(new Date(), 'yyyy-MM-dd');
                              const newOrg: ProcessingOrg = {
                                org,
                                status: '진행중',
                                applied_at: today,
                                is_re_execution: addAsReExecution,
                              };
                              const updatedOrgs = [...(formData.processing_orgs || []), newOrg];
                              
                              // 상태 자동 변경 로직: 서류취합완료 → 신청완료
                              const statusMap: Record<string, string> = {
                                '서류취합완료(선불)': '신청완료(선불)',
                                '서류취합완료(외주)': '신청완료(외주)',
                                '서류취합완료(후불)': '신청완료(후불)',
                              };
                              const newStatus = statusMap[formData.status_code || ''];
                              
                              try {
                                const updates: any = {
                                  processing_orgs: updatedOrgs,
                                  updated_at: new Date(),
                                };
                                
                                // 상태 자동 변경이 필요하면 적용
                                if (newStatus) {
                                  updates.status_code = newStatus;
                                }
                                
                                // 직접 Firebase에 저장
                                const customerRef = doc(db, "customers", formData.id);
                                await updateDoc(customerRef, updates);
                                
                                // 로컬 상태 업데이트
                                setFormData(prev => ({
                                  ...prev,
                                  processing_orgs: updatedOrgs,
                                  ...(newStatus ? { status_code: newStatus as StatusCode } : {}),
                                }));
                                
                                // 이력 기록
                                await addDoc(collection(db, "customer_history_logs"), {
                                  customer_id: formData.id,
                                  action_type: "org_change",
                                  description: `진행기관 추가: ${org}${addAsReExecution ? ' (재집행)' : ''}`,
                                  changed_by: currentUser?.uid || "",
                                  changed_by_name: currentUser?.name || "",
                                  old_value: "",
                                  new_value: org,
                                  changed_at: new Date(),
                                });
                                
                                // 상태 변경 이력
                                if (newStatus) {
                                  await addDoc(collection(db, "customer_history_logs"), {
                                    customer_id: formData.id,
                                    action_type: "status_change",
                                    description: `상태 자동 변경: ${formData.status_code} → ${newStatus}`,
                                    changed_by: currentUser?.uid || "",
                                    changed_by_name: currentUser?.name || "",
                                    old_value: formData.status_code,
                                    new_value: newStatus,
                                    changed_at: new Date(),
                                  });
                                }
                                
                                // 부모 컴포넌트에도 알림
                                onSave?.({
                                  id: formData.id,
                                  processing_orgs: updatedOrgs,
                                  ...(newStatus ? { status_code: newStatus } : {}),
                                });
                                
                                toast({
                                  title: "기관 추가 완료",
                                  description: `${org} 기관이 추가되었습니다.${newStatus ? ` (상태: ${newStatus})` : ''}`,
                                });
                              } catch (error) {
                                console.error("기관 추가 실패:", error);
                                toast({
                                  title: "오류",
                                  description: "기관 추가 중 오류가 발생했습니다.",
                                  variant: "destructive",
                                });
                              }
                            }}
                            data-testid={`btn-detail-add-${org}`}
                          >
                            {addAsReExecution ? (
                              <RotateCcw className="w-2.5 h-2.5 mr-0.5 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <Plus className="w-2.5 h-2.5 mr-0.5" />
                            )}
                            {org}
                          </Badge>
                        ))}
                        {PROCESSING_ORGS.filter(org => {
                          const existingOrgs = formData.processing_orgs || [];
                          return !existingOrgs.find(o => o.org === org);
                        }).length > 8 && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground px-1.5 py-0.5">
                            +{PROCESSING_ORGS.filter(org => {
                              const existingOrgs = formData.processing_orgs || [];
                              return !existingOrgs.find(o => o.org === org);
                            }).length - 8}개 더
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: 중앙 패널 - 탭 기반 금융 분석 대시보드 (40%) */}
          <div className="flex-1 min-h-[300px] md:min-h-0 md:h-full bg-muted/50 dark:bg-gray-950 flex flex-col overflow-hidden border-b md:border-b-0 md:border-r">
            {/* Center Panel Tabs */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-1 px-4 py-2 border-b bg-muted/50 pl-[6px] pr-[6px] pt-[2px] pb-[2px]">
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveCenterTab("documents")}
                  className={cn(
                    "h-8 px-2 sm:px-3 text-sm",
                    activeCenterTab === "documents"
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-muted-foreground",
                  )}
                  data-testid="tab-documents"
                >
                  <FileText className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">서류 보기</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveCenterTab("financial");
                    setOcrExtractedCount(0);
                  }}
                  className={cn(
                    "h-8 px-2 sm:px-3 text-sm relative",
                    activeCenterTab === "financial"
                      ? "bg-emerald-600/20 text-emerald-400"
                      : "text-muted-foreground",
                  )}
                  data-testid="tab-financial"
                >
                  <Bot className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">금융 분석</span>
                  {ocrExtractedCount > 0 && activeCenterTab !== "financial" && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] animate-pulse"
                    >
                      {ocrExtractedCount}건
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveCenterTab("summary")}
                  className={cn(
                    "h-8 px-2 sm:px-3 text-sm",
                    activeCenterTab === "summary"
                      ? "bg-purple-600/20 text-purple-400"
                      : "text-muted-foreground",
                  )}
                  data-testid="tab-summary"
                >
                  <Search className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">심사 요약</span>
                </Button>
              </div>

              {/* 상태 변경 드롭다운 - 헤더 우측에 배치 */}
              {!isReadOnly && formData.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 px-3 text-sm gap-1.5 shrink-0",
                        "border-border bg-muted/50",
                        getStatusStyle(formData.status_code || "상담대기").text,
                      )}
                      data-testid="button-status-dropdown"
                    >
                      {formData.status_code || "상담대기"}
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-48 max-h-80 overflow-y-auto bg-card"
                  >
                    {(() => {
                      const canChangeToExecution = currentUser?.role === 'team_leader' || currentUser?.role === 'super_admin';
                      const isSuperAdmin = currentUser?.role === 'super_admin';
                      
                      const currentStatus = formData.status_code || '';
                      
                      const filteredOptions = STATUS_OPTIONS.filter(option => {
                        if (option.value === '집행완료(채무조정)' && !isSuperAdmin) {
                          return false;
                        }
                        if (option.value.includes('집행완료') && !canChangeToExecution) {
                          return false;
                        }
                        // 채무조정에서 채무조정으로 재선택 허용 (수당 재입력 위해)
                        if (option.value === '집행완료(채무조정)' && currentStatus === '집행완료(채무조정)' && isSuperAdmin) {
                          return true;
                        }
                        
                        return getStatusTransitionAllowed(currentStatus, option.value, isSuperAdmin);
                      });
                      
                      const groups = filteredOptions.reduce(
                        (acc, option) => {
                          const group = option.group || "기타";
                          if (!acc[group]) acc[group] = [];
                          acc[group].push(option);
                          return acc;
                        },
                        {} as Record<string, typeof STATUS_OPTIONS>,
                      );

                      const GROUP_COLORS: Record<string, string> = {
                        상담: "text-purple-300",
                        부재: "text-orange-300",
                        거절: "text-rose-300",
                        희망타겟: "text-yellow-300",
                        수납대기: "text-cyan-300",
                        계약: "text-emerald-300",
                        계약서발송: "text-lime-300",
                        서류: "text-blue-300",
                        신청: "text-indigo-300",
                        집행: "text-teal-300",
                      };

                      return Object.entries(groups).map(
                        ([groupName, options], groupIndex) => (
                          <DropdownMenuGroup key={groupName}>
                            {groupIndex > 0 && (
                              <DropdownMenuSeparator className="bg-muted" />
                            )}
                            <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
                              {groupName}
                            </DropdownMenuLabel>
                            {options.map((option) => {
                              const groupColor =
                                option.value === "최종부결"
                                  ? "text-red-300"
                                  : option.value === "민원처리"
                                    ? "text-orange-300"
                                    : GROUP_COLORS[option.group || ""] ||
                                      "text-muted-foreground";
                              const isSelected =
                                formData.status_code === option.value;
                              return (
                                <DropdownMenuItem
                                  key={option.value}
                                  onClick={async () => {
                                    // 채무조정 → 채무조정 재선택은 수당 재입력을 위해 허용
                                    const isDebtReentry =
                                      option.value === "집행완료(채무조정)" &&
                                      formData.status_code === "집행완료(채무조정)";
                                    if (
                                      formData.id &&
                                      (formData.status_code !== option.value || isDebtReentry)
                                    ) {
                                      const hasContractInfo = 
                                        (formData.commission_rate && formData.commission_rate > 0) &&
                                        (formData.contract_amount && formData.contract_amount > 0) &&
                                        ((formData as any).contract_date);
                                      
                                      const hasProcessingOrg = 
                                        formData.processing_org && formData.processing_org !== "미등록";
                                      
                                      const hasExecutionInfo = 
                                        (formData.execution_amount && formData.execution_amount > 0) &&
                                        ((formData as any).execution_date);

                                      if (option.value === "예약") {
                                        setReservationTodoOpen(true);
                                        return;
                                      }

                                      const requiresModal =
                                        (option.value.includes("계약완료") && !hasContractInfo) ||
                                        (option.value.includes("신청완료") && !hasProcessingOrg) ||
                                        (option.value === "집행완료(채무조정)") || // 채무조정은 항상 모달 (총수당/직원수당 입력 필수)
                                        (option.value.includes("집행완료") && !hasExecutionInfo) ||
                                        (option.value === "최종부결") || // 최종부결은 항상 모달 표시 (환수 적용일자 입력)
                                        (option.value === "장기부재"); // 장기부재는 확인 모달 표시 및 알림톡 발송

                                      if (requiresModal) {
                                        setStatusChangeModal({
                                          isOpen: true,
                                          targetStatus: option.value,
                                          commissionRate: formData.commission_rate || 0,
                                          contractAmount: formData.contract_amount || 0,
                                          contractDate: (formData as any).contract_date || new Date().toISOString().split('T')[0],
                                          executionAmount: formData.execution_amount || 0,
                                          executionDate: (formData as any).execution_date || new Date().toISOString().split('T')[0],
                                          processingOrg: formData.processing_org || "미등록",
                                          clawbackDate: new Date().toISOString().split('T')[0],
                                          selectedOrgs: [],
                                          existingOrgs: formData.processing_orgs || [],
                                          debtAdjTotalRevenue: (formData as any).debt_adjustment_total_revenue || 0,
                                          debtAdjEmployeeCommission: (formData as any).debt_adjustment_employee_commission || 0,
                                        });
                                        return;
                                      }

                                      const oldStatus = formData.status_code;
                                      setFormData((prev) => ({
                                        ...prev,
                                        status_code: option.value,
                                      }));

                                      if (customer?.id) {
                                        try {
                                          const customerRef = doc(db, "customers", customer.id);
                                          await updateDoc(customerRef, {
                                            status_code: option.value,
                                            updated_at: new Date(),
                                          });

                                          await addDoc(collection(db, "counseling_logs"), {
                                            customer_id: customer.id,
                                            action_type: "status_change",
                                            description: `상태 변경: ${oldStatus} → ${option.value}`,
                                            old_value: oldStatus,
                                            new_value: option.value,
                                            changed_by_name: currentUser?.name || "관리자",
                                            changed_at: new Date(),
                                            type: "log",
                                          });

                                          onSave?.({
                                            id: customer.id,
                                            status_code: option.value,
                                          });

                                          // 정산 영향 상태 전환 시 정산 동기화 (채무조정 잔존 정산 정리 포함)
                                          const oldAffectsSettlement = !!oldStatus && (
                                            oldStatus.includes('계약완료') || oldStatus.includes('집행완료') || oldStatus === '서류취합완료' || oldStatus === '신청완료'
                                          );
                                          const newAffectsSettlement = option.value.includes('계약완료') || option.value.includes('집행완료') || option.value === '서류취합완료' || option.value === '신청완료';
                                          if (oldAffectsSettlement || newAffectsSettlement) {
                                            try {
                                              const allUsers = await getUsers();
                                              await syncSingleCustomerSettlement(customer.id, allUsers);
                                            } catch (syncErr) {
                                              console.error("정산 동기화 실패:", syncErr);
                                            }
                                          }
                                        } catch (error) {
                                          console.error("상태 변경 실패:", error);
                                        }
                                      }
                                    }
                                  }}
                                  className={cn(
                                    "flex items-center justify-between cursor-pointer",
                                    "hover:bg-muted",
                                    isSelected && "bg-muted",
                                  )}
                                  data-testid={`status-option-${option.value}`}
                                >
                                  <span className={groupColor}>
                                    {option.label}
                                  </span>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-blue-400" />
                                  )}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuGroup>
                        ),
                      );
                    })()}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* 수납완료 버튼 - super_admin만, 수납대기 상태일 때만 노출 */}
              {!isReadOnly && formData.id && currentUser?.role === 'super_admin' && formData.status_code === '수납대기' && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-3 text-sm gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="button-payment-complete"
                  onClick={async () => {
                    if (!customer?.id || !formData.status_code) return;
                    const targetStatus = '계약완료(선불)';
                    const oldStatus = formData.status_code;
                    
                    try {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      const customerRef = doc(db, "customers", customer.id);
                      await updateDoc(customerRef, {
                        status_code: targetStatus,
                        deposit_paid_date: todayStr,
                        updated_at: new Date(),
                      });

                      await addDoc(collection(db, "status_logs"), {
                        customer_id: customer.id,
                        customer_name: formData.name || formData.company_name || '',
                        previous_status: oldStatus,
                        new_status: targetStatus,
                        changed_by_id: currentUser?.uid || 'system',
                        changed_by_name: currentUser?.name || '관리자',
                        changed_at: new Date().toISOString(),
                        reason: '수납완료 확인 - 선불 계약금',
                      });

                      await addDoc(collection(db, "counseling_logs"), {
                        customer_id: customer.id,
                        action_type: "status_change",
                        description: `수납완료: ${oldStatus} → ${targetStatus}`,
                        old_value: oldStatus,
                        new_value: targetStatus,
                        changed_by_name: currentUser?.name || "관리자",
                        changed_at: new Date(),
                        type: "log",
                      });

                      setFormData((prev) => ({
                        ...prev,
                        status_code: targetStatus,
                      }));

                      onSave?.({
                        id: customer.id,
                        status_code: targetStatus,
                      });

                      const allUsers = await getUsers();
                      await syncSingleCustomerSettlement(customer.id, allUsers);

                      toast({
                        title: '수납완료',
                        description: `${formData.name || formData.company_name} 고객이 ${targetStatus} 상태로 전환되었습니다.`,
                      });
                    } catch (error) {
                      console.error("수납완료 처리 실패:", error);
                      toast({
                        title: '오류',
                        description: '수납완료 처리 중 오류가 발생했습니다.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <CheckCircle className="w-4 h-4" />
                  수납완료
                </Button>
              )}
            </div>

            {/* Hidden file input - always mounted */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              className="hidden"
            />

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {/* 서류 보기 탭 */}
              {activeCenterTab === "documents" && (
                <div className="h-full flex flex-col">
                  {/* Document Viewer with Drag & Drop */}
                  <div
                    {...getRootProps()}
                    className={cn(
                      "flex-1 flex flex-col overflow-hidden bg-muted/30 dark:bg-gray-950/50 transition-all",
                      isDragActive &&
                        "border-2 border-dashed border-blue-500 bg-blue-500/10",
                    )}
                  >
                    <input {...getInputProps()} />

                    {/* 선택된 파일 헤더 - 파일명 + 액션 버튼 */}
                    {selectedDocument && !isDragActive && (
                      <div className="shrink-0 px-4 py-2 border-b bg-muted/50 dark:bg-gray-900/50 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm text-muted-foreground truncate">
                            {selectedDocument.file_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* 새 창에서 열기 */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              window.open(selectedDocument.file_url, "_blank")
                            }
                            title="새 창에서 열기"
                            data-testid="button-open-new-window"
                          >
                            <ExternalLink className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          {/* 다운로드 */}
                          <a
                            href={selectedDocument.file_url}
                            download={selectedDocument.file_name}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              title="다운로드"
                              data-testid="button-download-file"
                            >
                              <Download className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </a>
                          {/* 삭제 버튼 - 읽기전용이 아닐 때만 */}
                          {!isReadOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteFile(selectedDocument)}
                              title="파일 삭제"
                              className="text-red-400 hover:text-red-300"
                              data-testid="button-delete-file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 뷰어 본문 영역 - 최적화된 DocumentViewer 사용 */}
                    <div className="flex-1 overflow-hidden">
                      {isDragActive ? (
                        <div className="h-full flex items-center justify-center text-blue-400 p-4">
                          <div className="text-center">
                            <Upload className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                            <p className="text-lg font-medium">
                              파일을 여기에 놓으세요
                            </p>
                            <p className="text-sm text-blue-400/70 mt-1">
                              여러 파일을 동시에 업로드할 수 있습니다
                            </p>
                          </div>
                        </div>
                      ) : isUploading && uploadProgress ? (
                        <div className="h-full flex items-center justify-center p-4">
                          <div className="text-center w-full max-w-xs">
                            <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-400 animate-spin" />
                            <p className="text-blue-400 font-medium mb-2">
                              {uploadProgress.total}개 파일 업로드 중...
                            </p>
                            <p className="text-sm text-muted-foreground mb-3">
                              {uploadProgress.fileName}
                            </p>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div 
                                className="bg-blue-500 h-full animate-pulse"
                                style={{ width: '100%' }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              병렬 업로드 진행 중
                            </p>
                          </div>
                        </div>
                      ) : selectedDocument ? (
                        <DocumentViewer
                          fileUrl={selectedDocument.file_url}
                          fileName={selectedDocument.file_name}
                          fileType={selectedDocument.file_type}
                          className="h-full"
                        />
                      ) : (
                        <div
                          className="h-full flex items-center justify-center text-muted-foreground cursor-pointer p-4"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <div className="text-center border-2 border-dashed border-border rounded-lg p-8">
                            <Upload className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                            <p>파일을 드래그하거나 클릭하여 업로드하세요</p>
                            <p className="text-xs text-gray-600 mt-1">
                              PDF, PNG, JPG 지원 (다중 파일 가능)
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Document Footer (File List & Upload) - Moved to bottom */}
                  <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t bg-muted/30 pt-[2px] pb-[2px] pl-[6px] pr-[6px]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isReadOnly}
                      className={cn(
                        "border-border shrink-0",
                        isReadOnly && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      {isUploading && uploadProgress 
                        ? `${uploadProgress.total}개 업로드 중...` 
                        : "파일 업로드"}
                    </Button>

                    {/* File Tabs with Carousel Navigation */}
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      {/* Left arrow - show only if there are previous files */}
                      {fileCarouselStart > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFileCarouselStart(Math.max(0, fileCarouselStart - FILES_PER_PAGE))}
                          className="shrink-0 h-8 w-8"
                          data-testid="button-file-carousel-prev"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* Visible file tabs (max 3) */}
                      <div className="flex gap-1 flex-1 min-w-0">
                        {documents.slice(fileCarouselStart, fileCarouselStart + FILES_PER_PAGE).map((doc) => (
                          <Button
                            key={doc.id}
                            variant={
                              selectedDocument?.id === doc.id ? "secondary" : "ghost"
                            }
                            size="sm"
                            onClick={() => setSelectedDocument(doc)}
                            className={cn(
                              "shrink-0 max-w-[150px]",
                              selectedDocument?.id === doc.id
                                ? "bg-blue-600/20 text-blue-400"
                                : "text-muted-foreground",
                            )}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            <span className="truncate">{doc.file_name}</span>
                          </Button>
                        ))}
                      </div>
                      
                      {/* Right arrow - show only if there are more files */}
                      {fileCarouselStart + FILES_PER_PAGE < documents.length && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFileCarouselStart(Math.min(documents.length - 1, fileCarouselStart + FILES_PER_PAGE))}
                          className="shrink-0 h-8 w-8"
                          data-testid="button-file-carousel-next"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {/* File count indicator (when more than 3 files) */}
                      {documents.length > FILES_PER_PAGE && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-1">
                          {Math.floor(fileCarouselStart / FILES_PER_PAGE) + 1}/{Math.ceil(documents.length / FILES_PER_PAGE)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 금융 분석 탭 */}
              {activeCenterTab === "financial" && (
                <div className="h-full overflow-auto p-4">
                  <FinancialAnalysisTab
                    customer={formData}
                    obligations={financialObligations}
                    onObligationsChange={handleFinancialObligationsChange}
                    isReadOnly={isReadOnly}
                  />
                </div>
              )}

              {/* 심사 요약 탭 */}
              {activeCenterTab === "summary" && (
                <div className="h-full overflow-auto p-4">
                  <ReviewSummaryTab
                    obligations={financialObligations}
                    customer={{
                      id: formData.id || "",
                      readable_id: formData.readable_id || "",
                      name: formData.name || "",
                      company_name: formData.company_name || "",
                      business_type: formData.business_type || "",
                      business_item: formData.business_item || "",
                      business_registration_number: formData.business_registration_number || "",
                      recent_sales: formData.recent_sales || 0,
                      sales_y1: formData.sales_y1 || 0,
                      sales_y2: formData.sales_y2 || 0,
                      sales_y3: formData.sales_y3 || 0,
                      avg_revenue_3y: formData.avg_revenue_3y,
                      credit_score: formData.credit_score,
                      founding_date: formData.founding_date || "",
                      business_address: formData.business_address || "",
                      address: formData.address || "",
                      over_7_years: formData.over_7_years,
                      industry: formData.industry || "",
                      financial_obligations: financialObligations,
                    }}
                    onGenerateProposal={handleGenerateProposal}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 3: 우측 패널 - 커뮤니케이션 (25%) */}
          <div className="w-full md:w-[25%] md:min-w-[280px] min-h-[300px] md:min-h-0 md:h-full flex flex-col overflow-hidden">
            {/* 상단 50%: 메모/변경이력 탭 */}
            <div className="h-1/2 flex flex-col border-b">
              {/* Tab Headers */}
              <div className="h-10 shrink-0 border-b bg-muted/30 flex items-center px-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveBottomTab("memo")}
                  className={cn(
                    "h-8 px-3 text-sm",
                    activeBottomTab === "memo"
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-muted-foreground",
                  )}
                  data-testid="tab-memo"
                >
                  <UserIcon className="w-4 h-4 mr-1.5" />
                  상담 메모
                </Button>
                {currentUser?.role !== "staff" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveBottomTab("history")}
                    className={cn(
                      "h-8 px-3 text-sm",
                      activeBottomTab === "history"
                        ? "bg-orange-600/20 text-orange-400"
                        : "text-muted-foreground",
                    )}
                    data-testid="tab-history"
                  >
                    <History className="w-4 h-4 mr-1.5" />
                    변경 이력
                  </Button>
                )}
                {customer?.id && !isNewCustomer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveBottomTab("contracts")}
                    className={cn(
                      "h-8 px-3 text-sm",
                      activeBottomTab === "contracts"
                        ? "bg-indigo-600/20 text-indigo-400"
                        : "text-muted-foreground",
                    )}
                    data-testid="tab-contracts"
                  >
                    <FileSignature className="w-4 h-4 mr-1.5" />
                    계약
                  </Button>
                )}
                {/* TO-DO+ 버튼 */}
                {customer?.id && currentUser && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTodoModalOpen(true)}
                    className="h-8 px-3 text-sm text-emerald-400 ml-auto"
                    data-testid="button-add-todo"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    TO-DO
                  </Button>
                )}
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeBottomTab === "contracts" ? (
                  <div className="flex flex-col h-full overflow-y-auto p-2 space-y-2 bg-muted/30 dark:bg-gray-900/50">
                    {isLoadingContracts ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">계약 이력 로딩 중...</span>
                      </div>
                    ) : customerContracts.length > 0 && customerContracts.some(c => c.status === '발송완료' || c.status === '서명대기' || c.status === '거부') ? (
                      <div className="flex justify-end mb-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSyncingAll}
                          onClick={async () => {
                            setIsSyncingAll(true);
                            try {
                              const { authFetch } = await import('@/lib/firebase');
                              const res = await authFetch('/api/eformsign/contracts/sync', { method: 'POST' });
                              const data = await res.json();
                              if (data.success) {
                                toast({ title: '동기화 완료', description: `${data.synced || 0}건의 계약 상태가 업데이트되었습니다.` });
                                if (customer?.id) {
                                  const contractsRes = await authFetch(`/api/contracts?customer_id=${customer.id}`);
                                  const contractsData = await contractsRes.json();
                                  if (contractsData.success) {
                                    setCustomerContracts(contractsData.data);
                                  }
                                }
                                if (data.synced > 0) {
                                  window.location.reload();
                                }
                              } else {
                                toast({ title: '동기화 실패', description: data.error || '상태 동기화에 실패했습니다.', variant: 'destructive' });
                              }
                            } catch (error: any) {
                              toast({ title: '오류', description: error.message || '동기화 중 오류가 발생했습니다.', variant: 'destructive' });
                            } finally {
                              setIsSyncingAll(false);
                            }
                          }}
                          className="h-6 px-2 text-[10px] gap-1"
                          data-testid="button-sync-all-contracts"
                        >
                          {isSyncingAll ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          전체 상태 동기화
                        </Button>
                      </div>
                    ) : null}
                    {!isLoadingContracts && customerContracts.length === 0 ? (
                      <div className="text-center text-muted-foreground py-6">
                        <FileSignature className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
                        <p className="text-sm">전자계약 이력이 없습니다</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setContractSendModalOpen(true)}
                          className="mt-3 h-7 text-xs"
                          data-testid="button-send-contract-empty"
                        >
                          <FileSignature className="w-3 h-3 mr-1" />
                          계약서 발송하기
                        </Button>
                      </div>
                    ) : (
                      customerContracts.map((contract) => (
                        <div
                          key={contract.id}
                          className="rounded-lg border border-border/50 bg-card/50 p-2.5 space-y-1.5"
                          data-testid={`contract-item-${contract.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground truncate flex-1 mr-2">
                              {contract.template_name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] px-1.5", getContractStatusBadge(contract.status))}
                              >
                                {getContractDisplayStatus(contract.status)}
                              </Badge>
                              {contract.status === '서명완료' && contract.document_id && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={downloadingContractId === contract.id}
                                  onClick={async () => {
                                    setDownloadingContractId(contract.id);
                                    try {
                                      const { authFetch } = await import('@/lib/firebase');
                                      const res = await authFetch(`/api/eformsign/documents/${contract.document_id}/download`);
                                      if (!res.ok) {
                                        const errData = await res.json().catch(() => ({}));
                                        throw new Error(errData.error || '다운로드에 실패했습니다.');
                                      }
                                      const blob = await res.blob();
                                      const url = window.URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = `${contract.customer_name || customer?.name || ''}_계약서.pdf`;
                                      document.body.appendChild(a);
                                      a.click();
                                      window.URL.revokeObjectURL(url);
                                      document.body.removeChild(a);
                                    } catch (error: any) {
                                      toast({ title: '다운로드 실패', description: error.message, variant: 'destructive' });
                                    } finally {
                                      setDownloadingContractId(null);
                                    }
                                  }}
                                  className="h-5 px-1.5 text-[10px] gap-0.5"
                                  data-testid={`button-download-contract-${contract.id}`}
                                >
                                  {downloadingContractId === contract.id ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  ) : (
                                    <Download className="w-2.5 h-2.5" />
                                  )}
                                  다운로드
                                </Button>
                              )}
                              {contract.status !== '서명완료' && contract.status !== '무효' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={checkingReadContractId === contract.id}
                                    onClick={async () => {
                                      setCheckingReadContractId(contract.id);
                                      try {
                                        const { authFetch } = await import('@/lib/firebase');
                                        const res = await authFetch(`/api/eformsign/contracts/${contract.id}/read-status`);
                                        const data = await res.json();
                                        if (data.success) {
                                          const s = data.data;
                                          if (s.opened) {
                                            const last = s.last_opened_at ? new Date(s.last_opened_at).toLocaleString('ko-KR') : '-';
                                            const first = s.first_opened_at ? new Date(s.first_opened_at).toLocaleString('ko-KR') : '-';
                                            toast({
                                              title: '✅ 열람 확인됨',
                                              description: `열람 ${s.open_count}회 · 최초: ${first} · 최근: ${last}`,
                                            });
                                          } else {
                                            toast({
                                              title: '아직 열람되지 않음',
                                              description: '수신자가 아직 계약서를 열어보지 않았습니다.',
                                            });
                                          }
                                          if (customer?.id) {
                                            const contractsRes = await authFetch(`/api/contracts?customer_id=${customer.id}`);
                                            const contractsData = await contractsRes.json();
                                            if (contractsData.success) {
                                              setCustomerContracts(contractsData.data);
                                            }
                                          }
                                        } else {
                                          toast({ title: '조회 실패', description: data.error || '열람 정보를 가져올 수 없습니다.', variant: 'destructive' });
                                        }
                                      } catch (error: any) {
                                        toast({ title: '오류', description: error.message || '열람 확인 중 오류가 발생했습니다.', variant: 'destructive' });
                                      } finally {
                                        setCheckingReadContractId(null);
                                      }
                                    }}
                                    className={`h-5 px-1.5 text-[10px] gap-0.5 ${(contract as any).opened ? 'text-green-600 border-green-300' : ''}`}
                                    data-testid={`button-check-read-modal-${contract.id}`}
                                  >
                                    {checkingReadContractId === contract.id ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : (
                                      <Eye className="w-2.5 h-2.5" />
                                    )}
                                    {(contract as any).opened ? `열람 ${(contract as any).open_count || 1}회` : '열람확인'}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={syncingContractId === contract.id}
                                    onClick={async () => {
                                      setSyncingContractId(contract.id);
                                      try {
                                        const { authFetch } = await import('@/lib/firebase');
                                        const res = await authFetch(`/api/eformsign/contracts/${contract.id}/sync`, { method: 'POST' });
                                        const data = await res.json();
                                        if (data.success) {
                                          if (data.newStatus && data.newStatus !== data.oldStatus) {
                                            toast({ title: '상태 변경', description: `${data.oldStatus} → ${data.newStatus}` });
                                          } else {
                                            toast({ title: '확인 완료', description: `현재 상태: ${data.currentStatus || contract.status} (변경 없음)` });
                                          }
                                          if (customer?.id) {
                                            const contractsRes = await authFetch(`/api/contracts?customer_id=${customer.id}`);
                                            const contractsData = await contractsRes.json();
                                            if (contractsData.success) {
                                              setCustomerContracts(contractsData.data);
                                            }
                                          }
                                          if (data.newStatus === '서명완료') {
                                            window.location.reload();
                                          }
                                        } else {
                                          toast({ title: '동기화 실패', description: data.error || '상태 확인에 실패했습니다.', variant: 'destructive' });
                                        }
                                      } catch (error: any) {
                                        toast({ title: '오류', description: error.message || '동기화 중 오류가 발생했습니다.', variant: 'destructive' });
                                      } finally {
                                        setSyncingContractId(null);
                                      }
                                    }}
                                    className="h-5 px-1.5 text-[10px] gap-0.5"
                                    data-testid={`button-sync-contract-${contract.id}`}
                                  >
                                    {syncingContractId === contract.id ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-2.5 h-2.5" />
                                    )}
                                    상태확인
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={resendingContractId === contract.id}
                                    onClick={async () => {
                                      setResendingContractId(contract.id);
                                      try {
                                        const { authFetch } = await import('@/lib/firebase');
                                        const res = await authFetch(`/api/eformsign/contracts/${contract.id}/resend`, {
                                          method: 'POST',
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                          toast({ title: '재발송 완료', description: `기존 계약서 알림이 재발송되었습니다 (유효기간 ${data.valid_day || 14}일 갱신).` });
                                          if (customer?.id) {
                                            const contractsRes = await authFetch(`/api/contracts?customer_id=${customer.id}`);
                                            const contractsData = await contractsRes.json();
                                            if (contractsData.success) {
                                              setCustomerContracts(contractsData.data);
                                            }
                                          }
                                        } else {
                                          toast({ title: '재발송 실패', description: data.error || '재발송에 실패했습니다.', variant: 'destructive' });
                                        }
                                      } catch (error: any) {
                                        console.error('Contract resend error:', error);
                                        toast({ title: '오류', description: error.message || '재발송 중 오류가 발생했습니다.', variant: 'destructive' });
                                      } finally {
                                        setResendingContractId(null);
                                      }
                                    }}
                                    className="h-5 px-1.5 text-[10px] gap-0.5"
                                    data-testid={`button-resend-contract-${contract.id}`}
                                  >
                                    {resendingContractId === contract.id ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : (
                                      <Send className="w-2.5 h-2.5" />
                                    )}
                                    재발송
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>발송: {safeContractDate(contract.sent_at || contract.created_at)}</span>
                            {contract.completed_at && (
                              <span>완료: {safeContractDate(contract.completed_at)}</span>
                            )}
                          </div>
                          {contract.document_id && (
                            <div className="text-[10px] text-muted-foreground/70 truncate">
                              문서ID: {contract.document_id}
                            </div>
                          )}
                        </div>
                      ))
                    )}

                    {/* 결제 내역 섹션 */}
                    <div className="border-t border-border/50 mt-3 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-medium">결제 내역</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaymentSendModalOpen(true)}
                          className="h-6 px-2 text-[10px] gap-1"
                          data-testid="button-send-payment"
                        >
                          <CreditCard className="w-3 h-3" />
                          결제 청구서 발송
                        </Button>
                      </div>

                      {isLoadingPayments ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          <span className="ml-2 text-xs text-muted-foreground">결제 내역 로딩 중...</span>
                        </div>
                      ) : customerPayments.length === 0 ? (
                        <div className="text-center text-muted-foreground py-4">
                          <p className="text-xs">결제 내역이 없습니다</p>
                        </div>
                      ) : (
                        customerPayments.map((payment) => (
                          <div
                            key={payment.id}
                            className="rounded-lg border border-border/50 bg-card/50 p-2.5 space-y-1.5 mb-2"
                            data-testid={`payment-item-${payment.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                {Number(payment.amount).toLocaleString()}원
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-1.5", getPaymentStateBadge(payment.state))}
                                >
                                  {getPaymentStateLabel(payment.state)}
                                </Badge>
                                {payment.state === 'W' && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={syncingPaymentId === payment.id}
                                      onClick={async () => {
                                        setSyncingPaymentId(payment.id);
                                        try {
                                          const { authFetch } = await import('@/lib/firebase');
                                          const res = await authFetch('/api/paymint/status', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ bill_id: payment.bill_id, payment_id: payment.id }),
                                          });
                                          const data = await res.json();
                                          if (data.appr_state) {
                                            const newLabel = getPaymentStateLabel(data.appr_state);
                                            toast({ title: '상태 확인', description: `결제 상태: ${newLabel}` });
                                            const payments = await getPaymentsByCustomer(customer!.id);
                                            setCustomerPayments(payments);
                                            if (data.appr_state === 'F') {
                                              window.location.reload();
                                            }
                                          }
                                        } catch (error: any) {
                                          toast({ title: '오류', description: error.message, variant: 'destructive' });
                                        } finally {
                                          setSyncingPaymentId(null);
                                        }
                                      }}
                                      className="h-5 px-1.5 text-[10px] gap-0.5"
                                      data-testid={`button-sync-payment-${payment.id}`}
                                    >
                                      {syncingPaymentId === payment.id ? (
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      ) : (
                                        <RefreshCw className="w-2.5 h-2.5" />
                                      )}
                                      상태확인
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          const { authFetch } = await import('@/lib/firebase');
                                          const res = await authFetch('/api/paymint/resend', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ bill_id: payment.bill_id }),
                                          });
                                          const data = await res.json();
                                          if (data.result === 'success') {
                                            toast({ title: '재발송 완료', description: '결제 청구서가 재발송되었습니다.' });
                                          } else {
                                            toast({ title: '재발송 실패', description: data.error || '재발송에 실패했습니다.', variant: 'destructive' });
                                          }
                                        } catch (error: any) {
                                          toast({ title: '오류', description: error.message, variant: 'destructive' });
                                        }
                                      }}
                                      className="h-5 px-1.5 text-[10px] gap-0.5"
                                      data-testid={`button-resend-payment-${payment.id}`}
                                    >
                                      <Send className="w-2.5 h-2.5" />
                                      재발송
                                    </Button>
                                  </>
                                )}
                                {(payment.state === 'W' || payment.state === 'F') && currentUser?.role === 'super_admin' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      if (!confirm(payment.state === 'F' ? '결제를 취소하시겠습니까? 고객에게 환불됩니다.' : '청구서를 파기하시겠습니까?')) return;
                                      try {
                                        const { authFetch } = await import('@/lib/firebase');
                                        const endpoint = payment.state === 'F' ? '/api/paymint/cancel' : '/api/paymint/destroy';
                                        const res = await authFetch(endpoint, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            payment_id: payment.id,
                                            bill_id: payment.bill_id,
                                            price: payment.amount,
                                          }),
                                        });
                                        const data = await res.json();
                                        if (data.result === 'success') {
                                          toast({ title: '성공', description: payment.state === 'F' ? '결제가 취소되었습니다.' : '청구서가 파기되었습니다.' });
                                          const payments = await getPaymentsByCustomer(customer!.id);
                                          setCustomerPayments(payments);
                                        } else {
                                          toast({ title: '실패', description: data.error || '처리에 실패했습니다.', variant: 'destructive' });
                                        }
                                      } catch (error: any) {
                                        toast({ title: '오류', description: error.message, variant: 'destructive' });
                                      }
                                    }}
                                    className="h-5 px-1.5 text-[10px] gap-0.5 text-red-400 border-red-500/30 hover:bg-red-500/10"
                                    data-testid={`button-cancel-payment-${payment.id}`}
                                  >
                                    <XCircle className="w-2.5 h-2.5" />
                                    {payment.state === 'F' ? '취소' : '파기'}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              <span>계약금: {payment.contract_amount_manwon}만원</span>
                              <span>발송: {payment.created_at ? new Date(payment.created_at).toLocaleDateString('ko-KR') : '-'}</span>
                              {payment.appr_dt && (
                                <span>결제: {payment.appr_dt.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3 $4:$5')}</span>
                              )}
                            </div>
                            {payment.appr_issuer && (
                              <div className="text-[10px] text-muted-foreground/70">
                                {payment.appr_issuer} {payment.appr_issuer_num ? `(${payment.appr_issuer_num})` : ''} {payment.appr_monthly && payment.appr_monthly !== '00' ? `${payment.appr_monthly}개월` : '일시불'}
                              </div>
                            )}
                            <div className="text-[10px] text-muted-foreground/70 truncate">
                              청구서ID: {payment.bill_id} {payment.sent_by_name ? `| 발송: ${payment.sent_by_name}` : ''}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : activeBottomTab === "memo" || currentUser?.role === "staff" ? (
                  <div className="flex flex-col h-full">
                    {/* Memo Messages */}
                    <div
                      ref={memoScrollRef}
                      className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2 bg-muted/30 dark:bg-gray-900/50"
                    >
                      {memos.length === 0 ? (
                        <div className="text-center text-muted-foreground py-3">
                          <p className="text-sm">상담 메모가 없습니다</p>
                        </div>
                      ) : (
                        [...memos].reverse().map((memo) => (
                          <div key={memo.id} className="flex flex-col group">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-blue-400">
                                {memo.author_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {safeFormatDate(memo.created_at, "MM/dd HH:mm")}
                              </span>
                              {!memo.is_deleted && currentUser && (currentUser.role === 'super_admin' || currentUser.role === 'team_leader' || currentUser.uid === memo.author_id) && (
                                <button
                                  onClick={() => handleDeleteMemo(memo.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 ml-auto"
                                  data-testid={`button-delete-memo-${memo.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {memo.is_deleted ? (
                              currentUser?.role === 'super_admin' ? (
                                <div className="bg-red-600/10 border border-red-600/20 rounded-lg px-2 py-1.5 max-w-[90%]">
                                  <p className="text-sm text-muted-foreground line-through whitespace-pre-wrap">
                                    {normalizeEntrySourceInText(memo.content)}
                                  </p>
                                  <p className="text-xs text-red-400 mt-1">
                                    삭제: {memo.deleted_by_name} ({safeFormatDate(memo.deleted_at, "MM/dd HH:mm")})
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-muted/30 border border-muted rounded-lg px-2 py-1.5 max-w-[90%]">
                                  <p className="text-sm text-muted-foreground italic">
                                    [삭제된 메세지 입니다.]
                                  </p>
                                </div>
                              )
                            ) : (
                              <div className="bg-blue-600/20 border border-blue-600/30 rounded-lg px-2 py-1.5 max-w-[90%]">
                                <p className="text-sm text-foreground whitespace-pre-wrap">
                                  {normalizeEntrySourceInText(memo.content)}
                                </p>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Memo Input */}
                    <div className="shrink-0 border-t border-border bg-blue-100/50 dark:bg-blue-900/20 flex items-center px-2 py-2 gap-1.5">
                      <Input
                        value={newMemo}
                        onChange={(e) => setNewMemo(e.target.value)}
                        placeholder="메모 입력..."
                        className="bg-white/80 dark:bg-transparent border-blue-300 dark:border-border text-foreground h-9 text-sm flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
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
                ) : (
                  /* History Tab Content */
                  (<div className="h-full overflow-y-auto p-3 bg-muted/30 dark:bg-gray-900/50">
                    {isLoadingHistory ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                        <span className="ml-2 text-muted-foreground">로딩 중...</span>
                      </div>
                    ) : historyLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <History className="w-10 h-10 mb-2 text-gray-600" />
                        <p className="text-sm">변경 이력이 없습니다</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {historyLogs.map((log, index) => (
                          <div key={log.id} className="flex gap-2">
                            <div className="flex flex-col items-center">
                              <div
                                className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                                  log.action_type === "status_change"
                                    ? "bg-blue-600/20 text-blue-400"
                                    : log.action_type === "manager_change"
                                      ? "bg-green-600/20 text-green-400"
                                      : log.action_type === "info_update"
                                        ? "bg-orange-600/20 text-orange-400"
                                        : "bg-gray-600/20 text-muted-foreground",
                                )}
                              >
                                {log.action_type === "status_change" ? (
                                  <ArrowRight className="w-3 h-3" />
                                ) : log.action_type === "manager_change" ? (
                                  <UserCog className="w-3 h-3" />
                                ) : log.action_type === "info_update" ? (
                                  <Pencil className="w-3 h-3" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                              </div>
                              {index < historyLogs.length - 1 && (
                                <div className="w-0.5 flex-1 bg-muted my-1" />
                              )}
                            </div>
                            <div className="flex-1 pb-2">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {log.changed_by_name || "시스템"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {safeFormatDate(
                                    log.changed_at,
                                    "MM/dd HH:mm",
                                  )}
                                </span>
                              </div>
                              <div className="bg-muted/50 border rounded-lg px-2 py-1.5">
                                <p className="text-xs text-foreground">
                                  {normalizeEntrySourceInText(log.description || '')}
                                </p>
                                {log.old_value && log.new_value && (
                                  <div className="flex items-center gap-1 mt-1 text-xs">
                                    <Badge
                                      variant="outline"
                                      className="bg-muted/50 text-muted-foreground border-border text-[10px] px-1"
                                    >
                                      {normalizeEntrySourceInText(log.old_value)}
                                    </Badge>
                                    <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                                    <Badge
                                      variant="outline"
                                      className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-[10px] px-1"
                                    >
                                      {normalizeEntrySourceInText(log.new_value)}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>)
                )}
              </div>
            </div>

            {/* 하단 50%: AI 채팅 */}
            <div className="h-1/2 flex flex-col bg-muted/20 dark:bg-gray-950/30">
              {/* AI Header */}
              <div className="h-10 shrink-0 border-b px-3 flex items-center">
                <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  AI 질의
                </span>
              </div>

              {/* AI Messages */}
              <div
                ref={aiScrollRef}
                className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2"
              >
                {aiMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-3">
                    <Bot className="w-7 h-7 mx-auto mb-1 text-purple-600/50" />
                    {aiInitError ? (
                      <p className="text-sm text-red-500">⚠️ {aiInitError}</p>
                    ) : !aiConversationId && !isNewCustomer ? (
                      <p className="text-sm">AI 컨텍스트 준비 중...</p>
                    ) : isNewCustomer ? (
                      <p className="text-sm">고객 저장 후 AI 채팅이 활성화됩니다</p>
                    ) : (
                      <p className="text-sm">고객 정보 + 공문 기반 자금 예측 / Q&A</p>
                    )}
                  </div>
                ) : (
                  aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col",
                        msg.role === "user" ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-lg px-2 py-1.5 max-w-[90%]",
                          msg.role === "user"
                            ? "bg-purple-600/30 border border-purple-600/40"
                            : "bg-muted/50 border border-border/50",
                        )}
                      >
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {safeFormatDate(msg.created_at, "HH:mm")}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* AI Input */}
              <div className="shrink-0 border-t border-border bg-purple-100/50 dark:bg-purple-900/20 flex items-center px-2 py-2 gap-1.5">
                <Input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder={
                    aiIsStreaming
                      ? "AI가 답변 중..."
                      : !aiConversationId
                        ? "AI 준비 중..."
                        : "AI에게 질문하기..."
                  }
                  disabled={aiIsStreaming || !aiConversationId}
                  className="bg-white/80 dark:bg-transparent border-purple-300 dark:border-border text-foreground h-9 text-sm flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAISubmit();
                    }
                  }}
                  data-testid="input-ai-chat"
                />
                <Button
                  onClick={handleAISubmit}
                  disabled={!aiInput.trim() || aiIsStreaming || !aiConversationId}
                  size="icon"
                  className="shrink-0 bg-purple-600 hover:bg-purple-700"
                  data-testid="button-ai-send"
                >
                  {aiIsStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
      {/* Status Change Confirmation Modal */}
      <Dialog
        open={statusChangeModal.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setStatusChangeModal((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      >
        <DialogContent className="max-w-md bg-card text-foreground">
          <DialogTitle className="text-lg font-semibold text-foreground mb-4">
            상태 변경: {statusChangeModal.targetStatus}
          </DialogTitle>

          <div className="space-y-4">
            {/* 계약완료 상태: 계약일, 계약금, 자문료 */}
            {statusChangeModal.targetStatus.includes("계약완료") && (
              <>
                <div>
                  <Label className="text-muted-foreground text-sm">계약일</Label>
                  <Input
                    type="date"
                    value={statusChangeModal.contractDate || ""}
                    onChange={(e) =>
                      setStatusChangeModal((prev) => ({
                        ...prev,
                        contractDate: e.target.value,
                      }))
                    }
                    className="mt-1 bg-muted border-border text-foreground"
                    data-testid="input-status-contract-date"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">
                    계약금 수령액 (단위: 만원)
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min="0"
                      value={statusChangeModal.contractAmount}
                      onChange={(e) =>
                        setStatusChangeModal((prev) => ({
                          ...prev,
                          contractAmount: e.target.value === "" ? 0 : parseInt(e.target.value),
                        }))
                      }
                      className="bg-muted border-border text-foreground pr-12"
                      placeholder="0 (자문료만 받는 경우)"
                      data-testid="input-status-contract-amount"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      만원
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">자문료 (%)</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={statusChangeModal.commissionRate || ""}
                      onChange={(e) =>
                        setStatusChangeModal((prev) => ({
                          ...prev,
                          commissionRate: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="bg-muted border-border text-foreground pr-8"
                      placeholder="예: 10.5"
                      data-testid="input-status-commission-rate"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* 신청완료 상태: 진행기관 관리 (배지 기반 UI) */}
            {statusChangeModal.targetStatus.includes("신청완료") && (
              <div className="border rounded-lg p-3 space-y-3">
                <Label className="text-sm font-medium">진행기관 관리</Label>
                
                {/* 기존 진행 기관 표시 */}
                {statusChangeModal.existingOrgs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">기존 진행기관</p>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {statusChangeModal.existingOrgs.map((org, idx) => {
                        const statusColors: Record<string, { bg: string; text: string; border: string }> = {
                          '진행중': { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
                          '승인': { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
                          '부결': { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
                        };
                        const colors = statusColors[org.status] || statusColors['진행중'];
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-center justify-between p-2 rounded border text-sm",
                              colors.border,
                              colors.bg
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              {org.status === '승인' && <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
                              {org.status === '부결' && <XCircle className="w-3.5 h-3.5 text-red-600" />}
                              <span className={cn("font-medium", colors.text)}>{org.org}</span>
                              <span className="text-xs text-muted-foreground">({org.status})</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* 선택한 신규 기관 표시 */}
                {statusChangeModal.selectedOrgs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">신규 추가 기관</p>
                    <div className="space-y-1">
                      {statusChangeModal.selectedOrgs.map((org, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-sm"
                        >
                          <span className="font-medium text-blue-700 dark:text-blue-300">{org.org}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              setStatusChangeModal((prev) => ({
                                ...prev,
                                selectedOrgs: prev.selectedOrgs.filter((_, i) => i !== idx),
                              }));
                            }}
                            data-testid={`btn-modal-remove-selected-${org.org}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 기관 추가 섹션 */}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">기관 추가 (클릭하여 선택)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL_PROCESSING_ORGS.filter(org => {
                      if (org === '미등록') return false;
                      const existingOrgNames = statusChangeModal.existingOrgs.map(o => o.org);
                      const selectedOrgNames = statusChangeModal.selectedOrgs.map(o => o.org);
                      return !existingOrgNames.includes(org) && !selectedOrgNames.includes(org);
                    }).map(org => (
                      <Badge
                        key={org}
                        variant="outline"
                        className="text-xs cursor-pointer px-2 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        onClick={() => {
                          const today = format(new Date(), 'yyyy-MM-dd');
                          const newOrg: ProcessingOrg = {
                            org,
                            status: '진행중',
                            applied_at: today,
                          };
                          setStatusChangeModal((prev) => ({
                            ...prev,
                            selectedOrgs: [...prev.selectedOrgs, newOrg],
                          }));
                        }}
                        data-testid={`badge-modal-add-${org}`}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {org}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {/* 안내 메시지 */}
                {statusChangeModal.existingOrgs.length === 0 && statusChangeModal.selectedOrgs.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
                    최소 1개 이상의 기관을 선택해주세요.
                  </p>
                )}
              </div>
            )}

            {/* 집행완료 상태: 집행일, 집행금액 (채무조정은 별도 입력) */}
            {statusChangeModal.targetStatus.includes("집행완료") && statusChangeModal.targetStatus !== "집행완료(채무조정)" && (
              <>
                <div>
                  <Label className="text-muted-foreground text-sm">집행일</Label>
                  <Input
                    type="date"
                    value={statusChangeModal.executionDate || ""}
                    onChange={(e) =>
                      setStatusChangeModal((prev) => ({
                        ...prev,
                        executionDate: e.target.value,
                      }))
                    }
                    className="mt-1 bg-muted border-border text-foreground"
                    data-testid="input-status-execution-date"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">
                    최종 집행 금액 (단위: 만원)
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min="0"
                      value={statusChangeModal.executionAmount || ""}
                      onChange={(e) =>
                        setStatusChangeModal((prev) => ({
                          ...prev,
                          executionAmount: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="bg-muted border-border text-foreground pr-12"
                      placeholder="예: 10000 (만원 단위로 입력)"
                      data-testid="input-status-execution-amount"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      만원
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* 집행완료(채무조정): 집행일, 총 수당, 직원 수당 */}
            {statusChangeModal.targetStatus === "집행완료(채무조정)" && (
              <>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    채무조정 건은 총관리자가 총 수당과 직원 수당을 직접 입력합니다. 일반 집행 수당 계산식이 적용되지 않습니다.
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">집행일</Label>
                  <Input
                    type="date"
                    value={statusChangeModal.executionDate || ""}
                    onChange={(e) =>
                      setStatusChangeModal((prev) => ({
                        ...prev,
                        executionDate: e.target.value,
                      }))
                    }
                    className="mt-1 bg-muted border-border text-foreground"
                    data-testid="input-status-debt-adj-date"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">
                    총 수당 (단위: 만원)
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min="0"
                      value={statusChangeModal.debtAdjTotalRevenue || ""}
                      onChange={(e) =>
                        setStatusChangeModal((prev) => ({
                          ...prev,
                          debtAdjTotalRevenue: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="bg-muted border-border text-foreground pr-12"
                      placeholder="예: 500"
                      data-testid="input-status-debt-adj-total-revenue"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      만원
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">
                    직원 수당 (단위: 만원)
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min="0"
                      value={statusChangeModal.debtAdjEmployeeCommission || ""}
                      onChange={(e) =>
                        setStatusChangeModal((prev) => ({
                          ...prev,
                          debtAdjEmployeeCommission: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="bg-muted border-border text-foreground pr-12"
                      placeholder="예: 200"
                      data-testid="input-status-debt-adj-employee-commission"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      만원
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* 최종부결 상태: 환수 적용일자 */}
            {statusChangeModal.targetStatus === "최종부결" && (
              <div>
                <Label className="text-muted-foreground text-sm">환수 적용일자</Label>
                <Input
                  type="date"
                  value={statusChangeModal.clawbackDate || ""}
                  onChange={(e) =>
                    setStatusChangeModal((prev) => ({
                      ...prev,
                      clawbackDate: e.target.value,
                    }))
                  }
                  className="mt-1 bg-muted border-border text-foreground"
                  data-testid="input-status-clawback-date"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  환수가 적용될 정산월: {statusChangeModal.clawbackDate?.slice(0, 7) || new Date().toISOString().slice(0, 7)}
                </p>
              </div>
            )}

            {/* 장기부재 상태: 확인 메시지 */}
            {statusChangeModal.targetStatus === "장기부재" && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-md">
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                  정말 "{formData.name || formData.company_name}"님을 장기부재 상태로 변경하시겠습니까?
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  상태 변경 시 고객에게 장기부재 안내 알림톡이 발송됩니다.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() =>
                setStatusChangeModal((prev) => ({ ...prev, isOpen: false }))
              }
              className="border-border text-muted-foreground"
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!formData.id) return;

                // 채무조정 입력값 검증
                if (statusChangeModal.targetStatus === "집행완료(채무조정)") {
                  if (!(statusChangeModal.debtAdjTotalRevenue > 0) || !(statusChangeModal.debtAdjEmployeeCommission > 0)) {
                    toast({
                      title: "입력 오류",
                      description: "총 수당과 직원 수당을 0보다 큰 값으로 입력해주세요.",
                      variant: "destructive",
                    });
                    return;
                  }
                }

                const oldStatus = formData.status_code;
                const updateData: Record<string, any> = {
                  status_code: statusChangeModal.targetStatus,
                  updated_at: new Date(),
                };

                if (statusChangeModal.targetStatus.includes("계약완료")) {
                  // 값이 입력된 경우에만 저장 (기존 값 유지)
                  if (statusChangeModal.commissionRate > 0) {
                    updateData.commission_rate = statusChangeModal.commissionRate;
                  }
                  // 계약금은 0원도 허용 (자문료만 받는 경우)
                  updateData.contract_amount = statusChangeModal.contractAmount;
                  if (statusChangeModal.contractDate) {
                    updateData.contract_date = statusChangeModal.contractDate;
                  }
                }
                if (statusChangeModal.targetStatus.includes("신청완료")) {
                  // 기존 기관 + 신규 선택 기관 합치기
                  const allOrgs = [...statusChangeModal.existingOrgs, ...statusChangeModal.selectedOrgs];
                  if (allOrgs.length > 0) {
                    updateData.processing_orgs = allOrgs;
                    // 하위 호환성을 위해 첫 번째 진행중 기관을 processing_org에도 저장
                    const firstOrg = allOrgs.find(o => o.status === '진행중');
                    if (firstOrg) {
                      updateData.processing_org = firstOrg.org;
                    }
                  }
                }
                if (statusChangeModal.targetStatus.includes("집행완료") && statusChangeModal.targetStatus !== "집행완료(채무조정)") {
                  if (statusChangeModal.executionAmount > 0) {
                    updateData.execution_amount = statusChangeModal.executionAmount;
                    updateData.approved_amount = statusChangeModal.executionAmount;
                  }
                  if (statusChangeModal.executionDate) {
                    updateData.execution_date = statusChangeModal.executionDate;
                  }
                  const currentOrgs = formData.processing_orgs || [];
                  if (currentOrgs.length > 0) {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    const updatedOrgs = currentOrgs.map(o => {
                      if (o.status === '진행중') {
                        return {
                          ...o,
                          status: '승인' as ProcessingOrgStatus,
                          approved_at: today,
                          execution_date: statusChangeModal.executionDate || today,
                          execution_amount: statusChangeModal.executionAmount || 0,
                        };
                      }
                      return o;
                    });
                    updateData.processing_orgs = updatedOrgs;
                    updateData.processing_org = currentOrgs[0]?.org || '미등록';
                  }
                }

                // 집행완료(채무조정): 수기 입력된 총 수당 / 직원 수당 저장
                if (statusChangeModal.targetStatus === "집행완료(채무조정)") {
                  updateData.debt_adjustment_total_revenue = statusChangeModal.debtAdjTotalRevenue || 0;
                  updateData.debt_adjustment_employee_commission = statusChangeModal.debtAdjEmployeeCommission || 0;
                  if (statusChangeModal.executionDate) {
                    updateData.execution_date = statusChangeModal.executionDate;
                  }
                }

                try {
                  await updateDoc(doc(db, "customers", formData.id), updateData);
                  
                  // 계약완료/집행완료 상태로 변경 시 정산 데이터 동기화
                  if (statusChangeModal.targetStatus.includes("계약완료") || statusChangeModal.targetStatus.includes("집행완료")) {
                    const allUsers = await getUsers();
                    await syncSingleCustomerSettlement(formData.id, allUsers);
                    console.log("정산 데이터 동기화 완료:", formData.id);
                  }
                  
                  // 최종부결 상태로 변경 시 환수 처리 (입력된 적용일자 기준 정산월)
                  if (statusChangeModal.targetStatus === "최종부결") {
                    const clawbackMonth = statusChangeModal.clawbackDate?.slice(0, 7) || new Date().toISOString().slice(0, 7); // YYYY-MM
                    const result = await processClawbackForFinalRejection(formData.id, clawbackMonth);
                    if (result.clawbackCreated) {
                      console.log("환수 처리 완료:", result.clawbackItems.length, "건, 정산월:", clawbackMonth, ", 총 환수액:", result.totalClawbackAmount, "만원");
                    }
                  }
                  
                  // 장기부재 상태로 변경 시 알림톡 발송
                  if (statusChangeModal.targetStatus === "장기부재") {
                    try {
                      // services 필드가 없으면 메모에서 파싱 시도
                      let services = (formData as any).services || [];
                      if (services.length === 0 && formData.memo_history && formData.memo_history.length > 0) {
                        const firstMemo = formData.memo_history[0]?.content || '';
                        const serviceMatch = firstMemo.match(/- 신청 서비스: (.+)/);
                        if (serviceMatch) {
                          services = serviceMatch[1].split(', ').map((s: string) => s.trim());
                        }
                      }
                      const { authFetch } = await import('@/lib/firebase');
                      const response = await authFetch("/api/solapi/send-longabsence", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          customerPhone: formData.phone,
                          customerName: formData.name || formData.company_name,
                          services: services,
                        }),
                      });
                      const result = await response.json();
                      if (result.success) {
                        console.log("장기부재 알림톡 발송 성공");
                      } else {
                        console.warn("장기부재 알림톡 발송 실패:", result.message);
                      }
                    } catch (error) {
                      console.error("장기부재 알림톡 발송 오류:", error);
                    }
                  }

                  let logDescription = `상태 변경: ${oldStatus} → ${statusChangeModal.targetStatus}`;
                  if (statusChangeModal.targetStatus.includes("계약완료")) {
                    const details: string[] = [];
                    if (statusChangeModal.contractDate) {
                      details.push(`계약일: ${statusChangeModal.contractDate}`);
                    }
                    details.push(`계약금: ${statusChangeModal.contractAmount || 0}만원`);
                    if (statusChangeModal.commissionRate > 0) {
                      details.push(`자문료율: ${statusChangeModal.commissionRate}%`);
                    }
                    logDescription += ` (${details.join(', ')})`;
                  }

                  await addDoc(collection(db, "customer_history_logs"), {
                    customer_id: formData.id,
                    action_type: "status_change",
                    description: logDescription,
                    old_value: oldStatus,
                    new_value: statusChangeModal.targetStatus,
                    changed_by_id: currentUser?.uid || "",
                    changed_by_name: currentUser?.name || "",
                    changed_at: new Date(),
                  });

                  setFormData((prev) => ({
                    ...prev,
                    status_code: statusChangeModal.targetStatus as StatusCode,
                    commission_rate: updateData.commission_rate ?? prev.commission_rate,
                    contract_amount: updateData.contract_amount ?? prev.contract_amount,
                    execution_amount: updateData.execution_amount ?? prev.execution_amount,
                    processing_org: updateData.processing_org ?? prev.processing_org,
                    processing_orgs: updateData.processing_orgs ?? prev.processing_orgs,
                  }));

                  if (onSave) {
                    const savePayload: Partial<Customer> = {
                      id: formData.id,
                      status_code: statusChangeModal.targetStatus as StatusCode,
                    };
                    if (updateData.commission_rate !== undefined) savePayload.commission_rate = updateData.commission_rate;
                    if (updateData.contract_amount !== undefined) savePayload.contract_amount = updateData.contract_amount;
                    if (updateData.execution_amount !== undefined) savePayload.execution_amount = updateData.execution_amount;
                    if (updateData.processing_org !== undefined) savePayload.processing_org = updateData.processing_org;
                    if (updateData.processing_orgs !== undefined) savePayload.processing_orgs = updateData.processing_orgs;
                    if (updateData.execution_date !== undefined) (savePayload as any).execution_date = updateData.execution_date;
                    if (updateData.contract_date !== undefined) (savePayload as any).contract_date = updateData.contract_date;
                    if (updateData.contract_fee_rate !== undefined) savePayload.contract_fee_rate = updateData.contract_fee_rate;
                    onSave(savePayload);
                  }

                  const logs = await getCustomerHistoryLogs(formData.id);
                  setHistoryLogs(logs);

                  setStatusChangeModal((prev) => ({ ...prev, isOpen: false }));
                } catch (error) {
                  console.error("상태 변경 실패:", error);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-confirm-status-change"
            >
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* TO-DO 추가 모달 */}
      {currentUser && (
        <TodoForm
          open={todoModalOpen}
          onOpenChange={setTodoModalOpen}
          users={users}
          customers={customers}
          currentUser={currentUser}
          userRole={currentUser.role}
          defaultCustomerId={customer?.id}
          onTodoCreated={() => {
            setTodoModalOpen(false);
            if (customer?.id && formData.status_code !== '예약') {
              setFormData((prev) => ({ ...prev, status_code: "예약" }));
              onSave?.({ id: customer.id, status_code: "예약", _serverSynced: true } as any);
            }
            onTodoCreated?.();
          }}
        />
      )}
      {currentUser && (
        <TodoForm
          open={reservationTodoOpen}
          onOpenChange={(open) => {
            if (!open) setReservationTodoOpen(false);
          }}
          users={users}
          customers={customers}
          currentUser={currentUser}
          userRole={currentUser.role}
          defaultCustomerId={customer?.id}
          onTodoCreated={() => {
            setReservationTodoOpen(false);
            if (customer?.id) {
              setFormData((prev) => ({ ...prev, status_code: "예약" }));
              onSave?.({ id: customer.id, status_code: "예약", _serverSynced: true } as any);
            }
            onTodoCreated?.();
          }}
        />
      )}

      {/* 전자계약 발송 모달 */}
      {customer && (
        <ContractSendModal
          open={contractSendModalOpen}
          onOpenChange={setContractSendModalOpen}
          preselectedCustomer={customer}
          onSuccess={async (info) => {
            toast({ title: '성공', description: '전자계약이 발송되었습니다.' });
            if (customer?.id) {
              try {
                const contracts = await getContractsByCustomer(customer.id);
                setCustomerContracts(contracts);
                setActiveBottomTab("contracts");
              } catch (error) {
                console.error("Error loading contracts after send:", error);
              }
              if (info?.contractType) {
                const statusMap: Record<'pre' | 'post' | 'out', string> = {
                  'pre': '계약서발송완료(선불)',
                  'post': '계약서발송완료(후불)',
                  'out': '계약서발송완료(외주)',
                };
                const newStatus = statusMap[info.contractType];
                setFormData((prev) => ({ ...prev, status_code: newStatus }));
                onSave?.({ id: customer.id, status_code: newStatus, _serverSynced: true } as any);
              }
            }
          }}
        />
      )}

      {/* 결제 청구서 발송 모달 */}
      <PaymentSendModal
        open={paymentSendModalOpen}
        onClose={() => setPaymentSendModalOpen(false)}
        customer={customer}
        onSuccess={async (billId, amount) => {
          if (customer?.id) {
            const payments = await getPaymentsByCustomer(customer.id);
            setCustomerPayments(payments);
            setActiveBottomTab("contracts");
          }
        }}
      />

      {/* 제안서 입력 모달 */}
      <ProposalModal
        isOpen={proposalModalOpen}
        onClose={() => setProposalModalOpen(false)}
        onGenerate={handleProposalFormSubmit}
        customerName={formData.company_name || formData.name || ""}
      />

      {/* 제안서 미리보기 */}
      <ProposalPreview
        isOpen={proposalPreviewOpen}
        onClose={() => setProposalPreviewOpen(false)}
        customer={{
          id: formData.id || "",
          readable_id: formData.readable_id || "",
          name: formData.name || "",
          company_name: formData.company_name || "",
          business_type: formData.business_type || "",
          business_item: formData.business_item || "",
          business_registration_number: formData.business_registration_number || "",
          recent_sales: formData.recent_sales || 0,
          sales_y1: formData.sales_y1 || 0,
          sales_y2: formData.sales_y2 || 0,
          sales_y3: formData.sales_y3 || 0,
          avg_revenue_3y: formData.avg_revenue_3y,
          credit_score: formData.credit_score,
          founding_date: formData.founding_date || "",
          business_address: formData.business_address || "",
          address: formData.address || "",
          over_7_years: formData.over_7_years,
          industry: formData.industry || "",
          financial_obligations: financialObligations,
        }}
        currentUser={currentUser || undefined}
        agencies={proposalAgencies}
        desiredAmount={proposalDesiredAmount}
      />

      {/* 진행기관 승인 모달 (집행일자/금액 입력) */}
      <Dialog
        open={orgApprovalModal.isOpen}
        onOpenChange={(open) => {
          if (!open && !orgApprovalModal.isLoading) {
            setOrgApprovalModal({
              isOpen: false,
              orgName: '',
              executionDate: format(new Date(), 'yyyy-MM-dd'),
              executionAmount: 0,
              isLoading: false,
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">상태 변경 확인</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ○ "{orgApprovalModal.orgName}" 기관을 "집행완료" 상태로 변경합니다.
          </p>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-sm">집행일</Label>
              <Input
                type="date"
                value={orgApprovalModal.executionDate}
                onChange={(e) =>
                  setOrgApprovalModal(prev => ({
                    ...prev,
                    executionDate: e.target.value,
                  }))
                }
                data-testid="input-detail-org-approval-date"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">
                집행금액 <span className="text-muted-foreground text-xs">(단위: 만원)</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  value={orgApprovalModal.executionAmount || ''}
                  onChange={(e) =>
                    setOrgApprovalModal(prev => ({
                      ...prev,
                      executionAmount: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="pr-12"
                  placeholder="예: 10000 (만원 단위로 입력)"
                  data-testid="input-detail-org-approval-amount"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  만원
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setOrgApprovalModal({
                isOpen: false,
                orgName: '',
                executionDate: format(new Date(), 'yyyy-MM-dd'),
                executionAmount: 0,
                isLoading: false,
              })}
              disabled={orgApprovalModal.isLoading}
              className="border-border text-muted-foreground"
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!orgApprovalModal.orgName || !formData.id) return;
                
                setOrgApprovalModal(prev => ({ ...prev, isLoading: true }));
                
                try {
                  const today = format(new Date(), 'yyyy-MM-dd');
                  const updatedOrgs = (formData.processing_orgs || []).map(o =>
                    o.org === orgApprovalModal.orgName 
                      ? { 
                          ...o, 
                          status: '승인' as ProcessingOrgStatus, 
                          approved_at: today,
                          execution_date: orgApprovalModal.executionDate,
                          execution_amount: orgApprovalModal.executionAmount,
                        } 
                      : o
                  );
                  
                  // 총 집행금액 계산 (모든 승인된 기관의 집행금액 합산)
                  const totalExecutionAmount = updatedOrgs
                    .filter(o => o.status === '승인')
                    .reduce((sum, o) => sum + (o.execution_amount || 0), 0);
                  
                  // 가장 최근 집행일 (현재 승인하는 기관의 집행일)
                  const latestExecutionDate = orgApprovalModal.executionDate;
                  
                  // 이전 상태 저장
                  const oldStatus = formData.status_code;
                  
                  const getExecutionStatus = (status: string): string => {
                    if (status.includes('외주')) return '집행완료(외주)';
                    if (status.includes('후불')) return '집행완료(후불)';
                    return '집행완료(선불)';
                  };
                  const newStatus = getExecutionStatus(oldStatus || '');
                  
                  // 직접 Firebase에 저장 - 상태도 집행완료로 변경
                  const customerRef = doc(db, "customers", formData.id);
                  await updateDoc(customerRef, {
                    processing_orgs: updatedOrgs,
                    status_code: newStatus,
                    execution_date: latestExecutionDate,
                    execution_amount: totalExecutionAmount,
                    approved_amount: totalExecutionAmount,
                    updated_at: new Date(),
                  });
                  
                  // 로컬 상태도 업데이트
                  setFormData(prev => ({ 
                    ...prev, 
                    processing_orgs: updatedOrgs,
                    status_code: newStatus as StatusCode,
                    execution_date: latestExecutionDate,
                    execution_amount: totalExecutionAmount,
                    approved_amount: totalExecutionAmount,
                  }));
                  
                  // 이력 기록 - 진행기관 승인
                  await addDoc(collection(db, "customer_history_logs"), {
                    customer_id: formData.id,
                    action_type: "org_change",
                    description: `진행기관 승인: ${orgApprovalModal.orgName} (집행일: ${orgApprovalModal.executionDate}, 집행금액: ${orgApprovalModal.executionAmount}만원)`,
                    changed_by: currentUser?.uid || "",
                    changed_by_name: currentUser?.name || "",
                    old_value: '진행중',
                    new_value: '승인',
                    changed_at: new Date(),
                  });
                  
                  // 이력 기록 - 상태 변경 (이미 집행완료가 아닌 경우에만)
                  if (!oldStatus?.includes('집행완료')) {
                    await addDoc(collection(db, "customer_history_logs"), {
                      customer_id: formData.id,
                      action_type: "status_change",
                      description: `상태 자동 변경: ${oldStatus} → ${newStatus}`,
                      changed_by: currentUser?.uid || "",
                      changed_by_name: currentUser?.name || "",
                      old_value: oldStatus || '',
                      new_value: newStatus,
                      changed_at: new Date(),
                    });
                  }
                  
                  // 부모 컴포넌트에도 알림
                  onSave?.({
                    id: formData.id,
                    processing_orgs: updatedOrgs,
                    status_code: newStatus,
                    execution_date: latestExecutionDate,
                    execution_amount: totalExecutionAmount,
                    approved_amount: totalExecutionAmount,
                  });
                  
                  // 모달 닫기
                  setOrgApprovalModal({
                    isOpen: false,
                    orgName: '',
                    executionDate: format(new Date(), 'yyyy-MM-dd'),
                    executionAmount: 0,
                    isLoading: false,
                  });
                  
                  toast({
                    title: "승인 완료",
                    description: `${orgApprovalModal.orgName} 기관이 승인되었습니다. (상태: ${newStatus})`,
                  });
                } catch (error) {
                  console.error("승인 처리 실패:", error);
                  setOrgApprovalModal(prev => ({ ...prev, isLoading: false }));
                  toast({
                    title: "오류",
                    description: "승인 처리 중 오류가 발생했습니다.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={orgApprovalModal.isLoading}
              data-testid="button-confirm-detail-org-approval"
            >
              {orgApprovalModal.isLoading ? "처리 중..." : "확인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
