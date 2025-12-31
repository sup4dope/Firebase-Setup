import { useMemo } from "react";
import { format, addDays } from "date-fns";
import { ko } from "date-fns/locale";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

import { CoverPage } from "./CoverPage";
import { ExecutiveSummaryPage } from "./ExecutiveSummaryPage";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { RiskAnalysisPage } from "./RiskAnalysisPage";
import { SolutionPage } from "./SolutionPage";
import { ExecutionAgencyPage } from "./ExecutionAgencyPage";
import { TimelinePage } from "./TimelinePage";
import { ConclusionPage } from "./ConclusionPage";
import { ThankYouPage } from "./ThankYouPage";

import type { AgencyInfo } from "./types";
import type { Customer, FinancialObligation } from "@shared/types";

interface ReportContainerProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Partial<Customer>;
  obligations: FinancialObligation[];
  requiredFunding: string;
  agencies: AgencyInfo[];
}

function classifyFinancialSector(institution: string): string {
  const first = ['국민', '신한', '우리', '하나', 'SC', 'KEB', '기업은행', '농협', '수협', 'IBK', 'KB'];
  const second = ['저축', '캐피탈', '카드', '새마을', '신협', '대부', '리스'];
  const publicInst = ['중진공', '신보', '기보', '소진공', '진흥공단', '보증재단', '정책'];

  for (const k of publicInst) if (institution.includes(k)) return '공공기관';
  for (const k of first) if (institution.includes(k)) return '1금융권';
  for (const k of second) if (institution.includes(k)) return '2금융권';
  return '1금융권';
}

function formatBillion(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억원`;
  } else if (value >= 10000) {
    return `${Math.round(value / 10000).toLocaleString()}만원`;
  }
  return `${value.toLocaleString()}원`;
}

function calculateBusinessAge(foundingDate: string | undefined): string {
  if (!foundingDate) return "정보 없음";
  const opening = new Date(foundingDate);
  const now = new Date();
  const years = Math.floor((now.getTime() - opening.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${years}년`;
}

export function ReportContainer({
  isOpen,
  onClose,
  customer,
  obligations,
  requiredFunding,
  agencies,
}: ReportContainerProps) {
  const reportData = useMemo(() => {
    const today = new Date();
    const reportDate = format(today, "yyyy년 MM월 dd일", { locale: ko });
    const validUntil = format(addDays(today, 7), "yyyy년 MM월 dd일", { locale: ko });

    const businessName = customer.company_name || "기업명";
    const ceoName = customer.name || "대표자명";
    const businessNumber = customer.business_registration_number || "-";
    const openingDate = customer.founding_date 
      ? format(new Date(customer.founding_date), "yyyy년 MM월 dd일", { locale: ko })
      : "-";
    const industry = customer.business_type || "-";
    const businessAge = calculateBusinessAge(customer.founding_date);
    const address = customer.business_address || customer.address || "-";

    const sales2022 = customer.sales_y3 || 0;
    const sales2023 = customer.sales_y2 || 0;
    const sales2024 = customer.sales_y1 || 0;
    const sales2025 = customer.recent_sales || 0;

    const validSales = [sales2022, sales2023, sales2024].filter(s => s > 0);
    const avgSalesValue = validSales.length > 0 ? validSales.reduce((a, b) => a + b, 0) / validSales.length : 0;

    let growthRate = "0";
    if (sales2022 > 0 && sales2024 > 0) {
      const rate = ((sales2024 - sales2022) / sales2022) * 100;
      growthRate = rate.toFixed(1);
    }

    const loans = obligations.filter(o => o.type === 'loan');
    const guarantees = obligations.filter(o => o.type === 'guarantee');
    const loanBalance = loans.reduce((sum, o) => sum + (o.balance || 0), 0);
    const guaranteeBalance = guarantees.reduce((sum, o) => sum + (o.balance || 0), 0);
    const totalDebt = loanBalance + guaranteeBalance;

    const debtBySector = obligations.reduce((acc, o) => {
      const sector = classifyFinancialSector(o.institution);
      acc[sector] = (acc[sector] || 0) + (o.balance || 0);
      return acc;
    }, {} as Record<string, number>);

    const debt1stTierValue = debtBySector['1금융권'] || 0;
    const debt2ndTierValue = debtBySector['2금융권'] || 0;
    const debtPublicValue = debtBySector['공공기관'] || 0;

    const debt1stTierPct = totalDebt > 0 ? (debt1stTierValue / totalDebt) * 100 : 0;
    const debt2ndTierPct = totalDebt > 0 ? (debt2ndTierValue / totalDebt) * 100 : 0;
    const debtPublicPct = totalDebt > 0 ? (debtPublicValue / totalDebt) * 100 : 0;

    const creditScore = customer.credit_score || 0;
    const creditGrade = (() => {
      if (creditScore >= 900) return '최우수';
      if (creditScore >= 800) return '우수';
      if (creditScore >= 700) return '양호';
      if (creditScore >= 600) return '보통';
      return '관리필요';
    })();
    const creditComment = (() => {
      if (creditScore >= 900) return '최상위 신용등급으로 모든 정책자금에 유리합니다.';
      if (creditScore >= 800) return '우수 신용등급으로 1금융권 정책자금 조달에 유리합니다.';
      if (creditScore >= 700) return '양호한 신용등급이나 일부 정책자금 제한이 있을 수 있습니다.';
      return '신용등급 개선이 필요합니다. 2금융권 구조개선을 권장합니다.';
    })();
    const creditScorePercentage = Math.min(100, (creditScore / 1000) * 100);

    const sales2024InWon = sales2024 * 100000000;
    const avgSalesInWon = avgSalesValue * 100000000;
    const dti2024Value = sales2024InWon > 0 ? (totalDebt / sales2024InWon) * 100 : 0;
    const dti3YearValue = avgSalesInWon > 0 ? (totalDebt / avgSalesInWon) * 100 : 0;

    const getDTIStatus = (dti: number): '안전' | '주의' | '위험' => {
      if (dti <= 30) return '안전';
      if (dti <= 50) return '주의';
      return '위험';
    };

    const dti2024Status = getDTIStatus(dti2024Value);
    const dti3YearStatus = getDTIStatus(dti3YearValue);
    const dtiInterpretation = dti2024Value <= 30 ? '건전한' : dti2024Value <= 50 ? '관리가 필요한' : '위험한';

    const has2ndTier = debt2ndTierValue > 0;
    const lowCredit = creditScore < 800;
    const isHighRisk = has2ndTier || lowCredit;
    const riskLevel = isHighRisk ? '주의 필요' : '양호';

    const diagnosisResult = isHighRisk
      ? '2금융권 부채 구조개선 및 신용등급 관리를 통해 정책자금 승인율을 높일 수 있습니다. 전문가 컨설팅을 통한 체계적 접근이 필요합니다.'
      : '귀사는 매우 우수한 건전성을 보유하고 있습니다. 현재의 매출 성장세를 레버리지 삼아, 저금리 정책자금을 최대 한도로 확보할 최적기입니다.';

    const currentRate = has2ndTier ? "8.5" : "5.5";
    const improvedRate = "3.5";
    const rateDiff = (parseFloat(currentRate) - parseFloat(improvedRate)).toFixed(1);
    const currentInterest = formatBillion(totalDebt * (parseFloat(currentRate) / 100));
    const improvedInterest = formatBillion(totalDebt * (parseFloat(improvedRate) / 100));
    const interestSavings = formatBillion(totalDebt * (parseFloat(rateDiff) / 100));

    const executionPlan = agencies.map(a => ({
      institution: a.name,
      amount: a.limit,
    }));

    const totalExpectedAmount = (() => {
      let total = 0;
      for (const a of agencies) {
        const numMatch = a.limit.match(/[\d.]+/);
        if (numMatch) {
          const num = parseFloat(numMatch[0]);
          if (a.limit.includes('억')) total += num * 100000000;
          else if (a.limit.includes('만')) total += num * 10000;
          else total += num;
        }
      }
      return formatBillion(total);
    })();

    const keyFinding1 = `신용점수 ${creditScore}점으로 ${creditGrade} 등급에 해당하며, 정책자금 신청에 ${creditScore >= 700 ? '적합한' : '개선이 필요한'} 상태입니다.`;
    const keyFinding2 = `총 부채 ${formatBillion(totalDebt)}으로, DTI ${dti2024Value.toFixed(1)}%로 ${dtiInterpretation} 수준입니다.`;
    const keyFinding3 = has2ndTier 
      ? `2금융권 부채 ${formatBillion(debt2ndTierValue)} 보유 중이며, 1금융권 대환을 통한 금리 절감이 권장됩니다.`
      : `1금융권 중심의 건전한 부채 구조를 유지하고 있어 정책자금 활용에 유리합니다.`;

    const recommendation1 = isHighRisk 
      ? '2금융권 부채를 1금융권으로 대환하여 신용등급 개선'
      : '정책자금 우선 활용으로 자금 조달 비용 최소화';
    const recommendation2 = isHighRisk
      ? '신용점수 800점 이상 달성 후 정책자금 신청'
      : '시설자금과 운전자금의 적정 배분으로 성장 기반 확보';
    const recommendation3 = isHighRisk
      ? '부채 구조 재편을 통한 DTI 30% 이하 달성'
      : '장기 저금리 정책자금 확보로 재무 안정성 강화';

    const consultantName = customer.manager_name || "담당자";
    const consultantPhone = "02-1234-5678";
    const consultantEmail = "contact@yieum.co.kr";

    return {
      reportDate,
      validUntil,
      businessName,
      ceoName,
      businessNumber,
      openingDate,
      industry,
      businessAge,
      address,
      sales2022,
      sales2023,
      sales2024,
      sales2025,
      growthRate,
      creditScore,
      creditGrade,
      creditComment,
      creditScorePercentage,
      requiredFunding: requiredFunding || "미정",
      riskLevel,
      keyFinding1,
      keyFinding2,
      keyFinding3,
      totalDebt: formatBillion(totalDebt),
      loanBalance: formatBillion(loanBalance),
      guaranteeBalance: formatBillion(guaranteeBalance),
      debt1stTier: formatBillion(debt1stTierValue),
      debt1stTierPct,
      debt2ndTier: formatBillion(debt2ndTierValue),
      debt2ndTierPct,
      debtPublic: formatBillion(debtPublicValue),
      debtPublicPct,
      dti2024: dti2024Value.toFixed(1),
      dti2024Status,
      dti3Year: dti3YearValue.toFixed(1),
      dti3YearStatus,
      dtiInterpretation,
      diagnosisResult,
      currentRate,
      improvedRate,
      rateDiff,
      currentInterest,
      improvedInterest,
      interestSavings,
      executionPlan,
      totalExpectedAmount,
      recommendation1,
      recommendation2,
      recommendation3,
      agencies,
      totalExpectedFunding: totalExpectedAmount,
      fundingPeriod: "컨설팅 완료 후 4~7주 내 집행 예정",
      consultantName,
      consultantPhone,
      consultantEmail,
    };
  }, [customer, obligations, requiredFunding, agencies]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[230mm] max-h-[95vh] p-0 overflow-hidden">
        <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b p-4 flex items-center justify-between gap-4 print:hidden">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            제안서 미리보기
          </h2>
          <div className="flex items-center gap-2">
            <Button onClick={handlePrint} data-testid="button-print-report">
              <Printer className="w-4 h-4 mr-2" />
              PDF 저장
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-report">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-80px)] bg-gray-200 print:bg-white print:max-h-none">
          <div className="max-w-[210mm] mx-auto space-y-4 p-4 print:p-0 print:space-y-0">
            <CoverPage
              businessName={reportData.businessName}
              reportDate={reportData.reportDate}
            />
            <ExecutiveSummaryPage
              businessName={reportData.businessName}
              ceoName={reportData.ceoName}
              industry={reportData.industry}
              establishedDate={reportData.openingDate}
              creditScore={reportData.creditScore}
              requiredFunding={reportData.requiredFunding}
              riskLevel={reportData.riskLevel}
              keyFinding1={reportData.keyFinding1}
              keyFinding2={reportData.keyFinding2}
              keyFinding3={reportData.keyFinding3}
              reportDate={reportData.reportDate}
            />
            <DiagnosticsPage
              companyName={reportData.businessName}
              ceoName={reportData.ceoName}
              businessNumber={reportData.businessNumber}
              openingDate={reportData.openingDate}
              industry={reportData.industry}
              businessAge={reportData.businessAge}
              address={reportData.address}
              sales2022={reportData.sales2022}
              sales2023={reportData.sales2023}
              sales2024={reportData.sales2024}
              sales2025={reportData.sales2025}
              growthRate={reportData.growthRate}
            />
            <RiskAnalysisPage
              totalDebt={reportData.totalDebt}
              loanBalance={reportData.loanBalance}
              guaranteeBalance={reportData.guaranteeBalance}
              debt1stTier={reportData.debt1stTier}
              debt1stTierPct={reportData.debt1stTierPct}
              debt2ndTier={reportData.debt2ndTier}
              debt2ndTierPct={reportData.debt2ndTierPct}
              debtPublic={reportData.debtPublic}
              debtPublicPct={reportData.debtPublicPct}
              creditScore={reportData.creditScore}
              creditGrade={reportData.creditGrade}
              creditScorePercentage={reportData.creditScorePercentage}
              creditComment={reportData.creditComment}
              dti2024={reportData.dti2024}
              dti2024Status={reportData.dti2024Status}
              dti3Year={reportData.dti3Year}
              dti3YearStatus={reportData.dti3YearStatus}
              dtiInterpretation={reportData.dtiInterpretation}
              reportDate={reportData.reportDate}
            />
            <SolutionPage
              diagnosisResult={reportData.diagnosisResult}
              currentRate={reportData.currentRate}
              improvedRate={reportData.improvedRate}
              rateDiff={reportData.rateDiff}
              currentInterest={reportData.currentInterest}
              improvedInterest={reportData.improvedInterest}
              interestSavings={reportData.interestSavings}
              executionPlan={reportData.executionPlan}
              totalExpectedAmount={reportData.totalExpectedAmount}
              recommendation1={reportData.recommendation1}
              recommendation2={reportData.recommendation2}
              recommendation3={reportData.recommendation3}
            />
            {reportData.agencies.length > 0 && (
              <ExecutionAgencyPage
                totalExpectedFunding={reportData.totalExpectedFunding}
                fundingPeriod={reportData.fundingPeriod}
                agencies={reportData.agencies}
                reportDate={reportData.reportDate}
              />
            )}
            <TimelinePage reportDate={reportData.reportDate} />
            <ConclusionPage
              reportDate={reportData.reportDate}
              validUntil={reportData.validUntil}
              consultantName={reportData.consultantName}
              consultantPhone={reportData.consultantPhone}
              consultantEmail={reportData.consultantEmail}
            />
            <ThankYouPage />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
