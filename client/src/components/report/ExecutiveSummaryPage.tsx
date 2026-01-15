import { Building2, TrendingUp, AlertTriangleIcon, CircleDollarSignIcon } from "lucide-react"
import logoGaro from "@assets/logo_garo_white-removebg-preview_1768113664738.png"

interface ExecutiveSummaryPageProps {
  businessName: string;
  ceoName: string;
  industry: string;
  establishedDate: string;
  creditScore: number;
  requiredFunding: string;
  riskLevel: string;
  keyFinding1: string;
  keyFinding2: string;
  keyFinding3: string;
  reportDate: string;
}

export function ExecutiveSummaryPage({
  businessName,
  ceoName,
  industry,
  establishedDate,
  creditScore,
  requiredFunding,
  riskLevel,
  keyFinding1,
  keyFinding2,
  keyFinding3,
  reportDate
}: ExecutiveSummaryPageProps) {
  return (
    <div className="w-[210mm] h-[297mm] !bg-white !text-black shadow-lg p-[25mm] flex flex-col page-break">
      <div className="border-b-2 border-cyan-500 pb-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-900">기업 진단 요약</h1>
          <p className="text-sm text-[#4A5568] mt-1">Executive Summary</p>
        </div>
        <img 
          src={logoGaro} 
          alt="경영지원그룹 이음" 
          className="h-10 w-auto object-contain flex-shrink-0"
        />
      </div>

      <div className="mb-8 bg-gradient-to-br from-teal-900/5 to-cyan-500/5 rounded-lg p-6 border border-cyan-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-900 to-teal-700 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-teal-900">기업 개요</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[#4A5568] mb-1">기업명</p>
            <p className="font-semibold text-teal-900">{businessName}</p>
          </div>
          <div>
            <p className="text-xs text-[#4A5568] mb-1">대표자</p>
            <p className="font-semibold text-teal-900">{ceoName}</p>
          </div>
          <div>
            <p className="text-xs text-[#4A5568] mb-1">업종</p>
            <p className="font-semibold text-teal-900">{industry}</p>
          </div>
          <div>
            <p className="text-xs text-[#4A5568] mb-1">설립일</p>
            <p className="font-semibold text-teal-900">{establishedDate}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-teal-900 to-teal-700 rounded-lg p-5 text-white shadow-lg">
          <TrendingUp className="w-8 h-8 mb-3 opacity-80" />
          <p className="text-xs opacity-80 mb-1">신용점수</p>
          <p className="text-2xl font-bold">{creditScore}</p>
        </div>

        <div className="bg-gradient-to-br from-cyan-600 to-cyan-500 rounded-lg p-5 text-white shadow-lg">
          <CircleDollarSignIcon className="w-8 h-8 mb-3 opacity-80" />
          <p className="text-xs opacity-80 mb-1">필요 자금</p>
          <p className="text-2xl font-bold">{requiredFunding}</p>
        </div>

        <div className="bg-gradient-to-br from-[#E63946] to-[#D62828] rounded-lg p-5 text-white shadow-lg">
          <AlertTriangleIcon className="w-8 h-8 mb-3 opacity-80" />
          <p className="text-xs opacity-80 mb-1">리스크 레벨</p>
          <p className="text-2xl font-bold">{riskLevel}</p>
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-lg font-bold text-teal-900 mb-4 flex items-center gap-2">
          <div className="w-1 h-6 bg-cyan-500 rounded-full"></div>
          주요 발견사항
        </h3>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-cyan-600">1</span>
            </div>
            <p className="text-sm text-[#2D3748] leading-relaxed">{keyFinding1}</p>
          </div>

          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-cyan-600">2</span>
            </div>
            <p className="text-sm text-[#2D3748] leading-relaxed">{keyFinding2}</p>
          </div>

          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-cyan-600">3</span>
            </div>
            <p className="text-sm text-[#2D3748] leading-relaxed">{keyFinding3}</p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-gray-200 flex justify-between items-center text-xs text-[#4A5568]">
        <span>{reportDate}</span>
        <span className="font-semibold">Page 2 of 6</span>
      </div>
    </div>
  )
}
