import { useState, useEffect, useMemo, useRef } from 'react';
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
import { ConsultationsPreviewModal } from '@/components/ConsultationsPreviewModal';
import { useToast } from '@/hooks/use-toast';
import { calculateKPI } from '@/lib/kpi';
import { fetchYearlyHolidays } from '@/lib/publicHolidays';
import {
  getCustomers,
  getCustomersByManager,
  getCustomersByTeam,
  getUsers,
  getTeams,
  getContractLogsForMonth,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updateCustomerStatus,
  updateCustomerInfo,
  syncSingleCustomerSettlement,
  getPendingConsultationsCount,
  processClawbackForFinalRejection,
  updateCustomerManager,
  deleteOverdueTodosForCustomer,
  getPreviousStatusForCustomer,
  getSettlementItems,
} from '@/lib/firestore';
import { Plus, Search, RefreshCw, CalendarIcon, Download, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataExport } from '@/components/DataExport';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { db, addCustomerHistoryLog, authFetch } from '@/lib/firebase';
import { addDoc, collection, doc, updateDoc, getDocs, query, where, arrayUnion, onSnapshot, orderBy, limit as fsLimit } from 'firebase/firestore';
import { FUNNEL_GROUPS } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Customer, User, Team, StatusLog, StatusCode, InsertCustomer, ProcessingOrg, TodoItem, SettlementItem } from '@shared/types';

const PROCESSING_ORGS = ['미등록', '신용취약', '재도전', '혁신', '일시적', '상생', '지역재단', '미소금융', '신보', '기보', '중진공', '농신보', '기업인증', '기타'];

export default function Dashboard() {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const customersRef = useRef<Customer[]>([]);
  useEffect(() => { customersRef.current = customers; }, [customers]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.customerId && detail?.status_code) {
        setCustomers(prev =>
          prev.map(c => c.id === detail.customerId ? { ...c, status_code: detail.status_code } : c)
        );
      }
    };
    window.addEventListener('customerLocalSync', handler);
    return () => window.removeEventListener('customerLocalSync', handler);
  }, []);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'updated_at' | 'entry_date'>('updated_at');
  
  const handleStageClick = (stage: string | null) => {
    setSelectedStage(stage);
    if (stage !== null) {
      setSortMode('updated_at');
    }
  };
  
  // 필터 상태 (Stats 페이지와 동일)
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [lastInitUid, setLastInitUid] = useState<string | null>(null);
  
  const [refreshing, setRefreshing] = useState(false);

  // 미처리 상담 유입 관련 상태 (super_admin 전용)
  const [pendingConsultationsCount, setPendingConsultationsCount] = useState(0);
  const [consultationsPreviewOpen, setConsultationsPreviewOpen] = useState(false);

  // 경과 TODO 고객 ID 추적
  const [overdueTodoCustomerIds, setOverdueTodoCustomerIds] = useState<Set<string>>(new Set());

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
    selectedOrgs: ProcessingOrg[];
    existingOrgs: ProcessingOrg[];
    debtAdjTotalRevenue: number;
    debtAdjEmployeeCommission: number;
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
    selectedOrgs: [],
    existingOrgs: [],
    debtAdjTotalRevenue: 0,
    debtAdjEmployeeCommission: 0,
  });

  const [paymentNotifications, setPaymentNotifications] = useState<Array<{ id: string; customerId: string; customerName: string; amount: number }>>([]);
  const seenPaymentIdsRef = useRef<Set<string>>(new Set());

  // 계약서 상태 변동 알림 (열람·서명·만료·취소·거부)
  type ContractNotif = {
    key: string;
    contractId: string;
    customerId: string;
    customerName: string;
    title: string;
    description: string;
    color: 'blue' | 'green' | 'red' | 'orange';
  };
  const [contractNotifications, setContractNotifications] = useState<ContractNotif[]>([]);
  const contractStateRef = useRef<Map<string, { status: string; opened: boolean; open_count: number }>>(new Map());
  const isInitialContractLoadRef = useRef(true);

  // 결제선생(PayMint) 결제완료 → 토스트 알림 + 고객/정산 데이터 즉시 새로고침
  // 결제 감지/정산 동기화는 App.tsx 글로벌 폴러가 담당하고, Dashboard는 이벤트만 수신
  useEffect(() => {
    if (!user) return;

    const handlePaymentCompleted = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const payments: Array<{ paymentId: string; customerId: string; customerName: string; amount: number }> | undefined = detail?.payments;
      if (!payments || payments.length === 0) return;

      // 중복 방지 + 새로운 결제만 토스트 큐에 추가
      const fresh = payments.filter(p => !seenPaymentIdsRef.current.has(p.paymentId));
      if (fresh.length === 0) return;
      fresh.forEach(p => seenPaymentIdsRef.current.add(p.paymentId));

      setPaymentNotifications(prev => [
        ...prev,
        ...fresh.map(p => ({
          id: p.paymentId,
          customerId: p.customerId,
          customerName: p.customerName,
          amount: p.amount,
        })),
      ]);

      // 정산 동기화는 이미 글로벌 폴러가 수행 — 여기서는 로컬 화면 데이터만 한 번 조용히 새로고침
      try {
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const fetchCustomersByRole = () => {
          if (isSuperAdmin) return getCustomers();
          if (isTeamLeader && user.team_id) return getCustomersByTeam(user.team_id);
          return getCustomersByManager(user.uid);
        };
        const [refreshedCustomers, refreshedSettlements] = await Promise.all([
          fetchCustomersByRole(),
          getSettlementItems(currentMonthStr),
        ]);
        setCustomers(refreshedCustomers);
        setSettlements(refreshedSettlements);
      } catch (err) {
        console.error('[Dashboard] 결제완료 후 화면 새로고침 실패:', err);
      }
    };

    window.addEventListener('paymintPaymentCompleted', handlePaymentCompleted);
    return () => window.removeEventListener('paymintPaymentCompleted', handlePaymentCompleted);
  }, [user, isSuperAdmin, isTeamLeader]);

  // 활성 계약(발송완료/서명대기) 30초마다 폴링 → 상태 변동 / 열람 발생 시 토스트
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const pollContracts = async () => {
      try {
        const res = await authFetch('/api/eformsign/contracts/poll-active', { method: 'POST' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.success || !Array.isArray(data.contracts)) return;

        const newNotifs: ContractNotif[] = [];
        data.contracts.forEach((c: any) => {
          const id = c.contractId;
          const status = c.status || '';
          const opened = !!c.opened;
          const openCount = Number(c.open_count || 0);
          const prev = contractStateRef.current.get(id);
          contractStateRef.current.set(id, { status, opened, open_count: openCount });

          if (isInitialContractLoadRef.current) return;
          if (!prev) return; // 새로 등장한 계약은 본인 발송이므로 알림 X

          // 상태 변경 감지
          if (prev.status !== status) {
            let title = '';
            let color: ContractNotif['color'] = 'blue';
            if (status === '서명완료') { title = '✅ 계약서 서명 완료'; color = 'green'; }
            else if (status === '거부') { title = '⚠️ 계약서 서명 거부'; color = 'red'; }
            else if (status === '취소') { title = '🚫 계약서 발송 취소'; color = 'orange'; }
            else if (status === '만료' || status === '무효') { title = '⏰ 계약서 유효기간 만료'; color = 'orange'; }
            else if (status === '서명대기') { title = '✍️ 계약서 작성 시작'; color = 'blue'; }
            if (title) {
              newNotifs.push({
                key: `status-${id}-${status}-${Date.now()}`,
                contractId: id,
                customerId: c.customerId || '',
                customerName: c.customerName || '알 수 없는 고객',
                title,
                description: `${c.customerName || ''} · ${prev.status} → ${status}`,
                color,
              });
            }
          }

          // 열람 발생 감지
          if (!prev.opened && opened) {
            newNotifs.push({
              key: `read-${id}-${openCount}-${Date.now()}`,
              contractId: id,
              customerId: c.customerId || '',
              customerName: c.customerName || '알 수 없는 고객',
              title: '👁 계약서 열람됨',
              description: `${c.customerName || ''} · 수신자가 계약서를 처음 열람했습니다.`,
              color: 'blue',
            });
          } else if (prev.opened && opened && openCount > prev.open_count) {
            newNotifs.push({
              key: `read-${id}-${openCount}-${Date.now()}`,
              contractId: id,
              customerId: c.customerId || '',
              customerName: c.customerName || '알 수 없는 고객',
              title: '👁 계약서 재열람',
              description: `${c.customerName || ''} · 누적 열람 ${openCount}회`,
              color: 'blue',
            });
          }
        });

        if (isInitialContractLoadRef.current) {
          isInitialContractLoadRef.current = false;
        } else if (newNotifs.length > 0) {
          setContractNotifications(prev => [...prev, ...newNotifs]);
        }
      } catch (err) {
        // silent
      }
    };

    pollContracts();
    const interval = setInterval(pollContracts, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  const dismissContractNotification = (key: string) => {
    setContractNotifications(prev => prev.filter(n => n.key !== key));
  };

  const dismissPaymentNotification = (paymentId: string) => {
    setPaymentNotifications(prev => prev.filter(n => n.id !== paymentId));
  };

  const dismissPaymentNotificationsByCustomer = (customerId: string) => {
    setPaymentNotifications(prev => prev.filter(n => n.customerId !== customerId));
  };

  // Fetch data - 모든 데이터를 병렬로 로딩하여 성능 최적화
  const fetchData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      
      // 고객 데이터 조회 함수 (역할 기반)
      const fetchCustomersByRole = () => {
        if (isSuperAdmin) {
          return getCustomers();
        } else if (isTeamLeader && user.team_id) {
          return getCustomersByTeam(user.team_id);
        } else {
          return getCustomersByManager(user.uid);
        }
      };

      // 모든 데이터를 한번에 병렬 로딩 (statusLogs는 현재 월 계약 로그만)
      const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const [fetchedUsers, fetchedTeams, fetchedHolidayMap, fetchedLogs, fetchedCustomers, fetchedSettlements] = await Promise.all([
        getUsers(),
        getTeams(),
        fetchYearlyHolidays(currentYear),
        getContractLogsForMonth(currentYear, currentMonth),
        fetchCustomersByRole(),
        getSettlementItems(currentMonthStr),
      ]);

      setUsers(fetchedUsers);
      setTeams(fetchedTeams);
      setHolidayMap(fetchedHolidayMap);
      setStatusLogs(fetchedLogs);
      setCustomers(fetchedCustomers);
      setSettlements(fetchedSettlements);
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
    if (user && isTeamLeader && lastInitUid !== user.uid) {
      setSelectedStaff(user.uid);
      setLastInitUid(user.uid);
    }
  }, [user, isTeamLeader, lastInitUid]);

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    const handleTodoCreated = () => {
      fetchData();
    };
    window.addEventListener('todoCreated', handleTodoCreated);
    return () => window.removeEventListener('todoCreated', handleTodoCreated);
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

  // 경과 TODO 실시간 추적
  const prevOverdueRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const loadOverdueTodos = async () => {
      try {
        const { getTodoItemsByScope } = await import('@/lib/firestore');
        const teamEmails = isSuperAdmin ? users.map(u => u.email) : 
          isTeamLeader ? users.filter(u => u.team_id === user.team_id).map(u => u.email) : 
          undefined;
        const teamUids = isSuperAdmin ? users.map(u => u.uid) :
          isTeamLeader ? users.filter(u => u.team_id === user.team_id).map(u => u.uid) :
          undefined;
        
        const todos = await getTodoItemsByScope(
          user.email || '',
          user.uid,
          teamEmails,
          teamUids
        );
        
        const now = new Date();
        const overdueCustomerIds = new Set<string>();
        for (const todo of todos) {
          if (todo.customer_id && todo.status === '진행중') {
            const dueDate = todo.due_date instanceof Date ? todo.due_date : new Date(todo.due_date);
            if (dueDate <= now) {
              overdueCustomerIds.add(todo.customer_id);
            }
          }
        }

        const newOverdueIds: string[] = [];
        for (const cid of overdueCustomerIds) {
          if (!prevOverdueRef.current.has(cid)) {
            newOverdueIds.push(cid);
          }
        }
        if (newOverdueIds.length > 0) {
          const names = newOverdueIds.map(cid => {
            const c = customersRef.current.find(x => x.id === cid);
            const customerName = c?.name?.trim();
            const companyName = c?.company_name?.trim();
            if (customerName && companyName) return `${customerName}(${companyName})`;
            return customerName || companyName || '알 수 없음';
          });
          toast({
            title: '⏰ TODO 기한 경과',
            description: `${names.join(', ')} 고객의 TODO가 경과되었습니다.`,
            variant: 'destructive',
          });
        }

        prevOverdueRef.current = overdueCustomerIds;
        setOverdueTodoCustomerIds(overdueCustomerIds);
      } catch (error) {
        console.error('Error loading overdue todos:', error);
      }
    };

    loadOverdueTodos();
    const interval = setInterval(loadOverdueTodos, 30000);
    return () => clearInterval(interval);
  }, [user, users, isSuperAdmin, isTeamLeader]);

  const writeOverdueExitMemo = async (customerId: string, memoContent: string) => {
    const autoMemo = {
      content: memoContent,
      author_id: user?.uid || '',
      author_name: '시스템',
      created_at: new Date(),
    };
    await updateDoc(doc(db, 'customers', customerId), {
      memo_history: arrayUnion(autoMemo),
      recent_memo: memoContent,
      latest_memo: memoContent,
      last_memo_date: new Date(),
      updated_at: new Date(),
    });
    await addDoc(collection(db, "counseling_logs"), {
      customer_id: customerId,
      content: memoContent,
      author_name: '시스템',
      created_at: new Date(),
      type: "memo",
    });
  };

  const handleOverdueTodoAction = async (customerId: string, actionDesc: string = '', skipRestore = false) => {
    try {
      const wasOverdue = overdueTodoCustomerIds.has(customerId);

      if (wasOverdue) {
        await deleteOverdueTodosForCustomer(customerId);
        setOverdueTodoCustomerIds(prev => {
          const next = new Set(prev);
          next.delete(customerId);
          return next;
        });
        prevOverdueRef.current = new Set([...prevOverdueRef.current].filter(id => id !== customerId));
      }

      if (!skipRestore) {
        const customer = customersRef.current.find(c => c.id === customerId);
        const currentStatus = customer?.status_code;

        if (currentStatus === '예약' && user) {
          const prevStatus = await getPreviousStatusForCustomer(customerId);
          const restoreStatus = (prevStatus && prevStatus !== '예약' ? prevStatus : '상담대기') as StatusCode;
          await updateCustomerStatus(customerId, '예약' as StatusCode, restoreStatus, user.uid, user.name || '시스템');
          setCustomers(prev =>
            prev.map(c => c.id === customerId ? { ...c, status_code: restoreStatus } : c)
          );

          if (wasOverdue && actionDesc) {
            await writeOverdueExitMemo(customerId, `[시스템] 예약경과 해제: "${actionDesc}" 사유로 예약경과 상태에서 해제 → "${restoreStatus}"(으)로 복원`);
            toast({
              title: '경과 고정 해제',
              description: `${actionDesc} → 예약에서 "${restoreStatus}"(으)로 복원되었습니다.`,
            });
          }
        } else if (wasOverdue && actionDesc) {
          await writeOverdueExitMemo(customerId, `[시스템] 예약경과 해제: "${actionDesc}" 사유로 경과 고정 해제`);
          toast({
            title: '경과 고정 해제',
            description: `${actionDesc}(으)로 경과 고정이 해제되었습니다.`,
          });
        }
      } else if (wasOverdue && actionDesc) {
        await writeOverdueExitMemo(customerId, `[시스템] 예약경과 해제: "${actionDesc}" 사유로 경과 고정 해제`);
        toast({
          title: '경과 고정 해제',
          description: `${actionDesc}(으)로 경과 고정이 해제되었습니다.`,
        });
      }
    } catch (error) {
      console.error('Error handling overdue todo action:', error);
    }
  };

  // 상담 유입 완료 콜백
  const handleImportComplete = async (result: { success: number; failed: number; newCustomers: number; existingCustomers: number }) => {
    toast({
      title: 'DB 유입 완료',
      description: `총 ${result.success}건 처리 (신규: ${result.newCustomers}건, 기존 고객 메모 추가: ${result.existingCustomers}건${result.failed > 0 ? `, 실패: ${result.failed}건` : ''})`,
    });

    // 카운트 새로고침 및 고객 목록 새로고침
    setPendingConsultationsCount(0);
    await fetchData();
  };

  // 유효한 팀 목록 (id가 존재하는 팀만)
  const validTeams = useMemo(() => {
    return teams.filter(t => t.id && t.id.trim() !== '');
  }, [teams]);

  // 유효한 직원 목록 (uid가 존재하는 직원만)
  const filteredStaffOptions = useMemo(() => {
    let filtered = users.filter(u => u.uid && u.uid.trim() !== '');
    if (isTeamLeader) {
      if (!user?.team_id) return filtered.filter(u => u.uid === user?.uid);
      return filtered.filter(u => u.team_id === user.team_id);
    }
    if (selectedTeam === 'all') {
      return filtered.filter(u => u.role !== 'super_admin' || isSuperAdmin);
    }
    return filtered.filter(u => u.team_id === selectedTeam);
  }, [users, selectedTeam, isSuperAdmin, isTeamLeader, user?.team_id, user?.uid]);

  // 필터 리셋
  const resetFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setSelectedTeam('all');
    setSelectedStaff(isTeamLeader && user ? user.uid : 'all');
    setSearchQuery('');
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await fetchData();
      if (isSuperAdmin) {
        const count = await getPendingConsultationsCount();
        setPendingConsultationsCount(count);
      }
      toast({
        title: '새로고침 완료',
        description: '최신 데이터를 불러왔습니다.',
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
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

    // Filter by team/staff (super_admin & team_leader)
    if (isSuperAdmin) {
      if (selectedTeam !== 'all') {
        result = result.filter(c => c.team_id === selectedTeam);
      }
    }
    if (isSuperAdmin || isTeamLeader) {
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

    // 정렬: 전체 상태에서 유입일자 정렬 선택 시 entry_date+daily_no, 그 외에는 항상 updated_at 내림차순
    if (sortMode === 'entry_date' && !selectedStage) {
      result = [...result].sort((a, b) => {
        const dateCompare = b.entry_date.localeCompare(a.entry_date);
        if (dateCompare !== 0) return dateCompare;
        return (b.daily_no || 0) - (a.daily_no || 0);
      });
    } else {
      result = [...result].sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return bTime - aTime;
      });
    }

    // 경과 TODO가 있는 고객을 최상단에 배치
    if (overdueTodoCustomerIds.size > 0) {
      result = [...result].sort((a, b) => {
        const aOverdue = overdueTodoCustomerIds.has(a.id) ? 1 : 0;
        const bOverdue = overdueTodoCustomerIds.has(b.id) ? 1 : 0;
        return bOverdue - aOverdue;
      });
    }

    return result;
  }, [customers, selectedStage, searchQuery, dateRange, selectedTeam, selectedStaff, isSuperAdmin, isTeamLeader, overdueTodoCustomerIds, sortMode]);

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

    // Filter by team/staff (super_admin & team_leader)
    if (isSuperAdmin) {
      if (selectedTeam !== 'all') {
        result = result.filter(c => c.team_id === selectedTeam);
      }
    }
    if (isSuperAdmin || isTeamLeader) {
      if (selectedStaff !== 'all') {
        result = result.filter(c => c.manager_id === selectedStaff);
      }
    }

    return result;
  }, [customers, dateRange, selectedTeam, selectedStaff, isSuperAdmin, isTeamLeader]);

  const contractCandidateCustomers = useMemo(() => {
    let result = customers;
    if (isSuperAdmin) {
      if (selectedTeam !== 'all') {
        result = result.filter(c => c.team_id === selectedTeam);
      }
    }
    if (isSuperAdmin || isTeamLeader) {
      if (selectedStaff !== 'all') {
        result = result.filter(c => c.manager_id === selectedStaff);
      }
    }
    return result;
  }, [customers, selectedTeam, selectedStaff, isSuperAdmin, isTeamLeader]);

  // Calculate KPI (팀/담당자/기간 필터 적용)
  const kpi = useMemo(() => {
    const effectiveDateRange = dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined;
    return calculateKPI(funnelFilteredCustomers, contractCandidateCustomers, statusLogs, holidayMap, new Date(), settlements, effectiveDateRange);
  }, [funnelFilteredCustomers, contractCandidateCustomers, statusLogs, holidayMap, settlements, dateRange]);

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
        // 계약완료(외주)는 계약금 기본값 0
        const defaultContractAmount = newStatus === '계약완료(외주)' 
          ? 0 
          : (customer.contract_amount || 0);
        
        setStatusChangeModal({
          isOpen: true,
          customerId,
          customerName: customer.name,
          currentStatus,
          targetStatus: newStatus,
          commissionRate: customer.commission_rate || 0,
          contractAmount: defaultContractAmount,
          executionAmount: customer.execution_amount || 0,
          executionDate: (customer as any).execution_date || format(new Date(), 'yyyy-MM-dd'),
          processingOrg: customer.processing_org || '미등록',
          contractDate: (customer as any).contract_date || format(new Date(), 'yyyy-MM-dd'),
          clawbackDate: format(new Date(), 'yyyy-MM-dd'),
          selectedOrgs: [],
          existingOrgs: customer.processing_orgs || [],
          debtAdjTotalRevenue: (customer as any).debt_adjustment_total_revenue || 0,
          debtAdjEmployeeCommission: (customer as any).debt_adjustment_employee_commission || 0,
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

      // 정산 영향 상태 전환 시 정산 동기화 (채무조정 잔존 정산 정리 포함)
      const oldAffectsSettlement = !!currentStatus && (
        currentStatus.includes('계약완료') || currentStatus.includes('집행완료') || currentStatus === '서류취합완료' || currentStatus === '신청완료'
      );
      const newAffectsSettlement = newStatus.includes('계약완료') || newStatus.includes('집행완료') || newStatus === '서류취합완료' || newStatus === '신청완료';
      if (oldAffectsSettlement || newAffectsSettlement) {
        try {
          await syncSingleCustomerSettlement(customerId, users);
        } catch (syncErr) {
          console.error('Settlement sync error:', syncErr);
        }
      }

      // Refresh contract logs for current month
      const now = new Date();
      const logs = await getContractLogsForMonth(now.getFullYear(), now.getMonth() + 1);
      setStatusLogs(logs);
      handleOverdueTodoAction(customerId, '상태 변경', true);
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

    // 채무조정 입력값 검증
    if (statusChangeModal.targetStatus === '집행완료(채무조정)') {
      if (!(statusChangeModal.debtAdjTotalRevenue > 0) || !(statusChangeModal.debtAdjEmployeeCommission > 0)) {
        toast({
          title: '입력 오류',
          description: '총 수당과 직원 수당을 0보다 큰 값으로 입력해주세요.',
          variant: 'destructive',
        });
        return;
      }
    }

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
        // 기존 기관 + 신규 선택 기관 합치기
        const allOrgs = [...statusChangeModal.existingOrgs, ...statusChangeModal.selectedOrgs];
        if (allOrgs.length > 0) {
          additionalData.processing_orgs = allOrgs;
          // 하위 호환성을 위해 첫 번째 기관을 processing_org에도 저장
          const firstOrg = allOrgs.find(o => o.status === '진행중');
          if (firstOrg) {
            additionalData.processing_org = firstOrg.org;
          }
        }
      }
      if (statusChangeModal.targetStatus.includes('집행완료') && statusChangeModal.targetStatus !== '집행완료(채무조정)') {
        if (statusChangeModal.executionAmount > 0) {
          additionalData.execution_amount = statusChangeModal.executionAmount;
          additionalData.approved_amount = statusChangeModal.executionAmount;
        }
        if (statusChangeModal.executionDate) {
          additionalData.execution_date = statusChangeModal.executionDate;
        }
        const targetCustomer = customers.find(c => c.id === statusChangeModal.customerId);
        const currentOrgs = targetCustomer?.processing_orgs || [];
        if (currentOrgs.length > 0) {
          const today = format(new Date(), 'yyyy-MM-dd');
          additionalData.processing_orgs = currentOrgs.map((o: any) => {
            if (o.status === '진행중') {
              return {
                ...o,
                status: '승인',
                approved_at: today,
                execution_date: statusChangeModal.executionDate || today,
                execution_amount: statusChangeModal.executionAmount || 0,
              };
            }
            return o;
          });
          additionalData.processing_org = currentOrgs[0]?.org || '미등록';
        }
      }

      // 집행완료(채무조정): 수기 입력된 총 수당 / 직원 수당 저장
      if (statusChangeModal.targetStatus === '집행완료(채무조정)') {
        additionalData.debt_adjustment_total_revenue = statusChangeModal.debtAdjTotalRevenue || 0;
        additionalData.debt_adjustment_employee_commission = statusChangeModal.debtAdjEmployeeCommission || 0;
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
          processing_orgs: additionalData.processing_orgs ?? c.processing_orgs,
        } : c)
      );

      // Refresh contract logs for current month
      const now = new Date();
      const logs = await getContractLogsForMonth(now.getFullYear(), now.getMonth() + 1);
      setStatusLogs(logs);

      handleOverdueTodoAction(statusChangeModal.customerId, '상태 변경', true);
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

  // Handle processing org change from dashboard table (legacy single org)
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

  // Handle processing orgs change from dashboard table (multi-org support)
  const handleProcessingOrgsChange = async (customerId: string, processingOrgs: any[]) => {
    try {
      const updateData: any = {
        processing_orgs: processingOrgs,
        processing_org: processingOrgs.length > 0 ? processingOrgs[0].org : '미등록',
        updated_at: new Date(),
      };
      await updateCustomer(customerId, updateData);
      
      // Update local state
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? {
          ...c,
          ...updateData,
        } : c)
      );
      
      toast({
        title: '성공',
        description: '진행기관이 업데이트되었습니다.',
      });
    } catch (error) {
      console.error('Error updating processing orgs:', error);
      toast({
        title: '오류',
        description: '진행기관 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 진행기관 추가 + 자동 상태 변경 + 이력 기록
  const handleAddProcessingOrgWithAutoStatus = async (customerId: string, customer: Customer, orgName: string, isReExecution?: boolean) => {
    if (!user) return;
    
    const currentOrgs = customer.processing_orgs || [];
    if (currentOrgs.find(o => o.org === orgName)) return;
    
    const newOrg: ProcessingOrg = {
      org: orgName,
      status: '진행중',
      applied_at: new Date().toISOString().split('T')[0],
      is_re_execution: isReExecution || false,
    };
    const updatedOrgs = [...currentOrgs, newOrg];
    
    // 상태 자동 변경 로직: 서류취합완료 → 신청완료
    const statusMap: Record<string, string> = {
      '서류취합완료(선불)': '신청완료(선불)',
      '서류취합완료(외주)': '신청완료(외주)',
      '서류취합완료(후불)': '신청완료(후불)',
    };
    const newStatus = statusMap[customer.status_code];
    
    try {
      const updates: any = {
        processing_orgs: updatedOrgs,
        updated_at: new Date(),
      };
      
      // 상태 자동 변경이 필요하면 적용
      if (newStatus) {
        updates.status_code = newStatus;
      }
      
      await updateCustomer(customerId, updates);
      
      // 이력 기록 - 진행기관 추가
      const reExecLabel = isReExecution ? ' (재집행)' : '';
      await addCustomerHistoryLog({
        customer_id: customerId,
        action_type: 'org_change',
        description: `진행기관 추가: ${orgName}${reExecLabel}`,
        changed_by: user.uid,
        changed_by_name: user.name,
        old_value: '',
        new_value: orgName + reExecLabel,
      });
      
      // 상태 자동 변경된 경우 상태 변경 이력도 기록
      if (newStatus) {
        await addCustomerHistoryLog({
          customer_id: customerId,
          action_type: 'status_change',
          description: `상태 변경: ${customer.status_code} → ${newStatus} (진행기관 추가로 자동 변경)`,
          changed_by: user.uid,
          changed_by_name: user.name,
          old_value: customer.status_code,
          new_value: newStatus,
        });
      }
      
      // Update local state
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? {
          ...c,
          processing_orgs: updatedOrgs,
          status_code: (newStatus || c.status_code) as StatusCode,
          updated_at: new Date(),
        } : c)
      );
      
      toast({
        title: '성공',
        description: newStatus 
          ? `진행기관 "${orgName}" 추가 및 상태가 "${newStatus}"로 변경되었습니다.`
          : `진행기관 "${orgName}"이 추가되었습니다.`,
      });
    } catch (error) {
      console.error('Error adding processing org with auto status:', error);
      toast({
        title: '오류',
        description: '진행기관 추가 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 진행기관 승인 처리 (집행일자/금액 입력 후 호출)
  const handleApproveOrg = async (
    customerId: string, 
    customer: Customer, 
    orgName: string, 
    executionDate: string, 
    executionAmount: number
  ) => {
    if (!user) return;
    
    const currentOrgs = customer.processing_orgs || [];
    const updatedOrgs = currentOrgs.map(o => {
      if (o.org === orgName) {
        return { 
          ...o, 
          status: '승인' as const, 
          approved_at: executionDate,
          execution_date: executionDate,
          execution_amount: executionAmount,
        };
      }
      return o;
    });
    
    // 총 집행금액 계산 (모든 승인된 기관의 집행금액 합계)
    const totalExecutionAmount = updatedOrgs
      .filter(o => o.status === '승인' && o.execution_amount)
      .reduce((sum, o) => sum + (o.execution_amount || 0), 0);
    
    // 가장 최근 집행일 (최신 승인된 기관의 집행일)
    const latestExecutionDate = executionDate;
    
    // 상태 자동 변경 로직: 신청완료 → 집행완료
    // 각 신청완료 유형에 맞는 집행완료 상태로 변경
    const executionStatusMap: Record<string, string> = {
      '신청완료(선불)': '집행완료(선불)',
      '신청완료(후불)': '집행완료(후불)',
      '신청완료(외주)': '집행완료(외주)',
    };
    const newStatus = executionStatusMap[customer.status_code] || '집행완료(선불)';
    
    try {
      // 고객 상태를 집행완료로 변경하고, 총 집행금액/최신 집행일 저장
      await updateCustomer(customerId, {
        processing_orgs: updatedOrgs,
        status_code: newStatus,
        execution_date: latestExecutionDate,
        execution_amount: totalExecutionAmount,
        approved_amount: totalExecutionAmount,
        updated_at: new Date(),
      });
      
      // 이력 기록 - 진행기관 승인
      await addCustomerHistoryLog({
        customer_id: customerId,
        action_type: 'org_change',
        description: `진행기관 승인: ${orgName} (집행일: ${executionDate}, 집행금액: ${executionAmount}만원)`,
        changed_by: user.uid,
        changed_by_name: user.name,
        old_value: '진행중',
        new_value: '승인',
      });
      
      // 이력 기록 - 상태 변경 (이미 집행완료가 아닌 경우에만)
      if (!customer.status_code.includes('집행완료')) {
        await addCustomerHistoryLog({
          customer_id: customerId,
          action_type: 'status_change',
          description: `상태 변경: ${customer.status_code} → ${newStatus} (진행기관 승인)`,
          changed_by: user.uid,
          changed_by_name: user.name,
          old_value: customer.status_code,
          new_value: newStatus,
        });
      }
      
      // 정산 데이터 동기화 - 각 승인된 기관별로 정산 생성
      await syncSingleCustomerSettlement(customerId, users);
      
      // Update local state
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? {
          ...c,
          processing_orgs: updatedOrgs,
          status_code: newStatus as StatusCode,
          execution_date: latestExecutionDate,
          execution_amount: totalExecutionAmount,
          approved_amount: totalExecutionAmount,
          updated_at: new Date(),
        } : c)
      );
      
      toast({
        title: '성공',
        description: `진행기관 "${orgName}" 승인 완료. 집행금액: ${executionAmount}만원 (상태: ${newStatus})`,
      });
    } catch (error) {
      console.error('Error approving org:', error);
      toast({
        title: '오류',
        description: '진행기관 승인 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      throw error; // re-throw to let the modal know it failed
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
      
      handleOverdueTodoAction(customerId, '메모 작성');
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

  const handleDeleteMemo = async (customerId: string, memoIndex: number) => {
    if (!user) return;

    const customer = customers.find(c => c.id === customerId);
    if (!customer || !customer.memo_history) return;

    const updatedMemoHistory = customer.memo_history.map((memo, idx) =>
      idx === memoIndex
        ? {
            ...memo,
            is_deleted: true,
            deleted_by: user.uid,
            deleted_by_name: user.name,
            deleted_at: new Date(),
          }
        : memo
    );

    const latestActiveMemo = [...updatedMemoHistory]
      .reverse()
      .find(m => !m.is_deleted);

    try {
      await updateCustomer(customerId, {
        memo_history: updatedMemoHistory,
        recent_memo: latestActiveMemo?.content || '',
        latest_memo: latestActiveMemo?.content || '',
        last_memo_date: latestActiveMemo?.created_at || null,
        updated_at: new Date(),
      });

      const targetMemo = customer.memo_history[memoIndex];
      if (targetMemo) {
        const logsQuery = query(
          collection(db, "counseling_logs"),
          where("customer_id", "==", customerId),
          where("content", "==", targetMemo.content),
          where("author_name", "==", targetMemo.author_name)
        );
        const logsSnapshot = await getDocs(logsQuery);
        for (const logDoc of logsSnapshot.docs) {
          await updateDoc(logDoc.ref, {
            is_deleted: true,
            deleted_by: user.uid,
            deleted_by_name: user.name,
            deleted_at: new Date(),
          });
        }
      }

      setCustomers(prev =>
        prev.map(c => c.id === customerId ? {
          ...c,
          memo_history: updatedMemoHistory,
          recent_memo: latestActiveMemo?.content || '',
          latest_memo: latestActiveMemo?.content || '',
        } : c)
      );
    } catch (error) {
      console.error('Error deleting memo:', error);
      toast({
        title: '오류',
        description: '메모 삭제 중 오류가 발생했습니다.',
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
    data: { commission_rate: number; contract_amount: number; contract_date?: string; deposit_paid_date?: string; processing_orgs?: ProcessingOrg[] }
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
            ? { 
                ...c, 
                commission_rate: data.commission_rate,
                contract_amount: data.contract_amount,
                contract_date: data.contract_date,
                deposit_paid_date: data.deposit_paid_date,
                processing_orgs: data.processing_orgs || c.processing_orgs,
              } as Customer
            : c
        )
      );

      // 정산 데이터 실시간 동기화
      syncSingleCustomerSettlement(customerId, users).catch(err => 
        console.error('Settlement sync error:', err)
      );

      handleOverdueTodoAction(customerId, '정보 수정');
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
    if (customer.id) {
      dismissPaymentNotificationsByCustomer(customer.id);
    }
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
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      ) as Partial<Customer>;

      const isServerSynced = '_serverSynced' in cleanData;
      if (isServerSynced) {
        delete (cleanData as any)._serverSynced;
        console.log("🔄 서버 동기화 완료 -> 로컬 상태만 갱신 (Firestore 중복 저장 방지)");
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === cleanData.id) {
              return { ...c, ...cleanData };
            }
            return c;
          })
        );
        return cleanData.id;
      }

      // ★핵심: 메모 전용 업데이트인지 확인 (모달이 이미 Firestore 저장했으므로 로컬 상태만 갱신)
      const isMemoOnlyUpdate = Object.keys(cleanData).every(key => 
        ['id', 'recent_memo', 'latest_memo', 'last_memo_date', 'memo_history'].includes(key)
      );
      
      if (isMemoOnlyUpdate) {
        console.log("📝 메모 전용 업데이트 -> 로컬 상태만 갱신 (Firestore 중복 저장 방지)");
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === cleanData.id) {
              return { ...c, ...cleanData };
            }
            return c;
          })
        );
        handleOverdueTodoAction(cleanData.id!, '메모 작성');
        return cleanData.id;
      }

      const isDirectFirestoreUpdate = 'processing_orgs' in cleanData && Object.keys(cleanData).every(key =>
        ['id', 'processing_orgs', 'processing_org', 'execution_amount', 'approved_amount', 'execution_date', 'status_code'].includes(key)
      );

      if (isDirectFirestoreUpdate) {
        console.log("🔄 진행기관 직접 업데이트 -> 로컬 상태만 갱신 (Firestore 중복 저장 방지)");
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === cleanData.id) {
              return { ...c, ...cleanData };
            }
            return c;
          })
        );
        handleOverdueTodoAction(cleanData.id!, '정보 수정');
        return cleanData.id;
      }
      
      // Update existing customer - merge with existing data to preserve all fields
      setFormLoading(true);
      try {
        await updateCustomer(cleanData.id!, cleanData);
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === cleanData.id) {
              return { ...c, ...cleanData };
            }
            return c;
          })
        );
        console.log("🔄 상세페이지 변경 감지 -> 로컬 상태 업데이트 완료");
        handleOverdueTodoAction(data.id, '정보 수정');
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
      <div className="flex flex-col h-full w-full overflow-hidden bg-background">
        {/* Header Skeleton */}
        <div className="flex-shrink-0 p-4 border-b bg-card dark:bg-gray-900/30">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>
        {/* Main Content Skeleton */}
        <div className="flex-1 flex overflow-hidden">
          {/* Funnel Chart Skeleton */}
          <div className="w-64 flex-shrink-0 border-r p-4">
            <Skeleton className="h-6 w-24 mb-4" />
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
          {/* Table Skeleton */}
          <div className="flex-1 p-4">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Top Header - Stats Summary + Filters */}
      <div className="flex-shrink-0 p-2 md:p-4 border-b bg-card dark:bg-gray-900/30">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2 md:gap-4">
          {/* Left: KPI Summary */}
          <div className="flex items-center gap-3 md:gap-6 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0">
            <KPIWidgets kpi={kpi} compact />
          </div>
          
          {/* Right: Search & Filters & Actions */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {/* 접수일자 필터 */}
            <div className="flex items-center gap-2">
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

            {/* 소속팀 필터 (super_admin만) */}
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
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
            )}

            {/* 담당자 필터 (super_admin & team_leader) */}
            {(isSuperAdmin || isTeamLeader) && (
              <div className="flex items-center gap-2">
                <Select value={selectedStaff || 'all'} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="w-[120px]" data-testid="select-staff-dashboard">
                    <SelectValue placeholder="전체 팀원" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isTeamLeader ? '전체 팀원' : '전체 직원'}</SelectItem>
                    {filteredStaffOptions.map(staff => (
                      <SelectItem key={staff.uid} value={staff.uid}>
                        {staff.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            
            {/* 새로고침 버튼 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshAll}
              disabled={refreshing}
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
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
                onClick={() => setConsultationsPreviewOpen(true)}
                data-testid="button-import-consultations"
              >
                <Download className="w-4 h-4 mr-2" />
                {`${pendingConsultationsCount}건 DB유입`}
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
      <div className="flex-1 overflow-auto p-3 md:p-4 space-y-3 md:space-y-4 bg-background">
        {/* Funnel Chart - Wide and centered */}
        <FunnelChart
          customers={funnelFilteredCustomers}
          selectedStage={selectedStage}
          onStageClick={handleStageClick}
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
                onClick={() => handleStageClick(null)}
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
            currentUser={user || undefined}
            onStatusChange={handleStatusChange}
            onEdit={handleEdit}
            onDelete={handleDeleteCustomer}
            onViewHistory={handleViewHistory}
            onCustomerClick={handleCustomerClick}
            onProcessingOrgChange={handleProcessingOrgChange}
            onProcessingOrgsChange={handleProcessingOrgsChange}
            onAddMemo={handleAddMemo}
            onDeleteMemo={handleDeleteMemo}
            onManagerChange={handleManagerChange}
            onAddProcessingOrgWithAutoStatus={handleAddProcessingOrgWithAutoStatus}
            onApproveOrg={handleApproveOrg}
            overdueTodoCustomerIds={overdueTodoCustomerIds}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
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
                      value={statusChangeModal.contractAmount}
                      onChange={(e) =>
                        setStatusChangeModal(prev => ({
                          ...prev,
                          contractAmount: e.target.value === '' ? 0 : parseFloat(e.target.value),
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

            {/* 신청완료: 진행기관 관리 (배지 기반 UI) */}
            {statusChangeModal.targetStatus.includes('신청완료') && (
              <div className="border rounded-lg p-3 space-y-3">
                <Label className="text-sm font-medium">진행기관 관리</Label>
                
                {/* 기존 진행 기관 표시 */}
                {statusChangeModal.existingOrgs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">기존 진행기관</p>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {statusChangeModal.existingOrgs.map((org, idx) => {
                        const statusColors: Record<string, { bg: string; text: string; border: string }> = {
                          '진행중': { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
                          '승인': { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
                          '부결': { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
                        };
                        const colors = statusColors[org.status] || statusColors['진행중'];
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-center justify-between p-2 rounded border text-sm",
                              colors.border,
                              colors.bg
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              {org.status === '승인' && <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
                              {org.status === '부결' && <XCircle className="w-3.5 h-3.5 text-red-600" />}
                              <span className={cn("font-medium", colors.text)}>{org.org}</span>
                              <span className="text-xs text-muted-foreground">({org.status})</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* 선택한 신규 기관 표시 */}
                {statusChangeModal.selectedOrgs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">신규 추가 기관</p>
                    <div className="space-y-1">
                      {statusChangeModal.selectedOrgs.map((org, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-sm"
                        >
                          <span className="font-medium text-blue-700 dark:text-blue-300">{org.org}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              setStatusChangeModal(prev => ({
                                ...prev,
                                selectedOrgs: prev.selectedOrgs.filter((_, i) => i !== idx),
                              }));
                            }}
                            data-testid={`btn-remove-selected-${org.org}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 기관 추가 섹션 */}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">기관 추가 (클릭하여 선택)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PROCESSING_ORGS.filter(org => {
                      if (org === '미등록') return false;
                      const existingOrgNames = statusChangeModal.existingOrgs.map(o => o.org);
                      const selectedOrgNames = statusChangeModal.selectedOrgs.map(o => o.org);
                      return !existingOrgNames.includes(org) && !selectedOrgNames.includes(org);
                    }).map(org => (
                      <Badge
                        key={org}
                        variant="outline"
                        className="text-xs cursor-pointer px-2 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        onClick={() => {
                          const today = format(new Date(), 'yyyy-MM-dd');
                          const newOrg: ProcessingOrg = {
                            org,
                            status: '진행중',
                            applied_at: today,
                          };
                          setStatusChangeModal(prev => ({
                            ...prev,
                            selectedOrgs: [...prev.selectedOrgs, newOrg],
                          }));
                        }}
                        data-testid={`badge-add-${org}`}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {org}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {/* 안내 메시지 */}
                {statusChangeModal.existingOrgs.length === 0 && statusChangeModal.selectedOrgs.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
                    최소 1개 이상의 기관을 선택해주세요.
                  </p>
                )}
              </div>
            )}

            {/* 집행완료: 집행일, 집행금액 (채무조정은 별도 입력) */}
            {statusChangeModal.targetStatus.includes('집행완료') && statusChangeModal.targetStatus !== '집행완료(채무조정)' && (
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

            {/* 집행완료(채무조정): 집행일, 총 수당, 직원 수당 */}
            {statusChangeModal.targetStatus === '집행완료(채무조정)' && (
              <>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    채무조정 건은 총관리자가 총 수당과 직원 수당을 직접 입력합니다. 일반 집행 수당 계산식이 적용되지 않습니다.
                  </p>
                </div>
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
                    data-testid="input-dashboard-debt-adj-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    총 수당 <span className="text-muted-foreground text-xs">(단위: 만원)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={statusChangeModal.debtAdjTotalRevenue || ''}
                      onChange={(e) =>
                        setStatusChangeModal(prev => ({
                          ...prev,
                          debtAdjTotalRevenue: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="pr-12"
                      placeholder="예: 500"
                      data-testid="input-dashboard-debt-adj-total-revenue"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      만원
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    직원 수당 <span className="text-muted-foreground text-xs">(단위: 만원)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      value={statusChangeModal.debtAdjEmployeeCommission || ''}
                      onChange={(e) =>
                        setStatusChangeModal(prev => ({
                          ...prev,
                          debtAdjEmployeeCommission: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="pr-12"
                      placeholder="예: 200"
                      data-testid="input-dashboard-debt-adj-employee-commission"
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

      {/* Consultations Preview Modal */}
      <ConsultationsPreviewModal
        open={consultationsPreviewOpen}
        onOpenChange={setConsultationsPreviewOpen}
        onImportComplete={handleImportComplete}
      />

      {contractNotifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" data-testid="contract-notifications" style={{ marginBottom: paymentNotifications.length > 0 ? '0' : '0' }}>
          {contractNotifications.map((notif) => {
            const colorClass = {
              green: 'bg-green-600',
              blue: 'bg-blue-600',
              red: 'bg-red-600',
              orange: 'bg-orange-500',
            }[notif.color];
            return (
              <div
                key={notif.key}
                className={`${colorClass} text-white rounded-lg shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-right-5 duration-300 cursor-pointer hover:opacity-95`}
                data-testid={`contract-notification-${notif.key}`}
                onClick={() => {
                  const target = customers.find(c => c.id === notif.customerId);
                  if (target) {
                    handleCustomerClick(target);
                  }
                  dismissContractNotification(notif.key);
                }}
              >
                <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{notif.title}</p>
                  <p className="text-sm opacity-90 truncate">{notif.description}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismissContractNotification(notif.key); }}
                  className="text-white/80 hover:text-white flex-shrink-0 mt-0.5"
                  data-testid={`dismiss-contract-notification-${notif.key}`}
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {paymentNotifications.length > 0 && (
        <div className={`fixed right-4 z-50 flex flex-col gap-2 max-w-sm ${contractNotifications.length > 0 ? 'bottom-4' : 'bottom-4'}`} style={{ bottom: contractNotifications.length > 0 ? `${4 + contractNotifications.length * 80 + 8}px` : '1rem' }} data-testid="payment-notifications">
          {paymentNotifications.map((notif) => (
            <div
              key={notif.id}
              className="bg-green-600 text-white rounded-lg shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-right-5 duration-300"
              data-testid={`payment-notification-${notif.id}`}
            >
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">결제 완료</p>
                <p className="text-sm opacity-90 truncate">
                  {notif.customerName} · {notif.amount.toLocaleString()}원
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismissPaymentNotification(notif.id); }}
                className="text-white/80 hover:text-white flex-shrink-0 mt-0.5"
                data-testid={`dismiss-payment-notification-${notif.id}`}
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
