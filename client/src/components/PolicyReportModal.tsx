import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileDown, X, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { format, differenceInMonths, differenceInYears, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import type { Customer, FinancialObligation } from "@shared/types";
import logoGaro from "@assets/white_logo_garo_1767150624035.png";
import logoSero from "@assets/white_logo_sero_1767150624036.png";

interface PolicyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Partial<Customer>;
  obligations: FinancialObligation[];
}

interface FundingPlan {
  institution: string;
  amount: number;
}

const classifyFinancialSector = (institution: string): '1금융권' | '2금융권' | '공공기관' => {
  const name = institution.toLowerCase();
  const firstTierKeywords = [
    '은행', '국민', '신한', '하나', '우리', '기업', 'nh농협', 'kb', 'ibk',
    'sc제일', '씨티', 'bnk', 'dgb', 'jb', '경남', '부산', '광주', '전북', '제주'
  ];
  const publicKeywords = ['공단', '소상공인시장진흥', '중소벤처기업진흥', '신용보증재단', '기술보증기금'];
  if (publicKeywords.some(k => name.includes(k))) return '공공기관';
  if (firstTierKeywords.some(k => name.includes(k))) return '1금융권';
  return '2금융권';
};

const formatCurrency = (value: number): string => {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억원`;
  } else if (value >= 10000) {
    return `${(value / 10000).toFixed(0)}만원`;
  }
  return `${value.toLocaleString()}원`;
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try {
    return format(parseISO(dateStr), 'yyyy년 MM월 dd일', { locale: ko });
  } catch {
    return dateStr;
  }
};

const getBusinessAge = (foundingDate?: string): string => {
  if (!foundingDate) return '-';
  try {
    const founding = parseISO(foundingDate);
    const now = new Date();
    const years = differenceInYears(now, founding);
    const months = differenceInMonths(now, founding) % 12;
    if (years > 0) {
      return months > 0 ? `${years}년 ${months}개월` : `${years}년`;
    }
    return `${months}개월`;
  } catch {
    return '-';
  }
};

const getCreditScoreComment = (score: number): { label: string; comment: string; color: string } => {
  if (score >= 900) return { 
    label: '우수', 
    comment: '매우 우수한 신용 상태입니다. 대부분의 정책자금 신청에 유리합니다.',
    color: '#10b981'
  };
  if (score >= 800) return { 
    label: '양호', 
    comment: '양호한 신용 상태로, 주요 정책자금 신청 자격을 충족합니다.',
    color: '#3b82f6'
  };
  if (score >= 700) return { 
    label: '보통', 
    comment: '보통 수준의 신용으로, 일부 정책자금은 제한될 수 있습니다.',
    color: '#f59e0b'
  };
  return { 
    label: '관리필요', 
    comment: '신용 관리가 필요합니다. 신용 개선 후 정책자금 신청을 권장합니다.',
    color: '#ef4444'
  };
};

const currentYear = new Date().getFullYear();
const yearLabels = {
  y1: `${currentYear - 1}년`,
  y2: `${currentYear - 2}년`,
  y3: `${currentYear - 3}년`,
  recent: `${currentYear}년 (최근)`,
};

export function PolicyReportModal({ isOpen, onClose, customer, obligations }: PolicyReportModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showFundingInput, setShowFundingInput] = useState(true);
  const [fundingPlans, setFundingPlans] = useState<FundingPlan[]>([
    { institution: '', amount: 0 }
  ]);
  const reportRef = useRef<HTMLDivElement>(null);
  const totalPages = 5;

  useEffect(() => {
    if (isOpen) {
      setShowFundingInput(true);
      setCurrentPage(1);
      setFundingPlans([{ institution: '', amount: 0 }]);
    }
  }, [isOpen]);

  const today = format(new Date(), 'yyyy년 MM월 dd일', { locale: ko });
  const validUntil = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy년 MM월 dd일', { locale: ko });

  const businessName = customer.company_name || '기업명';
  const fullAddress = customer.business_address 
    ? `${customer.business_address}${customer.business_address_detail ? ` ${customer.business_address_detail}` : ''}`
    : '-';

  const loans = obligations.filter(o => o.type === 'loan');
  const guarantees = obligations.filter(o => o.type === 'guarantee');
  const totalLoanBalance = loans.reduce((sum, l) => sum + l.balance, 0);
  const totalGuaranteeBalance = guarantees.reduce((sum, g) => sum + g.balance, 0);
  const totalDebt = totalLoanBalance + totalGuaranteeBalance;

  const sectorBreakdown = { first: 0, second: 0, public: 0 };
  obligations.forEach(ob => {
    const sector = classifyFinancialSector(ob.institution);
    if (sector === '1금융권') sectorBreakdown.first += ob.balance;
    else if (sector === '2금융권') sectorBreakdown.second += ob.balance;
    else sectorBreakdown.public += ob.balance;
  });

  const firstTierRatio = totalDebt > 0 ? (sectorBreakdown.first / totalDebt) * 100 : 0;
  const secondTierRatio = totalDebt > 0 ? (sectorBreakdown.second / totalDebt) * 100 : 0;
  const publicRatio = totalDebt > 0 ? (sectorBreakdown.public / totalDebt) * 100 : 0;

  const creditScore = customer.credit_score || 0;
  const creditScoreInfo = getCreditScoreComment(creditScore);
  const hasSecondTier = sectorBreakdown.second > 0;
  const isHighRisk = creditScore < 800 || hasSecondTier;

  const avgSales = ((customer.sales_y1 || 0) + (customer.sales_y2 || 0) + (customer.sales_y3 || 0)) / 3;
  const y1Dti = (customer.sales_y1 && customer.sales_y1 > 0) 
    ? (totalDebt / 100000000) / customer.sales_y1 * 100 
    : 0;
  const avg3yDti = avgSales > 0 ? (totalDebt / 100000000) / avgSales * 100 : 0;

  const getDtiStatus = (dti: number): { label: string; color: string } => {
    if (dti <= 30) return { label: '안전', color: '#10b981' };
    if (dti <= 50) return { label: '주의', color: '#f59e0b' };
    return { label: '위험', color: '#ef4444' };
  };

  const totalFundingAmount = fundingPlans.reduce((sum, p) => sum + (p.amount || 0), 0);
  const validFundingPlans = fundingPlans.filter(p => p.institution && p.amount > 0);

  const addFundingPlan = () => {
    setFundingPlans([...fundingPlans, { institution: '', amount: 0 }]);
  };

  const removeFundingPlan = (index: number) => {
    if (fundingPlans.length > 1) {
      setFundingPlans(fundingPlans.filter((_, i) => i !== index));
    }
  };

  const updateFundingPlan = (index: number, field: keyof FundingPlan, value: string | number) => {
    const updated = [...fundingPlans];
    if (field === 'amount') {
      updated[index].amount = Number(value) * 100000000;
    } else {
      updated[index].institution = value as string;
    }
    setFundingPlans(updated);
  };

  const handleStartPreview = () => {
    setShowFundingInput(false);
  };

  const generatePDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPDF(true);

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 210;
      const pageHeight = 297;

      for (let page = 1; page <= totalPages; page++) {
        setCurrentPage(page);
        await new Promise(resolve => setTimeout(resolve, 400));

        const canvas = await html2canvas(reportRef.current, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        });

        const imgData = canvas.toDataURL('image/png', 1.0);
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (page > 1) {
          pdf.addPage();
        }

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }

      pdf.save(`${businessName}_정책자금조달보고서.pdf`);
    } catch (error) {
      console.error('PDF 생성 오류:', error);
    } finally {
      setIsGeneratingPDF(false);
      setCurrentPage(1);
    }
  };

  const pageStyles: React.CSSProperties = {
    fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
    lineHeight: 1.6,
    padding: '40px',
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#1e293b',
  };

  const tableStyles: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  };

  const thStyles: React.CSSProperties = {
    padding: '12px 16px',
    textAlign: 'left',
    backgroundColor: '#f8fafc',
    borderTop: '2px solid #3b82f6',
    borderBottom: '1px solid #e2e8f0',
    fontWeight: 600,
    color: '#334155',
  };

  const tdStyles: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    color: '#475569',
  };

  const tdLabelStyles: React.CSSProperties = {
    ...tdStyles,
    backgroundColor: '#f8fafc',
    fontWeight: 500,
    width: '25%',
    color: '#334155',
  };

  const renderPage = () => {
    switch (currentPage) {
      case 1:
        return (
          <div style={{ ...pageStyles, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)' }}>
            <img 
              src={logoSero} 
              alt="경영지원그룹 이음" 
              style={{ height: '100px', marginBottom: '48px', mixBlendMode: 'multiply' }} 
            />
            <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b', textAlign: 'center', marginBottom: '12px' }}>
              {businessName} 귀사 맞춤형
            </h1>
            <h2 style={{ fontSize: '40px', fontWeight: 700, color: '#2563eb', textAlign: 'center', marginBottom: '32px' }}>
              정책자금 조달 전략 보고서
            </h2>
            <div style={{ width: '80px', height: '4px', backgroundColor: '#2563eb', marginBottom: '32px', borderRadius: '2px' }} />
            <p style={{ fontSize: '18px', color: '#64748b', marginBottom: '16px' }}>작성일: {today}</p>
            <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '48px' }}>유효기간: {validUntil}까지</p>
            <div style={{ 
              backgroundColor: '#2563eb', 
              color: 'white', 
              padding: '24px 40px', 
              borderRadius: '12px', 
              textAlign: 'center',
              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.3)'
            }}>
              <p style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>
                본 컨설팅은 계약 기간 내 조달 실패 시
              </p>
              <p style={{ fontSize: '22px', fontWeight: 700 }}>
                계약금 100% 환불을 보장합니다
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div style={pageStyles}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>기업 현황 진단</h2>
              <img src={logoGaro} alt="로고" style={{ height: '60px', mixBlendMode: 'multiply' }} />
            </div>
            <div style={{ borderBottom: '2px solid #2563eb', marginBottom: '32px' }} />
            
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>기본 정보</h3>
              <table style={tableStyles}>
                <tbody>
                  <tr>
                    <td style={tdLabelStyles}>상호명</td>
                    <td style={tdStyles}>{businessName}</td>
                    <td style={tdLabelStyles}>대표자</td>
                    <td style={tdStyles}>{customer.name || '-'}</td>
                  </tr>
                  <tr>
                    <td style={tdLabelStyles}>사업자번호</td>
                    <td style={tdStyles}>{customer.business_registration_number || '-'}</td>
                    <td style={tdLabelStyles}>업력</td>
                    <td style={tdStyles}>{getBusinessAge(customer.founding_date)}</td>
                  </tr>
                  <tr>
                    <td style={tdLabelStyles}>업종</td>
                    <td style={tdStyles}>{customer.business_type || '-'}</td>
                    <td style={tdLabelStyles}>종목</td>
                    <td style={tdStyles}>{customer.business_item || '-'}</td>
                  </tr>
                  <tr>
                    <td style={tdLabelStyles}>개업일</td>
                    <td style={{ ...tdStyles }} colSpan={3}>{formatDate(customer.founding_date)}</td>
                  </tr>
                  <tr>
                    <td style={tdLabelStyles}>사업장 주소</td>
                    <td style={{ ...tdStyles }} colSpan={3}>{fullAddress}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>최근 3개년 매출 추이</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '40px', height: '200px', padding: '20px 0' }}>
                {[
                  { year: yearLabels.y3, value: customer.sales_y3 || 0 },
                  { year: yearLabels.y2, value: customer.sales_y2 || 0 },
                  { year: yearLabels.y1, value: customer.sales_y1 || 0 },
                  { year: yearLabels.recent, value: customer.recent_sales || 0 },
                ].map((item, idx) => {
                  const maxVal = Math.max(
                    customer.sales_y3 || 0,
                    customer.sales_y2 || 0,
                    customer.sales_y1 || 0,
                    customer.recent_sales || 0,
                    1
                  );
                  const height = (item.value / maxVal) * 140;
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#2563eb', marginBottom: '8px' }}>
                        {item.value.toFixed(1)}억
                      </span>
                      <div 
                        style={{ 
                          width: '60px', 
                          background: 'linear-gradient(to top, #2563eb, #60a5fa)',
                          borderRadius: '6px 6px 0 0',
                          height: `${Math.max(height, 12)}px`
                        }}
                      />
                      <span style={{ marginTop: '12px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>{item.year}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right', marginTop: '24px' }}>페이지 2/5</p>
          </div>
        );

      case 3:
        return (
          <div style={pageStyles}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>금융 부채 및 DTI 분석</h2>
              <img src={logoGaro} alt="로고" style={{ height: '60px', mixBlendMode: 'multiply' }} />
            </div>
            <div style={{ borderBottom: '2px solid #2563eb', marginBottom: '32px' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>부채 현황</h3>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ color: '#64748b' }}>총 부채액</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>{formatCurrency(totalDebt)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>대출 잔액</span>
                      <span style={{ fontWeight: 500, color: '#2563eb' }}>{formatCurrency(totalLoanBalance)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>보증 잔액</span>
                      <span style={{ fontWeight: 500, color: '#10b981' }}>{formatCurrency(totalGuaranteeBalance)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', borderLeft: `4px solid ${creditScoreInfo.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#334155' }}>신용점수</span>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '20px', 
                      backgroundColor: creditScoreInfo.color, 
                      color: 'white', 
                      fontSize: '13px', 
                      fontWeight: 600 
                    }}>
                      {creditScore}점 ({creditScoreInfo.label})
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                    {creditScoreInfo.comment}
                  </p>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>금융권별 분포</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'relative', width: '160px', height: '160px' }}>
                    <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      {firstTierRatio > 0 && (
                        <circle
                          cx="18" cy="18" r="15.915"
                          fill="none" stroke="#3b82f6" strokeWidth="3"
                          strokeDasharray={`${firstTierRatio} ${100 - firstTierRatio}`}
                          strokeDashoffset="25"
                        />
                      )}
                      {secondTierRatio > 0 && (
                        <circle
                          cx="18" cy="18" r="15.915"
                          fill="none" stroke="#f59e0b" strokeWidth="3"
                          strokeDasharray={`${secondTierRatio} ${100 - secondTierRatio}`}
                          strokeDashoffset={25 - firstTierRatio}
                        />
                      )}
                      {publicRatio > 0 && (
                        <circle
                          cx="18" cy="18" r="15.915"
                          fill="none" stroke="#10b981" strokeWidth="3"
                          strokeDasharray={`${publicRatio} ${100 - publicRatio}`}
                          strokeDashoffset={25 - firstTierRatio - secondTierRatio}
                        />
                      )}
                    </svg>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                    <span>1금융권 {firstTierRatio.toFixed(0)}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                    <span>2금융권 {secondTierRatio.toFixed(0)}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                    <span>공공기관 {publicRatio.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>DTI(부채비율) 분석</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#64748b' }}>{yearLabels.y1} 매출 기준 DTI</span>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '4px', 
                      backgroundColor: getDtiStatus(y1Dti).color, 
                      color: 'white', 
                      fontSize: '13px', 
                      fontWeight: 500 
                    }}>
                      {getDtiStatus(y1Dti).label}
                    </span>
                  </div>
                  <p style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{y1Dti.toFixed(1)}%</p>
                  <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '8px' }}>(총부채 ÷ {yearLabels.y1} 매출) × 100</p>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#64748b' }}>3년 평균 매출 기준 DTI</span>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '4px', 
                      backgroundColor: getDtiStatus(avg3yDti).color, 
                      color: 'white', 
                      fontSize: '13px', 
                      fontWeight: 500 
                    }}>
                      {getDtiStatus(avg3yDti).label}
                    </span>
                  </div>
                  <p style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{avg3yDti.toFixed(1)}%</p>
                  <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '8px' }}>(총부채 ÷ 3년 평균 매출) × 100</p>
                </div>
              </div>
              <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#eff6ff', borderRadius: '8px' }}>
                <p style={{ fontSize: '14px', color: '#334155', margin: 0 }}>
                  <strong>DTI 해석:</strong> DTI 30% 이하는 안전, 30~50%는 주의, 50% 초과는 위험 구간입니다. 
                  현재 귀사의 DTI는 <strong style={{ color: getDtiStatus(avg3yDti).color }}>{getDtiStatus(avg3yDti).label}</strong> 수준으로 판단됩니다.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right', marginTop: '24px' }}>페이지 3/5</p>
          </div>
        );

      case 4:
        return (
          <div style={pageStyles}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>맞춤형 조달 전략</h2>
              <img src={logoGaro} alt="로고" style={{ height: '60px', mixBlendMode: 'multiply' }} />
            </div>
            <div style={{ borderBottom: '2px solid #2563eb', marginBottom: '32px' }} />

            {isHighRisk ? (
              <div>
                <div style={{ 
                  backgroundColor: '#fffbeb', 
                  borderLeft: '4px solid #f59e0b', 
                  padding: '20px', 
                  marginBottom: '24px',
                  borderRadius: '0 8px 8px 0'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>진단 결과</h3>
                  <p style={{ color: '#78350f', margin: 0, lineHeight: 1.7 }}>
                    현재 구조로는 자력 조달이 매우 어렵습니다. 컨설팅이 필요한 대상으로 보여지며
                    고금리 대환을 통한 신용 관리와 부채 구조 재편이 선행되어야 합니다.
                  </p>
                </div>

                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>이자 비용 절감 시뮬레이션</h3>
                <table style={tableStyles}>
                  <thead>
                    <tr>
                      <th style={thStyles}>구분</th>
                      <th style={{ ...thStyles, textAlign: 'right' }}>현재</th>
                      <th style={{ ...thStyles, textAlign: 'right' }}>구조개선 후</th>
                      <th style={{ ...thStyles, textAlign: 'right' }}>절감액</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdStyles}>예상 평균 금리</td>
                      <td style={{ ...tdStyles, textAlign: 'right' }}>12.5%</td>
                      <td style={{ ...tdStyles, textAlign: 'right', color: '#2563eb' }}>5.5%</td>
                      <td style={{ ...tdStyles, textAlign: 'right', color: '#10b981' }}>-7.0%p</td>
                    </tr>
                    <tr>
                      <td style={tdStyles}>연간 이자 비용</td>
                      <td style={{ ...tdStyles, textAlign: 'right' }}>{formatCurrency(totalDebt * 0.125)}</td>
                      <td style={{ ...tdStyles, textAlign: 'right', color: '#2563eb' }}>{formatCurrency(totalDebt * 0.055)}</td>
                      <td style={{ ...tdStyles, textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                        {formatCurrency(totalDebt * 0.07)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px', marginTop: '24px' }}>
                  <h4 style={{ fontWeight: 600, color: '#334155', marginBottom: '12px' }}>권장 조치사항</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#475569' }}>
                    <li style={{ marginBottom: '8px' }}>2금융권 부채를 1금융권으로 대환하여 신용등급 개선</li>
                    <li style={{ marginBottom: '8px' }}>신용점수 800점 이상 달성 후 정책자금 신청</li>
                    <li>부채 구조 재편을 통한 DTI 30% 이하 달성</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ 
                  backgroundColor: '#ecfdf5', 
                  borderLeft: '4px solid #10b981', 
                  padding: '20px', 
                  marginBottom: '24px',
                  borderRadius: '0 8px 8px 0'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#065f46', marginBottom: '8px' }}>진단 결과</h3>
                  <p style={{ color: '#064e3b', margin: 0, lineHeight: 1.7 }}>
                    귀사는 매우 우수한 건전성을 보유하고 있습니다. 현재의 매출 성장세를 레버리지 삼아,
                    저금리 시설 자금 및 운전자금을 최대 한도로 확보할 최적기입니다.
                  </p>
                </div>

                {validFundingPlans.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>기대 조달 규모</h3>
                    <table style={tableStyles}>
                      <thead>
                        <tr>
                          <th style={thStyles}>No.</th>
                          <th style={thStyles}>조달 기관</th>
                          <th style={{ ...thStyles, textAlign: 'right' }}>예정 금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validFundingPlans.map((plan, idx) => (
                          <tr key={idx}>
                            <td style={tdStyles}>{idx + 1}</td>
                            <td style={tdStyles}>{plan.institution}</td>
                            <td style={{ ...tdStyles, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(plan.amount)}</td>
                          </tr>
                        ))}
                        <tr style={{ backgroundColor: '#f0f9ff' }}>
                          <td style={{ ...tdStyles, fontWeight: 600 }} colSpan={2}>총 기대 조달 금액</td>
                          <td style={{ ...tdStyles, textAlign: 'right', fontWeight: 700, color: '#2563eb', fontSize: '18px' }}>
                            {formatCurrency(totalFundingAmount)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </>
                )}

                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '20px', marginTop: '24px' }}>
                  <h4 style={{ fontWeight: 600, color: '#334155', marginBottom: '12px' }}>추천 조달 전략</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#475569' }}>
                    <li style={{ marginBottom: '8px' }}>정책자금 우선 활용으로 자금 조달 비용 최소화</li>
                    <li style={{ marginBottom: '8px' }}>시설자금과 운전자금의 적정 배분으로 성장 기반 확보</li>
                    <li>신용보증기금/기술보증기금 보증 활용으로 대출 한도 극대화</li>
                  </ul>
                </div>
              </div>
            )}

            <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right', marginTop: '24px' }}>페이지 4/5</p>
          </div>
        );

      case 5:
        return (
          <div style={pageStyles}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>결론 및 제언</h2>
              <img src={logoGaro} alt="로고" style={{ height: '60px', mixBlendMode: 'multiply' }} />
            </div>
            <div style={{ borderBottom: '2px solid #2563eb', marginBottom: '32px' }} />

            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>전문가 컨설팅 vs 셀프 신청 비교</h3>
            <table style={tableStyles}>
              <thead>
                <tr>
                  <th style={thStyles}>구분</th>
                  <th style={thStyles}>전문가 컨설팅</th>
                  <th style={thStyles}>셀프 신청</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdLabelStyles}>승인율</td>
                  <td style={{ ...tdStyles, color: '#10b981', fontWeight: 500 }}>85% 이상</td>
                  <td style={{ ...tdStyles, color: '#ef4444' }}>30~40%</td>
                </tr>
                <tr>
                  <td style={tdLabelStyles}>소요 시간</td>
                  <td style={tdStyles}>2~3주</td>
                  <td style={tdStyles}>1~2개월</td>
                </tr>
                <tr>
                  <td style={tdLabelStyles}>서류 준비</td>
                  <td style={tdStyles}>전문가 대행</td>
                  <td style={tdStyles}>본인 직접 준비</td>
                </tr>
                <tr>
                  <td style={tdLabelStyles}>심사 대응</td>
                  <td style={tdStyles}>전략적 대응 지원</td>
                  <td style={tdStyles}>본인 대응</td>
                </tr>
                <tr>
                  <td style={tdLabelStyles}>리스크</td>
                  <td style={{ ...tdStyles, color: '#10b981' }}>실패 시 100% 환불</td>
                  <td style={{ ...tdStyles, color: '#ef4444' }}>6개월 재신청 금지</td>
                </tr>
              </tbody>
            </table>

            <div style={{ 
              backgroundColor: '#fef2f2', 
              borderLeft: '4px solid #ef4444', 
              padding: '20px', 
              marginTop: '24px',
              marginBottom: '24px',
              borderRadius: '0 8px 8px 0'
            }}>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#991b1b', marginBottom: '8px' }}>셀프 신청 시 주의사항</h4>
              <p style={{ color: '#7f1d1d', margin: 0, lineHeight: 1.7 }}>
                정책자금 심사에서 부결될 경우, <strong>6개월간 동일 기관 재신청이 금지</strong>됩니다. 
                이는 귀사의 자금 조달 일정에 심각한 차질을 줄 수 있습니다. 
                전문가와 함께 철저한 준비 후 신청하시길 권장합니다.
              </p>
            </div>

            <div style={{ 
              backgroundColor: '#2563eb', 
              color: 'white', 
              padding: '24px', 
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>
                본 보고서는 <strong>{today}</strong> 기준으로 작성되었습니다.
              </p>
              <p style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                유효기간: <strong>{validUntil}</strong>까지
              </p>
            </div>

            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <img src={logoGaro} alt="경영지원그룹 이음" style={{ height: '40px', mixBlendMode: 'multiply', opacity: 0.7 }} />
              <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>
                경영지원그룹 이음 | 정책자금 전문 컨설팅
              </p>
            </div>

            <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right', marginTop: '24px' }}>페이지 5/5</p>
          </div>
        );

      default:
        return null;
    }
  };

  if (showFundingInput) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>기대 조달 규모 입력</DialogTitle>
            <DialogDescription>
              제안서에 포함될 조달 기관과 예정 금액을 입력해 주세요.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {fundingPlans.map((plan, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">기관명</Label>
                  <Input
                    placeholder="예: 소상공인시장진흥공단"
                    value={plan.institution}
                    onChange={(e) => updateFundingPlan(idx, 'institution', e.target.value)}
                    data-testid={`input-funding-institution-${idx}`}
                  />
                </div>
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">금액 (억원)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.5"
                    value={plan.amount > 0 ? (plan.amount / 100000000).toString() : ''}
                    onChange={(e) => updateFundingPlan(idx, 'amount', e.target.value)}
                    data-testid={`input-funding-amount-${idx}`}
                  />
                </div>
                {fundingPlans.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeFundingPlan(idx)}
                    data-testid={`button-remove-funding-${idx}`}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              variant="outline"
              size="sm"
              onClick={addFundingPlan}
              className="w-full"
              data-testid="button-add-funding"
            >
              <Plus className="w-4 h-4 mr-2" />
              기관 추가
            </Button>

            {totalFundingAmount > 0 && (
              <div className="p-3 bg-muted rounded-lg text-center">
                <span className="text-sm text-muted-foreground">총 기대 조달 금액: </span>
                <span className="font-semibold text-blue-600">{formatCurrency(totalFundingAmount)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              취소
            </Button>
            <Button onClick={handleStartPreview} className="flex-1" data-testid="button-start-preview">
              미리보기 시작
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex-row items-center justify-between">
          <div>
            <DialogTitle>정책자금 조달 보고서 미리보기</DialogTitle>
            <DialogDescription className="mt-1">
              {businessName} - 총 {totalPages}페이지
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={generatePDF}
              disabled={isGeneratingPDF}
              data-testid="button-download-pdf"
            >
              {isGeneratingPDF ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 mr-2" />
                  PDF 다운로드
                </>
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 p-6">
            <div 
              ref={reportRef}
              style={{ 
                width: '595px', 
                height: '842px', 
                margin: '0 auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
              }}
            >
              {renderPage()}
            </div>
          </ScrollArea>

          <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isGeneratingPDF}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              이전
            </Button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  disabled={isGeneratingPDF}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted hover:bg-muted-foreground/20'
                  }`}
                  data-testid={`button-page-${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || isGeneratingPDF}
              data-testid="button-next-page"
            >
              다음
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
