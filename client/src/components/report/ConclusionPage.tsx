import { CheckCircle2, XCircle, Clock, FileText, AlertTriangle, Shield, Mail, Phone, User } from "lucide-react"
import logoGaro from "@assets/logo_garo_white-removebg-preview_1768113664738.png"

interface ConclusionPageProps {
  reportDate: string;
  validUntil: string;
  consultantName: string;
  consultantPhone: string;
  consultantEmail: string;
  logo?: string;
}

export function ConclusionPage({
  reportDate,
  validUntil,
  consultantName,
  consultantPhone,
  consultantEmail,
  logo = "경영지원그룹 이음"
}: ConclusionPageProps) {
  const comparisonData = [
    {
      aspect: "승인율",
      expert: "85% 이상",
      expertIcon: <CheckCircle2 className="w-5 h-5 text-green-600" strokeWidth={2} />,
      self: "30~40%",
      selfIcon: <XCircle className="w-5 h-5 text-red-600" strokeWidth={2} />,
    },
    {
      aspect: "소요 시간",
      expert: "2~3주",
      expertIcon: <Clock className="w-5 h-5 text-green-600" strokeWidth={2} />,
      self: "1~2개월",
      selfIcon: <Clock className="w-5 h-5 text-yellow-600" strokeWidth={2} />,
    },
    {
      aspect: "서류 준비",
      expert: "전문가 대행",
      expertIcon: <CheckCircle2 className="w-5 h-5 text-green-600" strokeWidth={2} />,
      self: "본인 직접 준비",
      selfIcon: <FileText className="w-5 h-5 text-yellow-600" strokeWidth={2} />,
    },
    {
      aspect: "심사 대응",
      expert: "전략적 대응 지원",
      expertIcon: <CheckCircle2 className="w-5 h-5 text-green-600" strokeWidth={2} />,
      self: "본인 대응",
      selfIcon: <AlertTriangle className="w-5 h-5 text-yellow-600" strokeWidth={2} />,
    },
    {
      aspect: "리스크",
      expert: "실패 시 100% 환불",
      expertIcon: <CheckCircle2 className="w-5 h-5 text-green-600" strokeWidth={2} />,
      self: "6개월 재신청 금지",
      selfIcon: <XCircle className="w-5 h-5 text-red-600" strokeWidth={2} />,
    },
  ]

  return (
    <div className="h-[297mm] !bg-white !text-black p-[25mm] flex flex-col print:break-after-page">
      <div className="flex justify-between items-start mb-10 flex-shrink-0">
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-12 w-1 bg-cyan-600"></div>
            <h1 className="text-5xl font-serif text-teal-900 tracking-tight">결론 및 제언</h1>
          </div>
          <p className="text-teal-600 text-sm ml-5 tracking-wide">Conclusion & Recommendation</p>
        </div>
        <img 
          src={logoGaro} 
          alt="경영지원그룹 이음" 
          className="h-10 w-auto object-contain flex-shrink-0"
        />
      </div>

      <div className="mb-6 flex-shrink-0">
        <h2 className="text-lg font-bold text-teal-900 mb-4 tracking-tight">전문가 컨설팅 vs 셀프 신청 비교</h2>
        <div className="border-2 border-teal-900 overflow-hidden">
          <table className="w-full table-fixed">
            <thead>
              <tr className="bg-teal-900 text-white">
                <th className="py-3 px-5 text-left font-bold tracking-tight text-sm w-[20%]">구분</th>
                <th className="py-3 px-5 text-center font-bold tracking-tight text-sm w-[40%]">
                  전문가 컨설팅
                </th>
                <th className="py-3 px-5 text-center font-bold tracking-tight text-sm w-[40%]">셀프 신청</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((row, index) => (
                <tr
                  key={index}
                  className={
                    index % 2 === 0
                      ? "bg-white border-b border-teal-200"
                      : "bg-teal-900/[0.03] border-b border-teal-200"
                  }
                >
                  <td className="py-3 px-5 text-teal-900 font-bold text-xs">{row.aspect}</td>
                  <td className="py-3 px-5">
                    <div className="flex items-center justify-center">
                      <div className="flex items-center w-full max-w-[140px]">
                        <div className="w-8 flex-shrink-0 flex justify-center">{row.expertIcon}</div>
                        <span className="text-teal-900 font-medium text-xs">{row.expert}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex items-center justify-center">
                      <div className="flex items-center w-full max-w-[140px]">
                        <div className="w-8 flex-shrink-0 flex justify-center">{row.selfIcon}</div>
                        <span className="text-teal-700 text-xs">{row.self}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-40 h-40 bg-red-600/5 rounded-full translate-x-1/2 -translate-y-1/2"></div>
        <div className="relative border-2 border-red-600 bg-red-600/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" strokeWidth={2} />
            <div className="space-y-2">
              <h3 className="text-red-600 font-bold text-base tracking-tight">셀프 신청 시 주의사항</h3>
              <p className="text-[#1a365d] leading-relaxed text-xs">
                정책자금 심사에서 부결될 경우,{" "}
                <span className="font-bold text-red-600">6개월간 동일 기관 재신청이 금지</span>
                됩니다. 이는 귀사의 자금 조달 일정에 심각한 차질을 줄 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden flex-1">
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-600/5 rounded-full -translate-x-1/2 translate-y-1/2"></div>
        <div className="relative bg-teal-900 text-white p-6 h-full flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <Shield className="w-8 h-8 text-cyan-400" strokeWidth={1.5} />
              <div className="grid grid-cols-2 gap-6 flex-1">
                <div>
                  <p className="text-xs text-white/60 mb-1 tracking-wide uppercase">제안서 발행일자</p>
                  <p className="text-base font-bold tracking-tight">{reportDate}</p>
                </div>
                <div>
                  <p className="text-xs text-white/60 mb-1 tracking-wide uppercase">제안서 유효일자</p>
                  <p className="text-base font-bold text-cyan-400 tracking-tight">{validUntil}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-start pt-6 border-t border-white/10">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50 leading-none mb-1">담당 컨설턴트</p>
                    <p className="text-sm font-bold tracking-tight">{consultantName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50 leading-none mb-1">연락처</p>
                    <p className="text-sm font-medium">{consultantPhone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/50 leading-none mb-1">이메일</p>
                    <p className="text-sm font-medium">{consultantEmail}</p>
                  </div>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl group-hover:bg-cyan-500/30 transition-colors"></div>
                <div className="relative w-24 h-24 border-4 border-double border-cyan-400/40 rounded-full flex flex-col items-center justify-center text-center p-2 rotate-12">
                  <div className="w-10 h-10 flex items-center justify-center mb-1 text-[10px] font-bold text-cyan-400 opacity-80">
                    {logo}
                  </div>
                  <span className="text-[8px] font-black text-cyan-400 leading-none uppercase tracking-tighter">
                    Official
                    <br />
                    Certified
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 flex justify-start items-end">
            <div className="opacity-40 grayscale brightness-200 contrast-200">
              <div className="text-xs font-bold text-white/60">{logo}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-teal-500 tracking-wider flex-shrink-0">
        Management Support Group Yieum
      </div>
    </div>
  )
}
