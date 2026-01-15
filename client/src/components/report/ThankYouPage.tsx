import logoSquare from "@assets/logo_square_white-removebg-preview_1768113664737.png"

export function ThankYouPage() {
  return (
    <div className="w-[210mm] h-[297mm] !bg-white !text-black shadow-lg p-[25mm] flex flex-col items-center justify-center page-break relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-500/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-teal-900/10 to-transparent rounded-full translate-y-1/2 -translate-x-1/2"></div>
      
      <div className="relative z-10 text-center max-w-2xl space-y-8">
        <img 
          src={logoSquare} 
          alt="경영지원그룹 이음" 
          className="w-28 h-28 object-contain mx-auto mb-4"
        />

        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="h-px w-24 bg-gradient-to-r from-transparent to-cyan-500"></div>
          <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
          <div className="h-px w-24 bg-gradient-to-l from-transparent to-cyan-500"></div>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-teal-900 leading-tight">감사합니다</h1>

          <p className="text-lg text-gray-700 leading-relaxed">본 제안서를 끝까지 읽어주셔서 진심으로 감사드립니다.</p>

          <div className="bg-gradient-to-br from-cyan-500/5 to-teal-900/5 rounded-2xl p-8 border border-cyan-500/20">
            <p className="text-base text-gray-800 leading-relaxed">
              비록 저희와 함께하지 않으시더라도,
              <br />
              귀사의 무궁한 발전과 번영을 진심으로 기원합니다.
            </p>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed pt-4">
            언제든 필요하신 순간이 오신다면
            <br />
            기꺼이 최선을 다해 도움을 드리겠습니다.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 mt-12">
          <div className="h-px w-24 bg-gradient-to-r from-transparent to-cyan-500"></div>
          <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
          <div className="h-px w-24 bg-gradient-to-l from-transparent to-cyan-500"></div>
        </div>

        <div className="pt-8">
          <p className="text-lg font-semibold text-teal-900">경영지원그룹 이음 임직원 올림</p>
          <p className="text-sm text-gray-600 mt-2">Management Support Group Yieum</p>
        </div>
      </div>
    </div>
  )
}
