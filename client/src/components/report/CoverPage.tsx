import { Award } from "lucide-react";
import logoSero from "@assets/white_logo_sero_1767150624036.png";

interface CoverPageProps {
  businessName: string;
  reportDate: string;
}

export function CoverPage({ businessName, reportDate }: CoverPageProps) {
  return (
    <div 
      className="bg-white flex flex-col justify-between"
      style={{ 
        width: '210mm', 
        height: '297mm', 
        padding: '25mm',
        pageBreakAfter: 'always'
      }}
    >
      <div className="flex justify-end">
        <img 
          src={logoSero} 
          alt="경영지원그룹 이음" 
          style={{ height: '80px', mixBlendMode: 'multiply', backgroundColor: 'white' }} 
        />
      </div>

      <div className="flex-1 flex flex-col justify-center items-center" style={{ gap: '48px' }}>
        <div className="text-center" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h1 style={{ fontSize: '48px', fontFamily: 'Georgia, serif', color: '#002C5F', lineHeight: 1.2 }}>
            {businessName} 귀사
          </h1>
          <h2 style={{ fontSize: '28px', color: 'rgba(0, 44, 95, 0.8)', lineHeight: 1.6 }}>
            정책자금 조달 가능성 분석 및<br />
            전략 보고서
          </h2>
        </div>

        <div 
          style={{ 
            border: '4px solid #B8860B', 
            background: 'linear-gradient(135deg, rgba(184, 134, 11, 0.05), rgba(184, 134, 11, 0.1))',
            padding: '32px',
            borderRadius: '4px',
            maxWidth: '600px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center' }}>
            <Award style={{ width: '40px', height: '40px', color: '#B8860B' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#B8860B', marginBottom: '8px' }}>
                조달 실패시 환불 보증
              </p>
              <p style={{ fontSize: '16px', color: '#002C5F', lineHeight: 1.6 }}>
                정책자금 조달 실패 시 자문료 100% 환불
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '14px', color: 'rgba(0, 44, 95, 0.6)' }}>
        <div>
          <p>작성일: {reportDate}</p>
          <p style={{ marginTop: '4px' }}>경영지원그룹 이음</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p>Management Support Group Yieum</p>
        </div>
      </div>
    </div>
  );
}
