import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABELS } from '@shared/types';
import type { StatusLog, StatusCode } from '@shared/types';

interface StatusHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: StatusLog[];
  customerName?: string;
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

export function StatusHistoryDialog({
  open,
  onOpenChange,
  logs,
  customerName,
}: StatusHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {customerName ? `${customerName} 상태 변경 이력` : '상태 변경 이력'}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                변경 이력이 없습니다
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                
                {logs.map((log, index) => {
                  const changedAt = log.changed_at instanceof Date 
                    ? log.changed_at 
                    : new Date(log.changed_at);
                  
                  return (
                    <div 
                      key={log.id} 
                      className="relative pl-10 pb-6 last:pb-0"
                      data-testid={`log-item-${log.id}`}
                    >
                      {/* Timeline dot */}
                      <div className="absolute left-2 top-1 w-4 h-4 rounded-full bg-background border-2 border-primary z-10" />
                      
                      <div className="bg-card border rounded-lg p-4 space-y-3">
                        {/* Status change badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", getStatusColor(log.previous_status))}
                          >
                            {STATUS_LABELS[log.previous_status]}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", getStatusColor(log.new_status))}
                          >
                            {STATUS_LABELS[log.new_status]}
                          </Badge>
                        </div>
                        
                        {/* User and time info */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarFallback className="text-[10px]">
                                {(log.changed_by_user_name || '?').slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-muted-foreground">
                              {log.changed_by_user_name || '알 수 없음'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="hidden sm:inline">
                              {format(changedAt, 'yyyy-MM-dd HH:mm', { locale: ko })}
                            </span>
                            <span className="sm:hidden">
                              {formatDistanceToNow(changedAt, { locale: ko, addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
