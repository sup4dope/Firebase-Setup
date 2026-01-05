import { SalaryStatement } from "@/components/salary/salary-statement"

export default function SalaryPage() {
  // 예시 데이터 - 실제 사용 시 데이터베이스나 API에서 가져올 수 있습니다
  const sampleAdditionalPayments = [
    { category: "시상비", amount: 500000, description: "우수 성과" },
    { category: "프로젝트 인센티브", amount: 1000000, description: "특별 프로젝트 완수" },
  ]

  return (
    <div className="min-h-screen bg-[#E8E9EB] py-8">
      <div className="max-w-[210mm] mx-auto">
        <SalaryStatement
          companyName="경영지원자문 이음"
          companyLogo="YIEUM"
          issueDate="2025년 01월 31일"
          paymentDate="2025년 02월 05일"
          employeeName="홍길동"
          employeeId="YE2024001"
          department="컨설팅부"
          position="프리랜서"
          salaryMonth="2025년 01월"
          contractPayment={5000000}
          consultingFee={3000000}
          additionalPayments={sampleAdditionalPayments}
          incomeTaxRate={3.0}
          localTaxRate={0.3}
          approverName="김대표"
          approverPosition="대표이사"
        />
      </div>
    </div>
  )
}
