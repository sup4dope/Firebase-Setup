import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useLocation } from 'wouter';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  getSettlementItems,
  getUsers,
  getCustomers,
  calculateMonthlySettlementSummary,
  cancelSettlementWithClawback,
  createSettlementItem,
  calculateSettlement,
  getCommissionRate,
  syncCustomerSettlements,
} from '@/lib/firestore';
import type {
  SettlementItem,
  MonthlySettlementSummary,
  User,
  Customer,
  EntrySourceType,
  InsertSettlementItem,
} from '@shared/types';

const ENTRY_SOURCES: EntrySourceType[] = ['광고', '고객소개', '승인복제', '외주', '기타'];

export default function Settlements() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [dataLoading, setDataLoading] = useState(true);
  const [items, setItems] = useState<SettlementItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalTitle, setDetailModalTitle] = useState('');
  const [detailModalItems, setDetailModalItems] = useState<SettlementItem[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const [newItem, setNewItem] = useState({
    customer_id: '',
    entry_source: '광고' as EntrySourceType,
    contract_amount: 0,
    execution_amount: 0,
    fee_rate: 3,
    contract_date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      toast({
        title: '접근 권한 없음',
        description: '이 페이지는 관리자만 접근할 수 있습니다.',
        variant: 'destructive',
      });
      setLocation('/');
    }
  }, [isSuperAdmin, authLoading, setLocation, toast]);

  const fetchData = async () => {
    if (!isSuperAdmin || authLoading) return;
    setDataLoading(true);
    try {
      // 먼저 사용자 목록 가져오기 (동기화에 필요)
      const fetchedUsers = await getUsers();
      setUsers(fetchedUsers);
      
      // 고객 데이터에서 계약/집행 상태인 항목 자동 동기화
      await syncCustomerSettlements(selectedMonth, fetchedUsers);
      
      // 동기화 후 정산 항목 및 고객 목록 가져오기
      const [fetchedItems, fetchedCustomers] = await Promise.all([
        getSettlementItems(selectedMonth),
        getCustomers(),
      ]);
      setItems(fetchedItems);
      setCustomers(fetchedCustomers);
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
    if (isSuperAdmin && !authLoading) {
      fetchData();
    }
  }, [selectedMonth, isSuperAdmin, authLoading]);

  const summaries = useMemo(() => {
    if (!isSuperAdmin) return [];
    const managerIds = Array.from(new Set(items.map(item => item.manager_id)));
    return managerIds.map(managerId => {
      const manager = users.find(u => u.uid === managerId);
      return calculateMonthlySettlementSummary(
        items,
        managerId,
        manager?.name || '알 수 없음',
        selectedMonth
      );
    });
  }, [items, users, selectedMonth, isSuperAdmin]);

  const totals = useMemo(() => {
    // Calculate item-level totals for contract/execution amounts
    const normalItems = items.filter(item => item.status === '정상' && !item.is_clawback);
    const clawbackItems = items.filter(item => item.is_clawback);
    
    const contractAmount = normalItems.reduce((sum, item) => sum + item.contract_amount, 0);
    const executionCount = normalItems.filter(item => item.execution_amount > 0).length;
    const executionAmount = normalItems.reduce((sum, item) => sum + item.execution_amount, 0);
    const clawbackContractAmount = clawbackItems.reduce((sum, item) => sum + Math.abs(item.contract_amount), 0);
    
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
      executionCount,
      executionAmount,
      clawbackContractAmount,
    };
  }, [summaries, items]);

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

  // Only check authorization after auth loading is complete
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">접근 권한 없음</h1>
        <p className="text-muted-foreground">이 페이지는 관리자만 접근할 수 있습니다.</p>
      </div>
    );
  }

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const current = parseISO(`${selectedMonth}-01`);
    const newDate = direction === 'prev'
      ? new Date(current.getFullYear(), current.getMonth() - 1, 1)
      : new Date(current.getFullYear(), current.getMonth() + 1, 1);
    setSelectedMonth(format(newDate, 'yyyy-MM'));
  };

  const handleCancelItem = async (item: SettlementItem) => {
    if (item.status !== '정상') {
      toast({
        title: '알림',
        description: '이미 취소되었거나 환수된 항목입니다.',
      });
      return;
    }

    try {
      const clawback = await cancelSettlementWithClawback(item, selectedMonth);
      if (clawback) {
        toast({
          title: '환수 처리 완료',
          description: `과거 정산 건이 취소되어 이번 달에 ${Math.abs(clawback.net_commission).toLocaleString()}만원 환수 항목이 생성되었습니다.`,
        });
      } else {
        toast({
          title: '취소 완료',
          description: '당월 정산 건이 취소되었습니다.',
        });
      }
      fetchData();
    } catch (error) {
      console.error('Error canceling item:', error);
      toast({
        title: '오류',
        description: '취소 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleShowDetail = (title: string, filterFn: (item: SettlementItem) => boolean) => {
    setDetailModalTitle(title);
    setDetailModalItems(items.filter(filterFn));
    setDetailModalOpen(true);
  };

  const handleAddSettlement = async () => {
    if (!newItem.customer_id) {
      toast({
        title: '알림',
        description: '고객을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const customer = customers.find(c => c.id === newItem.customer_id);
    if (!customer) return;

    const manager = users.find(u => u.uid === customer.manager_id);
    const commissionRate = getCommissionRate(manager?.commissionRates, newItem.entry_source);
    const calc = calculateSettlement(
      newItem.contract_amount,
      newItem.execution_amount,
      newItem.fee_rate,
      commissionRate
    );

    // 계약일 기준으로 정산월 자동 설정
    const contractDateMonth = newItem.contract_date.slice(0, 7); // YYYY-MM 형식 추출

    const settlementData: InsertSettlementItem = {
      customer_id: customer.id,
      customer_name: customer.company_name || customer.name,
      manager_id: customer.manager_id,
      manager_name: customer.manager_name || manager?.name || '',
      team_id: customer.team_id,
      team_name: customer.team_name,
      entry_source: newItem.entry_source,
      contract_amount: newItem.contract_amount,
      execution_amount: newItem.execution_amount,
      fee_rate: newItem.fee_rate,
      total_revenue: calc.totalRevenue,
      commission_rate: commissionRate,
      gross_commission: calc.grossCommission,
      tax_amount: calc.taxAmount,
      net_commission: calc.netCommission,
      settlement_month: contractDateMonth,
      contract_date: newItem.contract_date,
      status: '정상',
      is_clawback: false,
    };

    try {
      await createSettlementItem(settlementData);
      toast({
        title: '성공',
        description: '정산 항목이 추가되었습니다.',
      });
      setAddModalOpen(false);
      setNewItem({
        customer_id: '',
        entry_source: '광고',
        contract_amount: 0,
        execution_amount: 0,
        fee_rate: 3,
        contract_date: format(new Date(), 'yyyy-MM-dd'),
      });
      fetchData();
    } catch (error) {
      console.error('Error adding settlement:', error);
      toast({
        title: '오류',
        description: '정산 항목 추가 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleMonthChange('prev')}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-selected-month">
            {format(parseISO(`${selectedMonth}-01`), 'yyyy년 M월', { locale: ko })} 정산
          </h1>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleMonthChange('next')}
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
          <Button
            size="sm"
            onClick={() => setAddModalOpen(true)}
            data-testid="button-add-settlement"
          >
            <Calculator className="h-4 w-4 mr-2" />
            정산 추가
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card
          className="cursor-pointer hover-elevate"
          onClick={() => handleShowDetail('전체 계약 건', (item) => item.status === '정상')}
          data-testid="card-total-contracts"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              계약 건수
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.contracts}건</div>
            <p className="text-xs text-muted-foreground mt-1">
              총 계약금액: {totals.contractAmount.toLocaleString()}만원
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover-elevate"
          onClick={() => handleShowDetail('집행 완료 건', (item) => item.status === '정상' && item.execution_amount > 0)}
          data-testid="card-execution"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              집행 건수
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.executionCount}건</div>
            <p className="text-xs text-muted-foreground mt-1">
              총 집행금액: {totals.executionAmount.toLocaleString()}만원
            </p>
            <p className="text-xs text-muted-foreground">
              총 자문금액: {(totals.executionFee || 0).toLocaleString()}만원
            </p>
          </CardContent>
        </Card>

        <Card
          className="no-default-hover-elevate"
          data-testid="card-gross-commission"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              세전수당 합계
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totals.grossCommission.toLocaleString()}만원
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover-elevate"
          onClick={() => handleShowDetail('환수 항목', (item) => item.is_clawback)}
          data-testid="card-clawback"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              환수 금액
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              -{totals.clawbackAmount.toLocaleString()}만원
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
          className="no-default-hover-elevate"
          data-testid="card-final-payment"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              최종 지급액
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
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
                  <TableHead className="text-right">총 계약금</TableHead>
                  <TableHead className="text-right">계약 건수</TableHead>
                  <TableHead className="text-right">집행건수</TableHead>
                  <TableHead className="text-right">집행금액</TableHead>
                  <TableHead className="text-right">총 자문금액</TableHead>
                  <TableHead className="text-right">환수</TableHead>
                  <TableHead className="text-right">최종지급액(세후)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                        onDoubleClick={() => handleShowDetail(
                          `${summary.manager_name} 정산 내역`,
                          (item) => item.manager_id === summary.manager_id && item.settlement_month === selectedMonth
                        )}
                        data-testid={`cell-manager-name-${summary.manager_id}`}
                      >
                        {summary.manager_name}
                      </TableCell>
                      <TableCell className="text-right">{summary.total_contract_amount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{summary.total_contracts}건</TableCell>
                      <TableCell className="text-right">{summary.execution_count}건</TableCell>
                      <TableCell className="text-right">{summary.total_execution_amount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{(summary.total_execution_fee || 0).toLocaleString()}만원</TableCell>
                      <TableCell className="text-right text-red-600">
                        {summary.clawback_count > 0 ? `-${summary.clawback_amount.toLocaleString()}만원` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-blue-600">
                        {summary.final_payment.toLocaleString()}만원
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
        <DialogContent className="max-w-5xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{detailModalTitle}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>업체명</TableHead>
                  <TableHead>유입경로</TableHead>
                  <TableHead className="text-right">계약금</TableHead>
                  <TableHead className="text-right">집행금액</TableHead>
                  <TableHead className="text-right">수당률</TableHead>
                  <TableHead className="text-right">세전수당</TableHead>
                  <TableHead className="text-right">실지급액</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailModalItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      정산 데이터가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  detailModalItems.map((item) => (
                    <TableRow key={item.id} data-testid={`modal-row-settlement-${item.id}`}>
                      <TableCell className="font-medium">{item.customer_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.entry_source}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{item.contract_amount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{item.execution_amount.toLocaleString()}만원</TableCell>
                      <TableCell className="text-right">{item.commission_rate}%</TableCell>
                      <TableCell className="text-right">
                        <span className={item.is_clawback ? 'text-red-600' : ''}>
                          {item.gross_commission.toLocaleString()}만원
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={item.is_clawback ? 'text-red-600' : ''}>
                          {item.net_commission.toLocaleString()}만원
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === '정상' ? 'default' :
                            item.status === '취소' ? 'secondary' : 'destructive'
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.status === '정상' && !item.is_clawback && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCancelItem(item)}
                            data-testid={`modal-button-cancel-${item.id}`}
                          >
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>정산 항목 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>고객 선택</Label>
              <Select
                value={newItem.customer_id}
                onValueChange={(value) => setNewItem({ ...newItem, customer_id: value })}
              >
                <SelectTrigger data-testid="select-customer">
                  <SelectValue placeholder="고객을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.company_name || customer.name} ({customer.manager_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>유입경로</Label>
              <Select
                value={newItem.entry_source}
                onValueChange={(value) => setNewItem({ ...newItem, entry_source: value as EntrySourceType })}
              >
                <SelectTrigger data-testid="select-entry-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>계약금 (만원)</Label>
                <Input
                  type="number"
                  value={newItem.contract_amount}
                  onChange={(e) => setNewItem({ ...newItem, contract_amount: Number(e.target.value) })}
                  data-testid="input-contract-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>집행금액 (만원)</Label>
                <Input
                  type="number"
                  value={newItem.execution_amount}
                  onChange={(e) => setNewItem({ ...newItem, execution_amount: Number(e.target.value) })}
                  data-testid="input-execution-amount"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>자문료율 (%)</Label>
                <Input
                  type="number"
                  value={newItem.fee_rate}
                  onChange={(e) => setNewItem({ ...newItem, fee_rate: Number(e.target.value) })}
                  data-testid="input-fee-rate"
                />
              </div>
              <div className="space-y-2">
                <Label>계약일</Label>
                <Input
                  type="date"
                  value={newItem.contract_date}
                  onChange={(e) => setNewItem({ ...newItem, contract_date: e.target.value })}
                  data-testid="input-contract-date"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddSettlement} data-testid="button-submit-settlement">
                추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
