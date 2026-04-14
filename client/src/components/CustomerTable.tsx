import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MemoModal } from './MemoModal';
import { TodoForm } from './TodoForm';
import { MoreHorizontal, Edit, Trash2, History, Check, X, FolderOpen, AlertTriangle, Users, Plus, XCircle, CheckCircle, RotateCcw, ArrowUpDown, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Customer, UserRole, StatusCode, CustomerMemo, User, ProcessingOrg } from '@shared/types';
import { STATUS_OPTIONS, STATUS_STYLES, getStatusStyle, FUNNEL_GROUPS, PROCESSING_ORGS, ORG_STATUS_COLORS, type ProcessingOrgStatus, getStatusTransitionAllowed } from '@/lib/constants';

const CLOSED_STATUSES = new Set([
  '장기부재',
  '거절사유 미파악',
  '인증불가',
  '정부기관 오인',
  '기타자금 오인',
  '불가업종',
  '매출없음',
  '신용점수 미달',
  '차입금초과',
  '본인아님',
  '사업자아님',
  '이중계약',
  '세금체납',
  '단박거절',
  '정체성 의심',
  '잘못 신청',
  '업력미달',
  '최근대출',
  '인증미동의(국세청)',
  '인증미동의(공여내역)',
  '진행기간 미동의',
  '자문료 미동의',
  '계약금미동의(선불)',
  '계약금미동의(후불)',
  '최종부결',
]);

const TRASH_REASONS = [
  { id: '잘못 신청', label: '잘못 신청' },
  { id: '단박거절', label: '단박거절' },
  { id: '본인아님', label: '본인아님' },
  { id: '사업자아님', label: '사업자아님' },
  { id: '정체성 의심', label: '정체성 의심' },
  { id: '정부기관 오인', label: '정부기관 오인' },
  { id: '기타자금 오인', label: '기타자금 오인' },
  { id: '인증불가', label: '인증불가' },
  { id: '불가업종', label: '불가업종' },
  { id: '매출없음', label: '매출없음' },
  { id: '신용점수 미달', label: '신용점수 미달' },
  { id: '차입금초과', label: '차입금초과' },
  { id: '세금체납', label: '세금체납' },
  { id: '이중계약', label: '이중계약' },
  { id: '거절사유 미파악', label: '거절사유 미파악' },
];

// 그룹별 통일된 색상 (대시보드 영업 퍼널과 동일) - 라이트/다크 모드 지원
const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  '상담': { bg: 'bg-purple-500/20', text: 'text-purple-700 dark:text-purple-300' },
  '부재': { bg: 'bg-orange-500/20', text: 'text-orange-700 dark:text-orange-300' },
  '거절': { bg: 'bg-rose-500/20', text: 'text-rose-700 dark:text-rose-300' },
  '희망타겟': { bg: 'bg-yellow-500/20', text: 'text-amber-700 dark:text-yellow-300' },
  '계약서발송': { bg: 'bg-lime-500/20', text: 'text-lime-700 dark:text-lime-300' },
  '계약': { bg: 'bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300' },
  '서류': { bg: 'bg-blue-500/20', text: 'text-blue-700 dark:text-blue-300' },
  '신청': { bg: 'bg-indigo-500/20', text: 'text-indigo-700 dark:text-indigo-300' },
  '집행': { bg: 'bg-teal-500/20', text: 'text-teal-700 dark:text-teal-300' },
  '기타': { bg: 'bg-gray-500/20', text: 'text-gray-700 dark:text-gray-300' },
};

// 상태 배지 정보 가져오기 (한글 상태명 기반, 그룹 색상 통일)
const getStatusBadgeInfo = (statusCode: string): { label: string; colorClass: string; category: string } => {
  // 최종부결은 빨간색으로 특별 처리
  if (statusCode === '최종부결') {
    return {
      label: statusCode,
      colorClass: 'bg-red-500/20 text-red-700 dark:text-red-300',
      category: '집행',
    };
  }
  // 민원처리는 주황색으로 특별 처리
  if (statusCode === '민원처리') {
    return {
      label: statusCode,
      colorClass: 'bg-orange-600/20 text-orange-700 dark:text-orange-400',
      category: '집행',
    };
  }
  
  // 카테고리 결정
  let category = '기타';
  if (statusCode === '상담대기') category = '상담';
  else if (FUNNEL_GROUPS['쓰레기통']?.includes(statusCode)) category = '거절';
  else if (statusCode === '단기부재' || statusCode === '장기부재' || statusCode === '예약') category = '부재';
  else if (FUNNEL_GROUPS['희망타겟']?.includes(statusCode)) category = '희망타겟';
  else if (FUNNEL_GROUPS['계약서발송완료']?.includes(statusCode)) category = '계약서발송';
  else if (FUNNEL_GROUPS['계약완료']?.includes(statusCode)) category = '계약';
  else if (FUNNEL_GROUPS['서류취합']?.includes(statusCode)) category = '서류';
  else if (FUNNEL_GROUPS['신청완료']?.includes(statusCode)) category = '신청';
  else if (FUNNEL_GROUPS['집행완료_그룹']?.includes(statusCode)) category = '집행';
  
  // 그룹 색상 사용 (통일)
  const groupStyle = GROUP_COLORS[category] || GROUP_COLORS['기타'];
  
  return {
    label: statusCode, // 한글 상태명 그대로 표시
    colorClass: `${groupStyle.bg} ${groupStyle.text}`,
    category,
  };
};

interface CustomerTableProps {
  customers: Customer[];
  userRole: UserRole;
  selectedStage: string | null;
  users?: User[];
  currentUserTeamId?: string;
  onStatusChange: (customerId: string, currentStatus: StatusCode, newStatus: StatusCode) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customerId: string) => void;
  onViewHistory: (customerId: string) => void;
  onCustomerClick?: (customer: Customer) => void;
  onProcessingOrgChange?: (customerId: string, newOrg: string) => void;
  onProcessingOrgsChange?: (customerId: string, processingOrgs: ProcessingOrg[]) => void;
  onAddMemo?: (customerId: string, content: string) => void;
  onDeleteMemo?: (customerId: string, memoIndex: number) => void;
  onManagerChange?: (customerId: string, newManagerId: string, newManagerName: string, newTeamId: string, newTeamName: string) => void;
  onAddProcessingOrgWithAutoStatus?: (customerId: string, customer: Customer, orgName: string, isReExecution?: boolean) => void;
  onApproveOrg?: (customerId: string, customer: Customer, orgName: string, executionDate: string, executionAmount: number) => void;
  currentUser?: User;
  overdueTodoCustomerIds?: Set<string>;
  sortMode?: 'updated_at' | 'entry_date';
  onSortModeChange?: (mode: 'updated_at' | 'entry_date') => void;
}

// 스테이지 이름 가져오기 (한글 상태명 기반)
const getStageName = (stageId: string | null): string => {
  if (!stageId) return '전체';
  if (stageId === 'all') return '전체';
  if (stageId === '집행완료_그룹') return '집행완료';
  // 한글 상태명은 그대로 반환
  return stageId;
};

const PAGE_SIZE = 20; // 페이지당 20개

export function CustomerTable({
  customers,
  userRole,
  selectedStage,
  users = [],
  currentUserTeamId,
  onStatusChange,
  onEdit,
  onDelete,
  onViewHistory,
  onCustomerClick,
  onProcessingOrgChange,
  onProcessingOrgsChange,
  onAddMemo,
  onDeleteMemo,
  onManagerChange,
  onAddProcessingOrgWithAutoStatus,
  onApproveOrg,
  currentUser,
  overdueTodoCustomerIds = new Set(),
  sortMode,
  onSortModeChange,
}: CustomerTableProps) {
  const canDelete = userRole === 'super_admin';
  const canApproveOrg = userRole === 'super_admin'; // 승인은 super_admin만 가능
  
  // 담당자 변경 권한 체크 함수
  // super_admin: 모든 고객의 담당자 변경 가능
  // team_leader: 소속 팀 고객의 담당자만 변경 가능
  // staff: 담당자 변경 불가
  const canChangeManager = (customer: Customer): boolean => {
    if (userRole === 'super_admin') return true;
    if (userRole === 'team_leader' && currentUserTeamId) {
      // 팀장은 소속 팀 고객만 변경 가능 (고객의 팀ID가 팀장의 팀ID와 일치)
      return customer.team_id === currentUserTeamId;
    }
    return false;
  };
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(customers.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedCustomers = customers.slice(startIndex, startIndex + PAGE_SIZE);
  
  // 필터(스테이지) 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStage, customers.length]);
  
  // Memo modal state
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [selectedCustomerForMemo, setSelectedCustomerForMemo] = useState<Customer | null>(null);

  // 장기부재 확인 모달 state
  const [longAbsenceConfirm, setLongAbsenceConfirm] = useState<{
    isOpen: boolean;
    customer: Customer | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    customer: null,
    isLoading: false,
  });

  const [reservationPending, setReservationPending] = useState<{
    isOpen: boolean;
    customer: Customer | null;
  }>({
    isOpen: false,
    customer: null,
  });

  // 재집행으로 추가 토글 state
  const [addAsReExecution, setAddAsReExecution] = useState(false);

  // 진행기관 승인 모달 state (집행일자/금액 입력)
  const [orgApprovalModal, setOrgApprovalModal] = useState<{
    isOpen: boolean;
    customerId: string;
    customer: Customer | null;
    orgName: string;
    executionDate: string;
    executionAmount: number;
    isLoading: boolean;
  }>({
    isOpen: false,
    customerId: '',
    customer: null,
    orgName: '',
    executionDate: format(new Date(), 'yyyy-MM-dd'),
    executionAmount: 0,
    isLoading: false,
  });

  const handleMemoDoubleClick = (customer: Customer) => {
    setSelectedCustomerForMemo(customer);
    setMemoModalOpen(true);
  };

  // 장기부재 확인 후 처리
  const handleLongAbsenceConfirm = async () => {
    if (!longAbsenceConfirm.customer) return;
    
    setLongAbsenceConfirm(prev => ({ ...prev, isLoading: true }));
    
    try {
      // 상태 변경 실행
      await onStatusChange(
        longAbsenceConfirm.customer.id, 
        longAbsenceConfirm.customer.status_code, 
        "장기부재" as StatusCode
      );
      
      // 장기부재 알림톡 발송
      // services 필드가 없으면 메모에서 파싱 시도
      let services = (longAbsenceConfirm.customer as any).services || [];
      if (services.length === 0 && longAbsenceConfirm.customer.memo_history && longAbsenceConfirm.customer.memo_history.length > 0) {
        const firstMemo = longAbsenceConfirm.customer.memo_history[0]?.content || '';
        const serviceMatch = firstMemo.match(/- 신청 서비스: (.+)/);
        if (serviceMatch) {
          services = serviceMatch[1].split(', ').map((s: string) => s.trim());
        }
      }
      const { authFetch } = await import("@/lib/firebase");
      const response = await authFetch("/api/solapi/send-longabsence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: longAbsenceConfirm.customer.phone,
          customerName: longAbsenceConfirm.customer.name || longAbsenceConfirm.customer.company_name,
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
      console.error("장기부재 처리 오류:", error);
    } finally {
      setLongAbsenceConfirm({ isOpen: false, customer: null, isLoading: false });
    }
  };

  const handleAddMemo = (content: string) => {
    if (!selectedCustomerForMemo) return;
    
    // Create memo in CustomerMemo format
    const newMemo: CustomerMemo = {
      content,
      author_id: '', // Will be filled by Dashboard handler
      author_name: '', // Will be filled by Dashboard handler
      created_at: new Date(),
    };
    
    // Update selected customer for modal (optimistic update)
    setSelectedCustomerForMemo(prev => {
      if (!prev) return null;
      const updatedHistory: CustomerMemo[] = [...(prev.memo_history || []), newMemo];
      return {
        ...prev,
        memo_history: updatedHistory,
        latest_memo: content,
      };
    });
    
    // Call external handler to persist to Firestore (including memo_history)
    onAddMemo?.(selectedCustomerForMemo.id, content);
  };

  const handleProcessingOrgChange = (customerId: string, newOrg: string) => {
    // Call external handler if provided
    onProcessingOrgChange?.(customerId, newOrg);
  };

  // 다중 기관 관리 함수 - 자동 상태 변경 및 이력 기록 포함
  const handleAddProcessingOrg = (customerId: string, customer: Customer, orgName: string, isReExecution?: boolean) => {
    const currentOrgs = customer.processing_orgs || [];
    // 중복 체크
    if (currentOrgs.find(o => o.org === orgName)) return;
    
    // 새 콜백이 있으면 사용 (이력 기록 + 자동 상태 변경)
    if (onAddProcessingOrgWithAutoStatus) {
      onAddProcessingOrgWithAutoStatus(customerId, customer, orgName, isReExecution);
      // 재집행 토글 초기화
      if (isReExecution) {
        setAddAsReExecution(false);
      }
    } else {
      // 기존 로직 (호환성)
      const newOrg: ProcessingOrg = {
        org: orgName,
        status: '진행중',
        applied_at: new Date().toISOString().split('T')[0],
        is_re_execution: isReExecution || false,
      };
      const updatedOrgs = [...currentOrgs, newOrg];
      onProcessingOrgsChange?.(customerId, updatedOrgs);
      // 재집행 토글 초기화
      if (isReExecution) {
        setAddAsReExecution(false);
      }
    }
  };

  const handleUpdateOrgStatus = (customerId: string, customer: Customer, orgName: string, newStatus: ProcessingOrgStatus) => {
    // 승인의 경우 모달을 통해 집행일자/금액 입력 필요
    if (newStatus === '승인') {
      setOrgApprovalModal({
        isOpen: true,
        customerId,
        customer,
        orgName,
        executionDate: format(new Date(), 'yyyy-MM-dd'),
        executionAmount: 0,
        isLoading: false,
      });
      return;
    }
    
    // 부결의 경우 직접 처리
    const currentOrgs = customer.processing_orgs || [];
    const updatedOrgs = currentOrgs.map(o => {
      if (o.org === orgName) {
        const updated = { ...o, status: newStatus };
        if (newStatus === '부결') {
          updated.rejected_at = new Date().toISOString().split('T')[0];
        }
        return updated;
      }
      return o;
    });
    onProcessingOrgsChange?.(customerId, updatedOrgs);
  };

  // 진행기관 승인 확정 처리 (모달에서 확인 버튼 클릭 시)
  const handleOrgApprovalConfirm = async () => {
    if (!orgApprovalModal.customer || !orgApprovalModal.orgName) return;
    
    setOrgApprovalModal(prev => ({ ...prev, isLoading: true }));
    
    try {
      if (onApproveOrg) {
        // 새 콜백 사용 (이력 기록 포함)
        await onApproveOrg(
          orgApprovalModal.customerId,
          orgApprovalModal.customer,
          orgApprovalModal.orgName,
          orgApprovalModal.executionDate,
          orgApprovalModal.executionAmount
        );
      } else {
        // 기존 로직 (호환성)
        const currentOrgs = orgApprovalModal.customer.processing_orgs || [];
        const updatedOrgs = currentOrgs.map(o => {
          if (o.org === orgApprovalModal.orgName) {
            return { 
              ...o, 
              status: '승인' as ProcessingOrgStatus, 
              approved_at: orgApprovalModal.executionDate 
            };
          }
          return o;
        });
        onProcessingOrgsChange?.(orgApprovalModal.customerId, updatedOrgs);
      }
      
      setOrgApprovalModal({
        isOpen: false,
        customerId: '',
        customer: null,
        orgName: '',
        executionDate: format(new Date(), 'yyyy-MM-dd'),
        executionAmount: 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error approving org:', error);
      setOrgApprovalModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleRemoveProcessingOrg = (customerId: string, customer: Customer, orgName: string) => {
    const currentOrgs = getProcessingOrgsFromCustomer(customer);
    const updatedOrgs = currentOrgs.filter(o => o.org !== orgName);
    onProcessingOrgsChange?.(customerId, updatedOrgs);
  };

  // 기존 processing_org를 processing_orgs로 변환 (호환성)
  const getProcessingOrgsFromCustomer = (customer: Customer): ProcessingOrg[] => {
    if (customer.processing_orgs && customer.processing_orgs.length > 0) {
      return customer.processing_orgs;
    }
    // 기존 processing_org 필드가 있고 '미등록'이 아니면 변환
    if (customer.processing_org && customer.processing_org !== '미등록') {
      return [{ org: customer.processing_org, status: '진행중' }];
    }
    return [];
  };

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-foreground">데이터가 없습니다</p>
        <p className="text-sm text-muted-foreground mt-1">
          우측 상단 버튼을 눌러 고객을 추가해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar with filter info */}
      <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
        <FolderOpen className="w-5 h-5 text-muted-foreground" />
        <span className="text-sm font-medium">
          현재 조회: <span className="text-primary">{getStageName(selectedStage)}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          ({customers.length}건)
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-28 font-semibold whitespace-nowrap text-center hidden md:table-cell">
                {!selectedStage && onSortModeChange ? (
                  <button
                    onClick={() => onSortModeChange(sortMode === 'entry_date' ? 'updated_at' : 'entry_date')}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer",
                      sortMode === 'entry_date' && "text-primary"
                    )}
                    data-testid="button-sort-entry-date"
                  >
                    유입일자
                    {sortMode === 'entry_date' ? (
                      <ArrowDown className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                    )}
                  </button>
                ) : (
                  '유입일자'
                )}
              </TableHead>
              <TableHead className="w-[50px] font-semibold text-center whitespace-nowrap hidden md:table-cell">No</TableHead>
              <TableHead className="w-[90px] font-semibold whitespace-nowrap">고객명</TableHead>
              <TableHead className="w-[150px] font-semibold whitespace-nowrap">상태</TableHead>
              <TableHead className="w-[70px] font-semibold text-center whitespace-nowrap hidden lg:table-cell">신용점수</TableHead>
              <TableHead className="w-[130px] font-semibold whitespace-nowrap hidden md:table-cell">상호명</TableHead>
              <TableHead className="w-[60px] font-semibold text-center whitespace-nowrap hidden xl:table-cell">7년초과</TableHead>
              <TableHead className="w-[90px] font-semibold text-right whitespace-nowrap hidden xl:table-cell">3년평균</TableHead>
              <TableHead className="w-[90px] font-semibold text-right whitespace-nowrap hidden xl:table-cell">최근매출</TableHead>
              <TableHead className="w-[90px] font-semibold whitespace-nowrap hidden lg:table-cell">업종</TableHead>
              <TableHead className="w-[100px] font-semibold whitespace-nowrap text-center hidden lg:table-cell">진행기관</TableHead>
              <TableHead className="w-[160px] font-semibold whitespace-nowrap hidden md:table-cell">최근 메모</TableHead>
              <TableHead className="w-20 font-semibold whitespace-nowrap text-left">담당자</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCustomers.map((customer, index) => {
              const isClosed = CLOSED_STATUSES.has(customer.status_code);
              return (
              <TableRow 
                key={customer.id} 
                className={cn(
                  "group",
                  isClosed
                    ? "opacity-40 bg-muted/40 dark:bg-gray-900/60 hover:opacity-70 hover:bg-muted/50"
                    : "hover:bg-muted/30",
                  overdueTodoCustomerIds.has(customer.id) && !isClosed && "overdue-todo-row",
                  !overdueTodoCustomerIds.has(customer.id) && !isClosed && (customer.status_code === '상담대기' || customer.status_code === '단기부재') && "priority-status-row"
                )}
                data-testid={`row-customer-${customer.id}`}
              >
                {/* 유입일자 */}
                <TableCell className="text-sm tabular-nums whitespace-nowrap hidden md:table-cell">
                  {customer.entry_date}
                </TableCell>
                
                {/* No - daily_no (당일 일련번호) */}
                <TableCell className="text-center text-muted-foreground tabular-nums font-medium hidden md:table-cell">
                  {customer.daily_no || customer.daily_sequence || '-'}
                </TableCell>
                
                {/* 고객명 - clickable with hover info popup */}
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onCustomerClick?.(customer)}
                        className="font-medium text-primary hover:underline cursor-pointer"
                        data-testid={`text-customer-name-${customer.id}`}
                      >
                        {customer.name}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="p-3 max-w-xs">
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 shrink-0">고객명</span>
                          <span className="font-medium">{customer.name || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 shrink-0">주민번호</span>
                          <span className="font-mono">
                            {customer.ssn_front && customer.ssn_back 
                              ? `${customer.ssn_front}-${customer.ssn_back}` 
                              : customer.ssn_front 
                                ? `${customer.ssn_front}-*******` 
                                : '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 shrink-0">전화번호</span>
                          <span className="font-mono">{customer.phone || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 shrink-0">통신사</span>
                          <span>{customer.carrier || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 shrink-0">상호명</span>
                          <span>{customer.company_name || '-'}</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                
                {/* 상태 - Custom dark dropdown with grouped options */}
                <TableCell>
                  {(() => {
                    const badgeInfo = getStatusBadgeInfo(customer.status_code || '');
                    const isSuperAdmin = userRole === 'super_admin';
                    const canChangeToExecution = userRole === 'team_leader' || userRole === 'super_admin';
                    
                    const currentStatus = customer.status_code || '';
                    
                    const canSelectStatus = (targetStatus: string): boolean => {
                      return getStatusTransitionAllowed(currentStatus, targetStatus, isSuperAdmin);
                    };
                    
                    return (
                      <Select
                        key={`status-select-${customer.id}-${customer.status_code}`}
                        value={customer.status_code || ''}
                        onValueChange={(newStatus) => {
                          if (newStatus && newStatus !== customer.status_code) {
                            // 장기부재 상태 변경 시 확인 다이얼로그 표시
                            if (newStatus === "장기부재") {
                              setLongAbsenceConfirm({
                                isOpen: true,
                                customer: customer,
                                isLoading: false,
                              });
                              return;
                            }
                            if (newStatus === "예약") {
                              setReservationPending({
                                isOpen: true,
                                customer: customer,
                              });
                              return;
                            }
                            onStatusChange(customer.id, customer.status_code, newStatus as StatusCode);
                          }
                        }}
                      >
                        <SelectTrigger 
                          className="h-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0 w-auto min-w-0"
                          hideIcon={true}
                          data-testid={`select-status-${customer.id}`}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span 
                                className={cn(
                                  "inline-block px-2 py-1 text-xs font-medium rounded-md truncate max-w-[130px]",
                                  badgeInfo.colorClass
                                )}
                                data-testid={`badge-status-${customer.id}`}
                              >
                                {badgeInfo.label || '상태 선택'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">{badgeInfo.category} &gt; {badgeInfo.label}</p>
                            </TooltipContent>
                          </Tooltip>
                        </SelectTrigger>
                        <SelectContent 
                          className="shadow-xl max-h-[300px] overflow-y-auto status-dropdown-content"
                          position="popper"
                          sideOffset={5}
                        >
                          {/* 상담 그룹 */}
                          {canSelectStatus('상담대기') && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1">상담</SelectLabel>
                            <SelectItem value="상담대기" className="text-purple-600 dark:text-purple-400 focus:bg-accent cursor-pointer pl-4">상담대기</SelectItem>
                          </SelectGroup>
                          )}

                          {/* 부재 그룹 */}
                          {(canSelectStatus('단기부재') || canSelectStatus('장기부재') || canSelectStatus('예약')) && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">부재</SelectLabel>
                            {canSelectStatus('단기부재') && <SelectItem value="단기부재" className="text-orange-600 dark:text-orange-400 focus:bg-accent cursor-pointer pl-4">단기부재</SelectItem>}
                            {canSelectStatus('장기부재') && <SelectItem value="장기부재" className="text-orange-600 dark:text-orange-400 focus:bg-accent cursor-pointer pl-4">장기부재</SelectItem>}
                            {canSelectStatus('예약') && <SelectItem value="예약" className="text-orange-600 dark:text-orange-400 focus:bg-accent cursor-pointer pl-4">예약</SelectItem>}
                          </SelectGroup>
                          )}

                          {/* 거절 그룹 (쓰레기통) */}
                          {TRASH_REASONS.some(r => canSelectStatus(r.id)) && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">거절</SelectLabel>
                            {TRASH_REASONS.filter(reason => canSelectStatus(reason.id)).map(reason => (
                              <SelectItem 
                                key={reason.id} 
                                value={reason.id}
                                className="text-rose-600 dark:text-rose-400 focus:bg-accent cursor-pointer pl-4 text-xs"
                              >
                                {reason.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          )}

                          {/* 희망타겟 그룹 */}
                          {canSelectStatus('업력미달') && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">희망타겟</SelectLabel>
                            <SelectItem value="업력미달" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">업력미달</SelectItem>
                            <SelectItem value="최근대출" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">최근대출</SelectItem>
                            <SelectItem value="인증미동의(국세청)" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">인증미동의(국세청)</SelectItem>
                            <SelectItem value="인증미동의(공여내역)" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">인증미동의(공여내역)</SelectItem>
                            <SelectItem value="진행기간 미동의" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">진행기간 미동의</SelectItem>
                            <SelectItem value="자문료 미동의" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">자문료 미동의</SelectItem>
                            <SelectItem value="계약금미동의(선불)" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">계약금미동의(선불)</SelectItem>
                            <SelectItem value="계약금미동의(후불)" className="text-amber-600 dark:text-yellow-400 focus:bg-accent cursor-pointer pl-4">계약금미동의(후불)</SelectItem>
                          </SelectGroup>
                          )}

                          {/* 계약서발송완료 그룹 */}
                          {(canSelectStatus('계약서발송완료(선불)') || canSelectStatus('계약서발송완료(후불)') || canSelectStatus('계약서발송완료(외주)')) && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">계약서발송완료</SelectLabel>
                            {canSelectStatus('계약서발송완료(선불)') && <SelectItem value="계약서발송완료(선불)" className="text-lime-600 dark:text-lime-400 focus:bg-accent cursor-pointer pl-4">계약서발송완료(선불)</SelectItem>}
                            {canSelectStatus('계약서발송완료(후불)') && <SelectItem value="계약서발송완료(후불)" className="text-lime-600 dark:text-lime-400 focus:bg-accent cursor-pointer pl-4">계약서발송완료(후불)</SelectItem>}
                            {canSelectStatus('계약서발송완료(외주)') && <SelectItem value="계약서발송완료(외주)" className="text-lime-600 dark:text-lime-400 focus:bg-accent cursor-pointer pl-4">계약서발송완료(외주)</SelectItem>}
                          </SelectGroup>
                          )}

                          {/* 수납대기 */}
                          {canSelectStatus('수납대기') && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">수납대기</SelectLabel>
                            <SelectItem value="수납대기" className="text-cyan-600 dark:text-cyan-400 focus:bg-accent cursor-pointer pl-4">수납대기</SelectItem>
                          </SelectGroup>
                          )}

                          {/* 계약완료 그룹 */}
                          {(canSelectStatus('계약완료(선불)') || canSelectStatus('계약완료(외주)') || canSelectStatus('계약완료(후불)')) && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">계약완료</SelectLabel>
                            {canSelectStatus('계약완료(선불)') && (
                              <SelectItem value="계약완료(선불)" className="text-emerald-600 dark:text-emerald-400 focus:bg-accent cursor-pointer pl-4">계약완료(선불)</SelectItem>
                            )}
                            {canSelectStatus('계약완료(외주)') && (
                              <SelectItem value="계약완료(외주)" className="text-emerald-600 dark:text-emerald-400 focus:bg-accent cursor-pointer pl-4">계약완료(외주)</SelectItem>
                            )}
                            {canSelectStatus('계약완료(후불)') && (
                              <SelectItem value="계약완료(후불)" className="text-emerald-600 dark:text-emerald-400 focus:bg-accent cursor-pointer pl-4">계약완료(후불)</SelectItem>
                            )}
                          </SelectGroup>
                          )}

                          {/* 서류취합 그룹 */}
                          {(canSelectStatus('서류취합완료(선불)') || canSelectStatus('서류취합완료(외주)') || canSelectStatus('서류취합완료(후불)')) && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">서류취합</SelectLabel>
                            {canSelectStatus('서류취합완료(선불)') && (
                              <SelectItem value="서류취합완료(선불)" className="text-blue-600 dark:text-blue-400 focus:bg-accent cursor-pointer pl-4">서류취합완료(선불)</SelectItem>
                            )}
                            {canSelectStatus('서류취합완료(외주)') && (
                              <SelectItem value="서류취합완료(외주)" className="text-blue-600 dark:text-blue-400 focus:bg-accent cursor-pointer pl-4">서류취합완료(외주)</SelectItem>
                            )}
                            {canSelectStatus('서류취합완료(후불)') && (
                              <SelectItem value="서류취합완료(후불)" className="text-blue-600 dark:text-blue-400 focus:bg-accent cursor-pointer pl-4">서류취합완료(후불)</SelectItem>
                            )}
                          </SelectGroup>
                          )}

                          {/* 신청완료 그룹 */}
                          {(canSelectStatus('신청완료(선불)') || canSelectStatus('신청완료(외주)') || canSelectStatus('신청완료(후불)')) && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">신청완료</SelectLabel>
                            {canSelectStatus('신청완료(선불)') && (
                              <SelectItem value="신청완료(선불)" className="text-cyan-600 dark:text-cyan-400 focus:bg-accent cursor-pointer pl-4">신청완료(선불)</SelectItem>
                            )}
                            {canSelectStatus('신청완료(외주)') && (
                              <SelectItem value="신청완료(외주)" className="text-cyan-600 dark:text-cyan-400 focus:bg-accent cursor-pointer pl-4">신청완료(외주)</SelectItem>
                            )}
                            {canSelectStatus('신청완료(후불)') && (
                              <SelectItem value="신청완료(후불)" className="text-cyan-600 dark:text-cyan-400 focus:bg-accent cursor-pointer pl-4">신청완료(후불)</SelectItem>
                            )}
                          </SelectGroup>
                          )}

                          {/* 집행완료 그룹 - team_leader, super_admin만 선택 가능 */}
                          {(
                            (canChangeToExecution && (canSelectStatus('집행완료(선불)') || canSelectStatus('집행완료(외주)') || canSelectStatus('집행완료(후불)'))) ||
                            canSelectStatus('최종부결') || canSelectStatus('민원처리')
                          ) && (
                          <SelectGroup>
                            <SelectLabel className="text-muted-foreground text-xs font-normal px-2 py-1 mt-1">집행/종결</SelectLabel>
                            {canChangeToExecution && canSelectStatus('집행완료(선불)') && (
                              <SelectItem value="집행완료(선불)" className="text-teal-600 dark:text-teal-400 focus:bg-accent cursor-pointer pl-4">집행완료(선불)</SelectItem>
                            )}
                            {canChangeToExecution && canSelectStatus('집행완료(외주)') && (
                              <SelectItem value="집행완료(외주)" className="text-teal-600 dark:text-teal-400 focus:bg-accent cursor-pointer pl-4">집행완료(외주)</SelectItem>
                            )}
                            {canChangeToExecution && canSelectStatus('집행완료(후불)') && (
                              <SelectItem value="집행완료(후불)" className="text-teal-600 dark:text-teal-400 focus:bg-accent cursor-pointer pl-4">집행완료(후불)</SelectItem>
                            )}
                            {canSelectStatus('최종부결') && <SelectItem value="최종부결" className="text-red-600 dark:text-red-400 focus:bg-accent cursor-pointer pl-4">최종부결</SelectItem>}
                            {canSelectStatus('민원처리') && <SelectItem value="민원처리" className="text-orange-600 dark:text-orange-400 focus:bg-accent cursor-pointer pl-4">민원처리</SelectItem>}
                          </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </TableCell>
                
                {/* 신용점수 - 800+ yellow pulse, 700- red */}
                <TableCell className="text-center hidden lg:table-cell">
                  <span className={cn(
                    "font-semibold tabular-nums",
                    (customer.credit_score || 0) >= 800 && "text-yellow-400 animate-pulse",
                    (customer.credit_score || 0) < 700 && (customer.credit_score || 0) > 0 && "text-red-500",
                    (customer.credit_score || 0) >= 700 && (customer.credit_score || 0) < 800 && "text-foreground"
                  )}>
                    {customer.credit_score || '-'}
                  </span>
                </TableCell>
                
                {/* 상호명 */}
                <TableCell className="text-muted-foreground truncate max-w-[130px] hidden md:table-cell">
                  {customer.company_name}
                </TableCell>
                
                {/* 7년 초과 - 경고 표시 (부정적 조건) */}
                <TableCell className="text-center hidden xl:table-cell">
                  {customer.over_7_years ? (
                    <Badge variant="outline" className="bg-orange-900/30 text-orange-400 border-orange-500/20">
                      <AlertTriangle className="w-3 h-3" />
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20">
                      <X className="w-3 h-3" />
                    </Badge>
                  )}
                </TableCell>
                
                {/* 3년 평균 매출 (Y-1, Y-2, Y-3 평균) */}
                <TableCell className="text-right tabular-nums hidden xl:table-cell">
                  {(() => {
                    const y1 = customer.sales_y1 || 0;
                    const y2 = customer.sales_y2 || 0;
                    const y3 = customer.sales_y3 || 0;
                    const values = [y1, y2, y3].filter(v => v > 0);
                    if (values.length === 0) return '-';
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    return `${avg.toFixed(1)}억`;
                  })()}
                </TableCell>
                
                {/* 최근 매출(작년) */}
                <TableCell className="text-right tabular-nums hidden xl:table-cell">
                  {customer.recent_sales ? `${customer.recent_sales.toFixed(1)}억` : '-'}
                </TableCell>
                
                {/* 업종 */}
                <TableCell className="text-muted-foreground text-sm hidden lg:table-cell">
                  {customer.business_type || customer.industry || '-'}
                </TableCell>
                
                {/* 진행기관 - 다중 기관 뱃지 */}
                <TableCell className="hidden lg:table-cell">
                  <Popover>
                    <PopoverTrigger asChild>
                      <div 
                        className="flex flex-wrap gap-1 min-w-[100px] max-w-[200px] cursor-pointer hover:bg-muted/50 p-1 rounded"
                        data-testid={`orgs-trigger-${customer.id}`}
                      >
                        {(() => {
                          const orgs = getProcessingOrgsFromCustomer(customer);
                          const isPostContract = customer.status_code?.includes('계약완료') || customer.status_code?.includes('서류취합완료') || customer.status_code?.includes('신청완료') || customer.status_code?.includes('집행완료');
                          if (orgs.length === 0) {
                            if (!isPostContract) {
                              return <span className="text-xs text-muted-foreground">-</span>;
                            }
                            return (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Plus className="w-3 h-3" />
                                기관 추가
                              </span>
                            );
                          }
                          return orgs.map((org, idx) => {
                            const colors = ORG_STATUS_COLORS[org.status];
                            return (
                              <Badge
                                key={idx}
                                variant="outline"
                                className={cn(
                                  "text-xs px-1.5 py-0.5 flex items-center gap-0.5",
                                  colors.bg,
                                  colors.text,
                                  colors.border,
                                  org.is_re_execution && "border-dashed"
                                )}
                              >
                                {org.is_re_execution && <RotateCcw className="w-2.5 h-2.5" />}
                                {org.status === '부결' && <XCircle className="w-3 h-3" />}
                                {org.status === '승인' && <CheckCircle className="w-3 h-3" />}
                                {org.org}
                              </Badge>
                            );
                          });
                        })()}
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="start">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">진행기관 관리</span>
                        </div>
                        
                        {/* 현재 기관 목록 */}
                        {(() => {
                          const orgs = getProcessingOrgsFromCustomer(customer);
                          if (orgs.length === 0) {
                            return (
                              <p className="text-xs text-muted-foreground py-2">등록된 기관이 없습니다.</p>
                            );
                          }
                          return (
                            <div className="space-y-2">
                              {orgs.map((org, idx) => {
                                const colors = ORG_STATUS_COLORS[org.status];
                                return (
                                  <div key={idx} className={cn("flex items-center justify-between p-2 rounded border", colors.border, colors.bg)}>
                                    <div className="flex-1">
                                      <div className={cn("font-medium text-sm flex items-center gap-1", colors.text)}>
                                        {org.org}
                                        {org.is_re_execution && (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-500/50">
                                            <RotateCcw className="w-2 h-2 mr-0.5" />
                                            재집행
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {org.applied_at && `접수: ${org.applied_at}`}
                                        {org.rejected_at && ` | 부결: ${org.rejected_at}`}
                                        {org.approved_at && ` | 승인: ${org.approved_at}`}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {org.status === '진행중' && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 text-red-600 hover:bg-red-100"
                                            onClick={() => handleUpdateOrgStatus(customer.id, customer, org.org, '부결')}
                                            data-testid={`btn-reject-${org.org}`}
                                          >
                                            <XCircle className="w-4 h-4" />
                                          </Button>
                                          {/* 승인 버튼은 super_admin만 가능 */}
                                          {canApproveOrg && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-6 w-6 p-0 text-green-600 hover:bg-green-100"
                                              onClick={() => handleUpdateOrgStatus(customer.id, customer, org.org, '승인')}
                                              data-testid={`btn-approve-${org.org}`}
                                            >
                                              <CheckCircle className="w-4 h-4" />
                                            </Button>
                                          )}
                                        </>
                                      )}
                                      {/* 삭제 버튼: 승인된 기관은 super_admin만 삭제 가능 */}
                                      {(org.status !== '승인' || canDelete) && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted"
                                          onClick={() => handleRemoveProcessingOrg(customer.id, customer, org.org)}
                                          data-testid={`btn-remove-${org.org}`}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        
                        {/* 기관 추가 - 계약완료 이후 상태에서만 표시 */}
                        {(customer.status_code?.includes('계약완료') || customer.status_code?.includes('서류취합완료') || customer.status_code?.includes('신청완료') || customer.status_code?.includes('집행완료')) && (
                        <div className="border-t pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-muted-foreground">기관 추가</p>
                            {/* 재집행으로 추가 토글 - 선행 집행건이 있을 때만 표시 */}
                            {(() => {
                              const existingOrgs = getProcessingOrgsFromCustomer(customer);
                              const hasExecutedOrg = existingOrgs.some(o => 
                                o.status === '승인' && o.execution_date && o.execution_amount
                              );
                              if (!hasExecutedOrg) return null;
                              return (
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={addAsReExecution}
                                    onChange={(e) => setAddAsReExecution(e.target.checked)}
                                    className="w-3 h-3 rounded border-gray-300"
                                    data-testid="checkbox-add-as-re-execution"
                                  />
                                  <span className={cn(
                                    "text-[10px]",
                                    addAsReExecution ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"
                                  )}>
                                    <RotateCcw className="w-2.5 h-2.5 inline mr-0.5" />
                                    재집행
                                  </span>
                                </label>
                              );
                            })()}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {PROCESSING_ORGS.filter(org => {
                              const existingOrgs = getProcessingOrgsFromCustomer(customer);
                              return !existingOrgs.find(o => o.org === org);
                            }).map(org => (
                              <Badge
                                key={org}
                                variant="outline"
                                className={cn(
                                  "text-xs cursor-pointer",
                                  addAsReExecution 
                                    ? "hover:bg-amber-100 dark:hover:bg-amber-900/30 border-amber-500/50" 
                                    : "hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                )}
                                onClick={() => handleAddProcessingOrg(customer.id, customer, org, addAsReExecution)}
                                data-testid={`btn-add-org-${org}`}
                              >
                                <Plus className="w-3 h-3 mr-0.5" />
                                {org}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </TableCell>
                
                {/* 최근 메모 - truncate with tooltip, double-click to open modal */}
                <TableCell
                  onDoubleClick={() => handleMemoDoubleClick(customer)}
                  className="cursor-pointer hidden md:table-cell"
                  data-testid={`cell-memo-${customer.id}`}
                >
                  {(() => {
                    const memoHistory = customer.memo_history || [];
                    const isSuperAdmin = currentUser?.role === 'super_admin';
                    const lastMemo = memoHistory.length > 0 ? memoHistory[memoHistory.length - 1] : null;
                    const latestActiveMemo = [...memoHistory].reverse().find(m => !m.is_deleted);

                    const recentMemos = [...memoHistory].reverse().filter(m => {
                      if (m.is_deleted && !isSuperAdmin) return false;
                      return true;
                    }).slice(0, 5);

                    if (!lastMemo && !customer.latest_memo) {
                      return <span className="text-muted-foreground text-sm">-</span>;
                    }

                    const displayText = lastMemo?.is_deleted
                      ? (isSuperAdmin ? lastMemo.content : '[삭제된 메세지 입니다.]')
                      : (latestActiveMemo?.content || customer.latest_memo);

                    if (!displayText) {
                      return <span className="text-muted-foreground text-sm">-</span>;
                    }

                    const formatDate = (d: any) => {
                      if (!d) return '';
                      const date = d instanceof Date ? d : d?.toDate ? d.toDate() : new Date(d);
                      const mm = String(date.getMonth() + 1).padStart(2, '0');
                      const dd = String(date.getDate()).padStart(2, '0');
                      const hh = String(date.getHours()).padStart(2, '0');
                      const mi = String(date.getMinutes()).padStart(2, '0');
                      return `${mm}.${dd} ${hh}:${mi}`;
                    };

                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn(
                            "text-sm text-muted-foreground truncate block max-w-[140px]",
                            lastMemo?.is_deleted && isSuperAdmin && "line-through",
                            lastMemo?.is_deleted && !isSuperAdmin && "italic"
                          )}>
                            {displayText}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[320px] p-0">
                          <div className="p-2 space-y-1.5">
                            {recentMemos.length > 0 ? recentMemos.map((memo, idx) => (
                              <div key={idx} className={cn(
                                "text-sm",
                                idx > 0 && "border-t border-border pt-1.5"
                              )}>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                                  <span className="font-medium">{memo.author_name || '알 수 없음'}</span>
                                  <span>·</span>
                                  <span>{formatDate(memo.created_at)}</span>
                                  {memo.is_deleted && isSuperAdmin && (
                                    <span className="text-red-400 ml-1">삭제됨</span>
                                  )}
                                </div>
                                <p className={cn(
                                  "text-sm break-words",
                                  memo.is_deleted && "line-through text-muted-foreground"
                                )}>{memo.content}</p>
                              </div>
                            )) : (
                              <p className="text-sm">{displayText}</p>
                            )}
                            <p className="text-xs text-muted-foreground border-t border-border pt-1.5">더블클릭하여 메모 추가</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })()}
                </TableCell>
                
                {/* 담당자 - dropdown for manager assignment (권한 기반) */}
                <TableCell className="w-24">
                  {canChangeManager(customer) && onManagerChange && users.length > 0 ? (
                    <Select
                      value={customer.manager_id || ''}
                      onValueChange={(value) => {
                        if (value === '__unassigned__') {
                          onManagerChange(customer.id, '', '미배정', '', '');
                        } else {
                          const selectedUser = users.find(u => u.uid === value);
                          if (selectedUser) {
                            onManagerChange(
                              customer.id,
                              selectedUser.uid,
                              selectedUser.name,
                              selectedUser.team_id || '',
                              selectedUser.team_name || ''
                            );
                          }
                        }
                      }}
                    >
                      <SelectTrigger 
                        className="h-7 text-xs border-none bg-transparent hover:bg-muted/50 px-2"
                        data-testid={`select-manager-${customer.id}`}
                      >
                        <SelectValue placeholder="미배정">
                          {customer.manager_name || '미배정'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value="__unassigned__">
                          <span className="text-muted-foreground">미배정</span>
                        </SelectItem>
                        {users.filter(u => u.uid && u.status === '재직').map(u => (
                          <SelectItem key={u.uid} value={u.uid}>
                            {u.name} {u.team_name ? `(${u.team_name})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {customer.manager_name || '미배정'}
                    </span>
                  )}
                </TableCell>
                
                {/* Actions - staff 사용자에게는 숨김 */}
                <TableCell>
                  {userRole !== 'staff' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-customer-menu-${customer.id}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onEdit(customer)}>
                          <Edit className="w-4 h-4 mr-2" />
                          정보 수정
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onViewHistory(customer.id)}>
                          <History className="w-4 h-4 mr-2" />
                          변경 이력
                        </DropdownMenuItem>

                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => onDelete(customer.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              삭제
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            data-testid="button-prev-page"
          >
            이전
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
              // 표시할 페이지 범위 계산 (현재 페이지 주변 5개)
              const showPage = 
                page === 1 || 
                page === totalPages || 
                (page >= currentPage - 2 && page <= currentPage + 2);
              
              if (!showPage) {
                // 생략 표시 (첫 생략과 마지막 생략만)
                if (page === 2 || page === totalPages - 1) {
                  return <span key={page} className="text-muted-foreground px-1">...</span>;
                }
                return null;
              }
              
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="min-w-[36px]"
                  data-testid={`button-page-${page}`}
                >
                  {page}
                </Button>
              );
            })}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            data-testid="button-next-page"
          >
            다음
          </Button>
          
          <span className="text-sm text-muted-foreground ml-4">
            총 {customers.length}건 (페이지 {currentPage}/{totalPages})
          </span>
        </div>
      )}

      {/* Memo Modal */}
      <MemoModal
        open={memoModalOpen}
        onOpenChange={setMemoModalOpen}
        customerName={selectedCustomerForMemo?.name || ''}
        memoHistory={selectedCustomerForMemo?.memo_history || []}
        onAddMemo={handleAddMemo}
        onDeleteMemo={(memoIndex) => {
          if (selectedCustomerForMemo?.id) {
            onDeleteMemo?.(selectedCustomerForMemo.id, memoIndex);
            setSelectedCustomerForMemo(prev => {
              if (!prev || !prev.memo_history) return prev;
              const updated = prev.memo_history.map((m, idx) =>
                idx === memoIndex
                  ? { ...m, is_deleted: true, deleted_by: currentUser?.uid || '', deleted_by_name: currentUser?.name || '', deleted_at: new Date() }
                  : m
              );
              const latestActive = [...updated].reverse().find(m => !m.is_deleted);
              return { ...prev, memo_history: updated, latest_memo: latestActive?.content || '', recent_memo: latestActive?.content || '' };
            });
          }
        }}
        isSuperAdmin={currentUser?.role === 'super_admin'}
        currentUserId={currentUser?.uid}
      />

      {/* 장기부재 확인 모달 */}
      <Dialog 
        open={longAbsenceConfirm.isOpen} 
        onOpenChange={(open) => {
          if (!open && !longAbsenceConfirm.isLoading) {
            setLongAbsenceConfirm({ isOpen: false, customer: null, isLoading: false });
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">장기부재 상태 변경</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-md">
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              정말 "{longAbsenceConfirm.customer?.name || longAbsenceConfirm.customer?.company_name}"님을 장기부재 상태로 변경하시겠습니까?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              상태 변경 시 고객에게 장기부재 안내 알림톡이 발송됩니다.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setLongAbsenceConfirm({ isOpen: false, customer: null, isLoading: false })}
              disabled={longAbsenceConfirm.isLoading}
              className="border-border text-muted-foreground"
            >
              취소
            </Button>
            <Button
              onClick={handleLongAbsenceConfirm}
              disabled={longAbsenceConfirm.isLoading}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-confirm-long-absence"
            >
              {longAbsenceConfirm.isLoading ? "처리 중..." : "확인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 진행기관 승인 모달 (집행일자/금액 입력) */}
      <Dialog
        open={orgApprovalModal.isOpen}
        onOpenChange={(open) => {
          if (!open && !orgApprovalModal.isLoading) {
            setOrgApprovalModal({
              isOpen: false,
              customerId: '',
              customer: null,
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
            ○ 고객의 상태를 "집행완료"(으)로 변경합니다.
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
                data-testid="input-org-approval-date"
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
                  data-testid="input-org-approval-amount"
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
                customerId: '',
                customer: null,
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
              onClick={handleOrgApprovalConfirm}
              disabled={orgApprovalModal.isLoading}
              data-testid="button-confirm-org-approval"
            >
              {orgApprovalModal.isLoading ? "처리 중..." : "확인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {currentUser && (
        <TodoForm
          open={reservationPending.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              setReservationPending({ isOpen: false, customer: null });
            }
          }}
          users={users}
          customers={customers}
          currentUser={currentUser}
          userRole={userRole}
          defaultCustomerId={reservationPending.customer?.id}
          onTodoCreated={() => {
            if (reservationPending.customer) {
              window.dispatchEvent(new CustomEvent('customerLocalSync', {
                detail: { customerId: reservationPending.customer.id, status_code: '예약' }
              }));
            }
            setReservationPending({ isOpen: false, customer: null });
          }}
        />
      )}
    </div>
  );
}
