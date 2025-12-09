import { cn } from '@/lib/utils';
import { MessageCircle, FileText, Search, FileSignature, CheckCircle } from 'lucide-react';
import type { Customer, StatusCode } from '@shared/types';

interface FunnelChartProps {
  customers: Customer[];
  selectedStage: string | null;
  onStageClick: (stage: string | null) => void;
}

const STAGES = [
  { code: '1', label: '상담', icon: MessageCircle, color: 'bg-blue-500' },
  { code: '2', label: '서류', icon: FileText, color: 'bg-amber-500' },
  { code: '3', label: '심사', icon: Search, color: 'bg-purple-500' },
  { code: '4', label: '계약', icon: FileSignature, color: 'bg-emerald-500' },
  { code: '5', label: '집행', icon: CheckCircle, color: 'bg-green-600' },
];

export function FunnelChart({ customers, selectedStage, onStageClick }: FunnelChartProps) {
  const getStageCount = (stageCode: string): number => {
    return customers.filter(c => c.status_code.startsWith(stageCode)).length;
  };

  const getDropoutCount = (): number => {
    return customers.filter(c => c.status_code.startsWith('0')).length;
  };

  const totalActive = customers.filter(c => !c.status_code.startsWith('0')).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">영업 퍼널</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>전체 {customers.length}건</span>
          <span className="text-muted-foreground/50">|</span>
          <span>활성 {totalActive}건</span>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {/* All button */}
        <button
          onClick={() => onStageClick(null)}
          className={cn(
            "flex flex-col items-center justify-center min-w-[80px] p-4 rounded-lg border transition-all",
            selectedStage === null
              ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2"
              : "border-border hover-elevate"
          )}
          data-testid="button-funnel-all"
        >
          <span className="text-2xl font-bold tabular-nums">{customers.length}</span>
          <span className="text-xs text-muted-foreground font-medium">전체</span>
        </button>

        {/* Stage buttons */}
        {STAGES.map((stage, index) => {
          const count = getStageCount(stage.code);
          const Icon = stage.icon;
          const isSelected = selectedStage === stage.code;
          
          return (
            <div key={stage.code} className="flex items-center">
              {index > 0 && (
                <div className="w-6 h-px border-t-2 border-dashed border-muted-foreground/30" />
              )}
              <button
                onClick={() => onStageClick(isSelected ? null : stage.code)}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[80px] p-4 rounded-lg border transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2"
                    : "border-border hover-elevate"
                )}
                data-testid={`button-funnel-stage-${stage.code}`}
              >
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center mb-2", stage.color)}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-2xl font-bold tabular-nums">{count}</span>
                <span className="text-xs text-muted-foreground font-medium">{stage.label}</span>
              </button>
            </div>
          );
        })}

        {/* Dropout */}
        <div className="flex items-center">
          <div className="w-6 h-px border-t-2 border-dashed border-muted-foreground/30" />
          <button
            onClick={() => onStageClick(selectedStage === '0' ? null : '0')}
            className={cn(
              "flex flex-col items-center justify-center min-w-[80px] p-4 rounded-lg border transition-all",
              selectedStage === '0'
                ? "border-destructive bg-destructive/5 ring-2 ring-destructive ring-offset-2"
                : "border-border hover-elevate"
            )}
            data-testid="button-funnel-dropout"
          >
            <span className="text-2xl font-bold tabular-nums text-destructive">{getDropoutCount()}</span>
            <span className="text-xs text-muted-foreground font-medium">드롭아웃</span>
          </button>
        </div>
      </div>
    </div>
  );
}
