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
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ChevronRight, Edit, Trash2, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/kpi';
import { STATUS_LABELS, FUNNEL_STAGES } from '@shared/types';
import type { Customer, StatusCode, UserRole } from '@shared/types';

interface CustomerTableProps {
  customers: Customer[];
  userRole: UserRole;
  onStatusChange: (customerId: string, currentStatus: StatusCode, newStatus: StatusCode) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customerId: string) => void;
  onViewHistory: (customerId: string) => void;
}

const getStatusColor = (statusCode: StatusCode): string => {
  const prefix = statusCode.charAt(0);
  switch (prefix) {
    case '0': return 'bg-destructive/10 text-destructive border-destructive/20';
    case '1': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
    case '2': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case '3': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
    case '4': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
    case '5': return 'bg-green-600/10 text-green-700 dark:text-green-400 border-green-600/20';
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

export function CustomerTable({
  customers,
  userRole,
  onStatusChange,
  onEdit,
  onDelete,
  onViewHistory,
}: CustomerTableProps) {
  const canDelete = userRole === 'super_admin';
  const canViewCommission = userRole === 'super_admin';

  if (customers.length === 0) {
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
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[100px] font-semibold">고유 ID</TableHead>
            <TableHead className="w-[120px] font-semibold">고객명</TableHead>
            <TableHead className="w-[160px] font-semibold">회사명</TableHead>
            <TableHead className="w-[100px] font-semibold">상태</TableHead>
            <TableHead className="w-[120px] font-semibold">담당자</TableHead>
            <TableHead className="w-[100px] font-semibold text-right">승인금액</TableHead>
            {canViewCommission && (
              <TableHead className="w-[80px] font-semibold text-right">수수료율</TableHead>
            )}
            <TableHead className="w-[100px] font-semibold">유입일</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow 
              key={customer.id} 
              className="group hover:bg-muted/30"
              data-testid={`row-customer-${customer.id}`}
            >
              <TableCell className="font-mono text-sm" data-testid={`text-customer-id-${customer.id}`}>
                {customer.readable_id}
              </TableCell>
              <TableCell className="font-medium" data-testid={`text-customer-name-${customer.id}`}>
                {customer.name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.company_name}
              </TableCell>
              <TableCell>
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", getStatusColor(customer.status_code))}
                  data-testid={`badge-status-${customer.id}`}
                >
                  {STATUS_LABELS[customer.status_code]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.manager_name || '-'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(customer.approved_amount)}
              </TableCell>
              {canViewCommission && (
                <TableCell className="text-right tabular-nums">
                  {customer.commission_rate}%
                </TableCell>
              )}
              <TableCell className="text-muted-foreground">
                {customer.entry_date}
              </TableCell>
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
  );
}
