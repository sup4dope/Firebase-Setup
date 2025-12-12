import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FUNNEL_GROUPS } from '@/lib/constants';
import type { Customer } from '@shared/types';

interface FunnelChartProps {
  customers: Customer[];
  selectedStage: string | null;
  onStageClick: (stage: string | null) => void;
}

// 메인 퍼널 단계 (한글 상태명 기반)
const MAIN_STAGES = [
  { id: 'all', label: '전체', borderColor: 'border-gray-500', bgColor: 'bg-gray-500/20', glowColor: 'shadow-gray-500/50' },
  { id: '상담대기', label: '상담대기', borderColor: 'border-purple-500', bgColor: 'bg-purple-500/20', glowColor: 'shadow-purple-500/50' },
  { id: '희망타겟', label: '희망타겟', borderColor: 'border-yellow-500', bgColor: 'bg-yellow-500/20', glowColor: 'shadow-yellow-500/50' },
  { id: '계약완료', label: '계약완료', borderColor: 'border-emerald-500', bgColor: 'bg-emerald-500/20', glowColor: 'shadow-emerald-500/50' },
  { id: '서류취합', label: '서류취합', borderColor: 'border-blue-500', bgColor: 'bg-blue-500/20', glowColor: 'shadow-blue-500/50' },
  { id: '신청완료', label: '신청완료', borderColor: 'border-indigo-500', bgColor: 'bg-indigo-500/20', glowColor: 'shadow-indigo-500/50' },
  { id: '집행완료_그룹', label: '집행완료', borderColor: 'border-teal-500', bgColor: 'bg-teal-500/20', glowColor: 'shadow-teal-500/50' },
  { id: '쓰레기통', label: '쓰레기통', borderColor: 'border-rose-500', bgColor: 'bg-rose-500/20', glowColor: 'shadow-rose-500/50' },
];

// 하위 상태 정의 (한글 상태명 사용)
const SUB_STATUSES: Record<string, { id: string; label: string; accentColor: string }[]> = {
  '상담대기': [
    { id: '단기부재', label: '단기부재', accentColor: 'border-l-orange-400' },
    { id: '장기부재', label: '장기부재', accentColor: 'border-l-amber-400' },
  ],
  '희망타겟': [
    { id: '업력미달', label: '업력미달', accentColor: 'border-l-yellow-400' },
    { id: '최근대출', label: '최근대출', accentColor: 'border-l-yellow-400' },
    { id: '인증미동의(국세청)', label: '인증미동의(국세청)', accentColor: 'border-l-yellow-400' },
    { id: '인증미동의(공여내역)', label: '인증미동의(공여내역)', accentColor: 'border-l-yellow-400' },
    { id: '진행기간 미동의', label: '진행기간 미동의', accentColor: 'border-l-yellow-400' },
    { id: '자문료 미동의', label: '자문료 미동의', accentColor: 'border-l-yellow-400' },
    { id: '계약금미동의(선불)', label: '계약금미동의(선불)', accentColor: 'border-l-yellow-400' },
    { id: '계약금미동의(후불)', label: '계약금미동의(후불)', accentColor: 'border-l-yellow-400' },
  ],
  '계약완료': [
    { id: '계약완료(선불)', label: '계약완료(선불)', accentColor: 'border-l-emerald-400' },
    { id: '계약완료(외주)', label: '계약완료(외주)', accentColor: 'border-l-green-400' },
    { id: '계약완료(후불)', label: '계약완료(후불)', accentColor: 'border-l-emerald-400' },
  ],
  '서류취합': [
    { id: '서류취합완료(선불)', label: '서류취합완료(선불)', accentColor: 'border-l-blue-400' },
    { id: '서류취합완료(외주)', label: '서류취합완료(외주)', accentColor: 'border-l-sky-400' },
    { id: '서류취합완료(후불)', label: '서류취합완료(후불)', accentColor: 'border-l-blue-400' },
  ],
  '신청완료': [
    { id: '신청완료(선불)', label: '신청완료(선불)', accentColor: 'border-l-indigo-400' },
    { id: '신청완료(외주)', label: '신청완료(외주)', accentColor: 'border-l-violet-400' },
    { id: '신청완료(후불)', label: '신청완료(후불)', accentColor: 'border-l-indigo-400' },
  ],
  '집행완료_그룹': [
    { id: '집행완료', label: '집행완료', accentColor: 'border-l-teal-400' },
    { id: '집행완료(외주)', label: '집행완료(외주)', accentColor: 'border-l-cyan-400' },
    { id: '최종부결', label: '최종부결', accentColor: 'border-l-red-500' },
  ],
  '쓰레기통': [
    { id: '거절사유 미파악', label: '거절사유 미파악', accentColor: 'border-l-rose-400' },
    { id: '인증불가', label: '인증불가', accentColor: 'border-l-rose-400' },
    { id: '정부기관 오인', label: '정부기관 오인', accentColor: 'border-l-rose-400' },
    { id: '기타자금 오인', label: '기타자금 오인', accentColor: 'border-l-rose-400' },
    { id: '불가업종', label: '불가업종', accentColor: 'border-l-rose-400' },
    { id: '매출없음', label: '매출없음', accentColor: 'border-l-rose-400' },
    { id: '신용점수 미달', label: '신용점수 미달', accentColor: 'border-l-rose-400' },
    { id: '차입금초과', label: '차입금초과', accentColor: 'border-l-rose-400' },
  ],
};

export function FunnelChart({ customers, selectedStage, onStageClick }: FunnelChartProps) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const toggleStage = (stageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // 상위 그룹 카운트 (FUNNEL_GROUPS 사용)
  const getStageCount = (stageId: string): number => {
    if (stageId === 'all') return customers.length;
    
    const groupStatuses = FUNNEL_GROUPS[stageId];
    if (groupStatuses && groupStatuses.length > 0) {
      return customers.filter(c => groupStatuses.includes(c.status_code)).length;
    }
    
    // 단일 상태
    return customers.filter(c => c.status_code === stageId).length;
  };

  // 하위 상태 카운트
  const getSubStatusCount = (subId: string): number => {
    const groupStatuses = FUNNEL_GROUPS[subId];
    if (groupStatuses && groupStatuses.length > 0) {
      return customers.filter(c => groupStatuses.includes(c.status_code)).length;
    }
    return customers.filter(c => c.status_code === subId).length;
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

      {/* Flex row with boxes and arrows inline */}
      <div className="flex flex-row items-start w-full">
        {MAIN_STAGES.map((stage, index) => {
          const isExpanded = expandedStages.has(stage.id);
          const hasSubStatuses = SUB_STATUSES[stage.id] && SUB_STATUSES[stage.id].length > 0;
          const count = getStageCount(stage.id);

          return (
            <div key={stage.id} className="contents">
              {/* Arrow wrapper */}
              {index > 0 && (
                <div className="w-8 h-16 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              )}
              
              {/* Stage column (box + sub-statuses) */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Main Stage Box - 동일한 UI (쓰레기통 포함) */}
                <div className="relative w-full group">
                  <button
                    onClick={() => onStageClick(stage.id === 'all' ? null : stage.id)}
                    className={cn(
                      "w-full h-16 rounded-md border-2 transition-all duration-300",
                      "flex flex-col items-center justify-center",
                      "bg-slate-900/50 backdrop-blur-sm text-white",
                      stage.borderColor,
                      // Hover glow effect
                      "hover:shadow-lg",
                      `hover:${stage.glowColor}`,
                      "hover:bg-slate-800/70",
                      // Selected state
                      selectedStage === stage.id && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      stage.id === 'all' && selectedStage === null && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    style={{
                      // CSS variable for dynamic glow color on hover
                    }}
                    data-testid={`button-funnel-${stage.id}`}
                  >
                    <div className="font-bold text-sm">{stage.label}</div>
                    <div className="text-xs text-gray-300">
                      {count}건 ({getPercentage(count)})
                    </div>
                  </button>
                  
                  {/* Accordion Toggle Button - 모든 하위 상태가 있는 스테이지에 동일하게 적용 */}
                  {hasSubStatuses && (
                    <button
                      onClick={(e) => toggleStage(stage.id, e)}
                      className={cn(
                        "absolute right-1 top-1/2 -translate-y-1/2",
                        "w-6 h-6 rounded-full",
                        "flex items-center justify-center",
                        "transition-all duration-200",
                        "text-gray-400 hover:text-white",
                        "hover:bg-white/20"
                      )}
                      data-testid={`button-toggle-${stage.id}`}
                    >
                      <ChevronDown 
                        className={cn(
                          "w-4 h-4 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} 
                      />
                    </button>
                  )}
                </div>

                {/* Sub-statuses - 펼쳐진 경우에만 표시 */}
                {hasSubStatuses && isExpanded && (
                  <div className="mt-2 flex flex-col gap-1 w-full animate-in slide-in-from-top-2 duration-200">
                    {SUB_STATUSES[stage.id].map((sub) => {
                      const subCount = getSubStatusCount(sub.id);
                      
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onStageClick(sub.id)}
                          className={cn(
                            "w-full h-11 rounded-md border-l-4 transition-all duration-200",
                            "flex items-center justify-between px-3",
                            "bg-gray-800 text-white",
                            "hover:bg-gray-700 hover:shadow-md",
                            sub.accentColor,
                            selectedStage === sub.id && "ring-2 ring-primary"
                          )}
                          data-testid={`button-funnel-${sub.id}`}
                        >
                          <span className="font-medium text-xs truncate">{sub.label}</span>
                          <span className="text-xs text-gray-300 flex-shrink-0">
                            {subCount} ({getPercentage(subCount)})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
