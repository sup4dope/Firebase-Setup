import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, FileCheck, DollarSign, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/kpi';
import { cn } from '@/lib/utils';
import type { KPIData } from '@shared/types';

interface KPIWidgetsProps {
  kpi: KPIData;
  compact?: boolean;
}

export function KPIWidgets({ kpi, compact = false }: KPIWidgetsProps) {
  const progressPercentage = kpi.totalBusinessDays > 0 
    ? Math.round((kpi.businessDaysElapsed / kpi.totalBusinessDays) * 100)
    : 0;

  const contractProgress = kpi.expectedContracts > 0
    ? Math.round((kpi.currentContracts / kpi.expectedContracts) * 100)
    : 0;

  const revenueProgress = kpi.expectedRevenue > 0
    ? Math.round((kpi.currentRevenue / kpi.expectedRevenue) * 100)
    : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-4 flex-wrap">
        {/* Expected Contracts - Compact */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className="w-8 h-8 bg-blue-600/20 rounded-md flex items-center justify-center">
            <FileCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">예상 계약</p>
            <p className="text-sm font-bold text-gray-100" data-testid="text-kpi-compact-contracts">
              {kpi.currentContracts}/{kpi.expectedContracts}건
              <span className="text-xs font-normal text-emerald-400 ml-1">
                {contractProgress}%
              </span>
            </p>
          </div>
        </div>

        {/* Expected Revenue - Compact */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className="w-8 h-8 bg-emerald-600/20 rounded-md flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">예상 매출</p>
            <p className="text-sm font-bold text-gray-100" data-testid="text-kpi-compact-revenue">
              {formatCurrency(kpi.expectedRevenue)}원
              <span className="text-xs font-normal text-emerald-400 ml-1">
                {revenueProgress}%
              </span>
            </p>
          </div>
        </div>

        {/* Business Days - Compact */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700">
          <div className="w-8 h-8 bg-purple-600/20 rounded-md flex items-center justify-center">
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">영업일</p>
            <p className="text-sm font-bold text-gray-100" data-testid="text-kpi-compact-days">
              {kpi.businessDaysElapsed}/{kpi.totalBusinessDays}일
              <span className="text-xs font-normal text-purple-400 ml-1">
                {progressPercentage}%
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Expected Contracts */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                예상 계약 건수
              </p>
              <p className="text-4xl font-bold tabular-nums text-gray-100" data-testid="text-kpi-expected-contracts">
                {kpi.expectedContracts}
                <span className="text-lg font-normal text-gray-500 ml-1">건</span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">현재</span>
                <span className="font-semibold text-gray-200">{kpi.currentContracts}건</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">{contractProgress}%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            (현재 계약 / 경과 영업일) x 월 전체 영업일
          </p>
        </CardContent>
      </Card>

      {/* Expected Revenue */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                예상 매출액
              </p>
              <p className="text-4xl font-bold tabular-nums text-gray-100" data-testid="text-kpi-expected-revenue">
                {formatCurrency(kpi.expectedRevenue)}
                <span className="text-lg font-normal text-gray-500 ml-1">원</span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">현재</span>
                <span className="font-semibold text-gray-200">{formatCurrency(kpi.currentRevenue)}원</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">{revenueProgress}%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            (승인 총액 / 경과 영업일) x 월 전체 영업일
          </p>
        </CardContent>
      </Card>

      {/* Business Days Progress */}
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                영업일 진행률
              </p>
              <p className="text-4xl font-bold tabular-nums text-gray-100" data-testid="text-kpi-business-days">
                {kpi.businessDaysElapsed}
                <span className="text-lg font-normal text-gray-500">
                  /{kpi.totalBusinessDays}일
                </span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">진행률</span>
                <span className="font-semibold text-gray-200">{progressPercentage}%</span>
              </div>
            </div>
            <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
