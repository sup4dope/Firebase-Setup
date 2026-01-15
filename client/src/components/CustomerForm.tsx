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
import { STATUS_OPTIONS } from '@/lib/constants';
import type { Customer, User, Team, StatusCode, UserRole } from '@shared/types';

const customerSchema = z.object({
  name: z.string().min(1, '고객명을 입력해주세요'),
  company_name: z.string().min(1, '회사명을 입력해주세요'),
  phone: z.string().optional(),
  email: z.string().email('올바른 이메일을 입력해주세요').optional().or(z.literal('')),
  status_code: z.string() as z.ZodType<StatusCode>,
  manager_id: z.string().min(1, '담당자를 선택해주세요'),
  team_id: z.string().min(1, '팀을 선택해주세요'),
  entry_date: z.string().min(1, '유입일을 입력해주세요'),
  approved_amount: z.number().min(0, '승인금액은 0 이상이어야 합니다'),
  commission_rate: z.number().min(0).max(100, '수수료율은 0-100 사이여야 합니다'),
  notes: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  users: User[];
  teams: Team[];
  currentUser: User;
  userRole: UserRole;
  onSubmit: (data: CustomerFormData & { manager_name?: string; team_name?: string }) => Promise<void>;
  isLoading?: boolean;
}

export function CustomerForm({
  open,
  onOpenChange,
  customer,
  users,
  teams,
  currentUser,
  userRole,
  onSubmit,
  isLoading,
}: CustomerFormProps) {
  const isEdit = !!customer;
  const canEditCommission = userRole === 'super_admin';
  const canChangeTeam = userRole === 'super_admin';
  const canChangeManager = userRole === 'super_admin' || userRole === 'team_leader';

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name || '',
      company_name: customer?.company_name || '',
      phone: customer?.phone || '',
      email: customer?.email || '',
      status_code: customer?.status_code || '상담대기',
      manager_id: customer?.manager_id || currentUser.uid,
      team_id: customer?.team_id || currentUser.team_id || '',
      entry_date: customer?.entry_date || new Date().toISOString().split('T')[0],
      approved_amount: customer?.approved_amount || 0,
      commission_rate: customer?.commission_rate || 0,
      notes: customer?.notes || '',
    },
  });

  const handleSubmit = async (data: CustomerFormData) => {
    const manager = users.find(u => u.uid === data.manager_id);
    const team = teams.find(t => t.id === data.team_id);
    
    await onSubmit({
      ...data,
      manager_name: manager?.name,
      team_name: team?.name,
    });
    
    form.reset();
    onOpenChange(false);
  };

  // Get available managers based on role and team
  const availableManagers = userRole === 'super_admin' 
    ? users 
    : userRole === 'team_leader'
      ? users.filter(u => u.team_id === currentUser.team_id)
      : [currentUser];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '고객 정보 수정' : '새 고객 등록'}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>고객명 *</FormLabel>
                    <FormControl>
                      <Input placeholder="홍길동" {...field} data-testid="input-customer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>회사명 *</FormLabel>
                    <FormControl>
                      <Input placeholder="(주)회사명" {...field} data-testid="input-company-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>연락처</FormLabel>
                    <FormControl>
                      <Input placeholder="010-1234-5678" {...field} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>이메일</FormLabel>
                    <FormControl>
                      <Input placeholder="email@company.com" {...field} data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>상태</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="상태 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                name="entry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>유입일 *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-entry-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="team_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>팀 *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                      disabled={!canChangeTeam}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-team">
                          <SelectValue placeholder="팀 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teams
                          .filter(team => team.id && team.id.trim() !== '')
                          .map(team => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
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
                name="manager_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>담당자 *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                      disabled={!canChangeManager}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-manager">
                          <SelectValue placeholder="담당자 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableManagers
                          .filter(user => user.uid && user.uid.trim() !== '')
                          .map(user => (
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="approved_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>승인금액 (원)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="50000000" 
                        {...field}
                        onChange={e => field.onChange(Number(e.target.value))}
                        data-testid="input-approved-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {canEditCommission && (
                <FormField
                  control={form.control}
                  name="commission_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>수수료율 (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.1"
                          placeholder="10.5" 
                          {...field}
                          onChange={e => field.onChange(Number(e.target.value))}
                          data-testid="input-commission-rate"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>메모</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="고객 관련 메모를 입력하세요" 
                      {...field}
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                취소
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="button-submit">
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEdit ? '수정' : '등록'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
