import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import { formatBillion } from "./types";

interface DiagnosticsPageProps {
  companyName: string;
  ceoName: string;
  businessNumber: string;
  openingDate: string;
  industry: string;
  businessAge: string;
  address: string;
  sales2022: number;
  sales2023: number;
  sales2024: number;
  sales2025: number;
  growthRate: number;
}

export function DiagnosticsPage({
  companyName,
  ceoName,
  businessNumber,
  openingDate,
  industry,
  businessAge,
  address,
  sales2022,
  sales2023,
  sales2024,
  sales2025,
  growthRate,
}: DiagnosticsPageProps) {
  const salesData = [
    { year: "2022년", value: sales2022 },
    { year: "2023년", value: sales2023 },
    { year: "2024년", value: sales2024 },
    { year: "2025년(최근)", value: sales2025 },
  ].filter(d => d.value > 0);

  const infoItems = [
    { label: "상호명", value: companyName },
    { label: "대표자", value: ceoName },
    { label: "사업자번호", value: businessNumber },
    { label: "개업일", value: openingDate },
    { label: "업종", value: industry },
    { label: "업력", value: businessAge },
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
        <h1 style={{ fontSize: '32px', fontFamily: 'Georgia, serif', color: '#002C5F' }}>정밀 기업 진단</h1>
        <div style={{ fontSize: '14px', color: 'rgba(0, 44, 95, 0.6)' }}>페이지 2/5</div>
      </div>

      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
          기본 정보
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 64px' }}>
          {infoItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <span style={{ color: 'rgba(0, 44, 95, 0.6)', width: '128px' }}>{item.label}</span>
              <span style={{ color: '#002C5F', fontWeight: 500 }}>{item.value || '-'}</span>
            </div>
          ))}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', gridColumn: 'span 2' }}>
            <span style={{ color: 'rgba(0, 44, 95, 0.6)', width: '128px' }}>사업장 주소</span>
            <span style={{ color: '#002C5F', fontWeight: 500 }}>{address || '-'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#002C5F', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ width: '4px', height: '24px', backgroundColor: '#B8860B' }}></span>
          최근 3개년 매출 추이
        </h2>
        <div style={{ height: '256px', marginBottom: '24px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="year" tick={{ fill: "#002C5F", fontSize: 14 }} axisLine={{ stroke: "#002C5F" }} />
              <YAxis
                tick={{ fill: "#002C5F", fontSize: 14 }}
                axisLine={{ stroke: "#002C5F" }}
                label={{ value: "매출액 (억원)", angle: -90, position: "insideLeft", fill: "#002C5F" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {salesData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={index === salesData.length - 1 ? "#B8860B" : "#002C5F"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ backgroundColor: 'rgba(0, 44, 95, 0.05)', padding: '24px', borderRadius: '4px', borderLeft: '4px solid #B8860B' }}>
          <p style={{ color: '#002C5F', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700 }}>진단 코멘트:</span> 최근 3년 평균{" "}
            <span style={{ color: '#B8860B', fontWeight: 700 }}>{growthRate.toFixed(1)}%</span>의 성장세를 유지하고 있습니다.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '32px', textAlign: 'right', fontSize: '12px', color: 'rgba(0, 44, 95, 0.4)' }}>경영지원그룹 이음</div>
    </div>
  );
}
