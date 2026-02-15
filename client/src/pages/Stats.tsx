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
import {
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  Target,
  CalendarIcon,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCustomers, getTeams, getUsers, getStatusLogs, getCounselingLogs } from '@/lib/firestore';
import type { Customer, Team, User, StatusLog, CounselingLog } from '@shared/types';
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

// 부정데이터 그룹 정의
const NEGATIVE_GROUPS = {
  A: { name: '스킬부족', reasons: ['거절사유 미파악', '정부기관 오인'] },
  B: { name: '설득실패', reasons: ['인증미동의(국세청/공여내역)', '진행기간미동의', '자문료미동의', '계약금미동의(선/후불)'] },
  C: { name: '관리누수', reasons: ['단기부재', '장기부재'] },
  D: { name: '불가피', reasons: ['인증불가', '불가업종', '매출없음', '신용점수미달', '차입금초과', '업력미달', '최근대출'] },
};

const GROUP_COLORS = {
  A: '#ef4444', // red
  B: '#f97316', // orange
  C: '#eab308', // yellow
  D: '#6b7280', // gray
};

const CONTRACT_STATUSES = ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)'];
const EXECUTION_STATUS = '집행완료';

// 금액 포맷팅: 만원 단위 입력 → 큰 숫자는 억원 자동 변환
function formatAmount(amountInManwon: number): { value: string; unit: string } {
  if (amountInManwon >= 10000) {
    // 1억 이상이면 억원으로 표시
    return { value: (amountInManwon / 10000).toFixed(1), unit: '억원' };
  }
  return { value: amountInManwon.toLocaleString(), unit: '만원' };
}

export default function Stats() {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [counselingLogs, setCounselingLogs] = useState<CounselingLog[]>([]);
  const [negativeChartPage, setNegativeChartPage] = useState(0);

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [fetchedCustomers, fetchedTeams, fetchedUsers, fetchedLogs, fetchedCounselingLogs] = await Promise.all([
          getCustomers(),
          getTeams(),
          getUsers(),
          getStatusLogs(),
          getCounselingLogs(),
        ]);
        setCustomers(fetchedCustomers);
        setTeams(fetchedTeams);
        setUsers(fetchedUsers);
        setStatusLogs(fetchedLogs);
        setCounselingLogs(fetchedCounselingLogs);
      } catch (error) {
        console.error('Error fetching stats data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 유효한 팀 목록 (id가 존재하는 팀만)
  const validTeams = useMemo(() => {
    return teams.filter(t => t.id && t.id.trim() !== '');
  }, [teams]);

  // 재직중인 직원 수 (super_admin 제외, staff/team_leader만)
  const activeStaffCount = useMemo(() => {
    return users.filter(u => u.uid && u.uid.trim() !== '' && u.role !== 'super_admin').length;
  }, [users]);

  // 유효한 직원 목록 (uid가 존재하는 직원만)
  const filteredStaffOptions = useMemo(() => {
    let filtered = users.filter(u => u.uid && u.uid.trim() !== '');
    if (selectedTeam === 'all') {
      return filtered.filter(u => u.role !== 'super_admin' || isSuperAdmin);
    }
    return filtered.filter(u => u.team_id === selectedTeam);
  }, [users, selectedTeam, isSuperAdmin]);

  const filteredCustomers = useMemo(() => {
    let filtered = customers;

    if (dateRange.from && dateRange.to) {
      filtered = filtered.filter(c => {
        const entryDate = parseISO(c.entry_date);
        return isWithinInterval(entryDate, { 
          start: startOfDay(dateRange.from!), 
          end: endOfDay(dateRange.to!) 
        });
      });
    }

    if (!isSuperAdmin) {
      if (isTeamLeader && user?.team_id) {
        filtered = filtered.filter(c => c.team_id === user.team_id);
      } else if (user?.uid) {
        filtered = filtered.filter(c => c.manager_id === user.uid);
      }
    } else {
      if (selectedTeam !== 'all') {
        filtered = filtered.filter(c => c.team_id === selectedTeam);
      }
      if (selectedStaff !== 'all') {
        filtered = filtered.filter(c => c.manager_id === selectedStaff);
      }
    }

    return filtered;
  }, [customers, dateRange, selectedTeam, selectedStaff, isSuperAdmin, isTeamLeader, user]);

  // 부정데이터 그룹화 로직 (status_code 기반 - 거절 사유가 status_code에 직접 저장됨)
  const negativeDataAnalysis = useMemo(() => {
    // 그룹별 상태 코드 매핑 (정확한 문자열 일치)
    const GROUP_A_STATUSES = ['거절사유 미파악', '정부기관 오인'];
    const GROUP_B_STATUSES = ['인증미동의(국세청)', '인증미동의(공여내역)', '진행기간 미동의', '진행기간미동의', '자문료 미동의', '자문료미동의', '계약금미동의(선불)', '계약금미동의(후불)'];
    const GROUP_C_STATUSES = ['단기부재', '장기부재'];
    const GROUP_D_STATUSES = ['인증불가', '불가업종', '매출없음', '신용점수 미달', '신용점수미달', '차입금초과', '업력미달', '최근대출', '기타자금 오인'];
    
    // 모든 부정 상태 목록
    const ALL_NEGATIVE_STATUSES = [...GROUP_A_STATUSES, ...GROUP_B_STATUSES, ...GROUP_C_STATUSES, ...GROUP_D_STATUSES];

    // status_code로 그룹 분류 (정확한 문자열 일치 + 부분 일치 폴백)
    const getGroup = (statusCode: string): 'A' | 'B' | 'C' | 'D' | null => {
      const normalized = statusCode.trim();
      // 정확한 일치 먼저 확인
      if (GROUP_A_STATUSES.includes(normalized)) return 'A';
      if (GROUP_B_STATUSES.includes(normalized)) return 'B';
      if (GROUP_C_STATUSES.includes(normalized)) return 'C';
      if (GROUP_D_STATUSES.includes(normalized)) return 'D';
      // 부분 일치 폴백 (공백 차이 등 대응)
      if (GROUP_A_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'A';
      if (GROUP_B_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'B';
      if (GROUP_C_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'C';
      if (GROUP_D_STATUSES.some(s => normalized.includes(s) || s.includes(normalized))) return 'D';
      return null; // 부정 데이터가 아님
    };

    // status_code가 부정 상태인 고객만 필터링
    const negativeCustomers = filteredCustomers.filter(c => {
      const group = getGroup(c.status_code);
      return group !== null;
    });

    // 디버깅 로그
    console.log('[부정데이터] 전체 고객 수:', filteredCustomers.length);
    console.log('[부정데이터] 부정 상태 고객 수:', negativeCustomers.length);
    console.log('[부정데이터] 부정 고객 샘플:', negativeCustomers.slice(0, 5).map(c => ({ id: c.id, status: c.status_code })));

    // 담당자별 그룹 카운트
    const managerStats: Record<string, { name: string; A: number; B: number; C: number; D: number; total: number }> = {};
    // 사유별 카운트
    const reasonCounts: Record<string, number> = {};
    // 사유별 담당자 카운트
    const reasonByManager: Record<string, Record<string, { name: string; count: number }>> = {};

    negativeCustomers.forEach(customer => {
      const statusCode = customer.status_code.trim();
      const group = getGroup(statusCode);
      if (!group) return; // 부정 데이터가 아니면 스킵

      // 담당자 통계
      const managerId = customer.manager_id || 'unknown';
      const managerName = customer.manager_name || '미지정';
      if (!managerStats[managerId]) {
        managerStats[managerId] = { name: managerName, A: 0, B: 0, C: 0, D: 0, total: 0 };
      }
      managerStats[managerId].total += 1;
      managerStats[managerId][group] += 1;

      // 사유별 통계 (status_code 사용)
      reasonCounts[statusCode] = (reasonCounts[statusCode] || 0) + 1;
      
      // 사유별 담당자 통계
      if (!reasonByManager[statusCode]) {
        reasonByManager[statusCode] = {};
      }
      if (!reasonByManager[statusCode][managerId]) {
        reasonByManager[statusCode][managerId] = { name: managerName, count: 0 };
      }
      reasonByManager[statusCode][managerId].count += 1;
    });

    // Page 1: Stacked Bar Data (담당자별 A, B, C 비중 %)
    const managerData = Object.values(managerStats)
      .filter(s => s.total > 0)
      .map(s => ({
        name: s.name,
        스킬부족: Math.round((s.A / s.total) * 100),
        설득실패: Math.round((s.B / s.total) * 100),
        관리누수: Math.round((s.C / s.total) * 100),
        A: s.A,
        B: s.B,
        C: s.C,
        total: s.total,
        isAverage: false,
      }));

    // 평균 계산 (전체 부정 데이터의 평균 비율)
    const totalA = Object.values(managerStats).reduce((sum, s) => sum + s.A, 0);
    const totalB = Object.values(managerStats).reduce((sum, s) => sum + s.B, 0);
    const totalC = Object.values(managerStats).reduce((sum, s) => sum + s.C, 0);
    const grandTotal = totalA + totalB + totalC;
    
    const avgData = grandTotal > 0 ? {
      name: '평균',
      스킬부족: Math.round((totalA / grandTotal) * 100),
      설득실패: Math.round((totalB / grandTotal) * 100),
      관리누수: Math.round((totalC / grandTotal) * 100),
      A: Math.round(totalA / (managerData.length || 1)),
      B: Math.round(totalB / (managerData.length || 1)),
      C: Math.round(totalC / (managerData.length || 1)),
      total: Math.round(grandTotal / (managerData.length || 1)),
      isAverage: true,
    } : null;

    const stackedBarData = avgData ? [...managerData, avgData] : managerData;

    // Page 2: Pie Chart Data (TOP 5 사유)
    const pieData = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], index) => {
        // 해당 사유의 담당자별 통계 (상위 5명)
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
          name,
          value,
          fill: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6366f1'][index],
          topManagers,
        };
      });

    // Page 3: Scatter Data (X: D 발생률, Y: A+B 발생률)
    const scatterData = Object.entries(managerStats)
      .filter(([_, s]) => s.total > 0)
      .map(([id, s]) => ({
        name: s.name,
        x: Math.round((s.D / s.total) * 100), // D 발생률 (불가피)
        y: Math.round(((s.A + s.B) / s.total) * 100), // A+B 발생률 (스킬+설득)
        total: s.total,
      }));

    // Scatter 차트용 평균 계산
    const totalD = Object.values(managerStats).reduce((sum, s) => sum + s.D, 0);
    const totalAB = Object.values(managerStats).reduce((sum, s) => sum + s.A + s.B, 0);
    const totalAll = Object.values(managerStats).reduce((sum, s) => sum + s.total, 0);
    const avgX = totalAll > 0 ? Math.round((totalD / totalAll) * 100) : 0;
    const avgY = totalAll > 0 ? Math.round((totalAB / totalAll) * 100) : 0;

    return { stackedBarData, pieData, scatterData, scatterAvg: { avgX, avgY } };
  }, [filteredCustomers]);

  const customerIdsWithContractHistory = useMemo(() => {
    const contractedIds = new Set<string>();
    
    // 1. status_logs에서 계약완료 이력이 있는 모든 customer_id 수집
    statusLogs.forEach(log => {
      if (CONTRACT_STATUSES.includes(log.new_status)) {
        contractedIds.add(log.customer_id);
      }
    });

    // 2. 현재 상태가 계약완료인 고객도 포함 (로그가 없을 경우 대비)
    filteredCustomers.forEach(c => {
      if (CONTRACT_STATUSES.includes(c.status_code)) {
        contractedIds.add(c.id);
      }
    });

    console.log('[Stats] 계약 이력 고객 ID Set:', Array.from(contractedIds));
    return contractedIds;
  }, [statusLogs, filteredCustomers]);

  const metrics = useMemo(() => {
    const totalInflow = filteredCustomers.length;
    
    // [1] 계약 성과: status_logs에 '계약완료' 기록이 있는 모든 고객 (현재 상태 무관)
    // 현재 상태가 '집행완료'여도 과거 계약 이력이 있으면 반드시 포함
    const contractedCustomers = filteredCustomers.filter(c => 
      customerIdsWithContractHistory.has(c.id)
    );
    const contractedCount = contractedCustomers.length;
    const contractRate = totalInflow > 0 ? (contractedCount / totalInflow) * 100 : 0;
    
    // [2] 계약 보조지표 계산
    let totalDepositAmount = 0;
    let totalFeeRateSum = 0;
    let validFeeRateCount = 0;

    contractedCustomers.forEach(c => {
      // 1. 계약금 합산: contract_amount 필드 사용 (상태변경 모달에서 저장하는 필드)
      // deposit_amount가 있으면 우선 사용, 없으면 contract_amount 사용
      const depositAmt = Number(c.deposit_amount) || Number(c.contract_amount) || 0;
      totalDepositAmount += depositAmt;
      
      // 2. 자문료율 합산: commission_rate 필드 사용 (상태변경 모달에서 저장하는 필드)
      // contract_fee_rate가 있으면 우선 사용, 없으면 commission_rate 사용
      const feeRate = Number(c.contract_fee_rate) || Number(c.commission_rate) || 0;
      if (feeRate > 0) {
        totalFeeRateSum += feeRate;
        validFeeRateCount += 1;
      }
    });

    const avgContractFeeRate = validFeeRateCount > 0 ? totalFeeRateSum / validFeeRateCount : 0;
    
    // 데이터 검증 로그
    console.log("계약합산결과:", { totalDepositAmount, avgContractFeeRate, count: contractedCustomers.length });

    // 집행 완료: 현재 상태가 '집행완료'인 고객들
    const executedCustomers = filteredCustomers.filter(c => c.status_code === EXECUTION_STATUS);
    const executedCount = executedCustomers.length;
    // execution_amount는 만원 단위로 저장, Number() 처리
    const totalExecutionAmount = executedCustomers.reduce((sum, c) => 
      sum + (Number(c.execution_amount) || 0), 0
    );
    
    // 총 수납금액: 자문료율(%) * 집행금액 / 100 의 총합
    const totalCollectionAmount = executedCustomers.reduce((sum, c) => {
      const execAmount = Number(c.execution_amount) || 0;
      const feeRate = Number(c.contract_fee_rate) || Number(c.commission_rate) || 0;
      return sum + (execAmount * feeRate / 100);
    }, 0);

    // 집행 예정: 계약완료(선불/후불/외주) 또는 신청완료 상태
    const pendingExecutionCustomers = filteredCustomers.filter(c => 
      CONTRACT_STATUSES.includes(c.status_code) || c.status_code === '신청완료'
    );
    const pendingExecutionCount = pendingExecutionCustomers.length;
    
    // 평균 예상금액: (집행금액 / 집행건수) × 집행예정건수
    // 집행완료 데이터 기반으로 집행예정 고객의 예상 총 금액 산출
    const avgPendingExecutionAmount = executedCount > 0
      ? (totalExecutionAmount / executedCount) * pendingExecutionCount
      : 0;

    const avgConversionRate = totalInflow > 0 ? (executedCount / totalInflow) * 100 : 0;

    // 유입경로별 통계
    const entrySourceStats = {
      광고: filteredCustomers.filter(c => c.entry_source === '광고' || c.entry_source === '광고랜딩명').length,
      외주: filteredCustomers.filter(c => c.entry_source === '외주').length,
      고객소개: filteredCustomers.filter(c => c.entry_source === '고객소개').length,
      승인복제: filteredCustomers.filter(c => c.entry_source === '승인복제').length,
    };

    return {
      totalInflow,
      contractRate,
      contractedCount,
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
  }, [filteredCustomers, customerIdsWithContractHistory]);

  const conversionRateData = useMemo(() => {
    const calcRates = (custs: Customer[], contractIds: Set<string>) => {
      const total = custs.length;
      const contracted = custs.filter(c => contractIds.has(c.id)).length;
      const applied = custs.filter(c => c.status_code === '신청완료' || c.status_code === EXECUTION_STATUS).length;
      const executed = custs.filter(c => c.status_code === EXECUTION_STATUS).length;
      return {
        total,
        contracted,
        applied,
        executed,
        inflowToContract: total > 0 ? Math.round((contracted / total) * 1000) / 10 : 0,
        contractToApply: contracted > 0 ? Math.round((applied / contracted) * 1000) / 10 : 0,
        applyToExecute: applied > 0 ? Math.round((executed / applied) * 1000) / 10 : 0,
        inflowToExecute: total > 0 ? Math.round((executed / total) * 1000) / 10 : 0,
      };
    };

    const allContractIds = new Set<string>();
    statusLogs.forEach(log => {
      if (CONTRACT_STATUSES.includes(log.new_status)) allContractIds.add(log.customer_id);
    });
    customers.forEach(c => {
      if (CONTRACT_STATUSES.includes(c.status_code)) allContractIds.add(c.id);
    });

    const current = calcRates(filteredCustomers, customerIdsWithContractHistory);

    const staffMembers = users.filter(u => u.uid && u.uid.trim() !== '' && u.role !== 'super_admin');
    const staffRates = staffMembers.map(u => {
      const staffCustomers = customers.filter(c => c.manager_id === u.uid);
      const staffContractIds = new Set<string>();
      statusLogs.forEach(log => {
        if (CONTRACT_STATUSES.includes(log.new_status) && staffCustomers.some(c => c.id === log.customer_id)) {
          staffContractIds.add(log.customer_id);
        }
      });
      staffCustomers.forEach(c => {
        if (CONTRACT_STATUSES.includes(c.status_code)) staffContractIds.add(c.id);
      });
      return calcRates(staffCustomers, staffContractIds);
    }).filter(r => r.total > 0);

    const avgCount = staffRates.length || 1;
    const avg = {
      inflowToContract: Math.round(staffRates.reduce((s, r) => s + r.inflowToContract, 0) / avgCount * 10) / 10,
      contractToApply: Math.round(staffRates.reduce((s, r) => s + r.contractToApply, 0) / avgCount * 10) / 10,
      applyToExecute: Math.round(staffRates.reduce((s, r) => s + r.applyToExecute, 0) / avgCount * 10) / 10,
      inflowToExecute: Math.round(staffRates.reduce((s, r) => s + r.inflowToExecute, 0) / avgCount * 10) / 10,
    };

    return [
      { name: '유입→계약', current: current.inflowToContract, average: avg.inflowToContract, currentCount: `${current.contracted}/${current.total}` },
      { name: '계약→신청', current: current.contractToApply, average: avg.contractToApply, currentCount: `${current.applied}/${current.contracted}` },
      { name: '신청→집행', current: current.applyToExecute, average: avg.applyToExecute, currentCount: `${current.executed}/${current.applied}` },
      { name: '종합 전환율', current: current.inflowToExecute, average: avg.inflowToExecute, currentCount: `${current.executed}/${current.total}` },
    ];
  }, [filteredCustomers, customers, users, statusLogs, customerIdsWithContractHistory]);

  const performanceData = useMemo(() => {
    const staffStats: { [key: string]: { name: string; contracts: number; amount: number } } = {};

    const targetUsers = selectedTeam === 'all' 
      ? users.filter(u => u.role !== 'super_admin')
      : users.filter(u => u.team_id === selectedTeam && u.role !== 'super_admin');

    targetUsers.forEach(u => {
      staffStats[u.uid] = { name: u.name, contracts: 0, amount: 0 };
    });

    filteredCustomers.forEach(c => {
      if (staffStats[c.manager_id]) {
        if (customerIdsWithContractHistory.has(c.id)) {
          staffStats[c.manager_id].contracts += 1;
        }
        if (c.status_code === EXECUTION_STATUS) {
          // execution_amount는 만원 단위로 저장
          staffStats[c.manager_id].amount += c.execution_amount || 0;
        }
      }
    });

    return Object.values(staffStats).filter(s => s.contracts > 0 || s.amount > 0);
  }, [filteredCustomers, users, selectedTeam, customerIdsWithContractHistory]);

  const trendData = useMemo(() => {
    if (!dateRange.from || !dateRange.to) {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      return days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const inflowCount = filteredCustomers.filter(c => c.entry_date === dayStr).length;
        const contractCount = filteredCustomers.filter(c => 
          c.entry_date === dayStr && customerIdsWithContractHistory.has(c.id)
        ).length;

        return {
          date: format(day, 'MM/dd'),
          유입: inflowCount,
          계약: contractCount,
        };
      });
    }

    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const inflowCount = filteredCustomers.filter(c => c.entry_date === dayStr).length;
      const contractCount = filteredCustomers.filter(c => 
        c.entry_date === dayStr && customerIdsWithContractHistory.has(c.id)
      ).length;

      return {
        date: format(day, 'MM/dd'),
        유입: inflowCount,
        계약: contractCount,
      };
    });
  }, [filteredCustomers, dateRange, customerIdsWithContractHistory]);

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
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
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
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            통계 대시보드
          </h1>

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
                        <>
                          {format(dateRange.from, 'yy.MM.dd')} - {format(dateRange.to, 'yy.MM.dd')}
                        </>
                      ) : (
                        format(dateRange.from, 'yy.MM.dd')
                      )
                    ) : (
                      <span>전체 기간</span>
                    )}
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
                  <Select value={selectedTeam || 'all'} onValueChange={setSelectedTeam}>
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
                  <Select value={selectedStaff || 'all'} onValueChange={setSelectedStaff}>
                    <SelectTrigger className="w-[140px]" data-testid="select-staff">
                      <SelectValue placeholder="전체 직원" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 직원</SelectItem>
                      {filteredStaffOptions.map(staff => (
                        <SelectItem key={staff.uid} value={staff.uid}>
                          {staff.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Button variant="ghost" size="icon" onClick={resetFilters} data-testid="button-reset-filters">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* 1. 총 유입 */}
          <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border-indigo-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">총 유입</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.totalInflow.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <Users className="w-10 h-10 text-indigo-500 opacity-80" />
              </div>
              {/* 보조 지표: 유입경로별 건수 및 비율 */}
              <div className="mt-3 pt-3 border-t border-indigo-500/10 space-y-1">
                <p className="text-xs text-gray-500">
                  광고 {metrics.entrySourceStats.광고}건 / {metrics.totalInflow > 0 ? ((metrics.entrySourceStats.광고 / metrics.totalInflow) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-xs text-gray-500">
                  외주 {metrics.entrySourceStats.외주}건 / {metrics.totalInflow > 0 ? ((metrics.entrySourceStats.외주 / metrics.totalInflow) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-xs text-gray-500">
                  고객소개 {metrics.entrySourceStats.고객소개}건 / {metrics.totalInflow > 0 ? ((metrics.entrySourceStats.고객소개 / metrics.totalInflow) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-xs text-gray-500">
                  승인복제 {metrics.entrySourceStats.승인복제}건 / {metrics.totalInflow > 0 ? ((metrics.entrySourceStats.승인복제 / metrics.totalInflow) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 2. 계약 성과 */}
          <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">계약률</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.contractRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{metrics.contractedCount}건 계약</p>
                </div>
                <TrendingUp className="w-10 h-10 text-violet-500 opacity-80" />
              </div>
              {/* 보조 지표: 총 계약금액, 평균 자문료율 */}
              <div className="mt-3 pt-3 border-t border-violet-500/10 space-y-1">
                <p className="text-xs text-gray-500">
                  총 계약금액: {formatAmount(metrics.totalDepositAmount).value} {formatAmount(metrics.totalDepositAmount).unit}
                </p>
                <p className="text-xs text-gray-500">
                  평균 자문료: {metrics.avgContractFeeRate.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 3. 집행 완료 */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">집행완료</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.executedCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-80" />
              </div>
              {/* 보조 지표: 총 집행금액, 총 수납금액 */}
              <div className="mt-3 pt-3 border-t border-emerald-500/10 space-y-1">
                <p className="text-xs text-gray-500">
                  총 집행금액: {formatAmount(metrics.totalExecutionAmount).value} {formatAmount(metrics.totalExecutionAmount).unit}
                </p>
                <p className="text-xs text-gray-500">
                  총 수납금액: {formatAmount(metrics.totalCollectionAmount).value} {formatAmount(metrics.totalCollectionAmount).unit}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 4. 집행 예정 (신규) */}
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">집행 예정</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.pendingExecutionCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <Clock className="w-10 h-10 text-amber-500 opacity-80" />
              </div>
              {/* 보조 지표: 평균 예상 집행금액 */}
              <div className="mt-3 pt-3 border-t border-amber-500/10">
                <p className="text-xs text-gray-500">
                  평균 예상금액: {formatAmount(metrics.avgPendingExecutionAmount).value} {formatAmount(metrics.avgPendingExecutionAmount).unit}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 5. 평균 전환율 */}
          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">기간 내 집행률</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.avgConversionRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">유입→집행</p>
                </div>
                <Target className="w-10 h-10 text-rose-500 opacity-80" />
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
                      <p className="text-muted-foreground pt-1">전체 직원 평균과 비교하여 성과를 확인할 수 있습니다.</p>
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
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--card-foreground))' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload;
                          const diff = data.current - data.average;
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
                              <p style={{ color: '#6366f1' }}>현재: {data.current}% ({data.currentCount}건)</p>
                              <p style={{ color: '#94a3b8' }}>전체 평균: {data.average}%</p>
                              <p style={{ color: diffColor, marginTop: '4px', fontWeight: 500 }}>
                                차이: {diffSign}{Math.round(diff * 10) / 10}%p
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend 
                      formatter={(value) => value === 'current' ? '현재 선택' : '전체 평균'}
                    />
                    <Bar dataKey="current" name="current" fill="#6366f1" radius={[4, 4, 0, 0]} activeBar={false} barSize={28} />
                    <Bar dataKey="average" name="average" fill="#94a3b8" radius={[4, 4, 0, 0]} activeBar={false} barSize={28} />
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
                      <p><strong className="text-red-500">스킬부족 (A):</strong> 상담 기본기 미달로 인한 실패 (정체성의심, 설명 미흡 등)</p>
                      <p><strong className="text-orange-500">설득실패 (B):</strong> 고객 설득 실패 (비용 미동의, 조건 미동의 등)</p>
                      <p><strong className="text-yellow-500">관리누수 (C):</strong> 초기 유입 후 부재누수 (부재 등 컨택 실패)</p>
                    </div>
                  </TooltipContent>
                </ShadTooltip>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setNegativeChartPage(prev => Math.max(0, prev - 1))}
                  disabled={negativeChartPage === 0}
                  className="h-8 w-8"
                  data-testid="button-negative-chart-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setNegativeChartPage(prev => Math.min(2, prev + 1))}
                  disabled={negativeChartPage === 2}
                  className="h-8 w-8"
                  data-testid="button-negative-chart-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] relative overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    {negativeChartPage === 0 && (
                      <motion.div
                        key="page-0"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0"
                      >
                        {negativeDataAnalysis.stackedBarData.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            데이터가 없습니다
                          </div>
                        ) : (
                          <div className="flex flex-col h-full">
                            <div className="flex-1">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={negativeDataAnalysis.stackedBarData} layout="horizontal" margin={{ bottom: 10 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis 
                                    dataKey="name" 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={11}
                                    angle={-30}
                                    textAnchor="end"
                                    height={50}
                                  />
                                  <YAxis 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12}
                                    tickFormatter={(v) => `${v}건`}
                                  />
                                  <Tooltip 
                                    contentStyle={{ 
                                      backgroundColor: 'hsl(var(--card))',
                                      border: '1px solid hsl(var(--border))',
                                      borderRadius: '8px',
                                    }}
                                    formatter={(value: number, name: string, props: any) => {
                                      const label = name === 'A' ? '스킬부족' : name === 'B' ? '설득실패' : '관리누수';
                                      const total = props.payload.total || 1;
                                      const percent = Math.round((value / total) * 100);
                                      return [`${value}건 (${percent}%)`, label];
                                    }}
                                  />
                                  <Legend 
                                    wrapperStyle={{ paddingTop: '10px' }} 
                                    formatter={(value) => value === 'A' ? '스킬부족' : value === 'B' ? '설득실패' : '관리누수'}
                                  />
                                  <Bar dataKey="A" name="A" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} activeBar={false} />
                                  <Bar dataKey="B" name="B" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} activeBar={false} />
                                  <Bar dataKey="C" name="C" stackId="a" fill="#eab308" radius={[4, 4, 0, 0]} activeBar={false} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <p className="text-center text-xs text-muted-foreground mt-1">
                              담당자별 상담 실패 비중 (A: 스킬부족, B: 설득실패, C: 관리누수)
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {negativeChartPage === 1 && (
                      <motion.div
                        key="page-1"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0"
                      >
                        {negativeDataAnalysis.pieData.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            데이터가 없습니다
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={negativeDataAnalysis.pieData}
                                cx="50%"
                                cy="45%"
                                innerRadius={50}
                                outerRadius={90}
                                paddingAngle={2}
                                dataKey="value"
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
                                      <div style={{
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        color: 'hsl(var(--card-foreground))',
                                      }}>
                                        <p style={{ fontWeight: 'bold', marginBottom: '6px' }}>{data.name}</p>
                                        <p style={{ marginBottom: '8px' }}>발생 건수: {data.value}건</p>
                                        {data.topManagers && data.topManagers.length > 0 && (
                                          <>
                                            <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>담당자별 지분 TOP 5</p>
                                            {data.topManagers.map((m: any, i: number) => (
                                              <p key={i} style={{ fontSize: '12px' }}>
                                                {i + 1}. {m.name}: {m.count}건 ({m.percent}%)
                                              </p>
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
                        <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground">
                          부정 데이터 발생 사유 TOP 5
                        </p>
                      </motion.div>
                    )}

                    {negativeChartPage === 2 && (
                      <motion.div
                        key="page-2"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0"
                      >
                        {negativeDataAnalysis.scatterData.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            데이터가 없습니다
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis 
                                type="number" 
                                dataKey="x" 
                                name="불가피율" 
                                stroke="hsl(var(--muted-foreground))" 
                                fontSize={11}
                                tickFormatter={(v) => `${v}%`}
                                domain={[0, 'auto']}
                                label={{ value: '불가피율 (DB 품질)', position: 'bottom', offset: 0, style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }}
                              />
                              <YAxis 
                                type="number" 
                                dataKey="y" 
                                name="실패율" 
                                stroke="hsl(var(--muted-foreground))" 
                                fontSize={11}
                                tickFormatter={(v) => `${v}%`}
                                domain={[0, 'auto']}
                                label={{ value: '상담 역량 실패율', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }}
                              />
                              <ZAxis type="number" dataKey="total" range={[50, 400]} name="총 건수" />
                              <ReferenceLine 
                                x={negativeDataAnalysis.scatterAvg.avgX} 
                                stroke="#94a3b8" 
                                strokeDasharray="5 5" 
                                label={{ value: `평균 X: ${negativeDataAnalysis.scatterAvg.avgX}%`, position: 'top', fill: '#94a3b8', fontSize: 10 }}
                              />
                              <ReferenceLine 
                                y={negativeDataAnalysis.scatterAvg.avgY} 
                                stroke="#94a3b8" 
                                strokeDasharray="5 5" 
                                label={{ value: `평균 Y: ${negativeDataAnalysis.scatterAvg.avgY}%`, position: 'right', fill: '#94a3b8', fontSize: 10 }}
                              />
                              <Tooltip 
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length > 0) {
                                    const data = payload[0].payload;
                                    return (
                                      <div style={{
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px',
                                        padding: '8px 12px',
                                        color: 'hsl(var(--card-foreground))',
                                      }}>
                                        <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>담당자: {data.name}</p>
                                        <p>DB 품질 (불가피) : {data.x}%</p>
                                        <p>상담 역량 실패 : {data.y}%</p>
                                        <p>총 건수 : {data.total}건</p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Scatter 
                                name="담당자" 
                                data={negativeDataAnalysis.scatterData} 
                                fill="#6366f1"
                              >
                                {negativeDataAnalysis.scatterData.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.y > 50 ? '#ef4444' : entry.y > 30 ? '#f97316' : '#22c55e'} 
                                  />
                                ))}
                              </Scatter>
                            </ScatterChart>
                          </ResponsiveContainer>
                        )}
                        <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground">
                          DB 품질 vs 상담 역량 상관관계 (점 크기 = 총 건수)
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
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
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="유입" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="계약" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
