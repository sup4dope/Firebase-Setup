import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Customer } from '@shared/types';

interface CustomerInfoEditModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSave: (customerId: string, data: {
    commission_rate: number;
    contract_amount: number;
    execution_amount: number;
    contract_date?: string;
    execution_date?: string;
  }) => Promise<void>;
}

export function CustomerInfoEditModal({
  open,
  onClose,
  customer,
  onSave,
}: CustomerInfoEditModalProps) {
  const [commissionRate, setCommissionRate] = useState('');
  const [contractAmount, setContractAmount] = useState('');
  const [executionAmount, setExecutionAmount] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [executionDate, setExecutionDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (customer && open) {
      setCommissionRate(String(customer.commission_rate || customer.contract_fee_rate || ''));
      setContractAmount(String(customer.contract_amount || customer.deposit_amount || ''));
      setExecutionAmount(String(customer.execution_amount || ''));
      setContractDate((customer as any).contract_date || '');
      setExecutionDate((customer as any).execution_date || '');
    }
  }, [customer, open]);

  const handleSave = async () => {
    if (!customer) return;
    
    setIsSaving(true);
    try {
      await onSave(customer.id, {
        commission_rate: Number(commissionRate) || 0,
        contract_amount: Number(contractAmount) || 0,
        execution_amount: Number(executionAmount) || 0,
        contract_date: contractDate || undefined,
        execution_date: executionDate || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save customer info:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>정보 수정</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground mb-4">
            고객: <span className="font-medium text-foreground">{customer.company_name || customer.name}</span>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contract_date">계약일</Label>
            <Input
              id="contract_date"
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              data-testid="input-contract-date"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contract_amount">계약금 (만원)</Label>
            <Input
              id="contract_amount"
              type="number"
              value={contractAmount}
              onChange={(e) => setContractAmount(e.target.value)}
              placeholder="예: 5000"
              data-testid="input-contract-amount"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="commission_rate">자문료율 (%)</Label>
            <Input
              id="commission_rate"
              type="number"
              step="0.1"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              placeholder="예: 3.5"
              data-testid="input-commission-rate"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="execution_date">집행일</Label>
            <Input
              id="execution_date"
              type="date"
              value={executionDate}
              onChange={(e) => setExecutionDate(e.target.value)}
              data-testid="input-execution-date"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="execution_amount">집행금액 (만원)</Label>
            <Input
              id="execution_amount"
              type="number"
              value={executionAmount}
              onChange={(e) => setExecutionAmount(e.target.value)}
              placeholder="예: 10000"
              data-testid="input-execution-amount"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-info">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                저장 중...
              </>
            ) : (
              '저장'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
