import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { CoverPage } from "./CoverPage";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { RiskAnalysisPage } from "./RiskAnalysisPage";
import { SolutionPage } from "./SolutionPage";
import { ConclusionPage } from "./ConclusionPage";
import { ExecutionPlan, DebtDistribution, formatBillion } from "./types";
import type { Customer, FinancialObligation } from "@shared/types";

interface ProposalReportProps {
  customer: Partial<Customer>;
  obligations: FinancialObligation[];
  executionPlan: ExecutionPlan[];
}

export interface ProposalReportHandle {
  generatePDF: () => Promise<void>;
  getCurrentPage: () => number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
}

const classifyFinancialSector = (institution: string): '1금융권' | '2금융권' | '공공기관' => {
  const name = institution.toLowerCase();
  const firstTierKeywords = ['국민은행', 'kb', '신한', '우리', '하나', 'nh농협', '기업은행', 'ibk', '케이뱅크', '카카오뱅크', '토스뱅크', 'sc제일', '씨티'];
  const publicKeywords = ['신용보증', '기술보증', '소상공인', '중소기업진흥', '신보', '기보', '소진공', '정책자금'];
  
  if (publicKeywords.some(k => name.includes(k))) return '공공기관';
  if (firstTierKeywords.some(k => name.includes(k))) return '1금융권';
  return '2금융권';
};

export const ProposalReport = forwardRef<ProposalReportHandle, ProposalReportProps>(
  ({ customer, obligations, executionPlan }, ref) => {
    const [currentPage, setCurrentPage] = useState(1);
    const reportRef = useRef<HTMLDivElement>(null);
    const totalPages = 5;

    const today = format(new Date(), 'yyyy년 MM월 dd일', { locale: ko });
    const validUntil = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy년 MM월 dd일', { locale: ko });

    const businessName = customer.company_name || '기업명';
    const fullAddress = [customer.business_address, customer.business_address_detail].filter(Boolean).join(' ') || '-';
    const businessNumber = customer.business_registration_number || '-';
    const industry = customer.business_item || '-';
    const openingDate = customer.founding_date || '-';
    const ceoName = customer.name || '-';

    const businessAge = (() => {
      if (!customer.founding_date) return '-';
      const foundingDate = new Date(customer.founding_date);
      const years = Math.floor((Date.now() - foundingDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
      return `${years}년`;
    })();

    const sales2022 = customer.sales_y3 || 0;
    const sales2023 = customer.sales_y2 || 0;
    const sales2024 = customer.sales_y1 || 0;
    const sales2025 = customer.recent_sales || 0;

    const avgSales = [sales2022, sales2023, sales2024].filter(s => s > 0);
    const avgSalesValue = avgSales.length > 0 ? avgSales.reduce((a, b) => a + b, 0) / avgSales.length : 0;
    
    const growthRate = (() => {
      if (sales2022 > 0 && sales2024 > 0) {
        return ((sales2024 - sales2022) / sales2022) * 100;
      }
      return 0;
    })();

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

    const debtDistribution: DebtDistribution[] = [
      { name: '1금융권', value: debtBySector['1금융권'] || 0, percentage: totalDebt > 0 ? ((debtBySector['1금융권'] || 0) / totalDebt) * 100 : 0 },
      { name: '2금융권', value: debtBySector['2금융권'] || 0, percentage: totalDebt > 0 ? ((debtBySector['2금융권'] || 0) / totalDebt) * 100 : 0 },
      { name: '공공기관', value: debtBySector['공공기관'] || 0, percentage: totalDebt > 0 ? ((debtBySector['공공기관'] || 0) / totalDebt) * 100 : 0 },
    ].filter(d => d.value > 0);

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

    const sales2024InWon = sales2024 * 100000000;
    const avgSalesInWon = avgSalesValue * 100000000;
    const dti2024 = sales2024InWon > 0 ? (totalDebt / sales2024InWon) * 100 : 0;
    const dti3Year = avgSalesInWon > 0 ? (totalDebt / avgSalesInWon) * 100 : 0;
    const getDTIStatus = (dti: number): '안전' | '주의' | '위험' => {
      if (dti <= 30) return '안전';
      if (dti <= 50) return '주의';
      return '위험';
    };
    const dti2024Status = getDTIStatus(dti2024);
    const dti3YearStatus = getDTIStatus(dti3Year);
    const dtiInterpretation = dti2024 <= 30 ? '건전한' : dti2024 <= 50 ? '관리가 필요한' : '위험';

    const has2ndTier = debtBySector['2금융권'] > 0;
    const lowCredit = creditScore < 800;
    const isHighRisk = has2ndTier || lowCredit;

    const diagnosisResult = isHighRisk
      ? '2금융권 부채 구조개선 및 신용등급 관리를 통해 정책자금 승인율을 높일 수 있습니다. 전문가 컨설팅을 통한 체계적 접근이 필요합니다.'
      : '귀사는 매우 우수한 건전성을 보유하고 있습니다. 현재의 매출 성장세를 레버리지 삼아, 저금리 정책자금을 최대 한도로 확보할 최적기입니다.';

    const currentRate = has2ndTier ? 8.5 : 5.5;
    const improvedRate = 3.5;
    const rateDiff = currentRate - improvedRate;
    const currentInterest = formatBillion(totalDebt * (currentRate / 100));
    const improvedInterest = formatBillion(totalDebt * (improvedRate / 100));
    const interestSavings = formatBillion(totalDebt * (rateDiff / 100));

    const totalExpectedAmount = formatBillion(executionPlan.reduce((sum, p) => {
      const numAmount = parseFloat(p.amount.replace(/[^0-9.]/g, ''));
      if (p.amount.includes('억')) return sum + numAmount * 100000000;
      if (p.amount.includes('만')) return sum + numAmount * 10000;
      return sum + numAmount;
    }, 0));

    const recommendation1 = isHighRisk 
      ? '2금융권 부채를 1금융권으로 대환하여 신용등급 개선'
      : '정책자금 우선 활용으로 자금 조달 비용 최소화';
    const recommendation2 = isHighRisk
      ? '신용점수 800점 이상 달성 후 정책자금 신청'
      : '시설자금과 운전자금의 적정 배분으로 성장 기반 확보';
    const recommendation3 = isHighRisk
      ? '부채 구조 재편을 통한 DTI 30% 이하 달성'
      : '신용보증기금/기술보증기금 보증 활용으로 대출 한도 극대화';

    const generatePDF = async () => {
      if (!reportRef.current) return;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageElements = reportRef.current.querySelectorAll('.report-page');
      
      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i] as HTMLElement;
        
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      }

      pdf.save(`${businessName}_정책자금_제안서.pdf`);
    };

    useImperativeHandle(ref, () => ({
      generatePDF,
      getCurrentPage: () => currentPage,
      setCurrentPage,
      totalPages,
    }));

    const renderPage = () => {
      switch (currentPage) {
        case 1:
          return (
            <CoverPage 
              businessName={businessName} 
              reportDate={today} 
            />
          );
        case 2:
          return (
            <DiagnosticsPage
              companyName={businessName}
              ceoName={ceoName}
              businessNumber={businessNumber}
              openingDate={openingDate}
              industry={industry}
              businessAge={businessAge}
              address={fullAddress}
              sales2022={sales2022}
              sales2023={sales2023}
              sales2024={sales2024}
              sales2025={sales2025}
              growthRate={growthRate}
            />
          );
        case 3:
          return (
            <RiskAnalysisPage
              totalDebt={totalDebt}
              loanBalance={loanBalance}
              guaranteeBalance={guaranteeBalance}
              debtDistribution={debtDistribution}
              creditScore={creditScore}
              creditGrade={creditGrade}
              creditComment={creditComment}
              dti2024={dti2024}
              dti2024Status={dti2024Status}
              dti3Year={dti3Year}
              dti3YearStatus={dti3YearStatus}
              dtiInterpretation={dtiInterpretation}
            />
          );
        case 4:
          return (
            <SolutionPage
              diagnosisResult={diagnosisResult}
              currentRate={currentRate}
              improvedRate={improvedRate}
              rateDiff={rateDiff}
              currentInterest={currentInterest}
              improvedInterest={improvedInterest}
              interestSavings={interestSavings}
              executionPlan={executionPlan}
              totalExpectedAmount={totalExpectedAmount}
              recommendation1={recommendation1}
              recommendation2={recommendation2}
              recommendation3={recommendation3}
            />
          );
        case 5:
          return (
            <ConclusionPage
              reportDate={today}
              validUntil={validUntil}
              consultantName={customer.manager_name || '경영지원그룹 이음'}
            />
          );
        default:
          return null;
      }
    };

    return (
      <div>
        <div ref={reportRef} style={{ display: 'none' }}>
          <div className="report-page">
            <CoverPage businessName={businessName} reportDate={today} />
          </div>
          <div className="report-page">
            <DiagnosticsPage
              companyName={businessName}
              ceoName={ceoName}
              businessNumber={businessNumber}
              openingDate={openingDate}
              industry={industry}
              businessAge={businessAge}
              address={fullAddress}
              sales2022={sales2022}
              sales2023={sales2023}
              sales2024={sales2024}
              sales2025={sales2025}
              growthRate={growthRate}
            />
          </div>
          <div className="report-page">
            <RiskAnalysisPage
              totalDebt={totalDebt}
              loanBalance={loanBalance}
              guaranteeBalance={guaranteeBalance}
              debtDistribution={debtDistribution}
              creditScore={creditScore}
              creditGrade={creditGrade}
              creditComment={creditComment}
              dti2024={dti2024}
              dti2024Status={dti2024Status}
              dti3Year={dti3Year}
              dti3YearStatus={dti3YearStatus}
              dtiInterpretation={dtiInterpretation}
            />
          </div>
          <div className="report-page">
            <SolutionPage
              diagnosisResult={diagnosisResult}
              currentRate={currentRate}
              improvedRate={improvedRate}
              rateDiff={rateDiff}
              currentInterest={currentInterest}
              improvedInterest={improvedInterest}
              interestSavings={interestSavings}
              executionPlan={executionPlan}
              totalExpectedAmount={totalExpectedAmount}
              recommendation1={recommendation1}
              recommendation2={recommendation2}
              recommendation3={recommendation3}
            />
          </div>
          <div className="report-page">
            <ConclusionPage
              reportDate={today}
              validUntil={validUntil}
              consultantName={customer.manager_name || '경영지원그룹 이음'}
            />
          </div>
        </div>
        
        {renderPage()}
      </div>
    );
  }
);

ProposalReport.displayName = 'ProposalReport';
