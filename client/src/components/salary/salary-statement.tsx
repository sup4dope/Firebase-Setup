import { User, Calendar, FileText, Percent, DollarSign } from "lucide-react"
import yieumSignature from "@assets/yieum_signature_1768113653178.png"

interface SalaryItem {
  category: string
  amount: number
  description?: string
}

interface SalaryStatementProps {
  companyName?: string
  issueDate?: string
  paymentDate?: string
  employeeName?: string
  employeeId?: string
  department?: string
  position?: string
  salaryMonth?: string
  contractPayment?: number
  consultingFee?: number
  additionalPayments?: SalaryItem[]
  incomeTaxRate?: number
  localTaxRate?: number
  approverName?: string
  approverPosition?: string
}

export function SalaryStatement({
  companyName = "경영지원그룹 이음",
  issueDate = "2025년 01월 31일",
  paymentDate = "2025년 02월 05일",
  employeeName = "홍길동",
  employeeId = "YE2024001",
  department = "컨설팅부",
  position = "프리랜서",
  salaryMonth = "2025년 01월",
  contractPayment = 0,
  consultingFee = 0,
  additionalPayments = [],
  incomeTaxRate = 3.0,
  localTaxRate = 0.3,
  approverName = "김대표",
  approverPosition = "대표이사",
}: SalaryStatementProps) {
  const totalPayment = contractPayment + consultingFee + additionalPayments.reduce((sum, item) => sum + item.amount, 0)
  const incomeTax = Math.floor(totalPayment * (incomeTaxRate / 100))
  const localTax = Math.floor(totalPayment * (localTaxRate / 100))
  const totalDeduction = incomeTax + localTax
  const netPayment = totalPayment - totalDeduction

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ko-KR").format(amount)
  }

  return (
    <div className="w-[210mm] min-h-[297mm] bg-white p-[12mm] flex flex-col" id="salary-statement">
      <div className="mb-4 pb-3 border-b-2 border-cyan-500">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-3xl font-bold text-teal-900 mb-1 tracking-tight">급여명세서</h1>
            <p className="text-xs text-teal-600 tracking-wide">Salary Statement (Freelance)</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-cyan-600" />
            <div>
              <span className="text-[10px] text-[#4A5568]">발행일자: </span>
              <span className="text-xs font-semibold text-teal-900">{issueDate}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-cyan-600" />
            <div>
              <span className="text-[10px] text-[#4A5568]">지급일자: </span>
              <span className="text-xs font-semibold text-teal-900">{paymentDate}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 bg-gradient-to-br from-teal-900/5 to-cyan-500/5 rounded-lg p-3.5 border border-cyan-500/20">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-bold text-teal-900">직원 정보</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex justify-between items-center border-b border-teal-200 pb-1.5">
            <span className="text-xs text-[#4A5568]">성명</span>
            <span className="text-xs font-bold text-teal-900">{employeeName}</span>
          </div>
          <div className="flex justify-between items-center border-b border-teal-200 pb-1.5">
            <span className="text-xs text-[#4A5568]">사원번호</span>
            <span className="text-xs font-bold text-teal-900">{employeeId}</span>
          </div>
          <div className="flex justify-between items-center border-b border-teal-200 pb-1.5">
            <span className="text-xs text-[#4A5568]">부서</span>
            <span className="text-xs font-bold text-teal-900">{department}</span>
          </div>
          <div className="flex justify-between items-center border-b border-teal-200 pb-1.5">
            <span className="text-xs text-[#4A5568]">직급/구분</span>
            <span className="text-xs font-bold text-cyan-600">{position}</span>
          </div>
        </div>
      </div>

      <div className="mb-4 bg-gradient-to-r from-teal-900 to-teal-700 text-white py-2.5 px-6 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="font-bold text-sm">귀속 연월</span>
          </div>
          <span className="text-lg font-bold">{salaryMonth}</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="bg-teal-900 text-white py-1.5 px-4 rounded-t-lg">
          <h3 className="font-bold text-sm">지급 내역</h3>
        </div>
        <div className="border-2 border-teal-900 border-t-0 rounded-b-lg">
          <div className="bg-gradient-to-br from-white to-gray-50">
            {contractPayment > 0 && (
              <div className="flex justify-between items-center py-2.5 px-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                  <span className="text-xs font-semibold text-teal-900">계약금</span>
                </div>
                <span className="text-sm font-bold text-teal-900">{formatCurrency(contractPayment)}원</span>
              </div>
            )}

            {consultingFee > 0 && (
              <div className="flex justify-between items-center py-2.5 px-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                  <span className="text-xs font-semibold text-teal-900">자문료</span>
                </div>
                <span className="text-sm font-bold text-teal-900">{formatCurrency(consultingFee)}원</span>
              </div>
            )}

            {additionalPayments.map((item, index) => (
              <div key={index} className="flex justify-between items-center py-2.5 px-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                  <div>
                    <span className="text-xs font-semibold text-teal-900">{item.category}</span>
                    {item.description && (
                      <span className="text-[10px] text-[#4A5568] ml-1.5">({item.description})</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold text-teal-900">{formatCurrency(item.amount)}원</span>
              </div>
            ))}

            <div className="flex justify-between items-center py-3 px-4 bg-cyan-500/10">
              <span className="text-sm font-bold text-teal-900">총 지급액</span>
              <span className="text-lg font-bold text-cyan-600">{formatCurrency(totalPayment)}원</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="bg-gradient-to-r from-[#E63946] to-[#D62828] text-white py-2 px-4 rounded-t-lg flex items-center gap-2">
          <Percent className="w-4 h-4" />
          <h3 className="font-bold text-sm">공제 내역 (3.3% 원천징수)</h3>
        </div>
        <div className="border-2 border-[#E63946] border-t-0 rounded-b-lg">
          <div className="bg-gradient-to-br from-white to-gray-50">
            <div className="flex justify-between items-center py-2.5 px-4 border-b border-gray-200">
              <span className="text-xs font-semibold text-[#2D3748]">소득세 ({incomeTaxRate}%)</span>
              <span className="text-sm font-bold text-[#E63946]">-{formatCurrency(incomeTax)}원</span>
            </div>
            <div className="flex justify-between items-center py-2.5 px-4 border-b border-gray-200">
              <span className="text-xs font-semibold text-[#2D3748]">지방소득세 ({localTaxRate}%)</span>
              <span className="text-sm font-bold text-[#E63946]">-{formatCurrency(localTax)}원</span>
            </div>
            <div className="flex justify-between items-center py-3 px-4 bg-red-50">
              <span className="text-sm font-bold text-[#2D3748]">총 공제액</span>
              <span className="text-lg font-bold text-[#E63946]">-{formatCurrency(totalDeduction)}원</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-3.5 border-2 border-slate-300">
        <div className="flex items-center justify-center gap-3 text-center">
          <div>
            <p className="text-[10px] text-slate-500 mb-0.5">총 지급액</p>
            <p className="text-base font-bold text-teal-900">{formatCurrency(totalPayment)}원</p>
          </div>
          <div className="text-2xl font-bold text-slate-400">-</div>
          <div>
            <p className="text-[10px] text-slate-500 mb-0.5">총 공제액</p>
            <p className="text-base font-bold text-[#E63946]">{formatCurrency(totalDeduction)}원</p>
          </div>
          <div className="text-2xl font-bold text-slate-400">=</div>
          <div>
            <p className="text-[10px] text-slate-500 mb-0.5">실 지급액</p>
            <p className="text-xl font-bold text-cyan-600">{formatCurrency(netPayment)}원</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-center gap-6 py-4">
        <div className="text-xl font-bold text-teal-900">경영지원그룹 이음</div>
        <img 
          src={yieumSignature} 
          alt="직인" 
          className="w-20 h-20 object-contain"
        />
      </div>

      <div className="relative overflow-hidden mt-auto">
        <div className="absolute top-0 right-0 w-24 h-24 bg-teal-900/5 rounded-full translate-x-1/3 -translate-y-1/3"></div>
        <div className="relative bg-gradient-to-br from-teal-900 via-teal-800 to-teal-900 text-white py-4 px-6 rounded-lg shadow-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs opacity-80 mb-0.5">실지급액</p>
              <p className="text-[10px] opacity-60">Net Payment</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight">{formatCurrency(netPayment)}원</p>
              <p className="text-[10px] opacity-70 mt-0.5">KRW</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export type { SalaryItem, SalaryStatementProps }
