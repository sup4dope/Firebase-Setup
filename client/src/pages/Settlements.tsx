import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useLocation } from 'wouter';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type PeriodType = 'month' | 'H1' | 'H2' | 'year';

const parsePeriod = (period: string): { type: PeriodType; year: number; month?: number } => {
  if (period.endsWith('-H1')) {
    return { type: 'H1', year: parseInt(period.slice(0, 4)) };
  }
  if (period.endsWith('-H2')) {
    return { type: 'H2', year: parseInt(period.slice(0, 4)) };
  }
  if (period.endsWith('-Y')) {
    return { type: 'year', year: parseInt(period.slice(0, 4)) };
  }
  const [year, month] = period.split('-').map(Number);
  return { type: 'month', year, month };
};

const getMonthsForPeriod = (period: string): string[] => {
  const { type, year } = parsePeriod(period);
  if (type === 'H1') {
    return Array.from({ length: 6 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  }
  if (type === 'H2') {
    return Array.from({ length: 6 }, (_, i) => `${year}-${String(i + 7).padStart(2, '0')}`);
  }
  if (type === 'year') {
    return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  }
  return [period];
};

const getPeriodLabel = (period: string): string => {
  const { type, year, month } = parsePeriod(period);
  if (type === 'H1') return `${year}년 상반기`;
  if (type === 'H2') return `${year}년 하반기`;
  if (type === 'year') return `${year}년`;
  return format(new Date(year, (month || 1) - 1, 1), 'yyyy년 M월', { locale: ko });
};

const isPeriodSummary = (period: string): boolean => {
  return period.endsWith('-H1') || period.endsWith('-H2') || period.endsWith('-Y');
};
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileDown,
  FileText,
} from 'lucide-react';
import { SalaryStatement, type SalaryItem } from '@/components/salary/salary-statement';
import {
  getSettlementItems,
  getUsers,
  getCustomers,
  calculateMonthlySettlementSummary,
  syncCustomerSettlements,
} from '@/lib/firestore';
import type {
  SettlementItem,
  MonthlySettlementSummary,
  User,
  Customer,
} from '@shared/types';

export default function Settlements() {
  const { user, isSuperAdmin, isTeamLeader, isStaff, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [dataLoading, setDataLoading] = useState(true);
  const [items, setItems] = useState<SettlementItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalTitle, setDetailModalTitle] = useState('');
  const [detailModalItems, setDetailModalItems] = useState<SettlementItem[]>([]);
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [salaryData, setSalaryData] = useState<{
    employeeName: string;
    employeeId: string;
    salaryMonth: string;
    contractPayment: number;
    consultingFee: number;
    additionalPayments: SalaryItem[];
  } | null>(null);

  

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation('/login');
    }
  }, [user, authLoading, setLocation]);

  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();

    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthStr = format(date, 'yyyy-MM');
      
      if (month === 12) {
        options.push(`${year}-Y`);
        options.push(`${year}-H2`);
      }
      
      if (month === 6) {
        options.push(`${year}-H1`);
      }
      
      options.push(monthStr);
    }
    return options;
  }, []);

  const isPrevMonthDisabled = useMemo(() => {
    return isPeriodSummary(selectedMonth);
  }, [selectedMonth]);

  const isNextMonthDisabled = useMemo(() => {
    if (isPeriodSummary(selectedMonth)) return true;
    const [year, month] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const now = new Date();
    return nextDate > now;
  }, [selectedMonth]);

  const fetchData = async () => {
    if (!user || authLoading) return;
    setDataLoading(true);
    try {
      const fetchedUsers = await getUsers();
      setUsers(fetchedUsers);
      
      const months = getMonthsForPeriod(selectedMonth);
      const isSummary = isPeriodSummary(selectedMonth);
      
      // 권한에 따라 필터 결정 (Firebase 보안 규칙 대응)
      // staff: manager_id 필터 (본인 것만)
      // team_leader: team_id 필터 (팀원 것만)
      // super_admin: 필터 없음 (전체)
      const managerId = isStaff ? user.uid : undefined;
      const teamId = isTeamLeader && user.team_id ? user.team_id : undefined;
      
      if (isSummary) {
        const allItemsPromises = months.map(m => getSettlementItems(m, managerId, teamId));
        const allItemsArrays = await Promise.all(allItemsPromises);
        const allItems = allItemsArrays.flat();
        
        const fetchedCustomers = await getCustomers();
        setItems(allItems);
        setCustomers(fetchedCustomers);
      } else {
        if (isSuperAdmin) {
          await syncCustomerSettlements(selectedMonth, fetchedUsers);
        }
        
        const [fetchedItems, fetchedCustomers] = await Promise.all([
          getSettlementItems(selectedMonth, managerId, teamId),
          getCustomers(),
        ]);
        
        setItems(fetchedItems);
        setCustomers(fetchedCustomers);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) {
      fetchData();
    }
  }, [selectedMonth, user, authLoading]);

  const summaries = useMemo(() => {
    if (!user) return [];
    const managerIds = Array.from(new Set(items.map(item => item.manager_id)));
    const isSummaryView = isPeriodSummary(selectedMonth);
    
    return managerIds.map(managerId => {
      const manager = users.find(u => u.uid === managerId);
      
      if (isSummaryView) {
        const managerItems = items.filter(item => item.manager_id === managerId);
        const originalItems = managerItems.filter(item => !item.is_clawback);
        const clawbackItems = managerItems.filter(item => item.is_clawback);
        
        const totalContracts = originalItems.length;
        // 계약금 수당: 계약금 * 수당율 적용
        const totalContractAmount = originalItems.reduce((sum, item) => sum + (item.contract_amount * item.commission_rate / 100), 0);
        const executionCount = originalItems.filter(item => item.execution_amount > 0).length;
        const totalExecutionAmount = originalItems.reduce((sum, item) => sum + item.execution_amount, 0);
        const totalExecutionFee = originalItems.reduce((sum, item) => {
          return sum + (item.execution_amount * (item.fee_rate / 100) * (item.commission_rate / 100));
        }, 0);
        const totalGrossCommission = originalItems.reduce((sum, item) => sum + item.gross_commission, 0);
        const totalTax = originalItems.reduce((sum, item) => sum + item.tax_amount, 0);
        const totalNetCommission = originalItems.reduce((sum, item) => sum + item.net_commission, 0);
        const clawbackCount = clawbackItems.length;
        const clawbackAmount = clawbackItems.reduce((sum, item) => sum + Math.abs(item.net_commission), 0);
        
        return {
          manager_id: managerId,
          manager_name: manager?.name || '알 수 없음',
          settlement_month: selectedMonth,
          total_contracts: totalContracts,
          total_contract_amount: totalContractAmount,
          execution_count: executionCount,
          total_execution_amount: totalExecutionAmount,
          total_execution_fee: totalExecutionFee,
          total_revenue: originalItems.reduce((sum, item) => sum + item.total_revenue, 0),
          total_gross_commission: totalGrossCommission,
          total_tax: totalTax,
          total_net_commission: totalNetCommission,
          clawback_count: clawbackCount,
          clawback_amount: clawbackAmount,
          final_payment: totalNetCommission - clawbackAmount,
        };
      }
      
      return calculateMonthlySettlementSummary(
        items,
        managerId,
        manager?.name || '알 수 없음',
        selectedMonth
      );
    });
  }, [items, users, selectedMonth, user]);

  const totals = useMemo(() => {
    // Point-in-time 정확성: 환수 항목이 아닌 원본 정산은 모두 포함 (status 관계없이)
    // 12월 정산을 볼 때 12월에 발생한 계약은 나중에 환수되더라도 양수로 표시
    const originalItems = items.filter(item => !item.is_clawback);
    const clawbackItems = items.filter(item => item.is_clawback);
    
    // 계약금 수당: 계약금 * 수당율 적용
    const contractAmount = originalItems.reduce((sum, item) => sum + (item.contract_amount * item.commission_rate / 100), 0);
    // 평균 계약금액: 수당율 적용 없이 원본 계약금의 평균 (고객 단위 계약금 평균)
    const rawContractAmount = originalItems.reduce((sum, item) => sum + item.contract_amount, 0);
    const avgContractAmount = originalItems.length > 0 ? rawContractAmount / originalItems.length : 0;
    const executedItems = originalItems.filter(item => item.execution_amount > 0);
    const executionCount = executedItems.length;
    const executionAmount = originalItems.reduce((sum, item) => sum + item.execution_amount, 0);
    const clawbackContractAmount = clawbackItems.reduce((sum, item) => sum + Math.abs(item.contract_amount), 0);
    
    // 평균 자문료율: 집행된 항목들의 fee_rate 평균 (계약정보 입력 모달에서 입력된 자문료율)
    const avgFeeRate = executedItems.length > 0 
      ? executedItems.reduce((sum, item) => sum + (item.fee_rate || 0), 0) / executedItems.length 
      : 0;
    
    // 해당월에 생성된 고객(DB) 수 계산
    const months = getMonthsForPeriod(selectedMonth);
    const monthlyDbCount = customers.filter(c => {
      if (!c.created_at) return false;
      const createdDate = c.created_at instanceof Date ? c.created_at : new Date(c.created_at);
      const createdMonth = format(createdDate, 'yyyy-MM');
      return months.includes(createdMonth);
    }).length;
    
    const summaryTotals = summaries.reduce(
      (acc, s) => ({
        contracts: acc.contracts + s.total_contracts,
        executionFee: acc.executionFee + s.total_execution_fee,
        grossCommission: acc.grossCommission + s.total_gross_commission,
        tax: acc.tax + s.total_tax,
        netCommission: acc.netCommission + s.total_net_commission,
        clawbackCount: acc.clawbackCount + s.clawback_count,
        clawbackAmount: acc.clawbackAmount + s.clawback_amount,
        finalPayment: acc.finalPayment + s.final_payment,
      }),
      {
        contracts: 0,
        executionFee: 0,
        grossCommission: 0,
        tax: 0,
        netCommission: 0,
        clawbackCount: 0,
        clawbackAmount: 0,
        finalPayment: 0,
      }
    );
    
    return {
      ...summaryTotals,
      contractAmount,
      avgContractAmount,
      executionCount,
      executionAmount,
      clawbackContractAmount,
      monthlyDbCount,
      avgFeeRate,
    };
  }, [summaries, items, customers, selectedMonth]);

  // Show loading skeleton while auth is still resolving
  if (authLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const handleMonthChange = (direction: 'prev' | 'next') => {
    if (isPeriodSummary(selectedMonth)) return;
    const current = parseISO(`${selectedMonth}-01`);
    const newDate = direction === 'prev'
      ? new Date(current.getFullYear(), current.getMonth() - 1, 1)
      : new Date(current.getFullYear(), current.getMonth() + 1, 1);
    setSelectedMonth(format(newDate, 'yyyy-MM'));
  };

  const handleShowDetail = (title: string, filterFn: (item: SettlementItem) => boolean) => {
    setDetailModalTitle(title);
    setDetailModalItems(items.filter(filterFn));
    setDetailModalOpen(true);
  };

  const handleExportToExcel = () => {
    if (detailModalItems.length === 0) return;

    type ExcelRow = {
      수당일자: string;
      유입경로: string;
      고유번호: string;
      고객명: string;
      수당구분: string;
      '계약금(만원)': number | string;
      '자문료율(%)': number | string;
      '집행금액(만원)': number | string;
      '자문료액(만원)': number | string;
      '세전수당(만원)': number;
      '실지급액(만원)': number;
    };
    const excelData: ExcelRow[] = [];

    detailModalItems.forEach((item) => {
      const customer = customers.find(c => c.id === item.customer_id);
      const customerName = customer?.name || item.customer_name;
      const advisoryFee = Math.round(item.execution_amount * (item.fee_rate || 0) / 100 * 100) / 100;
      const contractCommission = item.contract_amount * (item.commission_rate / 100);
      const advisoryCommission = advisoryFee * (item.commission_rate / 100);
      const contractNet = Math.round(contractCommission * 0.967 * 100) / 100;
      const advisoryNet = Math.round(advisoryCommission * 0.967 * 100) / 100;

      // 환수 항목 (별도 처리)
      if (item.is_clawback) {
        excelData.push({
          수당일자: item.clawback_applied_at || item.contract_date || '',
          유입경로: item.entry_source,
          고유번호: customer?.readable_id || '-',
          고객명: customerName,
          수당구분: '환수',
          '계약금(만원)': item.contract_amount,
          '자문료율(%)': '-',
          '집행금액(만원)': '-',
          '자문료액(만원)': '-',
          '세전수당(만원)': contractCommission,
          '실지급액(만원)': contractNet,
        });
      } else {
        // 계약금 행 (집행 완료 건 상세에서는 포함하지 않음)
        if (item.contract_amount > 0 && detailModalTitle !== '집행 완료 건') {
          excelData.push({
            수당일자: item.contract_date || '',
            유입경로: item.entry_source,
            고유번호: customer?.readable_id || '-',
            고객명: customerName,
            수당구분: '계약금',
            '계약금(만원)': item.contract_amount,
            '자문료율(%)': '-',
            '집행금액(만원)': '-',
            '자문료액(만원)': '-',
            '세전수당(만원)': contractCommission,
            '실지급액(만원)': contractNet,
          });
        }

        // 자문료 행 (계약 건수 상세에서는 포함하지 않음)
        if (item.execution_amount > 0 && detailModalTitle !== '전체 계약 건') {
          const advisoryDate = item.execution_date || item.contract_date || '';
          excelData.push({
            수당일자: advisoryDate,
            유입경로: item.entry_source,
            고유번호: customer?.readable_id || '-',
            고객명: customerName,
            수당구분: '자문료',
            '계약금(만원)': '-',
            '자문료율(%)': item.fee_rate || 0,
            '집행금액(만원)': item.execution_amount,
            '자문료액(만원)': advisoryFee,
            '세전수당(만원)': advisoryCommission,
            '실지급액(만원)': advisoryNet,
          });
        }
      }
    });

    // Sort by date descending
    excelData.sort((a, b) => b.수당일자.localeCompare(a.수당일자));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '정산내역');

    const fileName = `${detailModalTitle.replace(/\s/g, '_')}_${selectedMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: '엑셀 다운로드 완료',
      description: `${fileName} 파일이 다운로드되었습니다.`,
    });
  };

  const handleShowSalaryStatement = (summary: MonthlySettlementSummary) => {
    const periodMonths = getMonthsForPeriod(selectedMonth);
    const managerItems = items.filter(
      item => item.manager_id === summary.manager_id && 
              periodMonths.includes(item.settlement_month) &&
              !item.is_clawback
    );
    
    let totalContractPayment = 0;
    let totalConsultingFee = 0;
    
    managerItems.forEach(item => {
      totalContractPayment += item.contract_amount * (item.commission_rate / 100);
      const advisoryFee = item.execution_amount * (item.fee_rate || 0) / 100;
      totalConsultingFee += advisoryFee * (item.commission_rate / 100);
    });
    
    const [year, month] = selectedMonth.split('-');
    const salaryMonthStr = `${year}년 ${parseInt(month)}월`;
    const today = new Date();
    
    setSalaryData({
      employeeName: summary.manager_name,
      employeeId: summary.manager_id.slice(-8).toUpperCase(),
      salaryMonth: salaryMonthStr,
      contractPayment: Math.round(totalContractPayment * 10000),
      consultingFee: Math.round(totalConsultingFee * 10000),
      additionalPayments: [],
    });
    setSalaryModalOpen(true);
  };

  const handlePrintSalaryStatement = () => {
    window.print();
  };

  if (dataLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center bg-muted/50 rounded-lg border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMonthChange('prev')}
            disabled={isPrevMonthDisabled}
            className="rounded-l-lg rounded-r-none border-r"
            data-testid="button-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            className="px-6 py-2 min-w-[180px] text-center font-medium cursor-pointer select-none"
            onDoubleClick={() => setMonthPickerOpen(true)}
            data-testid="text-selected-month"
          >
            {getPeriodLabel(selectedMonth)} 정산
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMonthChange('next')}
            disabled={isNextMonthDisabled}
            className="rounded-r-lg rounded-l-none border-l"
            data-testid="button-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card
          className="cursor-pointer hover-elevate bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20"
          onClick={() => handleShowDetail('전체 계약 건', (item) => !item.is_clawback)}
          data-testid="card-total-contracts"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              총 계약금액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totals.contractAmount.toLocaleString()}만원</div>
            <p className="text-xs text-muted-foreground mt-1">
              평균 계약금액: {Math.round(totals.avgContractAmount).toLocaleString()}만원
            </p>
            <p className="text-xs text-muted-foreground">
              계약 건수: {totals.contracts}건
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover-elevate bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20"
          onClick={() => handleShowDetail('집행 완료 건', (item) => !item.is_clawback && item.execution_amount > 0)}
          data-testid="card-execution"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              총 자문금액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{(totals.executionFee || 0).toLocaleString()}만원</div>
            <p className="text-xs text-muted-foreground mt-1">
              평균 자문료율: {totals.avgFeeRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">
              총 집행금액: {totals.executionAmount.toLocaleString()}만원
            </p>
            <p className="text-xs text-muted-foreground">
              집행 건수: {totals.executionCount}건
            </p>
          </CardContent>
        </Card>

        <Card
          className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20"
          data-testid="card-gross-commission"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              세전수당 합계
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {totals.grossCommission.toLocaleString()}만원
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              평균 잠재금액: {totals.monthlyDbCount > 0 ? Math.round((totals.contractAmount + (totals.executionFee || 0)) / totals.monthlyDbCount).toLocaleString() : 0}만원
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover-elevate bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20"
          onClick={() => handleShowDetail('환수 항목', (item) => item.is_clawback)}
          data-testid="card-clawback"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              환수 금액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {totals.clawbackAmount > 0 ? `-${totals.clawbackAmount.toLocaleString()}` : '0'}만원
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                환수 건수: {totals.clawbackCount}건
              </p>
              <p className="text-xs text-muted-foreground">
                환수 계약금액: {totals.clawbackContractAmount.toLocaleString()}만원
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 ${isSuperAdmin ? 'cursor-pointer hover-elevate' : ''}`}
          onClick={() => isSuperAdmin && setSummaryModalOpen(true)}
          data-testid="card-final-payment"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              최종 지급액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {totals.finalPayment.toLocaleString()}만원
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              공제세액: {totals.tax.toLocaleString()}만원
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>직원별 정산 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>직원명</TableHead>
                  <TableHead className="text-right">계약 건수</TableHead>
                  <TableHead className="text-right">총 계약금</TableHead>
                  <TableHead className="text-right">집행건수</TableHead>
                  <TableHead className="text-right">집행금액</TableHead>
                  <TableHead className="text-right">총 자문금액</TableHead>
                  <TableHead className="text-right">환수</TableHead>
                  <TableHead className="text-right">최종지급액(세후)</TableHead>
                  <TableHead className="text-center">급여명세서</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      해당 월에 정산 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  summaries.map((summary) => (
                    <TableRow
                      key={summary.manager_id}
                      data-testid={`row-manager-${summary.manager_id}`}
                    >
                      <TableCell 
                        className="font-medium cursor-pointer hover:underline"
                        onDoubleClick={() => {
                          const periodMonths = getMonthsForPeriod(selectedMonth);
                          handleShowDetail(
                            `${summary.manager_name} 정산 내역`,
                            (item) => item.manager_id === summary.manager_id && periodMonths.includes(item.settlement_month)
                          );
                        }}
                        data-testid={`cell-manager-name-${summary.manager_id}`}
                      >
                        {summary.manager_name}
                      </TableCell>
                      <TableCell className="text-right">{summary.total_contracts}건</TableCell>
                      <TableCell className="text-right">{summary.total_contract_amount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{summary.execution_count}건</TableCell>
                      <TableCell className="text-right">{summary.total_execution_amount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{(summary.total_execution_fee || 0).toLocaleString()}만원</TableCell>
                      <TableCell className="text-right text-red-600">
                        {summary.clawback_count > 0 ? `-${summary.clawback_amount.toLocaleString()}만원` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-blue-600">
                        {summary.final_payment.toLocaleString()}만원
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShowSalaryStatement(summary)}
                          data-testid={`button-salary-${summary.manager_id}`}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          명세서
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-[95vw] max-h-[85vh]">
          <DialogHeader className="flex flex-row items-center justify-between gap-4">
            <DialogTitle>{detailModalTitle}</DialogTitle>
            {isSuperAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportToExcel}
                disabled={detailModalItems.length === 0}
                data-testid="button-export-excel"
              >
                <FileDown className="h-4 w-4 mr-2" />
                엑셀 다운로드
              </Button>
            )}
          </DialogHeader>
          <ScrollArea className="h-[70vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수당일자</TableHead>
                  <TableHead>유입경로</TableHead>
                  <TableHead>고유번호</TableHead>
                  <TableHead>고객명</TableHead>
                  <TableHead>수당구분</TableHead>
                  <TableHead className="text-right">계약금</TableHead>
                  <TableHead className="text-right">자문료율</TableHead>
                  <TableHead className="text-right">집행금액</TableHead>
                  <TableHead className="text-right">자문료액</TableHead>
                  <TableHead className="text-right">세전수당</TableHead>
                  <TableHead className="text-right">실지급액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailModalItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      정산 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  (() => {
                    // 모든 행을 먼저 생성하고 날짜순으로 정렬
                    type RowData = { date: string; element: JSX.Element };
                    const allRows: RowData[] = [];
                    
                    detailModalItems.forEach((item) => {
                      const customer = customers.find(c => c.id === item.customer_id);
                      const customerName = customer?.name || item.customer_name;
                      const advisoryFee = Math.round(item.execution_amount * (item.fee_rate || 0) / 100 * 100) / 100;
                      
                      const contractCommission = item.contract_amount * (item.commission_rate / 100);
                      const advisoryCommission = advisoryFee * (item.commission_rate / 100);
                      const contractNet = Math.round(contractCommission * 0.967 * 100) / 100;
                      const advisoryNet = Math.round(advisoryCommission * 0.967 * 100) / 100;
                      
                      // 환수 항목 (별도 처리 - 음수 값 표시)
                      if (item.is_clawback) {
                        allRows.push({
                          date: item.clawback_applied_at || item.contract_date || '',
                          element: (
                            <TableRow key={`${item.id}-clawback`} data-testid={`modal-row-settlement-${item.id}-clawback`}>
                              <TableCell>{item.clawback_applied_at || item.contract_date}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{item.entry_source}</Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm">{customer?.readable_id || '-'}</TableCell>
                              <TableCell className="font-medium">{customerName}</TableCell>
                              <TableCell>
                                <Badge className="bg-red-500 hover:bg-red-600 text-white border-none">환수</Badge>
                              </TableCell>
                              <TableCell className="text-right text-red-600">{item.contract_amount.toLocaleString()}만원</TableCell>
                              <TableCell className="text-right text-muted-foreground">-</TableCell>
                              <TableCell className="text-right text-muted-foreground">-</TableCell>
                              <TableCell className="text-right text-muted-foreground">-</TableCell>
                              <TableCell className="text-right text-red-600">
                                {contractCommission.toLocaleString()}만원
                              </TableCell>
                              <TableCell className="text-right text-red-600">
                                {contractNet.toLocaleString()}만원
                              </TableCell>
                            </TableRow>
                          )
                        });
                      } else {
                        // 계약금 행 (집행 완료 건 상세에서는 표시하지 않음)
                        if (item.contract_amount > 0 && detailModalTitle !== '집행 완료 건') {
                          allRows.push({
                            date: item.contract_date || '',
                            element: (
                              <TableRow key={`${item.id}-contract`} data-testid={`modal-row-settlement-${item.id}-contract`}>
                                <TableCell>{item.contract_date}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{item.entry_source}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{customer?.readable_id || '-'}</TableCell>
                                <TableCell className="font-medium">{customerName}</TableCell>
                                <TableCell>
                                  <Badge variant="default">계약금</Badge>
                                </TableCell>
                                <TableCell className="text-right">{item.contract_amount.toLocaleString()}만원</TableCell>
                                <TableCell className="text-right text-muted-foreground">-</TableCell>
                                <TableCell className="text-right text-muted-foreground">-</TableCell>
                                <TableCell className="text-right text-muted-foreground">-</TableCell>
                                <TableCell className="text-right">
                                  {contractCommission.toLocaleString()}만원
                                </TableCell>
                                <TableCell className="text-right">
                                  {contractNet.toLocaleString()}만원
                                </TableCell>
                              </TableRow>
                            )
                          });
                        }
                        
                        // 자문료 행 (계약 건수 상세에서는 표시하지 않음)
                        if (item.execution_amount > 0 && detailModalTitle !== '전체 계약 건') {
                          const advisoryDate = item.execution_date || item.contract_date || '';
                          allRows.push({
                            date: advisoryDate,
                            element: (
                              <TableRow key={`${item.id}-advisory`} data-testid={`modal-row-settlement-${item.id}-advisory`}>
                                <TableCell>{advisoryDate}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{item.entry_source}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{customer?.readable_id || '-'}</TableCell>
                                <TableCell className="font-medium">{customerName}</TableCell>
                                <TableCell>
                                  <Badge className="bg-lime-500 hover:bg-lime-600 text-white border-none">자문료</Badge>
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">-</TableCell>
                                <TableCell className="text-right">{item.fee_rate}%</TableCell>
                                <TableCell className="text-right">{item.execution_amount.toLocaleString()}만원</TableCell>
                                <TableCell className="text-right">{advisoryFee.toLocaleString()}만원</TableCell>
                                <TableCell className="text-right">
                                  {advisoryCommission.toLocaleString()}만원
                                </TableCell>
                                <TableCell className="text-right">
                                  {advisoryNet.toLocaleString()}만원
                                </TableCell>
                              </TableRow>
                            )
                          });
                        }
                      }
                    });
                    
                    // 수당일자 기준 내림차순 정렬 (최신순)
                    return allRows
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map(row => row.element);
                  })()
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog open={salaryModalOpen} onOpenChange={setSalaryModalOpen}>
        <DialogContent id="salary-print-dialog" className="max-w-[240mm] max-h-[90vh] overflow-auto">
          <DialogHeader className="flex flex-row items-center justify-between gap-4 print:hidden">
            <DialogTitle>급여명세서 - {salaryData?.employeeName}</DialogTitle>
            {isSuperAdmin && (
              <Button
                variant="default"
                size="sm"
                onClick={handlePrintSalaryStatement}
                data-testid="button-print-salary"
              >
                <FileDown className="h-4 w-4 mr-2" />
                PDF 저장
              </Button>
            )}
          </DialogHeader>
          <div id="salary-print-area" className="bg-[#E8E9EB] p-4 rounded-lg print:bg-white print:p-0">
            {salaryData && (
              <SalaryStatement
                companyName="경영지원그룹 이음"
                issueDate={format(new Date(), 'yyyy년 MM월 dd일')}
                paymentDate={format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5), 'yyyy년 MM월 dd일')}
                employeeName={salaryData.employeeName}
                employeeId={salaryData.employeeId}
                department="컨설팅부"
                position="프리랜서"
                salaryMonth={salaryData.salaryMonth}
                contractPayment={salaryData.contractPayment}
                consultingFee={salaryData.consultingFee}
                additionalPayments={salaryData.additionalPayments}
                incomeTaxRate={3.0}
                localTaxRate={0.3}
                approverName="대표"
                approverPosition="대표이사"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>기간 선택</DialogTitle>
            <DialogDescription>조회할 월 또는 기간을 선택하세요</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[350px]">
            <div className="space-y-1 p-1">
              {monthOptions.map(option => {
                const isSummary = isPeriodSummary(option);
                const label = getPeriodLabel(option);
                return (
                  <button
                    key={option}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      option === selectedMonth 
                        ? 'bg-primary text-primary-foreground' 
                        : isSummary
                          ? 'bg-muted/50 font-semibold hover-elevate'
                          : 'hover-elevate'
                    } ${isSummary ? 'border-l-2 border-primary/50 ml-2' : ''}`}
                    onClick={() => {
                      setSelectedMonth(option);
                      setMonthPickerOpen(false);
                    }}
                    data-testid={`button-select-month-${option}`}
                  >
                    {label}
                    {isSummary && (
                      <Badge variant="outline" className="ml-2 text-[10px] py-0">
                        {option.endsWith('-H1') ? '1~6월' : option.endsWith('-H2') ? '7~12월' : '1~12월'}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={summaryModalOpen} onOpenChange={setSummaryModalOpen}>
        <DialogContent className="max-w-[90vw] max-h-[85vh]" data-testid="dialog-all-employees-summary">
          <DialogHeader>
            <DialogTitle>{getPeriodLabel(selectedMonth)} 전체 직원 정산 현황</DialogTitle>
            <DialogDescription>모든 직원의 정산 요약 정보입니다.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[65vh]">
            <Table data-testid="table-all-employees-summary">
              <TableHeader>
                <TableRow>
                  <TableHead>직원명</TableHead>
                  <TableHead className="text-right">계약 건수</TableHead>
                  <TableHead className="text-right">총 계약금</TableHead>
                  <TableHead className="text-right">집행건수</TableHead>
                  <TableHead className="text-right">집행금액</TableHead>
                  <TableHead className="text-right">총 자문금액</TableHead>
                  <TableHead className="text-right">세전수당</TableHead>
                  <TableHead className="text-right">공제세액</TableHead>
                  <TableHead className="text-right">환수</TableHead>
                  <TableHead className="text-right font-bold">최종지급액(세후)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      해당 월에 정산 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {summaries.map((summary) => (
                      <TableRow
                        key={summary.manager_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          const periodMonths = getMonthsForPeriod(selectedMonth);
                          handleShowDetail(
                            `${summary.manager_name} 정산 내역`,
                            (item) => item.manager_id === summary.manager_id && periodMonths.includes(item.settlement_month)
                          );
                          setSummaryModalOpen(false);
                        }}
                        data-testid={`summary-row-manager-${summary.manager_id}`}
                      >
                        <TableCell className="font-medium">{summary.manager_name}</TableCell>
                        <TableCell className="text-right">{summary.total_contracts}건</TableCell>
                        <TableCell className="text-right">{summary.total_contract_amount.toLocaleString()}만원</TableCell>
                        <TableCell className="text-right">{summary.execution_count}건</TableCell>
                        <TableCell className="text-right">{summary.total_execution_amount.toLocaleString()}만원</TableCell>
                        <TableCell className="text-right">{(summary.total_execution_fee || 0).toLocaleString()}만원</TableCell>
                        <TableCell className="text-right">{summary.total_gross_commission.toLocaleString()}만원</TableCell>
                        <TableCell className="text-right">{summary.total_tax.toLocaleString()}만원</TableCell>
                        <TableCell className="text-right text-red-600">
                          {summary.clawback_count > 0 ? `-${summary.clawback_amount.toLocaleString()}만원` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-purple-600">
                          {summary.final_payment.toLocaleString()}만원
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold border-t-2">
                      <TableCell>합계</TableCell>
                      <TableCell className="text-right">{totals.contracts}건</TableCell>
                      <TableCell className="text-right">{totals.contractAmount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{totals.executionCount}건</TableCell>
                      <TableCell className="text-right">{totals.executionAmount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{(totals.executionFee || 0).toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{totals.grossCommission.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{totals.tax.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right text-red-600">
                        {totals.clawbackCount > 0 ? `-${totals.clawbackAmount.toLocaleString()}만원` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-purple-600">
                        {totals.finalPayment.toLocaleString()}만원
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
