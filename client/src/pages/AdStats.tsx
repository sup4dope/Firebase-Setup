import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { BarChart3, TrendingUp, AlertTriangle, Target, Trash2, FileCheck, Users, ChevronRight, Star, X, CalendarDays, Check, Filter } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { getCustomersScoped, normalizeEntrySource } from '@/lib/firestore';
import { useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import type { Customer, SettlementItem } from '@shared/types';
import type { EntrySourceType } from '@shared/types';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const ENTRY_SOURCES: EntrySourceType[] = ['캐시노트 인앱광고', '구글애즈(dm)', '구글애즈(QS)', '구글애즈(QSe)', '구글애즈(dm-e)', '구글애즈(dm-d)', '구글애즈(dp-e)', '광고', '외주', '고객소개', '승인복제'];

const TRASH_STATUSES = [
  '잘못 신청', '단박거절', '본인아님', '사업자아님', '정체성 의심',
  '정부기관 오인', '기타자금 오인', '인증불가', '불가업종', '매출없음',
  '신용점수 미달', '차입금초과', '세금체납', '이중계약', '거절사유 미파악'
];

const AD_INEFFICIENCY_STATUSES = [
  '잘못 신청', '단박거절', '본인아님', '사업자아님',
  '정부기관 오인', '기타자금 오인', '매출없음', '세금체납', '거절사유 미파악'
];

const TARGET_STATUSES = [
  '업력미달', '최근대출', '인증미동의(국세청)', '인증미동의(공여내역)',
  '진행기간 미동의', '자문료 미동의', '계약금미동의(선불)', '계약금미동의(후불)'
];

const CONTRACT_SENT_STATUSES = ['계약서발송완료(선불)', '계약서발송완료(후불)', '계약서발송완료(외주)'];
const CONTRACT_STATUSES = ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)'];
const DOCS_STATUSES = ['서류취합완료(선불)', '서류취합완료(외주)', '서류취합완료(후불)'];
const APPLY_STATUSES = ['신청완료(선불)', '신청완료(외주)', '신청완료(후불)'];
const EXEC_STATUSES = ['집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)', '집행완료(채무조정)'];
const ABSENCE_STATUSES = ['단기부재', '장기부재', '예약'];

const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const SOURCE_LINE_COLORS: Record<string, string> = {
  '캐시노트 인앱광고': '#3b82f6',
  '구글애즈(dm)': '#ef4444',
  '구글애즈(QS)': '#f97316',
  '구글애즈(QSe)': '#e11d48',
  '구글애즈(dm-e)': '#a855f7',
  '구글애즈(dm-d)': '#14b8a6',
  '구글애즈(dp-e)': '#0ea5e9',
  '광고': '#8b5cf6',
  '외주': '#06b6d4',
  '고객소개': '#10b981',
  '승인복제': '#eab308',
};

type DbGrade = 'S' | 'A' | 'B' | 'C' | 'D';

function gradeCustomer(c: Customer): DbGrade {
  let score = 0;

  const rev = c.recent_sales || c.avg_revenue_3y || 0;
  if (rev >= 3) score += 3;
  else if (rev >= 1) score += 2;
  else if (rev > 0) score += 1;

  const cs = c.credit_score || 0;
  if (cs >= 800) score += 3;
  else if (cs >= 600) score += 2;
  else if (cs > 0) score += 1;

  if (c.founding_date) {
    const years = (Date.now() - new Date(c.founding_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years >= 7) score += 2;
    else if (years >= 3) score += 1;
  }

  if (c.business_registration_number && c.business_registration_number.length >= 10) score += 1;

  if (score >= 8) return 'S';
  if (score >= 6) return 'A';
  if (score >= 4) return 'B';
  if (score >= 2) return 'C';
  return 'D';
}

const GRADE_COLORS: Record<DbGrade, string> = {
  S: 'bg-yellow-500 text-white',
  A: 'bg-green-500 text-white',
  B: 'bg-blue-500 text-white',
  C: 'bg-orange-500 text-white',
  D: 'bg-red-500 text-white',
};

const GRADE_DESCRIPTIONS: Record<DbGrade, string> = {
  S: '최우수 (매출·신용·업력 모두 우수)',
  A: '우수 (대부분 조건 충족)',
  B: '보통 (일부 조건 충족)',
  C: '미흡 (조건 부족)',
  D: '부적격 (대부분 조건 미달)',
};

export default function AdStats() {
  const { user, isSuperAdmin } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set(ENTRY_SOURCES));
  const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
  const [daysRange, setDaysRange] = useState<string>('30');
  const [dateRangeMode, setDateRangeMode] = useState<'preset' | 'custom'>('preset');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<{ open: boolean; source: string; customers: Customer[] }>({ open: false, source: '', customers: [] });

  useEffect(() => {
    if (!isSuperAdmin || !user) return;
    const load = async () => {
      try {
        const [data, settlementSnapshot] = await Promise.all([
          getCustomersScoped(user),
          getDocs(collection(db, 'settlements')),
        ]);
        setCustomers(data);
        const settlementDocs = settlementSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SettlementItem));
        setSettlements(settlementDocs);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isSuperAdmin, user?.uid, user?.role, user?.team_id]);

  const isAllSelected = selectedSources.size === ENTRY_SOURCES.length;
  const activeSourcesToFilter = useMemo(() => {
    if (selectedSources.size === 0) return ENTRY_SOURCES;
    return ENTRY_SOURCES.filter(s => selectedSources.has(s));
  }, [selectedSources]);

  const toggleSource = (source: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
        if (next.size === 0) return new Set(ENTRY_SOURCES);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  const toggleAllSources = () => {
    if (isAllSelected) {
      setSelectedSources(new Set());
    } else {
      setSelectedSources(new Set(ENTRY_SOURCES));
    }
  };

  const { chartStartDate, chartEndDate, chartDays } = useMemo(() => {
    const now = new Date();
    if (dateRangeMode === 'custom' && dateRange?.from) {
      const s = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
      const e = dateRange.to
        ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59)
        : new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59, 59);
      const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return { chartStartDate: s, chartEndDate: e, chartDays: Math.max(diff, 1) };
    }
    const days = parseInt(daysRange);
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
    return { chartStartDate: startDate, chartEndDate: now, chartDays: days };
  }, [dateRangeMode, dateRange, daysRange]);

  const dailySourceData = useMemo(() => {
    const sources = activeSourcesToFilter;
    const relevantCustomers = customers.filter(c => sources.includes(normalizeEntrySource(c.entry_source) as EntrySourceType));

    const dateMap: Record<string, Record<string, number>> = {};
    for (let i = 0; i < chartDays; i++) {
      const d = new Date(chartStartDate);
      d.setDate(d.getDate() + i);
      const key = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
      dateMap[key] = {};
      sources.forEach(s => { dateMap[key][s] = 0; });
      dateMap[key]['합계'] = 0;
    }

    relevantCustomers.forEach(c => {
      if (!c.entry_date) return;
      const d = new Date(c.entry_date + 'T00:00:00');
      if (isNaN(d.getTime()) || d < chartStartDate || d > chartEndDate) return;
      const key = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
      if (dateMap[key] && c.entry_source) {
        const normSrc = normalizeEntrySource(c.entry_source);
        if (dateMap[key][normSrc] !== undefined) {
          dateMap[key][normSrc]++;
        }
        dateMap[key]['합계']++;
      }
    });

    return Object.entries(dateMap).map(([date, counts]) => ({ date, ...counts }));
  }, [customers, activeSourcesToFilter, chartStartDate, chartEndDate, chartDays]);

  const dateFilteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (!c.entry_date) return false;
      const d = new Date(c.entry_date + 'T00:00:00');
      if (isNaN(d.getTime())) return false;
      return d >= chartStartDate && d <= chartEndDate;
    });
  }, [customers, chartStartDate, chartEndDate]);

  const activeSources = useMemo(() => {
    return activeSourcesToFilter.filter(s => dailySourceData.some(d => (d as any)[s] > 0));
  }, [dailySourceData, activeSourcesToFilter]);

  const dailySourceTotals = useMemo(() => {
    const sources = activeSourcesToFilter;
    const totals: Record<string, number> = {};
    const revenue: Record<string, number> = {};
    const depositRevenue: Record<string, number> = {};
    const advisoryRevenue: Record<string, number> = {};
    const contracts: Record<string, number> = {};
    const execs: Record<string, number> = {};
    sources.forEach(s => { totals[s] = 0; revenue[s] = 0; depositRevenue[s] = 0; advisoryRevenue[s] = 0; contracts[s] = 0; execs[s] = 0; });
    let grandTotal = 0;
    let grandRevenue = 0;
    let grandDepositRevenue = 0;
    let grandAdvisoryRevenue = 0;
    let grandContracts = 0;
    let grandExecs = 0;
    const CONTRACT_AND_BEYOND = [
      ...CONTRACT_STATUSES,
      ...DOCS_STATUSES,
      ...APPLY_STATUSES,
      ...EXEC_STATUSES,
      '민원처리',
    ];
    dailySourceData.forEach(d => {
      sources.forEach(s => {
        const val = (d as any)[s] || 0;
        totals[s] += val;
      });
      grandTotal += (d as any)['합계'] || 0;
    });
    const dateFilteredCustomerIds = new Set(dateFilteredCustomers.map(c => c.id));

    settlements.forEach(s => {
      if (!s.customer_id || !dateFilteredCustomerIds.has(s.customer_id)) return;
      const src = s.entry_source ? normalizeEntrySource(s.entry_source) : undefined;
      if (!src || revenue[src] === undefined) return;

      if (s.is_clawback) {
        const loss = Math.round(Math.abs(s.total_revenue || 0) * 10000);
        const depLoss = Math.round(Math.abs(s.contract_amount || 0) * 10000);
        const advLoss = loss - depLoss;
        revenue[src] -= loss;
        depositRevenue[src] -= depLoss;
        advisoryRevenue[src] -= advLoss;
        grandRevenue -= loss;
        grandDepositRevenue -= depLoss;
        grandAdvisoryRevenue -= advLoss;
      } else {
        const rev = Math.round((s.total_revenue || 0) * 10000);
        const dep = Math.round((s.contract_amount || 0) * 10000);
        const adv = rev - dep;
        revenue[src] += rev;
        depositRevenue[src] += dep;
        advisoryRevenue[src] += adv;
        grandRevenue += rev;
        grandDepositRevenue += dep;
        grandAdvisoryRevenue += adv;
      }
    });

    dateFilteredCustomers.forEach(c => {
      const src = c.entry_source ? normalizeEntrySource(c.entry_source) : undefined;
      const hasDeposit = !!(c as any).deposit_paid_date;
      const isContracted = hasDeposit || CONTRACT_AND_BEYOND.includes(c.status_code);
      if (src && contracts[src] !== undefined && isContracted) {
        contracts[src]++;
        grandContracts++;
      }
      if (src && execs[src] !== undefined && EXEC_STATUSES.includes(c.status_code)) {
        execs[src]++;
        grandExecs++;
      }
    });
    return { totals, grandTotal, sources, revenue, grandRevenue, depositRevenue, advisoryRevenue, grandDepositRevenue, grandAdvisoryRevenue, contracts, grandContracts, execs, grandExecs };
  }, [dailySourceData, activeSourcesToFilter, dateFilteredCustomers, settlements]);

  const sourceStats = useMemo(() => {
    const sources = activeSourcesToFilter;

    return sources.map(source => {
      const filtered = dateFilteredCustomers.filter(c => normalizeEntrySource(c.entry_source) === source);
      const total = filtered.length;
      if (total === 0) return { source, total: 0, consulting: 0, trash: 0, target: 0, contractSent: 0, contract: 0, docs: 0, apply: 0, exec: 0, absence: 0, finalReject: 0, trashDetails: {} as Record<string, number>, targetDetails: {} as Record<string, number>, grades: {} as Record<DbGrade, number>, adInefficiency: 0 };

      const consulting = filtered.filter(c => c.status_code === '상담대기').length;
      const trash = filtered.filter(c => TRASH_STATUSES.includes(c.status_code)).length;
      const target = filtered.filter(c => TARGET_STATUSES.includes(c.status_code)).length;
      const contractSent = filtered.filter(c => CONTRACT_SENT_STATUSES.includes(c.status_code)).length;
      const contract = filtered.filter(c => CONTRACT_STATUSES.includes(c.status_code)).length;
      const docs = filtered.filter(c => DOCS_STATUSES.includes(c.status_code)).length;
      const apply = filtered.filter(c => APPLY_STATUSES.includes(c.status_code)).length;
      const exec = filtered.filter(c => EXEC_STATUSES.includes(c.status_code)).length;
      const absence = filtered.filter(c => ABSENCE_STATUSES.includes(c.status_code)).length;
      const finalReject = filtered.filter(c => c.status_code === '최종부결').length;

      const adInefficiency = filtered.filter(c => AD_INEFFICIENCY_STATUSES.includes(c.status_code)).length;

      const trashDetails: Record<string, number> = {};
      TRASH_STATUSES.forEach(s => {
        const count = filtered.filter(c => c.status_code === s).length;
        if (count > 0) trashDetails[s] = count;
      });

      const targetDetails: Record<string, number> = {};
      TARGET_STATUSES.forEach(s => {
        const count = filtered.filter(c => c.status_code === s).length;
        if (count > 0) targetDetails[s] = count;
      });

      const grades: Record<DbGrade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
      filtered.forEach(c => {
        grades[gradeCustomer(c)]++;
      });

      return { source, total, consulting, trash, target, contractSent, contract, docs, apply, exec, absence, finalReject, trashDetails, targetDetails, grades, adInefficiency };
    }).filter(s => s.total > 0);
  }, [dateFilteredCustomers, activeSourcesToFilter]);

  const totalStats = useMemo(() => {
    const allFiltered = dateFilteredCustomers.filter(c => activeSourcesToFilter.includes(normalizeEntrySource(c.entry_source) as EntrySourceType));
    const total = allFiltered.length;
    if (total === 0) return null;

    const consulting = allFiltered.filter(c => c.status_code === '상담대기').length;
    const trash = allFiltered.filter(c => TRASH_STATUSES.includes(c.status_code)).length;
    const target = allFiltered.filter(c => TARGET_STATUSES.includes(c.status_code)).length;
    const contractAndBeyond = allFiltered.filter(c => {
      if ((c as any).deposit_paid_date) return true;
      return CONTRACT_STATUSES.includes(c.status_code) ||
        DOCS_STATUSES.includes(c.status_code) ||
        APPLY_STATUSES.includes(c.status_code) ||
        EXEC_STATUSES.includes(c.status_code) ||
        c.status_code === '민원처리';
    }).length;
    const exec = allFiltered.filter(c => EXEC_STATUSES.includes(c.status_code)).length;

    return { total, consulting, trash, target, contractAndBeyond, exec };
  }, [dateFilteredCustomers, activeSourcesToFilter]);

  const openDetailModal = (source: string) => {
    const filtered = dateFilteredCustomers.filter(c => normalizeEntrySource(c.entry_source) === source);
    setDetailModal({ open: true, source, customers: filtered });
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">접근 권한이 없습니다.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const pct = (n: number, d: number) => d > 0 ? ((n / d) * 100).toFixed(1) : '0.0';

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto" data-testid="ad-stats-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">광고통계</h1>
          <p className="text-sm text-muted-foreground mt-1">유입경로별 DB 분석 및 전환율 통계</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs px-3 gap-1.5"
                data-testid="button-date-picker"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {dateRangeMode === 'preset' ? (
                  <span>{daysRange === '1' ? '오늘' : `최근 ${daysRange}일`}</span>
                ) : dateRange?.from ? (
                  <span>
                    {format(dateRange.from, 'yy.MM.dd')}
                    {dateRange.to ? ` ~ ${format(dateRange.to, 'yy.MM.dd')}` : ''}
                  </span>
                ) : (
                  <span>기간 선택</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="flex border-b">
                <button
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${dateRangeMode === 'preset' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setDateRangeMode('preset')}
                  data-testid="button-preset-mode"
                >
                  접수일자
                </button>
                <button
                  className={`flex-1 px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${dateRangeMode === 'custom' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => {
                    setDateRangeMode('custom');
                    if (!dateRange?.from) {
                      const now = new Date();
                      setDateRange({
                        from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29),
                        to: now,
                      });
                    }
                  }}
                  data-testid="button-custom-mode"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  전체 기간
                </button>
              </div>
              {dateRangeMode === 'preset' ? (
                <div className="p-3 space-y-1">
                  {[
                    { value: '1', label: '오늘' },
                    { value: '7', label: '최근 7일' },
                    { value: '14', label: '최근 14일' },
                    { value: '30', label: '최근 30일' },
                    { value: '60', label: '최근 60일' },
                    { value: '90', label: '최근 90일' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${daysRange === opt.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                      onClick={() => {
                        setDaysRange(opt.value);
                        setCalendarOpen(false);
                      }}
                      data-testid={`button-days-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-2">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range);
                      if (range?.from && range?.to) {
                        setCalendarOpen(false);
                      }
                    }}
                    numberOfMonths={2}
                    locale={ko}
                    data-testid="calendar-range"
                  />
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Popover open={sourceFilterOpen} onOpenChange={setSourceFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs px-3 gap-1.5"
                data-testid="button-source-filter"
              >
                <Filter className="w-3.5 h-3.5" />
                {isAllSelected ? (
                  <span>전체 유입경로</span>
                ) : (
                  <span>유입경로 {selectedSources.size}개 선택</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2" align="end">
              <div className="space-y-1">
                <button
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors ${isAllSelected ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
                  onClick={toggleAllSources}
                  data-testid="button-source-all"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isAllSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                    {isAllSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  전체 선택
                </button>
                <Separator />
                {ENTRY_SOURCES.map(source => {
                  const isSelected = selectedSources.has(source);
                  return (
                    <button
                      key={source}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors ${isSelected ? 'font-medium' : 'text-muted-foreground'}`}
                      onClick={() => toggleSource(source)}
                      data-testid={`button-source-${source}`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className="truncate">{source}</span>
                      <div
                        className="w-2.5 h-2.5 rounded-full ml-auto flex-shrink-0"
                        style={{ backgroundColor: SOURCE_LINE_COLORS[source] || '#6b7280' }}
                      />
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {totalStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <div className="text-2xl font-bold" data-testid="text-total-count">{totalStats.total}</div>
              <div className="text-xs text-muted-foreground">총 유입</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="w-5 h-5 mx-auto mb-1 text-purple-500" />
              <div className="text-2xl font-bold">{totalStats.consulting}</div>
              <div className="text-xs text-muted-foreground">상담대기 ({pct(totalStats.consulting, totalStats.total)}%)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Trash2 className="w-5 h-5 mx-auto mb-1 text-red-500" />
              <div className="text-2xl font-bold">{totalStats.trash}</div>
              <div className="text-xs text-muted-foreground">쓰레기통 ({pct(totalStats.trash, totalStats.total)}%)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Target className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
              <div className="text-2xl font-bold">{totalStats.target}</div>
              <div className="text-xs text-muted-foreground">희망타겟 ({pct(totalStats.target, totalStats.total)}%)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <FileCheck className="w-5 h-5 mx-auto mb-1 text-green-500" />
              <div className="text-2xl font-bold">{totalStats.contractAndBeyond}</div>
              <div className="text-xs text-muted-foreground">계약+ ({pct(totalStats.contractAndBeyond, totalStats.total)}%)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
              <div className="text-2xl font-bold">{totalStats.exec}</div>
              <div className="text-xs text-muted-foreground">집행완료 ({pct(totalStats.exec, totalStats.total)}%)</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card data-testid="card-daily-inflow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-500" />
            일자별 유입건수 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailySourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={dailySourceData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  interval={chartDays <= 7 ? 0 : chartDays <= 14 ? 1 : chartDays <= 30 ? 2 : chartDays <= 60 ? 5 : 8}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  itemSorter={(item: any) => -(item.value || 0)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {activeSourcesToFilter.length > 1 && (
                  <Line
                    type="monotone"
                    dataKey="합계"
                    name="합계"
                    stroke="#374151"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                )}
                {activeSources.map(source => (
                  <Line
                    key={source}
                    type="monotone"
                    dataKey={source}
                    name={source}
                    stroke={SOURCE_LINE_COLORS[source] || '#6b7280'}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">데이터가 없습니다.</p>
          )}

          {dailySourceData.length > 0 && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1150px]" data-testid="table-daily-totals">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground">유입경로</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">접수</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">비율</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">계약률</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">집행률</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">계약금</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">건당 잠재계약금</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">자문료</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">건당 잠재자문료</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">총매출</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">건당 잠재가치</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySourceTotals.sources
                    .filter(s => dailySourceTotals.totals[s] > 0)
                    .sort((a, b) => dailySourceTotals.totals[b] - dailySourceTotals.totals[a])
                    .map(source => (
                      <tr key={source} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: SOURCE_LINE_COLORS[source as EntrySourceType] || '#6b7280' }} />
                            {source}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">{dailySourceTotals.totals[source]}건</td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {dailySourceTotals.grandTotal > 0 ? ((dailySourceTotals.totals[source] / dailySourceTotals.grandTotal) * 100).toFixed(1) : '0.0'}%
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {dailySourceTotals.totals[source] > 0
                            ? `${((dailySourceTotals.contracts[source] / dailySourceTotals.totals[source]) * 100).toFixed(1)}%`
                            : '0.0%'}
                          <span className="text-xs text-muted-foreground ml-1">({dailySourceTotals.contracts[source]}건)</span>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                          {dailySourceTotals.totals[source] > 0
                            ? `${((dailySourceTotals.execs[source] / dailySourceTotals.totals[source]) * 100).toFixed(1)}%`
                            : '0.0%'}
                          <span className="text-xs text-muted-foreground ml-1">({dailySourceTotals.execs[source]}건)</span>
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {dailySourceTotals.depositRevenue[source] > 0 ? `${dailySourceTotals.depositRevenue[source].toLocaleString()}원` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {dailySourceTotals.totals[source] > 0 && dailySourceTotals.depositRevenue[source] > 0
                            ? `${Math.round(dailySourceTotals.depositRevenue[source] / dailySourceTotals.totals[source]).toLocaleString()}원`
                            : '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {dailySourceTotals.advisoryRevenue[source] > 0 ? `${dailySourceTotals.advisoryRevenue[source].toLocaleString()}원` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-violet-600 dark:text-violet-400">
                          {dailySourceTotals.totals[source] > 0 && dailySourceTotals.advisoryRevenue[source] > 0
                            ? `${Math.round(dailySourceTotals.advisoryRevenue[source] / dailySourceTotals.totals[source]).toLocaleString()}원`
                            : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          {dailySourceTotals.revenue[source] > 0 ? `${dailySourceTotals.revenue[source].toLocaleString()}원` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                          {dailySourceTotals.totals[source] > 0 && dailySourceTotals.revenue[source] > 0
                            ? `${Math.round(dailySourceTotals.revenue[source] / dailySourceTotals.totals[source]).toLocaleString()}원`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="py-2 px-3">합계</td>
                    <td className="py-2 px-3 text-right">{dailySourceTotals.grandTotal}건</td>
                    <td className="py-2 px-3 text-right">100%</td>
                    <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                      {dailySourceTotals.grandTotal > 0
                        ? `${((dailySourceTotals.grandContracts / dailySourceTotals.grandTotal) * 100).toFixed(1)}%`
                        : '0.0%'}
                      <span className="text-xs text-muted-foreground ml-1">({dailySourceTotals.grandContracts}건)</span>
                    </td>
                    <td className="py-2 px-3 text-right text-blue-600 dark:text-blue-400">
                      {dailySourceTotals.grandTotal > 0
                        ? `${((dailySourceTotals.grandExecs / dailySourceTotals.grandTotal) * 100).toFixed(1)}%`
                        : '0.0%'}
                      <span className="text-xs text-muted-foreground ml-1">({dailySourceTotals.grandExecs}건)</span>
                    </td>
                    <td className="py-2 px-3 text-right">{dailySourceTotals.grandDepositRevenue > 0 ? `${dailySourceTotals.grandDepositRevenue.toLocaleString()}원` : '-'}</td>
                    <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                      {dailySourceTotals.grandTotal > 0 && dailySourceTotals.grandDepositRevenue > 0
                        ? `${Math.round(dailySourceTotals.grandDepositRevenue / dailySourceTotals.grandTotal).toLocaleString()}원`
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-right">{dailySourceTotals.grandAdvisoryRevenue > 0 ? `${dailySourceTotals.grandAdvisoryRevenue.toLocaleString()}원` : '-'}</td>
                    <td className="py-2 px-3 text-right text-violet-600 dark:text-violet-400">
                      {dailySourceTotals.grandTotal > 0 && dailySourceTotals.grandAdvisoryRevenue > 0
                        ? `${Math.round(dailySourceTotals.grandAdvisoryRevenue / dailySourceTotals.grandTotal).toLocaleString()}원`
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-right">{dailySourceTotals.grandRevenue > 0 ? `${dailySourceTotals.grandRevenue.toLocaleString()}원` : '-'}</td>
                    <td className="py-2 px-3 text-right text-blue-600 dark:text-blue-400">
                      {dailySourceTotals.grandTotal > 0 && dailySourceTotals.grandRevenue > 0
                        ? `${Math.round(dailySourceTotals.grandRevenue / dailySourceTotals.grandTotal).toLocaleString()}원`
                        : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {sourceStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">유입경로별 전환 퍼널</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sourceStats} layout="vertical">
                  <XAxis type="number" />
                  <YAxis dataKey="source" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="consulting" name="상담대기" fill="#a855f7" stackId="a" />
                  <Bar dataKey="absence" name="부재" fill="#f97316" stackId="a" />
                  <Bar dataKey="trash" name="쓰레기통" fill="#ef4444" stackId="a" />
                  <Bar dataKey="target" name="희망타겟" fill="#eab308" stackId="a" />
                  <Bar dataKey="contractSent" name="계약서발송" fill="#84cc16" stackId="a" />
                  <Bar dataKey="contract" name="계약완료" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="docs" name="서류취합" fill="#06b6d4" stackId="a" />
                  <Bar dataKey="apply" name="신청완료" fill="#8b5cf6" stackId="a" />
                  <Bar dataKey="exec" name="집행완료" fill="#10b981" stackId="a" />
                  <Bar dataKey="finalReject" name="최종부결" fill="#6b7280" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">유입경로별 DB 등급 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sourceStats} layout="vertical">
                  <XAxis type="number" />
                  <YAxis dataKey="source" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="grades.S" name="S등급" fill="#eab308" stackId="a" />
                  <Bar dataKey="grades.A" name="A등급" fill="#22c55e" stackId="a" />
                  <Bar dataKey="grades.B" name="B등급" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="grades.C" name="C등급" fill="#f97316" stackId="a" />
                  <Bar dataKey="grades.D" name="D등급" fill="#ef4444" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-4">
        {sourceStats.map(stat => (
          <Card key={stat.source} data-testid={`card-source-${stat.source}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">{stat.source}</CardTitle>
                  <Badge variant="secondary" className="text-xs">{stat.total}건</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openDetailModal(stat.source)} data-testid={`button-detail-${stat.source}`}>
                  상세보기 <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-blue-500" /> 전환 흐름
                  </h4>
                  <div className="space-y-2 text-sm">
                    <FlowRow label="상담대기" count={stat.consulting} total={stat.total} color="text-purple-600 dark:text-purple-400" />
                    <FlowRow label="부재" count={stat.absence} total={stat.total} color="text-orange-600 dark:text-orange-400" />
                    <FlowRow label="쓰레기통" count={stat.trash} total={stat.total} color="text-red-600 dark:text-red-400" />
                    <FlowRow label="희망타겟" count={stat.target} total={stat.total} color="text-yellow-600 dark:text-yellow-400" />
                    <FlowRow label="계약서발송" count={stat.contractSent} total={stat.total} color="text-lime-600 dark:text-lime-400" />
                    <FlowRow label="계약완료" count={stat.contract} total={stat.total} color="text-blue-600 dark:text-blue-400" />
                    <FlowRow label="서류취합" count={stat.docs} total={stat.total} color="text-cyan-600 dark:text-cyan-400" />
                    <FlowRow label="신청완료" count={stat.apply} total={stat.total} color="text-violet-600 dark:text-violet-400" />
                    <FlowRow label="집행완료" count={stat.exec} total={stat.total} color="text-green-600 dark:text-green-400" />
                    <FlowRow label="최종부결" count={stat.finalReject} total={stat.total} color="text-gray-600 dark:text-gray-400" />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4 text-red-500" /> 쓰레기통 세부
                  </h4>
                  {Object.keys(stat.trashDetails).length > 0 ? (
                    <>
                      <div className="mb-2">
                        <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 px-1.5 py-0.5 rounded">
                          광고비효율 {stat.adInefficiency}건 ({pct(stat.adInefficiency, stat.trash)}%)
                        </span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        {Object.entries(stat.trashDetails)
                          .filter(([status]) => AD_INEFFICIENCY_STATUSES.includes(status))
                          .sort(([, a], [, b]) => b - a)
                          .map(([status, count]) => (
                            <FlowRow key={status} label={status} count={count} total={stat.trash} color="text-rose-600 dark:text-rose-400" />
                          ))}
                      </div>
                      {Object.entries(stat.trashDetails).filter(([status]) => !AD_INEFFICIENCY_STATUSES.includes(status)).length > 0 && (
                        <>
                          <div className="mt-3 mb-2">
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                              기타 거절 {stat.trash - stat.adInefficiency}건 ({pct(stat.trash - stat.adInefficiency, stat.trash)}%)
                            </span>
                          </div>
                          <div className="space-y-1.5 text-sm">
                            {Object.entries(stat.trashDetails)
                              .filter(([status]) => !AD_INEFFICIENCY_STATUSES.includes(status))
                              .sort(([, a], [, b]) => b - a)
                              .map(([status, count]) => (
                                <FlowRow key={status} label={status} count={count} total={stat.trash} color="text-red-600 dark:text-red-400" />
                              ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">데이터 없음</p>
                  )}
                  <Separator className="my-3" />
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-yellow-500" /> 희망타겟 세부
                  </h4>
                  {Object.keys(stat.targetDetails).length > 0 ? (
                    <div className="space-y-1.5 text-sm">
                      {Object.entries(stat.targetDetails)
                        .sort(([, a], [, b]) => b - a)
                        .map(([status, count]) => (
                          <FlowRow key={status} label={status} count={count} total={stat.target} color="text-yellow-600 dark:text-yellow-400" />
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">데이터 없음</p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-yellow-500" /> DB 등급 분포
                  </h4>
                  <div className="space-y-2">
                    {(['S', 'A', 'B', 'C', 'D'] as DbGrade[]).map(grade => (
                      <div key={grade} className="flex items-center gap-2">
                        <Badge className={`${GRADE_COLORS[grade]} w-7 h-5 flex items-center justify-center text-xs`}>{grade}</Badge>
                        <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${grade === 'S' ? 'bg-yellow-500' : grade === 'A' ? 'bg-green-500' : grade === 'B' ? 'bg-blue-500' : grade === 'C' ? 'bg-orange-500' : 'bg-red-500'} rounded-full transition-all`}
                            style={{ width: `${stat.total > 0 ? (stat.grades[grade] / stat.total) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right">{stat.grades[grade]}건 ({pct(stat.grades[grade], stat.total)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sourceStats.length === 0 && !loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">해당 유입경로의 데이터가 없습니다.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={detailModal.open} onOpenChange={(open) => !open && setDetailModal({ open: false, source: '', customers: [] })}>
        <DialogContent className="max-w-4xl max-h-[90vh] md:max-h-[85vh]" data-testid="dialog-detail-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailModal.source} DB 상세 ({detailModal.customers.length}건)
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[65vh]">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3">등급별 분류</h3>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {(['S', 'A', 'B', 'C', 'D'] as DbGrade[]).map(grade => {
                    const count = detailModal.customers.filter(c => gradeCustomer(c) === grade).length;
                    return (
                      <Badge key={grade} className={`${GRADE_COLORS[grade]} text-xs px-3 py-1`}>
                        {grade}등급: {count}건 ({pct(count, detailModal.customers.length)}%) - {GRADE_DESCRIPTIONS[grade]}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">등급</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">대표자</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">상호명</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">상태</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">매출</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">신용점수</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">업종</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">담당자</th>
                  </tr>
                </thead>
                <tbody>
                  {detailModal.customers
                    .sort((a, b) => {
                      const STATUS_ORDER = [
                        '상담대기', '단기부재', '장기부재', '쓰레기통', '희망타겟',
                        '수납대기',
                        '계약서발송완료', '계약서발송완료(선불)', '계약서발송완료(후불)', '계약서발송완료(외주)',
                        '계약완료', '계약완료(선불)', '계약완료(후불)', '계약완료(외주)',
                        '서류취합완료', '서류취합완료(선불)', '서류취합완료(후불)', '서류취합완료(외주)',
                        '신청완료', '신청완료(선불)', '신청완료(후불)', '신청완료(외주)',
                        '집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)', '집행완료(채무조정)',
                      ];
                      const idxA = STATUS_ORDER.indexOf(a.status_code);
                      const idxB = STATUS_ORDER.indexOf(b.status_code);
                      const sA = idxA === -1 ? 999 : idxA;
                      const sB = idxB === -1 ? 999 : idxB;
                      if (sA !== sB) return sA - sB;
                      const grades: DbGrade[] = ['S', 'A', 'B', 'C', 'D'];
                      return grades.indexOf(gradeCustomer(a)) - grades.indexOf(gradeCustomer(b));
                    })
                    .map(c => {
                      const grade = gradeCustomer(c);
                      const rev = c.recent_sales || c.avg_revenue_3y || 0;
                      const REVENUE_STATUSES = [
                        '계약완료', '계약완료(선불)', '계약완료(후불)', '계약완료(외주)',
                        '서류취합완료', '서류취합완료(선불)', '서류취합완료(후불)', '서류취합완료(외주)',
                        '신청완료', '신청완료(선불)', '신청완료(후불)', '신청완료(외주)',
                        '집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)', '집행완료(채무조정)',
                      ];
                      const isRevenue = REVENUE_STATUSES.includes(c.status_code);
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-border/50 hover:bg-muted/30 ${isRevenue ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}`}
                          data-testid={`row-customer-${c.id}`}
                        >
                          <td className="py-2 px-2">
                            <Badge className={`${GRADE_COLORS[grade]} text-xs w-6 h-5 flex items-center justify-center`}>{grade}</Badge>
                          </td>
                          <td className={`py-2 px-2 font-medium ${isRevenue ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{c.name}</td>
                          <td className="py-2 px-2 text-muted-foreground">{c.company_name || '-'}</td>
                          <td className="py-2 px-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${isRevenue ? 'border-emerald-500 bg-emerald-100 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300' : ''}`}
                            >
                              {c.status_code}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-right">{rev > 0 ? `${rev}억` : '-'}</td>
                          <td className="py-2 px-2 text-right hidden md:table-cell">{c.credit_score || '-'}</td>
                          <td className="py-2 px-2 text-muted-foreground text-xs hidden md:table-cell">{c.business_type || '-'}</td>
                          <td className="py-2 px-2 text-muted-foreground text-xs">{c.manager_name || '-'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-24 truncate text-xs ${color}`}>{label}</span>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/30 rounded-full transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-20 text-right">{count}건 ({percentage.toFixed(1)}%)</span>
    </div>
  );
}
