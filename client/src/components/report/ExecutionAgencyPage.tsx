import { Building2, DollarSign, Calendar, Percent, CreditCard } from "lucide-react"
import logoGaro from "@assets/logo_garo_white-removebg-preview_1768113664738.png"

interface Agency {
  name: string;
  limit: string;
  rate: string;
  period: string;
  monthlyPayment: string;
}

interface ExecutionAgencyPageProps {
  totalExpectedFunding: string;
  fundingPeriod: string;
  agencies: Agency[];
  reportDate: string;
}

const agencyColors = [
  "from-teal-900 to-teal-700",
  "from-cyan-600 to-cyan-500",
  "from-teal-500 to-teal-400"
]

export function ExecutionAgencyPage({
  totalExpectedFunding,
  fundingPeriod,
  agencies,
  reportDate
}: ExecutionAgencyPageProps) {
  return (
    <div className="w-[210mm] h-[297mm] !bg-white !text-black shadow-lg p-[25mm] flex flex-col page-break">
      <div className="border-b-2 border-cyan-500 pb-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-900">예상 집행 기관 및 금액</h1>
          <p className="text-sm text-[#4A5568] mt-1">Execution Agencies & Funding</p>
        </div>
        <img 
          src={logoGaro} 
          alt="경영지원그룹 이음" 
          className="h-10 w-auto object-contain flex-shrink-0"
        />
      </div>
      <div className="mb-6 bg-gradient-to-br from-teal-900 to-teal-700 rounded-lg p-6 text-white shadow-lg">
        <p className="text-sm opacity-80 mb-2">총 조달 예상 금액</p>
        <p className="text-4xl font-bold mb-1">{totalExpectedFunding}</p>
        <p className="text-xs opacity-70">{fundingPeriod}</p>
      </div>
      <div className="flex-1 flex flex-col">
        <h3 className="text-lg font-bold text-teal-900 mb-4 flex items-center gap-2">
          <div className="w-1 h-6 bg-cyan-500 rounded-full"></div>
          세부 집행 계획
        </h3>

        <div className="space-y-4">
          {agencies.map((agency, index) => (
            <div key={index} className="bg-gradient-to-br from-white to-gray-50 rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className={`bg-gradient-to-r ${agencyColors[index % agencyColors.length]} px-4 py-3 flex items-center gap-3`}>
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <h4 className="font-bold text-white text-base">{agency.name}</h4>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <DollarSign className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-[#4A5568] mb-0.5">한도</p>
                    <p className="font-bold text-teal-900">{agency.limit}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Percent className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-[#4A5568] mb-0.5">금리</p>
                    <p className="font-bold text-teal-900">{agency.rate}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-[#4A5568] mb-0.5">약정기간</p>
                    <p className="font-bold text-teal-900">{agency.period}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-[#4A5568] mb-0.5">예상 월 납입금</p>
                    <p className="font-bold text-cyan-600">{agency.monthlyPayment}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto pt-4 border-t border-gray-200 flex justify-between items-center text-xs text-[#4A5568]">
        <span>{reportDate}</span>
        <span className="font-semibold">Page 4 of 6</span>
      </div>
    </div>
  );
}
