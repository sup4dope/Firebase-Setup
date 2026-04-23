import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CustomerDetailModal } from '@/components/CustomerDetailModal';
import { getCustomerById, updateCustomer, deleteCustomer, getCustomers, getUsers } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Customer, User } from '@shared/types';

interface CustomerDetailContextValue {
  openCustomerDetailById: (customerId: string) => Promise<void>;
  openCustomerDetailByName: (name: string) => Promise<void>;
}

const CustomerDetailContext = createContext<CustomerDetailContextValue | null>(null);

export function useCustomerDetail() {
  const ctx = useContext(CustomerDetailContext);
  if (!ctx) throw new Error('useCustomerDetail must be used within CustomerDetailProvider');
  return ctx;
}

export function CustomerDetailProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // 모달이 처음 열릴 때만 users/customers 미리 로드 (TODO 폼/담당자 선택용)
  const ensureRefData = useCallback(async () => {
    if (users.length === 0) {
      try {
        const u = await getUsers();
        setUsers(u);
      } catch (e) {
        console.warn('[CustomerDetailContext] users 로드 실패', e);
      }
    }
    if (allCustomers.length === 0) {
      try {
        const c = await getCustomers();
        setAllCustomers(c);
      } catch (e) {
        console.warn('[CustomerDetailContext] customers 로드 실패', e);
      }
    }
  }, [users.length, allCustomers.length]);

  const openCustomerDetailById = useCallback(async (customerId: string) => {
    if (!customerId) return;
    try {
      const c = await getCustomerById(customerId);
      if (!c) {
        toast({ title: '안내', description: '해당 고객 정보를 찾을 수 없습니다.', variant: 'destructive' });
        return;
      }
      await ensureRefData();
      setCustomer(c);
      setOpen(true);
    } catch (e: any) {
      console.error('[CustomerDetailContext] open error:', e);
      toast({ title: '오류', description: '고객 정보 로딩 중 문제가 발생했습니다.', variant: 'destructive' });
    }
  }, [ensureRefData, toast]);

  const openCustomerDetailByName = useCallback(async (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    await ensureRefData();
    // 최신 customers 스냅샷
    let pool = allCustomers;
    if (pool.length === 0) {
      try { pool = await getCustomers(); setAllCustomers(pool); } catch {}
    }
    // 이름 또는 회사명 일치 검색 (이름 우선)
    const matches = pool.filter(c =>
      (c.name && c.name === trimmed) || (c.company_name && c.company_name === trimmed)
    );
    if (matches.length === 0) {
      toast({ title: '안내', description: `"${trimmed}" 고객을 찾을 수 없습니다.`, variant: 'destructive' });
      return;
    }
    if (matches.length > 1) {
      toast({ title: '안내', description: `동명의 고객이 ${matches.length}명입니다. 가장 최근 등록 건을 표시합니다.` });
    }
    // 최근 등록 건 우선
    const sorted = [...matches].sort((a, b) => {
      const ta = (a.created_at instanceof Date) ? a.created_at.getTime() : 0;
      const tb = (b.created_at instanceof Date) ? b.created_at.getTime() : 0;
      return tb - ta;
    });
    await openCustomerDetailById(sorted[0].id);
  }, [allCustomers, ensureRefData, openCustomerDetailById, toast]);

  // 전역 dblclick 위임: data-customer-detail-id 또는 data-customer-detail-name 속성을 가진 엘리먼트
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest('[data-customer-detail-id], [data-customer-detail-name]') as HTMLElement | null;
      if (!el) return;
      const id = el.getAttribute('data-customer-detail-id');
      const name = el.getAttribute('data-customer-detail-name');
      if (id) {
        e.preventDefault();
        e.stopPropagation();
        openCustomerDetailById(id);
      } else if (name) {
        e.preventDefault();
        e.stopPropagation();
        openCustomerDetailByName(name);
      }
    };
    document.addEventListener('dblclick', handler);
    return () => document.removeEventListener('dblclick', handler);
  }, [openCustomerDetailById, openCustomerDetailByName]);

  const handleSave = useCallback(async (data: Partial<Customer>): Promise<string | undefined> => {
    if (!data.id) return undefined;
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    ) as Partial<Customer>;
    if ('_serverSynced' in cleanData) {
      delete (cleanData as any)._serverSynced;
      return cleanData.id;
    }
    try {
      // 메모/직접 업데이트는 모달 내부에서 이미 저장한 경우가 있어, ID만 있으면 안전한 업데이트만 수행
      const isMemoOnly = Object.keys(cleanData).every(key =>
        ['id', 'recent_memo', 'latest_memo', 'last_memo_date', 'memo_history'].includes(key)
      );
      if (isMemoOnly) {
        return cleanData.id;
      }
      await updateCustomer(cleanData.id!, cleanData);
      // 현재 모달의 customer 상태도 갱신
      setCustomer(prev => prev && prev.id === cleanData.id ? { ...prev, ...cleanData } as Customer : prev);
      return cleanData.id;
    } catch (e: any) {
      console.error('[CustomerDetailContext] save error:', e);
      toast({ title: '오류', description: '저장 중 문제가 발생했습니다.', variant: 'destructive' });
      throw e;
    }
  }, [toast]);

  const handleDelete = useCallback(async (customerId: string) => {
    try {
      await deleteCustomer(customerId);
      setOpen(false);
      setCustomer(null);
      toast({ title: '성공', description: '고객이 삭제되었습니다.' });
    } catch (e) {
      console.error('[CustomerDetailContext] delete error:', e);
      toast({ title: '오류', description: '삭제 중 문제가 발생했습니다.', variant: 'destructive' });
    }
  }, [toast]);

  const value = useMemo(() => ({ openCustomerDetailById, openCustomerDetailByName }), [openCustomerDetailById, openCustomerDetailByName]);

  return (
    <CustomerDetailContext.Provider value={value}>
      {children}
      <CustomerDetailModal
        isOpen={open}
        onClose={() => { setOpen(false); setCustomer(null); }}
        customer={customer}
        currentUser={user}
        users={users}
        customers={allCustomers}
        onSave={handleSave}
        onDelete={handleDelete}
        initialTab="memo"
      />
    </CustomerDetailContext.Provider>
  );
}
