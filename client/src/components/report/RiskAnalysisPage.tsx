import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts"
import { AlertTriangle, CheckCircle, Shield } from "lucide-react"
import logoGaro from "@assets/logo_garo_white-removebg-preview_1768113664738.png"

interface DebtDistribution {
  name: string;
  value: number;
  percentage: number;
}

interface RiskAnalysisPageProps {
  totalDebt: string;
  loanBalance: string;
  guaranteeBalance: string;
  debtDistribution: DebtDistribution[];
  creditScore: number;
  creditGrade: string;
  creditScorePercentage: number;
  creditComment: string;
  dti2024: number;
  dti2024Status: string;
  dti3Year: number;
  dti3YearStatus: string;
  dtiInterpretation: string;
  reportDate: string;
}

const COLORS = ["#0d5259", "#14b8a6", "#22d3ee"]

export function RiskAnalysisPage({
  totalDebt,
  loanBalance,
  guaranteeBalance,
  debtDistribution,
  creditScore,
  creditGrade,
  creditScorePercentage,
  creditComment,
  dti2024,
  dti2024Status,
  dti3Year,
  dti3YearStatus,
  dtiInterpretation,
  reportDate
}: RiskAnalysisPageProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "안전":
        return <CheckCircle className="w-5 h-5 text-green-600" strokeWidth={2} />
      case "주의":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" strokeWidth={2} />
      case "위험":
        return <AlertTriangle className="w-5 h-5 text-red-600" strokeWidth={2} />
      default:
        return null
    }
  }

  return (
    <div className="w-[210mm] h-[297mm] !bg-white !text-black shadow-lg p-[25mm] flex flex-col page-break">
      <div className="border-b-2 border-cyan-500 pb-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-900">리스크 분석</h1>
          <p className="text-sm text-[#4A5568] mt-1">Risk Analysis</p>
        </div>
        <img 
          src={logoGaro} 
          alt="경영지원그룹 이음" 
          className="h-10 w-auto object-contain flex-shrink-0"
        />
      </div>
      <div className="mb-6 flex-shrink-0">
        <h2 className="text-base font-bold text-teal-900 mb-3 flex items-center gap-2">
          <div className="w-1 h-5 bg-cyan-500 rounded-full"></div>
          부채 현황
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-teal-900/5 to-teal-900/10 rounded-lg p-4 border border-teal-900/20">
            <p className="text-xs text-[#4A5568] mb-1">총 부채액</p>
            <p className="text-xl font-bold text-teal-900">{totalDebt}</p>
          </div>
          <div className="bg-gradient-to-br from-cyan-500/5 to-cyan-500/10 rounded-lg p-4 border border-cyan-500/20">
            <p className="text-xs text-[#4A5568] mb-1">대출 잔액</p>
            <p className="text-xl font-bold text-teal-900">{loanBalance}</p>
          </div>
          <div className="bg-gradient-to-br from-teal-500/5 to-teal-500/10 rounded-lg p-4 border border-teal-500/20">
            <p className="text-xs text-[#4A5568] mb-1">보증 잔액</p>
            <p className="text-xl font-bold text-teal-900">{guaranteeBalance}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 mb-6 flex-shrink-0">
        <div>
          <h3 className="text-base font-bold text-teal-900 mb-3 flex items-center gap-2">
            <div className="w-1 h-5 bg-cyan-500 rounded-full"></div>
            금융권별 분포
          </h3>
          <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-4 border border-gray-200 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={debtDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {debtDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={30}
                  formatter={(value, entry: any) => (
                    <span className="text-xs text-[#2D3748] font-medium">
                      {value}: {entry.payload.percentage}%
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h3 className="text-base font-bold text-teal-900 mb-3 flex items-center gap-2">
            <div className="w-1 h-5 bg-cyan-500 rounded-full"></div>
            신용점수
          </h3>
          <div className="bg-gradient-to-br from-cyan-500/5 to-cyan-500/10 rounded-lg p-6 border border-cyan-500/30 h-[240px] flex flex-col justify-center">
            <div className="text-center space-y-3">
              <div>
                <div className="text-5xl font-bold text-teal-900">{creditScore}</div>
                <div className="text-cyan-600 font-bold text-lg mt-1">{creditGrade}</div>
              </div>
              <div className="space-y-2">
                <div className="w-full bg-gray-200 h-1.5 rounded-full">
                  <div
                    className="bg-gradient-to-r from-teal-900 to-cyan-500 h-1.5 rounded-full"
                    style={{ width: `${creditScorePercentage}%` }}
                  ></div>
                </div>
                <p className="text-xs text-[#2D3748]">{creditComment}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-cyan-600" />
          <h2 className="text-base font-bold text-teal-900">DTI(부채비율) 분석</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-teal-900 font-bold text-sm">2024년 매출 기준 DTI</h3>
              <div className="flex items-center gap-1">
                {getStatusIcon(dti2024Status)}
                <span className="font-bold text-xs">{dti2024Status}</span>
              </div>
            </div>
            <div className="text-4xl font-bold text-teal-900 mb-2">{dti2024}%</div>
            <p className="text-[10px] text-[#4A5568]">(총부채 / 직전년도 매출) x 100</p>
          </div>

          <div className="bg-gradient-to-br from-white to-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-teal-900 font-bold text-sm">3년 평균 매출 기준 DTI</h3>
              <div className="flex items-center gap-1">
                {getStatusIcon(dti3YearStatus)}
                <span className="font-bold text-xs">{dti3YearStatus}</span>
              </div>
            </div>
            <div className="text-4xl font-bold text-teal-900 mb-2">{dti3Year}%</div>
            <p className="text-[10px] text-[#4A5568]">(총부채 / 3년 평균 매출) x 100</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-teal-900 to-teal-700 text-white rounded-lg p-4">
          <p className="text-sm leading-relaxed">
            <span className="font-bold text-cyan-300">DTI 해석:</span> DTI 30% 이하는 안전, 30~50%는 주의, 50% 초과는
            위험 구간입니다. 현재 귀사의 DTI는 <span className="text-cyan-300 font-bold">{dtiInterpretation}</span>{" "}
            수준으로 판단됩니다.
          </p>
        </div>
      </div>
      <div className="mt-auto pt-4 border-t border-gray-200 flex justify-between items-center text-xs text-[#4A5568]">
        <span>{reportDate}</span>
        <span className="font-semibold">Page 3 of 6</span>
      </div>
    </div>
  );
}
