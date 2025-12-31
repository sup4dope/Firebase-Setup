import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileDown, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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

const classifyFinancialSector = (institution: string): '1금융권' | '2금융권' | '공공기관' => {
  const name = institution.toLowerCase();
  const firstTierKeywords = [
    '은행', '국민', '신한', '하나', '우리', '기업', 'nh농협', 'kb', 'ibk',
    'sc제일', '씨티', 'bnk', 'dgb', 'jb', '경남', '부산', '광주', '전북', '제주'
  ];
  const publicKeywords = ['공단', '소상공인시장진흥', '중소벤처기업진흥'];
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

export function PolicyReportModal({ isOpen, onClose, customer, obligations }: PolicyReportModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const totalPages = 5;

  const today = format(new Date(), 'yyyy년 MM월 dd일', { locale: ko });
  const validUntil = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy년 MM월 dd일', { locale: ko });

  const loans = obligations.filter(o => o.type === 'loan');
  const guarantees = obligations.filter(o => o.type === 'guarantee');
  const totalLoanBalance = loans.reduce((sum, l) => sum + l.balance, 0);
  const totalGuaranteeBalance = guarantees.reduce((sum, g) => sum + g.balance, 0);
  const totalDebt = totalLoanBalance + totalGuaranteeBalance;

  const sectorBreakdown = {
    first: 0,
    second: 0,
    public: 0,
  };
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
        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await html2canvas(reportRef.current, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (page > 1) {
          pdf.addPage();
        }

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }

      pdf.save(`${customer.company_name || '기업'}_정책자금조달보고서.pdf`);
    } catch (error) {
      console.error('PDF 생성 오류:', error);
    } finally {
      setIsGeneratingPDF(false);
      setCurrentPage(1);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 1:
        return (
          <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-50 to-blue-50 p-12">
            <img src={logoSero} alt="경영지원그룹 이음" className="h-24 mb-12" />
            <h1 className="text-3xl font-bold text-slate-800 text-center mb-4">
              {customer.company_name || '기업명'} 귀사 맞춤형
            </h1>
            <h2 className="text-4xl font-bold text-blue-600 text-center mb-8">
              정책자금 조달 전략 보고서
            </h2>
            <div className="w-24 h-1 bg-blue-600 mb-8" />
            <p className="text-lg text-slate-600 mb-4">작성일: {today}</p>
            <div className="mt-auto bg-blue-600 text-white px-8 py-4 rounded-lg text-center">
              <p className="font-semibold text-lg">
                본 컨설팅은 계약 기간 내 조달 실패 시
              </p>
              <p className="font-bold text-xl">
                계약금 100% 환불을 보장합니다
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col h-full bg-white p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-800">기업 현황 진단</h2>
              <img src={logoGaro} alt="로고" className="h-8" />
            </div>
            <div className="border-b-2 border-blue-600 mb-6" />
            
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-slate-700 mb-4">기본 정보</h3>
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 px-4 bg-slate-100 font-medium w-1/4">상호명</td>
                    <td className="py-3 px-4">{customer.company_name || '-'}</td>
                    <td className="py-3 px-4 bg-slate-100 font-medium w-1/4">대표자</td>
                    <td className="py-3 px-4">{customer.name || '-'}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4 bg-slate-100 font-medium">개업일</td>
                    <td className="py-3 px-4">{formatDate(customer.founding_date)}</td>
                    <td className="py-3 px-4 bg-slate-100 font-medium">업력</td>
                    <td className="py-3 px-4">{getBusinessAge(customer.founding_date)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4 bg-slate-100 font-medium">업종</td>
                    <td className="py-3 px-4">{customer.business_type || '-'}</td>
                    <td className="py-3 px-4 bg-slate-100 font-medium">종목</td>
                    <td className="py-3 px-4">{customer.business_item || '-'}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4 bg-slate-100 font-medium">사업자번호</td>
                    <td className="py-3 px-4" colSpan={3}>{customer.business_registration_number || '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 bg-slate-100 font-medium">사업장 주소</td>
                    <td className="py-3 px-4" colSpan={3}>{customer.business_address || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-700 mb-4">최근 3개년 매출 추이</h3>
              <div className="flex items-end justify-center gap-8 h-48">
                {[
                  { year: 'Y-3', value: customer.sales_y3 || 0 },
                  { year: 'Y-2', value: customer.sales_y2 || 0 },
                  { year: 'Y-1', value: customer.sales_y1 || 0 },
                  { year: '최근', value: customer.recent_sales || 0 },
                ].map((item, idx) => {
                  const maxVal = Math.max(
                    customer.sales_y3 || 0,
                    customer.sales_y2 || 0,
                    customer.sales_y1 || 0,
                    customer.recent_sales || 0,
                    1
                  );
                  const height = (item.value / maxVal) * 150;
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <span className="text-sm font-semibold text-blue-600 mb-1">
                        {item.value.toFixed(1)}억
                      </span>
                      <div 
                        className="w-16 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md"
                        style={{ height: `${Math.max(height, 10)}px` }}
                      />
                      <span className="mt-2 text-sm text-slate-600">{item.year}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-slate-400 text-right mt-4">페이지 2/5</p>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col h-full bg-white p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-800">금융 부채 및 DTI 분석</h2>
              <img src={logoGaro} alt="로고" className="h-8" />
            </div>
            <div className="border-b-2 border-blue-600 mb-6" />

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-700 mb-4">부채 현황</h3>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-slate-600">총 부채액</span>
                    <span className="text-2xl font-bold text-slate-800">{formatCurrency(totalDebt)}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">대출 잔액</span>
                      <span className="font-medium text-blue-600">{formatCurrency(totalLoanBalance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">보증 잔액</span>
                      <span className="font-medium text-emerald-600">{formatCurrency(totalGuaranteeBalance)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-700 mb-4">금융권별 분포</h3>
                <div className="flex items-center justify-center">
                  <div className="relative w-40 h-40">
                    <svg viewBox="0 0 36 36" className="w-full h-full">
                      <circle
                        cx="18" cy="18" r="15.915"
                        fill="none" stroke="#e2e8f0" strokeWidth="3"
                      />
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
                <div className="flex justify-center gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>1금융권 {firstTierRatio.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span>2금융권 {secondTierRatio.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span>공공기관 {publicRatio.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-700 mb-4">DTI(부채비율) 분석</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-600">Y-1 매출 기준 DTI</span>
                    <span 
                      className="px-2 py-1 rounded text-white text-sm font-medium"
                      style={{ backgroundColor: getDtiStatus(y1Dti).color }}
                    >
                      {getDtiStatus(y1Dti).label}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-slate-800">{y1Dti.toFixed(1)}%</p>
                  <p className="text-sm text-slate-500 mt-1">
                    (총부채 ÷ Y-1 매출) × 100
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-600">3년 평균 매출 기준 DTI</span>
                    <span 
                      className="px-2 py-1 rounded text-white text-sm font-medium"
                      style={{ backgroundColor: getDtiStatus(avg3yDti).color }}
                    >
                      {getDtiStatus(avg3yDti).label}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-slate-800">{avg3yDti.toFixed(1)}%</p>
                  <p className="text-sm text-slate-500 mt-1">
                    (총부채 ÷ 3년 평균 매출) × 100
                  </p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-slate-700">
                  <strong>DTI 해석:</strong> DTI 30% 이하는 안전, 30~50%는 주의, 50% 초과는 위험 구간입니다.
                  현재 귀사의 DTI는 {getDtiStatus(avg3yDti).label} 수준으로 판단됩니다.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-right mt-4">페이지 3/5</p>
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col h-full bg-white p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-800">맞춤형 조달 전략</h2>
              <img src={logoGaro} alt="로고" className="h-8" />
            </div>
            <div className="border-b-2 border-blue-600 mb-6" />

            {isHighRisk ? (
              <div className="flex-1">
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6">
                  <h3 className="text-lg font-semibold text-amber-800 mb-2">진단 결과</h3>
                  <p className="text-slate-700">
                    현재 구조로는 자력 조달이 매우 어렵습니다. 컨설팅이 필요한 대상으로 보여지며
                    고금리 대환을 통한 신용 관리와 부채 구조 재편이 선행되어야 합니다.
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-slate-700 mb-4">이자 비용 절감 시뮬레이션</h3>
                <table className="w-full border-collapse mb-6">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="py-3 px-4 text-left border">구분</th>
                      <th className="py-3 px-4 text-right border">현재</th>
                      <th className="py-3 px-4 text-right border">구조개선 후</th>
                      <th className="py-3 px-4 text-right border">절감액</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3 px-4 border">예상 평균 금리</td>
                      <td className="py-3 px-4 text-right border">12.5%</td>
                      <td className="py-3 px-4 text-right border text-blue-600">5.5%</td>
                      <td className="py-3 px-4 text-right border text-emerald-600">-7.0%p</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 border">연간 이자 비용</td>
                      <td className="py-3 px-4 text-right border">{formatCurrency(totalDebt * 0.125)}</td>
                      <td className="py-3 px-4 text-right border text-blue-600">{formatCurrency(totalDebt * 0.055)}</td>
                      <td className="py-3 px-4 text-right border text-emerald-600 font-semibold">
                        {formatCurrency(totalDebt * 0.07)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="font-semibold text-slate-700 mb-2">권장 조치사항</h4>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600">1.</span>
                      <span>2금융권 부채를 1금융권으로 대환하여 신용등급 개선</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600">2.</span>
                      <span>신용점수 800점 이상 달성 후 정책자금 신청</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600">3.</span>
                      <span>부채 구조 재편을 통한 DTI 30% 이하 달성</span>
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mb-6">
                  <h3 className="text-lg font-semibold text-emerald-800 mb-2">진단 결과</h3>
                  <p className="text-slate-700">
                    귀사는 매우 우수한 건전성을 보유하고 있습니다. 현재의 매출 성장세를 레버리지 삼아,
                    저금리 시설 자금 및 운전자금을 최대 한도로 확보할 최적기입니다.
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-slate-700 mb-4">향후 3년 매출 성장 예상 및 조달 가능 한도</h3>
                <div className="flex items-end justify-center gap-8 h-40 mb-6">
                  {[
                    { year: '현재', value: customer.recent_sales || avgSales, fundable: 0 },
                    { year: '1년 후', value: (customer.recent_sales || avgSales) * 1.15, fundable: avgSales * 0.3 },
                    { year: '2년 후', value: (customer.recent_sales || avgSales) * 1.32, fundable: avgSales * 0.5 },
                    { year: '3년 후', value: (customer.recent_sales || avgSales) * 1.52, fundable: avgSales * 0.7 },
                  ].map((item, idx) => {
                    const maxVal = (customer.recent_sales || avgSales) * 1.52 + avgSales * 0.7;
                    const salesHeight = (item.value / maxVal) * 120;
                    const fundHeight = (item.fundable / maxVal) * 120;
                    return (
                      <div key={idx} className="flex flex-col items-center">
                        <span className="text-xs font-medium text-slate-600 mb-1">
                          {item.value.toFixed(1)}억
                        </span>
                        <div className="flex items-end">
                          <div 
                            className="w-8 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md mr-1"
                            style={{ height: `${Math.max(salesHeight, 10)}px` }}
                          />
                          {item.fundable > 0 && (
                            <div 
                              className="w-8 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md"
                              style={{ height: `${Math.max(fundHeight, 10)}px` }}
                            />
                          )}
                        </div>
                        <span className="mt-2 text-sm text-slate-600">{item.year}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-6 text-sm mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded" />
                    <span>예상 매출</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-emerald-500 rounded" />
                    <span>조달 가능 한도</span>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-slate-700 mb-2">추천 자금 조달 전략</h4>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600">1.</span>
                      <span>중소기업진흥공단 시설자금 - 연 2.5% 이하 저금리</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600">2.</span>
                      <span>소상공인시장진흥공단 운전자금 - 최대 5천만원</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600">3.</span>
                      <span>지역 신용보증재단 보증 지원 - 보증료 0.5%</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 text-right mt-4">페이지 4/5</p>
          </div>
        );

      case 5:
        return (
          <div className="flex flex-col h-full bg-white p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-800">결론 및 제언</h2>
              <img src={logoGaro} alt="로고" className="h-8" />
            </div>
            <div className="border-b-2 border-blue-600 mb-6" />

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-700 mb-4">전문가 컨설팅 vs 셀프 진행 비교</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="py-3 px-4 text-left border w-1/3">구분</th>
                    <th className="py-3 px-4 text-center border w-1/3">전문가 컨설팅</th>
                    <th className="py-3 px-4 text-center border w-1/3">셀프 진행</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-3 px-4 border font-medium">승인율</td>
                    <td className="py-3 px-4 text-center border text-emerald-600 font-semibold">85% 이상</td>
                    <td className="py-3 px-4 text-center border text-amber-600">30~40%</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 border font-medium">소요 시간</td>
                    <td className="py-3 px-4 text-center border text-emerald-600 font-semibold">2~3주</td>
                    <td className="py-3 px-4 text-center border text-amber-600">2~3개월</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 border font-medium">부결 시 리스크</td>
                    <td className="py-3 px-4 text-center border text-emerald-600 font-semibold">사전 검토로 최소화</td>
                    <td className="py-3 px-4 text-center border text-red-600 font-semibold">6개월 재신청 금지</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 border font-medium">최적 상품 매칭</td>
                    <td className="py-3 px-4 text-center border text-emerald-600 font-semibold">맞춤형 추천</td>
                    <td className="py-3 px-4 text-center border text-amber-600">직접 탐색 필요</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 border font-medium">서류 준비</td>
                    <td className="py-3 px-4 text-center border text-emerald-600 font-semibold">대행 지원</td>
                    <td className="py-3 px-4 text-center border text-amber-600">직접 준비</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-red-700 mb-2">주의사항</h4>
              <p className="text-sm text-red-600">
                정책자금 신청 후 <strong>부결 시 동일 기관에 6개월간 재신청이 불가</strong>합니다.
                충분한 사전 검토 없이 진행할 경우, 자금 조달 기회를 장기간 상실할 수 있습니다.
              </p>
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6 text-center max-w-md">
                <p className="text-lg font-semibold mb-2">본 분석 결과는</p>
                <p className="text-2xl font-bold mb-4">{validUntil}까지 유효합니다</p>
                <div className="border-t border-white/30 pt-4 mt-4">
                  <p className="text-sm opacity-90">경영지원그룹 이음</p>
                  <p className="text-sm opacity-90">담당: {customer.manager_name || '담당자'}</p>
                </div>
              </div>
            </div>

            <div className="mt-auto flex justify-between items-end">
              <img src={logoSero} alt="로고" className="h-12" />
              <p className="text-xs text-slate-400">페이지 5/5</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0 bg-slate-100">
        <DialogHeader className="p-4 border-b bg-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              정책자금 조달 보고서 미리보기
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
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
                    PDF로 저장
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-report"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            <div 
              ref={reportRef}
              className="bg-white shadow-lg rounded-lg overflow-hidden"
              style={{ width: '595px', height: '842px' }}
            >
              {renderPage()}
            </div>
          </div>

          <div className="flex-shrink-0 p-4 border-t bg-white flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || isGeneratingPDF}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  disabled={isGeneratingPDF}
                  className="w-8 h-8 p-0"
                  data-testid={`button-page-${page}`}
                >
                  {page}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages || isGeneratingPDF}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
