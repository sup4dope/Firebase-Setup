import { Calendar, CheckCircle2 } from "lucide-react"
import logoGaro from "@assets/logo_garo_white-removebg-preview_1768113664738.png"

interface TimelinePageProps {
  reportDate: string;
}

export function TimelinePage({ reportDate }: TimelinePageProps) {
  return (
    <div className="w-[210mm] h-[297mm] !bg-white !text-black shadow-lg p-[25mm] flex flex-col page-break">
      <div className="border-b-2 border-cyan-500 pb-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-900">실행 계획 및 타임라인</h1>
          <p className="text-sm text-[#4A5568] mt-1">Action Plan & Timeline</p>
        </div>
        <img 
          src={logoGaro} 
          alt="경영지원그룹 이음" 
          className="h-10 w-auto object-contain flex-shrink-0"
        />
      </div>
      <div className="mb-6 bg-gradient-to-br from-teal-900/5 to-cyan-500/5 rounded-lg p-5 border border-cyan-500/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-cyan-500 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-teal-900">예상 소요 기간</h2>
            <p className="text-sm text-[#4A5568] font-semibold">4주~7주</p>
          </div>
        </div>
        <p className="text-sm text-[#2D3748] leading-relaxed">진행 기관과 진행 자금의 종류에따라 달라질 수 있습니다.</p>
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-bold text-teal-900 mb-5 flex items-center gap-2">
          <div className="w-1 h-6 bg-cyan-500 rounded-full"></div>
          진행 과정
        </h3>

        <div className="space-y-4 relative">
          <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gradient-to-b from-cyan-500 to-teal-900"></div>

          <div className="relative flex gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-900 to-teal-700 flex items-center justify-center flex-shrink-0 z-10 shadow-lg">
              <span className="text-white font-bold text-sm">1</span>
            </div>
            <div className="flex-1 bg-gradient-to-r from-white to-cyan-500/5 rounded-lg p-4 border-l-4 border-teal-900 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-bold text-teal-900 text-sm">상담 및 기업 진단</h4>
                <span className="bg-cyan-500/20 text-cyan-700 px-2 py-1 rounded text-xs font-semibold">1~2일</span>
              </div>
              <p className="text-xs text-[#2D3748] leading-relaxed mb-2">
                기업의 재무 상황과 자금 필요성을 면밀히 파악하고, 최적의 정책자금 매칭을 위한 초기 진단을 수행합니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">재무현황 분석</span>
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">자금용도 확인</span>
              </div>
            </div>
          </div>

          <div className="relative flex gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-cyan-500 flex items-center justify-center flex-shrink-0 z-10 shadow-lg">
              <span className="text-white font-bold text-sm">2</span>
            </div>
            <div className="flex-1 bg-gradient-to-r from-white to-cyan-500/5 rounded-lg p-4 border-l-4 border-cyan-600 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-bold text-teal-900 text-sm">서류 취합 및 검토</h4>
                <span className="bg-cyan-500/20 text-cyan-700 px-2 py-1 rounded text-xs font-semibold">3~5일</span>
              </div>
              <p className="text-xs text-[#2D3748] leading-relaxed mb-2">
                신청에 필요한 모든 서류를 체계적으로 수집하고, 심사 통과율을 높이기 위한 서류 보완 작업을 진행합니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">재무제표 준비</span>
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">사업계획서 작성</span>
              </div>
            </div>
          </div>

          <div className="relative flex gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center flex-shrink-0 z-10 shadow-lg">
              <span className="text-white font-bold text-sm">3</span>
            </div>
            <div className="flex-1 bg-gradient-to-r from-white to-teal-500/5 rounded-lg p-4 border-l-4 border-teal-500 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-bold text-teal-900 text-sm">신청 및 심사</h4>
                <span className="bg-cyan-500/20 text-cyan-700 px-2 py-1 rounded text-xs font-semibold">7~14일</span>
              </div>
              <p className="text-xs text-[#2D3748] leading-relaxed mb-2">
                각 금융기관 및 공공기관에 정책자금을 신청하고, 심사 과정에서 필요한 추가 자료 대응 및 컨설팅을
                제공합니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">기관별 신청</span>
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">심사 대응</span>
              </div>
            </div>
          </div>

          <div className="relative flex gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center flex-shrink-0 z-10 shadow-lg">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 bg-gradient-to-r from-white to-[#10B981]/5 rounded-lg p-4 border-l-4 border-[#10B981] shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-bold text-teal-900 text-sm">승인 및 자금 집행</h4>
                <span className="bg-cyan-500/20 text-cyan-700 px-2 py-1 rounded text-xs font-semibold">3~7일</span>
              </div>
              <p className="text-xs text-[#2D3748] leading-relaxed mb-2">
                심사 승인 후 약정 체결 및 최종 서류 처리를 완료하고, 기업 계좌로 정책자금이 실제 입금되는 단계입니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">약정 체결</span>
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">자금 입금</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-auto pt-4 border-t border-gray-200 flex justify-between items-center text-xs text-[#4A5568]">
        <span>{reportDate}</span>
        <span className="font-semibold">Page 5 of 6</span>
      </div>
    </div>
  );
}
