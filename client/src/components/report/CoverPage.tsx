import { Shield } from "lucide-react"
import logoSquare from "@assets/logo_square_white-removebg-preview_1768113664737.png"

interface CoverPageProps {
  businessName: string;
  reportDate: string;
  logo?: string;
}

export function CoverPage({ businessName, reportDate, logo = "경영지원그룹 이음" }: CoverPageProps) {
  return (
    <div className="relative h-[297mm] !bg-white !text-black print:break-after-page overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-800/[0.02] rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-600/[0.03] rounded-full translate-y-1/2 -translate-x-1/2"></div>
      
      <div className="relative h-full p-[25mm] flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="font-medium text-teal-600 tracking-widest uppercase text-base">경영지원자문 제안서 (정책자금)</div>
            <div className="text-teal-500 text-base">{reportDate}</div>
          </div>
          <img 
            src={logoSquare} 
            alt="경영지원그룹 이음" 
            className="w-24 h-24 object-contain"
          />
        </div>

        <div className="flex-1 flex flex-col justify-center space-y-16">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-7xl font-serif text-teal-900 leading-[1.1] tracking-tight">{businessName}</h1>
              <div className="h-1 w-24 bg-cyan-600"></div>
            </div>

            <h2 className="text-4xl text-teal-700 leading-relaxed font-light tracking-tight">
              정책자금 조달 가능성 분석 및<br />
              전략 보고서
            </h2>
          </div>

          <div className="inline-block max-w-2xl">
            <div className="relative border border-cyan-600/30 bg-gradient-to-br from-cyan-600/[0.02] to-cyan-600/[0.08] p-10 backdrop-blur-sm">
              <div className="absolute top-4 left-4 w-3 h-3 border-t border-l border-cyan-600"></div>
              <div className="absolute top-4 right-4 w-3 h-3 border-t border-r border-cyan-600"></div>
              <div className="absolute bottom-4 left-4 w-3 h-3 border-b border-l border-cyan-600"></div>
              <div className="absolute bottom-4 right-4 w-3 h-3 border-b border-r border-cyan-600"></div>

              <div className="flex items-start gap-6">
                <Shield className="w-12 h-12 text-cyan-600 flex-shrink-0" strokeWidth={1.5} />
                <div className="space-y-3">
                  <p className="text-2xl font-bold text-teal-900 tracking-tight">조달 실패시 환불 보증</p>
                  <p className="text-teal-600 text-base leading-relaxed">정책자금 조달 실패 시 자문료 100% 환불</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-end text-xs text-teal-500">
          <div className="space-y-1">
            <p className="text-teal-700 font-medium">Management Support Group</p>
            <p>Yieum</p>
          </div>
          <div className="text-right space-y-1">
            <p className="uppercase tracking-wider">Confidential Report</p>
            <p>Page 1 of 7</p>
          </div>
        </div>
      </div>
    </div>
  )
}
