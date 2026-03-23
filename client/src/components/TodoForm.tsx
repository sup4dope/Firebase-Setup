import { useState, useMemo, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar as CalendarIcon, Search, Clock, AlertCircle, AlertTriangle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createTodoItem, deleteActiveTodosForCustomer, updateCustomerStatus } from '@/lib/firestore';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import type { User, Customer, UserRole, TodoPriority, InsertTodoItem, StatusCode } from '@shared/types';

const todoSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  customer_id: z.string().optional(),
  due_date: z.date({ required_error: '마감 기한을 선택해주세요' }),
  due_time: z.string().min(1, '시간을 선택해주세요'),
  priority: z.enum(['urgent', 'normal', 'low']),
  memo: z.string().optional().nullable().transform(v => v || undefined),
});

type TodoFormData = z.infer<typeof todoSchema>;

interface TodoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: User[];
  customers: Customer[];
  currentUser: User;
  userRole: UserRole;
  onSubmit?: (data: any) => Promise<void>;
  isLoading?: boolean;
  onTodoCreated?: () => void;
  defaultCustomerId?: string; // 미리 선택된 고객 ID
}

const PRIORITY_OPTIONS: { value: TodoPriority; label: string; color: string; icon: typeof AlertCircle }[] = [
  { value: 'urgent', label: '긴급', color: 'bg-red-500/20 text-red-400 border-red-500/50', icon: AlertCircle },
  { value: 'normal', label: '보통', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50', icon: AlertTriangle },
  { value: 'low', label: '낮음', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50', icon: Minus },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

const getRoundedTimeNow = (): string => {
  const now = new Date();
  const h = now.getHours();
  const m = Math.ceil(now.getMinutes() / 5) * 5;
  if (m >= 60) {
    return `${((h + 1) % 24).toString().padStart(2, '0')}:00`;
  }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export function TodoForm({
  open,
  onOpenChange,
  customers,
  currentUser,
  onTodoCreated,
  defaultCustomerId,
}: TodoFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const form = useForm<TodoFormData>({
    resolver: zodResolver(todoSchema),
    defaultValues: {
      title: '',
      customer_id: defaultCustomerId || '',
      due_date: new Date(),
      due_time: getRoundedTimeNow(),
      priority: 'normal',
      memo: '',
    },
  });

  // 모달이 열릴 때 현재 시간으로 초기화
  useEffect(() => {
    if (open) {
      form.setValue('due_time', getRoundedTimeNow());
      if (defaultCustomerId) {
        form.setValue('customer_id', defaultCustomerId);
      }
    }
  }, [open, defaultCustomerId, form]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 50);
    const searchLower = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(searchLower) ||
      c.company_name.toLowerCase().includes(searchLower) ||
      c.readable_id.toLowerCase().includes(searchLower)
    ).slice(0, 50);
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => {
    const customerId = form.watch('customer_id');
    return customers.find(c => c.id === customerId);
  }, [customers, form.watch('customer_id')]);

  const handleSubmit = async (data: TodoFormData) => {
    setIsSubmitting(true);
    try {
      const [hours, minutes] = data.due_time.split(':').map(Number);
      const dueDateTime = new Date(data.due_date);
      dueDateTime.setHours(hours, minutes, 0, 0);

      const customer = customers.find(c => c.id === data.customer_id);

      if (customer && data.customer_id) {
        await deleteActiveTodosForCustomer(data.customer_id);
      }

      const todoData: InsertTodoItem = {
        title: data.title,
        memo: data.memo || undefined,
        customer_id: data.customer_id || undefined,
        customer_name: customer?.name,
        due_date: dueDateTime,
        priority: data.priority,
        status: '진행중',
        created_by: currentUser.email,
        created_by_name: currentUser.name,
      };

      await createTodoItem(todoData);

      if (customer && data.customer_id && customer.status_code !== '예약') {
        const oldStatus = customer.status_code;
        await updateCustomerStatus(
          data.customer_id,
          oldStatus as StatusCode,
          '예약' as StatusCode,
          currentUser.uid,
          currentUser.name || '시스템'
        );
        await addDoc(collection(db, "counseling_logs"), {
          customer_id: data.customer_id,
          action_type: "status_change",
          description: `상태 변경: ${oldStatus} → 예약 (TODO 등록)`,
          old_value: oldStatus,
          new_value: "예약",
          changed_by_name: currentUser.name || "관리자",
          changed_at: new Date(),
          type: "log",
        });
      }

      toast({
        title: '할 일 등록 완료',
        description: customer && customer.status_code !== '예약'
          ? '할 일이 추가되고 고객 상태가 예약으로 변경되었습니다.'
          : '새로운 할 일이 추가되었습니다.',
      });

      form.reset();
      setCustomerSearch('');
      onOpenChange(false);
      onTodoCreated?.();
      window.dispatchEvent(new CustomEvent('todoCreated'));
    } catch (error) {
      console.error('Error creating todo:', error);
      toast({
        title: '오류',
        description: '할 일 등록 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>할 일 등록</DialogTitle>
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
                      data-testid="input-todo-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>연결된 고객</FormLabel>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="고객 검색 (이름, 회사명, ID)"
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        className="h-8 text-sm pl-8"
                        data-testid="input-customer-search"
                      />
                    </div>
                    {selectedCustomer && (
                      <div className="flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded-md">
                        <Badge variant="secondary" className="text-xs">
                          {selectedCustomer.readable_id}
                        </Badge>
                        <span className="text-sm">{selectedCustomer.name}</span>
                        <span className="text-xs text-muted-foreground">({selectedCustomer.company_name})</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 px-2 text-xs"
                          onClick={() => {
                            field.onChange('');
                            setCustomerSearch('');
                          }}
                        >
                          해제
                        </Button>
                      </div>
                    )}
                    {!selectedCustomer && customerSearch && (
                      <ScrollArea className="h-32 border rounded-md">
                        <div className="p-1">
                          {filteredCustomers.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">검색 결과가 없습니다</p>
                          ) : (
                            filteredCustomers.map(customer => (
                              <button
                                key={customer.id}
                                type="button"
                                className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent flex items-center gap-2"
                                onClick={() => {
                                  field.onChange(customer.id);
                                  setCustomerSearch('');
                                }}
                              >
                                <Badge variant="outline" className="text-[10px] px-1">
                                  {customer.readable_id}
                                </Badge>
                                <span>{customer.name}</span>
                                <span className="text-xs text-muted-foreground">({customer.company_name})</span>
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
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
                            data-testid="button-due-date"
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
                render={({ field }) => {
                  const [hh, mm] = (field.value || '09:00').split(':');
                  return (
                    <FormItem>
                      <FormLabel>마감 시간 *</FormLabel>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Select
                          value={hh}
                          onValueChange={(v) => field.onChange(`${v}:${mm}`)}
                        >
                          <SelectTrigger className="h-8 text-sm w-[70px]" data-testid="select-due-hour">
                            <SelectValue placeholder="시" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {HOUR_OPTIONS.map(h => (
                              <SelectItem key={h} value={h}>{h}시</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground font-semibold">:</span>
                        <Select
                          value={mm}
                          onValueChange={(v) => field.onChange(`${hh}:${v}`)}
                        >
                          <SelectTrigger className="h-8 text-sm w-[70px]" data-testid="select-due-minute">
                            <SelectValue placeholder="분" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {MINUTE_OPTIONS.map(m => (
                              <SelectItem key={m} value={m}>{m}분</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
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
                      <SelectTrigger className="h-8 text-sm" data-testid="select-priority">
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
                      className="min-h-[80px] text-sm resize-none"
                      {...field}
                      data-testid="input-todo-memo"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-todo"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="button-submit-todo"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                할 일 등록
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
