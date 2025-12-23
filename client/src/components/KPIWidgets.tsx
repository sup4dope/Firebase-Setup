import { FileText, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import type { KPIData } from '@shared/types';

interface KPIWidgetsProps {
  kpi: KPIData;
  compact?: boolean;
}

// 금액 포맷팅: 만원 단위 → 억원 자동 변환
function formatAmount(amountInManwon: number): string {
  if (amountInManwon >= 10000) {
    // 1억 이상이면 억원으로 표시
    return `${(amountInManwon / 10000).toFixed(1)}억원`;
  }
  return `${amountInManwon.toLocaleString()}만원`;
}

export function KPIWidgets({ kpi, compact = false }: KPIWidgetsProps) {
  const progressPercentage = kpi.totalBusinessDays > 0 
    ? Math.round((kpi.businessDaysElapsed / kpi.totalBusinessDays) * 100)
    : 0;

  // Compact 모드 (대시보드 상단 2×2 그리드)
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 w-fit">
        {/* Row 1: 계약률, 영업일 */}
        {/* 계약률 */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/60 rounded-lg border border-gray-700 min-w-[140px]">
          <div className="w-8 h-8 bg-blue-600/20 rounded-md flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">계약률</p>
            <p className="text-sm font-bold text-gray-100 whitespace-nowrap" data-testid="text-kpi-compact-contract-rate">
              {kpi.contractCount}/{kpi.totalCounselingCount}건
              <span className="text-xs font-normal text-blue-400 ml-1">
                {kpi.contractRate}%
              </span>
            </p>
          </div>
        </div>

        {/* 영업일 */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/60 rounded-lg border border-gray-700 min-w-[140px]">
          <div className="w-8 h-8 bg-purple-600/20 rounded-md flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">영업일</p>
            <p className="text-sm font-bold text-gray-100 whitespace-nowrap" data-testid="text-kpi-compact-days">
              {kpi.businessDaysElapsed}/{kpi.totalBusinessDays}일
              <span className="text-xs font-normal text-purple-400 ml-1">
                {progressPercentage}%
              </span>
            </p>
          </div>
        </div>

        {/* Row 2: 당월 매출, 예상 매출 */}
        {/* 당월 매출 */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/60 rounded-lg border border-gray-700 min-w-[140px]">
          <div className="w-8 h-8 bg-emerald-600/20 rounded-md flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">당월 매출</p>
            <p className="text-sm font-bold text-gray-100 whitespace-nowrap" data-testid="text-kpi-compact-monthly-revenue">
              {formatAmount(kpi.monthlyRevenue)}
            </p>
          </div>
        </div>

        {/* 예상 매출 */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/60 rounded-lg border border-gray-700 min-w-[140px]">
          <div className="w-8 h-8 bg-amber-600/20 rounded-md flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">예상 매출</p>
            <p className="text-sm font-bold text-gray-100 whitespace-nowrap" data-testid="text-kpi-compact-expected-revenue">
              {formatAmount(kpi.expectedRevenue)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Full 모드 (카드 4개 그리드)
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 계약률 카드 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700">
        <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-xs text-gray-400">계약률</p>
          <p className="text-lg font-bold text-gray-100" data-testid="text-kpi-contract-rate">
            {kpi.contractCount}/{kpi.totalCounselingCount}건
            <span className="text-sm font-normal text-blue-400 ml-2">
              {kpi.contractRate}%
            </span>
          </p>
        </div>
      </div>

      {/* 당월 매출 카드 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700">
        <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-xs text-gray-400">당월 매출</p>
          <p className="text-lg font-bold text-gray-100" data-testid="text-kpi-monthly-revenue">
            {formatAmount(kpi.monthlyRevenue)}
          </p>
        </div>
      </div>

      {/* 예상 매출 카드 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700">
        <div className="w-10 h-10 bg-amber-600/20 rounded-lg flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p className="text-xs text-gray-400">예상 매출</p>
          <p className="text-lg font-bold text-gray-100" data-testid="text-kpi-expected-revenue">
            {formatAmount(kpi.expectedRevenue)}
          </p>
        </div>
      </div>

      {/* 영업일 카드 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700">
        <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
          <Calendar className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <p className="text-xs text-gray-400">영업일</p>
          <p className="text-lg font-bold text-gray-100" data-testid="text-kpi-business-days">
            {kpi.businessDaysElapsed}/{kpi.totalBusinessDays}일
            <span className="text-sm font-normal text-purple-400 ml-2">
              {progressPercentage}%
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
