import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Download, X, Phone, Building2, Calendar, CreditCard, MapPin, FileText, AlertCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPendingConsultations, getCustomerByBusinessNumber, importAllPendingConsultations } from '@/lib/firestore';
import type { Consultation } from '@shared/types';

interface ConsultationsPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (result: { success: number; failed: number; newCustomers: number; existingCustomers: number }) => void;
}

interface ConsultationWithDuplicate {
  id: string;
  data: Consultation;
  isDuplicate: boolean;
}

export function ConsultationsPreviewModal({ open, onOpenChange, onImportComplete }: ConsultationsPreviewModalProps) {
  const [consultations, setConsultations] = useState<ConsultationWithDuplicate[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sendingDelay, setSendingDelay] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchConsultations();
    }
  }, [open]);

  const fetchConsultations = async () => {
    setLoading(true);
    try {
      const pending = await getPendingConsultations();
      
      const consultationsWithDuplicate: ConsultationWithDuplicate[] = await Promise.all(
        pending.map(async ({ id, data }) => {
          let isDuplicate = false;
          if (data.businessNumber) {
            const existing = await getCustomerByBusinessNumber(data.businessNumber);
            isDuplicate = !!existing;
          }
          return { id, data, isDuplicate };
        })
      );
      
      setConsultations(consultationsWithDuplicate);
    } catch (error) {
      console.error('Error fetching consultations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
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
      
      const response = await fetch('/api/solapi/delay-notify', {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5" />
            DB 유입 프리뷰
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            랜딩페이지에서 접수된 상담 신청 데이터를 확인 후 고객으로 유입할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
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
              <div className="px-6 py-3 bg-muted/50 border-b flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">총 <span className="font-semibold text-foreground">{consultations.length}건</span></span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      신규 {newCount}건
                    </Badge>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      중복 {duplicateCount}건
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  * 중복: 사업자등록번호가 이미 등록된 고객 (메모로 추가됨)
                </p>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {consultations.map(({ id, data, isDuplicate }) => (
                    <div 
                      key={id} 
                      className={`p-4 border rounded-lg space-y-3 ${
                        isDuplicate 
                          ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/10' 
                          : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-foreground">{data.name || '이름 없음'}</h3>
                            {data.businessName && (
                              <span className="text-sm text-muted-foreground">({data.businessName})</span>
                            )}
                            {isDuplicate && (
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
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            * 신규 고객은 자동 생성되고, 중복 고객은 기존 고객에 메모로 추가됩니다.
          </p>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleSendDelayNotification}
              disabled={sendingDelay || importing || consultations.length === 0}
              data-testid="button-send-delay-notification"
            >
              <Clock className="w-4 h-4 mr-1" />
              {sendingDelay ? '발송 중...' : '지연 알림 발송'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing || sendingDelay}>
              <X className="w-4 h-4 mr-1" />
              취소
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={importing || sendingDelay || consultations.length === 0}
              data-testid="button-confirm-import"
            >
              <Download className="w-4 h-4 mr-2" />
              {importing ? '유입 중...' : `${consultations.length}건 유입하기`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
