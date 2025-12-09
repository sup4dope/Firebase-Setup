import { useState } from 'react';
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
  DropdownMenuSub,
  DropdownMenuSubTriggerLeft,
  DropdownMenuSubContentLeft,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MemoModal } from './MemoModal';
import { MoreHorizontal, Edit, Trash2, History, Check, X, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Customer, UserRole } from '@shared/types';

// Funnel stages synced with FunnelChart (excluding 'all')
const MENU_STAGES = [
  { id: '1', label: '상담대기' },
  { id: 'target', label: '희망타겟' },
  { id: '2', label: '계약완료' },
  { id: '3', label: '서류취합' },
  { id: '4', label: '신청완료' },
  { id: '5', label: '집행완료' },
];

// Sub-statuses synced with FunnelChart
const MENU_SUB_STATUSES: Record<string, { id: string; label: string }[]> = {
  '1': [
    { id: '1-1', label: '쓰레기통' },
    { id: '0-1', label: '단기부재' },
    { id: '0-2', label: '장기부재' },
  ],
  'target': [
    { id: '1-2-1', label: '업력미달' },
    { id: '1-2-2', label: '최근대출' },
    { id: '1-2-3', label: '인증미동의(국세청)' },
    { id: '1-2-4', label: '인증미동의(공여내역)' },
    { id: '1-3-1', label: '진행기간 미동의' },
    { id: '1-3-2', label: '자문료 미동의' },
    { id: '1-3-3', label: '계약금미동의(선불)' },
    { id: '1-3-4', label: '계약금미동의(후불)' },
  ],
  '2': [
    { id: '2-1', label: '계약완료(선불)' },
    { id: '2-2', label: '계약완료(외주)' },
    { id: '2-3', label: '계약완료(후불)' },
  ],
  '3': [
    { id: '3-1', label: '서류취합완료(선불)' },
    { id: '3-2', label: '서류취합완료(외주)' },
    { id: '3-3', label: '서류취합완료(후불)' },
  ],
  '4': [
    { id: '4-1', label: '신청완료(선불)' },
    { id: '4-2', label: '신청완료(외주)' },
    { id: '4-3', label: '신청완료(후불)' },
  ],
  '5': [
    { id: '5-1', label: '집행완료' },
    { id: '5-2', label: '집행완료(외주)' },
    { id: '5-3', label: '최종부결' },
  ],
};

// Nested statuses for 1-1 (쓰레기통 상세사유)
const TRASH_REASONS = [
  { id: '1-1-1', label: '거절사유 미파악' },
  { id: '1-1-2', label: '인증불가' },
  { id: '1-1-3', label: '정부기관 오인' },
  { id: '1-1-4', label: '기타자금 오인' },
  { id: '1-1-5', label: '불가업종' },
  { id: '1-1-6', label: '매출없음' },
  { id: '1-1-7', label: '신용점수 미달' },
  { id: '1-1-8', label: '차입금초과' },
];

interface CustomerTableProps {
  customers: Customer[];
  userRole: UserRole;
  selectedStage: string | null;
  onStatusChange: (customerId: string, currentStatus: StatusCode, newStatus: StatusCode) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customerId: string) => void;
  onViewHistory: (customerId: string) => void;
  onCustomerClick?: (customer: Customer) => void;
  onProcessingOrgChange?: (customerId: string, newOrg: string) => void;
  onAddMemo?: (customerId: string, content: string) => void;
}

const PROCESSING_ORGS = ['중진공', '신보', '기보', '소진공', '기타'];

// Dummy data for display
const DUMMY_CUSTOMERS: Customer[] = [
  {
    id: '1',
    readable_id: '241209-001',
    name: '김철수',
    company_name: '(주)테크솔루션',
    status_code: '2-1',
    manager_id: 'user1',
    manager_name: '박담당',
    team_id: 'team1',
    entry_date: '2024-12-01',
    approved_amount: 50000000,
    commission_rate: 2.5,
    created_at: new Date(),
    credit_score: 780,
    over_7_years: true,
    avg_revenue_3y: 15.5,
    recent_sales: 18.2,
    industry: '제조업',
    processing_org: '중진공',
    latest_memo: '서류 준비 중, 다음 주 화요일 방문 예정',
    memo_history: [
      { date: '2024-12-01', content: '첫 상담 진행, 관심도 높음' },
      { date: '2024-12-05', content: '서류 준비 중, 다음 주 화요일 방문 예정' },
    ],
  },
  {
    id: '2',
    readable_id: '241209-002',
    name: '이영희',
    company_name: '영희상사',
    status_code: '1-1',
    manager_id: 'user2',
    manager_name: '김매니저',
    team_id: 'team1',
    entry_date: '2024-12-02',
    approved_amount: 0,
    commission_rate: 0,
    created_at: new Date(),
    credit_score: 650,
    over_7_years: false,
    avg_revenue_3y: 3.2,
    recent_sales: 2.8,
    industry: '도소매',
    processing_org: '기보',
    latest_memo: '신용점수 미달로 상담 보류',
    memo_history: [
      { date: '2024-12-02', content: '신용점수 미달로 상담 보류' },
    ],
  },
  {
    id: '3',
    readable_id: '241208-003',
    name: '박지민',
    company_name: '지민테크',
    status_code: '4-3',
    manager_id: 'user1',
    manager_name: '박담당',
    team_id: 'team1',
    entry_date: '2024-11-15',
    approved_amount: 120000000,
    commission_rate: 3.0,
    created_at: new Date(),
    credit_score: 820,
    over_7_years: true,
    avg_revenue_3y: 45.0,
    recent_sales: 52.3,
    industry: 'IT서비스',
    processing_org: '신보',
    latest_memo: '계약 완료, 집행 대기 중',
    memo_history: [
      { date: '2024-11-15', content: '상담 시작' },
      { date: '2024-11-20', content: '서류 제출 완료' },
      { date: '2024-12-01', content: '계약 완료, 집행 대기 중' },
    ],
  },
  {
    id: '4',
    readable_id: '241207-004',
    name: '최동훈',
    company_name: '동훈물류',
    status_code: '3-2',
    manager_id: 'user3',
    manager_name: '이팀장',
    team_id: 'team2',
    entry_date: '2024-11-20',
    approved_amount: 80000000,
    commission_rate: 2.0,
    created_at: new Date(),
    credit_score: 720,
    over_7_years: true,
    avg_revenue_3y: 28.7,
    recent_sales: 31.5,
    industry: '물류/운송',
    processing_org: '중진공',
    latest_memo: '심사 진행 중, 추가 서류 요청됨',
    memo_history: [
      { date: '2024-11-20', content: '상담 완료' },
      { date: '2024-12-03', content: '심사 진행 중, 추가 서류 요청됨' },
    ],
  },
  {
    id: '5',
    readable_id: '241206-005',
    name: '정수아',
    company_name: '수아디자인',
    status_code: '5-2',
    manager_id: 'user2',
    manager_name: '김매니저',
    team_id: 'team1',
    entry_date: '2024-10-05',
    approved_amount: 200000000,
    commission_rate: 2.8,
    created_at: new Date(),
    credit_score: 850,
    over_7_years: true,
    avg_revenue_3y: 62.3,
    recent_sales: 71.0,
    industry: '디자인',
    processing_org: '기보',
    latest_memo: '집행 완료. 수수료 정산 대기',
    memo_history: [
      { date: '2024-10-05', content: '첫 상담' },
      { date: '2024-11-01', content: '계약 체결' },
      { date: '2024-12-01', content: '집행 완료. 수수료 정산 대기' },
    ],
  },
  {
    id: '6',
    readable_id: '241205-006',
    name: '한민준',
    company_name: '민준건설',
    status_code: '0-1',
    manager_id: 'user1',
    manager_name: '박담당',
    team_id: 'team1',
    entry_date: '2024-12-03',
    approved_amount: 0,
    commission_rate: 0,
    created_at: new Date(),
    credit_score: 680,
    over_7_years: false,
    avg_revenue_3y: 8.5,
    recent_sales: 7.2,
    industry: '건설',
    processing_org: '기타',
    latest_memo: '통화 불가, 재연락 필요',
    memo_history: [
      { date: '2024-12-03', content: '통화 불가, 재연락 필요' },
    ],
  },
  {
    id: '7',
    readable_id: '241204-007',
    name: '서예린',
    company_name: '예린F&B',
    status_code: '2-3',
    manager_id: 'user3',
    manager_name: '이팀장',
    team_id: 'team2',
    entry_date: '2024-11-25',
    approved_amount: 35000000,
    commission_rate: 2.5,
    created_at: new Date(),
    credit_score: 740,
    over_7_years: false,
    avg_revenue_3y: 12.1,
    recent_sales: 14.5,
    industry: '요식업',
    processing_org: '신보',
    latest_memo: '서류 완료, 심사 접수 예정',
    memo_history: [
      { date: '2024-11-25', content: '상담 완료' },
      { date: '2024-12-05', content: '서류 완료, 심사 접수 예정' },
    ],
  },
  {
    id: '8',
    readable_id: '241203-008',
    name: '윤성호',
    company_name: '성호전자',
    status_code: '1-2',
    manager_id: 'user2',
    manager_name: '김매니저',
    team_id: 'team1',
    entry_date: '2024-12-04',
    approved_amount: 0,
    commission_rate: 0,
    created_at: new Date(),
    credit_score: 810,
    over_7_years: true,
    avg_revenue_3y: 22.4,
    recent_sales: 25.8,
    industry: '전자/통신',
    processing_org: '소진공',
    latest_memo: '상담 진행 중, 조건 검토 필요. 고객이 금리에 대해 문의함. 다음 미팅에서 상세 설명 예정.',
    memo_history: [
      { date: '2024-12-04', content: '첫 상담 시작' },
      { date: '2024-12-06', content: '상담 진행 중, 조건 검토 필요. 고객이 금리에 대해 문의함. 다음 미팅에서 상세 설명 예정.' },
    ],
  },
];


const getStageName = (stageId: string | null): string => {
  if (!stageId) return '전체';
  const stageMap: Record<string, string> = {
    'all': '전체',
    '1': '상담대기',
    'target': '희망타겟',
    '2': '계약완료',
    '3': '서류취합',
    '4': '신청완료',
    '5': '집행완료',
    '1-1': '쓰레기통',
    '0-1': '단기부재',
    '0-2': '장기부재',
  };
  return stageMap[stageId] || STATUS_LABELS[stageId as StatusCode] || stageId;
};

export function CustomerTable({
  customers,
  userRole,
  selectedStage,
  onStatusChange,
  onEdit,
  onDelete,
  onViewHistory,
  onCustomerClick,
  onProcessingOrgChange,
  onAddMemo,
}: CustomerTableProps) {
  const canDelete = userRole === 'super_admin';
  
  // Memo modal state
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [selectedCustomerForMemo, setSelectedCustomerForMemo] = useState<Customer | null>(null);
  
  // Local state for dummy data updates
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(DUMMY_CUSTOMERS);
  
  // Use dummy data if no real customers
  const displayCustomers = customers.length > 0 ? customers : localCustomers;

  const handleMemoDoubleClick = (customer: Customer) => {
    setSelectedCustomerForMemo(customer);
    setMemoModalOpen(true);
  };

  const handleAddMemo = (content: string) => {
    if (!selectedCustomerForMemo) return;
    
    const today = new Date().toISOString().split('T')[0];
    const newMemo = { date: today, content };
    
    // Update local state for demo
    setLocalCustomers(prev => 
      prev.map(c => {
        if (c.id === selectedCustomerForMemo.id) {
          const updatedHistory = [...(c.memo_history || []), newMemo];
          return {
            ...c,
            memo_history: updatedHistory,
            latest_memo: content,
          };
        }
        return c;
      })
    );
    
    // Update selected customer for modal
    setSelectedCustomerForMemo(prev => {
      if (!prev) return null;
      const updatedHistory = [...(prev.memo_history || []), newMemo];
      return {
        ...prev,
        memo_history: updatedHistory,
        latest_memo: content,
      };
    });
    
    // Call external handler if provided
    onAddMemo?.(selectedCustomerForMemo.id, content);
  };

  const handleProcessingOrgChange = (customerId: string, newOrg: string) => {
    // Update local state for demo
    setLocalCustomers(prev =>
      prev.map(c => c.id === customerId ? { ...c, processing_org: newOrg } : c)
    );
    
    // Call external handler if provided
    onProcessingOrgChange?.(customerId, newOrg);
  };

  if (displayCustomers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Edit className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-foreground">등록된 고객이 없습니다</p>
        <p className="text-sm text-muted-foreground mt-1">
          새 고객을 추가하여 영업을 시작하세요
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
          ({displayCustomers.length}건)
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[50px] font-semibold text-center">No</TableHead>
              <TableHead className="w-[100px] font-semibold">유입일자</TableHead>
              <TableHead className="w-[90px] font-semibold">고객명</TableHead>
              <TableHead className="w-[70px] font-semibold text-center">신용점수</TableHead>
              <TableHead className="w-[130px] font-semibold">상호명</TableHead>
              <TableHead className="w-[60px] font-semibold text-center">7년초과</TableHead>
              <TableHead className="w-[90px] font-semibold text-right">3년평균</TableHead>
              <TableHead className="w-[90px] font-semibold text-right">최근매출</TableHead>
              <TableHead className="w-[90px] font-semibold">업종</TableHead>
              <TableHead className="w-[100px] font-semibold">진행기관</TableHead>
              <TableHead className="w-[160px] font-semibold">최근 메모</TableHead>
              <TableHead className="w-20 font-semibold">담당자</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayCustomers.map((customer, index) => (
              <TableRow 
                key={customer.id} 
                className="group hover:bg-muted/30"
                data-testid={`row-customer-${customer.id}`}
              >
                {/* No */}
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {index + 1}
                </TableCell>
                
                {/* 유입일자 */}
                <TableCell className="text-sm tabular-nums">
                  {customer.entry_date}
                </TableCell>
                
                {/* 고객명 - clickable */}
                <TableCell>
                  <button
                    onClick={() => onCustomerClick?.(customer)}
                    className="font-medium text-primary hover:underline cursor-pointer"
                    data-testid={`text-customer-name-${customer.id}`}
                  >
                    {customer.name}
                  </button>
                </TableCell>
                
                {/* 신용점수 - 800+ yellow pulse, 700- red */}
                <TableCell className="text-center">
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
                <TableCell className="text-muted-foreground truncate max-w-[130px]">
                  {customer.company_name}
                </TableCell>
                
                {/* 7년 초과 */}
                <TableCell className="text-center">
                  {customer.over_7_years ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                      <Check className="w-3 h-3" />
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20">
                      <X className="w-3 h-3" />
                    </Badge>
                  )}
                </TableCell>
                
                {/* 3년 평균 매출 */}
                <TableCell className="text-right tabular-nums">
                  {customer.avg_revenue_3y ? `${customer.avg_revenue_3y.toFixed(1)}억` : '-'}
                </TableCell>
                
                {/* 최근 매출(작년) */}
                <TableCell className="text-right tabular-nums">
                  {customer.recent_sales ? `${customer.recent_sales.toFixed(1)}억` : '-'}
                </TableCell>
                
                {/* 업종 */}
                <TableCell className="text-muted-foreground text-sm">
                  {customer.industry || '-'}
                </TableCell>
                
                {/* 진행기관 - Dropdown */}
                <TableCell>
                  <Select
                    value={customer.processing_org || '기타'}
                    onValueChange={(value) => handleProcessingOrgChange(customer.id, value)}
                  >
                    <SelectTrigger 
                      className="h-8 text-xs w-[90px]"
                      data-testid={`select-org-${customer.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROCESSING_ORGS.map(org => (
                        <SelectItem key={org} value={org}>
                          {org}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                
                {/* 최근 메모 - truncate with tooltip, double-click to open modal */}
                <TableCell
                  onDoubleClick={() => handleMemoDoubleClick(customer)}
                  className="cursor-pointer"
                  data-testid={`cell-memo-${customer.id}`}
                >
                  {customer.latest_memo ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm text-muted-foreground truncate block max-w-[140px]">
                          {customer.latest_memo}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-sm">{customer.latest_memo}</p>
                        <p className="text-xs text-muted-foreground mt-1">더블클릭하여 메모 추가</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                
                {/* 담당자 - narrow width */}
                <TableCell className="text-muted-foreground text-sm w-20">
                  {customer.manager_name || '-'}
                </TableCell>
                
                {/* Actions */}
                <TableCell>
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
                      <DropdownMenuSeparator />
                      
                      {/* Status change submenu - opens to left */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTriggerLeft>
                          상태 변경
                        </DropdownMenuSubTriggerLeft>
                        <DropdownMenuSubContentLeft className="w-48">
                          {MENU_STAGES.map(stage => (
                            <DropdownMenuSub key={stage.id}>
                              <DropdownMenuSubTriggerLeft>
                                {stage.label}
                              </DropdownMenuSubTriggerLeft>
                              <DropdownMenuSubContentLeft className="w-52">
                                {MENU_SUB_STATUSES[stage.id]?.map(sub => {
                                  const isTrash = sub.id === '1-1';
                                  if (isTrash) {
                                    return (
                                      <DropdownMenuSub key={sub.id}>
                                        <DropdownMenuSubTriggerLeft className="text-destructive">
                                          {sub.label}
                                        </DropdownMenuSubTriggerLeft>
                                        <DropdownMenuSubContentLeft className="w-44">
                                          {TRASH_REASONS.map(reason => (
                                            <DropdownMenuItem
                                              key={reason.id}
                                              onClick={() => onStatusChange(customer.id, customer.status_code, reason.id as any)}
                                              disabled={customer.status_code === reason.id}
                                              className="text-destructive"
                                            >
                                              {reason.label}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuSubContentLeft>
                                      </DropdownMenuSub>
                                    );
                                  }
                                  return (
                                    <DropdownMenuItem
                                      key={sub.id}
                                      onClick={() => onStatusChange(customer.id, customer.status_code, sub.id as any)}
                                      disabled={customer.status_code === sub.id}
                                    >
                                      {sub.label}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuSubContentLeft>
                            </DropdownMenuSub>
                          ))}
                        </DropdownMenuSubContentLeft>
                      </DropdownMenuSub>

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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Memo Modal */}
      <MemoModal
        open={memoModalOpen}
        onOpenChange={setMemoModalOpen}
        customerName={selectedCustomerForMemo?.name || ''}
        memoHistory={selectedCustomerForMemo?.memo_history || []}
        onAddMemo={handleAddMemo}
      />
    </div>
  );
}
