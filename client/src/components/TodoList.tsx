import { useState } from 'react';
import { format, isPast, isToday } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Calendar, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Todo, UserRole } from '@shared/types';

interface TodoListProps {
  todos: Todo[];
  currentUserId: string;
  userRole: UserRole;
  onToggle: (todoId: string, completed: boolean) => void;
  onDelete: (todoId: string) => void;
  onAdd: () => void;
}

export function TodoList({
  todos,
  currentUserId,
  userRole,
  onToggle,
  onDelete,
  onAdd,
}: TodoListProps) {
  const myTodos = todos.filter(t => t.assigned_to === currentUserId);
  const assignedByOthers = myTodos.filter(t => t.assigned_by !== currentUserId);
  const selfAssigned = myTodos.filter(t => t.assigned_by === currentUserId);

  const getDueDateStyle = (dueDate: string, isCompleted: boolean) => {
    if (isCompleted) return 'text-muted-foreground';
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return 'text-destructive font-medium';
    if (isToday(date)) return 'text-chart-3 font-medium';
    return 'text-muted-foreground';
  };

  const getPriorityBorderColor = (dueDate: string, isCompleted: boolean) => {
    if (isCompleted) return 'border-l-muted';
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return 'border-l-destructive';
    if (isToday(date)) return 'border-l-chart-3';
    return 'border-l-primary';
  };

  const renderTodoItem = (todo: Todo) => {
    const isOverdue = isPast(new Date(todo.due_date)) && !isToday(new Date(todo.due_date)) && !todo.is_completed;
    
    return (
      <div
        key={todo.id}
        className={cn(
          "p-3 border-l-4 rounded-r-md bg-card space-y-2 group",
          getPriorityBorderColor(todo.due_date, todo.is_completed)
        )}
        data-testid={`todo-item-${todo.id}`}
      >
        <div className="flex items-start gap-3">
          <Checkbox
            checked={todo.is_completed}
            onCheckedChange={(checked) => onToggle(todo.id, checked as boolean)}
            className="mt-0.5"
            data-testid={`checkbox-todo-${todo.id}`}
          />
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-sm",
              todo.is_completed && "line-through text-muted-foreground"
            )}>
              {todo.content}
            </p>
            {todo.customer_name && (
              <p className="text-xs text-muted-foreground mt-1">
                고객: {todo.customer_name}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 h-6 w-6 transition-opacity"
            onClick={() => onDelete(todo.id)}
            data-testid={`button-delete-todo-${todo.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <div className={cn("flex items-center gap-1", getDueDateStyle(todo.due_date, todo.is_completed))}>
            <Calendar className="w-3 h-3" />
            {format(new Date(todo.due_date), 'M/d (EEE)', { locale: ko })}
            {isOverdue && <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-1">지연</Badge>}
          </div>
          
          {todo.assigned_by !== currentUserId && todo.assigned_by_name && (
            <div className="flex items-center gap-1">
              <Avatar className="w-4 h-4">
                <AvatarFallback className="text-[8px]">
                  {todo.assigned_by_name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground">{todo.assigned_by_name}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          TO-DO
        </h3>
        <Badge variant="secondary" className="text-xs">
          {myTodos.filter(t => !t.is_completed).length}
        </Badge>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={onAdd}
        data-testid="button-add-todo"
      >
        <Plus className="w-4 h-4" />
        새 할 일 추가
      </Button>

      <ScrollArea className="h-[400px]">
        <div className="space-y-4 pr-4">
          {assignedByOthers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">상급자 할당</p>
              <div className="space-y-2">
                {assignedByOthers.map(renderTodoItem)}
              </div>
            </div>
          )}
          
          {selfAssigned.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">내 할 일</p>
              <div className="space-y-2">
                {selfAssigned.map(renderTodoItem)}
              </div>
            </div>
          )}

          {myTodos.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">할 일이 없습니다</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
