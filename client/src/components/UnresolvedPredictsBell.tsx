import { useState, useEffect, useCallback } from 'react';
import { Brain, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useLocation } from 'wouter';

interface UnresolvedItem {
  log_id: string;
  customer_id: string;
  customer_name: string;
  called_at: string | null;
}

export function UnresolvedPredictsBell() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<UnresolvedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchUnresolved = useCallback(async () => {
    if (!user || !auth.currentUser) return;
    setLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/predict-logs/unresolved', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success) setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.warn('[UnresolvedPredictsBell] fetch 실패(무시):', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUnresolved();
    const interval = setInterval(fetchUnresolved, 120_000); // 2분 폴링
    return () => clearInterval(interval);
  }, [fetchUnresolved]);

  useEffect(() => {
    if (open) fetchUnresolved();
  }, [open, fetchUnresolved]);

  const handleOpenCustomer = (customerId: string) => {
    // 어느 페이지에서 클릭했든 Dashboard로 이동시킨 뒤 모달 오픈.
    // sessionStorage로 의도를 전달 → Dashboard mount 후 처리 + 이미 Dashboard에 있으면 즉시 CustomEvent로 처리.
    try {
      sessionStorage.setItem('pendingOpenCustomerId', customerId);
    } catch {/* ignore quota / private mode */}
    setOpen(false);
    setLocation('/');
    // Dashboard가 이미 mount되어 있는 경우(이벤트 즉시 발화)도 커버
    window.dispatchEvent(
      new CustomEvent('openCustomerById', { detail: { customerId } }),
    );
  };

  const count = items.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-testid="button-unresolved-predicts-bell"
            >
              <Brain className="h-4 w-4" />
              {count > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
                  data-testid="badge-unresolved-count"
                >
                  {count > 99 ? '99+' : count}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>ML 예측 미처리 ({count})</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            ML 예측 후 미처리 ({count})
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            예측을 호출했지만 신청/거절/집행 등 후속 기록이 없는 고객입니다.
            ML 학습 라벨이 누락되지 않도록 처리해주세요.
          </p>
        </div>
        <ScrollArea className="max-h-80">
          {loading && items.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground" data-testid="text-no-unresolved">
              미처리 예측이 없습니다 👍
            </div>
          ) : (
            <div className="divide-y">
              {items.map((it) => (
                <div
                  key={it.log_id}
                  className="p-3 hover:bg-accent/40 flex items-center justify-between gap-2"
                  data-testid={`row-unresolved-${it.log_id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" data-testid={`text-unresolved-name-${it.log_id}`}>
                      {it.customer_name}
                    </div>
                    {it.called_at && (
                      <div className="text-[11px] text-muted-foreground">
                        {(() => {
                          const d = new Date(it.called_at);
                          if (isNaN(d.getTime())) return it.called_at;
                          return `${formatDistanceToNow(d, { addSuffix: true, locale: ko })} 예측`;
                        })()}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenCustomer(it.customer_id)}
                    data-testid={`btn-goto-unresolved-${it.log_id}`}
                  >
                    처리하러가기
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
