import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Bell, Clock, Plus, AlertCircle, AlertTriangle, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TodoDetailModal } from './TodoDetailModal';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getTodoItems, getTodoItemsByScope } from '@/lib/firestore';
import type { Customer, User, TodoItem, TodoPriority } from '@shared/types';

interface NotificationBellProps {
  customers: Customer[];
  users: User[];
  onAddTodo: () => void;
  todoRefreshTrigger?: number;
}

const PRIORITY_ICONS: Record<TodoPriority, { icon: typeof AlertCircle; color: string }> = {
  urgent: { icon: AlertCircle, color: 'text-red-400' },
  normal: { icon: AlertTriangle, color: 'text-blue-400' },
  low: { icon: Minus, color: 'text-gray-500' },
};

export function NotificationBell({ customers, users, onAddTodo, todoRefreshTrigger }: NotificationBellProps) {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null);
  const [showTodoDetail, setShowTodoDetail] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTodoItems = async () => {
    if (!user) return;
    try {
      let items: TodoItem[];
      if (isSuperAdmin) {
        items = await getTodoItems();
      } else if (isTeamLeader && user.team_id) {
        const teamMembers = users.filter(u => u.team_id === user.team_id);
        const teamEmails = teamMembers.map(u => u.email);
        const teamUids = teamMembers.map(u => u.uid);
        items = await getTodoItemsByScope(user.email, user.uid, teamEmails, teamUids);
      } else {
        items = await getTodoItemsByScope(user.email, user.uid);
      }
      setTodoItems(items);
    } catch (error) {
      console.error('Error fetching todo items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTodoItems();
  }, [todoRefreshTrigger, user, users]);

  // 고객목록의 경과 표시(30초 폴링)와 항상 동기화되도록 동일 주기로 폴링
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchTodoItems();
    }, 30000);
    return () => clearInterval(interval);
  }, [user, users, isSuperAdmin, isTeamLeader]);

  // 팝오버 열 때 즉시 최신 데이터 반영
  useEffect(() => {
    if (open) {
      fetchTodoItems();
    }
  }, [open]);

  useEffect(() => {
    const handleTodoCreated = () => {
      fetchTodoItems();
    };
    window.addEventListener('todoCreated', handleTodoCreated);
    return () => window.removeEventListener('todoCreated', handleTodoCreated);
  }, [user, users]);

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

  const totalCount = upcomingTodos.length + overdueTodos.length;
  const hasOverdue = overdueTodos.length > 0;

  const getCustomerInfo = (customerId?: string) => {
    if (!customerId) return { name: '-', companyName: '-' };
    const customer = customers.find(c => c.id === customerId);
    return {
      name: customer?.name || '-',
      companyName: customer?.company_name || '-',
    };
  };

  const getAssigneeName = (todo: TodoItem) => {
    if (todo.assigned_to_name) return todo.assigned_to_name;
    if (todo.assigned_to) {
      const found = users.find(u => u.uid === todo.assigned_to);
      if (found) return found.name;
    }
    if (todo.created_by_name) return todo.created_by_name;
    return '-';
  };

  const handleRowDoubleClick = (todo: TodoItem) => {
    setSelectedTodo(todo);
    setShowTodoDetail(true);
    setOpen(false);
  };

  const handleTodoUpdated = () => {
    fetchTodoItems();
  };

  const renderTodoRow = (todo: TodoItem) => {
    const dueDate = todo.due_date instanceof Date ? todo.due_date : new Date(todo.due_date);
    const customerInfo = getCustomerInfo(todo.customer_id);
    const PriorityIcon = PRIORITY_ICONS[todo.priority].icon;
    const priorityColor = PRIORITY_ICONS[todo.priority].color;
    const assigneeName = getAssigneeName(todo);

    return (
      <Tooltip key={todo.id}>
        <TooltipTrigger asChild>
          <tr
            className="border-b border-border hover:bg-accent/50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
            onDoubleClick={() => handleRowDoubleClick(todo)}
            data-testid={`notification-todo-row-${todo.id}`}
          >
            <td className="py-1.5 px-1.5 text-[11px] text-foreground truncate max-w-[60px]">
              {assigneeName}
            </td>
            <td className="py-1.5 px-1.5 text-[10px] whitespace-nowrap text-muted-foreground">
              {format(dueDate, 'MM-dd HH:mm')}
            </td>
            <td className="py-1.5 px-1.5 text-[11px] text-foreground truncate max-w-[50px]">
              {customerInfo.name}
            </td>
            <td className="py-1.5 px-1.5 text-[10px] truncate max-w-[60px] text-muted-foreground">
              {customerInfo.companyName}
            </td>
            <td className="py-1.5 px-1.5 max-w-[180px]">
              <div className="flex items-center gap-1 min-w-0">
                <PriorityIcon className={cn("w-3 h-3 flex-shrink-0", priorityColor)} />
                <span className="text-[11px] text-foreground truncate">{todo.title}</span>
              </div>
            </td>
          </tr>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          더블클릭하여 상세 보기
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderTable = (items: TodoItem[], emptyMessage: string) => (
    <ScrollArea className="h-[260px]">
      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-1.5 px-1.5 text-[10px] text-muted-foreground font-medium w-[60px]">담당자</th>
              <th className="py-1.5 px-1.5 text-[10px] text-muted-foreground font-medium w-[62px]">날짜/시간</th>
              <th className="py-1.5 px-1.5 text-[10px] text-muted-foreground font-medium w-[50px]">성함</th>
              <th className="py-1.5 px-1.5 text-[10px] text-muted-foreground font-medium w-[60px]">상호명</th>
              <th className="py-1.5 px-1.5 text-[10px] text-muted-foreground font-medium w-[180px]">제목</th>
            </tr>
          </thead>
          <tbody>
            {items.map(renderTodoRow)}
          </tbody>
        </table>
      )}
    </ScrollArea>
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            data-testid="button-notification-bell"
          >
            <Bell className={cn(
              "h-4 w-4 transition-colors",
              hasOverdue && "text-red-500"
            )} />
            {hasOverdue && (
              <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            )}
            {!hasOverdue && totalCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-blue-600 text-[9px] text-white font-bold">
                {totalCount > 9 ? '9+' : totalCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[504px] p-0"
          data-testid="notification-popover"
        >
          <Tabs defaultValue={hasOverdue ? "overdue" : "upcoming"} className="w-full">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
              <TabsList className="h-8">
                <TabsTrigger value="upcoming" className="text-xs h-7 px-3 gap-1.5" data-testid="tab-upcoming-todos">
                  <Clock className="w-3 h-3" />
                  TO-DO
                  {upcomingTodos.length > 0 && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-blue-600/20 text-blue-700 dark:text-blue-300">
                      {upcomingTodos.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="overdue" className="text-xs h-7 px-3 gap-1.5" data-testid="tab-overdue-todos">
                  <Bell className="w-3 h-3" />
                  경과
                  {overdueTodos.length > 0 && (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                      {overdueTodos.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  setOpen(false);
                  onAddTodo();
                }}
                data-testid="button-add-todo-notification"
              >
                <Plus className="w-3 h-3" />
                새 할 일
              </Button>
            </div>
            <TabsContent value="upcoming" className="mt-0 p-2">
              {renderTable(upcomingTodos, '진행 중인 업무가 없습니다')}
            </TabsContent>
            <TabsContent value="overdue" className="mt-0 p-2">
              {renderTable(overdueTodos, '경과된 예약이 없습니다')}
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      <TodoDetailModal
        open={showTodoDetail}
        onOpenChange={setShowTodoDetail}
        todo={selectedTodo}
        onUpdated={handleTodoUpdated}
        onDeleted={handleTodoUpdated}
      />
    </>
  );
}
