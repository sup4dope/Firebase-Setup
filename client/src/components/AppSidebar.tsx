import { useState, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  Bell,
  Clock,
  Cog,
  Plus,
  AlertCircle,
  AlertTriangle,
  Minus,
  Calculator,
  Landmark,
} from 'lucide-react';
import { SystemSettingsModal } from './SystemSettingsModal';
import { TodoDetailModal } from './TodoDetailModal';
import { cn } from '@/lib/utils';
import { getTodoItems } from '@/lib/firestore';

import type { User, Customer, UserRole, TodoItem, TodoPriority } from '@shared/types';

interface AppSidebarProps {
  user: User;
  userRole: UserRole;
  customers: Customer[];
  onAddTodo: () => void;
  onSignOut: () => void;
  onTodoClick?: (todo: TodoItem) => void;
  onCustomerClick?: (customerId: string) => void;
  todoRefreshTrigger?: number;
}

const ROLE_LABELS: Record<UserRole, string> = {
  staff: '팀원',
  team_leader: '팀장',
  super_admin: '총관리자',
};

const PRIORITY_ICONS: Record<TodoPriority, { icon: typeof AlertCircle; color: string }> = {
  urgent: { icon: AlertCircle, color: 'text-red-400' },
  normal: { icon: AlertTriangle, color: 'text-blue-400' },
  low: { icon: Minus, color: 'text-gray-500' },
};

export function AppSidebar({
  user,
  userRole,
  customers,
  onAddTodo,
  onSignOut,
  onTodoClick,
  onCustomerClick,
  todoRefreshTrigger,
}: AppSidebarProps) {
  const [location] = useLocation();
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null);
  const [showTodoDetail, setShowTodoDetail] = useState(false);

  const fetchTodoItems = async () => {
    try {
      const items = await getTodoItems();
      setTodoItems(items);
    } catch (error) {
      console.error('Error fetching todo items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTodoItems();
  }, [todoRefreshTrigger]);

  // 전역 todoCreated 이벤트 수신 - CustomerDetailModal 등에서 발생
  useEffect(() => {
    const handleTodoCreated = () => {
      fetchTodoItems();
    };
    window.addEventListener('todoCreated', handleTodoCreated);
    return () => window.removeEventListener('todoCreated', handleTodoCreated);
  }, []);

  const { upcomingTodos, overdueTodos } = useMemo(() => {
    const now = new Date();
    const upcoming: TodoItem[] = [];
    const overdue: TodoItem[] = [];

    todoItems
      .filter(item => item.status === '진행중')
      .forEach(item => {
        const dueDate = item.due_date instanceof Date ? item.due_date : new Date(item.due_date);
        if (dueDate >= now) {
          upcoming.push(item);
        } else {
          overdue.push(item);
        }
      });

    upcoming.sort((a, b) => {
      const dateA = a.due_date instanceof Date ? a.due_date : new Date(a.due_date);
      const dateB = b.due_date instanceof Date ? b.due_date : new Date(b.due_date);
      return dateA.getTime() - dateB.getTime();
    });

    overdue.sort((a, b) => {
      const dateA = a.due_date instanceof Date ? a.due_date : new Date(a.due_date);
      const dateB = b.due_date instanceof Date ? b.due_date : new Date(b.due_date);
      return dateB.getTime() - dateA.getTime();
    });

    return { upcomingTodos: upcoming, overdueTodos: overdue };
  }, [todoItems]);

  const mainMenuItems = [
    { href: '/', label: '고객관리', icon: Users, description: '고객 목록 및 퍼널', adminOnly: false },
    { href: '/stats', label: '통계', icon: BarChart3, description: 'KPI 및 리포트', adminOnly: false },
    { href: '/settlements', label: '정산관리', icon: Calculator, description: '수당 정산 및 환수', adminOnly: false },
    { href: '/company-settlement', label: '회사정산', icon: Landmark, description: '매출/비용 통합', adminOnly: true },
  ];

  const filteredMenuItems = mainMenuItems.filter(item => !item.adminOnly || userRole === 'super_admin');

  const getCustomerInfo = (customerId?: string) => {
    if (!customerId) return { name: '-', companyName: '-' };
    const customer = customers.find(c => c.id === customerId);
    return {
      name: customer?.name || '-',
      companyName: customer?.company_name || '-',
    };
  };

  const handleRowDoubleClick = (todo: TodoItem) => {
    setSelectedTodo(todo);
    setShowTodoDetail(true);
  };

  const handleTodoUpdated = () => {
    const fetchTodoItems = async () => {
      try {
        const items = await getTodoItems();
        setTodoItems(items);
      } catch (error) {
        console.error('Error fetching todo items:', error);
      }
    };
    fetchTodoItems();
  };

  const renderTodoRow = (todo: TodoItem) => {
    const dueDate = todo.due_date instanceof Date ? todo.due_date : new Date(todo.due_date);
    const customerInfo = getCustomerInfo(todo.customer_id);
    const PriorityIcon = PRIORITY_ICONS[todo.priority].icon;
    const priorityColor = PRIORITY_ICONS[todo.priority].color;

    return (
      <Tooltip key={todo.id}>
        <TooltipTrigger asChild>
          <tr
            className="border-b border-border hover:bg-accent/50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
            onDoubleClick={() => handleRowDoubleClick(todo)}
            data-testid={`todo-row-${todo.id}`}
          >
            <td className="py-1 px-1 text-[10px] whitespace-nowrap text-muted-foreground">
              {format(dueDate, 'MM-dd')}
            </td>
            <td className="py-1 px-1 text-[11px] text-foreground truncate max-w-[45px]">
              {customerInfo.name}
            </td>
            <td className="py-1 px-1 text-[10px] truncate max-w-[55px] text-muted-foreground">
              {customerInfo.companyName}
            </td>
            <td className="py-1 px-1">
              <div className="flex items-center gap-1 min-w-0">
                <PriorityIcon className={cn("w-3 h-3 flex-shrink-0", priorityColor)} />
                <span className="text-[11px] text-foreground truncate">{todo.title}</span>
              </div>
            </td>
          </tr>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          더블클릭하여 상세 보기
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <Sidebar className="border-r border-border dark:border-gray-800">
      <SidebarHeader className="p-4 bg-muted/50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-foreground">MSGY CRM</h1>
            <p className="text-xs text-muted-foreground">Management Support Group Yieum</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="flex flex-col">
        <SidebarGroup className="p-3">
          <div className="space-y-2">
            {filteredMenuItems.map(item => {
              const isActive = item.href === '/' 
                ? location === '/' 
                : location.startsWith(item.href);
              
              return (
                <Link key={item.href} href={item.href}>
                  <Card
                    className={cn(
                      "p-4 cursor-pointer transition-all hover-elevate",
                      isActive 
                        ? "bg-blue-600/20 border-blue-500/50" 
                        : "bg-card dark:bg-gray-800/50"
                    )}
                    data-testid={`nav-${item.href.replace('/', '') || 'customers'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        isActive ? "bg-blue-600" : "bg-muted dark:bg-gray-700"
                      )}>
                        <item.icon className={cn(
                          "w-5 h-5",
                          isActive ? "text-white" : "text-muted-foreground dark:text-gray-300"
                        )} />
                      </div>
                      <div>
                        <p className={cn(
                          "font-semibold text-sm",
                          isActive ? "text-blue-600 dark:text-blue-400" : "text-foreground"
                        )}>
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup className="flex-1 overflow-hidden">
          <SidebarGroupLabel className="text-muted-foreground px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              TO-DO 리스트
            </div>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-600/30 text-blue-700 dark:text-blue-300">
              {upcomingTodos.length}
            </Badge>
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2 overflow-hidden">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-7 text-xs mb-2"
              onClick={onAddTodo}
              data-testid="button-add-todo"
            >
              <Plus className="w-3 h-3" />
              새 할 일 추가
            </Button>
            
            <ScrollArea className="h-[160px]">
              {isLoading ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">로딩 중...</p>
                </div>
              ) : upcomingTodos.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-muted-foreground">진행 중인 업무가 없습니다</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal w-[36px]">날짜</th>
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal w-[45px]">성함</th>
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal w-[55px]">상호명</th>
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal">제목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingTodos.map(renderTodoRow)}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup className="flex-1 overflow-hidden">
          <SidebarGroupLabel className="text-muted-foreground px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              예약 경과
            </div>
            {overdueTodos.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {overdueTodos.length}
              </Badge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <ScrollArea className="h-[130px]">
              {isLoading ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">로딩 중...</p>
                </div>
              ) : overdueTodos.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-muted-foreground">경과된 예약이 없습니다</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal w-[36px]">날짜</th>
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal w-[45px]">성함</th>
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal w-[55px]">상호명</th>
                      <th className="py-1 px-1 text-[9px] text-muted-foreground font-normal">제목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueTodos.map(renderTodoRow)}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-4 bg-muted/30 dark:bg-gray-900/30 space-y-3">
        {userRole === 'super_admin' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSystemSettings(true)}
            className="w-full border-blue-500/50 text-blue-600 dark:text-blue-400"
            data-testid="button-system-settings"
          >
            <Cog className="w-4 h-4 mr-2" />
            인사관리
          </Button>
        )}

        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-border">
            <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white">
              {user.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {ROLE_LABELS[userRole]}
              </Badge>
              {user.team_name && (
                <span className="text-xs text-muted-foreground truncate">
                  {user.team_name}
                </span>
              )}
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onSignOut}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-signout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
      {showSystemSettings && (
        <SystemSettingsModal
          isOpen={showSystemSettings}
          onClose={() => setShowSystemSettings(false)}
        />
      )}
      <TodoDetailModal
        open={showTodoDetail}
        onOpenChange={setShowTodoDetail}
        todo={selectedTodo}
        onUpdated={handleTodoUpdated}
        onDeleted={handleTodoUpdated}
      />
    </Sidebar>
  );
}
