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
  ExternalLink,
  Download,
  Plus,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import debounce from "lodash/debounce";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { STATUS_OPTIONS, getStatusStyle } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Customer,
  User,
  CustomerDocument,
  StatusCode,
  CustomerHistoryLog,
} from "@shared/types";
import { format, differenceInDays, parseISO } from "date-fns";
import DaumPostcodeEmbed from "react-daum-postcode";
import { TodoForm } from "@/components/TodoForm";
import { storage, db, getCustomerHistoryLogs } from "@/lib/firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  doc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion,
} from "firebase/firestore";

interface MemoItem {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  created_at: Date;
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
  initialTab?: "memo" | "history";
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

const ENTRY_SOURCES = ["광고", "외주", "고객소개", "승인복제"];
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
const PROCESSING_ORGS = [
  "미등록",
  "신용취약",
  "재도전",
  "혁신",
  "일시적",
  "상생",
  "지역재단",
  "미소금융",
  "신보",
  "기보",
  "중진공",
  "농신보",
  "기업인증",
  "기타",
];

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
  const [activeBottomTab, setActiveBottomTab] = useState<"memo" | "history">(
    initialTab,
  );

  // History logs state
  const [historyLogs, setHistoryLogs] = useState<CustomerHistoryLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // TO-DO form modal state
  const [todoModalOpen, setTodoModalOpen] = useState(false);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memo state
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [newMemo, setNewMemo] = useState("");
  const memoScrollRef = useRef<HTMLDivElement>(null);

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const aiScrollRef = useRef<HTMLDivElement>(null);

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
  }>({
    isOpen: false,
    targetStatus: "",
    commissionRate: 0,
    contractAmount: 0,
    contractDate: new Date().toISOString().split('T')[0],
    executionAmount: 0,
    executionDate: new Date().toISOString().split('T')[0],
    processingOrg: "미등록",
  });

  // Initialize form data
  useEffect(() => {
    if (customer) {
      const phoneParts = customer.phone?.split("-") || ["010", "", ""];
      setFormData({
        ...customer,
        entry_source: customer.entry_source || "광고",
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
      });
      setMemos(
        customer.memo_history?.map((m, i) => ({
          id: `memo_${i}`,
          content: m.content,
          author_id: m.author_id,
          author_name: m.author_name,
          created_at:
            m.created_at instanceof Date
              ? m.created_at
              : new Date(m.created_at),
        })) || [],
      );
      setDocuments(customer.documents || []);
      setSelectedDocument(null); // 이전 고객의 선택된 문서 초기화
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
    }
    setAiMessages([]);
  }, [customer, isNewCustomer, currentUser]);

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
        const logs = snapshot.docs.map((doc) => ({
          id: doc.id,
          content: doc.data().content || "",
          author_id: doc.data().author_id || "",
          author_name: doc.data().author_name || "",
          created_at: doc.data().created_at?.toDate?.() || new Date(),
        })) as MemoItem[];
        setMemos(logs);
      },
      (error) => {
        console.error("🔥 메모 로딩 실패:", error);
      },
    );

    return () => unsubscribe();
  }, [formData.id]);

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
  }, [activeBottomTab, customer?.id]);

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

  // [수정] 파일 업로드 및 즉시 저장 함수
  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      // 1. Storage 경로 설정 (신규 고객이면 temp 경로 사용)
      const currentId = formData.id || `temp_${Date.now()}`;
      const storageRef = ref(
        storage,
        `customers/${currentId}/${Date.now()}_${file.name}`,
      );

      // 2. 파일 업로드
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // 3. 문서 객체 생성
      const newDoc: CustomerDocument = {
        id: `doc_${Date.now()}`,
        customer_id: formData.id || "",
        file_name: file.name,
        file_url: downloadURL,
        file_type: file.type,
        uploaded_by: currentUser?.uid || "",
        uploaded_by_name: currentUser?.name || "관리자",
        uploaded_at: new Date(),
      };

      // 4. UI 즉시 반영
      const updatedDocs = [...documents, newDoc];
      setDocuments(updatedDocs);
      setSelectedDocument(newDoc);

      // 5. [핵심] Firestore 즉시 저장 (기존 고객일 경우)
      if (formData.id) {
        const customerRef = doc(db, "customers", formData.id);

        // (1) DB에 arrayUnion으로 추가 (덮어쓰기 방지)
        await updateDoc(customerRef, {
          documents: arrayUnion(newDoc),
        });

        // (2) 로컬 formData 동기화 (자동저장 충돌 방지)
        setFormData((prev) => ({ ...prev, documents: updatedDocs }));

        // (3) 대시보드 알림
        if (onSave) {
          onSave({ id: formData.id, documents: updatedDocs });
        }

        // (4) 로그 기록
        await addDoc(collection(db, "counseling_logs"), {
          customer_id: formData.id,
          action_type: "document_upload",
          description: `파일 업로드: ${file.name}`,
          changed_by_name: currentUser?.name || "관리자",
          changed_at: new Date(),
          type: "log",
        });
      } else {
        // 신규 고객일 경우: formData에만 담아둠 (저장 버튼 누를 때 같이 저장됨)
        setFormData((prev) => ({ ...prev, documents: updatedDocs }));
      }
    } catch (error) {
      console.error("파일 업로드 실패:", error);
      alert("파일 업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  // Handle file input change
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  // Dropzone for drag & drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        uploadFile(acceptedFiles[0]);
      }
    },
    [customer?.id, currentUser],
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
  // Handle AI query submit
  const handleAISubmit = () => {
    if (!aiInput.trim()) return;

    const userMsg: AIMessage = {
      id: `ai_${Date.now()}`,
      role: "user",
      content: aiInput.trim(),
      created_at: new Date(),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: AIMessage = {
        id: `ai_${Date.now()}`,
        role: "assistant",
        content:
          "AI 기능은 현재 개발 중입니다. 추후 고객 분석 및 추천 기능이 제공될 예정입니다.",
        created_at: new Date(),
      };
      setAiMessages((prev) => [...prev, aiResponse]);
      aiScrollRef.current?.scrollTo({
        top: aiScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 500);
  };

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
        entry_source: dataToSave.entry_source || "광고",
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
        updated_at: new Date(),
      };

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 bg-card flex flex-col overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>
            {isNewCustomer
              ? "신규 고객 등록"
              : `${customer?.name || "고객"} 상세정보`}
          </DialogTitle>
        </VisuallyHidden>
        {/* Header - h-16 shrink-0 고정 */}
        <div className="h-16 shrink-0 flex items-center justify-between px-6 border-b bg-card/80">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">
              {isNewCustomer
                ? "신규 고객 등록"
                : `${customer?.name || "고객"} 상세정보`}
            </h2>
            {customer?.id && (
              <Badge
                variant="outline"
                className="text-muted-foreground border-border text-xs"
              >
                {customer.id}
              </Badge>
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
                {saveStatus === "saving" && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>저장 중...</span>
                  </>
                )}
                {saveStatus === "saved" && (
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

        {/* Main Content - 3단 레이아웃 (좌-중-우) */}
        <div className="flex-1 flex flex-row h-[calc(100%-4rem)] overflow-hidden">
          {/* Section 1: 좌측 패널 - 상세 정보 입력 (35%) */}
          <div className="w-[25%] min-w-[260px] h-full border-r overflow-y-auto">
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
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
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
                      disabled={isReadOnly}
                      className={cn(
                        "border-border h-7 w-7 p-0",
                        isReadOnly && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <Search className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Row 4: 상세주소 | 자가 | 사업장동일 */}
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
                      disabled={isReadOnly}
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
                      disabled={isReadOnly}
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
                  <div className="flex items-center gap-1 h-7">
                    <Checkbox
                      id="same-address"
                      checked={formData.is_same_as_business || false}
                      onCheckedChange={(c) => {
                        handleFieldChangeObject({
                          is_same_as_business: !!c,
                          business_address: c
                            ? formData.home_address
                            : formData.business_address,
                          business_address_detail: c
                            ? formData.home_address_detail
                            : formData.business_address_detail,
                          // 자가 체크 시 사업장 자가도 동일하게 체크
                          is_business_owned: c
                            ? formData.is_home_owned
                            : formData.is_business_owned,
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
                      사업장동일
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
                <h3 className="font-semibold text-emerald-400 mb-1 text-[14px]">
                  사업자 정보
                </h3>

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
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
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
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
                      )}
                    />
                  </div>
                </div>

                {/* Row 6: 업종 | 종목 (12분할 그리드 - 각 6칸) */}
                <div className="grid grid-cols-12 gap-1 items-end">
                  <div className="col-span-6">
                    <Label className="text-[10px] text-muted-foreground">업종</Label>
                    <Select
                      value={formData.business_type || "기타"}
                      onValueChange={(v) =>
                        handleFieldChange({ business_type: v })
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
                        {BUSINESS_TYPES.map((t) => (
                          <SelectItem
                            key={t}
                            value={t}
                            className="text-foreground text-xs"
                          >
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
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
                        "border-border text-foreground h-7 text-xs w-full",
                        isReadOnly
                          ? "bg-muted cursor-not-allowed opacity-70"
                          : "bg-muted",
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
                        "border-border text-foreground flex-1 h-7 text-xs",
                        isReadOnly ? "bg-muted opacity-70" : "bg-muted",
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
                      disabled={formData.is_same_as_business || isReadOnly}
                    >
                      <Search className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Row 9: 상세주소 | 자가 */}
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
                      disabled={formData.is_same_as_business || isReadOnly}
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
                </div>

                {/* Row 10: 최근 매출 | Y-1 매출 | Y-2 매출 | Y-3 매출 (4등분) */}
                <div className="grid grid-cols-4 gap-1">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      최근 매출
                    </Label>
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
                          "border-border text-foreground pr-5 h-7 text-xs w-full",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                        억
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      Y-1 매출
                    </Label>
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
                          "border-border text-foreground pr-5 h-7 text-xs w-full",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                        억
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      Y-2 매출
                    </Label>
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
                          "border-border text-foreground pr-5 h-7 text-xs w-full",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
                        )}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                        억
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      Y-3 매출
                    </Label>
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
                          "border-border text-foreground pr-5 h-7 text-xs w-full",
                          isReadOnly
                            ? "bg-muted cursor-not-allowed opacity-70"
                            : "bg-muted",
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
            </div>
          </div>

          {/* Section 2: 중앙 패널 - 문서 뷰어 (40%, A4 비율) */}
          <div className="flex-1 h-full bg-muted/50 dark:bg-gray-950 flex flex-col overflow-hidden border-r">
            {/* Document Header - 상태 변경 드롭다운 포함 */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/50">
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
                    "border-border shrink-0",
                    isReadOnly && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  {isUploading ? "업로드 중..." : "파일 업로드"}
                </Button>

                {/* File Tabs */}
                <div className="flex gap-1 overflow-x-auto">
                  {documents.map((doc) => (
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
              </div>

              {/* 상태 변경 드롭다운 - 문서 헤더 우측에 배치 */}
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
                      // staff 사용자는 집행완료 상태로 변경 불가 (team_leader, super_admin만 가능)
                      const canChangeToExecution = currentUser?.role === 'team_leader' || currentUser?.role === 'super_admin';
                      const filteredOptions = STATUS_OPTIONS.filter(option => {
                        if (option.value.includes('집행완료') && !canChangeToExecution) {
                          return false;
                        }
                        return true;
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
                        계약: "text-emerald-300",
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
                                  : GROUP_COLORS[option.group || ""] ||
                                    "text-muted-foreground";
                              const isSelected =
                                formData.status_code === option.value;
                              return (
                                <DropdownMenuItem
                                  key={option.value}
                                  onClick={async () => {
                                    if (
                                      formData.id &&
                                      formData.status_code !== option.value
                                    ) {
                                      // 계약완료: 자문료, 계약금액, 계약일이 모두 있으면 모달 스킵
                                      const hasContractInfo = 
                                        (formData.commission_rate && formData.commission_rate > 0) &&
                                        (formData.contract_amount && formData.contract_amount > 0) &&
                                        ((formData as any).contract_date);
                                      
                                      // 신청완료: 진행기관이 설정되어 있으면 모달 스킵
                                      const hasProcessingOrg = 
                                        formData.processing_org && formData.processing_org !== "미등록";
                                      
                                      // 집행완료: 집행금액과 집행일이 모두 있으면 모달 스킵
                                      const hasExecutionInfo = 
                                        (formData.execution_amount && formData.execution_amount > 0) &&
                                        ((formData as any).execution_date);

                                      const requiresModal =
                                        (option.value.includes("계약완료") && !hasContractInfo) ||
                                        (option.value.includes("신청완료") && !hasProcessingOrg) ||
                                        (option.value.includes("집행완료") && !hasExecutionInfo);

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
                                        });
                                        return;
                                      }

                                      const oldStatus = formData.status_code;
                                      setFormData((prev) => ({
                                        ...prev,
                                        status_code: option.value as StatusCode,
                                      }));

                                      try {
                                        await updateDoc(
                                          doc(db, "customers", formData.id!),
                                          {
                                            status_code: option.value,
                                            updated_at: new Date(),
                                          },
                                        );

                                        await addDoc(
                                          collection(
                                            db,
                                            "customer_history_logs",
                                          ),
                                          {
                                            customer_id: formData.id,
                                            action_type: "status_change",
                                            description: `상태 변경: ${oldStatus} → ${option.value}`,
                                            old_value: oldStatus,
                                            new_value: option.value,
                                            changed_by_id:
                                              currentUser?.uid || "",
                                            changed_by_name:
                                              currentUser?.name || "",
                                            changed_at: new Date(),
                                          },
                                        );

                                        // 대시보드에 상태 변경 알림
                                        if (onSave) {
                                          onSave({
                                            id: formData.id,
                                            status_code: option.value as StatusCode,
                                          });
                                        }

                                        const logs =
                                          await getCustomerHistoryLogs(
                                            formData.id!,
                                          );
                                        setHistoryLogs(logs);
                                      } catch (error) {
                                        console.error("상태 변경 실패:", error);
                                        setFormData((prev) => ({
                                          ...prev,
                                          status_code: oldStatus,
                                        }));
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
            </div>

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

              {/* 뷰어 본문 영역 */}
              <div className="flex-1 p-4 overflow-auto">
                {isDragActive ? (
                  <div className="h-full flex items-center justify-center text-blue-400">
                    <div className="text-center">
                      <Upload className="w-16 h-16 mx-auto mb-4 animate-pulse" />
                      <p className="text-lg font-medium">
                        파일을 여기에 놓으세요
                      </p>
                    </div>
                  </div>
                ) : selectedDocument ? (
                  <div className="h-full flex items-center justify-center">
                    {selectedDocument.file_type.startsWith("image/") ? (
                      <img
                        src={selectedDocument.file_url}
                        alt={selectedDocument.file_name}
                        className="max-w-full max-h-full object-contain rounded"
                      />
                    ) : selectedDocument.file_type === "application/pdf" ||
                      selectedDocument.file_type.includes("pdf") ? (
                      <iframe
                        src={`https://docs.google.com/gview?url=${encodeURIComponent(selectedDocument.file_url)}&embedded=true`}
                        className="w-full h-full rounded border bg-white"
                        title={selectedDocument.file_name}
                      />
                    ) : (
                      <div className="text-muted-foreground text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                        <p className="mb-4">
                          미리보기를 지원하지 않는 파일 형식입니다
                        </p>
                        <a
                          href={selectedDocument.file_url}
                          download={selectedDocument.file_name}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-2" />
                            다운로드
                          </Button>
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="h-full flex items-center justify-center text-muted-foreground cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="text-center border-2 border-dashed border-border rounded-lg p-8">
                      <Upload className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                      <p>파일을 드래그하거나 클릭하여 업로드하세요</p>
                      <p className="text-xs text-gray-600 mt-1">
                        PDF, PNG, JPG 지원
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: 우측 패널 - 커뮤니케이션 (25%) */}
          <div className="w-[25%] min-w-[280px] h-full flex flex-col overflow-hidden">
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
                {activeBottomTab === "memo" ? (
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
                          <div key={memo.id} className="flex flex-col">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-blue-400">
                                {memo.author_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {safeFormatDate(memo.created_at, "MM/dd HH:mm")}
                              </span>
                            </div>
                            <div className="bg-blue-600/20 border border-blue-600/30 rounded-lg px-2 py-1.5 max-w-[90%]">
                              <p className="text-sm text-foreground whitespace-pre-wrap">
                                {memo.content}
                              </p>
                            </div>
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
                                      : "bg-gray-600/20 text-muted-foreground",
                                )}
                              >
                                {log.action_type === "status_change" ? (
                                  <ArrowRight className="w-3 h-3" />
                                ) : log.action_type === "manager_change" ? (
                                  <UserCog className="w-3 h-3" />
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
                                  {log.description}
                                </p>
                                {log.old_value && log.new_value && (
                                  <div className="flex items-center gap-1 mt-1 text-xs">
                                    <Badge
                                      variant="outline"
                                      className="bg-muted/50 text-muted-foreground border-border text-[10px] px-1"
                                    >
                                      {log.old_value}
                                    </Badge>
                                    <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                                    <Badge
                                      variant="outline"
                                      className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-[10px] px-1"
                                    >
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
                    <p className="text-sm">AI에게 질문하세요</p>
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
                  placeholder="AI에게 질문하기..."
                  className="bg-white/80 dark:bg-transparent border-purple-300 dark:border-border text-foreground h-9 text-sm flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
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
                      value={statusChangeModal.contractAmount || ""}
                      onChange={(e) =>
                        setStatusChangeModal((prev) => ({
                          ...prev,
                          contractAmount: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="bg-muted border-border text-foreground pr-12"
                      placeholder="예: 500 (만원 단위로 입력)"
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

            {/* 신청완료 상태: 신청기관 */}
            {statusChangeModal.targetStatus.includes("신청완료") && (
              <div>
                <Label className="text-muted-foreground text-sm">신청 기관</Label>
                <Select
                  value={statusChangeModal.processingOrg}
                  onValueChange={(v) =>
                    setStatusChangeModal((prev) => ({
                      ...prev,
                      processingOrg: v,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
                    <SelectValue placeholder="기관 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    {PROCESSING_ORGS.filter((org) => org && org.trim() !== "").map(
                      (org) => (
                        <SelectItem key={org} value={org} className="text-foreground">
                          {org}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 집행완료 상태: 집행금액, 집행일 */}
            {statusChangeModal.targetStatus.includes("집행완료") && (
              <>
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
              </>
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
                  if (statusChangeModal.contractAmount > 0) {
                    updateData.contract_amount = statusChangeModal.contractAmount;
                  }
                  if (statusChangeModal.contractDate) {
                    updateData.contract_date = statusChangeModal.contractDate;
                  }
                }
                if (statusChangeModal.targetStatus.includes("신청완료")) {
                  if (statusChangeModal.processingOrg && statusChangeModal.processingOrg !== "미등록") {
                    updateData.processing_org = statusChangeModal.processingOrg;
                  }
                }
                if (statusChangeModal.targetStatus.includes("집행완료")) {
                  if (statusChangeModal.executionAmount > 0) {
                    updateData.execution_amount = statusChangeModal.executionAmount;
                  }
                  if (statusChangeModal.executionDate) {
                    updateData.execution_date = statusChangeModal.executionDate;
                  }
                }

                try {
                  await updateDoc(doc(db, "customers", formData.id), updateData);

                  await addDoc(collection(db, "customer_history_logs"), {
                    customer_id: formData.id,
                    action_type: "status_change",
                    description: `상태 변경: ${oldStatus} → ${statusChangeModal.targetStatus}`,
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
                  }));

                  // 대시보드에 상태 변경 알림
                  if (onSave) {
                    onSave({
                      id: formData.id,
                      status_code: statusChangeModal.targetStatus as StatusCode,
                      commission_rate: updateData.commission_rate,
                      contract_amount: updateData.contract_amount,
                      execution_amount: updateData.execution_amount,
                      processing_org: updateData.processing_org,
                    });
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
            onTodoCreated?.();
          }}
        />
      )}
    </Dialog>
  );
}
