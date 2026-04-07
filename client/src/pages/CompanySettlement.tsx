import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Target,
  PieChart,
  Plus,
  Trash2,
  Edit2,
  ShieldAlert,
  Building2,
  Megaphone,
  Settings,
  Receipt,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  FileText,
  Calculator,
  Wallet,
  Users,
  BarChart3,
  CalendarRange,
  Download,
  Search,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getExpensesByMonth,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummaryByMonth,
  getAdDbCountByMonth,
  getRevenueDataByMonth,
  getCumulativeTaxReserve,
  getCumulativeSummary,
  getSettlementItems,
  getCustomers,
} from '@/lib/firestore';
import type { Expense, ExpenseCategory, InsertExpense, SettlementItem, Customer } from '@shared/types';

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: typeof Megaphone }[] = [
  { value: '마케팅비', label: '마케팅비', icon: Megaphone },
  { value: '고정비', label: '고정비', icon: Building2 },
  { value: '운영비', label: '운영비', icon: Settings },
  { value: '기타', label: '기타', icon: Receipt },
];

const formatAmount = (amountInMan: number): string => {
  const won = Math.round(amountInMan * 10000);
  return `${won.toLocaleString()}원`;
};

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

const getMonthsBetweenDates = (startDate: string, endDate: string): string[] => {
  const months: string[] = [];
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
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

export default function CompanySettlement() {
  const { user, isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const [revenueData, setRevenueData] = useState({
    totalDeposits: 0,
    clawbackLoss: 0,
    grossRevenue: 0,
    employeeCommission: 0,
    contractCount: 0,
    executionCount: 0,
    totalContractAmount: 0,
    totalAdvisoryFee: 0,
  });
  const [expenseSummary, setExpenseSummary] = useState({
    marketing: 0,
    fixed: 0,
    operational: 0,
    other: 0,
    total: 0,
  });
  const [adDbCount, setAdDbCount] = useState(0);
  const [cumulativeTaxReserve, setCumulativeTaxReserve] = useState(0);
  const [cumulativeData, setCumulativeData] = useState({
    totalRevenue: 0,
    totalExpense: 0,
    totalEmployeeCommission: 0,
    netProfit: 0,
    netProfitRate: 0,
  });

  const [settlementItems, setSettlementItems] = useState<SettlementItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalTitle, setDetailModalTitle] = useState('');
  const [detailModalItems, setDetailModalItems] = useState<SettlementItem[]>([]);

  const [dateRangeMode, setDateRangeMode] = useState(false);
  const [dateRangeDialogOpen, setDateRangeDialogOpen] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [dateRangeLabel, setDateRangeLabel] = useState('');
  const [dateRangeLoading, setDateRangeLoading] = useState(false);

  const [formData, setFormData] = useState<InsertExpense>({
    category: '마케팅비',
    name: '',
    amount: 0,
    month: selectedMonth,
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    is_recurring: false,
  });

  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

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

  const handlePrevMonth = () => {
    if (isPeriodSummary(selectedMonth)) return;
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    setSelectedMonth(format(prevDate, 'yyyy-MM'));
  };

  const handleNextMonth = () => {
    if (isPeriodSummary(selectedMonth)) return;
    const [year, month] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const now = new Date();
    if (nextDate <= now) {
      setSelectedMonth(format(nextDate, 'yyyy-MM'));
    }
  };

  const isNextMonthDisabled = useMemo(() => {
    if (isPeriodSummary(selectedMonth)) return true;
    const [year, month] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const now = new Date();
    return nextDate > now;
  }, [selectedMonth]);

  const isPrevMonthDisabled = useMemo(() => {
    return isPeriodSummary(selectedMonth);
  }, [selectedMonth]);

  // 영업이익 = 총매출 - 직원수수료 - 마케팅비 - 고정비
  // (expenseSummary.total에는 마케팅비+고정비+운영비+기타가 모두 포함됨)
  const operatingProfit = useMemo(() => {
    const totalCosts = revenueData.employeeCommission + expenseSummary.total;
    return revenueData.grossRevenue - totalCosts;
  }, [revenueData, expenseSummary]);

  const taxReserve = useMemo(() => {
    return revenueData.grossRevenue * 0.15;
  }, [revenueData.grossRevenue]);

  const roas = useMemo(() => {
    if (expenseSummary.marketing === 0) return 0;
    return (revenueData.grossRevenue / expenseSummary.marketing) * 100;
  }, [revenueData.grossRevenue, expenseSummary.marketing]);

  const totalCost = revenueData.employeeCommission + expenseSummary.total;
  const roi = useMemo(() => {
    if (totalCost === 0) return 0;
    return (operatingProfit / totalCost) * 100;
  }, [operatingProfit, totalCost]);

  const fetchData = async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const months = getMonthsForPeriod(selectedMonth);
      const isSummary = isPeriodSummary(selectedMonth);
      
      const [allCustomers] = await Promise.all([getCustomers()]);
      setCustomers(allCustomers);

      if (isSummary) {
        const lastMonth = months[months.length - 1];
        
        const [results, cumTax, ...settlementResults] = await Promise.all([
          Promise.all(
            months.map(m => Promise.all([
              getRevenueDataByMonth(m),
              getExpenseSummaryByMonth(m),
              getAdDbCountByMonth(m),
            ]))
          ),
          getCumulativeTaxReserve(lastMonth),
          ...months.map(m => getSettlementItems(m)),
        ]);
        
        const aggregatedRevenue = {
          totalDeposits: 0,
          clawbackLoss: 0,
          grossRevenue: 0,
          employeeCommission: 0,
          contractCount: 0,
          executionCount: 0,
          totalContractAmount: 0,
          totalAdvisoryFee: 0,
        };
        const aggregatedExpense = {
          marketing: 0,
          fixed: 0,
          operational: 0,
          other: 0,
          total: 0,
        };
        let totalAdDb = 0;
        
        results.forEach(([revenue, expense, dbCount]) => {
          aggregatedRevenue.totalDeposits += revenue.totalDeposits;
          aggregatedRevenue.clawbackLoss += revenue.clawbackLoss;
          aggregatedRevenue.grossRevenue += revenue.grossRevenue;
          aggregatedRevenue.employeeCommission += revenue.employeeCommission;
          aggregatedRevenue.contractCount += revenue.contractCount;
          aggregatedRevenue.executionCount += revenue.executionCount;
          aggregatedRevenue.totalContractAmount += revenue.totalContractAmount;
          aggregatedRevenue.totalAdvisoryFee += revenue.totalAdvisoryFee;
          
          aggregatedExpense.marketing += expense.marketing;
          aggregatedExpense.fixed += expense.fixed;
          aggregatedExpense.operational += expense.operational;
          aggregatedExpense.other += expense.other;
          aggregatedExpense.total += expense.total;
          
          totalAdDb += dbCount;
        });
        
        const allExpenses = await Promise.all(months.map(m => getExpensesByMonth(m)));
        const mergedExpenses: Expense[] = [];
        const seenIds = new Set<string>();
        allExpenses.flat().forEach(exp => {
          if (!seenIds.has(exp.id)) {
            seenIds.add(exp.id);
            mergedExpenses.push(exp);
          }
        });

        const mergedSettlements = (settlementResults as SettlementItem[][]).flat();
        setSettlementItems(mergedSettlements);

        setExpenses(mergedExpenses);
        setRevenueData(aggregatedRevenue);
        setExpenseSummary(aggregatedExpense);
        setAdDbCount(totalAdDb);
        setCumulativeTaxReserve(cumTax);
      } else {
        const [expensesData, revenue, summary, dbCount, cumTaxReserve, settlements] = await Promise.all([
          getExpensesByMonth(selectedMonth),
          getRevenueDataByMonth(selectedMonth),
          getExpenseSummaryByMonth(selectedMonth),
          getAdDbCountByMonth(selectedMonth),
          getCumulativeTaxReserve(selectedMonth),
          getSettlementItems(selectedMonth),
        ]);

        setExpenses(expensesData);
        setRevenueData(revenue);
        setExpenseSummary(summary);
        setAdDbCount(dbCount);
        setCumulativeTaxReserve(cumTaxReserve);
        setSettlementItems(settlements);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: '오류',
        description: '데이터 로딩 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCumulativeData = async () => {
    try {
      const cumData = await getCumulativeSummary();
      setCumulativeData(cumData);
    } catch (error) {
      console.error('Error fetching cumulative data:', error);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchData();
      fetchCumulativeData();
    } else {
      setLoading(false);
    }
  }, [selectedMonth, isSuperAdmin]);

  const handleShowDetail = (title: string, filterFn: (item: SettlementItem) => boolean) => {
    setDetailModalTitle(title);
    setDetailModalItems(settlementItems.filter(filterFn));
    setDetailModalOpen(true);
  };

  const handleOpenExpenseDialog = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData({
        category: expense.category,
        name: expense.name,
        amount: expense.amount,
        month: expense.month,
        expense_date: expense.expense_date || '',
        description: expense.description || '',
        is_recurring: expense.is_recurring,
      });
    } else {
      setEditingExpense(null);
      setFormData({
        category: '마케팅비',
        name: '',
        amount: 0,
        month: selectedMonth,
        expense_date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        is_recurring: false,
      });
    }
    setExpenseDialogOpen(true);
  };

  const handleSaveExpense = async () => {
    if (!formData.name || formData.amount <= 0) {
      toast({
        title: '입력 오류',
        description: '항목명과 금액을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, formData);
        toast({ title: '성공', description: '비용 항목이 수정되었습니다.' });
      } else {
        await createExpense({ ...formData, created_by: user?.uid });
        toast({ title: '성공', description: '비용 항목이 추가되었습니다.' });
      }
      setExpenseDialogOpen(false);
      fetchData();
      fetchCumulativeData();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast({
        title: '오류',
        description: '저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;

    try {
      await deleteExpense(expenseToDelete.id);
      toast({ title: '성공', description: '비용 항목이 삭제되었습니다.' });
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
      fetchData();
      fetchCumulativeData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast({
        title: '오류',
        description: '삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDateRangeQuery = async () => {
    if (!dateRangeStart || !dateRangeEnd) {
      toast({ title: '입력 오류', description: '시작일과 종료일을 모두 입력해주세요.', variant: 'destructive' });
      return;
    }
    if (dateRangeStart > dateRangeEnd) {
      toast({ title: '입력 오류', description: '시작일이 종료일보다 늦을 수 없습니다.', variant: 'destructive' });
      return;
    }

    setDateRangeLoading(true);
    setDateRangeDialogOpen(false);
    setDateRangeMode(true);
    setLoading(true);

    const startMonth = dateRangeStart.substring(0, 7);
    const endMonth = dateRangeEnd.substring(0, 7);
    const months = getMonthsBetweenDates(startMonth, endMonth);
    setDateRangeLabel(`${dateRangeStart} ~ ${dateRangeEnd}`);

    try {
      const results = await Promise.all(
        months.map(m => Promise.all([
          getRevenueDataByMonth(m),
          getExpenseSummaryByMonth(m),
          getAdDbCountByMonth(m),
        ]))
      );

      const aggregatedRevenue = {
        totalDeposits: 0, clawbackLoss: 0, grossRevenue: 0, employeeCommission: 0,
        contractCount: 0, executionCount: 0, totalContractAmount: 0, totalAdvisoryFee: 0,
      };
      const aggregatedExpense = { marketing: 0, fixed: 0, operational: 0, other: 0, total: 0 };
      let totalAdDb = 0;

      results.forEach(([revenue, expense, dbCount]) => {
        aggregatedRevenue.totalDeposits += revenue.totalDeposits;
        aggregatedRevenue.clawbackLoss += revenue.clawbackLoss;
        aggregatedRevenue.grossRevenue += revenue.grossRevenue;
        aggregatedRevenue.employeeCommission += revenue.employeeCommission;
        aggregatedRevenue.contractCount += revenue.contractCount;
        aggregatedRevenue.executionCount += revenue.executionCount;
        aggregatedRevenue.totalContractAmount += revenue.totalContractAmount;
        aggregatedRevenue.totalAdvisoryFee += revenue.totalAdvisoryFee;
        aggregatedExpense.marketing += expense.marketing;
        aggregatedExpense.fixed += expense.fixed;
        aggregatedExpense.operational += expense.operational;
        aggregatedExpense.other += expense.other;
        aggregatedExpense.total += expense.total;
        totalAdDb += dbCount;
      });

      const allExpenses = await Promise.all(months.map(m => getExpensesByMonth(m)));
      const mergedExpenses: Expense[] = [];
      const seenIds = new Set<string>();
      allExpenses.flat().forEach(exp => {
        if (!seenIds.has(exp.id)) {
          seenIds.add(exp.id);
          mergedExpenses.push(exp);
        }
      });

      setExpenses(mergedExpenses);
      setRevenueData(aggregatedRevenue);
      setExpenseSummary(aggregatedExpense);
      setAdDbCount(totalAdDb);
    } catch (error) {
      console.error('Error fetching date range data:', error);
      toast({ title: '오류', description: '기간 데이터 로딩 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
      setDateRangeLoading(false);
    }
  };

  const handleExitDateRange = () => {
    setDateRangeMode(false);
    setDateRangeLabel('');
    setDateRangeStart('');
    setDateRangeEnd('');
    fetchData();
    fetchCumulativeData();
  };

  const handleExportExcel = useCallback(() => {
    const toWon = (manVal: number) => Math.round(manVal * 10000);
    const periodLabel = dateRangeMode ? dateRangeLabel : getPeriodLabel(selectedMonth);

    const summaryData: (string | number)[][] = [
      ['항목', '금액 (원)'],
      ['조회 기간', periodLabel],
      ['', ''],
      ['[ 매출 상세 ]', ''],
      ['총 입금액', toWon(revenueData.totalDeposits)],
      ['환수 손실', -toWon(revenueData.clawbackLoss)],
      ['총매출', toWon(revenueData.grossRevenue)],
      ['총 계약금', toWon(revenueData.totalContractAmount)],
      ['총 자문료', toWon(Math.round(revenueData.totalAdvisoryFee))],
      ['직원 수수료', -toWon(revenueData.employeeCommission)],
      ['', ''],
      ['[ 비용 요약 ]', ''],
      ['마케팅비 소계', toWon(expenseSummary.marketing)],
      ['고정비 소계', toWon(expenseSummary.fixed)],
      ['운영비 소계', toWon(expenseSummary.operational)],
      ['기타 비용 소계', toWon(expenseSummary.other)],
      ['총 비용', toWon(expenseSummary.total)],
      ['', ''],
      ['[ 손익 ]', ''],
      ['영업이익', toWon(operatingProfit)],
      ['영업이익률', `${revenueData.grossRevenue > 0 ? ((operatingProfit / revenueData.grossRevenue) * 100).toFixed(1) : '0.0'}%`],
      ['', ''],
      ['[ 지표 ]', ''],
      ['계약 건수', revenueData.contractCount],
      ['집행 건수', revenueData.executionCount],
      ['광고 효율성 (ROAS)', `${roas.toFixed(0)}%`],
      ['투자수익률 (ROI)', `${roi.toFixed(1)}%`],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    ws['!cols'] = [{ wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, '정산 요약');

    const categories: { key: ExpenseCategory; label: string }[] = [
      { key: '마케팅비', label: '마케팅비' },
      { key: '고정비', label: '고정비' },
      { key: '운영비', label: '운영비' },
      { key: '기타', label: '기타' },
    ];

    const expenseDetailRows: (string | number)[][] = [
      ['카테고리', '항목명', '금액 (원)', '설명', '반복 여부', '등록 월'],
    ];

    categories.forEach(cat => {
      const items = expenses.filter(e => e.category === cat.key);
      const subtotal = items.reduce((sum, e) => sum + e.amount, 0);

      expenseDetailRows.push([`[ ${cat.label} ]`, '', '', '', '', '']);

      if (items.length === 0) {
        expenseDetailRows.push(['', '(항목 없음)', 0, '', '', '']);
      } else {
        items.forEach(e => {
          expenseDetailRows.push([
            '',
            e.name,
            e.amount,
            e.description || '',
            e.is_recurring ? 'Y' : 'N',
            e.month || '',
          ]);
        });
      }
      expenseDetailRows.push([`${cat.label} 소계`, '', subtotal, '', '', '']);
      expenseDetailRows.push(['', '', '', '', '', '']);
    });

    const totalExpenseWon = expenses.reduce((sum, e) => sum + e.amount, 0);
    expenseDetailRows.push(['총 비용 합계', '', totalExpenseWon, '', '', '']);

    const wsExpense = XLSX.utils.aoa_to_sheet(expenseDetailRows);
    wsExpense['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsExpense, '비용 상세');

    const fileName = dateRangeMode
      ? `회사정산_${dateRangeStart}_${dateRangeEnd}.xlsx`
      : `회사정산_${selectedMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({ title: '내보내기 완료', description: `${fileName} 파일이 다운로드되었습니다.` });
  }, [revenueData, expenseSummary, operatingProfit, roas, roi, expenses, selectedMonth, dateRangeMode, dateRangeLabel, dateRangeStart, dateRangeEnd]);

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <ShieldAlert className="w-16 h-16 text-destructive" />
            <h2 className="text-xl font-bold text-destructive">접근 권한 없음</h2>
            <p className="text-muted-foreground text-center">
              이 페이지는 총관리자(Super Admin)만 접근할 수 있습니다.
            </p>
            <Badge variant="destructive" className="text-sm">
              403 Forbidden
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">회사 정산 관리</h1>
          <p className="text-muted-foreground">실시간 매출 및 지출 통합 대시보드</p>
        </div>
        <div className="flex items-center gap-2">
          {dateRangeMode ? (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2">
              <CalendarRange className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">{dateRangeLabel}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-1"
                onClick={handleExitDateRange}
                data-testid="button-exit-date-range"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center bg-muted/50 rounded-lg border">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevMonth}
                disabled={isPrevMonthDisabled}
                className="rounded-l-lg rounded-r-none border-r"
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <button
                className="px-6 py-2 min-w-[180px] text-center font-medium cursor-pointer select-none"
                onDoubleClick={() => setMonthPickerOpen(true)}
                data-testid="button-month-display"
              >
                {getPeriodLabel(selectedMonth)} 정산
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextMonth}
                disabled={isNextMonthDisabled}
                className="rounded-r-lg rounded-l-none border-l"
                data-testid="button-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDateRangeDialogOpen(true)}
            data-testid="button-open-date-range"
          >
            <CalendarRange className="w-4 h-4 mr-1" />
            기간 조회
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={loading}
            data-testid="button-export-excel"
          >
            <Download className="w-4 h-4 mr-1" />
            엑셀 내보내기
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card
              className="cursor-pointer hover-elevate bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20"
              onClick={() => handleShowDetail('총매출 상세', (item) => !item.is_clawback)}
              data-testid="card-gross-revenue"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  총매출
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatAmount(revenueData.grossRevenue)}
                </div>
                {revenueData.clawbackLoss > 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    환수 손실: -{formatAmount(revenueData.clawbackLoss)}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover-elevate bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border-indigo-500/20"
              onClick={() => handleShowDetail('총 계약금 상세', (item) => !item.is_clawback && (item.contract_amount || 0) > 0)}
              data-testid="card-total-contract-amount"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  총 계약금
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatAmount(revenueData.totalContractAmount)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {revenueData.contractCount}건 계약
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover-elevate bg-gradient-to-br from-teal-500/10 to-teal-600/5 border-teal-500/20"
              onClick={() => handleShowDetail('총 자문료 상세', (item) => !item.is_clawback && (item.execution_amount || 0) > 0)}
              data-testid="card-total-advisory-fee"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  총 자문료
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                  {formatAmount(Math.round(revenueData.totalAdvisoryFee))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {revenueData.executionCount}건 집행
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  영업이익
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${operatingProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {operatingProfit < 0 ? '-' : ''}{formatAmount(Math.abs(operatingProfit))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  영업이익률: {revenueData.grossRevenue > 0 ? ((operatingProfit / revenueData.grossRevenue) * 100).toFixed(1) : '0.0'}%
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  광고 효율성 (ROAS)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px]">
                      <div className="space-y-1.5 text-xs">
                        <p className="font-semibold">계산식</p>
                        <p>ROAS = (총매출 ÷ 광고비) × 100</p>
                        <p className="text-muted-foreground mt-2">
                          • 총매출: 해당 월 총 수익
                        </p>
                        <p className="text-muted-foreground">
                          • 광고비: 비용관리에서 '마케팅비' 카테고리 합계
                        </p>
                        <p className="text-muted-foreground mt-1">
                          💡 ROAS 500% = 광고비 1원당 매출 5원
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {roas.toFixed(0)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  매출: {formatAmount(revenueData.grossRevenue)} / 광고비: {formatAmount(expenseSummary.marketing)}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  투자수익률 (ROI)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px]">
                      <div className="space-y-1.5 text-xs">
                        <p className="font-semibold">계산식</p>
                        <p>ROI = (영업이익 ÷ 총비용) × 100</p>
                        <p className="text-muted-foreground mt-2">
                          • 영업이익: 총매출 - 직원수수료 - 비용합계
                        </p>
                        <p className="text-muted-foreground">
                          • 총비용: 직원수수료 + 마케팅비 + 고정비 + 운영비 + 기타
                        </p>
                        <p className="text-muted-foreground mt-1">
                          💡 ROI 100% = 투자비 대비 동일 수익
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${roi >= 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-red-600 dark:text-red-400'}`}>
                  {roi.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  총비용: {formatAmount(totalCost)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>매출 상세</CardTitle>
                  <CardDescription>월별 매출 및 비용 내역</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">총 입금액</span>
                    <span className="font-semibold">{formatAmount(revenueData.totalDeposits)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">환수 손실</span>
                    <span className="font-semibold text-red-500">-{formatAmount(revenueData.clawbackLoss)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b bg-blue-500/5 px-2 rounded">
                    <span className="font-medium">총매출</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{formatAmount(revenueData.grossRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">직원 수수료</span>
                    <span className="font-semibold text-orange-500">-{formatAmount(revenueData.employeeCommission)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">마케팅비</span>
                    <span className="font-semibold text-orange-500">-{formatAmount(expenseSummary.marketing)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">고정비</span>
                    <span className="font-semibold text-orange-500">-{formatAmount(expenseSummary.fixed)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">운영비 + 기타</span>
                    <span className="font-semibold text-orange-500">-{formatAmount(expenseSummary.operational + expenseSummary.other)}</span>
                  </div>
                  <div className={`flex justify-between items-center py-2 px-2 rounded ${operatingProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <span className="font-medium">영업이익</span>
                    <span className={`font-bold ${operatingProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {operatingProfit < 0 ? '-' : ''}{formatAmount(Math.abs(operatingProfit))}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">계약 건수</span>
                    <Badge variant="secondary">{revenueData.contractCount}건</Badge>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">집행 건수</span>
                    <Badge variant="secondary">{revenueData.executionCount}건</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>비용 {isPeriodSummary(selectedMonth) ? '요약' : '관리'}</CardTitle>
                  <CardDescription>
                    {isPeriodSummary(selectedMonth) 
                      ? `${getPeriodLabel(selectedMonth)} 비용 합계`
                      : '마케팅비, 운영비, 고정비 관리'
                    }
                  </CardDescription>
                </div>
                {!isPeriodSummary(selectedMonth) && (
                  <Button onClick={() => handleOpenExpenseDialog()} size="sm" data-testid="button-add-expense">
                    <Plus className="w-4 h-4 mr-1" />
                    항목 추가
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[350px]">
                  {expenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Receipt className="w-12 h-12 mb-4 opacity-50" />
                      <p>등록된 비용 항목이 없습니다.</p>
                      {!isPeriodSummary(selectedMonth) && !dateRangeMode && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-4"
                          onClick={() => handleOpenExpenseDialog()}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          첫 항목 추가
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">카테고리</TableHead>
                          <TableHead className="whitespace-nowrap">항목명</TableHead>
                          <TableHead className="whitespace-nowrap hidden md:table-cell">발생일</TableHead>
                          <TableHead className="text-right whitespace-nowrap">금액</TableHead>
                          {!isPeriodSummary(selectedMonth) && !dateRangeMode && (
                            <TableHead className="w-[80px]"></TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map(expense => {
                          const CategoryIcon = EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.icon || Receipt;
                          const isFromPreviousMonth = expense.is_recurring && expense.month !== selectedMonth;
                          return (
                            <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`} className={isFromPreviousMonth ? 'opacity-75' : ''}>
                              <TableCell>
                                <Badge variant="outline" className="gap-1">
                                  <CategoryIcon className="w-3 h-3" />
                                  {expense.category}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{expense.name}</span>
                                  {expense.description && (
                                    <span className="text-xs text-muted-foreground">{expense.description}</span>
                                  )}
                                  {expense.is_recurring && (
                                    <div className="flex gap-1 mt-1">
                                      <Badge variant="secondary" className="text-[10px] w-fit">반복</Badge>
                                      {isFromPreviousMonth && (
                                        <Badge variant="outline" className="text-[10px] w-fit text-muted-foreground">
                                          {expense.month}~
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
                                {expense.expense_date || '-'}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {expense.amount.toLocaleString()}원
                              </TableCell>
                              {!isPeriodSummary(selectedMonth) && !dateRangeMode && (
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => handleOpenExpenseDialog(expense)}
                                      data-testid={`button-edit-expense-${expense.id}`}
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setExpenseToDelete(expense);
                                        setDeleteDialogOpen(true);
                                      }}
                                      data-testid={`button-delete-expense-${expense.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                  )}
                </ScrollArea>

                <div className="mt-4 pt-4 border-t space-y-2">
                  {EXPENSE_CATEGORIES.map(cat => {
                    const amount = cat.value === '마케팅비' ? expenseSummary.marketing
                      : cat.value === '고정비' ? expenseSummary.fixed
                      : cat.value === '운영비' ? expenseSummary.operational
                      : expenseSummary.other;
                    const Icon = cat.icon;
                    return (
                      <div key={cat.value} className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Icon className="w-4 h-4" />
                          {cat.label}
                        </span>
                        <span className="font-semibold">{formatAmount(amount)}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between items-center pt-2 border-t font-medium">
                    <span>총 비용</span>
                    <span className="text-orange-600 dark:text-orange-400">{formatAmount(expenseSummary.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {!dateRangeMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  누적 매출
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-cumulative-revenue">
                  {formatAmount(cumulativeData.totalRevenue)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">전체 기간 총매출</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  누적 지출
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-cumulative-expense">
                  {formatAmount(cumulativeData.totalExpense)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">마케팅+고정+운영+기타</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  누적 직원 급여
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-cumulative-commission">
                  {formatAmount(cumulativeData.totalEmployeeCommission)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">직원 수수료 합계</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  누적 순이익
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${cumulativeData.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-cumulative-net-profit">
                  {cumulativeData.netProfit < 0 ? '-' : ''}{formatAmount(Math.abs(cumulativeData.netProfit))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">매출 - 급여 - 지출</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  누적 순이익률
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${cumulativeData.netProfitRate >= 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-cumulative-net-profit-rate">
                  {cumulativeData.netProfitRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">순이익 / 매출 × 100</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <PieChart className="w-4 h-4" />
                  세금 예비비 (15%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {formatAmount(taxReserve)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  누적: {formatAmount(cumulativeTaxReserve)}
                </p>
              </CardContent>
            </Card>
          </div>
          )}
          </>
      )}

      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] md:max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg">{detailModalTitle}</DialogTitle>
            <DialogDescription>
              {detailModalItems.length}건의 정산 항목
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[70vh]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">정산월</TableHead>
                    <TableHead className="whitespace-nowrap">담당자</TableHead>
                    <TableHead className="whitespace-nowrap">유입경로</TableHead>
                    <TableHead className="whitespace-nowrap">고객명</TableHead>
                    <TableHead className="text-right whitespace-nowrap">계약금</TableHead>
                    <TableHead className="text-right whitespace-nowrap">자문료율</TableHead>
                    <TableHead className="text-right whitespace-nowrap">집행금액</TableHead>
                    <TableHead className="text-right whitespace-nowrap">자문료액</TableHead>
                    <TableHead className="text-right whitespace-nowrap">총매출</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailModalItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        해당하는 정산 데이터가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {detailModalItems
                        .sort((a, b) => (a.settlement_month || '').localeCompare(b.settlement_month || '') || (a.contract_date || '').localeCompare(b.contract_date || ''))
                        .map((item) => {
                          const customer = customers.find(c => c.id === item.customer_id);
                          const contractWon = Math.round((item.contract_amount || 0) * 10000);
                          const execWon = Math.round((item.execution_amount || 0) * 10000);
                          const advisoryFee = Math.round(execWon * ((item.fee_rate || 0) / 100));
                          const totalRevWon = Math.round((item.total_revenue || 0) * 10000);
                          return (
                            <TableRow key={item.id} data-testid={`row-detail-${item.id}`}>
                              <TableCell className="whitespace-nowrap">{item.settlement_month}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.manager_name || '-'}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{item.entry_source || '-'}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">{customer?.name || item.customer_name || '-'}</TableCell>
                              <TableCell className="text-right tabular-nums">{contractWon > 0 ? `${contractWon.toLocaleString()}원` : '-'}</TableCell>
                              <TableCell className="text-right tabular-nums">{(item.fee_rate || 0) > 0 ? `${item.fee_rate}%` : '-'}</TableCell>
                              <TableCell className="text-right tabular-nums">{execWon > 0 ? `${execWon.toLocaleString()}원` : '-'}</TableCell>
                              <TableCell className="text-right tabular-nums">{advisoryFee > 0 ? `${advisoryFee.toLocaleString()}원` : '-'}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{totalRevWon > 0 ? `${totalRevWon.toLocaleString()}원` : '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={4} className="text-right">합계</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(detailModalItems.reduce((s, i) => s + (i.contract_amount || 0), 0) * 10000).toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-right">-</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(detailModalItems.reduce((s, i) => s + (i.execution_amount || 0), 0) * 10000).toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(detailModalItems.reduce((s, i) => {
                            const execWon = (i.execution_amount || 0) * 10000;
                            return s + execWon * ((i.fee_rate || 0) / 100);
                          }, 0)).toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(detailModalItems.reduce((s, i) => s + (i.total_revenue || 0), 0) * 10000).toLocaleString()}원
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingExpense ? '비용 항목 수정' : '비용 항목 추가'}</DialogTitle>
            <DialogDescription>
              {editingExpense ? '비용 항목을 수정합니다.' : '새로운 비용 항목을 추가합니다.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select
                value={formData.category}
                onValueChange={(value: ExpenseCategory) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger data-testid="select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>항목명</Label>
              <Input
                placeholder="예: 네이버 광고, 임대료"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-expense-name"
              />
            </div>
            <div className="space-y-2">
              <Label>금액 (원)</Label>
              <Input
                type="number"
                placeholder="0"
                value={formData.amount || ''}
                onChange={e => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
                data-testid="input-expense-amount"
              />
            </div>
            <div className="space-y-2">
              <Label>비용 발생일</Label>
              <Input
                type="date"
                value={formData.expense_date || ''}
                onChange={e => setFormData({ ...formData, expense_date: e.target.value })}
                data-testid="input-expense-date"
              />
            </div>
            <div className="space-y-2">
              <Label>설명 (선택)</Label>
              <Input
                placeholder="추가 설명"
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-expense-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_recurring"
                checked={formData.is_recurring}
                onChange={e => setFormData({ ...formData, is_recurring: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="is_recurring" className="cursor-pointer">매월 반복 비용</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveExpense} data-testid="button-save-expense">
              {editingExpense ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>비용 항목 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{expenseToDelete?.name}" 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <Dialog open={dateRangeDialogOpen} onOpenChange={setDateRangeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>기간별 조회</DialogTitle>
            <DialogDescription>조회할 시작일과 종료일을 선택하세요</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>시작일</Label>
              <Input
                type="date"
                value={dateRangeStart}
                onChange={e => setDateRangeStart(e.target.value)}
                max={format(new Date(), 'yyyy-MM-dd')}
                data-testid="input-date-range-start"
              />
            </div>
            <div className="space-y-2">
              <Label>종료일</Label>
              <Input
                type="date"
                value={dateRangeEnd}
                onChange={e => setDateRangeEnd(e.target.value)}
                max={format(new Date(), 'yyyy-MM-dd')}
                data-testid="input-date-range-end"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateRangeDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleDateRangeQuery} disabled={dateRangeLoading} data-testid="button-query-date-range">
              <Search className="w-4 h-4 mr-1" />
              {dateRangeLoading ? '조회 중...' : '조회'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
