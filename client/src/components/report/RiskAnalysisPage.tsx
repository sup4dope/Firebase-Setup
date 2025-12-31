import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { formatBillion, DebtDistribution } from "./types";

interface RiskAnalysisPageProps {
  totalDebt: number;
  loanBalance: number;
  guaranteeBalance: number;
  debtDistribution: DebtDistribution[];
  creditScore: number;
  creditGrade: string;
  creditComment: string;
  dti2024: number;
  dti2024Status: '안전' | '주의' | '위험';
  dti3Year: number;
  dti3YearStatus: '안전' | '주의' | '위험';
  dtiInterpretation: string;
}

const COLORS = ["#002C5F", "#4A7BA7", "#B8860B"];

const getStatusIcon = (status: '안전' | '주의' | '위험') => {
  switch (status) {
    case "안전":
      return <CheckCircle style={{ width: '24px', height: '24px', color: '#16a34a' }} />;
    case "주의":
      return <AlertTriangle style={{ width: '24px', height: '24px', color: '#ca8a04' }} />;
    case "위험":
      return <AlertTriangle style={{ width: '24px', height: '24px', color: '#dc2626' }} />;
  }
};

const getStatusColor = (status: '안전' | '주의' | '위험') => {
  switch (status) {
    case "안전": return '#16a34a';
    case "주의": return '#ca8a04';
    case "위험": return '#dc2626';
  }
};

export function RiskAnalysisPage({
  totalDebt,
  loanBalance,
  guaranteeBalance,
  debtDistribution,
  creditScore,
  creditGrade,
  creditComment,
  dti2024,
  dti2024Status,
  dti3Year,
  dti3YearStatus,
  dtiInterpretation,
}: RiskAnalysisPageProps) {
  const creditScorePercentage = Math.min(100, (creditScore / 1000) * 100);

  return (
    <div 
      className="bg-white flex flex-col"
      style={{ 
        width: '210mm', 
        height: '297mm', 
        padding: '25mm',
        pageBreakAfter: 'always'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px', paddingBottom: '24px', borderBottom: '2px solid #002C5F' }}>
        <h1 style={{ fontSize: '32px', fontFamily: 'Georgia, serif', color: '#002C5F' }}>금융 부채 및 리스크 분석</h1>
        <div style={{ fontSize: '14px', color: 'rgba(0, 44, 95, 0.6)' }}>페이지 3/5</div>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
          부채 현황
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
          {[
            { label: '총 부채액', value: totalDebt, color: '#002C5F' },
            { label: '대출 잔액', value: loanBalance, color: '#4A7BA7' },
            { label: '보증 잔액', value: guaranteeBalance, color: '#B8860B' },
          ].map((item, idx) => (
            <div key={idx} style={{ 
              background: 'linear-gradient(135deg, rgba(0, 44, 95, 0.05), rgba(0, 44, 95, 0.1))', 
              padding: '24px', 
              borderRadius: '4px', 
              borderTop: `4px solid ${item.color}` 
            }}>
              <p style={{ color: 'rgba(0, 44, 95, 0.6)', fontSize: '14px', marginBottom: '8px' }}>{item.label}</p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: '#002C5F' }}>{formatBillion(item.value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '40px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
            금융권별 분포
          </h2>
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={debtDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="percentage"
                >
                  {debtDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value, entry: any) => `${value}: ${entry.payload.percentage.toFixed(0)}%`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
            신용점수
          </h2>
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(184, 134, 11, 0.05), rgba(184, 134, 11, 0.1))', 
            padding: '32px', 
            borderRadius: '4px', 
            height: '200px', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center' 
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '48px', fontWeight: 700, color: '#002C5F', marginBottom: '8px' }}>{creditScore}</div>
              <div style={{ color: '#B8860B', fontWeight: 700, fontSize: '20px' }}>{creditGrade}</div>
            </div>
            <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '9999px', height: '12px', marginBottom: '16px' }}>
              <div
                style={{ 
                  background: 'linear-gradient(90deg, #002C5F, #B8860B)', 
                  height: '12px', 
                  borderRadius: '9999px',
                  width: `${creditScorePercentage}%`,
                  transition: 'all 0.3s'
                }}
              ></div>
            </div>
            <p style={{ color: '#002C5F', fontSize: '13px', textAlign: 'center', lineHeight: 1.6 }}>{creditComment}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
          DTI(부채비율) 분석
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          {[
            { label: '2024년 매출 기준 DTI', value: dti2024, status: dti2024Status, formula: '(총부채 / 2024년 매출) x 100' },
            { label: '3년 평균 매출 기준 DTI', value: dti3Year, status: dti3YearStatus, formula: '(총부채 / 3년 평균 매출) x 100' },
          ].map((item, idx) => (
            <div key={idx} style={{ border: '2px solid rgba(0, 44, 95, 0.2)', borderRadius: '4px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ color: '#002C5F', fontWeight: 700 }}>{item.label}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getStatusIcon(item.status)}
                  <span style={{ fontWeight: 700, color: getStatusColor(item.status) }}>{item.status}</span>
                </div>
              </div>
              <div style={{ fontSize: '40px', fontWeight: 700, color: '#002C5F', marginBottom: '12px' }}>{item.value.toFixed(1)}%</div>
              <p style={{ fontSize: '12px', color: 'rgba(0, 44, 95, 0.6)' }}>{item.formula}</p>
            </div>
          ))}
        </div>
        <div style={{ backgroundColor: 'rgba(0, 44, 95, 0.05)', padding: '24px', borderRadius: '4px', borderLeft: '4px solid #B8860B' }}>
          <p style={{ color: '#002C5F', fontSize: '14px', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700 }}>DTI 해석:</span> DTI 30% 이하는 안전, 30~50%는 주의, 50% 초과는 위험 구간입니다.
            현재 귀사의 DTI는 <span style={{ color: '#B8860B', fontWeight: 700 }}>{dtiInterpretation}</span> 수준으로 판단됩니다.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '32px', textAlign: 'right', fontSize: '12px', color: 'rgba(0, 44, 95, 0.4)' }}>경영지원그룹 이음</div>
    </div>
  );
}
