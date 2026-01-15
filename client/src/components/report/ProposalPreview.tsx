import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Printer, X } from "lucide-react"
import { CoverPage } from "./CoverPage"
import { ExecutiveSummaryPage } from "./ExecutiveSummaryPage"
import { RiskAnalysisPage } from "./RiskAnalysisPage"
import { ExecutionAgencyPage } from "./ExecutionAgencyPage"
import { TimelinePage } from "./TimelinePage"
import { ConclusionPage } from "./ConclusionPage"
import { ThankYouPage } from "./ThankYouPage"
import type { Customer, FinancialObligation, User } from "@shared/types"

interface ProposalPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Partial<Customer>;
  currentUser?: User;
  agencies: {
    name: string;
    limit: string;
    rate: string;
    period: string;
    monthlyPayment: string;
  }[];
  desiredAmount?: string;
}

export function ProposalPreview({
  isOpen,
  onClose,
  customer,
  currentUser,
  agencies = [],
  desiredAmount = ""
}: ProposalPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null)

  // Safety check - don't render if not open
  if (!isOpen) return null

  const handlePrint = () => {
    const originalTitle = document.title;
    const customerName = customer?.name ? `${customer.name} 대표님` : "";
    const fileName = `경영지원자문 제안서(${customerName})`;
    
    // Set document title
    document.title = fileName;
    
    // For some browsers, we need to ensure the title is updated before print
    setTimeout(() => {
      window.print();
      // Restore title after print dialog closes
      setTimeout(() => {
        document.title = originalTitle;
      }, 500);
    }, 100);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const getValidUntilDate = () => {
    const date = new Date()
    date.setDate(date.getDate() + 14)
    return formatDate(date)
  }

  const calculateBusinessAge = (): string => {
    if (!customer?.founding_date) return "정보 없음"
    const founding = new Date(customer.founding_date)
    const now = new Date()
    const diffMs = now.getTime() - founding.getTime()
    const years = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
    const months = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
    return `${years}년 ${months}개월`
  }

  const getTotalDebt = (): number => {
    if (!customer?.financial_obligations) return 0
    return customer.financial_obligations
      .filter(ob => ob.type === 'loan')
      .reduce((sum, ob) => sum + (ob.balance || 0), 0)
  }

  const getLoanBalance = (): number => {
    if (!customer?.financial_obligations) return 0
    return customer.financial_obligations.filter(ob => ob.type === 'loan').reduce((sum, ob) => sum + (ob.balance || 0), 0)
  }

  const getGuaranteeBalance = (): number => {
    if (!customer?.financial_obligations) return 0
    return customer.financial_obligations.filter(ob => ob.type === 'guarantee').reduce((sum, ob) => sum + (ob.balance || 0), 0)
  }

  const formatCurrency = (amount: number): string => {
    if (amount >= 100000000) {
      return `${(amount / 100000000).toFixed(1)}억원`
    } else if (amount >= 10000) {
      return `${(amount / 10000).toFixed(0)}만원`
    }
    return `${amount.toLocaleString()}원`
  }

  const calculateDTI = (revenue: number | undefined): number => {
    if (!revenue || revenue === 0) return 0
    const totalDebt = getTotalDebt()
    const revenueInWon = revenue * 100000000
    return Math.round((totalDebt / revenueInWon) * 100)
  }

  const calculate3YearDTI = (): number => {
    const y1 = customer?.sales_y1 || 0
    const y2 = customer?.sales_y2 || 0
    const y3 = customer?.sales_y3 || 0
    
    const validYears = [y1, y2, y3].filter(s => s > 0)
    if (validYears.length === 0) return 0
    
    const avgRevenue = validYears.reduce((sum, s) => sum + s, 0) / validYears.length
    const totalDebt = getTotalDebt()
    const avgRevenueInWon = avgRevenue * 100000000
    
    return Math.round((totalDebt / avgRevenueInWon) * 100)
  }

  const getDTIStatus = (dti: number): string => {
    if (dti <= 30) return "안전"
    if (dti <= 50) return "주의"
    return "위험"
  }

  const getDTIInterpretation = (): string => {
    const dti = calculateDTI(customer?.sales_y1)
    if (dti <= 30) return "안전"
    if (dti <= 50) return "주의 (관리 필요)"
    return "위험 (즉각적인 조치 필요)"
  }

  const getDebtDistribution = () => {
    if (!customer?.financial_obligations || customer.financial_obligations.length === 0) {
      return [
        { name: "1금융권", value: 0, percentage: 0 },
        { name: "2금융권", value: 0, percentage: 0 },
        { name: "공공기관", value: 0, percentage: 0 }
      ]
    }

    const total = getTotalDebt()
    const firstTier = customer.financial_obligations
      .filter(ob => ob.institution?.includes("은행"))
      .reduce((sum, ob) => sum + (ob.balance || 0), 0)
    const public_ = customer.financial_obligations
      .filter(ob => ["신용보증기금", "기술보증기금", "중소벤처기업진흥공단", "소상공인시장진흥공단"].some(k => ob.institution?.includes(k)))
      .reduce((sum, ob) => sum + (ob.balance || 0), 0)
    const secondTier = total - firstTier - public_

    return [
      { name: "1금융권", value: firstTier, percentage: total > 0 ? Math.round((firstTier / total) * 100) : 0 },
      { name: "2금융권", value: secondTier, percentage: total > 0 ? Math.round((secondTier / total) * 100) : 0 },
      { name: "공공기관", value: public_, percentage: total > 0 ? Math.round((public_ / total) * 100) : 0 }
    ]
  }

  const getCreditGrade = (score: number): string => {
    if (score >= 900) return "최우수"
    if (score >= 800) return "우수"
    if (score >= 700) return "양호"
    if (score >= 600) return "보통"
    return "주의"
  }

  const getCreditComment = (score: number): string => {
    if (score >= 800) return "정책자금 승인 가능성이 높은 우수 신용등급입니다."
    if (score >= 700) return "대부분의 정책자금 신청이 가능한 양호한 신용등급입니다."
    if (score >= 600) return "일부 정책자금 신청 시 보완이 필요할 수 있습니다."
    return "신용 개선이 필요한 상태입니다."
  }

  const calculateTotalFunding = (): string => {
    const totalManWon = agencies.reduce((sum, agency) => {
      const limitStr = agency.limit || ""
      
      const eokMatch = limitStr.match(/(\d+(?:,\d+)?)\s*억/)
      const manMatch = limitStr.match(/(\d+(?:,\d+)?)\s*만원/)
      
      let amountInManWon = 0
      
      if (eokMatch) {
        const eokValue = parseFloat(eokMatch[1].replace(/,/g, ""))
        amountInManWon += eokValue * 10000
      }
      
      if (manMatch) {
        const manValue = parseFloat(manMatch[1].replace(/,/g, ""))
        amountInManWon += manValue
      }
      
      return sum + amountInManWon
    }, 0)

    if (totalManWon >= 10000) {
      const eok = Math.floor(totalManWon / 10000)
      const man = Math.round(totalManWon % 10000)
      if (man === 0) return `${eok}억원`
      return `${eok}억 ${man.toLocaleString()}만원`
    }
    return `${totalManWon.toLocaleString()}만원`
  }

  const getKeyFindings = (): string[] => {
    const findings: string[] = []
    
    const creditScore = customer?.credit_score || 0
    if (creditScore >= 800) {
      findings.push(`신용점수 ${creditScore}점으로 우수한 신용등급을 보유하고 있어 정책자금 승인 가능성이 높습니다.`)
    } else if (creditScore >= 700) {
      findings.push(`신용점수 ${creditScore}점으로 양호한 신용등급입니다. 적절한 서류 준비로 승인 가능성을 높일 수 있습니다.`)
    } else {
      findings.push(`신용점수 ${creditScore}점으로 신용 보완이 필요합니다. 전문가 컨설팅을 통해 전략적 접근이 필요합니다.`)
    }

    const dti = calculateDTI(customer?.sales_y1)
    if (dti <= 30) {
      findings.push(`DTI ${dti}%로 안정적인 부채 구조를 유지하고 있어 추가 자금 조달 여력이 충분합니다.`)
    } else if (dti <= 50) {
      findings.push(`DTI ${dti}%로 주의가 필요하지만, 매출 대비 적정 수준의 부채를 유지하고 있습니다.`)
    } else {
      findings.push(`DTI ${dti}%로 부채 비율이 높습니다. 기존 부채 구조 개선과 함께 신규 조달을 추진해야 합니다.`)
    }

    const businessAge = calculateBusinessAge()
    findings.push(`업력 ${businessAge}으로 ${customer?.over_7_years ? '7년 이상 기업 특화 정책자금' : '창업 초기기업 지원 정책자금'} 활용이 가능합니다.`)

    return findings
  }

  const getRiskLevel = (): string => {
    const dti = calculateDTI(customer?.sales_y1)
    const creditScore = customer?.credit_score || 0
    
    if (dti <= 30 && creditScore >= 800) return "낮음"
    if (dti <= 50 && creditScore >= 700) return "보통"
    return "높음"
  }

  const calculateGrowthRate = (): number => {
    const sales = [customer?.sales_y3, customer?.sales_y2, customer?.sales_y1].filter(Boolean) as number[]
    if (sales.length < 2) return 0
    const firstSales = sales[0]
    const lastSales = sales[sales.length - 1]
    if (firstSales === 0) return 0
    const years = sales.length - 1
    return Math.round(((Math.pow(lastSales / firstSales, 1 / years) - 1) * 100))
  }

  const reportDate = formatDate(new Date())
  const keyFindings = getKeyFindings()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        id="proposal-print-dialog"
        className="max-w-[95vw] h-[95vh] p-0 overflow-hidden print:!bg-white"
      >
        <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b px-4 py-3 flex items-center justify-between print:hidden">
          <h2 className="text-lg font-semibold text-teal-900 dark:text-white">
            제안서 미리보기 - {customer?.company_name || ""}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              className="bg-teal-700 hover:bg-teal-800 text-white"
              data-testid="button-print-proposal"
            >
              <Printer className="w-4 h-4 mr-2" />
              PDF로 저장
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-preview"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div
          ref={printRef}
          className="overflow-y-auto h-full bg-[#E8E9EB] print:!bg-white print:overflow-visible force-light-mode"
          id="proposal-print-area"
        >
          <div className="max-w-[210mm] mx-auto space-y-4 print:space-y-0 py-4 print:py-0 force-light-mode">
            <CoverPage
              businessName={customer?.company_name || ""}
              reportDate={reportDate}
            />

            <ExecutiveSummaryPage
              businessName={customer?.company_name || ""}
              ceoName={customer?.name || ""}
              industry={customer?.business_type || customer?.industry || "정보 없음"}
              establishedDate={customer?.founding_date || "정보 없음"}
              creditScore={customer?.credit_score || 0}
              requiredFunding={desiredAmount}
              riskLevel={getRiskLevel()}
              keyFinding1={keyFindings[0] || ""}
              keyFinding2={keyFindings[1] || ""}
              keyFinding3={keyFindings[2] || ""}
              reportDate={reportDate}
            />

            <RiskAnalysisPage
              totalDebt={formatCurrency(getTotalDebt())}
              loanBalance={formatCurrency(getLoanBalance())}
              guaranteeBalance={formatCurrency(getGuaranteeBalance())}
              debtDistribution={getDebtDistribution()}
              creditScore={customer?.credit_score || 0}
              creditGrade={getCreditGrade(customer?.credit_score || 0)}
              creditScorePercentage={Math.min(100, ((customer?.credit_score || 0) / 1000) * 100)}
              creditComment={getCreditComment(customer?.credit_score || 0)}
              dti2024={calculateDTI(customer?.sales_y1)}
              dti2024Status={getDTIStatus(calculateDTI(customer?.sales_y1))}
              dti3Year={calculate3YearDTI()}
              dti3YearStatus={getDTIStatus(calculate3YearDTI())}
              dtiInterpretation={getDTIInterpretation()}
              reportDate={reportDate}
            />

            <ExecutionAgencyPage
              totalExpectedFunding={calculateTotalFunding()}
              fundingPeriod="예상 진행 기간: 4~7주"
              agencies={agencies}
              reportDate={reportDate}
            />

            <TimelinePage reportDate={reportDate} />

            <ConclusionPage
              reportDate={reportDate}
              validUntil={getValidUntilDate()}
              consultantName={currentUser?.name || "담당자"}
              consultantPhone={currentUser?.phone_work || currentUser?.phone || "070-0000-0000"}
              consultantEmail={currentUser?.email || "info@company.com"}
            />

            <ThankYouPage />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
