import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/firebase';
import { getContracts, getAllPayments } from '@/lib/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ContractSendModal } from '@/components/ContractSendModal';
import { useToast } from '@/hooks/use-toast';
import { FileSignature, Search, Plus, RefreshCw, Trash2, Loader2, XCircle, CreditCard, Send } from 'lucide-react';
import { format } from 'date-fns';
import type { Contract, ContractStatus, PaymentRecord } from '@shared/types';

const STATUS_BADGE_MAP: Record<ContractStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  '초안': { variant: 'secondary', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  '발송완료': { variant: 'default', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  '서명대기': { variant: 'default', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  '서명완료': { variant: 'default', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  '거부': { variant: 'secondary', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
  '무효': { variant: 'secondary', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
};

const PAYMENT_STATE_BADGE: Record<string, string> = {
  'W': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  'F': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  'C': 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  'D': 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const PAYMENT_STATE_LABEL: Record<string, string> = {
  'W': '미결제',
  'F': '결제완료',
  'C': '취소',
  'D': '파기',
};

export default function Contracts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'contracts' | 'payments'>('contracts');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const fetchContracts = async () => {
    try {
      const data = await getContracts();
      setContracts(data);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      toast({
        title: '오류',
        description: '계약서 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const res = await authFetch('/api/paymint/payments');
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      setPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  useEffect(() => {
    if (activeTab === 'payments' && payments.length === 0) {
      fetchPayments();
    }
  }, [activeTab]);

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'contracts') {
      fetchContracts();
    } else {
      fetchPayments();
      setRefreshing(false);
    }
  };

  const handleCancel = async (contractId: string, contractName: string) => {
    if (!confirm(`"${contractName}" 계약서 발송을 취소하시겠습니까? eformsign에서도 취소됩니다.`)) return;

    setCancellingId(contractId);
    try {
      const res = await authFetch(`/api/eformsign/contracts/${contractId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast({ title: '발송취소 완료', description: '계약서가 취소되었습니다.' });
        fetchContracts();
      } else {
        toast({ title: '취소 실패', description: data.error || '취소에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  const handleDelete = async (contractId: string, contractName: string) => {
    if (!confirm(`"${contractName}" 계약서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

    setDeletingId(contractId);
    try {
      const res = await authFetch(`/api/contracts/${contractId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: '삭제 완료', description: '계약서가 삭제되었습니다.' });
        fetchContracts();
      } else {
        toast({ title: '삭제 실패', description: data.error || '삭제에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handlePaymentCancel = async (payment: PaymentRecord) => {
    const action = payment.state === 'F' ? '결제를 취소' : '청구서를 파기';
    if (!confirm(`${payment.customer_name}의 ${action}하시겠습니까?`)) return;

    try {
      const endpoint = payment.state === 'F' ? '/api/paymint/cancel' : '/api/paymint/destroy';
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: payment.id,
          bill_id: payment.bill_id,
          price: payment.amount,
        }),
      });
      const data = await res.json();
      if (data.result === 'success') {
        toast({ title: '성공', description: payment.state === 'F' ? '결제가 취소되었습니다.' : '청구서가 파기되었습니다.' });
        fetchPayments();
      } else {
        toast({ title: '실패', description: data.error || '처리에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    }
  };

  const handlePaymentResend = async (payment: PaymentRecord) => {
    try {
      const res = await authFetch('/api/paymint/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_id: payment.bill_id }),
      });
      const data = await res.json();
      if (data.result === 'success') {
        toast({ title: '재발송 완료', description: '결제 청구서가 재발송되었습니다.' });
      } else {
        toast({ title: '재발송 실패', description: data.error || '재발송에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    }
  };

  const filteredContracts = useMemo(() => {
    let result = contracts;

    if (statusFilter !== 'all') {
      if (statusFilter === '발송완료') {
        result = result.filter(c => c.status === '발송완료' || c.status === '서명대기' || c.status === '거부');
      } else {
        result = result.filter(c => c.status === statusFilter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const representativeName = (c as any).fields?.['대표자명'] || (c as any).fields?.['성명'] || '';
        return c.customer_name.toLowerCase().includes(q) ||
          representativeName.toLowerCase().includes(q) ||
          c.template_name.toLowerCase().includes(q) ||
          (c.document_id && c.document_id.toLowerCase().includes(q));
      });
    }

    return result;
  }, [contracts, statusFilter, searchQuery]);

  const filteredPayments = useMemo(() => {
    let result = payments;

    if (paymentFilter !== 'all') {
      result = result.filter(p => p.state === paymentFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        (p.customer_name || '').toLowerCase().includes(q) ||
        (p.bill_id || '').toLowerCase().includes(q) ||
        (p.sent_by_name || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [payments, paymentFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contracts.length };
    contracts.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [contracts]);

  const paymentCounts = useMemo(() => {
    const counts: Record<string, number> = { all: payments.length };
    payments.forEach(p => {
      counts[p.state] = (counts[p.state] || 0) + 1;
    });
    return counts;
  }, [payments]);

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '-';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return format(d, 'yyyy-MM-dd HH:mm');
    } catch {
      return '-';
    }
  };

  const getStatusDisplayInfo = (contract: Contract) => {
    const status = contract.status;
    const badgeInfo = STATUS_BADGE_MAP[status] || STATUS_BADGE_MAP['초안'];

    const displayStatus = (status === '서명대기' || status === '거부') ? '발송완료' : status;
    const displayBadge = STATUS_BADGE_MAP[displayStatus] || badgeInfo;

    if (displayStatus === '서명완료') {
      return {
        label: '서명완료',
        className: displayBadge.className,
        tooltip: contract.completed_at ? `서명완료: ${formatDate(contract.completed_at)}` : '서명이 완료되었습니다.',
      };
    }
    return {
      label: displayStatus,
      className: displayBadge.className,
      tooltip: null,
    };
  };

  const colSpan = isSuperAdmin ? 10 : 9;

  if (loading) {
    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto" data-testid="contracts-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto" data-testid="contracts-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSignature className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">계약 · 결제 관리</h1>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'contracts' && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const res = await authFetch('/api/eformsign/contracts/sync', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      toast({ title: '동기화 완료', description: `${data.synced || 0}건의 계약 상태가 업데이트되었습니다.` });
                      fetchContracts();
                    } else {
                      toast({ title: '동기화 실패', description: data.error || '상태 동기화에 실패했습니다.', variant: 'destructive' });
                    }
                  } catch (error: any) {
                    toast({ title: '오류', description: error.message, variant: 'destructive' });
                  } finally {
                    setSyncing(false);
                  }
                }}
                data-testid="button-sync-all-contracts"
              >
                {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                상태 동기화
              </Button>
              <Button
                size="sm"
                onClick={() => setSendModalOpen(true)}
                data-testid="button-new-contract"
              >
                <Plus className="w-4 h-4 mr-1" />
                계약서 발송
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh-contracts"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setActiveTab('contracts'); setSearchQuery(''); }}
          className={`rounded-none border-b-2 ${activeTab === 'contracts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
          data-testid="tab-contracts"
        >
          <FileSignature className="w-4 h-4 mr-1.5" />
          전자계약
          <Badge variant="secondary" className="ml-1.5 text-xs">{contracts.length}</Badge>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setActiveTab('payments'); setSearchQuery(''); }}
          className={`rounded-none border-b-2 ${activeTab === 'payments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
          data-testid="tab-payments"
        >
          <CreditCard className="w-4 h-4 mr-1.5" />
          결제 내역
          <Badge variant="secondary" className="ml-1.5 text-xs">{payments.length}</Badge>
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === 'contracts' ? '고객명, 상호명, 계약서명 검색...' : '고객명, 청구서ID, 발송자 검색...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-contracts"
          />
        </div>
        {activeTab === 'contracts' ? (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
              <SelectValue placeholder="상태 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 ({statusCounts.all || 0})</SelectItem>
              <SelectItem value="발송완료">발송완료 ({(statusCounts['발송완료'] || 0) + (statusCounts['서명대기'] || 0) + (statusCounts['거부'] || 0)})</SelectItem>
              <SelectItem value="서명완료">서명완료 ({statusCounts['서명완료'] || 0})</SelectItem>
              <SelectItem value="무효">무효 ({statusCounts['무효'] || 0})</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-payment-filter">
              <SelectValue placeholder="결제 상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 ({paymentCounts.all || 0})</SelectItem>
              <SelectItem value="W">미결제 ({paymentCounts['W'] || 0})</SelectItem>
              <SelectItem value="F">결제완료 ({paymentCounts['F'] || 0})</SelectItem>
              <SelectItem value="C">취소 ({paymentCounts['C'] || 0})</SelectItem>
              <SelectItem value="D">파기 ({paymentCounts['D'] || 0})</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {activeTab === 'contracts' ? (
        <TooltipProvider>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center whitespace-nowrap hidden md:table-cell">No</TableHead>
                    <TableHead className="whitespace-nowrap">고객명</TableHead>
                    <TableHead className="whitespace-nowrap hidden md:table-cell">상호명</TableHead>
                    <TableHead className="whitespace-nowrap hidden lg:table-cell">계약서명</TableHead>
                    <TableHead className="text-center whitespace-nowrap">상태</TableHead>
                    <TableHead className="whitespace-nowrap hidden md:table-cell">발송일</TableHead>
                    <TableHead className="whitespace-nowrap hidden lg:table-cell">완료일</TableHead>
                    <TableHead className="whitespace-nowrap hidden lg:table-cell">작성자</TableHead>
                    <TableHead className="text-center w-20 whitespace-nowrap">관리</TableHead>
                    {isSuperAdmin && <TableHead className="text-center w-16 whitespace-nowrap">삭제</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="text-center py-12 text-muted-foreground">
                        {contracts.length === 0
                          ? '등록된 전자계약이 없습니다. "계약서 발송" 버튼을 눌러 새 계약서를 보내세요.'
                          : '검색 조건에 맞는 계약서가 없습니다.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredContracts.map((contract, idx) => {
                      const statusInfo = getStatusDisplayInfo(contract);
                      return (
                        <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                          <TableCell className="text-center text-muted-foreground text-sm hidden md:table-cell">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-medium" data-testid={`text-customer-name-${contract.id}`}>
                            {(contract as any).fields?.['대표자명'] || (contract as any).fields?.['성명'] || '-'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell" data-testid={`text-company-name-${contract.id}`}>
                            {contract.customer_name}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell" data-testid={`text-template-name-${contract.id}`}>
                            {contract.template_name}
                          </TableCell>
                          <TableCell className="text-center">
                            {statusInfo.tooltip ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    className={`${statusInfo.className} cursor-help`}
                                    data-testid={`badge-status-${contract.id}`}
                                  >
                                    {statusInfo.label}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{statusInfo.tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge
                                className={statusInfo.className}
                                data-testid={`badge-status-${contract.id}`}
                              >
                                {statusInfo.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                            {formatDate(contract.sent_at)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                            {formatDate(contract.completed_at)}
                          </TableCell>
                          <TableCell className="text-sm hidden lg:table-cell">
                            {contract.created_by}
                          </TableCell>
                          <TableCell className="text-center">
                            {(contract.status === '발송완료' || contract.status === '서명대기' || contract.status === '거부') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950 text-xs gap-1"
                                onClick={() => handleCancel(contract.id, contract.template_name)}
                                disabled={cancellingId === contract.id}
                                data-testid={`button-cancel-contract-${contract.id}`}
                              >
                                {cancellingId === contract.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5" />
                                )}
                                취소
                              </Button>
                            )}
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                onClick={() => handleDelete(contract.id, contract.template_name)}
                                disabled={deletingId === contract.id}
                                data-testid={`button-delete-contract-${contract.id}`}
                              >
                                {deletingId === contract.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TooltipProvider>
      ) : (
        <Card>
          <CardContent className="p-0">
            {loadingPayments ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">결제 내역 로딩 중...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center whitespace-nowrap hidden md:table-cell">No</TableHead>
                      <TableHead className="whitespace-nowrap">고객명</TableHead>
                      <TableHead className="text-right whitespace-nowrap">결제금액</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden md:table-cell">계약금</TableHead>
                      <TableHead className="text-center whitespace-nowrap">상태</TableHead>
                      <TableHead className="whitespace-nowrap hidden md:table-cell">발송일</TableHead>
                      <TableHead className="whitespace-nowrap hidden lg:table-cell">결제일</TableHead>
                      <TableHead className="whitespace-nowrap hidden lg:table-cell">카드/은행</TableHead>
                      <TableHead className="whitespace-nowrap hidden lg:table-cell">발송자</TableHead>
                      <TableHead className="text-center w-28 whitespace-nowrap">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          {payments.length === 0
                            ? '결제 내역이 없습니다.'
                            : '검색 조건에 맞는 결제 내역이 없습니다.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((payment, idx) => (
                        <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                          <TableCell className="text-center text-muted-foreground text-sm hidden md:table-cell">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-medium" data-testid={`text-payment-customer-${payment.id}`}>
                            {payment.customer_name}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {Number(payment.amount).toLocaleString()}원
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground hidden md:table-cell">
                            {payment.contract_amount_manwon}만원
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={PAYMENT_STATE_BADGE[payment.state] || ''} data-testid={`badge-payment-${payment.id}`}>
                              {PAYMENT_STATE_LABEL[payment.state] || payment.state}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                            {formatDate(payment.created_at)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                            {payment.appr_dt
                              ? payment.appr_dt.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3 $4:$5')
                              : '-'}
                          </TableCell>
                          <TableCell className="text-sm hidden lg:table-cell">
                            {payment.appr_issuer || '-'}
                          </TableCell>
                          <TableCell className="text-sm hidden lg:table-cell">
                            {payment.sent_by_name || '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {payment.state === 'W' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-blue-500 hover:text-blue-700 text-xs gap-0.5 h-7 px-1.5"
                                  onClick={() => handlePaymentResend(payment)}
                                  data-testid={`button-resend-payment-${payment.id}`}
                                >
                                  <Send className="w-3 h-3" />
                                  재발송
                                </Button>
                              )}
                              {(payment.state === 'W' || payment.state === 'F') && isSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500 hover:text-red-700 text-xs gap-0.5 h-7 px-1.5"
                                  onClick={() => handlePaymentCancel(payment)}
                                  data-testid={`button-cancel-payment-${payment.id}`}
                                >
                                  <XCircle className="w-3 h-3" />
                                  {payment.state === 'F' ? '취소' : '파기'}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ContractSendModal
        open={sendModalOpen}
        onOpenChange={setSendModalOpen}
        onSuccess={() => {
          fetchContracts();
          toast({ title: '성공', description: '계약서가 성공적으로 발송되었습니다.' });
        }}
      />
    </div>
  );
}
