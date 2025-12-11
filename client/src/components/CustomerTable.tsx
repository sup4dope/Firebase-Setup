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
import { MemoModal } from './MemoModal';
import { MoreHorizontal, Edit, Trash2, History, Check, X, FolderOpen, AlertTriangle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Customer, UserRole, StatusCode, CustomerMemo } from '@shared/types';
import { STATUS_LABELS } from '@shared/types';

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

// Build flat list of all status options for native select - SHORT NAMES ONLY
const buildStatusOptions = (): { value: string; label: string; category: string }[] => {
  const options: { value: string; label: string; category: string }[] = [];
  
  MENU_STAGES.forEach(stage => {
    const subs = MENU_SUB_STATUSES[stage.id] || [];
    
    subs.forEach(sub => {
      if (sub.id === '1-1') {
        // 쓰레기통 has nested reasons - add only the leaf nodes
        TRASH_REASONS.forEach(reason => {
          options.push({ value: reason.id, label: reason.label, category: stage.label });
        });
      } else {
        // Regular sub-status - show only the short label
        options.push({ value: sub.id, label: sub.label, category: stage.label });
      }
    });
  });
  
  return options;
};

const STATUS_OPTIONS = buildStatusOptions();

// Get display label for a status code
const getStatusDisplayLabel = (statusCode: string): string => {
  // Check trash reasons first
  const trashReason = TRASH_REASONS.find(r => r.id === statusCode);
  if (trashReason) return trashReason.label;
  
  // Check sub-statuses
  for (const stageId of Object.keys(MENU_SUB_STATUSES)) {
    const sub = MENU_SUB_STATUSES[stageId]?.find(s => s.id === statusCode);
    if (sub) return sub.label;
  }
  
  return statusCode;
};

// Color mapping for status badges based on top-level category
const STAGE_COLORS: Record<string, string> = {
  '1': 'bg-purple-600 text-white',      // 상담대기
  'target': 'bg-yellow-600 text-white', // 희망타겟
  '2': 'bg-green-600 text-white',       // 계약완료
  '3': 'bg-blue-600 text-white',        // 서류취합
  '4': 'bg-orange-600 text-white',      // 신청완료
  '5': 'bg-teal-600 text-white',        // 집행완료
};

// Get status badge info: short label + color class
const getStatusBadgeInfo = (statusCode: string): { label: string; colorClass: string; category: string } => {
  // Determine the top-level category from status code
  let category = '';
  let label = statusCode;
  
  // Check trash reasons (1-1-X format)
  if (statusCode.startsWith('1-1-')) {
    const reason = TRASH_REASONS.find(r => r.id === statusCode);
    if (reason) {
      label = reason.label;
      category = '1'; // 상담대기
    }
  }
  // Check sub-statuses
  else {
    for (const [stageId, subs] of Object.entries(MENU_SUB_STATUSES)) {
      const sub = subs.find(s => s.id === statusCode);
      if (sub) {
        label = sub.label;
        category = stageId;
        break;
      }
    }
  }
  
  // Special cases for absence statuses
  if (statusCode === '0-1' || statusCode === '0-2') {
    const sub = MENU_SUB_STATUSES['1']?.find(s => s.id === statusCode);
    if (sub) {
      label = sub.label;
      category = '1'; // 상담대기
    }
  }
  
  // 1-1 (쓰레기통) without specific reason
  if (statusCode === '1-1') {
    label = '쓰레기통';
    category = '1';
  }
  
  const colorClass = STAGE_COLORS[category] || 'bg-gray-600 text-white';
  const categoryName = MENU_STAGES.find(s => s.id === category)?.label || '기타';
  
  return { label, colorClass, category: categoryName };
};

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

const PROCESSING_ORGS = ['미등록', '신용취약', '재도전', '혁신', '일시적', '상생', '지역재단', '미소금융', '신보', '기보', '중진공', '농신보', '기업인증', '기타'];

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

  const handleMemoDoubleClick = (customer: Customer) => {
    setSelectedCustomerForMemo(customer);
    setMemoModalOpen(true);
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

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-gray-500" />
        </div>
        <p className="text-lg font-medium text-gray-200">데이터가 없습니다</p>
        <p className="text-sm text-gray-500 mt-1">
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
              <TableHead className="w-28 font-semibold whitespace-nowrap text-center">유입일자</TableHead>
              <TableHead className="w-[50px] font-semibold text-center whitespace-nowrap">No</TableHead>
              <TableHead className="w-[90px] font-semibold whitespace-nowrap">고객명</TableHead>
              <TableHead className="w-[150px] font-semibold whitespace-nowrap">상태</TableHead>
              <TableHead className="w-[70px] font-semibold text-center whitespace-nowrap">신용점수</TableHead>
              <TableHead className="w-[130px] font-semibold whitespace-nowrap">상호명</TableHead>
              <TableHead className="w-[60px] font-semibold text-center whitespace-nowrap">7년초과</TableHead>
              <TableHead className="w-[90px] font-semibold text-right whitespace-nowrap">3년평균</TableHead>
              <TableHead className="w-[90px] font-semibold text-right whitespace-nowrap">최근매출</TableHead>
              <TableHead className="w-[90px] font-semibold whitespace-nowrap">업종</TableHead>
              <TableHead className="w-[100px] font-semibold whitespace-nowrap">진행기관</TableHead>
              <TableHead className="w-[160px] font-semibold whitespace-nowrap">최근 메모</TableHead>
              <TableHead className="w-20 font-semibold whitespace-nowrap">담당자</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer, index) => (
              <TableRow 
                key={customer.id} 
                className="group hover:bg-muted/30"
                data-testid={`row-customer-${customer.id}`}
              >
                {/* 유입일자 */}
                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                  {customer.entry_date}
                </TableCell>
                
                {/* No - daily_sequence (일별 순번) */}
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {customer.daily_sequence || '-'}
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
                
                {/* 상태 - Custom dark dropdown with grouped options */}
                <TableCell>
                  {(() => {
                    const badgeInfo = getStatusBadgeInfo(customer.status_code || '');
                    return (
                      <Select
                        value={customer.status_code || ''}
                        onValueChange={(newStatus) => {
                          if (newStatus && newStatus !== customer.status_code) {
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
                          className="bg-gray-900 border-gray-700 shadow-xl max-h-[300px] overflow-y-auto status-dropdown-content"
                          position="popper"
                          sideOffset={5}
                        >
                          {/* 상담대기 그룹 */}
                          <SelectGroup>
                            <SelectLabel className="text-gray-500 text-xs font-normal px-2 py-1">상담대기</SelectLabel>
                            {MENU_SUB_STATUSES['1']?.filter(s => s.id !== '1-1').map(sub => (
                              <SelectItem 
                                key={sub.id} 
                                value={sub.id}
                                className="text-gray-300 focus:bg-blue-600 focus:text-white cursor-pointer pl-4"
                              >
                                {sub.label}
                              </SelectItem>
                            ))}
                            {/* 쓰레기통 하위 사유들 */}
                            {TRASH_REASONS.map(reason => (
                              <SelectItem 
                                key={reason.id} 
                                value={reason.id}
                                className="text-gray-300 focus:bg-blue-600 focus:text-white cursor-pointer pl-6 text-xs"
                              >
                                {reason.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>

                          {/* 희망타겟 그룹 */}
                          <SelectGroup>
                            <SelectLabel className="text-gray-500 text-xs font-normal px-2 py-1 mt-1">희망타겟</SelectLabel>
                            {MENU_SUB_STATUSES['target']?.map(sub => (
                              <SelectItem 
                                key={sub.id} 
                                value={sub.id}
                                className="text-gray-300 focus:bg-blue-600 focus:text-white cursor-pointer pl-4"
                              >
                                {sub.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>

                          {/* 계약완료 그룹 */}
                          <SelectGroup>
                            <SelectLabel className="text-gray-500 text-xs font-normal px-2 py-1 mt-1">계약완료</SelectLabel>
                            {MENU_SUB_STATUSES['2']?.map(sub => (
                              <SelectItem 
                                key={sub.id} 
                                value={sub.id}
                                className="text-gray-300 focus:bg-blue-600 focus:text-white cursor-pointer pl-4"
                              >
                                {sub.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>

                          {/* 서류취합 그룹 */}
                          <SelectGroup>
                            <SelectLabel className="text-gray-500 text-xs font-normal px-2 py-1 mt-1">서류취합</SelectLabel>
                            {MENU_SUB_STATUSES['3']?.map(sub => (
                              <SelectItem 
                                key={sub.id} 
                                value={sub.id}
                                className="text-gray-300 focus:bg-blue-600 focus:text-white cursor-pointer pl-4"
                              >
                                {sub.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>

                          {/* 신청완료 그룹 */}
                          <SelectGroup>
                            <SelectLabel className="text-gray-500 text-xs font-normal px-2 py-1 mt-1">신청완료</SelectLabel>
                            {MENU_SUB_STATUSES['4']?.map(sub => (
                              <SelectItem 
                                key={sub.id} 
                                value={sub.id}
                                className="text-gray-300 focus:bg-blue-600 focus:text-white cursor-pointer pl-4"
                              >
                                {sub.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>

                          {/* 집행완료 그룹 */}
                          <SelectGroup>
                            <SelectLabel className="text-gray-500 text-xs font-normal px-2 py-1 mt-1">집행완료</SelectLabel>
                            {MENU_SUB_STATUSES['5']?.map(sub => (
                              <SelectItem 
                                key={sub.id} 
                                value={sub.id}
                                className="text-gray-300 focus:bg-blue-600 focus:text-white cursor-pointer pl-4"
                              >
                                {sub.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    );
                  })()}
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
                
                {/* 7년 초과 - 경고 표시 (부정적 조건) */}
                <TableCell className="text-center">
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
                    value={customer.processing_org || '미등록'}
                    onValueChange={(value) => handleProcessingOrgChange(customer.id, value)}
                  >
                    <SelectTrigger 
                      className="h-8 text-xs w-[90px]"
                      data-testid={`select-org-${customer.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
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
