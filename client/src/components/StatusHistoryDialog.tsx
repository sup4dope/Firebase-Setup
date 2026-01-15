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
import { getStatusStyle, FUNNEL_GROUPS } from '@/lib/constants';
import type { StatusLog, StatusCode } from '@shared/types';

interface StatusHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: StatusLog[];
  customerName?: string;
}

// 한글 상태명 기반 색상 가져오기
const getStatusColor = (statusCode: StatusCode): string => {
  const style = getStatusStyle(statusCode);
  return `${style.bg} ${style.text} ${style.border || ''}`;
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
                        {/* Status change badges - 한글 상태명 그대로 표시 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", getStatusColor(log.previous_status))}
                          >
                            {log.previous_status}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", getStatusColor(log.new_status))}
                          >
                            {log.new_status}
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
