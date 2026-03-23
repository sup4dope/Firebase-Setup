import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  Target,
  CalendarIcon,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCustomers, getTeams, getUsers } from '@/lib/firestore';
import type { Customer, Team, User } from '@shared/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
} from 'recharts';
import { ChevronLeft, ChevronRight, Loader2, HelpCircle } from 'lucide-react';
import { Tooltip as ShadTooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

const CONTRACT_AND_BEYOND_STATUSES = [
  '계약완료(선불)', '계약완료(외주)', '계약완료(후불)',
  '서류취합완료(선불)', '서류취합완료(외주)', '서류취합완료(후불)',
  '신청완료(선불)', '신청완료(외주)', '신청완료(후불)',
  '집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)',
  '민원처리',
];

const EXECUTION_STATUSES = ['집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)'];

const ENTRY_SOURCES = ['광고', '캐시노트 인앱광고', '구글애즈', '구글애즈(QS)', '구글애즈(e)', '외주', '고객소개', '승인복제', '기타'];

const NEGATIVE_GROUPS = {
  A: { name: '스킬부족', reasons: ['거절사유 미파악', '정부기관 오인'] },
  B: { name: '설득실패', reasons: ['인증미동의(국세청)', '인증미동의(공여내역)', '진행기간 미동의', '진행기간미동의', '자문료 미동의', '자문료미동의', '계약금미동의(선불)', '계약금미동의(후불)'] },
  C: { name: '관리누수', reasons: ['단기부재', '장기부재', '예약'] },
  D: { name: '불가피', reasons: ['인증불가', '불가업종', '매출없음', '신용점수 미달', '신용점수미달', '차입금초과', '업력미달', '최근대출', '기타자금 오인', '본인아님', '사업자아님', '이중계약', '세금체납', '단박거절'] },
};

const GROUP_A_STATUSES = NEGATIVE_GROUPS.A.reasons;
const GROUP_B_STATUSES = NEGATIVE_GROUPS.B.reasons;
const GROUP_C_STATUSES = NEGATIVE_GROUPS.C.reasons;
const GROUP_D_STATUSES = NEGATIVE_GROUPS.D.reasons;
const ALL_NEGATIVE_STATUSES = [...GROUP_A_STATUSES, ...GROUP_B_STATUSES, ...GROUP_C_STATUSES, ...GROUP_D_STATUSES];

const GROUP_COLORS = {
  A: '#ef4444',
  B: '#f97316',
  C: '#eab308',
  D: '#6b7280',
};

function formatAmount(amountInManwon: number): { value: string; unit: string } {
  if (amountInManwon >= 10000) {
    return { value: (amountInManwon / 10000).toFixed(1), unit: '억원' };
  }
  return { value: amountInManwon.toLocaleString(), unit: '만원' };
}

function getGroup(statusCode: string): 'A' | 'B' | 'C' | 'D' | null {
  const normalized = statusCode.trim();
  if (GROUP_A_STATUSES.includes(normalized)) return 'A';
  if (GROUP_B_STATUSES.includes(normalized)) return 'B';
  if (GROUP_C_STATUSES.includes(normalized)) return 'C';
  if (GROUP_D_STATUSES.includes(normalized)) return 'D';
  if (GROUP_A_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'A';
  if (GROUP_B_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'B';
  if (GROUP_C_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'C';
  if (GROUP_D_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'D';
  return null;
}

interface StatsMetrics {
  totalInflow: number;
  contractedCount: number;
  contractRate: number;
  totalDepositAmount: number;
  avgContractFeeRate: number;
  executedCount: number;
  totalExecutionAmount: number;
  totalCollectionAmount: number;
  pendingExecutionCount: number;
  avgPendingExecutionAmount: number;
  avgConversionRate: number;
  entrySourceStats: Record<string, number>;
}

function calcMetrics(custs: Customer[]): StatsMetrics {
  const totalInflow = custs.length;

  const contractedCustomers = custs.filter(c =>
    c.status_code && CONTRACT_AND_BEYOND_STATUSES.includes(c.status_code)
  );
  const contractedCount = contractedCustomers.length;
  const contractRate = totalInflow > 0 ? (contractedCount / totalInflow) * 100 : 0;

  let totalDepositAmount = 0;
  let totalFeeRateSum = 0;
  let validFeeRateCount = 0;
  contractedCustomers.forEach(c => {
    const depositAmt = Number(c.deposit_amount) || Number(c.contract_amount) || 0;
    totalDepositAmount += depositAmt;
    const feeRate = Number(c.contract_fee_rate) || Number(c.commission_rate) || 0;
    if (feeRate > 0) {
      totalFeeRateSum += feeRate;
      validFeeRateCount += 1;
    }
  });
  const avgContractFeeRate = validFeeRateCount > 0 ? totalFeeRateSum / validFeeRateCount : 0;

  const executedCustomers = custs.filter(c => EXECUTION_STATUSES.includes(c.status_code));
  const executedCount = executedCustomers.length;
  const totalExecutionAmount = executedCustomers.reduce((sum, c) =>
    sum + (Number(c.execution_amount) || 0), 0
  );
  const totalCollectionAmount = executedCustomers.reduce((sum, c) => {
    const execAmount = Number(c.execution_amount) || 0;
    const feeRate = Number(c.contract_fee_rate) || Number(c.commission_rate) || 0;
    return sum + (execAmount * feeRate / 100);
  }, 0);

  const pendingExecutionCustomers = custs.filter(c =>
    ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)',
     '신청완료(선불)', '신청완료(외주)', '신청완료(후불)',
     '서류취합완료(선불)', '서류취합완료(외주)', '서류취합완료(후불)'].includes(c.status_code)
  );
  const pendingExecutionCount = pendingExecutionCustomers.length;
  const avgPendingExecutionAmount = executedCount > 0
    ? (totalExecutionAmount / executedCount) * pendingExecutionCount
    : 0;

  const avgConversionRate = totalInflow > 0 ? (executedCount / totalInflow) * 100 : 0;

  const entrySourceStats: Record<string, number> = {};
  ENTRY_SOURCES.forEach(src => {
    entrySourceStats[src] = custs.filter(c => c.entry_source === src).length;
  });

  return {
    totalInflow,
    contractedCount,
    contractRate,
    totalDepositAmount,
    avgContractFeeRate,
    executedCount,
    totalExecutionAmount,
    totalCollectionAmount,
    pendingExecutionCount,
    avgPendingExecutionAmount,
    avgConversionRate,
    entrySourceStats,
  };
}

function calcStaffAvgMetrics(allCustomers: Customer[], staffMembers: User[]): StatsMetrics {
  if (staffMembers.length === 0) return calcMetrics([]);

  const staffCount = staffMembers.length;

  const staffCustomers = allCustomers.filter(c =>
    staffMembers.some(u => u.uid === c.manager_id)
  );

  const companyMetrics = calcMetrics(staffCustomers);

  const staffMetricsAll = staffMembers.map(u => {
    const staffCusts = allCustomers.filter(c => c.manager_id === u.uid);
    return calcMetrics(staffCusts);
  });

  const activeStaffMetrics = staffMetricsAll.filter(m => m.totalInflow > 0);
  const activeCount = activeStaffMetrics.length || 1;

  const avg: StatsMetrics = {
    totalInflow: Math.round(companyMetrics.totalInflow / staffCount),
    contractedCount: Math.round(companyMetrics.contractedCount / staffCount),
    contractRate: Math.round(companyMetrics.contractRate * 10) / 10,
    totalDepositAmount: Math.round(companyMetrics.totalDepositAmount / staffCount),
    avgContractFeeRate: Math.round(activeStaffMetrics.reduce((s, m) => s + m.avgContractFeeRate, 0) / activeCount * 10) / 10,
    executedCount: Math.round(companyMetrics.executedCount / staffCount),
    totalExecutionAmount: Math.round(companyMetrics.totalExecutionAmount / staffCount),
    totalCollectionAmount: Math.round(companyMetrics.totalCollectionAmount / staffCount),
    pendingExecutionCount: Math.round(companyMetrics.pendingExecutionCount / staffCount),
    avgPendingExecutionAmount: Math.round(companyMetrics.avgPendingExecutionAmount / staffCount),
    avgConversionRate: Math.round(companyMetrics.avgConversionRate * 10) / 10,
    entrySourceStats: {},
  };
  ENTRY_SOURCES.forEach(src => {
    avg.entrySourceStats[src] = Math.round((companyMetrics.entrySourceStats[src] || 0) / staffCount);
  });

  return avg;
}

function DiffBadge({ current, average, suffix = '', isPercent = false }: { current: number; average: number; suffix?: string; isPercent?: boolean }) {
  if (average === 0 && current === 0) return null;
  const diff = current - average;
  const isPositive = diff > 0;
  const isZero = Math.abs(diff) < 0.1;

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
      isZero ? "bg-muted text-muted-foreground" :
      isPositive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
      "bg-red-500/10 text-red-600 dark:text-red-400"
    )}>
      {isZero ? <Minus className="w-2.5 h-2.5" /> : isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
      {isPercent ? `${Math.abs(diff).toFixed(1)}%p` : `${Math.abs(Math.round(diff)).toLocaleString()}${suffix}`}
    </span>
  );
}

export default function Stats() {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [negativeChartPage, setNegativeChartPage] = useState(0);

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const [fetchedCustomers, fetchedTeams, fetchedUsers] = await Promise.all([
          getCustomers(),
          getTeams(),
          getUsers(),
        ]);
        setAllCustomers(fetchedCustomers);
        setTeams(fetchedTeams);
        setUsers(fetchedUsers);
      } catch (error) {
        console.error('Error fetching stats data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const validTeams = useMemo(() => teams.filter(t => t.id && t.id.trim() !== ''), [teams]);

  const allStaff = useMemo(() =>
    users.filter(u => u.uid && u.uid.trim() !== '' && u.role !== 'super_admin'),
  [users]);

  const filteredStaffOptions = useMemo(() => {
    if (isSuperAdmin) {
      if (selectedTeam === 'all') return allStaff;
      return allStaff.filter(u => u.team_id === selectedTeam);
    }
    if (isTeamLeader && user?.team_id) {
      return allStaff.filter(u => u.team_id === user.team_id);
    }
    return [];
  }, [allStaff, selectedTeam, isSuperAdmin, isTeamLeader, user]);

  const dateFilteredCustomers = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return allCustomers;
    return allCustomers.filter(c => {
      if (!c.entry_date) return false;
      const entryDate = parseISO(c.entry_date);
      return isWithinInterval(entryDate, {
        start: startOfDay(dateRange.from!),
        end: endOfDay(dateRange.to!)
      });
    });
  }, [allCustomers, dateRange]);

  const selectedCustomers = useMemo(() => {
    let filtered = dateFilteredCustomers;
    if (isSuperAdmin) {
      if (selectedTeam !== 'all') {
        filtered = filtered.filter(c => c.team_id === selectedTeam);
      }
      if (selectedStaff !== 'all') {
        filtered = filtered.filter(c => c.manager_id === selectedStaff);
      }
    } else if (isTeamLeader && user?.team_id) {
      filtered = filtered.filter(c => c.team_id === user.team_id);
      if (selectedStaff !== 'all') {
        filtered = filtered.filter(c => c.manager_id === selectedStaff);
      }
    } else if (user?.uid) {
      filtered = filtered.filter(c => c.manager_id === user.uid);
    }
    return filtered;
  }, [dateFilteredCustomers, selectedTeam, selectedStaff, isSuperAdmin, isTeamLeader, user]);

  const selectedMetrics = useMemo(() => calcMetrics(selectedCustomers), [selectedCustomers]);

  const companyAvgMetrics = useMemo(() => {
    return calcStaffAvgMetrics(dateFilteredCustomers, allStaff);
  }, [dateFilteredCustomers, allStaff]);

  const selectedTeamAvgMetrics = useMemo(() => {
    if (selectedTeam === 'all') return null;
    const teamStaff = allStaff.filter(u => u.team_id === selectedTeam);
    if (teamStaff.length === 0) return null;
    return calcStaffAvgMetrics(dateFilteredCustomers, teamStaff);
  }, [dateFilteredCustomers, allStaff, selectedTeam]);

  const teamAvgMetrics = useMemo(() => {
    if (!isTeamLeader || !user?.team_id) return null;
    const teamStaff = allStaff.filter(u => u.team_id === user.team_id);
    return calcStaffAvgMetrics(dateFilteredCustomers, teamStaff);
  }, [dateFilteredCustomers, allStaff, isTeamLeader, user]);

  const viewLabel = useMemo(() => {
    if (isSuperAdmin) {
      if (selectedStaff !== 'all') {
        const s = users.find(u => u.uid === selectedStaff);
        return s?.name || '선택된 직원';
      }
      if (selectedTeam !== 'all') {
        const t = teams.find(t => t.id === selectedTeam);
        return (t?.team_name || t?.name || '선택된 팀') + ' 팀';
      }
      return '회사 전체';
    }
    if (isTeamLeader) {
      if (selectedStaff !== 'all') {
        const s = users.find(u => u.uid === selectedStaff);
        return s?.name || '선택된 직원';
      }
      return '우리 팀';
    }
    return '나의 데이터';
  }, [isSuperAdmin, isTeamLeader, selectedTeam, selectedStaff, users, teams]);

  const avgLabel = useMemo(() => {
    if (isTeamLeader && selectedStaff !== 'all') return '팀 평균';
    if (isSuperAdmin && selectedStaff === 'all' && selectedTeam === 'all') return '1인 평균';
    if (isSuperAdmin && selectedStaff === 'all' && selectedTeam !== 'all') return '팀 1인 평균';
    return '회사 평균';
  }, [isTeamLeader, isSuperAdmin, selectedStaff, selectedTeam]);

  const avgMetrics = useMemo(() => {
    if (isTeamLeader && selectedStaff !== 'all' && teamAvgMetrics) return teamAvgMetrics;
    if (isSuperAdmin && selectedStaff !== 'all') return companyAvgMetrics;
    if (isSuperAdmin && selectedTeam !== 'all' && selectedTeamAvgMetrics) return selectedTeamAvgMetrics;
    return companyAvgMetrics;
  }, [isTeamLeader, isSuperAdmin, selectedStaff, selectedTeam, teamAvgMetrics, selectedTeamAvgMetrics, companyAvgMetrics]);

  const conversionRateData = useMemo(() => {
    const calcRates = (custs: Customer[]) => {
      const total = custs.length;
      const contracted = custs.filter(c => CONTRACT_AND_BEYOND_STATUSES.includes(c.status_code)).length;
      const applied = custs.filter(c =>
        ['신청완료(선불)', '신청완료(외주)', '신청완료(후불)', ...EXECUTION_STATUSES, '민원처리'].includes(c.status_code)
      ).length;
      const executed = custs.filter(c => EXECUTION_STATUSES.includes(c.status_code)).length;
      return {
        total, contracted, applied, executed,
        inflowToContract: total > 0 ? Math.round((contracted / total) * 1000) / 10 : 0,
        contractToApply: contracted > 0 ? Math.round((applied / contracted) * 1000) / 10 : 0,
        applyToExecute: applied > 0 ? Math.round((executed / applied) * 1000) / 10 : 0,
        inflowToExecute: total > 0 ? Math.round((executed / total) * 1000) / 10 : 0,
      };
    };

    const current = calcRates(selectedCustomers);

    const staffRates = allStaff.map(u => {
      const staffCustomers = dateFilteredCustomers.filter(c => c.manager_id === u.uid);
      return calcRates(staffCustomers);
    }).filter(r => r.total > 0);

    const avgCount = staffRates.length || 1;
    const avg = {
      inflowToContract: Math.round(staffRates.reduce((s, r) => s + r.inflowToContract, 0) / avgCount * 10) / 10,
      contractToApply: Math.round(staffRates.reduce((s, r) => s + r.contractToApply, 0) / avgCount * 10) / 10,
      applyToExecute: Math.round(staffRates.reduce((s, r) => s + r.applyToExecute, 0) / avgCount * 10) / 10,
      inflowToExecute: Math.round(staffRates.reduce((s, r) => s + r.inflowToExecute, 0) / avgCount * 10) / 10,
    };

    let teamAvg: typeof avg | null = null;
    if (isTeamLeader && user?.team_id) {
      const teamStaffRates = allStaff
        .filter(u => u.team_id === user.team_id)
        .map(u => {
          const staffCustomers = dateFilteredCustomers.filter(c => c.manager_id === u.uid);
          return calcRates(staffCustomers);
        }).filter(r => r.total > 0);
      const tCount = teamStaffRates.length || 1;
      teamAvg = {
        inflowToContract: Math.round(teamStaffRates.reduce((s, r) => s + r.inflowToContract, 0) / tCount * 10) / 10,
        contractToApply: Math.round(teamStaffRates.reduce((s, r) => s + r.contractToApply, 0) / tCount * 10) / 10,
        applyToExecute: Math.round(teamStaffRates.reduce((s, r) => s + r.applyToExecute, 0) / tCount * 10) / 10,
        inflowToExecute: Math.round(teamStaffRates.reduce((s, r) => s + r.inflowToExecute, 0) / tCount * 10) / 10,
      };
    }

    return [
      { name: '유입→계약', current: current.inflowToContract, companyAvg: avg.inflowToContract, teamAvg: teamAvg?.inflowToContract, currentCount: `${current.contracted}/${current.total}` },
      { name: '계약→신청', current: current.contractToApply, companyAvg: avg.contractToApply, teamAvg: teamAvg?.contractToApply, currentCount: `${current.applied}/${current.contracted}` },
      { name: '신청→집행', current: current.applyToExecute, companyAvg: avg.applyToExecute, teamAvg: teamAvg?.applyToExecute, currentCount: `${current.executed}/${current.applied}` },
      { name: '종합 전환율', current: current.inflowToExecute, companyAvg: avg.inflowToExecute, teamAvg: teamAvg?.inflowToExecute, currentCount: `${current.executed}/${current.total}` },
    ];
  }, [selectedCustomers, dateFilteredCustomers, allStaff, isTeamLeader, user]);

  const negativeDataAnalysis = useMemo(() => {
    const negativeCustomers = selectedCustomers.filter(c => getGroup(c.status_code) !== null);

    const managerStats: Record<string, { name: string; A: number; B: number; C: number; D: number; total: number }> = {};
    const reasonCounts: Record<string, number> = {};
    const reasonByManager: Record<string, Record<string, { name: string; count: number }>> = {};

    negativeCustomers.forEach(customer => {
      const statusCode = customer.status_code.trim();
      const group = getGroup(statusCode);
      if (!group) return;

      const managerId = customer.manager_id || 'unknown';
      const managerName = customer.manager_name || '미지정';
      if (!managerStats[managerId]) {
        managerStats[managerId] = { name: managerName, A: 0, B: 0, C: 0, D: 0, total: 0 };
      }
      managerStats[managerId].total += 1;
      managerStats[managerId][group] += 1;

      reasonCounts[statusCode] = (reasonCounts[statusCode] || 0) + 1;

      if (!reasonByManager[statusCode]) reasonByManager[statusCode] = {};
      if (!reasonByManager[statusCode][managerId]) {
        reasonByManager[statusCode][managerId] = { name: managerName, count: 0 };
      }
      reasonByManager[statusCode][managerId].count += 1;
    });

    const managerData = Object.values(managerStats)
      .filter(s => s.total > 0)
      .map(s => ({
        name: s.name,
        A: s.A, B: s.B, C: s.C, total: s.total,
        isAverage: false,
      }));

    const totalA = Object.values(managerStats).reduce((sum, s) => sum + s.A, 0);
    const totalB = Object.values(managerStats).reduce((sum, s) => sum + s.B, 0);
    const totalC = Object.values(managerStats).reduce((sum, s) => sum + s.C, 0);
    const grandTotal = totalA + totalB + totalC;

    const avgData = grandTotal > 0 ? {
      name: '평균',
      A: Math.round(totalA / (managerData.length || 1)),
      B: Math.round(totalB / (managerData.length || 1)),
      C: Math.round(totalC / (managerData.length || 1)),
      total: Math.round(grandTotal / (managerData.length || 1)),
      isAverage: true,
    } : null;

    const stackedBarData = avgData ? [...managerData, avgData] : managerData;

    const pieData = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], index) => {
        const managers = reasonByManager[name] || {};
        const topManagers = Object.values(managers)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(m => ({
            name: m.name,
            count: m.count,
            percent: Math.round((m.count / value) * 100),
          }));
        return {
          name, value,
          fill: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6366f1'][index],
          topManagers,
        };
      });

    const scatterData = Object.entries(managerStats)
      .filter(([_, s]) => s.total > 0)
      .map(([id, s]) => ({
        name: s.name,
        x: Math.round((s.D / s.total) * 100),
        y: Math.round(((s.A + s.B) / s.total) * 100),
        total: s.total,
      }));

    const totalD = Object.values(managerStats).reduce((sum, s) => sum + s.D, 0);
    const totalAB = Object.values(managerStats).reduce((sum, s) => sum + s.A + s.B, 0);
    const totalAll = Object.values(managerStats).reduce((sum, s) => sum + s.total, 0);
    const avgX = totalAll > 0 ? Math.round((totalD / totalAll) * 100) : 0;
    const avgY = totalAll > 0 ? Math.round((totalAB / totalAll) * 100) : 0;

    return { stackedBarData, pieData, scatterData, scatterAvg: { avgX, avgY } };
  }, [selectedCustomers]);

  const trendData = useMemo(() => {
    const rangeFrom = dateRange.from || startOfMonth(new Date());
    const rangeTo = dateRange.to || endOfMonth(new Date());
    const days = eachDayOfInterval({ start: rangeFrom, end: rangeTo });

    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const inflowCount = selectedCustomers.filter(c => c.entry_date === dayStr).length;
      const contractCount = selectedCustomers.filter(c =>
        c.entry_date === dayStr && CONTRACT_AND_BEYOND_STATUSES.includes(c.status_code)
      ).length;
      return { date: format(day, 'MM/dd'), 유입: inflowCount, 계약: contractCount };
    });
  }, [selectedCustomers, dateRange]);

  const resetFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setSelectedTeam('all');
    setSelectedStaff('all');
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6" />
              통계 대시보드
            </h1>
            <Badge variant="secondary" className="text-xs">
              {viewLabel}
            </Badge>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">접수일자</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal min-w-[220px]",
                      !dateRange.from && "text-muted-foreground"
                    )}
                    data-testid="button-date-range"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>{format(dateRange.from, 'yy.MM.dd')} - {format(dateRange.to, 'yy.MM.dd')}</>
                      ) : format(dateRange.from, 'yy.MM.dd')
                    ) : <span>전체 기간</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                    locale={ko}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {isSuperAdmin && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">소속팀</Label>
                  <Select value={selectedTeam} onValueChange={(v) => { setSelectedTeam(v); setSelectedStaff('all'); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-team">
                      <SelectValue placeholder="전체 팀" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 팀</SelectItem>
                      {validTeams.map(team => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.team_name || team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">담당자</Label>
                  <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                    <SelectTrigger className="w-[140px]" data-testid="select-staff">
                      <SelectValue placeholder="전체 직원" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 직원</SelectItem>
                      {filteredStaffOptions.map(staff => (
                        <SelectItem key={staff.uid} value={staff.uid}>{staff.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {isTeamLeader && !isSuperAdmin && (
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">팀원</Label>
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="w-[140px]" data-testid="select-staff">
                    <SelectValue placeholder="전체 팀원" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 팀원</SelectItem>
                    {filteredStaffOptions.map(staff => (
                      <SelectItem key={staff.uid} value={staff.uid}>{staff.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button variant="ghost" size="icon" onClick={resetFilters} data-testid="button-reset-filters">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border-indigo-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">총 유입</p>
                  <p className="text-3xl font-bold text-foreground">{selectedMetrics.totalInflow.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <Users className="w-10 h-10 text-indigo-500 opacity-80" />
              </div>
              <div className="mt-3 pt-3 border-t border-indigo-500/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{avgLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{avgMetrics.totalInflow.toLocaleString()}건</span>
                </div>
                <div className="flex items-center gap-1">
                  <DiffBadge current={selectedMetrics.totalInflow} average={avgMetrics.totalInflow} suffix="건" />
                </div>
                {isTeamLeader && selectedStaff !== 'all' && companyAvgMetrics && (
                  <div className="flex items-center justify-between pt-1 border-t border-indigo-500/10">
                    <span className="text-[10px] text-muted-foreground">회사 평균</span>
                    <span className="text-[10px] text-muted-foreground">{companyAvgMetrics.totalInflow.toLocaleString()}건</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">계약률</p>
                  <p className="text-3xl font-bold text-foreground">{selectedMetrics.contractRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{selectedMetrics.contractedCount}건 계약</p>
                </div>
                <TrendingUp className="w-10 h-10 text-violet-500 opacity-80" />
              </div>
              <div className="mt-3 pt-3 border-t border-violet-500/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{avgLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{avgMetrics.contractRate.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <DiffBadge current={selectedMetrics.contractRate} average={avgMetrics.contractRate} isPercent />
                </div>
                {isTeamLeader && selectedStaff !== 'all' && companyAvgMetrics && (
                  <div className="flex items-center justify-between pt-1 border-t border-violet-500/10">
                    <span className="text-[10px] text-muted-foreground">회사 평균</span>
                    <span className="text-[10px] text-muted-foreground">{companyAvgMetrics.contractRate.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">집행완료</p>
                  <p className="text-3xl font-bold text-foreground">{selectedMetrics.executedCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-80" />
              </div>
              <div className="mt-3 pt-3 border-t border-emerald-500/10 space-y-1">
                <p className="text-xs text-muted-foreground">
                  총 집행: {formatAmount(selectedMetrics.totalExecutionAmount).value} {formatAmount(selectedMetrics.totalExecutionAmount).unit}
                </p>
                <p className="text-xs text-muted-foreground">
                  총 수납: {formatAmount(selectedMetrics.totalCollectionAmount).value} {formatAmount(selectedMetrics.totalCollectionAmount).unit}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-emerald-500/10">
                  <span className="text-[10px] text-muted-foreground">{avgLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{avgMetrics.executedCount}건</span>
                </div>
                <DiffBadge current={selectedMetrics.executedCount} average={avgMetrics.executedCount} suffix="건" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">집행 예정</p>
                  <p className="text-3xl font-bold text-foreground">{selectedMetrics.pendingExecutionCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <Clock className="w-10 h-10 text-amber-500 opacity-80" />
              </div>
              <div className="mt-3 pt-3 border-t border-amber-500/10 space-y-1">
                <p className="text-xs text-muted-foreground">
                  예상금액: {formatAmount(selectedMetrics.avgPendingExecutionAmount).value} {formatAmount(selectedMetrics.avgPendingExecutionAmount).unit}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-amber-500/10">
                  <span className="text-[10px] text-muted-foreground">{avgLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{avgMetrics.pendingExecutionCount}건</span>
                </div>
                <DiffBadge current={selectedMetrics.pendingExecutionCount} average={avgMetrics.pendingExecutionCount} suffix="건" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">기간 내 집행률</p>
                  <p className="text-3xl font-bold text-foreground">{selectedMetrics.avgConversionRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">유입→집행</p>
                </div>
                <Target className="w-10 h-10 text-rose-500 opacity-80" />
              </div>
              <div className="mt-3 pt-3 border-t border-rose-500/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{avgLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{avgMetrics.avgConversionRate.toFixed(1)}%</span>
                </div>
                <DiffBadge current={selectedMetrics.avgConversionRate} average={avgMetrics.avgConversionRate} isPercent />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                단계별 전환율
                <ShadTooltip>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-conversion-help">
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-sm">
                    <div className="space-y-1">
                      <p><strong>유입→계약:</strong> 유입 고객 중 계약 성사 비율</p>
                      <p><strong>계약→신청:</strong> 계약 고객 중 기관 신청 비율</p>
                      <p><strong>신청→집행:</strong> 신청 고객 중 집행 완료 비율</p>
                      <p><strong>종합 전환율:</strong> 유입 대비 최종 집행 비율</p>
                      <p className="text-muted-foreground pt-1">회사 평균{isTeamLeader ? ' 및 팀 평균' : ''}과 비교하여 성과를 확인할 수 있습니다.</p>
                    </div>
                  </TooltipContent>
                </ShadTooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionRateData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, (dataMax: number) => Math.max(Math.ceil(dataMax * 1.2), 10)]}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload;
                          const diff = data.current - data.companyAvg;
                          const diffColor = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : 'hsl(var(--muted-foreground))';
                          const diffSign = diff > 0 ? '+' : '';
                          return (
                            <div style={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              padding: '10px 14px',
                              color: 'hsl(var(--card-foreground))',
                            }}>
                              <p style={{ fontWeight: 'bold', marginBottom: '6px' }}>{label}</p>
                              <p style={{ color: '#6366f1' }}>{viewLabel}: {data.current}% ({data.currentCount})</p>
                              {data.teamAvg !== undefined && (
                                <p style={{ color: '#f59e0b' }}>팀 평균: {data.teamAvg}%</p>
                              )}
                              <p style={{ color: '#94a3b8' }}>회사 평균: {data.companyAvg}%</p>
                              <p style={{ color: diffColor, marginTop: '4px', fontWeight: 500 }}>
                                vs 회사: {diffSign}{Math.round(diff * 10) / 10}%p
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      formatter={(value) =>
                        value === 'current' ? viewLabel :
                        value === 'teamAvg' ? '팀 평균' :
                        '회사 평균'
                      }
                    />
                    <Bar dataKey="current" name="current" fill="#6366f1" radius={[4, 4, 0, 0]} activeBar={false} barSize={24} />
                    {isTeamLeader && (
                      <Bar dataKey="teamAvg" name="teamAvg" fill="#f59e0b" radius={[4, 4, 0, 0]} activeBar={false} barSize={24} />
                    )}
                    <Bar dataKey="companyAvg" name="companyAvg" fill="#94a3b8" radius={[4, 4, 0, 0]} activeBar={false} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">담당자별 부정데이터</CardTitle>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {negativeChartPage + 1}/3
                </span>
                <ShadTooltip>
                  <TooltipTrigger asChild>
                    <button className="ml-1 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-negative-help">
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-sm">
                    <div className="space-y-2">
                      <p><strong className="text-red-500">스킬부족 (A):</strong> 상담 기본기 미달로 인한 실패</p>
                      <p><strong className="text-orange-500">설득실패 (B):</strong> 고객 설득 실패</p>
                      <p><strong className="text-yellow-500">관리누수 (C):</strong> 초기 유입 후 부재누수</p>
                    </div>
                  </TooltipContent>
                </ShadTooltip>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setNegativeChartPage(prev => Math.max(0, prev - 1))} disabled={negativeChartPage === 0} className="h-8 w-8" data-testid="button-negative-chart-prev">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setNegativeChartPage(prev => Math.min(2, prev + 1))} disabled={negativeChartPage === 2} className="h-8 w-8" data-testid="button-negative-chart-next">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {negativeChartPage === 0 && (
                    <motion.div key="page-0" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                      {negativeDataAnalysis.stackedBarData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">데이터가 없습니다</div>
                      ) : (
                        <div className="flex flex-col h-full">
                          <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={negativeDataAnalysis.stackedBarData} layout="horizontal" margin={{ bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-30} textAnchor="end" height={50} />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${v}건`} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                                  formatter={(value: number, name: string, props: any) => {
                                    const label = name === 'A' ? '스킬부족' : name === 'B' ? '설득실패' : '관리누수';
                                    const total = props.payload.total || 1;
                                    const percent = Math.round((value / total) * 100);
                                    return [`${value}건 (${percent}%)`, label];
                                  }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px' }} formatter={(value) => value === 'A' ? '스킬부족' : value === 'B' ? '설득실패' : '관리누수'} />
                                <Bar dataKey="A" name="A" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} activeBar={false} />
                                <Bar dataKey="B" name="B" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} activeBar={false} />
                                <Bar dataKey="C" name="C" stackId="a" fill="#eab308" radius={[4, 4, 0, 0]} activeBar={false} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-center text-xs text-muted-foreground mt-1">담당자별 상담 실패 비중 (A: 스킬부족, B: 설득실패, C: 관리누수)</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {negativeChartPage === 1 && (
                    <motion.div key="page-1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                      {negativeDataAnalysis.pieData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">데이터가 없습니다</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={negativeDataAnalysis.pieData}
                              cx="50%" cy="45%"
                              innerRadius={50} outerRadius={90}
                              paddingAngle={2} dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                            >
                              {negativeDataAnalysis.pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length > 0) {
                                  const data = payload[0].payload;
                                  return (
                                    <div style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', padding: '10px 14px', color: 'hsl(var(--card-foreground))' }}>
                                      <p style={{ fontWeight: 'bold', marginBottom: '6px' }}>{data.name}</p>
                                      <p style={{ marginBottom: '8px' }}>발생 건수: {data.value}건</p>
                                      {data.topManagers && data.topManagers.length > 0 && (
                                        <>
                                          <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>담당자별 지분 TOP 5</p>
                                          {data.topManagers.map((m: any, i: number) => (
                                            <p key={i} style={{ fontSize: '12px' }}>{i + 1}. {m.name}: {m.count}건 ({m.percent}%)</p>
                                          ))}
                                        </>
                                      )}
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                      <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground">부정 데이터 발생 사유 TOP 5</p>
                    </motion.div>
                  )}

                  {negativeChartPage === 2 && (
                    <motion.div key="page-2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                      {negativeDataAnalysis.scatterData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">데이터가 없습니다</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis type="number" dataKey="x" name="불가피율" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} label={{ value: '불가피율 (DB 품질)', position: 'bottom', offset: 0, style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }} />
                            <YAxis type="number" dataKey="y" name="실패율" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} label={{ value: '상담 역량 실패율', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }} />
                            <ZAxis type="number" dataKey="total" range={[50, 400]} name="총 건수" />
                            <ReferenceLine x={negativeDataAnalysis.scatterAvg.avgX} stroke="#94a3b8" strokeDasharray="5 5" label={{ value: `평균 X: ${negativeDataAnalysis.scatterAvg.avgX}%`, position: 'top', fill: '#94a3b8', fontSize: 10 }} />
                            <ReferenceLine y={negativeDataAnalysis.scatterAvg.avgY} stroke="#94a3b8" strokeDasharray="5 5" label={{ value: `평균 Y: ${negativeDataAnalysis.scatterAvg.avgY}%`, position: 'right', fill: '#94a3b8', fontSize: 10 }} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length > 0) {
                                  const data = payload[0].payload;
                                  return (
                                    <div style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', padding: '8px 12px', color: 'hsl(var(--card-foreground))' }}>
                                      <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>담당자: {data.name}</p>
                                      <p>DB 품질 (불가피): {data.x}%</p>
                                      <p>상담 역량 실패: {data.y}%</p>
                                      <p>총 건수: {data.total}건</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Scatter name="담당자" data={negativeDataAnalysis.scatterData} fill="#6366f1">
                              {negativeDataAnalysis.scatterData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.y > 50 ? '#ef4444' : entry.y > 30 ? '#f97316' : '#22c55e'} />
                              ))}
                            </Scatter>
                          </ScatterChart>
                        </ResponsiveContainer>
                      )}
                      <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground">DB 품질 vs 상담 역량 상관관계 (점 크기 = 총 건수)</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">일별 추이 분석</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} interval="preserveStartEnd" />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="유입" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="계약" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
