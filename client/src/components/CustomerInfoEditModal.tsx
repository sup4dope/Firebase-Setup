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
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Customer, ProcessingOrg } from '@shared/types';

interface OrgExecutionData {
  org: string;
  execution_date: string;
  execution_amount: string;
}

interface CustomerInfoEditModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSave: (customerId: string, data: {
    commission_rate: number;
    contract_amount: number;
    contract_date?: string;
    processing_orgs?: ProcessingOrg[];
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
  const [contractDate, setContractDate] = useState('');
  const [orgExecutions, setOrgExecutions] = useState<OrgExecutionData[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (customer && open) {
      setCommissionRate(String(customer.commission_rate || customer.contract_fee_rate || ''));
      setContractAmount(String(customer.contract_amount || customer.deposit_amount || ''));
      setContractDate((customer as any).contract_date || '');
      
      const approvedOrgs = (customer.processing_orgs || []).filter(
        (org: ProcessingOrg) => org.status === '승인'
      );
      
      if (approvedOrgs.length > 0) {
        setOrgExecutions(approvedOrgs.map((org: ProcessingOrg) => ({
          org: org.org,
          execution_date: org.execution_date || '',
          execution_amount: String(org.execution_amount || ''),
        })));
      } else {
        setOrgExecutions([]);
      }
    }
  }, [customer, open]);

  const handleOrgExecutionChange = (index: number, field: 'execution_date' | 'execution_amount', value: string) => {
    setOrgExecutions(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const handleSave = async () => {
    if (!customer) return;
    
    setIsSaving(true);
    try {
      const updatedProcessingOrgs = (customer.processing_orgs || []).map((org: ProcessingOrg) => {
        const orgExecution = orgExecutions.find(e => e.org === org.org);
        if (orgExecution && org.status === '승인') {
          return {
            ...org,
            execution_date: orgExecution.execution_date || org.execution_date,
            execution_amount: Number(orgExecution.execution_amount) || org.execution_amount || 0,
          };
        }
        return org;
      });

      await onSave(customer.id, {
        commission_rate: Number(commissionRate) || 0,
        contract_amount: Number(contractAmount) || 0,
        contract_date: contractDate || undefined,
        processing_orgs: updatedProcessingOrgs,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save customer info:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!customer) return null;

  const hasApprovedOrgs = orgExecutions.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>정보 수정</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-4 pr-4">
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
            
            {hasApprovedOrgs ? (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">기관별 집행 정보</Label>
                </div>
                
                {orgExecutions.map((orgExec, index) => (
                  <div 
                    key={orgExec.org} 
                    className="p-3 rounded-lg border bg-muted/20 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {orgExec.org}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">집행일</Label>
                        <Input
                          type="date"
                          value={orgExec.execution_date}
                          onChange={(e) => handleOrgExecutionChange(index, 'execution_date', e.target.value)}
                          data-testid={`input-execution-date-${orgExec.org}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">집행금액 (만원)</Label>
                        <Input
                          type="number"
                          value={orgExec.execution_amount}
                          onChange={(e) => handleOrgExecutionChange(index, 'execution_amount', e.target.value)}
                          placeholder="예: 3000"
                          data-testid={`input-execution-amount-${orgExec.org}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/20 border">
                승인된 진행기관이 없습니다. 상세 페이지에서 기관을 추가하고 승인 처리해 주세요.
              </div>
            )}
          </div>
        </ScrollArea>
        
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
