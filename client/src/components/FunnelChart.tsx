import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { Customer } from '@shared/types';

interface FunnelChartProps {
  customers: Customer[];
  selectedStage: string | null;
  onStageClick: (stage: string | null) => void;
}

// Main stages definition with colors
const MAIN_STAGES = [
  { id: 'all', label: '전체', color: 'bg-gray-200 dark:bg-gray-700', textColor: 'text-gray-800 dark:text-gray-200', borderColor: 'border-gray-400' },
  { id: '1', label: '상담대기', color: 'bg-purple-100 dark:bg-purple-900/50', textColor: 'text-purple-800 dark:text-purple-200', borderColor: 'border-purple-400' },
  { id: 'target', label: '희망타겟', color: 'bg-yellow-100 dark:bg-yellow-900/50', textColor: 'text-yellow-800 dark:text-yellow-200', borderColor: 'border-yellow-500' },
  { id: '2', label: '계약완료', color: 'bg-green-100 dark:bg-green-900/50', textColor: 'text-green-800 dark:text-green-200', borderColor: 'border-green-500' },
  { id: '3', label: '서류취합', color: 'bg-blue-100 dark:bg-blue-900/50', textColor: 'text-blue-800 dark:text-blue-200', borderColor: 'border-blue-400' },
  { id: '4', label: '신청완료', color: 'bg-orange-100 dark:bg-orange-900/50', textColor: 'text-orange-800 dark:text-orange-200', borderColor: 'border-orange-400' },
  { id: '5', label: '집행완료', color: 'bg-teal-100 dark:bg-teal-900/50', textColor: 'text-teal-800 dark:text-teal-200', borderColor: 'border-teal-500' },
];

// Sub-statuses for each main stage
const SUB_STATUSES: Record<string, { id: string; label: string; color: string }[]> = {
  '1': [
    { id: '1-1', label: '쓰레기통', color: 'bg-red-100 dark:bg-red-900/40' },
    { id: '0-1', label: '단기부재', color: 'bg-gray-100 dark:bg-gray-800' },
    { id: '0-2', label: '장기부재', color: 'bg-gray-100 dark:bg-gray-800' },
  ],
  'target': [
    { id: '1-2-1', label: '업력미달', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-2-2', label: '최근대출', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-2-3', label: '인증미동의(국세청)', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-2-4', label: '인증미동의(공여내역)', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-3-1', label: '진행기간 미동의', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-3-2', label: '자문료 미동의', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-3-3', label: '계약금미동의(선불)', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-3-4', label: '계약금미동의(후불)', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
  ],
  '2': [
    { id: '2-1', label: '계약완료(선불)', color: 'bg-green-50 dark:bg-green-900/30' },
    { id: '2-2', label: '계약완료(외주)', color: 'bg-green-50 dark:bg-green-900/30' },
    { id: '2-3', label: '계약완료(후불)', color: 'bg-green-50 dark:bg-green-900/30' },
  ],
  '3': [
    { id: '3-1', label: '서류취합완료(선불)', color: 'bg-blue-50 dark:bg-blue-900/30' },
    { id: '3-2', label: '서류취합완료(외주)', color: 'bg-blue-50 dark:bg-blue-900/30' },
    { id: '3-3', label: '서류취합완료(후불)', color: 'bg-blue-50 dark:bg-blue-900/30' },
  ],
  '4': [
    { id: '4-1', label: '신청완료(선불)', color: 'bg-orange-50 dark:bg-orange-900/30' },
    { id: '4-2', label: '신청완료(외주)', color: 'bg-orange-50 dark:bg-orange-900/30' },
    { id: '4-3', label: '신청완료(후불)', color: 'bg-orange-50 dark:bg-orange-900/30' },
  ],
  '5': [
    { id: '5-1', label: '집행완료', color: 'bg-teal-50 dark:bg-teal-900/30' },
    { id: '5-2', label: '집행완료(외주)', color: 'bg-teal-50 dark:bg-teal-900/30' },
    { id: '5-3', label: '최종부결', color: 'bg-red-100 dark:bg-red-900/30' },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">영업 퍼널</h3>
        <div className="text-sm text-muted-foreground">
          전체 {customers.length}건
        </div>
      </div>

      {/* Main Flow - Horizontal */}
      <div className="flex items-start gap-2 overflow-x-auto pb-4">
        {MAIN_STAGES.map((stage, index) => (
          <div key={stage.id} className="flex items-start flex-shrink-0">
            {/* Stage Column */}
            <div className="flex flex-col">
              {/* Main Stage Box */}
              <button
                onClick={() => onStageClick(stage.id === 'all' ? null : stage.id)}
                className={cn(
                  "min-w-[100px] px-4 py-3 rounded-md border-2 transition-all text-center",
                  stage.color,
                  stage.borderColor,
                  stage.textColor,
                  selectedStage === stage.id && "ring-2 ring-primary ring-offset-2",
                  stage.id === 'all' && selectedStage === null && "ring-2 ring-primary ring-offset-2"
                )}
                data-testid={`button-funnel-${stage.id}`}
              >
                <div className="font-semibold text-sm whitespace-nowrap">{stage.label}</div>
                <div className="text-xl font-bold tabular-nums">
                  ({getStageCount(stage.id)})
                </div>
              </button>

              {/* Sub-statuses - Grid layout below main stage */}
              {SUB_STATUSES[stage.id] && (
                <div className="mt-3">
                  <div className="flex justify-center mb-2">
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  {/* Grid of sub-status cards */}
                  <div className="grid grid-cols-2 gap-2 max-w-[280px]">
                    {SUB_STATUSES[stage.id].map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => onStageClick(sub.id)}
                        className={cn(
                          "min-h-[44px] px-3 py-2 rounded-md border transition-all text-left",
                          sub.color,
                          "border-gray-300 dark:border-gray-600",
                          selectedStage === sub.id && "ring-2 ring-primary"
                        )}
                        data-testid={`button-funnel-${sub.id}`}
                      >
                        <div className="font-semibold text-xs text-muted-foreground">{sub.id}</div>
                        <div className="text-sm font-medium truncate">{sub.label}</div>
                        <div className="text-xs text-muted-foreground">({getSubStatusCount(sub.id)})</div>
                      </button>
                    ))}
                  </div>

                  {/* Nested statuses for 1-1 (쓰레기통) */}
                  {stage.id === '1' && NESTED_STATUSES['1-1'] && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
                        <span className="text-xs text-muted-foreground font-medium">쓰레기통 상세사유</span>
                        <div className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {NESTED_STATUSES['1-1'].map((nested) => (
                          <button
                            key={nested.id}
                            onClick={() => onStageClick(nested.id)}
                            className={cn(
                              "min-h-[40px] px-2 py-2 rounded-md border transition-all text-left",
                              "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
                              selectedStage === nested.id && "ring-2 ring-primary"
                            )}
                            data-testid={`button-funnel-${nested.id}`}
                          >
                            <div className="font-semibold text-xs text-red-600 dark:text-red-400">{nested.id}</div>
                            <div className="text-sm font-medium">{nested.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Arrow between stages */}
            {index < MAIN_STAGES.length - 1 && (
              <div className="flex items-center px-1 pt-5">
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
