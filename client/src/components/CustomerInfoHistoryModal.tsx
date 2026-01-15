import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, TrendingUp, Banknote, Wallet, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Customer } from '@shared/types';
import { getCustomerInfoLogs, type CustomerInfoLog } from '@/lib/firestore';

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

export function CustomerInfoHistoryModal({
  open,
  onClose,
  customer,
}: CustomerInfoHistoryModalProps) {
  const [logs, setLogs] = useState<CustomerInfoLog[]>([]);
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
      const fetchedLogs = await getCustomerInfoLogs(customer.id);
      setLogs(fetchedLogs);
    } catch (error) {
      console.error('Failed to load info logs:', error);
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
                const fieldInfo = FIELD_LABELS[log.field_name] || { 
                  label: log.field_name, 
                  icon: History, 
                  unit: '' 
                };
                const IconComponent = fieldInfo.icon;
                
                return (
                  <div 
                    key={log.id} 
                    className="p-3 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IconComponent className="w-4 h-4 text-muted-foreground" />
                        <Badge variant="outline" className="text-xs">
                          {fieldInfo.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(log.changed_at.toDate(), 'yyyy.MM.dd HH:mm', { locale: ko })}
                      </span>
                    </div>
                    
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground line-through">
                        {log.old_value || '-'}{fieldInfo.unit}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-foreground font-medium">
                        {log.new_value || '-'}{fieldInfo.unit}
                      </span>
                    </div>
                    
                    <div className="mt-1 text-xs text-muted-foreground">
                      변경자: {log.changed_by_name || '알 수 없음'}
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
