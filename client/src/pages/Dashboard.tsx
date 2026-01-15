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
  syncSingleCustomerSettlement,
  getPendingConsultationsCount,
  importAllPendingConsultations,
  processClawbackForFinalRejection,
  updateCustomerManager,
} from '@/lib/firestore';
import { Plus, Search, RefreshCw, CalendarIcon, Download } from 'lucide-react';
import { DataExport } from '@/components/DataExport';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
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
  
  // 필터 상태 (Stats 페이지와 동일)
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  
  // 미처리 상담 유입 관련 상태 (super_admin 전용)
  const [pendingConsultationsCount, setPendingConsultationsCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

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
    executionDate: string;
    processingOrg: string;
    contractDate: string;
    clawbackDate: string;
  }>({
    isOpen: false,
    customerId: '',
    customerName: '',
    currentStatus: '상담대기',
    targetStatus: '',
    commissionRate: 0,
    contractAmount: 0,
    executionAmount: 0,
    executionDate: format(new Date(), 'yyyy-MM-dd'),
    processingOrg: '미등록',
    contractDate: format(new Date(), 'yyyy-MM-dd'),
    clawbackDate: format(new Date(), 'yyyy-MM-dd'),
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

  // super_admin: 미처리 상담 개수 조회
  useEffect(() => {
    const fetchPendingCount = async () => {
      if (!isSuperAdmin) return;
      try {
        const count = await getPendingConsultationsCount();
        setPendingConsultationsCount(count);
      } catch (error) {
        console.error('Error fetching pending consultations count:', error);
      }
    };
    
    fetchPendingCount();
  }, [isSuperAdmin]);

  // 미처리 상담 일괄 유입 처리
  const handleImportConsultations = async () => {
    if (!window.confirm(`미처리 상담 ${pendingConsultationsCount}건을 고객으로 유입하시겠습니까?`)) {
      return;
    }

    setIsImporting(true);
    try {
      const result = await importAllPendingConsultations();
      
      toast({
        title: 'DB 유입 완료',
        description: `총 ${result.success}건 처리 (신규: ${result.newCustomers}건, 기존 고객 메모 추가: ${result.existingCustomers}건${result.failed > 0 ? `, 실패: ${result.failed}건` : ''})`,
      });

      // 카운트 새로고침 및 고객 목록 새로고침
      setPendingConsultationsCount(0);
      await fetchData();
    } catch (error) {
      console.error('Error importing consultations:', error);
      toast({
        title: '오류',
        description: '상담 유입 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Calculate KPI
  const kpi = useMemo(() => {
    return calculateKPI(customers, statusLogs, holidays);
  }, [customers, statusLogs, holidays]);

  // 유효한 팀 목록 (id가 존재하는 팀만)
  const validTeams = useMemo(() => {
    return teams.filter(t => t.id && t.id.trim() !== '');
  }, [teams]);

  // 유효한 직원 목록 (uid가 존재하는 직원만)
  const filteredStaffOptions = useMemo(() => {
    let filtered = users.filter(u => u.uid && u.uid.trim() !== '');
    if (selectedTeam === 'all') {
      return filtered.filter(u => u.role !== 'super_admin' || isSuperAdmin);
    }
    return filtered.filter(u => u.team_id === selectedTeam);
  }, [users, selectedTeam, isSuperAdmin]);

  // 필터 리셋
  const resetFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setSelectedTeam('all');
    setSelectedStaff('all');
    setSearchQuery('');
  };

  // Filter customers (한글 상태명 기반)
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Filter by date range (접수일자)
    if (dateRange.from && dateRange.to) {
      result = result.filter(c => {
        const entryDate = parseISO(c.entry_date);
        return isWithinInterval(entryDate, { 
          start: startOfDay(dateRange.from!), 
          end: endOfDay(dateRange.to!) 
        });
      });
    }

    // Filter by team/staff (super_admin only)
    if (isSuperAdmin) {
      if (selectedTeam !== 'all') {
        result = result.filter(c => c.team_id === selectedTeam);
      }
      if (selectedStaff !== 'all') {
        result = result.filter(c => c.manager_id === selectedStaff);
      }
    }

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
        c.readable_id.toLowerCase().includes(query) ||
        (c.phone && c.phone.replace(/-/g, '').includes(query.replace(/-/g, ''))) ||
        ((c as any).ceo_phone && (c as any).ceo_phone.replace(/-/g, '').includes(query.replace(/-/g, '')))
      );
    }

    return result;
  }, [customers, selectedStage, searchQuery, dateRange, selectedTeam, selectedStaff, isSuperAdmin]);

  // 퍼널 차트용 필터 (날짜/팀/담당자만 적용, 상태/검색어 제외)
  const funnelFilteredCustomers = useMemo(() => {
    let result = customers;

    // Filter by date range (접수일자)
    if (dateRange.from && dateRange.to) {
      result = result.filter(c => {
        const entryDate = parseISO(c.entry_date);
        return isWithinInterval(entryDate, { 
          start: startOfDay(dateRange.from!), 
          end: endOfDay(dateRange.to!) 
        });
      });
    }

    // Filter by team/staff (super_admin only)
    if (isSuperAdmin) {
      if (selectedTeam !== 'all') {
        result = result.filter(c => c.team_id === selectedTeam);
      }
      if (selectedStaff !== 'all') {
        result = result.filter(c => c.manager_id === selectedStaff);
      }
    }

    return result;
  }, [customers, dateRange, selectedTeam, selectedStaff, isSuperAdmin]);

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
      newStatus.includes('집행완료') ||
      newStatus === '최종부결'; // 최종부결은 환수 적용일자 입력 필요

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
          executionDate: (customer as any).execution_date || format(new Date(), 'yyyy-MM-dd'),
          processingOrg: customer.processing_org || '미등록',
          contractDate: (customer as any).contract_date || format(new Date(), 'yyyy-MM-dd'),
          clawbackDate: format(new Date(), 'yyyy-MM-dd'),
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
        if (statusChangeModal.contractDate) {
          additionalData.contract_date = statusChangeModal.contractDate;
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
        if (statusChangeModal.executionDate) {
          additionalData.execution_date = statusChangeModal.executionDate;
        }
      }

      // 최종부결 상태로 변경 시 환수 처리 (입력된 적용일자 기준 정산월)
      if (statusChangeModal.targetStatus === '최종부결') {
        const clawbackMonth = statusChangeModal.clawbackDate?.slice(0, 7) || format(new Date(), 'yyyy-MM');
        const result = await processClawbackForFinalRejection(statusChangeModal.customerId, clawbackMonth);
        if (result.clawbackCreated) {
          console.log('환수 처리 완료:', result.clawbackItems.length, '건, 정산월:', clawbackMonth, ', 총 환수액:', result.totalClawbackAmount, '만원');
          toast({
            title: '환수 처리 완료',
            description: `${result.clawbackItems.length}건의 정산이 환수 처리되었습니다. (정산월: ${clawbackMonth})`,
          });
        }
      }

      // Update additional fields if any were set
      if (Object.keys(additionalData).length > 0) {
        additionalData.updated_at = new Date();
        await updateDoc(doc(db, 'customers', statusChangeModal.customerId), additionalData);
      }

      // 계약완료/집행완료 상태로 변경 시 정산 데이터 동기화
      if (statusChangeModal.targetStatus.includes('계약완료') || statusChangeModal.targetStatus.includes('집행완료')) {
        await syncSingleCustomerSettlement(statusChangeModal.customerId, users);
        console.log('정산 데이터 동기화 완료:', statusChangeModal.customerId);
      }

      // Update local state
      setCustomers(prev =>
        prev.map(c => c.id === statusChangeModal.customerId ? {
          ...c,
          status_code: statusChangeModal.targetStatus as StatusCode,
          commission_rate: additionalData.commission_rate ?? c.commission_rate,
          contract_amount: additionalData.contract_amount ?? c.contract_amount,
          ...(additionalData.contract_date ? { contract_date: additionalData.contract_date } : {}),
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

  const handleManagerChange = async (
    customerId: string,
    newManagerId: string,
    newManagerName: string,
    newTeamId: string,
    newTeamName: string
  ) => {
    if (!user) return;
    
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    // 동일 담당자로 변경 시 무시
    if (customer.manager_id === newManagerId) return;
    
    try {
      await updateCustomerManager(
        customerId,
        customer.manager_id || '',
        customer.manager_name || '',
        newManagerId,
        newManagerName,
        user.uid,
        user.name,
        newTeamId,
        newTeamName
      );
      
      // Update local state
      setCustomers(prev =>
        prev.map(c =>
          c.id === customerId
            ? { ...c, manager_id: newManagerId, manager_name: newManagerName, team_id: newTeamId, team_name: newTeamName }
            : c
        )
      );
      
      toast({
        title: '담당자 변경',
        description: `${customer.name}의 담당자가 ${newManagerName || '미배정'}으로 변경되었습니다.`,
      });
    } catch (error) {
      console.error('Error changing manager:', error);
      toast({
        title: '오류',
        description: '담당자 변경 중 오류가 발생했습니다.',
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
    data: { commission_rate: number; contract_amount: number; execution_amount: number; contract_date?: string }
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

      // 정산 데이터 실시간 동기화
      syncSingleCustomerSettlement(customerId, users).catch(err => 
        console.error('Settlement sync error:', err)
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
      <div className="flex-shrink-0 p-4 border-b bg-card dark:bg-gray-900/30">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Left: KPI Summary */}
          <div className="flex items-center gap-6">
            <KPIWidgets kpi={kpi} compact />
          </div>
          
          {/* Right: Search & Filters & Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* 접수일자 필터 */}
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">접수일자</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal min-w-[180px]",
                      !dateRange.from && "text-muted-foreground"
                    )}
                    data-testid="button-date-range-dashboard"
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

            {/* 소속팀/담당자 필터 (super_admin만) */}
            {isSuperAdmin && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">소속팀</Label>
                  <Select value={selectedTeam || 'all'} onValueChange={setSelectedTeam}>
                    <SelectTrigger className="w-[120px]" data-testid="select-team-dashboard">
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
                    <SelectTrigger className="w-[120px]" data-testid="select-staff-dashboard">
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

            {/* 검색창 */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="이름, 회사명, ID, 연락처 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            
            {/* 필터 리셋 버튼 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={resetFilters}
              data-testid="button-reset-filters-dashboard"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>

            {/* 데이터 내보내기 */}
            {isSuperAdmin && (
              <DataExport
                customers={filteredCustomers}
                users={users}
                teams={teams}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {/* DB 유입 버튼 (super_admin 전용) */}
            {isSuperAdmin && pendingConsultationsCount > 0 && (
              <Button
                variant="outline"
                onClick={handleImportConsultations}
                disabled={isImporting}
                data-testid="button-import-consultations"
              >
                <Download className="w-4 h-4 mr-2" />
                {isImporting ? '유입 중...' : `${pendingConsultationsCount}건 DB유입`}
              </Button>
            )}
            
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
          customers={funnelFilteredCustomers}
          selectedStage={selectedStage}
          onStageClick={setSelectedStage}
        />

        {/* Customer List Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground pl-[4px] pr-[4px]">
              고객 목록 
              <span className="text-sm font-normal text-muted-foreground ml-2">
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
            users={users}
            currentUserTeamId={user?.team_id || undefined}
            onStatusChange={handleStatusChange}
            onEdit={handleEdit}
            onDelete={handleDeleteCustomer}
            onViewHistory={handleViewHistory}
            onCustomerClick={handleCustomerClick}
            onProcessingOrgChange={handleProcessingOrgChange}
            onAddMemo={handleAddMemo}
            onManagerChange={handleManagerChange}
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
          // 모달 내에서 onSave를 통해 로컬 상태가 이미 업데이트되므로 전체 새로고침 불필요
        }}
        customer={selectedCustomer}
        isNewCustomer={isNewCustomerModal}
        currentUser={user}
        users={users}
        customers={customers}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              상태 변경 확인
            </DialogTitle>
            <DialogDescription>
              {statusChangeModal.customerName} 고객의 상태를 "{statusChangeModal.targetStatus}"(으)로 변경합니다.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* 계약완료: 계약일, 계약금액, 자문료 */}
            {statusChangeModal.targetStatus.includes('계약완료') && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">계약일</Label>
                  <Input
                    type="date"
                    value={statusChangeModal.contractDate || format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) =>
                      setStatusChangeModal(prev => ({
                        ...prev,
                        contractDate: e.target.value,
                      }))
                    }
                    data-testid="input-dashboard-contract-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    계약금액 <span className="text-muted-foreground text-xs">(단위: 만원)</span>
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
                      className="pr-12"
                      placeholder="예: 5000 (만원 단위로 입력)"
                      data-testid="input-dashboard-contract-amount"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      만원
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    자문료 (%) <span className="text-muted-foreground text-xs">(단위: %)</span>
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
                      className="pr-8"
                      placeholder="예: 3.5"
                      data-testid="input-dashboard-commission-rate"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* 신청완료: 진행기관 */}
            {statusChangeModal.targetStatus.includes('신청완료') && (
              <div className="space-y-2">
                <Label className="text-sm">신청 기관</Label>
                <Select
                  value={statusChangeModal.processingOrg || '미등록'}
                  onValueChange={(value) =>
                    setStatusChangeModal(prev => ({
                      ...prev,
                      processingOrg: value,
                    }))
                  }
                >
                  <SelectTrigger data-testid="select-dashboard-processing-org">
                    <SelectValue placeholder="기관 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCESSING_ORGS.filter((org) => org && org.trim() !== '').map(
                      (org) => (
                        <SelectItem key={org} value={org}>
                          {org}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 집행완료: 집행일, 집행금액 */}
            {statusChangeModal.targetStatus.includes('집행완료') && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">집행일</Label>
                  <Input
                    type="date"
                    value={statusChangeModal.executionDate || ''}
                    onChange={(e) =>
                      setStatusChangeModal(prev => ({
                        ...prev,
                        executionDate: e.target.value,
                      }))
                    }
                    data-testid="input-dashboard-execution-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    집행금액 <span className="text-muted-foreground text-xs">(단위: 만원)</span>
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
                      className="pr-12"
                      placeholder="예: 10000 (만원 단위로 입력)"
                      data-testid="input-dashboard-execution-amount"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      만원
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* 최종부결: 환수 적용일자 */}
            {statusChangeModal.targetStatus === '최종부결' && (
              <div className="space-y-2">
                <Label className="text-sm">환수 적용일자</Label>
                <Input
                  type="date"
                  value={statusChangeModal.clawbackDate || ''}
                  onChange={(e) =>
                    setStatusChangeModal(prev => ({
                      ...prev,
                      clawbackDate: e.target.value,
                    }))
                  }
                  data-testid="input-dashboard-clawback-date"
                />
                <p className="text-xs text-muted-foreground">
                  환수가 적용될 정산월: {statusChangeModal.clawbackDate?.slice(0, 7) || format(new Date(), 'yyyy-MM')}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => setStatusChangeModal(prev => ({ ...prev, isOpen: false }))}
            >
              취소
            </Button>
            <Button
              onClick={handleStatusChangeConfirm}
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
