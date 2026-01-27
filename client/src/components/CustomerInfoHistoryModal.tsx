import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, TrendingUp, Banknote, Wallet, Calendar, UserCheck, RefreshCw, Building2, FileText, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Customer, CustomerHistoryLog } from '@shared/types';
import { getCustomerInfoLogs, type CustomerInfoLog } from '@/lib/firestore';
import { getCustomerHistoryLogs } from '@/lib/firebase';

interface CustomerInfoHistoryModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
}

const FIELD_LABELS: Record<string, { label: string; icon: typeof TrendingUp; unit: string }> = {
  commission_rate: { label: '자문료율', icon: TrendingUp, unit: '%' },
  contract_amount: { label: '계약금', icon: Banknote, unit: '만원' },
  execution_amount: { label: '집행금액', icon: Wallet, unit: '만원' },
  contract_date: { label: '계약일', icon: Calendar, unit: '' },
  execution_date: { label: '집행일', icon: Calendar, unit: '' },
};

const ACTION_TYPE_LABELS: Record<string, { label: string; icon: typeof History }> = {
  status_change: { label: '상태 변경', icon: RefreshCw },
  manager_change: { label: '담당자 변경', icon: UserCheck },
  info_update: { label: '정보 수정', icon: FileText },
  document_upload: { label: '문서 업로드', icon: FileText },
  memo_added: { label: '메모 추가', icon: MessageSquare },
  org_change: { label: '기관 변경', icon: Building2 },
};

interface UnifiedLog {
  id: string;
  type: 'info' | 'history';
  label: string;
  icon: typeof History;
  unit: string;
  old_value: string;
  new_value: string;
  changed_by_name: string;
  changed_at: Date;
  description?: string;
}

export function CustomerInfoHistoryModal({
  open,
  onClose,
  customer,
}: CustomerInfoHistoryModalProps) {
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (customer && open) {
      loadLogs();
    }
  }, [customer, open]);

  const loadLogs = async () => {
    if (!customer) return;
    
    setIsLoading(true);
    try {
      const [infoLogs, historyLogs] = await Promise.all([
        getCustomerInfoLogs(customer.id),
        getCustomerHistoryLogs(customer.id),
      ]);
      
      const unifiedInfoLogs: UnifiedLog[] = infoLogs.map((log: CustomerInfoLog) => {
        const fieldInfo = FIELD_LABELS[log.field_name] || { 
          label: log.field_name, 
          icon: History, 
          unit: '' 
        };
        return {
          id: `info-${log.id}`,
          type: 'info' as const,
          label: fieldInfo.label,
          icon: fieldInfo.icon,
          unit: fieldInfo.unit,
          old_value: log.old_value || '-',
          new_value: log.new_value || '-',
          changed_by_name: log.changed_by_name || '알 수 없음',
          changed_at: log.changed_at.toDate(),
        };
      });
      
      const unifiedHistoryLogs: UnifiedLog[] = historyLogs.map((log: CustomerHistoryLog) => {
        const actionInfo = ACTION_TYPE_LABELS[log.action_type] || { 
          label: log.action_type, 
          icon: History 
        };
        return {
          id: `history-${log.id}`,
          type: 'history' as const,
          label: actionInfo.label,
          icon: actionInfo.icon,
          unit: '',
          old_value: log.old_value || '-',
          new_value: log.new_value || '-',
          changed_by_name: log.changed_by_name || '알 수 없음',
          changed_at: log.changed_at instanceof Date ? log.changed_at : new Date(log.changed_at),
          description: log.description,
        };
      });
      
      const allLogs = [...unifiedInfoLogs, ...unifiedHistoryLogs].sort(
        (a, b) => b.changed_at.getTime() - a.changed_at.getTime()
      );
      
      setLogs(allLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            변경 이력
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-sm text-muted-foreground mb-2">
          고객: <span className="font-medium text-foreground">{customer.company_name || customer.name}</span>
        </div>
        
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              변경 이력이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const IconComponent = log.icon;
                
                return (
                  <div 
                    key={log.id} 
                    className="p-3 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IconComponent className="w-4 h-4 text-muted-foreground" />
                        <Badge variant="outline" className="text-xs">
                          {log.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(log.changed_at, 'yyyy.MM.dd HH:mm', { locale: ko })}
                      </span>
                    </div>
                    
                    {log.description ? (
                      <div className="mt-2 text-sm text-foreground">
                        {log.description}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground line-through">
                          {log.old_value}{log.unit}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-foreground font-medium">
                          {log.new_value}{log.unit}
                        </span>
                      </div>
                    )}
                    
                    <div className="mt-1 text-xs text-muted-foreground">
                      변경자: {log.changed_by_name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
