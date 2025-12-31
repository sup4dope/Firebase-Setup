import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts"
import { TrendingUp, Info } from "lucide-react"

interface DiagnosticsPageProps {
  companyName: string;
  ceoName: string;
  businessNumber: string;
  openingDate: string;
  industry: string;
  businessAge: string;
  address: string;
  sales2022: number;
  sales2023: number;
  sales2024: number;
  sales2025?: number;
  growthRate: number;
}

export function DiagnosticsPage({
  companyName,
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
  growthRate
}: DiagnosticsPageProps) {
  const salesData = [
    { year: "2022년", value: sales2022 },
    { year: "2023년", value: sales2023 },
    { year: "2024년", value: sales2024 },
    ...(sales2025 ? [{ year: "2025년(최근)", value: sales2025 }] : [])
  ]

  return (
    <div className="h-[297mm] bg-white p-[25mm] flex flex-col print:break-after-page relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-[#1a365d]/5 via-[#1a365d]/3 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-[#d4a574]/8 via-[#d4a574]/4 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/3"></div>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-12">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-14 w-1.5 bg-gradient-to-b from-[#d4a574] to-[#c4956a] shadow-lg"></div>
              <h1 className="text-4xl font-serif text-[#1a365d] tracking-tight">정밀 기업 진단</h1>
            </div>
            <p className="text-[#1a365d]/60 text-sm ml-6 tracking-wide font-medium">
              Comprehensive Business Diagnostics
            </p>
          </div>
          <div className="text-right space-y-1 bg-[#1a365d]/5 px-5 py-4 rounded-sm border-l-2 border-[#d4a574]">
            <div className="text-xs text-[#1a365d]/60 uppercase tracking-widest font-semibold">Page</div>
            <div className="text-3xl font-bold text-[#1a365d]">02</div>
            <div className="text-xs text-[#1a365d]/40 font-medium">/07</div>
          </div>
        </div>

        <div className="mb-12 flex-shrink-0">
          <div className="flex items-center gap-3 mb-6">
            <Info className="w-5 h-5 text-[#d4a574]" strokeWidth={2} />
            <h2 className="text-xl font-bold text-[#1a365d] tracking-tight">기본 정보</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-4 bg-[#1a365d]/[0.02] p-6 rounded-sm border border-[#1a365d]/10 shadow-sm">
            <div className="flex items-baseline justify-between border-b border-[#1a365d]/10 pb-3">
              <span className="text-[#1a365d]/60 text-sm tracking-wide font-medium">상호명</span>
              <span className="text-[#1a365d] font-semibold text-base">{companyName}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-[#1a365d]/10 pb-3">
              <span className="text-[#1a365d]/60 text-sm tracking-wide font-medium">대표자</span>
              <span className="text-[#1a365d] font-semibold text-base">{ceoName}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-[#1a365d]/10 pb-3">
              <span className="text-[#1a365d]/60 text-sm tracking-wide font-medium">사업자번호</span>
              <span className="text-[#1a365d] font-semibold text-base">{businessNumber}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-[#1a365d]/10 pb-3">
              <span className="text-[#1a365d]/60 text-sm tracking-wide font-medium">개업일</span>
              <span className="text-[#1a365d] font-semibold text-base">{openingDate}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-[#1a365d]/10 pb-3">
              <span className="text-[#1a365d]/60 text-sm tracking-wide font-medium">업종</span>
              <span className="text-[#1a365d] font-semibold text-base">{industry}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-[#1a365d]/10 pb-3">
              <span className="text-[#1a365d]/60 text-sm tracking-wide font-medium">업력</span>
              <span className="text-[#1a365d] font-semibold text-base">{businessAge}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-[#1a365d]/10 pb-3 col-span-2">
              <span className="text-[#1a365d]/60 text-sm tracking-wide font-medium">사업장 주소</span>
              <span className="text-[#1a365d] font-semibold text-base truncate ml-4">{address}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[#1a365d] tracking-tight">최근 3개년 매출 추이</h2>
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#1a365d]/[0.08] to-[#1a365d]/[0.04] rounded-sm border-l-2 border-[#d4a574]">
              <TrendingUp className="w-4 h-4 text-[#d4a574]" strokeWidth={2} />
              <span className="text-sm text-[#1a365d]/80 font-semibold">Growth Analysis</span>
            </div>
          </div>

          <div className="h-64 mb-6 border-2 border-[#1a365d]/20 p-5 bg-white shadow-lg flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData} barSize={50}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EB" vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#1a365d", fontSize: 12, fontWeight: 500 }}
                  axisLine={{ stroke: "#1a365d", strokeWidth: 1.5 }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#1a365d", fontSize: 12, fontWeight: 500 }}
                  axisLine={{ stroke: "#1a365d", strokeWidth: 1.5 }}
                  tickLine={false}
                  label={{
                    value: "매출액 (억원)",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#1a365d",
                    style: { fontSize: 12, fontWeight: 600 },
                  }}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {salesData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index === salesData.length - 1 ? "#d4a574" : "#1a365d"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="relative bg-gradient-to-br from-[#1a365d] via-[#1a365d]/95 to-[#1a365d] text-white py-6 px-7 overflow-hidden shadow-2xl border-l-4 border-[#d4a574]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#d4a574]/10 rounded-full translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#d4a574]/5 rounded-full -translate-x-1/2 translate-y-1/2"></div>
            <div className="relative flex items-start gap-4">
              <div className="w-1 h-14 bg-gradient-to-b from-[#d4a574] to-[#c4956a] flex-shrink-0 shadow-lg"></div>
              <div className="space-y-2">
                <p className="text-[#d4a574] text-xs font-semibold tracking-widest uppercase">Growth Insight</p>
                <p className="text-white/95 leading-relaxed text-base">
                  최근 3년 평균 <span className="text-[#d4a574] font-bold text-2xl">{growthRate}%</span>의
                  견고한 성장세를 유지하고 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-right text-xs text-[#1a365d]/40 tracking-wide font-medium">
          Management Support Group Yieum
        </div>
      </div>
    </div>
  )
}
