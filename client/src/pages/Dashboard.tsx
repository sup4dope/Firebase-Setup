import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FunnelChart } from '@/components/FunnelChart';
import { KPIWidgets } from '@/components/KPIWidgets';
import { CustomerTable } from '@/components/CustomerTable';
import { CustomerForm } from '@/components/CustomerForm';
import { StatusHistoryDialog } from '@/components/StatusHistoryDialog';
import { CustomerDetailModal } from '@/components/CustomerDetailModal';
import { CustomerInfoEditModal } from '@/components/CustomerInfoEditModal';
import { CustomerInfoHistoryModal } from '@/components/CustomerInfoHistoryModal';
import { useToast } from '@/hooks/use-toast';
import { calculateKPI } from '@/lib/kpi';
import {
  getCustomers,
  getCustomersByManager,
  getCustomersByTeam,
  getUsers,
  getTeams,
  getHolidays,
  getStatusLogs,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updateCustomerStatus,
  updateCustomerInfo,
} from '@/lib/firestore';
import { Plus, Search, RefreshCw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { FUNNEL_GROUPS } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Customer, User, Team, Holiday, StatusLog, StatusCode, InsertCustomer } from '@shared/types';

const PROCESSING_ORGS = ['미등록', '신용취약', '재도전', '혁신', '일시적', '상생', '지역재단', '미소금융', '신보', '기보', '중진공', '농신보', '기업인증', '기타'];

export default function Dashboard() {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  // Form states
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedCustomerLogs, setSelectedCustomerLogs] = useState<StatusLog[]>([]);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Detail modal states
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isNewCustomerModal, setIsNewCustomerModal] = useState(false);
  const [detailModalInitialTab, setDetailModalInitialTab] = useState<'memo' | 'history'>('memo');

  // Info edit/history modal states
  const [infoEditModalOpen, setInfoEditModalOpen] = useState(false);
  const [infoHistoryModalOpen, setInfoHistoryModalOpen] = useState(false);
  const [infoEditCustomer, setInfoEditCustomer] = useState<Customer | null>(null);

  // Status change modal states (for dashboard table)
  const [statusChangeModal, setStatusChangeModal] = useState<{
    isOpen: boolean;
    customerId: string;
    customerName: string;
    currentStatus: StatusCode;
    targetStatus: string;
    commissionRate: number;
    contractAmount: number;
    executionAmount: number;
    processingOrg: string;
  }>({
    isOpen: false,
    customerId: '',
    customerName: '',
    currentStatus: '상담대기',
    targetStatus: '',
    commissionRate: 0,
    contractAmount: 0,
    executionAmount: 0,
    processingOrg: '미등록',
  });

  // Fetch data
  const fetchData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [fetchedUsers, fetchedTeams, fetchedHolidays, fetchedLogs] = await Promise.all([
        getUsers(),
        getTeams(),
        getHolidays(),
        getStatusLogs(),
      ]);

      setUsers(fetchedUsers);
      setTeams(fetchedTeams);
      setHolidays(fetchedHolidays);
      setStatusLogs(fetchedLogs);

      // Fetch customers based on role
      let fetchedCustomers: Customer[];
      if (isSuperAdmin) {
        fetchedCustomers = await getCustomers();
      } else if (isTeamLeader && user.team_id) {
        fetchedCustomers = await getCustomersByTeam(user.team_id);
      } else {
        fetchedCustomers = await getCustomersByManager(user.uid);
      }
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Calculate KPI
  const kpi = useMemo(() => {
    return calculateKPI(customers, statusLogs, holidays);
  }, [customers, statusLogs, holidays]);

  // Filter customers (한글 상태명 기반)
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Filter by stage using FUNNEL_GROUPS
    if (selectedStage) {
      const groupStatuses = FUNNEL_GROUPS[selectedStage];
      if (groupStatuses && groupStatuses.length > 0) {
        // 그룹에 포함된 상태들로 필터링
        result = result.filter(c => groupStatuses.includes(c.status_code));
      } else {
        // 단일 상태로 정확히 매칭
        result = result.filter(c => c.status_code === selectedStage);
      }
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.company_name.toLowerCase().includes(query) ||
        c.readable_id.toLowerCase().includes(query)
      );
    }

    return result;
  }, [customers, selectedStage, searchQuery]);

  // Handlers
  const handleCreateCustomer = async (data: InsertCustomer & { manager_name?: string; team_name?: string }) => {
    setFormLoading(true);
    try {
      const newCustomer = await createCustomer(data);
      setCustomers(prev => [newCustomer, ...prev]);
      toast({
        title: '성공',
        description: '고객이 등록되었습니다.',
      });
    } catch (error) {
      console.error('Error creating customer:', error);
      toast({
        title: '오류',
        description: '고객 등록 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateCustomer = async (data: InsertCustomer & { manager_name?: string; team_name?: string }) => {
    if (!editingCustomer) return;

    setFormLoading(true);
    try {
      await updateCustomer(editingCustomer.id, data);
      setCustomers(prev =>
        prev.map(c => c.id === editingCustomer.id ? { ...c, ...data } : c)
      );
      setEditingCustomer(null);
      toast({
        title: '성공',
        description: '고객 정보가 수정되었습니다.',
      });
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({
        title: '오류',
        description: '고객 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleStatusChange = async (customerId: string, currentStatus: StatusCode, newStatus: StatusCode) => {
    if (!user) return;

    // Check if this status requires additional info modal
    const requiresModal = 
      newStatus.includes('계약완료') ||
      newStatus.includes('신청완료') ||
      newStatus.includes('집행완료');

    if (requiresModal) {
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        setStatusChangeModal({
          isOpen: true,
          customerId,
          customerName: customer.name,
          currentStatus,
          targetStatus: newStatus,
          commissionRate: customer.commission_rate || 0,
          contractAmount: customer.contract_amount || 0,
          executionAmount: customer.execution_amount || 0,
          processingOrg: customer.processing_org || '미등록',
        });
        return;
      }
    }

    // Normal status change without modal
    try {
      await updateCustomerStatus(customerId, currentStatus, newStatus, user.uid, user.name);
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? { ...c, status_code: newStatus } : c)
      );
      // Refresh status logs
      const logs = await getStatusLogs();
      setStatusLogs(logs);
      toast({
        title: '성공',
        description: '상태가 변경되었습니다.',
      });
    } catch (error) {
      console.error('Error changing status:', error);
      toast({
        title: '오류',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // Handle status change with additional info from modal
  const handleStatusChangeConfirm = async () => {
    if (!user || !statusChangeModal.customerId) return;

    try {
      // First, use updateCustomerStatus to properly create status_logs entries
      await updateCustomerStatus(
        statusChangeModal.customerId,
        statusChangeModal.currentStatus,
        statusChangeModal.targetStatus as StatusCode,
        user.uid,
        user.name
      );

      // Then update additional fields if provided
      const additionalData: Record<string, any> = {};

      // Only save values when they are > 0 or not default (preventing overwrites)
      if (statusChangeModal.targetStatus.includes('계약완료')) {
        if (statusChangeModal.commissionRate > 0) {
          additionalData.commission_rate = statusChangeModal.commissionRate;
        }
        if (statusChangeModal.contractAmount > 0) {
          additionalData.contract_amount = statusChangeModal.contractAmount;
        }
      }
      if (statusChangeModal.targetStatus.includes('신청완료')) {
        if (statusChangeModal.processingOrg && statusChangeModal.processingOrg !== '미등록') {
          additionalData.processing_org = statusChangeModal.processingOrg;
        }
      }
      if (statusChangeModal.targetStatus.includes('집행완료')) {
        if (statusChangeModal.executionAmount > 0) {
          additionalData.execution_amount = statusChangeModal.executionAmount;
        }
      }

      // Update additional fields if any were set
      if (Object.keys(additionalData).length > 0) {
        additionalData.updated_at = new Date();
        await updateDoc(doc(db, 'customers', statusChangeModal.customerId), additionalData);
      }

      // Update local state
      setCustomers(prev =>
        prev.map(c => c.id === statusChangeModal.customerId ? {
          ...c,
          status_code: statusChangeModal.targetStatus as StatusCode,
          commission_rate: additionalData.commission_rate ?? c.commission_rate,
          contract_amount: additionalData.contract_amount ?? c.contract_amount,
          execution_amount: additionalData.execution_amount ?? c.execution_amount,
          processing_org: additionalData.processing_org ?? c.processing_org,
        } : c)
      );

      // Refresh status logs
      const logs = await getStatusLogs();
      setStatusLogs(logs);

      setStatusChangeModal(prev => ({ ...prev, isOpen: false }));
      toast({
        title: '성공',
        description: '상태가 변경되었습니다.',
      });
    } catch (error) {
      console.error('Error changing status:', error);
      toast({
        title: '오류',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm('정말로 이 고객을 삭제하시겠습니까?')) return;

    try {
      await deleteCustomer(customerId);
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      toast({
        title: '성공',
        description: '고객이 삭제되었습니다.',
      });
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: '오류',
        description: '고객 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleViewHistory = async (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      // Open info history modal (자문료율/계약금/집행금액 변경 이력)
      setInfoEditCustomer(customer);
      setInfoHistoryModalOpen(true);
    }
  };

  // Handle processing org change from dashboard table
  const handleProcessingOrgChange = async (customerId: string, newOrg: string) => {
    try {
      await updateCustomer(customerId, {
        processing_org: newOrg,
        updated_at: new Date(),
      });
      
      // Update local state
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? {
          ...c,
          processing_org: newOrg,
          updated_at: new Date(),
        } : c)
      );
      
      toast({
        title: '성공',
        description: '진행기관이 변경되었습니다.',
      });
    } catch (error) {
      console.error('Error updating processing org:', error);
      toast({
        title: '오류',
        description: '진행기관 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // Handle adding memo from dashboard table (syncs with detail modal chat history)
  const handleAddMemo = async (customerId: string, content: string) => {
    if (!user) return;
    
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    // Create new memo entry
    const newMemo = {
      content,
      author_id: user.uid,
      author_name: user.name,
      created_at: new Date(),
    };
    
    // Update memo_history array and latest_memo field
    const updatedMemoHistory = [...(customer.memo_history || []), newMemo];
    
    try {
      // 1. 대시보드용: 고객 정보 업데이트 (customers 컬렉션)
      await updateCustomer(customerId, {
        memo_history: updatedMemoHistory,
        recent_memo: content,       // 대시보드 테이블 표시용
        latest_memo: content,       // 호환성용
        last_memo_date: new Date(),
        updated_at: new Date(),
      });
      
      // 2. 상세페이지용: 채팅 로그에도 추가 (counseling_logs 컬렉션) - ★쌍방향 동기화
      await addDoc(collection(db, "counseling_logs"), {
        customer_id: customerId,
        content: content,
        author_name: user.name || "관리자",
        created_at: new Date(),
        type: "memo"
      });
      
      // Update local state
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? {
          ...c,
          memo_history: updatedMemoHistory,
          recent_memo: content,
          latest_memo: content,
          last_memo_date: new Date(),
          updated_at: new Date(),
        } : c)
      );
      
      toast({
        title: '성공',
        description: '메모가 저장되었습니다.',
      });
    } catch (error) {
      console.error('Error adding memo:', error);
      toast({
        title: '오류',
        description: '메모 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (customer: Customer) => {
    setInfoEditCustomer(customer);
    setInfoEditModalOpen(true);
  };

  const handleInfoEditSave = async (
    customerId: string,
    data: { commission_rate: number; contract_amount: number; execution_amount: number }
  ) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || !user) return;

    try {
      await updateCustomerInfo(
        customerId,
        data,
        customer,
        user.uid,
        user.name
      );

      // Update local state
      setCustomers(prev =>
        prev.map(c =>
          c.id === customerId
            ? { ...c, ...data }
            : c
        )
      );

      toast({
        title: '성공',
        description: '정보가 수정되었습니다.',
      });
    } catch (error) {
      console.error('Error updating customer info:', error);
      toast({
        title: '오류',
        description: '정보 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Open detail modal when clicking on customer name
  const handleCustomerClick = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsNewCustomerModal(false);
    setDetailModalInitialTab('memo');
    setDetailModalOpen(true);
  };

  // Open detail modal for new customer
  const handleNewCustomerModal = () => {
    setSelectedCustomer(null);
    setIsNewCustomerModal(true);
    setDetailModalOpen(true);
  };

  // Save customer from detail modal - returns customer ID for tracking
  const handleDetailModalSave = async (data: Partial<Customer>): Promise<string | undefined> => {
    // If data has an id, it's an update (even if it was originally a "new" customer)
    if (data.id) {
      // ★핵심: 메모 전용 업데이트인지 확인 (recent_memo만 있으면 Firestore 저장 건너뛰기)
      const isMemoOnlyUpdate = Object.keys(data).every(key => 
        ['id', 'recent_memo', 'latest_memo', 'last_memo_date'].includes(key)
      );
      
      if (isMemoOnlyUpdate) {
        // 메모 전용: 이미 CustomerDetailModal에서 updateDoc으로 저장했으므로 로컬만 업데이트
        console.log("📝 메모 전용 업데이트 -> 로컬 상태만 갱신 (Firestore 중복 저장 방지)");
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === data.id) {
              return { ...c, ...data };
            }
            return c;
          })
        );
        return data.id;
      }
      
      // Update existing customer - merge with existing data to preserve all fields
      setFormLoading(true);
      try {
        await updateCustomer(data.id, data);
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === data.id) {
              // Merge: keep existing fields (readable_id, created_at, etc.) and update with new data
              return { ...c, ...data };
            }
            return c;
          })
        );
        // ★수정: fetchData 대신 로컬 상태만 업데이트 (모달 깜빡임 방지)
        console.log("🔄 상세페이지 변경 감지 -> 로컬 상태 업데이트 완료");
        // Silent update - no toast for auto-save
        return data.id;
      } catch (error: any) {
        console.error('Error updating customer:', error?.message || error?.code || error);
        throw error;
      } finally {
        setFormLoading(false);
      }
    } else {
      // Create new customer (only happens once)
      setFormLoading(true);
      try {
        const newCustomer = await createCustomer(data as InsertCustomer);
        setCustomers(prev => {
          // Check if customer already exists (prevent duplicates)
          const exists = prev.some(c => c.id === newCustomer.id);
          if (exists) {
            return prev.map(c => c.id === newCustomer.id ? newCustomer : c);
          }
          return [newCustomer, ...prev];
        });
        // Update selectedCustomer so subsequent saves use the new ID
        setSelectedCustomer(newCustomer);
        setIsNewCustomerModal(false);
        toast({
          title: '성공',
          description: '고객이 등록되었습니다.',
        });
        return newCustomer.id;
      } catch (error) {
        console.error('Error creating customer:', error);
        toast({
          title: '오류',
          description: '고객 등록 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
        throw error;
      } finally {
        setFormLoading(false);
      }
    }
  };

  // Delete customer from detail modal
  const handleDetailModalDelete = async (customerId: string) => {
    try {
      await deleteCustomer(customerId);
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      toast({
        title: '성공',
        description: '고객이 삭제되었습니다.',
      });
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: '오류',
        description: '고객 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Top Header - Stats Summary + Filters */}
      <div className="flex-shrink-0 p-4 border-b border-gray-800 bg-gray-900/30">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Left: KPI Summary */}
          <div className="flex items-center gap-6">
            <KPIWidgets kpi={kpi} compact />
          </div>
          
          {/* Right: Search & Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="이름, 회사명, ID 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-800 border-gray-700"
                data-testid="input-search"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchData}
              className="border-gray-700"
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={handleNewCustomerModal} data-testid="button-add-customer">
              <Plus className="w-4 h-4 mr-2" />
              고객 추가
            </Button>
          </div>
        </div>
      </div>
      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-auto p-4 space-y-4 bg-background">
        {/* Funnel Chart - Wide and centered */}
        <FunnelChart
          customers={customers}
          selectedStage={selectedStage}
          onStageClick={setSelectedStage}
        />

        {/* Customer List Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-200 pl-[4px] pr-[4px]">
              고객 목록 
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({filteredCustomers.length}명)
              </span>
            </h2>
            {selectedStage && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedStage(null)}
                className="text-gray-400"
              >
                필터 초기화
              </Button>
            )}
          </div>

          {/* Customer Table */}
          <CustomerTable
            customers={filteredCustomers}
            userRole={user?.role || 'staff'}
            selectedStage={selectedStage}
            onStatusChange={handleStatusChange}
            onEdit={handleEdit}
            onDelete={handleDeleteCustomer}
            onViewHistory={handleViewHistory}
            onCustomerClick={handleCustomerClick}
            onProcessingOrgChange={handleProcessingOrgChange}
            onAddMemo={handleAddMemo}
          />
        </div>
      </div>
      {/* Customer Form Dialog */}
      <CustomerForm
        open={customerFormOpen}
        onOpenChange={(open) => {
          setCustomerFormOpen(open);
          if (!open) setEditingCustomer(null);
        }}
        customer={editingCustomer}
        users={users}
        teams={teams}
        currentUser={user!}
        userRole={user?.role || 'staff'}
        onSubmit={editingCustomer ? handleUpdateCustomer : handleCreateCustomer}
        isLoading={formLoading}
      />
      {/* Status History Dialog */}
      <StatusHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        logs={selectedCustomerLogs}
        customerName={selectedCustomerName}
      />
      {/* Customer Detail Modal */}
      <CustomerDetailModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedCustomer(null);
          setIsNewCustomerModal(false);
          setDetailModalInitialTab('memo');
        }}
        customer={selectedCustomer}
        isNewCustomer={isNewCustomerModal}
        currentUser={user}
        users={users}
        onSave={handleDetailModalSave}
        onDelete={isSuperAdmin ? handleDetailModalDelete : undefined}
        initialTab={detailModalInitialTab}
      />

      {/* Customer Info Edit Modal */}
      <CustomerInfoEditModal
        open={infoEditModalOpen}
        onClose={() => {
          setInfoEditModalOpen(false);
          setInfoEditCustomer(null);
        }}
        customer={infoEditCustomer}
        onSave={handleInfoEditSave}
      />

      {/* Customer Info History Modal */}
      <CustomerInfoHistoryModal
        open={infoHistoryModalOpen}
        onClose={() => {
          setInfoHistoryModalOpen(false);
          setInfoEditCustomer(null);
        }}
        customer={infoEditCustomer}
      />

      {/* Status Change Confirmation Modal (for dashboard table) */}
      <Dialog 
        open={statusChangeModal.isOpen} 
        onOpenChange={(open) => setStatusChangeModal(prev => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-white">
              상태 변경 확인
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {statusChangeModal.customerName} 고객의 상태를 "{statusChangeModal.targetStatus}"(으)로 변경합니다.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* 계약완료: 자문료, 계약금 */}
            {statusChangeModal.targetStatus.includes('계약완료') && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-gray-300">
                    자문료 (%) <span className="text-gray-500 text-xs">(단위: %)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={statusChangeModal.commissionRate || ''}
                      onChange={(e) =>
                        setStatusChangeModal(prev => ({
                          ...prev,
                          commissionRate: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="bg-gray-800 border-gray-600 text-gray-200 pr-8"
                      placeholder="예: 3.5"
                      data-testid="input-dashboard-commission-rate"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      %
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-gray-300">
                    계약금액 <span className="text-gray-500 text-xs">(단위: 만원)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={statusChangeModal.contractAmount || ''}
                      onChange={(e) =>
                        setStatusChangeModal(prev => ({
                          ...prev,
                          contractAmount: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="bg-gray-800 border-gray-600 text-gray-200 pr-12"
                      placeholder="예: 5000 (만원 단위로 입력)"
                      data-testid="input-dashboard-contract-amount"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      만원
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* 신청완료: 진행기관 */}
            {statusChangeModal.targetStatus.includes('신청완료') && (
              <div className="space-y-2">
                <Label className="text-sm text-gray-300">신청 기관</Label>
                <Select
                  value={statusChangeModal.processingOrg || '미등록'}
                  onValueChange={(value) =>
                    setStatusChangeModal(prev => ({
                      ...prev,
                      processingOrg: value,
                    }))
                  }
                >
                  <SelectTrigger 
                    className="bg-gray-800 border-gray-600 text-gray-200"
                    data-testid="select-dashboard-processing-org"
                  >
                    <SelectValue placeholder="기관 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {PROCESSING_ORGS.filter((org) => org && org.trim() !== '').map(
                      (org) => (
                        <SelectItem key={org} value={org} className="text-gray-200">
                          {org}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 집행완료: 집행금액 */}
            {statusChangeModal.targetStatus.includes('집행완료') && (
              <div className="space-y-2">
                <Label className="text-sm text-gray-300">
                  집행금액 <span className="text-gray-500 text-xs">(단위: 만원)</span>
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    value={statusChangeModal.executionAmount || ''}
                    onChange={(e) =>
                      setStatusChangeModal(prev => ({
                        ...prev,
                        executionAmount: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="bg-gray-800 border-gray-600 text-gray-200 pr-12"
                    placeholder="예: 10000 (만원 단위로 입력)"
                    data-testid="input-dashboard-execution-amount"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    만원
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => setStatusChangeModal(prev => ({ ...prev, isOpen: false }))}
              className="border-gray-600 text-gray-300"
            >
              취소
            </Button>
            <Button
              onClick={handleStatusChangeConfirm}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-dashboard-confirm-status-change"
            >
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
