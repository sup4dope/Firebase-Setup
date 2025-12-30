import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Link2, Save, Building2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinancialObligation, Customer } from "@shared/types";

interface FinancialAnalysisTabProps {
  customer: Partial<Customer>;
  obligations: FinancialObligation[];
  onObligationsChange: (obligations: FinancialObligation[]) => void;
  isReadOnly?: boolean;
}

const EMPTY_LOAN: Omit<FinancialObligation, 'id'> = {
  type: 'loan',
  institution: '',
  product_name: '',
  account_type: '',
  balance: 0,
  occurred_at: new Date().toISOString().split('T')[0],
};

const EMPTY_GUARANTEE: Omit<FinancialObligation, 'id'> = {
  type: 'guarantee',
  institution: '',
  product_name: '',
  account_type: '',
  balance: 0,
  occurred_at: new Date().toISOString().split('T')[0],
};

export function FinancialAnalysisTab({ 
  customer,
  obligations, 
  onObligationsChange, 
  isReadOnly = false 
}: FinancialAnalysisTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const loans = useMemo(() => 
    obligations
      .filter(o => o.type === 'loan')
      .sort((a, b) => a.institution.localeCompare(b.institution, 'ko')),
    [obligations]
  );

  const guarantees = useMemo(() => 
    obligations
      .filter(o => o.type === 'guarantee')
      .sort((a, b) => a.institution.localeCompare(b.institution, 'ko')),
    [obligations]
  );

  const isWithin7Days = (date1: string, date2: string): boolean => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffDays = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  };

  const linkedPairs = useMemo(() => {
    const pairs: Map<string, string[]> = new Map();
    
    loans.forEach(loan => {
      guarantees.forEach(guarantee => {
        if (isWithin7Days(loan.occurred_at, guarantee.occurred_at)) {
          const existing = pairs.get(loan.id) || [];
          existing.push(guarantee.id);
          pairs.set(loan.id, existing);
        }
      });
    });
    
    return pairs;
  }, [loans, guarantees]);

  const hasLinkedGuarantee = (loanId: string): boolean => {
    return linkedPairs.has(loanId);
  };

  const hasLinkedLoan = (guaranteeId: string): boolean => {
    const entries = Array.from(linkedPairs.entries());
    for (const [, guaranteeIds] of entries) {
      if (guaranteeIds.includes(guaranteeId)) return true;
    }
    return false;
  };

  const handleAdd = (type: 'loan' | 'guarantee') => {
    const newObligation: FinancialObligation = {
      id: `temp-${Date.now()}`,
      ...(type === 'loan' ? EMPTY_LOAN : EMPTY_GUARANTEE),
    };
    onObligationsChange([...obligations, newObligation]);
    setEditingId(newObligation.id);
  };

  const handleUpdate = (id: string, field: keyof FinancialObligation, value: string | number) => {
    const updated = obligations.map(o => 
      o.id === id ? { ...o, [field]: value } : o
    );
    onObligationsChange(updated);
  };

  const handleDelete = (id: string) => {
    onObligationsChange(obligations.filter(o => o.id !== id));
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  const totalLoanBalance = useMemo(() => 
    loans.reduce((sum, l) => sum + (l.balance || 0), 0),
    [loans]
  );

  const totalGuaranteeBalance = useMemo(() => 
    guarantees.reduce((sum, g) => sum + (g.balance || 0), 0),
    [guarantees]
  );

  const renderTable = (items: FinancialObligation[], type: 'loan' | 'guarantee') => {
    const isLoan = type === 'loan';
    const title = isLoan ? '대출 내역' : '보증 내역';
    const Icon = isLoan ? Building2 : ShieldCheck;
    const iconColor = isLoan ? 'text-blue-400' : 'text-emerald-400';
    const total = isLoan ? totalLoanBalance : totalGuaranteeBalance;

    return (
      <Card className="flex-1 overflow-hidden">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Icon className={cn("w-4 h-4", iconColor)} />
              {title}
              <Badge variant="secondary" className="ml-2">
                {items.length}건
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                합계: <span className="font-medium text-foreground">{formatCurrency(total)}원</span>
              </span>
              {!isReadOnly && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleAdd(type)}
                  data-testid={`button-add-${type}`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  추가
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(50vh-120px)]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">금융기관</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">상품명</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">계정과목</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">잔액(원)</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">발생일</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">만기일</th>
                  {!isReadOnly && (
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground w-16">액션</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={isReadOnly ? 6 : 7} className="text-center py-8 text-muted-foreground">
                      등록된 {isLoan ? '대출' : '보증'} 내역이 없습니다
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isEditing = editingId === item.id;
                    const isLinked = isLoan ? hasLinkedGuarantee(item.id) : hasLinkedLoan(item.id);
                    
                    return (
                      <tr 
                        key={item.id} 
                        className={cn(
                          "border-b hover:bg-muted/30 transition-colors",
                          isLinked && "bg-amber-500/5"
                        )}
                        onClick={() => !isReadOnly && setEditingId(item.id)}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            {isLinked && (
                              <span title="7일 이내 연결된 거래">
                                <Link2 className="w-3 h-3 text-amber-400" />
                              </span>
                            )}
                            {isEditing && !isReadOnly ? (
                              <Input
                                value={item.institution}
                                onChange={(e) => handleUpdate(item.id, 'institution', e.target.value)}
                                className="h-7 text-sm"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`input-institution-${item.id}`}
                              />
                            ) : (
                              <span className="truncate">{item.institution || '-'}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          {isEditing && !isReadOnly ? (
                            <Input
                              value={item.product_name}
                              onChange={(e) => handleUpdate(item.id, 'product_name', e.target.value)}
                              className="h-7 text-sm"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`input-product-${item.id}`}
                            />
                          ) : (
                            <span className="truncate">{item.product_name || '-'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing && !isReadOnly ? (
                            <Input
                              value={item.account_type}
                              onChange={(e) => handleUpdate(item.id, 'account_type', e.target.value)}
                              className="h-7 text-sm"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`input-account-${item.id}`}
                            />
                          ) : (
                            <span className="truncate">{item.account_type || '-'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {isEditing && !isReadOnly ? (
                            <Input
                              type="number"
                              value={item.balance}
                              onChange={(e) => handleUpdate(item.id, 'balance', Number(e.target.value))}
                              className="h-7 text-sm text-right"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`input-balance-${item.id}`}
                            />
                          ) : (
                            <span>{formatCurrency(item.balance)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isEditing && !isReadOnly ? (
                            <Input
                              type="date"
                              value={item.occurred_at}
                              onChange={(e) => handleUpdate(item.id, 'occurred_at', e.target.value)}
                              className="h-7 text-sm"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`input-occurred-${item.id}`}
                            />
                          ) : (
                            <span className="text-muted-foreground">{item.occurred_at || '-'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isEditing && !isReadOnly ? (
                            <Input
                              type="date"
                              value={item.maturity_date || ''}
                              onChange={(e) => handleUpdate(item.id, 'maturity_date', e.target.value)}
                              className="h-7 text-sm"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`input-maturity-${item.id}`}
                            />
                          ) : (
                            <span className="text-muted-foreground">{item.maturity_date || '-'}</span>
                          )}
                        </td>
                        {!isReadOnly && (
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isEditing && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(null);
                                  }}
                                  className="h-7 w-7 text-blue-400"
                                  data-testid={`button-save-${item.id}`}
                                >
                                  <Save className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(item.id);
                                }}
                                className="h-7 w-7 text-red-400 hover:text-red-300"
                                data-testid={`button-delete-${item.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto pt-[0px] pb-[0px] pl-[10px] pr-[10px]">
      {linkedPairs.size > 0 && (
        <div className="flex items-center justify-end">
          <Badge variant="outline" className="text-amber-400 border-amber-400/50">
            <Link2 className="w-3 h-3 mr-1" />
            {linkedPairs.size}개 연결된 거래
          </Badge>
        </div>
      )}
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        {renderTable(loans, 'loan')}
        {renderTable(guarantees, 'guarantee')}
      </div>
      <div className="shrink-0 p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">총 부채</span>
          <span className="font-semibold text-lg">
            {formatCurrency(totalLoanBalance + totalGuaranteeBalance)}원
          </span>
        </div>
      </div>
    </div>
  );
}
