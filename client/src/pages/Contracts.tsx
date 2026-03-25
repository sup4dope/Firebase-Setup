import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/firebase';
import { getContracts } from '@/lib/firestore';
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
import { FileSignature, Search, Plus, RefreshCw, Trash2, Loader2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { Contract, ContractStatus } from '@shared/types';

const STATUS_BADGE_MAP: Record<ContractStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  '초안': { variant: 'secondary', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  '발송완료': { variant: 'default', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  '서명대기': { variant: 'default', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  '서명완료': { variant: 'default', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  '거부': { variant: 'secondary', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
  '무효': { variant: 'secondary', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
};

export default function Contracts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
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

  useEffect(() => {
    fetchContracts();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchContracts();
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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contracts.length };
    contracts.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [contracts]);

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
          <h1 className="text-2xl font-bold">전자계약 관리</h1>
          <Badge variant="secondary" className="ml-2" data-testid="text-contract-count">
            총 {contracts.length}건
          </Badge>
        </div>
        <div className="flex items-center gap-2">
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
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh-contracts"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button
            size="sm"
            onClick={() => setSendModalOpen(true)}
            data-testid="button-new-contract"
          >
            <Plus className="w-4 h-4 mr-1" />
            계약서 발송
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="고객명, 상호명, 계약서명 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-contracts"
          />
        </div>
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
      </div>

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
