import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { User, Customer, UserRole } from '@shared/types';

const todoSchema = z.object({
  content: z.string().min(1, '내용을 입력해주세요'),
  assigned_to: z.string().min(1, '담당자를 선택해주세요'),
  customer_id: z.string().optional(),
  due_date: z.string().min(1, '마감일을 입력해주세요'),
});

type TodoFormData = z.infer<typeof todoSchema>;

interface TodoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: User[];
  customers: Customer[];
  currentUser: User;
  userRole: UserRole;
  onSubmit: (data: TodoFormData & { 
    assigned_to_name?: string;
    assigned_by: string;
    assigned_by_name: string;
    customer_name?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function TodoForm({
  open,
  onOpenChange,
  users,
  customers,
  currentUser,
  userRole,
  onSubmit,
  isLoading,
}: TodoFormProps) {
  const canAssignToOthers = userRole === 'team_leader' || userRole === 'super_admin';

  // Get available assignees based on role
  const availableAssignees = userRole === 'super_admin'
    ? users
    : userRole === 'team_leader'
      ? users.filter(u => u.team_id === currentUser.team_id)
      : [currentUser];

  const form = useForm<TodoFormData>({
    resolver: zodResolver(todoSchema),
    defaultValues: {
      content: '',
      assigned_to: currentUser.uid,
      customer_id: '',
      due_date: new Date().toISOString().split('T')[0],
    },
  });

  const handleSubmit = async (data: TodoFormData) => {
    const assignee = users.find(u => u.uid === data.assigned_to);
    const customer = customers.find(c => c.id === data.customer_id);
    
    await onSubmit({
      ...data,
      assigned_to_name: assignee?.name,
      assigned_by: currentUser.uid,
      assigned_by_name: currentUser.name,
      customer_name: customer?.name,
    });
    
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 할 일 추가</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>내용 *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="할 일 내용을 입력하세요" 
                      {...field}
                      data-testid="input-todo-content"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>마감일 *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-todo-due-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canAssignToOthers && (
              <FormField
                control={form.control}
                name="assigned_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>담당자 *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-todo-assignee">
                          <SelectValue placeholder="담당자 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableAssignees.map(user => (
                          <SelectItem key={user.uid} value={user.uid}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>관련 고객 (선택)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-todo-customer">
                        <SelectValue placeholder="고객 선택 (선택사항)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">없음</SelectItem>
                      {customers.map(customer => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} ({customer.company_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-todo"
              >
                취소
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="button-submit-todo">
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                추가
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
