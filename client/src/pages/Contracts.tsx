import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getContracts } from '@/lib/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ContractSendModal } from '@/components/ContractSendModal';
import { useToast } from '@/hooks/use-toast';
import { FileSignature, Search, Plus, RefreshCw, Eye } from 'lucide-react';
import { format } from 'date-fns';
import type { Contract, ContractStatus } from '@shared/types';

const STATUS_BADGE_MAP: Record<ContractStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  '초안': { variant: 'secondary', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  '발송완료': { variant: 'default', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  '서명대기': { variant: 'default', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  '서명완료': { variant: 'default', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  '거부': { variant: 'destructive', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
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
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const filteredContracts = useMemo(() => {
    let result = contracts;

    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.customer_name.toLowerCase().includes(q) ||
        c.template_name.toLowerCase().includes(q) ||
        (c.document_id && c.document_id.toLowerCase().includes(q))
      );
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

  const handleCheckStatus = async (contract: Contract) => {
    if (!contract.document_id) {
      toast({ title: '알림', description: '아직 eformsign에 발송되지 않은 계약서입니다.' });
      return;
    }

    try {
      const token = await user?.getIdToken?.();
      if (!token) return;

      const res = await fetch(`/api/eformsign/documents/${contract.document_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: '문서 상태',
          description: `현재 상태: ${JSON.stringify(data.data?.document?.document_status || data.data?.status || '확인됨')}`,
        });
        fetchContracts();
      } else {
        toast({ title: '조회 실패', description: data.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="contracts-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="contracts-page">
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
            placeholder="고객명, 계약서명 검색..."
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
            <SelectItem value="발송완료">발송완료 ({statusCounts['발송완료'] || 0})</SelectItem>
            <SelectItem value="서명대기">서명대기 ({statusCounts['서명대기'] || 0})</SelectItem>
            <SelectItem value="서명완료">서명완료 ({statusCounts['서명완료'] || 0})</SelectItem>
            <SelectItem value="거부">거부 ({statusCounts['거부'] || 0})</SelectItem>
            <SelectItem value="초안">초안 ({statusCounts['초안'] || 0})</SelectItem>
            <SelectItem value="무효">무효 ({statusCounts['무효'] || 0})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>고객명</TableHead>
                <TableHead>계약서명</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead>발송일</TableHead>
                <TableHead>완료일</TableHead>
                <TableHead>작성자</TableHead>
                <TableHead className="text-center w-20">상세</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    {contracts.length === 0
                      ? '등록된 전자계약이 없습니다. "계약서 발송" 버튼을 눌러 새 계약서를 보내세요.'
                      : '검색 조건에 맞는 계약서가 없습니다.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredContracts.map((contract, idx) => (
                  <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                    <TableCell className="text-center text-muted-foreground text-sm">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-customer-name-${contract.id}`}>
                      {contract.customer_name}
                    </TableCell>
                    <TableCell data-testid={`text-template-name-${contract.id}`}>
                      {contract.template_name}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        className={STATUS_BADGE_MAP[contract.status]?.className || ''}
                        data-testid={`badge-status-${contract.id}`}
                      >
                        {contract.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(contract.sent_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(contract.completed_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {contract.created_by}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCheckStatus(contract)}
                        data-testid={`button-check-status-${contract.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
