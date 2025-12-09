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
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MoreHorizontal, ChevronRight, Edit, Trash2, History, Check, X, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABELS, FUNNEL_STAGES } from '@shared/types';
import type { Customer, StatusCode, UserRole } from '@shared/types';

interface CustomerTableProps {
  customers: Customer[];
  userRole: UserRole;
  selectedStage: string | null;
  onStatusChange: (customerId: string, currentStatus: StatusCode, newStatus: StatusCode) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customerId: string) => void;
  onViewHistory: (customerId: string) => void;
  onCustomerClick?: (customer: Customer) => void;
}

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
    industry: '제조업',
    processing_org: '중진공',
    latest_memo: '서류 준비 중, 다음 주 화요일 방문 예정',
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
    industry: '도소매',
    processing_org: '기보',
    latest_memo: '신용점수 미달로 상담 보류',
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
    industry: 'IT서비스',
    processing_org: '신보',
    latest_memo: '계약 완료, 집행 대기 중',
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
    industry: '물류/운송',
    processing_org: '중진공',
    latest_memo: '심사 진행 중, 추가 서류 요청됨',
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
    industry: '디자인',
    processing_org: '기보',
    latest_memo: '집행 완료. 수수료 정산 대기',
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
    industry: '건설',
    processing_org: '-',
    latest_memo: '통화 불가, 재연락 필요',
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
    industry: '요식업',
    processing_org: '신보',
    latest_memo: '서류 완료, 심사 접수 예정',
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
    credit_score: 690,
    over_7_years: true,
    avg_revenue_3y: 22.4,
    industry: '전자/통신',
    processing_org: '중진공',
    latest_memo: '상담 진행 중, 조건 검토 필요. 고객이 금리에 대해 문의함. 다음 미팅에서 상세 설명 예정.',
  },
];

const getStatusColor = (statusCode: StatusCode): string => {
  const prefix = statusCode.charAt(0);
  switch (prefix) {
    case '0': return 'bg-destructive/10 text-destructive border-destructive/20';
    case '1': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
    case '2': return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
    case '3': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
    case '4': return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20';
    case '5': return 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20';
    default: return '';
  }
};

const getSubStatuses = (stageCode: string): StatusCode[] => {
  switch (stageCode) {
    case '0': return ['0-1', '0-2', '0-3'];
    case '1': return ['1-1', '1-2', '1-3'];
    case '2': return ['2-1', '2-2', '2-3'];
    case '3': return ['3-1', '3-2', '3-3'];
    case '4': return ['4-1', '4-2', '4-3'];
    case '5': return ['5-1', '5-2'];
    default: return [];
  }
};

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
}: CustomerTableProps) {
  const canDelete = userRole === 'super_admin';
  
  // Use dummy data if no real customers
  const displayCustomers = customers.length > 0 ? customers : DUMMY_CUSTOMERS;

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
              <TableHead className="w-[100px] font-semibold">고객명</TableHead>
              <TableHead className="w-[80px] font-semibold text-center">신용점수</TableHead>
              <TableHead className="w-[140px] font-semibold">상호명</TableHead>
              <TableHead className="w-[70px] font-semibold text-center">7년초과</TableHead>
              <TableHead className="w-[100px] font-semibold text-right">3년평균매출</TableHead>
              <TableHead className="w-[100px] font-semibold">업종</TableHead>
              <TableHead className="w-[80px] font-semibold">진행기관</TableHead>
              <TableHead className="w-[180px] font-semibold">최근 메모</TableHead>
              <TableHead className="w-[80px] font-semibold">담당자</TableHead>
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
                
                {/* 신용점수 */}
                <TableCell className="text-center">
                  <span className={cn(
                    "font-semibold tabular-nums",
                    (customer.credit_score || 0) < 700 ? "text-red-500" : "text-foreground"
                  )}>
                    {customer.credit_score || '-'}
                  </span>
                </TableCell>
                
                {/* 상호명 */}
                <TableCell className="text-muted-foreground">
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
                  {customer.avg_revenue_3y ? `${customer.avg_revenue_3y.toFixed(1)}억원` : '-'}
                </TableCell>
                
                {/* 업종 */}
                <TableCell className="text-muted-foreground">
                  {customer.industry || '-'}
                </TableCell>
                
                {/* 진행기관 */}
                <TableCell className="text-muted-foreground">
                  {customer.processing_org || '-'}
                </TableCell>
                
                {/* 최근 메모 - truncate with tooltip */}
                <TableCell>
                  {customer.latest_memo ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm text-muted-foreground truncate block max-w-[160px] cursor-help">
                          {customer.latest_memo}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-sm">{customer.latest_memo}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                
                {/* 담당자 */}
                <TableCell className="text-muted-foreground">
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
                      
                      {/* Status change submenu */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ChevronRight className="w-4 h-4 mr-2" />
                          상태 변경
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-40">
                          {FUNNEL_STAGES.map(stage => (
                            <DropdownMenuSub key={stage.code}>
                              <DropdownMenuSubTrigger>{stage.label}</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {getSubStatuses(stage.code).map(status => (
                                  <DropdownMenuItem
                                    key={status}
                                    onClick={() => onStatusChange(customer.id, customer.status_code, status)}
                                    disabled={customer.status_code === status}
                                  >
                                    {STATUS_LABELS[status]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="text-destructive">
                              드롭아웃
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {getSubStatuses('0').map(status => (
                                <DropdownMenuItem
                                  key={status}
                                  onClick={() => onStatusChange(customer.id, customer.status_code, status)}
                                  disabled={customer.status_code === status}
                                  className="text-destructive"
                                >
                                  {STATUS_LABELS[status]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuSubContent>
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
    </div>
  );
}
