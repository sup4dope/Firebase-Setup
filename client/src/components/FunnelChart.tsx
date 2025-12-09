import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Customer } from '@shared/types';

interface FunnelChartProps {
  customers: Customer[];
  selectedStage: string | null;
  onStageClick: (stage: string | null) => void;
}

// Main stages with bottom border accent colors
const MAIN_STAGES = [
  { id: 'all', label: '전체', accent: 'border-b-gray-400' },
  { id: '1', label: '상담대기', accent: 'border-b-purple-500' },
  { id: 'target', label: '희망타겟', accent: 'border-b-yellow-500' },
  { id: '2', label: '계약완료', accent: 'border-b-green-500' },
  { id: '3', label: '서류취합', accent: 'border-b-blue-500' },
  { id: '4', label: '신청완료', accent: 'border-b-orange-500' },
  { id: '5', label: '집행완료', accent: 'border-b-teal-500' },
];

// Sub-statuses with accent colors
const SUB_STATUSES: Record<string, { id: string; label: string; accent: string }[]> = {
  '1': [
    { id: '1-1', label: '쓰레기통', accent: 'border-b-red-500' },
    { id: '0-1', label: '단기부재', accent: 'border-b-gray-400' },
    { id: '0-2', label: '장기부재', accent: 'border-b-gray-400' },
  ],
  'target': [
    { id: '1-2-1', label: '업력미달', accent: 'border-b-yellow-400' },
    { id: '1-2-2', label: '최근대출', accent: 'border-b-yellow-400' },
    { id: '1-2-3', label: '인증미동의(국세청)', accent: 'border-b-yellow-400' },
    { id: '1-2-4', label: '인증미동의(공여내역)', accent: 'border-b-yellow-400' },
    { id: '1-3-1', label: '진행기간 미동의', accent: 'border-b-yellow-400' },
    { id: '1-3-2', label: '자문료 미동의', accent: 'border-b-yellow-400' },
    { id: '1-3-3', label: '계약금미동의(선불)', accent: 'border-b-yellow-400' },
    { id: '1-3-4', label: '계약금미동의(후불)', accent: 'border-b-yellow-400' },
  ],
  '2': [
    { id: '2-1', label: '계약완료(선불)', accent: 'border-b-green-400' },
    { id: '2-2', label: '계약완료(외주)', accent: 'border-b-green-400' },
    { id: '2-3', label: '계약완료(후불)', accent: 'border-b-green-400' },
  ],
  '3': [
    { id: '3-1', label: '서류취합완료(선불)', accent: 'border-b-blue-400' },
    { id: '3-2', label: '서류취합완료(외주)', accent: 'border-b-blue-400' },
    { id: '3-3', label: '서류취합완료(후불)', accent: 'border-b-blue-400' },
  ],
  '4': [
    { id: '4-1', label: '신청완료(선불)', accent: 'border-b-orange-400' },
    { id: '4-2', label: '신청완료(외주)', accent: 'border-b-orange-400' },
    { id: '4-3', label: '신청완료(후불)', accent: 'border-b-orange-400' },
  ],
  '5': [
    { id: '5-1', label: '집행완료', accent: 'border-b-teal-400' },
    { id: '5-2', label: '집행완료(외주)', accent: 'border-b-teal-400' },
    { id: '5-3', label: '최종부결', accent: 'border-b-red-500' },
  ],
};

// Nested statuses for 1-1 (쓰레기통 상세사유)
const NESTED_STATUSES: Record<string, { id: string; label: string }[]> = {
  '1-1': [
    { id: '1-1-1', label: '거절사유 미파악' },
    { id: '1-1-2', label: '인증불가' },
    { id: '1-1-3', label: '정부기관 오인' },
    { id: '1-1-4', label: '기타자금 오인' },
    { id: '1-1-5', label: '불가업종' },
    { id: '1-1-6', label: '매출없음' },
    { id: '1-1-7', label: '신용점수 미달' },
    { id: '1-1-8', label: '차입금초과' },
  ],
};

export function FunnelChart({ customers, selectedStage, onStageClick }: FunnelChartProps) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [expandedTrash, setExpandedTrash] = useState(false);

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  const totalCount = customers.length;

  const getStageCount = (stageId: string): number => {
    if (stageId === 'all') return customers.length;
    if (stageId === 'target') {
      return customers.filter(c => 
        c.status_code.startsWith('1-2') || c.status_code.startsWith('1-3')
      ).length;
    }
    return customers.filter(c => c.status_code.startsWith(stageId)).length;
  };

  const getSubStatusCount = (subId: string): number => {
    return customers.filter(c => c.status_code === subId || c.status_code.startsWith(subId)).length;
  };

  const getPercentage = (count: number): string => {
    if (totalCount === 0) return '0%';
    return `${Math.round((count / totalCount) * 100)}%`;
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">영업 퍼널</h3>
        <div className="text-sm text-muted-foreground">
          전체 {customers.length}건
        </div>
      </div>

      {/* Fixed 7-column Grid - Full Width, No padding */}
      <div className="grid grid-cols-7 gap-1 w-full">
        {MAIN_STAGES.map((stage) => {
          const isExpanded = expandedStages.has(stage.id);
          const hasSubStatuses = SUB_STATUSES[stage.id] && SUB_STATUSES[stage.id].length > 0;
          const count = getStageCount(stage.id);

          return (
            <div key={stage.id} className="flex flex-col w-full">
              {/* Main Stage Box - Solid style with bottom accent */}
              <button
                onClick={() => {
                  onStageClick(stage.id === 'all' ? null : stage.id);
                  if (hasSubStatuses) toggleStage(stage.id);
                }}
                className={cn(
                  "w-full h-16 rounded-md border-b-4 transition-all",
                  "flex flex-col items-center justify-center",
                  "bg-slate-800 dark:bg-slate-900 text-white",
                  "hover:bg-slate-700 dark:hover:bg-slate-800",
                  stage.accent,
                  selectedStage === stage.id && "ring-2 ring-primary ring-offset-2",
                  stage.id === 'all' && selectedStage === null && "ring-2 ring-primary ring-offset-2"
                )}
                data-testid={`button-funnel-${stage.id}`}
              >
                <div className="font-bold text-sm">{stage.label}</div>
                <div className="text-xs">
                  {count}건 ({getPercentage(count)})
                </div>
                {hasSubStatuses && (
                  <div className="absolute top-1 right-1">
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3 opacity-50" />
                    ) : (
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    )}
                  </div>
                )}
              </button>

              {/* Sub-statuses - Vertical Stack, 100% width */}
              {hasSubStatuses && isExpanded && (
                <div className="mt-1 flex flex-col gap-1 w-full">
                  {SUB_STATUSES[stage.id].map((sub) => {
                    const subCount = getSubStatusCount(sub.id);
                    
                    return (
                      <div key={sub.id} className="flex flex-col gap-1 w-full">
                        {/* Sub-status Button - 100% width */}
                        <button
                          onClick={() => {
                            if (sub.id === '1-1') {
                              setExpandedTrash(!expandedTrash);
                            } else {
                              onStageClick(sub.id);
                            }
                          }}
                          className={cn(
                            "w-full h-12 rounded-md border-b-4 transition-all",
                            "flex items-center justify-between px-2",
                            "bg-gray-700 dark:bg-gray-800 text-white",
                            "hover:bg-gray-600 dark:hover:bg-gray-700",
                            sub.accent,
                            selectedStage === sub.id && "ring-2 ring-primary"
                          )}
                          data-testid={`button-funnel-${sub.id}`}
                        >
                          <span className="font-medium text-xs truncate">{sub.label}</span>
                          <span className="text-xs flex items-center gap-1 flex-shrink-0">
                            {subCount} ({getPercentage(subCount)})
                            {sub.id === '1-1' && (
                              expandedTrash ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            )}
                          </span>
                        </button>
                        
                        {/* 쓰레기통 상세사유 - Nested Vertical Stack */}
                        {sub.id === '1-1' && expandedTrash && NESTED_STATUSES['1-1'] && (
                          <div className="flex flex-col gap-1 w-full pl-1">
                            {NESTED_STATUSES['1-1'].map((nested) => {
                              const nestedCount = getSubStatusCount(nested.id);
                              return (
                                <button
                                  key={nested.id}
                                  onClick={() => onStageClick(nested.id)}
                                  className={cn(
                                    "w-full h-10 rounded-md border-b-2 border-b-red-400 transition-all",
                                    "flex items-center justify-between px-2",
                                    "bg-gray-600 dark:bg-gray-700 text-white text-xs",
                                    "hover:bg-gray-500 dark:hover:bg-gray-600",
                                    selectedStage === nested.id && "ring-2 ring-primary"
                                  )}
                                  data-testid={`button-funnel-${nested.id}`}
                                >
                                  <span className="truncate">{nested.label}</span>
                                  <span className="font-semibold flex-shrink-0 ml-1">{nestedCount}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
