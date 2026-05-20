import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/firebase';
import { Hand, Unlock, Phone, Clock, FileText, CreditCard, AlertCircle, RefreshCw, History, Search, X, BarChart3, Trophy, Users, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

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

  // 영구 제외 (super_admin 전용) — 확인 다이얼로그 후 실행
  const [excludeTarget, setExcludeTarget] = useState<PoolItem | null>(null);
  const handleExclude = async (item: PoolItem) => {
    setBusy(item.customer_id, true);
    try {
      const res = await authFetch(`/api/redistribution-pool/exclude/${item.customer_id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '제외 실패');
      toast({
        title: '풀에서 영구 제외 완료',
        description: `${item.customer_name || item.company_name} — 더 이상 풀에 노출되지 않습니다.`,
      });
      await fetchPool();
      onPoolChanged?.();
    } catch (err: any) {
      toast({ title: '제외 실패', description: err?.message || '', variant: 'destructive' });
    } finally {
      setBusy(item.customer_id, false);
      setExcludeTarget(null);
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
  const [tab, setTab] = useState<'all' | 'mine' | 'stats'>('all');
  const [search, setSearch] = useState('');

  // 관리자 통계 (super_admin 전용)
  interface StatsData {
    period_days: number;
    totals: { active_assignments: number; pickups: number; confirms: number; releases: number };
    active_assignments: Array<{
      customer_id: string; customer_name: string; company_name: string; readable_id: string;
      picker_uid: string; picker_name: string; picked_at: string; expires_at: string;
      days_left: number; original_manager_name: string; current_status: string;
    }>;
    pickups_by_user: Array<{ uid: string; name: string; count: number }>;
    confirms_by_user: Array<{ uid: string; name: string; count: number }>;
    recent_confirms: Array<{
      customer_id: string; customer_name: string; original_manager_name: string;
      new_manager_name: string; source: string; confirmed_at: string;
    }>;
  }
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsDays, setStatsDays] = useState(30);

  const fetchStats = useCallback(async (days: number) => {
    setStatsLoading(true);
    try {
      const res = await authFetch(`/api/redistribution-pool/stats?days=${days}`);
      if (!res.ok) throw new Error('통계 조회 실패');
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      toast({ title: '오류', description: err?.message || '통계를 불러오지 못했습니다.', variant: 'destructive' });
    } finally {
      setStatsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open && tab === 'stats' && isSuperAdmin) {
      fetchStats(statsDays);
    }
  }, [open, tab, statsDays, isSuperAdmin, fetchStats]);

  // 본인이 픽업한 임시배정 건 (만료된 건 서버에서 이미 null 처리되어 옴)
  const myPickups = items.filter(it => it.temp_assignment && it.temp_assignment.picker_uid === myUid);
  // 표시 목록: 탭별 필터. 락된 건이 다른 직원 화면에서도 사라지지 않도록 '전체' 탭은 모두 보존.
  const baseItems = tab === 'mine' ? myPickups : items;
  // 검색 필터 (이름/상호명/전화번호) — 공백·하이픈 제거 후 부분일치
  const normalize = (s: string) => (s || '').toLowerCase().replace(/[\s-]/g, '');
  const q = normalize(search);
  const visibleItems = q
    ? baseItems.filter(it =>
        normalize(it.customer_name).includes(q) ||
        normalize(it.company_name).includes(q) ||
        normalize(it.phone).includes(q)
      )
    : baseItems;

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
          {isSuperAdmin && (
            <Button
              variant={tab === 'stats' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTab('stats')}
              data-testid="tab-pool-stats"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              관리자 통계
            </Button>
          )}
          <div className="ml-auto relative w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="이름·상호명·전화번호 검색"
              aria-label="재분배 풀 검색 (이름, 상호명, 전화번호)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 h-8 text-sm"
              data-testid="input-pool-search"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="button-pool-search-clear"
                aria-label="검색어 지우기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {tab === 'stats' && isSuperAdmin && (
            <div className="space-y-4" data-testid="pool-stats-panel">
              {/* 기간 선택 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">기간:</span>
                {[7, 30, 90].map(d => (
                  <Button
                    key={d}
                    size="sm"
                    variant={statsDays === d ? 'default' : 'outline'}
                    onClick={() => setStatsDays(d)}
                    data-testid={`button-stats-days-${d}`}
                  >
                    최근 {d}일
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fetchStats(statsDays)}
                  disabled={statsLoading}
                  className="ml-auto"
                  data-testid="button-stats-refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {statsLoading && !stats && (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              )}

              {stats && (
                <>
                  {/* 요약 카드 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/30" data-testid="stat-active-count">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Hand className="w-3.5 h-3.5" />활성 임시배정</div>
                      <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.totals.active_assignments}</div>
                    </div>
                    <div className="border rounded-lg p-3 bg-orange-50 dark:bg-orange-950/30" data-testid="stat-pickups-count">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" />픽업 건수</div>
                      <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.totals.pickups}</div>
                    </div>
                    <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/30" data-testid="stat-confirms-count">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />메이드(확정) 건수</div>
                      <div className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.totals.confirms}</div>
                    </div>
                    <div className="border rounded-lg p-3 bg-muted/40" data-testid="stat-releases-count">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Unlock className="w-3.5 h-3.5" />해제 건수</div>
                      <div className="text-2xl font-bold">{stats.totals.releases}</div>
                    </div>
                  </div>

                  {/* 활성 임시배정 */}
                  <section>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Hand className="w-4 h-4" /> 현재 활성 임시배정 ({stats.active_assignments.length})
                    </h3>
                    {stats.active_assignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">현재 활성 임시배정이 없습니다.</p>
                    ) : (
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-2 py-1.5">고객</th>
                              <th className="text-left px-2 py-1.5">픽업자</th>
                              <th className="text-left px-2 py-1.5">원담당</th>
                              <th className="text-left px-2 py-1.5">상태</th>
                              <th className="text-left px-2 py-1.5">픽업일</th>
                              <th className="text-left px-2 py-1.5">잔여</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.active_assignments.map(a => (
                              <tr key={a.customer_id} className="border-t hover-elevate" data-testid={`stats-active-${a.customer_id}`}>
                                <td className="px-2 py-1.5">
                                  <button
                                    className="hover:underline text-left"
                                    onClick={() => onOpenCustomer?.(a.customer_id)}
                                  >
                                    <span className="font-medium">{a.customer_name || '(이름 없음)'}</span>
                                    {a.company_name && <span className="text-xs text-muted-foreground ml-1">· {a.company_name}</span>}
                                  </button>
                                </td>
                                <td className="px-2 py-1.5 font-medium">{a.picker_name}</td>
                                <td className="px-2 py-1.5 text-muted-foreground">{a.original_manager_name || '-'}</td>
                                <td className="px-2 py-1.5"><Badge variant="outline" className="text-xs">{a.current_status}</Badge></td>
                                <td className="px-2 py-1.5 text-muted-foreground">{a.picked_at?.slice(0, 10) || '-'}</td>
                                <td className="px-2 py-1.5">
                                  <Badge variant={a.days_left <= 1 ? 'destructive' : 'secondary'} className="text-xs">D-{a.days_left}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* 직원별 픽업 통계 */}
                  <section>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Users className="w-4 h-4" /> 직원별 픽업 순위 (최근 {stats.period_days}일)
                    </h3>
                    {stats.pickups_by_user.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">기간 내 픽업 이력이 없습니다.</p>
                    ) : (
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-2 py-1.5 w-12">순위</th>
                              <th className="text-left px-2 py-1.5">직원</th>
                              <th className="text-right px-2 py-1.5">픽업 건수</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.pickups_by_user.map((u, idx) => (
                              <tr key={u.uid} className="border-t" data-testid={`stats-pickup-row-${u.uid}`}>
                                <td className="px-2 py-1.5">{idx + 1}</td>
                                <td className="px-2 py-1.5 font-medium">{u.name || u.uid}</td>
                                <td className="px-2 py-1.5 text-right font-semibold">{u.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* 직원별 메이드(확정) 통계 */}
                  <section>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Trophy className="w-4 h-4" /> 직원별 메이드(확정) 순위 (최근 {stats.period_days}일)
                    </h3>
                    {stats.confirms_by_user.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">기간 내 메이드 확정 이력이 없습니다.</p>
                    ) : (
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-2 py-1.5 w-12">순위</th>
                              <th className="text-left px-2 py-1.5">직원</th>
                              <th className="text-right px-2 py-1.5">메이드 건수</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.confirms_by_user.map((u, idx) => (
                              <tr key={u.uid} className="border-t" data-testid={`stats-confirm-row-${u.uid}`}>
                                <td className="px-2 py-1.5">
                                  {idx === 0 ? <Trophy className="w-4 h-4 text-yellow-500 inline" /> : idx + 1}
                                </td>
                                <td className="px-2 py-1.5 font-medium">{u.name || u.uid}</td>
                                <td className="px-2 py-1.5 text-right font-semibold text-green-700 dark:text-green-400">{u.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* 최근 메이드 내역 */}
                  {stats.recent_confirms.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <History className="w-4 h-4" /> 최근 메이드 내역
                      </h3>
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left px-2 py-1.5">고객</th>
                              <th className="text-left px-2 py-1.5">원담당 → 새 담당</th>
                              <th className="text-left px-2 py-1.5">트리거</th>
                              <th className="text-left px-2 py-1.5">확정일시</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.recent_confirms.map(c => (
                              <tr key={`${c.customer_id}-${c.confirmed_at}`} className="border-t hover-elevate">
                                <td className="px-2 py-1.5">
                                  <button
                                    className="hover:underline text-left font-medium"
                                    onClick={() => onOpenCustomer?.(c.customer_id)}
                                  >
                                    {c.customer_name || '(이름 없음)'}
                                  </button>
                                </td>
                                <td className="px-2 py-1.5 text-muted-foreground">
                                  {c.original_manager_name} → <span className="text-foreground font-medium">{c.new_manager_name}</span>
                                </td>
                                <td className="px-2 py-1.5 text-xs text-muted-foreground">{c.source}</td>
                                <td className="px-2 py-1.5 text-xs text-muted-foreground">{c.confirmed_at?.slice(0, 16).replace('T', ' ') || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {tab !== 'stats' && loading && items.length === 0 && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          )}

          {tab !== 'stats' && !loading && visibleItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-pool">
              <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              {q ? (
                <>
                  <p>'{search}' 검색 결과가 없습니다.</p>
                  <p className="text-sm mt-1">다른 검색어로 시도해보세요.</p>
                </>
              ) : tab === 'mine' ? (
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

          {tab !== 'stats' && visibleItems.map(item => {
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
                    {isSuperAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExcludeTarget(item)}
                        disabled={busy}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="이 고객을 재분배 풀에서 영구 제외 (super_admin)"
                        data-testid={`button-exclude-${item.customer_id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        영구 제외
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>

      {/* 영구 제외 확인 다이얼로그 (super_admin 전용) */}
      <AlertDialog open={!!excludeTarget} onOpenChange={(o) => { if (!o) setExcludeTarget(null); }}>
        <AlertDialogContent data-testid="dialog-exclude-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              재분배 풀에서 영구 제외
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <strong className="text-foreground">{excludeTarget?.customer_name || excludeTarget?.company_name || '(이름 없음)'}</strong>
                  {excludeTarget?.company_name && excludeTarget?.customer_name && (
                    <span className="text-muted-foreground"> · {excludeTarget?.company_name}</span>
                  )}
                  {' '}고객을 재분배 풀에서 <strong className="text-destructive">영구적으로 제외</strong>합니다.
                </p>
                <ul className="text-sm list-disc list-inside text-muted-foreground space-y-1">
                  <li>이 작업 후에는 이 고객이 풀 목록에 다시 나타나지 않습니다.</li>
                  <li>현재 임시배정이 있다면 함께 해제됩니다.</li>
                  <li>고객 자체는 삭제되지 않으며, 메모와 로그에 기록이 남습니다.</li>
                  <li>해제하려면 관리자가 별도 처리해야 합니다(되돌리기 UI 미제공).</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-exclude-cancel">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excludeTarget && handleExclude(excludeTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-exclude-confirm"
            >
              영구 제외하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
