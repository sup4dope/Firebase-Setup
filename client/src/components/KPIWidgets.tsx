import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, FileCheck, DollarSign, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/kpi';
import type { KPIData } from '@shared/types';

interface KPIWidgetsProps {
  kpi: KPIData;
}

export function KPIWidgets({ kpi }: KPIWidgetsProps) {
  const progressPercentage = kpi.totalBusinessDays > 0 
    ? Math.round((kpi.businessDaysElapsed / kpi.totalBusinessDays) * 100)
    : 0;

  const contractProgress = kpi.expectedContracts > 0
    ? Math.round((kpi.currentContracts / kpi.expectedContracts) * 100)
    : 0;

  const revenueProgress = kpi.expectedRevenue > 0
    ? Math.round((kpi.currentRevenue / kpi.expectedRevenue) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Expected Contracts */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                예상 계약 건수
              </p>
              <p className="text-4xl font-bold tabular-nums" data-testid="text-kpi-expected-contracts">
                {kpi.expectedContracts}
                <span className="text-lg font-normal text-muted-foreground ml-1">건</span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">현재</span>
                <span className="font-semibold">{kpi.currentContracts}건</span>
                <TrendingUp className="w-4 h-4 text-chart-2" />
                <span className="text-chart-2">{contractProgress}%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            (현재 계약 / 경과 영업일) x 월 전체 영업일
          </p>
        </CardContent>
      </Card>

      {/* Expected Revenue */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                예상 매출액
              </p>
              <p className="text-4xl font-bold tabular-nums" data-testid="text-kpi-expected-revenue">
                {formatCurrency(kpi.expectedRevenue)}
                <span className="text-lg font-normal text-muted-foreground ml-1">원</span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">현재</span>
                <span className="font-semibold">{formatCurrency(kpi.currentRevenue)}원</span>
                <TrendingUp className="w-4 h-4 text-chart-2" />
                <span className="text-chart-2">{revenueProgress}%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-chart-2/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-chart-2" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            (승인 총액 / 경과 영업일) x 월 전체 영업일
          </p>
        </CardContent>
      </Card>

      {/* Business Days Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                영업일 진행률
              </p>
              <p className="text-4xl font-bold tabular-nums" data-testid="text-kpi-business-days">
                {kpi.businessDaysElapsed}
                <span className="text-lg font-normal text-muted-foreground">
                  /{kpi.totalBusinessDays}일
                </span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">진행률</span>
                <span className="font-semibold">{progressPercentage}%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-chart-3/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-chart-3" />
            </div>
          </div>
          <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-chart-3 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
