import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Loader2, AlertCircle, Calculator, Phone, User } from 'lucide-react';
import type { Customer } from '@shared/types';

interface PaymentSendModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSuccess?: (billId: string, amount: number) => void;
}

export default function PaymentSendModal({ open, onClose, customer, onSuccess }: PaymentSendModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [contractAmount, setContractAmount] = useState(0);
  const [phone, setPhone] = useState('');
  const [expireDt, setExpireDt] = useState('');

  useEffect(() => {
    if (customer && open) {
      setContractAmount(customer.contract_amount || 0);
      setPhone(customer.phone || '');
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);
      setExpireDt(futureDate.toISOString().split('T')[0]);
    }
  }, [customer, open]);

  const priceWon = Math.round(contractAmount * 10000 * 1.1);
  const vatAmount = Math.round(contractAmount * 10000 * 0.1);

  const handleSend = async () => {
    if (!customer || !user) return;
    if (!contractAmount || contractAmount <= 0) {
      toast({ title: '오류', description: '계약금을 입력해주세요.', variant: 'destructive' });
      return;
    }
    if (!phone) {
      toast({ title: '오류', description: '연락처를 입력해주세요.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const response = await authFetch('/api/paymint/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer.id,
          customer_name: customer.company_name || customer.representative_name || '',
          phone,
          contract_amount_manwon: contractAmount,
          manager_id: customer.manager_id || '',
          manager_name: customer.manager_name || '',
          expire_dt: expireDt || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '청구서 발송에 실패했습니다.');
      }

      toast({
        title: '결제 청구서 발송 완료',
        description: `${customer.company_name || customer.representative_name}님에게 ${priceWon.toLocaleString()}원 청구서가 발송되었습니다.`,
      });

      onSuccess?.(data.bill_id, priceWon);
      onClose();
    } catch (error: any) {
      console.error('[PaymentSendModal] 오류:', error);
      toast({
        title: '발송 실패',
        description: error.message || '청구서 발송 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="payment-send-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-500" />
            결제 청구서 발송
          </DialogTitle>
          <DialogDescription>
            결제선생을 통해 카드 결제 청구서를 발송합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">고객:</span>
              <span className="font-medium" data-testid="payment-customer-name">
                {customer.company_name || customer.representative_name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">현재 상태:</span>
              <span className="font-medium">{customer.status_code}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-phone">수신 전화번호</Label>
            <Input
              id="payment-phone"
              data-testid="payment-phone-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount">계약금 (만원)</Label>
            <Input
              id="payment-amount"
              data-testid="payment-amount-input"
              type="number"
              value={contractAmount || ''}
              onChange={(e) => setContractAmount(Number(e.target.value))}
              placeholder="계약금 (만원 단위)"
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
              <Calculator className="h-4 w-4" />
              결제 금액 계산
            </div>
            <div className="grid grid-cols-2 gap-1 text-sm">
              <span className="text-muted-foreground">계약금:</span>
              <span className="text-right">{(contractAmount * 10000).toLocaleString()}원</span>
              <span className="text-muted-foreground">VAT (10%):</span>
              <span className="text-right">{vatAmount.toLocaleString()}원</span>
              <span className="font-medium border-t pt-1">청구 금액:</span>
              <span className="text-right font-bold text-blue-600 dark:text-blue-400 border-t pt-1" data-testid="payment-total-amount">
                {priceWon.toLocaleString()}원
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-expire">유효기간</Label>
            <Input
              id="payment-expire"
              data-testid="payment-expire-input"
              type="date"
              value={expireDt}
              onChange={(e) => setExpireDt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">입력일 자정까지 결제 가능합니다.</p>
          </div>

          {contractAmount > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>고객이 결제를 완료하면 자동으로 '계약완료(선불)' 상태로 변경됩니다.</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={sending} data-testid="payment-cancel-btn">
            취소
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !contractAmount || contractAmount <= 0 || !phone}
            data-testid="payment-send-btn"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                발송 중...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                청구서 발송
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
