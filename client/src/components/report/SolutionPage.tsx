import { ArrowDownCircle, TrendingUp, Building2 } from "lucide-react";
import { ExecutionPlan, formatBillion } from "./types";

interface SolutionPageProps {
  diagnosisResult: string;
  currentRate: number;
  improvedRate: number;
  rateDiff: number;
  currentInterest: string;
  improvedInterest: string;
  interestSavings: string;
  executionPlan: ExecutionPlan[];
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
  const recommendations = [recommendation1, recommendation2, recommendation3].filter(Boolean);

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
        <h1 style={{ fontSize: '32px', fontFamily: 'Georgia, serif', color: '#002C5F' }}>맞춤형 조달 솔루션</h1>
        <div style={{ fontSize: '14px', color: 'rgba(0, 44, 95, 0.6)' }}>페이지 4/5</div>
      </div>

      <div style={{ marginBottom: '40px', background: 'linear-gradient(90deg, #002C5F, rgba(0, 44, 95, 0.9))', padding: '32px', borderRadius: '4px', color: 'white' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
          진단 결과
        </h2>
        <p style={{ fontSize: '18px', lineHeight: 1.6 }}>{diagnosisResult}</p>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ArrowDownCircle style={{ width: '24px', height: '24px', color: '#B8860B' }} />
          이자 비용 절감 시뮬레이션
        </h2>
        <div style={{ overflow: 'hidden', borderRadius: '4px', border: '2px solid rgba(0, 44, 95, 0.2)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#002C5F', color: 'white' }}>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 700 }}>구분</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 700 }}>현재</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 700 }}>구조개선 후</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 700 }}>절감액</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(0, 44, 95, 0.1)' }}>
                <td style={{ padding: '16px 24px', color: '#002C5F', fontWeight: 500 }}>예상 평균 금리</td>
                <td style={{ padding: '16px 24px', textAlign: 'right', color: '#002C5F', fontWeight: 700 }}>{currentRate}%</td>
                <td style={{ padding: '16px 24px', textAlign: 'right', color: '#B8860B', fontWeight: 700 }}>{improvedRate}%</td>
                <td style={{ padding: '16px 24px', textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>-{rateDiff}%p</td>
              </tr>
              <tr style={{ backgroundColor: 'rgba(0, 44, 95, 0.05)' }}>
                <td style={{ padding: '16px 24px', color: '#002C5F', fontWeight: 500 }}>연간 이자 비용</td>
                <td style={{ padding: '16px 24px', textAlign: 'right', color: '#002C5F', fontWeight: 700 }}>{currentInterest}</td>
                <td style={{ padding: '16px 24px', textAlign: 'right', color: '#B8860B', fontWeight: 700 }}>{improvedInterest}</td>
                <td style={{ padding: '16px 24px', textAlign: 'right', color: '#16a34a', fontWeight: 700, fontSize: '20px' }}>{interestSavings}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Building2 style={{ width: '24px', height: '24px', color: '#B8860B' }} />
          예상 집행 기관 및 금액
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {executionPlan.map((item, index) => (
            <div
              key={index}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '24px', 
                background: 'linear-gradient(90deg, rgba(0, 44, 95, 0.05), rgba(0, 44, 95, 0.1))', 
                borderRadius: '4px', 
                borderLeft: '4px solid #B8860B' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%', 
                  backgroundColor: '#002C5F', 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700 
                }}>
                  {index + 1}
                </div>
                <div>
                  <span style={{ color: '#002C5F', fontWeight: 700, fontSize: '18px' }}>{item.institution}</span>
                  {item.purpose && (
                    <span style={{ color: 'rgba(0, 44, 95, 0.6)', fontSize: '14px', marginLeft: '8px' }}>({item.purpose})</span>
                  )}
                </div>
              </div>
              <span style={{ color: '#B8860B', fontWeight: 700, fontSize: '24px' }}>{item.amount}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '24px', backgroundColor: 'rgba(184, 134, 11, 0.1)', padding: '24px', borderRadius: '4px', border: '2px solid #B8860B' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#002C5F', fontWeight: 700, fontSize: '20px' }}>총 조달 예상액</span>
            <span style={{ color: '#B8860B', fontWeight: 700, fontSize: '28px' }}>{totalExpectedAmount}</span>
          </div>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <TrendingUp style={{ width: '24px', height: '24px', color: '#B8860B' }} />
            권장 조치사항
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recommendations.map((rec, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', backgroundColor: 'rgba(0, 44, 95, 0.05)', borderRadius: '4px' }}>
                <span style={{ color: '#B8860B', fontWeight: 700 }}>{String(index + 1).padStart(2, '0')}</span>
                <p style={{ color: '#002C5F', lineHeight: 1.6 }}>{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '32px', textAlign: 'right', fontSize: '12px', color: 'rgba(0, 44, 95, 0.4)' }}>경영지원그룹 이음</div>
    </div>
  );
}
