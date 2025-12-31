import { ArrowDownCircle, TrendingUp, Building2, Target, Sparkles } from "lucide-react";

interface SolutionPageProps {
  diagnosisResult: string;
  currentRate: string;
  improvedRate: string;
  rateDiff: string;
  currentInterest: string;
  improvedInterest: string;
  interestSavings: string;
  executionPlan: { institution: string; amount: string }[];
  totalExpectedAmount: string;
  recommendation1: string;
  recommendation2: string;
  recommendation3: string;
}

export function SolutionPage({
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
}: SolutionPageProps) {
  return (
    <div className="h-[297mm] bg-white p-[25mm] flex flex-col print:break-after-page relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#C9A962]/10 via-[#C9A962]/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-[#0A3D4C]/5 via-[#0A3D4C]/3 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/3"></div>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-8 flex-shrink-0">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-14 w-1.5 bg-gradient-to-b from-[#C9A962] to-[#D4B97A] shadow-lg shadow-[#C9A962]/30"></div>
              <h1 className="text-4xl font-serif text-[#0A3D4C] tracking-tight">맞춤형 솔루션</h1>
            </div>
            <p className="text-[#0A3D4C]/60 text-sm ml-6 tracking-wide font-medium">Customized Funding Solution</p>
          </div>
          <div className="text-right space-y-1 bg-[#0A3D4C]/5 px-5 py-4 rounded-sm border-l-2 border-[#C9A962]">
            <div className="text-xs text-[#0A3D4C]/60 uppercase tracking-widest font-semibold">Page</div>
            <div className="text-3xl font-bold text-[#0A3D4C]">05</div>
            <div className="text-xs text-[#0A3D4C]/40 font-medium">/08</div>
          </div>
        </div>

        <div className="mb-6 relative overflow-hidden flex-shrink-0">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#C9A962]/8 rounded-full translate-x-1/4 -translate-y-1/4"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#0A3D4C]/5 rounded-full -translate-x-1/4 translate-y-1/4"></div>
          <div className="relative bg-gradient-to-br from-[#0A3D4C] via-[#0A4D5C] to-[#0A3D4C] text-white p-6 shadow-2xl shadow-[#0A3D4C]/20 border-l-4 border-[#C9A962]">
            <div className="flex items-start gap-3 mb-2">
              <div className="p-1.5 bg-[#C9A962]/20 rounded-sm">
                <Target className="w-5 h-5 text-[#C9A962] flex-shrink-0" strokeWidth={2} />
              </div>
              <h2 className="text-lg font-bold tracking-tight">진단 결과</h2>
            </div>
            <p className="text-base leading-relaxed text-white/95 ml-11">{diagnosisResult}</p>
          </div>
        </div>

        <div className="mb-5 flex-shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1 bg-[#C9A962]/15 rounded-sm">
              <ArrowDownCircle className="w-4 h-4 text-[#C9A962]" strokeWidth={2.5} />
            </div>
            <h2 className="text-lg font-bold text-[#0A3D4C] tracking-tight">이자 비용 절감 시뮬레이션</h2>
            <Sparkles className="w-3 h-3 text-[#C9A962]" strokeWidth={2} />
          </div>
          <div className="border-2 border-[#0A3D4C] overflow-hidden shadow-xl shadow-[#0A3D4C]/10">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-[#0A3D4C] via-[#0A4D5C] to-[#0A3D4C] text-white">
                  <th className="py-3 px-5 text-left font-bold tracking-tight text-sm">구분</th>
                  <th className="py-3 px-5 text-right font-bold tracking-tight text-sm">현재</th>
                  <th className="py-3 px-5 text-right font-bold tracking-tight text-sm">구조개선 후</th>
                  <th className="py-3 px-5 text-right font-bold tracking-tight text-sm">절감액</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                <tr className="border-b-2 border-[#0A3D4C]/20">
                  <td className="py-3 px-5 text-[#0A3D4C]/70 font-medium text-xs">예상 평균 금리</td>
                  <td className="py-3 px-5 text-right text-[#0A3D4C] font-bold text-base">{currentRate}%</td>
                  <td className="py-3 px-5 text-right text-[#C9A962] font-bold text-base">{improvedRate}%</td>
                  <td className="py-3 px-5 text-right text-green-600 font-bold text-base">-{rateDiff}%p</td>
                </tr>
                <tr className="bg-[#0A3D4C]/[0.03]">
                  <td className="py-3 px-5 text-[#0A3D4C]/70 font-medium text-xs">연간 이자 비용</td>
                  <td className="py-3 px-5 text-right text-[#0A3D4C] font-bold text-base">{currentInterest}</td>
                  <td className="py-3 px-5 text-right text-[#C9A962] font-bold text-base">{improvedInterest}</td>
                  <td className="py-3 px-5 text-right text-green-600 font-bold text-lg">{interestSavings}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-5 flex-shrink-0 min-h-0">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1 bg-[#C9A962]/15 rounded-sm">
              <Building2 className="w-4 h-4 text-[#C9A962]" strokeWidth={2.5} />
            </div>
            <h2 className="text-lg font-bold text-[#0A3D4C] tracking-tight">예상 집행 기관 및 금액</h2>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-2 mb-3 pr-2">
            {executionPlan.map((item, index) => (
              <div key={index} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D4C]/10 to-[#0A3D4C]/5 translate-x-1 translate-y-1 rounded-sm"></div>
                <div className="relative flex items-center justify-between py-2.5 px-4 bg-white border-2 border-[#0A3D4C]/20 transition-all group-hover:shadow-lg group-hover:border-[#C9A962]/50 group-hover:-translate-y-0.5 rounded-sm">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#0A3D4C] to-[#0A4D5C] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#0A3D4C]/20 flex-shrink-0">
                      {index + 1}
                    </div>
                    <span className="text-[#0A3D4C] font-bold text-sm tracking-tight truncate">
                      {item.institution}
                    </span>
                  </div>
                  <span className="text-[#C9A962] font-bold text-base tracking-tight ml-4 flex-shrink-0">
                    {item.amount}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-gradient-to-r from-[#C9A962] via-[#D4B97A] to-[#C9A962] text-white py-4 px-5 shadow-xl shadow-[#C9A962]/30 border-l-4 border-[#0A3D4C]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-base tracking-tight">총 조달 예상액</span>
              <span className="font-bold text-2xl tracking-tight">{totalExpectedAmount}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3 flex-shrink-0">
            <div className="p-1 bg-[#C9A962]/15 rounded-sm">
              <TrendingUp className="w-4 h-4 text-[#C9A962]" strokeWidth={2.5} />
            </div>
            <h2 className="text-lg font-bold text-[#0A3D4C] tracking-tight">권장 조치사항</h2>
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto pr-2">
            <div className="flex items-start gap-3 py-2.5 px-3 border-l-4 border-[#C9A962] bg-gradient-to-r from-[#0A3D4C]/[0.05] to-transparent shadow-sm">
              <span className="text-[#C9A962] font-bold text-base flex-shrink-0">01</span>
              <p className="text-[#0A3D4C]/70 leading-relaxed text-xs">{recommendation1}</p>
            </div>
            <div className="flex items-start gap-3 py-2.5 px-3 border-l-4 border-[#C9A962] bg-gradient-to-r from-[#0A3D4C]/[0.05] to-transparent shadow-sm">
              <span className="text-[#C9A962] font-bold text-base flex-shrink-0">02</span>
              <p className="text-[#0A3D4C]/70 leading-relaxed text-xs">{recommendation2}</p>
            </div>
            <div className="flex items-start gap-3 py-2.5 px-3 border-l-4 border-[#C9A962] bg-gradient-to-r from-[#0A3D4C]/[0.05] to-transparent shadow-sm">
              <span className="text-[#C9A962] font-bold text-base flex-shrink-0">03</span>
              <p className="text-[#0A3D4C]/70 leading-relaxed text-xs">{recommendation3}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 text-right text-xs text-[#0A3D4C]/40 tracking-wide font-medium flex-shrink-0">
          Management Support Group Yieum
        </div>
      </div>
    </div>
  );
}
