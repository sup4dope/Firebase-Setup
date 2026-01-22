import { useState, useEffect } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/AppSidebar';
import { TodoForm } from '@/components/TodoForm';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HeaderRankings } from '@/components/HeaderRankings';
import { LandingPageListener } from '@/components/LandingPageListener';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import NotFound from '@/pages/not-found';
import {
  getTodos,
  getTodosByUser,
  getTodosByTeam,
  getUsers,
  getTeams,
  getCustomers,
  getCustomersByManager,
  getCustomersByTeam,
  createTodo,
  updateTodo,
  deleteTodo,
} from '@/lib/firestore';
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

        // Fetch customers for todo form
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
        console.error('Error fetching sidebar data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, isSuperAdmin, isTeamLeader]);

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
          customers={customers}
          onAddTodo={() => setTodoFormOpen(true)}
          onSignOut={signOut}
          todoRefreshTrigger={todoRefreshTrigger}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 h-14 px-4 border-b bg-background sticky top-0 z-50">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <HeaderRankings />
            </div>
            <div className="flex items-center gap-2">
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
          <AppContent />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
