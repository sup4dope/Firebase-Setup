import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/firebase';
import { Hand, Unlock, Phone, Clock, FileText, CreditCard, AlertCircle, RefreshCw, History } from 'lucide-react';

interface PoolItem {
  customer_id: string;
  customer_name: string;
  company_name: string;
  readable_id: string;
  phone: string;
  current_status: string;
  original_manager_id: string;
  original_manager_name: string;
  team_id: string;
  team_name: string;
  trigger: {
    type: 'contract' | 'paymint' | 'legacy';
    sent_at: string;
    days_since: number;
    template_name: string | null;
    amount_man_won: number | null;
  };
  temp_assignment: null | {
    picker_uid: string;
    picker_name: string;
    picked_at: string;
    expires_at: string;
    original_manager_id: string;
    original_manager_name: string;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCustomer?: (customerId: string) => void;
  onPoolChanged?: () => void;
}

function daysLeft(expiresAtIso: string): number {
  const ms = Date.parse(expiresAtIso) - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function RedistributionPoolModal({ open, onOpenChange, onOpenCustomer, onPoolChanged }: Props) {
  const { user, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PoolItem[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const fetchPool = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/redistribution-pool');
      if (!res.ok) throw new Error('풀 조회 실패');
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err: any) {
      toast({ title: '오류', description: err?.message || '재분배 풀을 불러오지 못했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) fetchPool();
  }, [open, fetchPool]);

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handlePickup = async (item: PoolItem) => {
    if (!user) return;
    setBusy(item.customer_id, true);
    try {
      const res = await authFetch(`/api/redistribution-pool/pickup/${item.customer_id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '픽업 실패');
      toast({ title: '임시배정 완료', description: `${item.customer_name || item.company_name} 픽업됨 (3일 내 마무리)` });
      await fetchPool();
      onPoolChanged?.();
    } catch (err: any) {
      toast({ title: '픽업 실패', description: err?.message || '', variant: 'destructive' });
    } finally {
      setBusy(item.customer_id, false);
    }
  };

  const handleRelease = async (item: PoolItem) => {
    setBusy(item.customer_id, true);
    try {
      const res = await authFetch(`/api/redistribution-pool/release/${item.customer_id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '해제 실패');
      toast({ title: '임시배정 취소', description: `${item.customer_name || item.company_name} 취소됨` });
      await fetchPool();
      onPoolChanged?.();
    } catch (err: any) {
      toast({ title: '해제 실패', description: err?.message || '', variant: 'destructive' });
    } finally {
      setBusy(item.customer_id, false);
    }
  };

  const myUid = user?.uid || '';
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  // 본인이 픽업한 임시배정 건 (만료된 건 서버에서 이미 null 처리되어 옴)
  const myPickups = items.filter(it => it.temp_assignment && it.temp_assignment.picker_uid === myUid);
  // 표시 목록: 탭별 필터. 락된 건이 다른 직원 화면에서도 사라지지 않도록 '전체' 탭은 모두 보존.
  const visibleItems = tab === 'mine' ? myPickups : items;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="modal-redistribution-pool">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hand className="w-5 h-5" />
            재분배 풀 (공동영업 풀)
            <Badge variant="secondary" className="ml-2" data-testid="badge-pool-count">{items.length}건</Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchPool}
              disabled={loading}
              className="ml-auto"
              data-testid="button-pool-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </DialogTitle>
          <DialogDescription>
            계약서 발송 또는 청구서 발송 후 14일 경과한 미수납 건입니다. 픽업 시 3일간 임시 배정되며,
            수납완료(계약완료) 시점에 담당이 자동으로 본인으로 확정됩니다.
          </DialogDescription>
        </DialogHeader>

        {/* 탭: 전체 / 내 임시배정 */}
        <div className="flex items-center gap-2 border-b pb-2">
          <Button
            variant={tab === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('all')}
            data-testid="tab-pool-all"
          >
            전체 <Badge variant="secondary" className="ml-1.5">{items.length}</Badge>
          </Button>
          <Button
            variant={tab === 'mine' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('mine')}
            data-testid="tab-pool-mine"
          >
            내 임시배정 <Badge variant="secondary" className="ml-1.5">{myPickups.length}</Badge>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {loading && items.length === 0 && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          )}

          {!loading && visibleItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-pool">
              <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              {tab === 'mine' ? (
                <>
                  <p>본인이 픽업한 임시배정 건이 없습니다.</p>
                  <p className="text-sm mt-1">'전체' 탭에서 픽업하면 여기에 표시됩니다.</p>
                </>
              ) : (
                <>
                  <p>현재 재분배 풀에 표시할 건이 없습니다.</p>
                  <p className="text-sm mt-1">계약서/청구서 발송 후 14일이 지난 미수납 건이 자동으로 표시됩니다.</p>
                </>
              )}
            </div>
          )}

          {visibleItems.map(item => {
            const ta = item.temp_assignment;
            const isMine = ta && ta.picker_uid === myUid;
            const lockedByOther = ta && !isMine;
            const busy = busyIds.has(item.customer_id);
            const trigLabel =
              item.trigger.type === 'contract' ? '계약서 발송'
              : item.trigger.type === 'paymint' ? '청구서 발송'
              : '계약서발송완료 진입 (소급)';
            const TrigIcon =
              item.trigger.type === 'contract' ? FileText
              : item.trigger.type === 'paymint' ? CreditCard
              : History;

            return (
              <div
                key={item.customer_id}
                className={`border rounded-lg p-3 transition ${lockedByOther ? 'bg-muted/40 border-orange-200 dark:border-orange-900/40' : 'bg-card hover-elevate'}`}
                data-testid={`pool-item-${item.customer_id}`}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="font-semibold text-base hover:underline text-left"
                        onClick={() => { onOpenCustomer?.(item.customer_id); }}
                        data-testid={`button-open-customer-${item.customer_id}`}
                      >
                        {item.customer_name || '(이름 없음)'}
                      </button>
                      {item.company_name && (
                        <span className="text-sm text-muted-foreground">· {item.company_name}</span>
                      )}
                      <Badge variant="outline" className="text-xs">{item.current_status}</Badge>
                      {item.readable_id && (
                        <span className="text-xs text-muted-foreground">#{item.readable_id}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground flex-wrap">
                      {item.phone && (
                        <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{item.phone}</span>
                      )}
                      <span>원담당: <span className="font-medium text-foreground">{item.original_manager_name || '(미지정)'}</span></span>
                      {item.team_name && <span>· {item.team_name}</span>}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-sm flex-wrap">
                      <span className="flex items-center gap-1 text-foreground">
                        <TrigIcon className="w-3.5 h-3.5" />
                        {trigLabel}
                      </span>
                      <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        D+{item.trigger.days_since}일 경과
                      </span>
                      {item.trigger.amount_man_won && (
                        <span className="text-muted-foreground">금액: {item.trigger.amount_man_won.toLocaleString()}만원</span>
                      )}
                    </div>

                    {ta && (
                      <div className={`mt-2 text-sm px-2 py-1 rounded ${isMine ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300' : 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300'}`} data-testid={`temp-assignment-${item.customer_id}`}>
                        임시배정 중: <strong>{ta.picker_name}</strong> (D-{daysLeft(ta.expires_at)})
                        {isMine && <span className="ml-1 text-xs">(나)</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!ta && (
                      <Button
                        size="sm"
                        onClick={() => handlePickup(item)}
                        disabled={busy}
                        data-testid={`button-pickup-${item.customer_id}`}
                      >
                        <Hand className="w-4 h-4 mr-1" />
                        픽업
                      </Button>
                    )}
                    {isMine && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRelease(item)}
                        disabled={busy}
                        data-testid={`button-release-${item.customer_id}`}
                      >
                        <Unlock className="w-4 h-4 mr-1" />
                        임시배정 취소
                      </Button>
                    )}
                    {lockedByOther && isSuperAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRelease(item)}
                        disabled={busy}
                        data-testid={`button-admin-release-${item.customer_id}`}
                      >
                        <Unlock className="w-4 h-4 mr-1" />
                        관리자 강제 취소
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
