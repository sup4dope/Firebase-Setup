import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CustomerDetailModal } from '@/components/CustomerDetailModal';
import { getCustomerById, updateCustomer, deleteCustomer, getCustomersScoped, getUsers } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Customer, User } from '@shared/types';

interface CustomerDetailContextValue {
  openCustomerDetailById: (customerId: string) => Promise<void>;
  openCustomerDetailByName: (name: string, hints?: { phone?: string; businessNumber?: string }) => Promise<void>;
}

const normalizeDigits = (v: string | undefined | null) => (v || '').replace(/[-\s]/g, '').trim();

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
    if (allCustomers.length === 0 && user) {
      try {
        const c = await getCustomersScoped(user);
        setAllCustomers(c);
      } catch (e) {
        console.warn('[CustomerDetailContext] customers 로드 실패', e);
      }
    }
  }, [users.length, allCustomers.length, user]);

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

  const openCustomerDetailByName = useCallback(async (name: string, hints?: { phone?: string; businessNumber?: string }) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    await ensureRefData();
    // 최신 customers 스냅샷
    let pool = allCustomers;
    if (pool.length === 0 && user) {
      try { pool = await getCustomersScoped(user); setAllCustomers(pool); } catch {}
    }
    // 이름/회사명 트림 비교 (저장값에 후행 공백이 있는 경우 대비)
    const matches = pool.filter(c =>
      (c.name && c.name.trim() === trimmed) || (c.company_name && c.company_name.trim() === trimmed)
    );
    if (matches.length === 0) {
      toast({ title: '안내', description: `"${trimmed}" 고객을 찾을 수 없습니다.`, variant: 'destructive' });
      return;
    }

    // 동명의 고객이 여러 명일 때, phone/biz 힌트가 있으면 정확히 일치하는 건을 우선 선택
    const phoneHint = normalizeDigits(hints?.phone);
    const bizHint = normalizeDigits(hints?.businessNumber);
    let chosen = matches[0];
    if (matches.length > 1) {
      const exactByPhone = phoneHint
        ? matches.find(c => normalizeDigits((c as any).phone) === phoneHint)
        : undefined;
      const exactByBiz = bizHint
        ? matches.find(c => normalizeDigits((c as any).business_registration_number) === bizHint)
        : undefined;
      if (exactByPhone || exactByBiz) {
        chosen = exactByPhone || exactByBiz!;
      } else {
        // 힌트로 식별 불가 → 가장 최근 등록 건을 표시 (기존 동작)
        const sorted = [...matches].sort((a, b) => {
          const ta = (a.created_at instanceof Date) ? a.created_at.getTime() : 0;
          const tb = (b.created_at instanceof Date) ? b.created_at.getTime() : 0;
          return tb - ta;
        });
        chosen = sorted[0];
        toast({ title: '안내', description: `동명의 고객이 ${matches.length}명입니다. 가장 최근 등록 건을 표시합니다.` });
      }
    }
    await openCustomerDetailById(chosen.id);
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
      const phoneHint = el.getAttribute('data-customer-detail-phone') || undefined;
      const bizHint = el.getAttribute('data-customer-detail-biz') || undefined;
      if (id) {
        e.preventDefault();
        e.stopPropagation();
        openCustomerDetailById(id);
      } else if (name) {
        e.preventDefault();
        e.stopPropagation();
        openCustomerDetailByName(name, { phone: phoneHint, businessNumber: bizHint });
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
