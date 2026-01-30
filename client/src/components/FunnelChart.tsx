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

// 스테이지 테마 정의 (통일된 색상 사용)
const STAGE_THEMES = {
  all: { border: 'border-gray-500', accent: 'border-l-gray-500', bg: 'bg-gray-500/20', glow: 'shadow-gray-500/50', text: 'text-gray-300' },
  상담대기: { border: 'border-purple-500', accent: 'border-l-purple-500', bg: 'bg-purple-500/20', glow: 'shadow-purple-500/50', text: 'text-purple-300' },
  부재중: { border: 'border-orange-500', accent: 'border-l-orange-500', bg: 'bg-orange-500/20', glow: 'shadow-orange-500/50', text: 'text-orange-300' },
  쓰레기통: { border: 'border-rose-500', accent: 'border-l-rose-500', bg: 'bg-rose-500/20', glow: 'shadow-rose-500/50', text: 'text-rose-300' },
  희망타겟: { border: 'border-yellow-500', accent: 'border-l-yellow-500', bg: 'bg-yellow-500/20', glow: 'shadow-yellow-500/50', text: 'text-yellow-300' },
  계약완료: { border: 'border-emerald-500', accent: 'border-l-emerald-500', bg: 'bg-emerald-500/20', glow: 'shadow-emerald-500/50', text: 'text-emerald-300' },
  서류취합: { border: 'border-blue-500', accent: 'border-l-blue-500', bg: 'bg-blue-500/20', glow: 'shadow-blue-500/50', text: 'text-blue-300' },
  신청완료: { border: 'border-indigo-500', accent: 'border-l-indigo-500', bg: 'bg-indigo-500/20', glow: 'shadow-indigo-500/50', text: 'text-indigo-300' },
  집행완료: { border: 'border-teal-500', accent: 'border-l-teal-500', bg: 'bg-teal-500/20', glow: 'shadow-teal-500/50', text: 'text-teal-300' },
};

// 메인 퍼널 단계 (상담대기 열 제외 - 별도 처리)
const MAIN_STAGES = [
  { id: 'all', label: '전체', theme: 'all' },
  { id: '희망타겟', label: '희망타겟', theme: '희망타겟' },
  { id: '계약완료', label: '계약완료', theme: '계약완료' },
  { id: '서류취합', label: '서류취합', theme: '서류취합' },
  { id: '신청완료', label: '신청완료', theme: '신청완료' },
  { id: '집행완료_그룹', label: '집행완료', theme: '집행완료' },
];

// 하위 상태 정의 (부모 테마 색상 상속)
const SUB_STATUSES: Record<string, { id: string; label: string }[]> = {
  '희망타겟': [
    { id: '업력미달', label: '업력미달' },
    { id: '최근대출', label: '최근대출' },
    { id: '인증미동의(국세청)', label: '인증미동의(국세청)' },
    { id: '인증미동의(공여내역)', label: '인증미동의(공여내역)' },
    { id: '진행기간 미동의', label: '진행기간 미동의' },
    { id: '자문료 미동의', label: '자문료 미동의' },
    { id: '계약금미동의(선불)', label: '계약금미동의(선불)' },
    { id: '계약금미동의(후불)', label: '계약금미동의(후불)' },
  ],
  '계약완료': [
    { id: '계약완료(선불)', label: '계약완료(선불)' },
    { id: '계약완료(외주)', label: '계약완료(외주)' },
    { id: '계약완료(후불)', label: '계약완료(후불)' },
  ],
  '서류취합': [
    { id: '서류취합완료(선불)', label: '서류취합완료(선불)' },
    { id: '서류취합완료(외주)', label: '서류취합완료(외주)' },
    { id: '서류취합완료(후불)', label: '서류취합완료(후불)' },
  ],
  '신청완료': [
    { id: '신청완료(선불)', label: '신청완료(선불)' },
    { id: '신청완료(외주)', label: '신청완료(외주)' },
    { id: '신청완료(후불)', label: '신청완료(후불)' },
  ],
  '집행완료_그룹': [
    { id: '집행완료(선불)', label: '집행완료(선불)' },
    { id: '집행완료(후불)', label: '집행완료(후불)' },
    { id: '집행완료(외주)', label: '집행완료(외주)' },
    { id: '최종부결', label: '최종부결' },
  ],
  '쓰레기통': [
    { id: '거절사유 미파악', label: '거절사유 미파악' },
    { id: '인증불가', label: '인증불가' },
    { id: '정부기관 오인', label: '정부기관 오인' },
    { id: '기타자금 오인', label: '기타자금 오인' },
    { id: '불가업종', label: '불가업종' },
    { id: '매출없음', label: '매출없음' },
    { id: '신용점수 미달', label: '신용점수 미달' },
    { id: '차입금초과', label: '차입금초과' },
  ],
};

// 부재중 상태
const ABSENCE_STATUSES = [
  { id: '단기부재', label: '단기부재' },
  { id: '장기부재', label: '장기부재' },
];

export function FunnelChart({ customers, selectedStage, onStageClick }: FunnelChartProps) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [trashExpanded, setTrashExpanded] = useState(false);

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

  const getStageCount = (stageId: string): number => {
    if (stageId === 'all') return customers.length;
    
    const groupStatuses = FUNNEL_GROUPS[stageId];
    if (groupStatuses && groupStatuses.length > 0) {
      return customers.filter(c => groupStatuses.includes(c.status_code)).length;
    }
    
    return customers.filter(c => c.status_code === stageId).length;
  };

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

  // 테마 가져오기
  const getTheme = (themeKey: string) => STAGE_THEMES[themeKey as keyof typeof STAGE_THEMES] || STAGE_THEMES.all;

  // 헤더 박스 렌더링
  const renderStageHeader = (
    id: string, 
    label: string, 
    themeKey: string, 
    count: number, 
    hasSubStatuses: boolean,
    isExpanded: boolean,
    onToggle?: (e: React.MouseEvent) => void
  ) => {
    const theme = getTheme(themeKey);
    
    return (
      <div className="relative w-full group">
        <button
          onClick={() => onStageClick(id === 'all' ? null : id)}
          className={cn(
            "w-full h-16 rounded-md border-2 transition-all duration-300",
            "flex flex-col items-center justify-center",
            "bg-card dark:bg-slate-900/50 backdrop-blur-sm text-foreground dark:text-white",
            theme.border,
            "hover:shadow-lg hover:bg-accent dark:hover:bg-slate-800/70",
            selectedStage === id && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            id === 'all' && selectedStage === null && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
          data-testid={`button-funnel-${id}`}
        >
          <div className="font-bold text-sm">{label}</div>
          <div className="text-xs text-muted-foreground dark:text-gray-300">
            {count}건 ({getPercentage(count)})
          </div>
        </button>
        
        {hasSubStatuses && onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2",
              "w-6 h-6 rounded-full",
              "flex items-center justify-center",
              "transition-all duration-200",
              "text-muted-foreground hover:text-foreground dark:text-gray-400 dark:hover:text-white",
              "hover:bg-accent dark:hover:bg-white/20"
            )}
            data-testid={`button-toggle-${id}`}
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
    );
  };

  // 하위 상태 칩 렌더링 (부모 테마 테두리)
  const renderSubStatus = (sub: { id: string; label: string }, parentTheme: string) => {
    // 최종부결은 빨간색으로 특별 처리
    const isRejection = sub.id === '최종부결';
    const theme = isRejection 
      ? { accent: 'border-l-red-500', text: 'text-red-300' } 
      : getTheme(parentTheme);
    const subCount = getSubStatusCount(sub.id);
    
    return (
      <button
        key={sub.id}
        onClick={() => onStageClick(sub.id)}
        className={cn(
          "w-full h-10 rounded-md border-l-4 transition-all duration-200",
          "flex items-center justify-between px-3",
          "bg-muted dark:bg-slate-900/60 backdrop-blur-sm",
          isRejection ? "text-red-600 dark:text-red-300" : "text-foreground dark:text-gray-200",
          theme.accent,
          "hover:bg-accent dark:hover:bg-slate-800/80 hover:shadow-md",
          selectedStage === sub.id && "ring-2 ring-primary"
        )}
        data-testid={`button-funnel-${sub.id}`}
      >
        <span className="font-medium text-xs truncate">{sub.label}</span>
        <span className="text-xs flex-shrink-0 text-muted-foreground">
          {subCount} ({getPercentage(subCount)})
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-justify pl-[0px] pr-[0px]">상태 분류</h3>
        <div className="text-sm text-muted-foreground">
          전체 {customers.length}건
        </div>
      </div>
      <div className="flex flex-row items-start w-full gap-0">
        {/* Column 1: 전체 */}
        <div className="flex-1 flex flex-col min-w-0">
          {renderStageHeader('all', '전체', 'all', getStageCount('all'), false, false)}
        </div>

        {/* Arrow */}
        <div className="w-8 h-16 flex items-center justify-center shrink-0">
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </div>

        {/* Column 2: 상담대기 + 부재중 + 쓰레기통 (세로 스택) */}
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          {/* 상담대기 헤더 */}
          {renderStageHeader(
            '상담대기', 
            '상담대기', 
            '상담대기', 
            getStageCount('상담대기'), 
            false, 
            false
          )}

          {/* 부재중 그룹 - 항상 노출 */}
          <div className="flex flex-col gap-1">
            {ABSENCE_STATUSES.map((absence) => {
              const absenceCount = getSubStatusCount(absence.id);
              const theme = getTheme('부재중');
              
              return (
                <button
                  key={absence.id}
                  onClick={() => onStageClick(absence.id)}
                  className={cn(
                    "w-full h-10 rounded-md border-l-4 transition-all duration-200",
                    "flex items-center justify-between px-3",
                    "bg-muted dark:bg-slate-900/60 backdrop-blur-sm",
                    "text-foreground dark:text-gray-200",
                    theme.accent,
                    "hover:bg-accent dark:hover:bg-slate-800/80 hover:shadow-md",
                    selectedStage === absence.id && "ring-2 ring-primary"
                  )}
                  data-testid={`button-funnel-${absence.id}`}
                >
                  <span className="font-medium text-xs">{absence.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {absenceCount} ({getPercentage(absenceCount)})
                  </span>
                </button>
              );
            })}
          </div>

          {/* 쓰레기통 - 아코디언 */}
          <div className="flex flex-col gap-1">
            <div className="relative w-full group">
              <button
                onClick={() => onStageClick('쓰레기통')}
                className={cn(
                  "w-full h-12 rounded-md border-2 transition-all duration-300",
                  "flex items-center justify-between pl-3 pr-10",
                  "bg-card dark:bg-slate-900/50 backdrop-blur-sm text-foreground dark:text-white",
                  STAGE_THEMES.쓰레기통.border,
                  "hover:shadow-lg hover:bg-accent dark:hover:bg-slate-800/70",
                  selectedStage === '쓰레기통' && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
                data-testid="button-funnel-쓰레기통"
              >
                <span className="font-bold text-sm">쓰레기통</span>
                <span className="text-xs text-muted-foreground dark:text-gray-300">
                  {getStageCount('쓰레기통')}건 ({getPercentage(getStageCount('쓰레기통'))})
                </span>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTrashExpanded(!trashExpanded);
                }}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2",
                  "w-6 h-6 rounded-full",
                  "flex items-center justify-center",
                  "transition-all duration-200",
                  "text-muted-foreground hover:text-foreground dark:text-gray-400 dark:hover:text-white",
                  "hover:bg-accent dark:hover:bg-white/20"
                )}
                data-testid="button-toggle-쓰레기통"
              >
                <ChevronDown 
                  className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    trashExpanded && "rotate-180"
                  )} 
                />
              </button>
            </div>

            {/* 쓰레기통 하위 항목 - 아코디언 펼침 시 */}
            {trashExpanded && (
              <div className="flex flex-col gap-1 animate-in slide-in-from-top-2 duration-200">
                {SUB_STATUSES['쓰레기통'].map((sub) => renderSubStatus(sub, '쓰레기통'))}
              </div>
            )}
          </div>
        </div>

        {/* 나머지 메인 스테이지들 */}
        {MAIN_STAGES.slice(1).map((stage) => {
          const isExpanded = expandedStages.has(stage.id);
          const hasSubStatuses = SUB_STATUSES[stage.id] && SUB_STATUSES[stage.id].length > 0;
          const count = getStageCount(stage.id);

          return (
            <div key={stage.id} className="contents">
              {/* Arrow */}
              <div className="w-8 h-16 flex items-center justify-center shrink-0">
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </div>
              
              {/* Stage column */}
              <div className="flex-1 flex flex-col min-w-0">
                {renderStageHeader(
                  stage.id, 
                  stage.label, 
                  stage.theme, 
                  count, 
                  hasSubStatuses, 
                  isExpanded,
                  hasSubStatuses ? (e) => toggleStage(stage.id, e) : undefined
                )}

                {/* Sub-statuses - 부모 테마 색상 상속 */}
                {hasSubStatuses && isExpanded && (
                  <div className="mt-2 flex flex-col gap-1 w-full animate-in slide-in-from-top-2 duration-200">
                    {SUB_STATUSES[stage.id].map((sub) => renderSubStatus(sub, stage.theme))}
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
