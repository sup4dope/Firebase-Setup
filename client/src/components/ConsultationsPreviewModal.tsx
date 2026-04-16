import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Download, X, Phone, Building2, Calendar, CreditCard, MapPin, FileText, AlertCircle, Clock, Trash2, UserPlus, Users, Globe, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startOfWeek, startOfMonth, startOfDay } from 'date-fns';
import { 
  getPendingConsultations, 
  getCustomerByBusinessNumber, 
  getCustomerByPhone,
  importAllPendingConsultations, 
  processConsultationToCustomer, 
  deleteConsultation, 
  getActiveStaffForAssignment,
  getCustomersSince,
  mapUtmToEntrySource 
} from '@/lib/firestore';
import type { Consultation, User, Customer } from '@shared/types';

interface ConsultationsPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (result: { success: number; failed: number; newCustomers: number; existingCustomers: number }) => void;
}

interface ConsultationWithDuplicate {
  id: string;
  data: Consultation;
  isDuplicate: boolean;
  duplicateReasons: string[];
}

export function ConsultationsPreviewModal({ open, onOpenChange, onImportComplete }: ConsultationsPreviewModalProps) {
  const [consultations, setConsultations] = useState<ConsultationWithDuplicate[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sendingDelay, setSendingDelay] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [staffList, setStaffList] = useState<User[]>([]);
  const [selectedManagers, setSelectedManagers] = useState<Record<string, string>>({});
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showAssignmentStats, setShowAssignmentStats] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'new' | 'duplicate' | string>('all');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchConsultations();
      fetchStaffList();
      fetchCustomers();
      setFilterMode('all');
    }
  }, [open]);

  const normalizePhone = (phone: string) => phone.replace(/[-\s]/g, '').trim();

  const fetchConsultations = async () => {
    setLoading(true);
    try {
      const pending = await getPendingConsultations();

      const consultationsWithDuplicate: ConsultationWithDuplicate[] = await Promise.all(
        pending.map(async ({ id, data }) => {
          const reasons: string[] = [];

          if (data.businessNumber) {
            const existing = await getCustomerByBusinessNumber(data.businessNumber);
            if (existing) {
              reasons.push(`사업자번호 중복 (기존 고객: ${existing.name || existing.company_name})`);
            }
          }

          if (data.phone) {
            const normalizedPhone = normalizePhone(data.phone);
            if (normalizedPhone.length >= 10) {
              const existing = await getCustomerByPhone(normalizedPhone);
              if (existing) {
                reasons.push(`연락처 중복 (기존 고객: ${existing.name || existing.company_name})`);
              }
            }
          }

          return { id, data, isDuplicate: reasons.length > 0, duplicateReasons: reasons };
        })
      );

      const normalizeBiz = (biz: string) => biz.replace(/[-\s]/g, '').trim();

      const phoneMap = new Map<string, string[]>();
      const bizNumMap = new Map<string, string[]>();
      for (const c of consultationsWithDuplicate) {
        if (c.data.phone) {
          const np = normalizePhone(c.data.phone);
          if (np.length >= 10) {
            if (!phoneMap.has(np)) phoneMap.set(np, []);
            phoneMap.get(np)!.push(c.id);
          }
        }
        if (c.data.businessNumber) {
          const bn = normalizeBiz(c.data.businessNumber);
          if (bn) {
            if (!bizNumMap.has(bn)) bizNumMap.set(bn, []);
            bizNumMap.get(bn)!.push(c.id);
          }
        }
      }

      for (const c of consultationsWithDuplicate) {
        if (c.data.phone) {
          const np = normalizePhone(c.data.phone);
          const group = phoneMap.get(np);
          if (group && group.length > 1) {
            c.duplicateReasons.push(`대기목록 내 연락처 중복 (${group.length}건)`);
            c.isDuplicate = true;
          }
        }
        if (c.data.businessNumber) {
          const bn = normalizeBiz(c.data.businessNumber);
          const group = bizNumMap.get(bn);
          if (group && group.length > 1) {
            c.duplicateReasons.push(`대기목록 내 사업자번호 중복 (${group.length}건)`);
            c.isDuplicate = true;
          }
        }
      }

      setConsultations(consultationsWithDuplicate);
    } catch (error) {
      console.error('Error fetching consultations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffList = async () => {
    try {
      const staff = await getActiveStaffForAssignment();
      setStaffList(staff);
    } catch (error) {
      console.error('Error fetching staff list:', error);
    }
  };

  const fetchCustomers = async () => {
    setLoadingStats(true);
    try {
      const monthStart = startOfMonth(new Date());
      const customers = await getCustomersSince(monthStart);
      setRecentCustomers(customers);
    } catch (error) {
      console.error('Error fetching customers for stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const assignmentStats = useMemo(() => {
    if (staffList.length === 0) return [];

    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });

    const byManager: Record<string, { today: number; week: number; month: number }> = {};
    for (const c of recentCustomers) {
      if (!c.manager_id) continue;
      if (!byManager[c.manager_id]) {
        byManager[c.manager_id] = { today: 0, week: 0, month: 0 };
      }
      const d = c.created_at instanceof Date ? c.created_at : new Date(c.created_at);
      byManager[c.manager_id].month++;
      if (d >= weekStart) byManager[c.manager_id].week++;
      if (d >= todayStart) byManager[c.manager_id].today++;
    }

    return staffList.map(staff => ({
      uid: staff.uid,
      name: staff.name,
      teamName: staff.team_name || '미배정',
      todayCount: byManager[staff.uid]?.today || 0,
      weekCount: byManager[staff.uid]?.week || 0,
      monthCount: byManager[staff.uid]?.month || 0,
    })).sort((a, b) => b.todayCount - a.todayCount || b.weekCount - a.weekCount);
  }, [staffList, recentCustomers]);

  const handleImportAll = async () => {
    setImporting(true);
    try {
      const result = await importAllPendingConsultations();
      onImportComplete(result);
      onOpenChange(false);
    } catch (error) {
      console.error('Error importing consultations:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleImportSingle = async (consultation: ConsultationWithDuplicate, mode: 'auto' | 'manual') => {
    const { id, data } = consultation;
    
    setImportingIds(prev => new Set(prev).add(id));
    try {
      let managerOverride: { managerId: string; managerName: string; managerPhone: string; teamId: string; teamName: string } | undefined = undefined;

      if (mode === 'manual') {
        const selectedManagerId = selectedManagers[id];
        if (!selectedManagerId) {
          toast({
            title: '담당자 미선택',
            description: '지정 분배할 담당자를 먼저 선택해 주세요.',
            variant: 'destructive',
          });
          return;
        }
        const manager = staffList.find(s => s.uid === selectedManagerId);
        if (manager) {
          managerOverride = {
            managerId: manager.uid,
            managerName: manager.name,
            managerPhone: manager.phone_work || manager.phone || '',
            teamId: manager.team_id || '',
            teamName: manager.team_name || '미배정',
          };
        }
      }

      const businessNumber = data.businessNumber || '';
      const phoneNorm = data.phone ? normalizePhone(data.phone) : '';
      let wasExisting = false;
      if (businessNumber) {
        const existing = await getCustomerByBusinessNumber(businessNumber);
        wasExisting = !!existing;
      }
      if (!wasExisting && phoneNorm.length >= 10) {
        const existing = await getCustomerByPhone(phoneNorm);
        wasExisting = !!existing;
      }

      await processConsultationToCustomer(id, data, managerOverride);

      setConsultations(prev => prev.filter(c => c.id !== id));
      
      toast({
        title: '유입 완료',
        description: `${data.name || '이름 없음'} - ${wasExisting ? '기존 고객에 메모 추가' : '신규 고객 생성'}${mode === 'manual' && managerOverride ? ` (담당: ${managerOverride.managerName})` : ' (자동 배정)'}`,
      });
    } catch (error) {
      console.error(`Failed to import consultation ${id}:`, error);
      toast({
        title: '유입 실패',
        description: `${data.name || '이름 없음'} 유입 중 오류가 발생했습니다.`,
        variant: 'destructive',
      });
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDeleteSingle = async (consultation: ConsultationWithDuplicate) => {
    const { id, data } = consultation;
    
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      await deleteConsultation(id);
      setConsultations(prev => prev.filter(c => c.id !== id));
      toast({
        title: '삭제 완료',
        description: `${data.name || '이름 없음'} 상담 데이터가 삭제되었습니다.`,
      });
    } catch (error) {
      console.error(`Failed to delete consultation ${id}:`, error);
      toast({
        title: '삭제 실패',
        description: '삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSendDelayNotification = async () => {
    if (consultations.length === 0) return;
    
    setSendingDelay(true);
    try {
      const customers = consultations.map(({ data }) => ({
        customerPhone: data.phone || '',
        customerName: data.name || '',
        services: data.services || [],
      })).filter(c => c.customerPhone);
      
      if (customers.length === 0) {
        toast({
          title: '발송 실패',
          description: '전화번호가 있는 고객이 없습니다.',
          variant: 'destructive',
        });
        return;
      }
      
      const { authFetch } = await import('@/lib/firebase');
      const response = await authFetch('/api/solapi/delay-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: '지연 알림 발송 완료',
          description: `${result.successCount}건 발송 성공, ${result.failCount}건 실패`,
        });
      } else {
        toast({
          title: '발송 실패',
          description: result.error || result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending delay notification:', error);
      toast({
        title: '발송 오류',
        description: '지연 알림 발송 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSendingDelay(false);
    }
  };

  const newCount = consultations.filter(c => !c.isDuplicate).length;
  const duplicateCount = consultations.filter(c => c.isDuplicate).length;
  const isAnyProcessing = importing || importingIds.size > 0 || deletingIds.size > 0;

  const sourceCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    consultations.forEach(({ data }) => {
      const source = mapUtmToEntrySource(data.utm_source, data.source, data.utm_campaign);
      map[source] = (map[source] || 0) + 1;
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted;
  }, [consultations]);

  const filteredConsultations = useMemo(() => {
    if (filterMode === 'all') return consultations;
    if (filterMode === 'new') return consultations.filter(c => !c.isDuplicate);
    if (filterMode === 'duplicate') return consultations.filter(c => c.isDuplicate);
    return consultations.filter(c => {
      const source = mapUtmToEntrySource(c.data.utm_source, c.data.source, c.data.utm_campaign);
      return source === filterMode;
    });
  }, [consultations, filterMode]);

  const toggleFilter = (mode: string) => {
    setFilterMode(prev => prev === mode ? 'all' : mode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] md:max-h-[85vh] flex flex-col p-0 transition-all duration-300 ${showAssignmentStats ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <DialogHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 border-b shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5" />
            DB 유입 프리뷰
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            랜딩페이지에서 접수된 상담 신청 데이터를 확인 후 고객으로 유입할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : consultations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>미처리 상담 데이터가 없습니다.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 md:px-6 py-2 md:py-3 bg-muted/50 border-b shrink-0 space-y-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex items-center gap-3 md:gap-4 text-sm">
                    <button
                      onClick={() => setFilterMode('all')}
                      className={`text-muted-foreground transition-colors ${filterMode === 'all' ? 'font-semibold text-foreground' : 'hover:text-foreground'}`}
                      data-testid="button-filter-all"
                    >
                      총 <span className="font-semibold text-foreground">{consultations.length}건</span>
                      {filterMode !== 'all' && <span className="text-xs ml-1">({filteredConsultations.length}건 표시중)</span>}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`cursor-pointer transition-all ${filterMode === 'new' ? 'ring-2 ring-green-500 bg-green-200 dark:bg-green-800/50' : 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-800/40'} text-green-700 dark:text-green-400`}
                        onClick={() => toggleFilter('new')}
                        data-testid="button-filter-new"
                      >
                        신규 {newCount}건
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`cursor-pointer transition-all ${filterMode === 'duplicate' ? 'ring-2 ring-amber-500 bg-amber-200 dark:bg-amber-800/50' : 'bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/40'} text-amber-700 dark:text-amber-400`}
                        onClick={() => toggleFilter('duplicate')}
                        data-testid="button-filter-duplicate"
                      >
                        중복 {duplicateCount}건
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <button
                      onClick={() => setShowAssignmentStats(!showAssignmentStats)}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${showAssignmentStats ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid="button-toggle-assignment-stats"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>배정 현황</span>
                      {showAssignmentStats ? <X className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <p className="text-xs text-muted-foreground hidden md:inline">
                      * 중복: 사업자번호/연락처 기준 기존 고객 또는 대기목록 내 중복
                    </p>
                  </div>
                </div>
                {sourceCountMap.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      유입경로별:
                    </span>
                    {sourceCountMap.map(([source, count]) => (
                      <Badge
                        key={source}
                        variant="outline"
                        className={`text-xs font-normal gap-1 cursor-pointer transition-all ${filterMode === source ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted'}`}
                        onClick={() => toggleFilter(source)}
                        data-testid={`badge-source-count-${source}`}
                      >
                        {source}
                        <span className="font-semibold text-foreground">{count}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-4 space-y-3">
                  {filteredConsultations.map(({ id, data, isDuplicate, duplicateReasons }, index) => {
                    const isItemImporting = importingIds.has(id);
                    const isItemDeleting = deletingIds.has(id);
                    const isItemBusy = isItemImporting || isItemDeleting;

                    return (
                      <div 
                        key={id} 
                        className={`p-4 border rounded-lg space-y-3 ${
                          isDuplicate 
                            ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/10' 
                            : 'border-border bg-card'
                        } ${isItemBusy ? 'opacity-60 pointer-events-none' : ''}`}
                        data-testid={`card-consultation-${id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs font-mono shrink-0">
                                #{index + 1}
                              </Badge>
                              <h3 className="font-semibold text-foreground">{data.name || '이름 없음'}</h3>
                              {data.businessName && (
                                <span className="text-sm text-muted-foreground">({data.businessName})</span>
                              )}
                              {isDuplicate && duplicateReasons.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {duplicateReasons.map((reason, ri) => (
                                    <Badge key={ri} variant="outline" className={`text-xs ${
                                      reason.includes('대기목록') 
                                        ? 'border-red-500 text-red-600 dark:text-red-400' 
                                        : 'border-amber-500 text-amber-600 dark:text-amber-400'
                                    }`}>
                                      {reason}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {isDuplicate && duplicateReasons.length === 0 && (
                                <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 text-xs">
                                  기존 고객
                                </Badge>
                              )}
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                              {data.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3.5 h-3.5" />
                                  {data.phone}
                                </span>
                              )}
                              {data.businessNumber && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3.5 h-3.5" />
                                  {data.businessNumber}
                                </span>
                              )}
                              {data.region && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" />
                                  {data.region}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(data.createdAt, 'yyyy.MM.dd HH:mm', { locale: ko })}
                              </span>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => handleDeleteSingle({ id, data, isDuplicate })}
                            disabled={isAnyProcessing}
                            data-testid={`button-delete-consultation-${id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          {data.businessAge && (
                            <Badge variant="secondary" className="font-normal">
                              업력: {data.businessAge}
                            </Badge>
                          )}
                          {data.revenue && (
                            <Badge variant="secondary" className="font-normal">
                              매출: {data.revenue}
                            </Badge>
                          )}
                          {data.creditScore && (
                            <Badge variant="secondary" className="font-normal">
                              <CreditCard className="w-3 h-3 mr-1" />
                              {data.creditScore}
                            </Badge>
                          )}
                          {data.taxStatus && (
                            <Badge variant="secondary" className="font-normal">
                              {data.taxStatus}
                            </Badge>
                          )}
                        </div>

                        {data.services && data.services.length > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">신청 서비스:</span>
                            <div className="flex flex-wrap gap-1">
                              {data.services.map((service, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs font-normal">
                                  {service}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs">
                          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">유입경로:</span>
                          <Badge variant="secondary" className="text-xs font-normal">
                            {mapUtmToEntrySource(data.utm_source, data.source, data.utm_campaign)}
                          </Badge>
                          {data.utm_source && data.utm_source !== 'direct' && (
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                              {data.utm_source}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => handleImportSingle({ id, data, isDuplicate }, 'auto')}
                            disabled={isAnyProcessing}
                            data-testid={`button-import-auto-${id}`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            {isItemImporting ? '유입 중...' : '자동 배정 유입'}
                          </Button>

                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <Select
                              value={selectedManagers[id] || ''}
                              onValueChange={(value) => setSelectedManagers(prev => ({ ...prev, [id]: value }))}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px]" data-testid={`select-manager-${id}`}>
                                <SelectValue placeholder="담당자 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {staffList.map(staff => (
                                  <SelectItem key={staff.uid} value={staff.uid}>
                                    {staff.name} {staff.team_name ? `(${staff.team_name})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1 shrink-0"
                              onClick={() => handleImportSingle({ id, data, isDuplicate }, 'manual')}
                              disabled={isAnyProcessing || !selectedManagers[id]}
                              data-testid={`button-import-manual-${id}`}
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              지정 유입
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          </div>

          {showAssignmentStats && (
            <div className="w-full md:w-[280px] shrink-0 border-t md:border-t-0 md:border-l bg-muted/20 flex flex-col overflow-hidden max-h-[40vh] md:max-h-none">
              <div className="px-4 py-3 border-b bg-muted/50 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4" />
                    직원별 DB 배정 현황
                  </h3>
                  <button
                    onClick={() => setShowAssignmentStats(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {loadingStats ? (
                  <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                    <span className="animate-pulse">로딩 중...</span>
                  </div>
                ) : assignmentStats.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    이번 달 배정 데이터가 없습니다.
                  </div>
                ) : (
                  <div className="divide-y">
                    {assignmentStats.map(stat => (
                      <div key={stat.uid} className="px-4 py-2.5 hover:bg-muted/30 transition-colors" data-testid={`row-assignment-${stat.uid}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{stat.name}</span>
                          <span className="text-[10px] text-muted-foreground">{stat.teamName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">오늘</span>
                            <span className={stat.todayCount > 0 ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}>
                              {stat.todayCount}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">주</span>
                            <span className="font-medium">{stat.weekCount}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">월</span>
                            <span className="font-medium">{stat.monthCount}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-2.5 bg-muted/40">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">합계</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-medium">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">오늘</span>
                          <span className="text-blue-600 dark:text-blue-400 font-bold">
                            {assignmentStats.reduce((sum, s) => sum + s.todayCount, 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">주</span>
                          <span>{assignmentStats.reduce((sum, s) => sum + s.weekCount, 0)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">월</span>
                          <span>{assignmentStats.reduce((sum, s) => sum + s.monthCount, 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-3 md:px-6 py-3 md:py-4 border-t bg-muted/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 shrink-0">
          <p className="text-xs text-muted-foreground hidden md:block">
            * 신규 고객은 자동 생성되고, 중복 고객은 기존 고객에 메모로 추가됩니다.
          </p>
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            <Button 
              variant="outline" 
              onClick={handleSendDelayNotification}
              disabled={sendingDelay || isAnyProcessing || consultations.length === 0}
              data-testid="button-send-delay-notification"
            >
              <Clock className="w-4 h-4 mr-1" />
              {sendingDelay ? '발송 중...' : '지연 알림 발송'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAnyProcessing || sendingDelay}>
              <X className="w-4 h-4 mr-1" />
              닫기
            </Button>
            <Button 
              onClick={handleImportAll} 
              disabled={isAnyProcessing || sendingDelay || consultations.length === 0}
              data-testid="button-confirm-import"
            >
              <Download className="w-4 h-4 mr-2" />
              {importing ? '유입 중...' : `전체 ${consultations.length}건 유입`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
