import { CheckCircle2, XCircle, Clock, FileText, AlertTriangle, Calendar } from "lucide-react";
import logoGaro from "@assets/white_logo_garo_1767150624035.png";

interface ConclusionPageProps {
  reportDate: string;
  validUntil: string;
  consultantName: string;
}

export function ConclusionPage({ reportDate, validUntil, consultantName }: ConclusionPageProps) {
  const comparisonData = [
    {
      aspect: "승인율",
      expert: "85% 이상",
      expertIcon: <CheckCircle2 style={{ width: '20px', height: '20px', color: '#16a34a' }} />,
      self: "30~40%",
      selfIcon: <XCircle style={{ width: '20px', height: '20px', color: '#dc2626' }} />,
    },
    {
      aspect: "소요 시간",
      expert: "2~3주",
      expertIcon: <Clock style={{ width: '20px', height: '20px', color: '#16a34a' }} />,
      self: "1~2개월",
      selfIcon: <Clock style={{ width: '20px', height: '20px', color: '#ca8a04' }} />,
    },
    {
      aspect: "서류 준비",
      expert: "전문가 대행",
      expertIcon: <CheckCircle2 style={{ width: '20px', height: '20px', color: '#16a34a' }} />,
      self: "본인 직접 준비",
      selfIcon: <FileText style={{ width: '20px', height: '20px', color: '#ca8a04' }} />,
    },
    {
      aspect: "심사 대응",
      expert: "전략적 대응 지원",
      expertIcon: <CheckCircle2 style={{ width: '20px', height: '20px', color: '#16a34a' }} />,
      self: "본인 대응",
      selfIcon: <AlertTriangle style={{ width: '20px', height: '20px', color: '#ca8a04' }} />,
    },
    {
      aspect: "리스크",
      expert: "실패 시 100% 환불",
      expertIcon: <CheckCircle2 style={{ width: '20px', height: '20px', color: '#16a34a' }} />,
      self: "6개월 재신청 금지",
      selfIcon: <XCircle style={{ width: '20px', height: '20px', color: '#dc2626' }} />,
    },
  ];

  const timeline = [
    { step: "상담", duration: "1일", description: "현황 분석 및 전략 수립" },
    { step: "서류 패키징", duration: "1주", description: "맞춤형 서류 준비" },
    { step: "심사", duration: "1~2주", description: "기관 심사 진행" },
    { step: "집행", duration: "3~5일", description: "자금 실행 완료" },
  ];

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
        <h1 style={{ fontSize: '32px', fontFamily: 'Georgia, serif', color: '#002C5F' }}>결론 및 제언</h1>
        <div style={{ fontSize: '14px', color: 'rgba(0, 44, 95, 0.6)' }}>페이지 5/5</div>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
          전문가 컨설팅 vs 셀프 신청 비교
        </h2>
        <div style={{ overflow: 'hidden', borderRadius: '4px', border: '2px solid rgba(0, 44, 95, 0.2)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#002C5F', color: 'white' }}>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 700 }}>구분</th>
                <th style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 700 }}>전문가 컨설팅</th>
                <th style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 700 }}>셀프 신청</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((row, index) => (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : 'rgba(0, 44, 95, 0.05)' }}>
                  <td style={{ padding: '16px 24px', color: '#002C5F', fontWeight: 500 }}>{row.aspect}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      {row.expertIcon}
                      <span style={{ color: '#002C5F', fontWeight: 500 }}>{row.expert}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      {row.selfIcon}
                      <span style={{ color: 'rgba(0, 44, 95, 0.7)' }}>{row.self}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginBottom: '40px', border: '2px solid #dc2626', backgroundColor: '#fef2f2', padding: '24px', borderRadius: '4px' }}>
        <h3 style={{ color: '#dc2626', fontWeight: 700, fontSize: '18px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle style={{ width: '24px', height: '24px' }} />
          셀프 신청 시 주의사항
        </h3>
        <p style={{ color: '#002C5F', lineHeight: 1.6 }}>
          정책자금 심사에서 부결될 경우, <span style={{ fontWeight: 700, color: '#dc2626' }}>6개월간 동일 기관 재신청이 금지</span>됩니다. 
          이는 귀사의 자금 조달 일정에 심각한 차질을 줄 수 있습니다. 전문가와 함께 철저한 준비 후 신청하시길 권장합니다.
        </p>
      </div>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar style={{ width: '24px', height: '24px', color: '#B8860B' }} />
          프로세스 타임라인
        </h2>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '32px', left: 0, width: '100%', height: '2px', backgroundColor: 'rgba(0, 44, 95, 0.2)' }}></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', position: 'relative' }}>
            {timeline.map((item, index) => (
              <div key={index} style={{ textAlign: 'center' }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '50%', 
                  backgroundColor: '#002C5F', 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 700, 
                  fontSize: '20px', 
                  margin: '0 auto 12px',
                  position: 'relative',
                  zIndex: 10
                }}>
                  {index + 1}
                </div>
                <h4 style={{ color: '#002C5F', fontWeight: 700, marginBottom: '4px' }}>{item.step}</h4>
                <p style={{ color: '#B8860B', fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>{item.duration}</p>
                <p style={{ color: 'rgba(0, 44, 95, 0.6)', fontSize: '12px' }}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: 'linear-gradient(90deg, #002C5F, rgba(0, 44, 95, 0.9))', padding: '32px', borderRadius: '4px', color: 'white' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <p style={{ fontSize: '14px', opacity: 0.8, marginBottom: '8px' }}>본 보고서 작성일</p>
            <p style={{ fontSize: '20px', fontWeight: 700 }}>{reportDate}</p>
          </div>
          <div>
            <p style={{ fontSize: '14px', opacity: 0.8, marginBottom: '8px' }}>분석 유효기간</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#B8860B' }}>{validUntil}</p>
          </div>
        </div>
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '14px', opacity: 0.8, marginBottom: '4px' }}>담당자</p>
            <p style={{ fontSize: '18px', fontWeight: 700 }}>{consultantName || '경영지원그룹 이음'}</p>
          </div>
          <img 
            src={logoGaro} 
            alt="경영지원그룹 이음" 
            style={{ height: '40px', mixBlendMode: 'screen' }} 
          />
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '32px', textAlign: 'center', fontSize: '12px', color: 'rgba(0, 44, 95, 0.4)' }}>
        경영지원그룹 이음 | Management Support Group Yieum
      </div>
    </div>
  );
}
