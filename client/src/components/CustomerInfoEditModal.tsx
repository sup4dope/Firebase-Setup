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
import { Loader2, Building2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Customer, ProcessingOrg, Execution } from '@shared/types';

interface ExecutionData {
  id: string;
  execution_date: string;
  execution_amount: string;
  is_re_execution: boolean;
  isNew?: boolean;
}

interface OrgExecutionGroup {
  org: string;
  executions: ExecutionData[];
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

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
  const [orgExecutionGroups, setOrgExecutionGroups] = useState<OrgExecutionGroup[]>([]);
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
        const groups: OrgExecutionGroup[] = approvedOrgs.map((org: ProcessingOrg) => {
          let executions: ExecutionData[] = [];
          
          if (org.executions && org.executions.length > 0) {
            executions = org.executions.map((exec: Execution) => ({
              id: exec.id,
              execution_date: exec.execution_date || '',
              execution_amount: String(exec.execution_amount || ''),
              is_re_execution: exec.is_re_execution,
              isNew: false,
            }));
          } else if (org.execution_date || org.execution_amount) {
            executions = [{
              id: generateExecutionId(),
              execution_date: org.execution_date || '',
              execution_amount: String(org.execution_amount || ''),
              is_re_execution: false,
              isNew: false,
            }];
          }
          
          return {
            org: org.org,
            executions,
          };
        });
        setOrgExecutionGroups(groups);
      } else {
        setOrgExecutionGroups([]);
      }
    }
  }, [customer, open]);

  const handleExecutionChange = (
    orgIndex: number, 
    execIndex: number, 
    field: 'execution_date' | 'execution_amount', 
    value: string
  ) => {
    setOrgExecutionGroups(prev => prev.map((group, gi) => {
      if (gi !== orgIndex) return group;
      return {
        ...group,
        executions: group.executions.map((exec, ei) => 
          ei === execIndex ? { ...exec, [field]: value } : exec
        ),
      };
    }));
  };

  const handleAddExecution = (orgIndex: number, isReExecution: boolean) => {
    setOrgExecutionGroups(prev => prev.map((group, gi) => {
      if (gi !== orgIndex) return group;
      return {
        ...group,
        executions: [
          ...group.executions,
          {
            id: generateExecutionId(),
            execution_date: '',
            execution_amount: '',
            is_re_execution: isReExecution,
            isNew: true,
          },
        ],
      };
    }));
  };

  const handleRemoveExecution = (orgIndex: number, execIndex: number) => {
    setOrgExecutionGroups(prev => prev.map((group, gi) => {
      if (gi !== orgIndex) return group;
      return {
        ...group,
        executions: group.executions.filter((_, ei) => ei !== execIndex),
      };
    }));
  };

  const handleSave = async () => {
    if (!customer) return;
    
    setIsSaving(true);
    try {
      const updatedProcessingOrgs = (customer.processing_orgs || []).map((org: ProcessingOrg) => {
        const group = orgExecutionGroups.find(g => g.org === org.org);
        if (group && org.status === '승인') {
          const executions: Execution[] = group.executions
            .filter(e => e.execution_date || e.execution_amount)
            .map(e => ({
              id: e.id,
              execution_date: e.execution_date,
              execution_amount: Number(e.execution_amount) || 0,
              is_re_execution: e.is_re_execution,
              created_at: e.isNew ? new Date() : undefined,
            }));
          
          const firstExec = executions.find(e => !e.is_re_execution);
          
          return {
            ...org,
            execution_date: firstExec?.execution_date || org.execution_date,
            execution_amount: firstExec?.execution_amount || org.execution_amount || 0,
            executions: executions.length > 0 ? executions : undefined,
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

  const hasApprovedOrgs = orgExecutionGroups.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>정보 수정</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[65vh]">
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
                
                {orgExecutionGroups.map((group, orgIndex) => (
                  <div 
                    key={group.org} 
                    className="p-3 rounded-lg border bg-muted/20 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {group.org}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddExecution(orgIndex, true)}
                        className="h-7 text-xs gap-1"
                        data-testid={`button-add-reexecution-${group.org}`}
                      >
                        <RotateCcw className="w-3 h-3" />
                        재집행 추가
                      </Button>
                    </div>
                    
                    {group.executions.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-2">
                        집행 정보가 없습니다.
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddExecution(orgIndex, false)}
                          className="ml-2 h-6 text-xs"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          첫 집행 추가
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {group.executions.map((exec, execIndex) => (
                          <div 
                            key={exec.id}
                            className={`p-2 rounded border ${exec.is_re_execution ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-background'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {exec.is_re_execution ? (
                                  <Badge variant="secondary" className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                                    <RotateCcw className="w-3 h-3 mr-1" />
                                    재집행
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    최초집행
                                  </Badge>
                                )}
                              </div>
                              {(exec.is_re_execution || group.executions.length > 1) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveExecution(orgIndex, execIndex)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  data-testid={`button-remove-execution-${exec.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">집행일</Label>
                                <Input
                                  type="date"
                                  value={exec.execution_date}
                                  onChange={(e) => handleExecutionChange(orgIndex, execIndex, 'execution_date', e.target.value)}
                                  data-testid={`input-execution-date-${exec.id}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">집행금액 (만원)</Label>
                                <Input
                                  type="number"
                                  value={exec.execution_amount}
                                  onChange={(e) => handleExecutionChange(orgIndex, execIndex, 'execution_amount', e.target.value)}
                                  placeholder="예: 3000"
                                  data-testid={`input-execution-amount-${exec.id}`}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
