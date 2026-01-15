import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar as CalendarIcon, Clock, AlertCircle, AlertTriangle, Minus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateTodoItem, deleteTodoItem } from '@/lib/firestore';
import { useToast } from '@/hooks/use-toast';
import type { TodoItem, TodoPriority } from '@shared/types';

const todoSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  due_date: z.date({ required_error: '마감 기한을 선택해주세요' }),
  due_time: z.string().min(1, '시간을 선택해주세요'),
  priority: z.enum(['urgent', 'normal', 'low']),
  memo: z.string().optional(),
});

type TodoFormData = z.infer<typeof todoSchema>;

interface TodoDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo: TodoItem | null;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

const PRIORITY_OPTIONS: { value: TodoPriority; label: string; icon: typeof AlertCircle }[] = [
  { value: 'urgent', label: '긴급', icon: AlertCircle },
  { value: 'normal', label: '보통', icon: AlertTriangle },
  { value: 'low', label: '낮음', icon: Minus },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});

export function TodoDetailModal({
  open,
  onOpenChange,
  todo,
  onUpdated,
  onDeleted,
}: TodoDetailModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<TodoFormData>({
    resolver: zodResolver(todoSchema),
    defaultValues: {
      title: '',
      due_date: new Date(),
      due_time: '09:00',
      priority: 'normal',
      memo: '',
    },
  });

  useEffect(() => {
    if (todo && open) {
      const dueDate = todo.due_date instanceof Date ? todo.due_date : new Date(todo.due_date);
      const hours = dueDate.getHours().toString().padStart(2, '0');
      const minutes = (Math.floor(dueDate.getMinutes() / 30) * 30).toString().padStart(2, '0');
      
      form.reset({
        title: todo.title,
        due_date: dueDate,
        due_time: `${hours}:${minutes}`,
        priority: todo.priority,
        memo: todo.memo || '',
      });
    }
  }, [todo, open, form]);

  const handleSubmit = async (data: TodoFormData) => {
    if (!todo) return;
    
    setIsSubmitting(true);
    try {
      const [hours, minutes] = data.due_time.split(':').map(Number);
      const dueDateTime = new Date(data.due_date);
      dueDateTime.setHours(hours, minutes, 0, 0);

      await updateTodoItem(todo.id, {
        title: data.title,
        due_date: dueDateTime,
        priority: data.priority,
        memo: data.memo || undefined,
      });

      toast({
        title: '수정 완료',
        description: '할 일이 수정되었습니다.',
      });

      onOpenChange(false);
      onUpdated?.();
    } catch (error) {
      console.error('Error updating todo:', error);
      toast({
        title: '오류',
        description: '할 일 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!todo) return;
    
    setIsDeleting(true);
    try {
      await deleteTodoItem(todo.id);

      toast({
        title: '삭제 완료',
        description: '할 일이 삭제되었습니다.',
      });

      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      console.error('Error deleting todo:', error);
      toast({
        title: '오류',
        description: '할 일 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!todo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            할 일 상세
            {todo.customer_name && (
              <Badge variant="secondary" className="text-xs">
                {todo.customer_name}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>제목 *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="할 일 제목 입력"
                      className="h-8 text-sm"
                      {...field}
                      data-testid="input-edit-todo-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>마감 날짜 *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-8 text-sm justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-edit-due-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'yyyy-MM-dd', { locale: ko }) : '날짜 선택'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          locale={ko}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>마감 시간 *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-edit-due-time">
                          <Clock className="w-4 h-4 mr-2" />
                          <SelectValue placeholder="시간 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-48">
                        {TIME_OPTIONS.map(time => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>우선순위 *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-edit-priority">
                        <SelectValue placeholder="우선순위 선택" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <option.icon className={cn(
                              "w-4 h-4",
                              option.value === 'urgent' && "text-red-500",
                              option.value === 'normal' && "text-blue-500",
                              option.value === 'low' && "text-muted-foreground"
                            )} />
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="memo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>상세 메모</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="상세 내용을 입력하세요..."
                      className="min-h-[100px] text-sm resize-none"
                      {...field}
                      data-testid="input-edit-todo-memo"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="text-xs text-muted-foreground space-y-1">
              <p>작성자: {todo.created_by_name || todo.created_by}</p>
              <p>작성일: {format(todo.created_at instanceof Date ? todo.created_at : new Date(todo.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</p>
            </div>

            <DialogFooter className="flex justify-between gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    data-testid="button-delete-todo"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1" />
                    )}
                    삭제
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>할 일 삭제</AlertDialogTitle>
                    <AlertDialogDescription>
                      이 할 일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-edit-todo"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="button-save-todo"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  저장
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
