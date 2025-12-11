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
} from '@/lib/firestore';
import { Plus, Search, RefreshCw } from 'lucide-react';
import type { Customer, User, Team, Holiday, StatusLog, StatusCode, InsertCustomer } from '@shared/types';

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

  // Filter customers
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Filter by stage
    if (selectedStage) {
      result = result.filter(c => c.status_code.startsWith(selectedStage));
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
    const logs = await getStatusLogs(customerId);
    setSelectedCustomerLogs(logs);
    setSelectedCustomerName(customer?.name || '');
    setHistoryDialogOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerFormOpen(true);
  };

  // Open detail modal when clicking on customer name
  const handleCustomerClick = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsNewCustomerModal(false);
    setDetailModalOpen(true);
  };

  // Open detail modal for new customer
  const handleNewCustomerModal = () => {
    setSelectedCustomer(null);
    setIsNewCustomerModal(true);
    setDetailModalOpen(true);
  };

  // Save customer from detail modal
  const handleDetailModalSave = async (data: Partial<Customer>) => {
    if (isNewCustomerModal) {
      // Create new customer
      setFormLoading(true);
      try {
        const newCustomer = await createCustomer(data as InsertCustomer);
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
        throw error;
      } finally {
        setFormLoading(false);
      }
    } else if (selectedCustomer) {
      // Update existing customer
      setFormLoading(true);
      try {
        await updateCustomer(selectedCustomer.id, data);
        setCustomers(prev =>
          prev.map(c => c.id === selectedCustomer.id ? { ...c, ...data } : c)
        );
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
            <h2 className="text-lg font-semibold text-gray-200">
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
        }}
        customer={selectedCustomer}
        isNewCustomer={isNewCustomerModal}
        currentUser={user}
        users={users}
        onSave={handleDetailModalSave}
        onDelete={isSuperAdmin ? handleDetailModalDelete : undefined}
      />
    </div>
  );
}
