import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Customer } from '@shared/types';

interface FunnelChartProps {
  customers: Customer[];
  selectedStage: string | null;
  onStageClick: (stage: string | null) => void;
}

// Main stages definition with colors
const MAIN_STAGES = [
  { id: 'all', label: '전체', color: 'bg-gray-600 dark:bg-gray-700', textColor: 'text-white', borderColor: 'border-gray-700' },
  { id: '1', label: '상담대기', color: 'bg-purple-600 dark:bg-purple-700', textColor: 'text-white', borderColor: 'border-purple-700' },
  { id: 'target', label: '희망타겟', color: 'bg-yellow-500 dark:bg-yellow-600', textColor: 'text-white', borderColor: 'border-yellow-600' },
  { id: '2', label: '계약완료', color: 'bg-green-600 dark:bg-green-700', textColor: 'text-white', borderColor: 'border-green-700' },
  { id: '3', label: '서류취합', color: 'bg-blue-600 dark:bg-blue-700', textColor: 'text-white', borderColor: 'border-blue-700' },
  { id: '4', label: '신청완료', color: 'bg-orange-500 dark:bg-orange-600', textColor: 'text-white', borderColor: 'border-orange-600' },
  { id: '5', label: '집행완료', color: 'bg-teal-600 dark:bg-teal-700', textColor: 'text-white', borderColor: 'border-teal-700' },
];

// Sub-statuses for each main stage
const SUB_STATUSES: Record<string, { id: string; label: string; color: string }[]> = {
  '1': [
    { id: '1-1', label: '쓰레기통', color: 'bg-red-500 dark:bg-red-600' },
    { id: '0-1', label: '단기부재', color: 'bg-gray-500 dark:bg-gray-600' },
    { id: '0-2', label: '장기부재', color: 'bg-gray-500 dark:bg-gray-600' },
  ],
  'target': [
    { id: '1-2-1', label: '업력미달', color: 'bg-yellow-400 dark:bg-yellow-500' },
    { id: '1-2-2', label: '최근대출', color: 'bg-yellow-400 dark:bg-yellow-500' },
    { id: '1-2-3', label: '인증미동의(국세청)', color: 'bg-yellow-400 dark:bg-yellow-500' },
    { id: '1-2-4', label: '인증미동의(공여내역)', color: 'bg-yellow-400 dark:bg-yellow-500' },
    { id: '1-3-1', label: '진행기간 미동의', color: 'bg-yellow-400 dark:bg-yellow-500' },
    { id: '1-3-2', label: '자문료 미동의', color: 'bg-yellow-400 dark:bg-yellow-500' },
    { id: '1-3-3', label: '계약금미동의(선불)', color: 'bg-yellow-400 dark:bg-yellow-500' },
    { id: '1-3-4', label: '계약금미동의(후불)', color: 'bg-yellow-400 dark:bg-yellow-500' },
  ],
  '2': [
    { id: '2-1', label: '계약완료(선불)', color: 'bg-green-500 dark:bg-green-600' },
    { id: '2-2', label: '계약완료(외주)', color: 'bg-green-500 dark:bg-green-600' },
    { id: '2-3', label: '계약완료(후불)', color: 'bg-green-500 dark:bg-green-600' },
  ],
  '3': [
    { id: '3-1', label: '서류취합완료(선불)', color: 'bg-blue-500 dark:bg-blue-600' },
    { id: '3-2', label: '서류취합완료(외주)', color: 'bg-blue-500 dark:bg-blue-600' },
    { id: '3-3', label: '서류취합완료(후불)', color: 'bg-blue-500 dark:bg-blue-600' },
  ],
  '4': [
    { id: '4-1', label: '신청완료(선불)', color: 'bg-orange-400 dark:bg-orange-500' },
    { id: '4-2', label: '신청완료(외주)', color: 'bg-orange-400 dark:bg-orange-500' },
    { id: '4-3', label: '신청완료(후불)', color: 'bg-orange-400 dark:bg-orange-500' },
  ],
  '5': [
    { id: '5-1', label: '집행완료', color: 'bg-teal-500 dark:bg-teal-600' },
    { id: '5-2', label: '집행완료(외주)', color: 'bg-teal-500 dark:bg-teal-600' },
    { id: '5-3', label: '최종부결', color: 'bg-red-600 dark:bg-red-700' },
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

      {/* Fixed 7-column Grid - Full Width */}
      <div className="grid grid-cols-7 gap-1 w-full">
        {MAIN_STAGES.map((stage) => {
          const isExpanded = expandedStages.has(stage.id);
          const hasSubStatuses = SUB_STATUSES[stage.id] && SUB_STATUSES[stage.id].length > 0;
          const count = getStageCount(stage.id);

          return (
            <div key={stage.id} className="flex flex-col">
              {/* Main Stage Box - Full column width */}
              <div className="flex items-stretch">
                <button
                  onClick={() => onStageClick(stage.id === 'all' ? null : stage.id)}
                  className={cn(
                    "flex-1 h-16 px-2 py-2 rounded-md transition-all flex flex-col items-center justify-center text-center",
                    stage.color,
                    stage.textColor,
                    selectedStage === stage.id && "ring-2 ring-white ring-offset-2 ring-offset-background",
                    stage.id === 'all' && selectedStage === null && "ring-2 ring-white ring-offset-2 ring-offset-background"
                  )}
                  data-testid={`button-funnel-${stage.id}`}
                >
                  <div className="font-bold text-sm">{stage.label}</div>
                  <div className="text-sm font-semibold">
                    {count}건 ({getPercentage(count)})
                  </div>
                </button>
                
                {/* Expand/Collapse button */}
                {hasSubStatuses && (
                  <button
                    onClick={() => toggleStage(stage.id)}
                    className="px-1 rounded-r-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center"
                    data-testid={`button-toggle-${stage.id}`}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>

              {/* Sub-statuses - Vertical Stack within column */}
              {hasSubStatuses && isExpanded && (
                <div className="mt-2 flex flex-col gap-1 w-full">
                  {SUB_STATUSES[stage.id].map((sub) => {
                    const subCount = getSubStatusCount(sub.id);
                    
                    return (
                      <div key={sub.id} className="flex flex-col gap-1">
                        {/* Sub-status Button */}
                        <button
                          onClick={() => {
                            if (sub.id === '1-1') {
                              setExpandedTrash(!expandedTrash);
                            } else {
                              onStageClick(sub.id);
                            }
                          }}
                          className={cn(
                            "w-full h-10 px-2 py-1 rounded-md transition-all flex items-center justify-between text-white",
                            sub.color,
                            selectedStage === sub.id && "ring-2 ring-white ring-offset-1"
                          )}
                          data-testid={`button-funnel-${sub.id}`}
                        >
                          <span className="font-medium text-xs truncate">{sub.label}</span>
                          <span className="text-xs font-semibold flex-shrink-0 ml-1">
                            {subCount} ({getPercentage(subCount)})
                            {sub.id === '1-1' && (
                              expandedTrash ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />
                            )}
                          </span>
                        </button>
                        
                        {/* 쓰레기통 상세사유 - Nested Accordion */}
                        {sub.id === '1-1' && expandedTrash && NESTED_STATUSES['1-1'] && (
                          <div className="flex flex-col gap-1 pl-2 border-l-2 border-red-400">
                            {NESTED_STATUSES['1-1'].map((nested) => {
                              const nestedCount = getSubStatusCount(nested.id);
                              return (
                                <button
                                  key={nested.id}
                                  onClick={() => onStageClick(nested.id)}
                                  className={cn(
                                    "w-full h-8 px-2 py-1 rounded text-xs text-left transition-all flex items-center justify-between",
                                    "bg-red-400 dark:bg-red-500 text-white",
                                    selectedStage === nested.id && "ring-2 ring-white ring-offset-1"
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
