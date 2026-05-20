import { useState, useEffect, useRef } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CustomerDetailProvider } from '@/contexts/CustomerDetailContext';
import { AppSidebar } from '@/components/AppSidebar';
import { TodoForm } from '@/components/TodoForm';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HeaderRankings } from '@/components/HeaderRankings';
import { NotificationBell } from '@/components/NotificationBell';
import { UnresolvedPredictsBell } from '@/components/UnresolvedPredictsBell';
import { LandingPageListener } from '@/components/LandingPageListener';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Teams from '@/pages/Teams';
import Holidays from '@/pages/Holidays';
import Settings from '@/pages/Settings';
import Stats from '@/pages/Stats';
import Settlements from '@/pages/Settlements';
import CompanySettlement from '@/pages/CompanySettlement';
import AnnualLeave from '@/pages/AnnualLeave';
import Migration from '@/pages/Migration';
import Rankings from '@/pages/Rankings';
import Contracts from '@/pages/Contracts';
import AdStats from '@/pages/AdStats';
import NotFound from '@/pages/not-found';
import {
  getTodos,
  getTodosByUser,
  getTodosByTeam,
  getUsers,
  getTeams,
  getCustomersScoped,
  createTodo,
  updateTodo,
  deleteTodo,
  syncSingleCustomerSettlement,
} from '@/lib/firestore';
import { authFetch } from '@/lib/firebase';
import type { Todo, User, Team, Customer, InsertTodo } from '@shared/types';

function AuthenticatedApp() {
  const { user, signOut, isSuperAdmin, isTeamLeader } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [todos, setTodos] = useState<Todo[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [todoFormOpen, setTodoFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [todoRefreshTrigger, setTodoRefreshTrigger] = useState(0);

  // Fetch data for sidebar
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        const [fetchedUsers, fetchedTeams] = await Promise.all([
          getUsers(),
          getTeams(),
        ]);
        setUsers(fetchedUsers);
        setTeams(fetchedTeams);

        // Fetch todos based on role
        let fetchedTodos: Todo[];
        if (isSuperAdmin) {
          fetchedTodos = await getTodos();
        } else if (isTeamLeader && user.team_id) {
          fetchedTodos = await getTodosByTeam(user.team_id);
        } else {
          fetchedTodos = await getTodosByUser(user.uid);
        }
        setTodos(fetchedTodos);

        // Fetch customers for todo form (역할 기반 스코프)
        const fetchedCustomers = await getCustomersScoped(user);
        setCustomers(fetchedCustomers);
      } catch (error) {
        console.error('Error fetching sidebar data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, isSuperAdmin, isTeamLeader]);

  // ============================================================
  // 배포 버전 변경 감지 → 새로고침 안내 sticky 토스트
  // 서버 BOOT_ID(부팅 시각)를 60초마다 폴링. 최초 응답을 기준값으로 저장하고,
  // 이후 값이 달라지면(=재배포) 닫히지 않는 토스트로 F5 새로고침 안내.
  // ============================================================
  const versionShownRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let baseline: string | null = null;

    const check = async () => {
      if (cancelled || versionShownRef.current) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const bootId = String(data?.boot_id || '');
        if (!bootId) return;
        if (baseline === null) {
          baseline = bootId;
          return;
        }
        if (bootId !== baseline && !versionShownRef.current) {
          versionShownRef.current = true;
          toast({
            title: '새 버전이 배포되었습니다',
            description: '업데이트 반영을 위해 새로고침(F5) 해주세요.',
            duration: Infinity as unknown as number,
            persistent: true,
            action: (
              <ToastAction
                altText="새로고침"
                onClick={() => window.location.reload()}
                data-testid="button-toast-reload"
              >
                새로고침
              </ToastAction>
            ),
          });
        }
      } catch {
        // 네트워크 일시 오류 무시 — 다음 사이클에 재시도
      }
    };

    check();
    const id = window.setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, toast]);

  // users는 ref로 보관해 폴러 useEffect를 재시작시키지 않음 (재시작 시 seenIds 리셋·isInitial 스킵으로 신규 결제 누락 방지)
  const usersRef = useRef<User[]>([]);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // 결제선생(PayMint) 결제완료 글로벌 폴링 → 정산 즉시 동기화 + 이벤트 디스패치
  // 모든 페이지에서 동작하므로 Settlements/Dashboard 등 어떤 화면을 보고 있어도 즉시 반영됨
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let inFlight = false; // 폴 사이클 중복 실행 방지 (느린 네트워크에서 setInterval이 겹치는 것 방지)
    const seenIds = new Set<string>();
    let isInitial = true;

    const pollAndSync = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const res = await authFetch('/api/paymint/payments?state=F&limit=20');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!Array.isArray(data) || cancelled) return;

        if (isInitial) {
          data.forEach((p: any) => seenIds.add(p.id));
          isInitial = false;
          return;
        }

        const newOnes: any[] = data.filter((p: any) => !seenIds.has(p.id));
        if (newOnes.length === 0) return;

        // users 캐시 (sidebar에서 받아온 users 우선, 없으면 조회) — 폴러 재시작 없이 ref로 접근
        const usersForSync = usersRef.current.length > 0 ? usersRef.current : await getUsers();

        // 동기화에 성공한 결제만 한 번에 모아서 단일 이벤트로 발행 (UI 새로고침 폭주/race 방지)
        // 실패한 결제는 seenIds에 추가하지 않아 다음 폴 사이클에 자동 재시도됨
        const syncedPayments: Array<{ paymentId: string; customerId: string; customerName: string; amount: number }> = [];
        for (const p of newOnes) {
          if (!p.customer_id) {
            // customer_id 없는 결제는 동기화 불가 → 재시도 의미 없음, seen 처리
            seenIds.add(p.id);
            continue;
          }
          try {
            // syncSingleCustomerSettlement은 내부 catch가 있어 throw하지 않음 → 반환값(boolean)으로 성공 여부 판단
            const ok = await syncSingleCustomerSettlement(p.customer_id, usersForSync);
            if (!ok) {
              console.error(`[Global PayMint Sync] 정산 동기화 실패 (다음 사이클 재시도): ${p.id}`);
              continue; // seenIds에 추가하지 않음 → 다음 30초 후 재시도
            }
            seenIds.add(p.id);
            syncedPayments.push({
              paymentId: p.id,
              customerId: p.customer_id,
              customerName: p.customer_name || '알 수 없는 고객',
              amount: Number(p.appr_price || p.amount || 0),
            });
            console.log(`[Global PayMint Sync] 정산 동기화 완료: ${p.customer_name || p.customer_id} (${p.id})`);
          } catch (e) {
            // 이중 안전장치: 만약 sync가 throw하더라도 재시도 가능하게 둠
            console.error(`[Global PayMint Sync] 정산 동기화 예외 (다음 사이클 재시도): ${p.id}`, e);
          }
        }

        if (cancelled) return;
        if (syncedPayments.length > 0) {
          // 한 폴 사이클의 모든 동기화 결과를 단일 이벤트로 발행 (리스너 디스패치 폭주 방지)
          window.dispatchEvent(new CustomEvent('paymintPaymentCompleted', {
            detail: { payments: syncedPayments },
          }));
        }
      } catch (err) {
        // silent — 일시적 네트워크 오류 등
      } finally {
        inFlight = false;
      }
    };

    pollAndSync();
    const interval = setInterval(pollAndSync, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  const handleToggleTodo = async (todoId: string, completed: boolean) => {
    try {
      await updateTodo(todoId, { is_completed: completed });
      setTodos(prev => prev.map(t => t.id === todoId ? { ...t, is_completed: completed } : t));
    } catch (error) {
      console.error('Error toggling todo:', error);
      toast({
        title: '오류',
        description: '할 일 상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    try {
      await deleteTodo(todoId);
      setTodos(prev => prev.filter(t => t.id !== todoId));
      toast({
        title: '성공',
        description: '할 일이 삭제되었습니다.',
      });
    } catch (error) {
      console.error('Error deleting todo:', error);
      toast({
        title: '오류',
        description: '할 일 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateTodo = async (data: InsertTodo & { 
    assigned_to_name?: string;
    assigned_by: string;
    assigned_by_name: string;
    customer_name?: string;
  }) => {
    try {
      const newTodo = await createTodo({
        content: data.content,
        assigned_to: data.assigned_to,
        assigned_to_name: data.assigned_to_name,
        assigned_by: data.assigned_by,
        assigned_by_name: data.assigned_by_name,
        customer_id: data.customer_id || undefined,
        customer_name: data.customer_name,
        due_date: data.due_date,
        is_completed: false,
      });
      setTodos(prev => [...prev, newTodo]);
      toast({
        title: '성공',
        description: '할 일이 추가되었습니다.',
      });
    } catch (error) {
      console.error('Error creating todo:', error);
      toast({
        title: '오류',
        description: '할 일 추가 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const sidebarStyle = {
    '--sidebar-width': '20rem',
    '--sidebar-width-icon': '4rem',
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar
          user={user!}
          userRole={user!.role}
          onSignOut={signOut}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-2 md:gap-4 h-12 md:h-14 px-2 md:px-4 border-b bg-background sticky top-0 z-50">
            <div className="flex items-center gap-2 md:gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="hidden md:block">
                <HeaderRankings />
              </div>
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              <NotificationBell
                customers={customers}
                users={users}
                onAddTodo={() => setTodoFormOpen(true)}
                todoRefreshTrigger={todoRefreshTrigger}
              />
              <UnresolvedPredictsBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation('/settings')}
                data-testid="button-settings"
              >
                <SettingsIcon className="h-4 w-4" />
              </Button>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/teams" component={Teams} />
              <Route path="/holidays" component={Holidays} />
              <Route path="/settings" component={Settings} />
              <Route path="/stats" component={Stats} />
              <Route path="/settlements" component={Settlements} />
              <Route path="/company-settlement" component={CompanySettlement} />
              <Route path="/annual-leave" component={AnnualLeave} />
              <Route path="/rankings" component={Rankings} />
              <Route path="/contracts" component={Contracts} />
              <Route path="/ad-stats" component={AdStats} />
              <Route path="/migrate" component={Migration} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>

      {/* Todo Form Dialog */}
      <TodoForm
        open={todoFormOpen}
        onOpenChange={setTodoFormOpen}
        users={users}
        customers={customers}
        currentUser={user!}
        userRole={user!.role}
        onTodoCreated={() => {
          setTodoRefreshTrigger(prev => prev + 1);
        }}
      />

      {/* Landing Page Consultation Listener - 비활성화 (수동 유입으로 전환) */}
      {/* <LandingPageListener enabled={true} /> */}
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CustomerDetailProvider>
            <AppContent />
            <Toaster />
          </CustomerDetailProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
