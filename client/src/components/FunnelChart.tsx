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
  { id: '2', label: '희망타겟', color: 'bg-yellow-100 dark:bg-yellow-900/50', textColor: 'text-yellow-800 dark:text-yellow-200', borderColor: 'border-yellow-500' },
  { id: '3', label: '계약완료', color: 'bg-green-100 dark:bg-green-900/50', textColor: 'text-green-800 dark:text-green-200', borderColor: 'border-green-500' },
  { id: '4', label: '서류취합', color: 'bg-blue-100 dark:bg-blue-900/50', textColor: 'text-blue-800 dark:text-blue-200', borderColor: 'border-blue-400' },
  { id: '5', label: '신청완료', color: 'bg-orange-100 dark:bg-orange-900/50', textColor: 'text-orange-800 dark:text-orange-200', borderColor: 'border-orange-400' },
  { id: '6', label: '집행완료', color: 'bg-teal-100 dark:bg-teal-900/50', textColor: 'text-teal-800 dark:text-teal-200', borderColor: 'border-teal-500' },
];

// Sub-statuses for each main stage
const SUB_STATUSES: Record<string, { id: string; label: string; color: string }[]> = {
  '1': [
    { id: '1-1', label: '쓰레기통', color: 'bg-red-50 dark:bg-red-900/30' },
    { id: '0-1', label: '단기부재', color: 'bg-gray-100 dark:bg-gray-800' },
    { id: '0-2', label: '장기부재', color: 'bg-gray-100 dark:bg-gray-800' },
  ],
  '2': [
    { id: '1-2', label: '연락미달', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-2-1', label: '최근대출', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-2-2', label: '인증미동의(국세청)', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-2-3', label: '인증미동의(공여내역)', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { id: '1-3', label: '진행기간 미동의', color: 'bg-yellow-50 dark:bg-yellow-900/30' },
  ],
  '3': [
    { id: '2-1', label: '계약미완료(신용)', color: 'bg-green-50 dark:bg-green-900/30' },
    { id: '2-2', label: '계약완료(외주)', color: 'bg-green-50 dark:bg-green-900/30' },
    { id: '2-3', label: '계약반료(추블)', color: 'bg-green-50 dark:bg-green-900/30' },
  ],
  '4': [
    { id: '3-1', label: '서류취합안료(신용)', color: 'bg-blue-50 dark:bg-blue-900/30' },
    { id: '3-2', label: '서류취합안료(외주)', color: 'bg-blue-50 dark:bg-blue-900/30' },
    { id: '3-3', label: '서류취합안료(추블)', color: 'bg-blue-50 dark:bg-blue-900/30' },
  ],
  '5': [
    { id: '4-1', label: '신청완료(신용)', color: 'bg-orange-50 dark:bg-orange-900/30' },
    { id: '4-2', label: '신청완료(외주)', color: 'bg-orange-50 dark:bg-orange-900/30' },
  ],
  '6': [
    { id: '5-1', label: '집행완료', color: 'bg-teal-50 dark:bg-teal-900/30' },
    { id: '5-2', label: '집행완료(외주)', color: 'bg-teal-50 dark:bg-teal-900/30' },
    { id: '5-3', label: '최종부결', color: 'bg-red-100 dark:bg-red-900/30' },
  ],
};

// Additional sub-sub statuses for stage 1 (상담대기)
const NESTED_STATUSES: Record<string, { id: string; label: string; color: string }[]> = {
  '1-1': [
    { id: '1-1-1', label: '거절사유 미파악', color: 'bg-red-50 dark:bg-red-900/20' },
    { id: '1-1-2', label: '인증불가', color: 'bg-red-50 dark:bg-red-900/20' },
    { id: '1-1-3', label: '정부기관 오인', color: 'bg-red-50 dark:bg-red-900/20' },
    { id: '1-1-4', label: '기타지급 오인', color: 'bg-red-50 dark:bg-red-900/20' },
    { id: '1-1-5', label: '불기업종', color: 'bg-red-50 dark:bg-red-900/20' },
    { id: '1-1-6', label: '매출없음', color: 'bg-red-50 dark:bg-red-900/20' },
    { id: '1-1-7', label: '신용점수 미달', color: 'bg-red-50 dark:bg-red-900/20' },
    { id: '1-1-8', label: '차임금초과', color: 'bg-red-50 dark:bg-red-900/20' },
  ],
};

export function FunnelChart({ customers, selectedStage, onStageClick }: FunnelChartProps) {
  const getStageCount = (stageId: string): number => {
    if (stageId === 'all') return customers.length;
    return customers.filter(c => c.status_code.startsWith(stageId)).length;
  };

  const getSubStatusCount = (subId: string): number => {
    return customers.filter(c => c.status_code === subId || c.status_code.startsWith(subId)).length;
  };

  return (
    <div className="space-y-4 overflow-x-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">영업 퍼널</h3>
      </div>

      {/* Main Flow - Horizontal */}
      <div className="flex items-start gap-1 min-w-max pb-4">
        {MAIN_STAGES.map((stage, index) => (
          <div key={stage.id} className="flex items-start">
            {/* Stage Column */}
            <div className="flex flex-col items-center">
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
                <div className="text-xl font-bold tabular-nums mt-1">
                  ({getStageCount(stage.id)})
                </div>
              </button>

              {/* Sub-statuses - Vertical below main stage */}
              {SUB_STATUSES[stage.id] && (
                <div className="flex flex-col items-center mt-2">
                  {/* Connector line */}
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  
                  <div className="flex gap-2">
                    {/* Left column: First sub-status with nested statuses */}
                    {stage.id === '1' && (
                      <div className="flex flex-col items-center">
                        {/* Main sub-status */}
                        <button
                          onClick={() => onStageClick('1-1')}
                          className={cn(
                            "min-w-[90px] px-2 py-2 rounded border text-xs transition-all",
                            SUB_STATUSES['1'][0].color,
                            "border-gray-300 dark:border-gray-600",
                            selectedStage === '1-1' && "ring-2 ring-primary"
                          )}
                          data-testid="button-funnel-1-1"
                        >
                          <div className="font-medium">{SUB_STATUSES['1'][0].id}</div>
                          <div className="text-[10px]">{SUB_STATUSES['1'][0].label}</div>
                          <div className="font-bold">({getSubStatusCount(SUB_STATUSES['1'][0].id)})</div>
                        </button>

                        {/* Nested statuses */}
                        {NESTED_STATUSES['1-1'] && (
                          <div className="flex flex-col items-center mt-1">
                            <div className="h-2 w-px bg-gray-300 dark:bg-gray-600" />
                            <div className="space-y-1">
                              {NESTED_STATUSES['1-1'].map((nested) => (
                                <button
                                  key={nested.id}
                                  onClick={() => onStageClick(nested.id)}
                                  className={cn(
                                    "w-full min-w-[80px] px-2 py-1 rounded border text-[10px] transition-all",
                                    nested.color,
                                    "border-gray-200 dark:border-gray-700",
                                    selectedStage === nested.id && "ring-1 ring-primary"
                                  )}
                                  data-testid={`button-funnel-${nested.id}`}
                                >
                                  <div className="font-medium">{nested.id}</div>
                                  <div className="truncate">{nested.label}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Right column: Other sub-statuses */}
                    <div className="space-y-1">
                      {SUB_STATUSES[stage.id]?.slice(stage.id === '1' ? 1 : 0).map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => onStageClick(sub.id)}
                          className={cn(
                            "w-full min-w-[90px] px-2 py-2 rounded border text-xs transition-all",
                            sub.color,
                            "border-gray-300 dark:border-gray-600",
                            selectedStage === sub.id && "ring-2 ring-primary"
                          )}
                          data-testid={`button-funnel-${sub.id}`}
                        >
                          <div className="font-medium">{sub.id}</div>
                          <div className="text-[10px] truncate">{sub.label}</div>
                          <div className="font-bold">({getSubStatusCount(sub.id)})</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Arrow between stages */}
            {index < MAIN_STAGES.length - 1 && (
              <div className="flex items-center px-1 pt-4">
                <ChevronRight className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
