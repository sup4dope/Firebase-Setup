import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ReferenceLine } from "recharts";
import { 
  TrendingUp, 
  Building2, 
  Calendar, 
  MapPin, 
  Briefcase, 
  CreditCard,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinancialObligation, Customer, CreditSummary, EligibilityFactors } from "@shared/types";

interface ReviewSummaryTabProps {
  customer: Partial<Customer>;
  obligations: FinancialObligation[];
  creditSummary?: CreditSummary;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
];

const SECTOR_COLORS = {
  first: "#3b82f6",
  firstGuaranteed: "#60a5fa",
  second: "#f59e0b",
  public: "#10b981",
};

const isGuaranteeOnlyInstitution = (institution: string): boolean => {
  const name = institution.toLowerCase();
  const guaranteeKeywords = ['재단', '기금'];
  return guaranteeKeywords.some(k => name.includes(k));
};

const classifyFinancialSector = (institution: string): '1금융권' | '2금융권' | '공공기관' => {
  const name = institution.toLowerCase();
  
  const firstTierKeywords = [
    '은행', '국민', '신한', '하나', '우리', '기업', 'nh농협', 'kb', 'ibk',
    'sc제일', '씨티', 'bnk', 'dgb', 'jb', '경남', '부산', '광주', '전북', '제주'
  ];
  
  const publicKeywords = [
    '공단', '소상공인시장진흥', '중소벤처기업진흥'
  ];
  
  if (publicKeywords.some(k => name.includes(k))) {
    return '공공기관';
  }
  
  if (firstTierKeywords.some(k => name.includes(k))) {
    return '1금융권';
  }
  
  return '2금융권';
};

const isWithin7Days = (date1: string, date2: string): boolean => {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
};

export function ReviewSummaryTab({ customer, obligations, creditSummary }: ReviewSummaryTabProps) {
  const loans = useMemo(() => 
    obligations.filter(o => o.type === 'loan'),
    [obligations]
  );

  const guarantees = useMemo(() => 
    obligations.filter(o => o.type === 'guarantee'),
    [obligations]
  );

  const linkedLoanIds = useMemo(() => {
    const linkedIds = new Set<string>();
    
    loans.forEach(loan => {
      guarantees.forEach(guarantee => {
        const dateMatch = isWithin7Days(loan.occurred_at, guarantee.occurred_at);
        const balanceRatio = loan.balance > 0 && guarantee.balance > 0 
          ? Math.min(loan.balance, guarantee.balance) / Math.max(loan.balance, guarantee.balance)
          : 0;
        const similarBalance = balanceRatio >= 0.9;
        
        if (dateMatch && similarBalance) {
          linkedIds.add(loan.id);
        }
      });
    });
    
    return linkedIds;
  }, [loans, guarantees]);

  const institutionBreakdown = useMemo(() => {
    const breakdown = new Map<string, number>();
    
    obligations
      .filter(ob => !isGuaranteeOnlyInstitution(ob.institution))
      .forEach(ob => {
        const current = breakdown.get(ob.institution) || 0;
        breakdown.set(ob.institution, current + ob.balance);
      });
    
    return Array.from(breakdown.entries())
      .map(([name, value]) => ({ 
        name, 
        value,
        sector: classifyFinancialSector(name)
      }))
      .sort((a, b) => b.value - a.value);
  }, [obligations]);

  const sectorBreakdown = useMemo(() => {
    const sectors = new Map<string, number>();
    let firstTierGuaranteedAmount = 0;
    
    obligations
      .filter(ob => !isGuaranteeOnlyInstitution(ob.institution))
      .forEach(ob => {
        const sector = classifyFinancialSector(ob.institution);
        
        if (sector === '1금융권' && ob.type === 'loan' && linkedLoanIds.has(ob.id)) {
          firstTierGuaranteedAmount += ob.balance;
        } else {
          const current = sectors.get(sector) || 0;
          sectors.set(sector, current + ob.balance);
        }
      });
    
    const order = ['1금융권', '1금융권(보증)', '2금융권', '공공기관'];
    const result = [];
    
    for (const sector of order) {
      if (sector === '1금융권(보증)') {
        if (firstTierGuaranteedAmount > 0) {
          result.push({
            name: '1금융권(보증)',
            value: firstTierGuaranteedAmount,
            fill: SECTOR_COLORS.firstGuaranteed
          });
        }
      } else if (sectors.has(sector)) {
        result.push({
          name: sector,
          value: sectors.get(sector)!,
          fill: sector === '1금융권' ? SECTOR_COLORS.first 
              : sector === '2금융권' ? SECTOR_COLORS.second 
              : SECTOR_COLORS.public
        });
      }
    }
    
    return result;
  }, [obligations, linkedLoanIds]);

  const filteredTotalDebt = useMemo(() => 
    obligations
      .filter(ob => !isGuaranteeOnlyInstitution(ob.institution))
      .reduce((sum, ob) => sum + ob.balance, 0),
    [obligations]
  );

  const totalDebt = useMemo(() => 
    obligations.reduce((sum, ob) => sum + ob.balance, 0),
    [obligations]
  );

  const totalLoanBalance = useMemo(() => 
    obligations.filter(o => o.type === 'loan').reduce((sum, o) => sum + o.balance, 0),
    [obligations]
  );

  const totalGuaranteeBalance = useMemo(() => 
    obligations.filter(o => o.type === 'guarantee').reduce((sum, o) => sum + o.balance, 0),
    [obligations]
  );

  const dtiY1 = useMemo(() => {
    if (!customer.sales_y1 || customer.sales_y1 <= 0) return null;
    const salesInWon = customer.sales_y1 * 100000000;
    return (totalDebt / salesInWon) * 100;
  }, [customer.sales_y1, totalDebt]);

  const avg3YSales = useMemo(() => {
    const years = [customer.sales_y1, customer.sales_y2, customer.sales_y3].filter(s => s && s > 0);
    if (years.length === 0) return null;
    return years.reduce((a, b) => a! + b!, 0)! / years.length;
  }, [customer.sales_y1, customer.sales_y2, customer.sales_y3]);

  const dtiAvg3Y = useMemo(() => {
    if (!avg3YSales || avg3YSales <= 0) return null;
    const salesInWon = avg3YSales * 100000000;
    return (totalDebt / salesInWon) * 100;
  }, [avg3YSales, totalDebt]);

  const lastLoanDate = useMemo(() => {
    const loans = obligations.filter(o => o.type === 'loan');
    if (loans.length === 0) return null;
    return loans.reduce((latest, l) => 
      !latest || l.occurred_at > latest ? l.occurred_at : latest, 
      ''
    );
  }, [obligations]);

  const businessYears = useMemo(() => {
    if (!customer.founding_date) return null;
    const founding = new Date(customer.founding_date);
    const now = new Date();
    return Math.floor((now.getTime() - founding.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }, [customer.founding_date]);

  const getSalesBracket = (sales?: number): string => {
    if (!sales) return '미확인';
    if (sales < 1) return '1억 미만';
    if (sales < 5) return '1억~5억';
    if (sales < 10) return '5억~10억';
    if (sales < 30) return '10억~30억';
    if (sales < 50) return '30억~50억';
    if (sales < 100) return '50억~100억';
    return '100억 이상';
  };

  const getDtiStatus = (dti: number | null): { label: string; color: string; icon: typeof CheckCircle2 } => {
    if (dti === null) return { label: '계산 불가', color: 'text-muted-foreground', icon: AlertCircle };
    if (dti <= 50) return { label: '양호', color: 'text-emerald-400', icon: CheckCircle2 };
    if (dti <= 100) return { label: '주의', color: 'text-amber-400', icon: AlertCircle };
    return { label: '위험', color: 'text-red-400', icon: AlertCircle };
  };

  const formatCurrency = (amount: number): string => {
    if (amount >= 100000000) {
      return `${(amount / 100000000).toFixed(1)}억원`;
    }
    if (amount >= 10000) {
      return `${(amount / 10000).toFixed(0)}만원`;
    }
    return `${amount.toLocaleString()}원`;
  };

  const eligibilityFactors: { 
    label: string; 
    value: string | number | null; 
    icon: typeof CreditCard;
    status?: 'good' | 'warning' | 'bad';
  }[] = [
    { 
      label: '신용점수', 
      value: customer.credit_score ? `${customer.credit_score}점` : null, 
      icon: CreditCard,
      status: customer.credit_score 
        ? customer.credit_score >= 700 ? 'good' : customer.credit_score >= 600 ? 'warning' : 'bad'
        : undefined
    },
    { 
      label: '매출구간', 
      value: getSalesBracket(customer.sales_y1), 
      icon: TrendingUp 
    },
    { 
      label: '업력', 
      value: businessYears !== null ? `${businessYears}년` : null, 
      icon: Calendar,
      status: businessYears !== null 
        ? businessYears >= 3 ? 'good' : businessYears >= 1 ? 'warning' : 'bad'
        : undefined
    },
    { 
      label: '지역', 
      value: customer.business_address?.split(' ')[0] || null, 
      icon: MapPin 
    },
    { 
      label: '업태', 
      value: customer.business_type || null, 
      icon: Briefcase 
    },
    { 
      label: '최근대출일', 
      value: lastLoanDate || null, 
      icon: Building2 
    },
  ];

  const dtiY1Status = getDtiStatus(dtiY1);
  const dtiAvg3YStatus = getDtiStatus(dtiAvg3Y);

  const timelineData = useMemo(() => {
    const now = new Date();
    const months: { month: string; label: string; loans: number; guarantees: number }[] = [];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        month: monthKey,
        label: `${date.getMonth() + 1}월`,
        loans: 0,
        guarantees: 0
      });
    }
    
    obligations.forEach(ob => {
      if (!ob.occurred_at) return;
      const obDate = new Date(ob.occurred_at);
      const monthKey = `${obDate.getFullYear()}-${String(obDate.getMonth() + 1).padStart(2, '0')}`;
      const monthEntry = months.find(m => m.month === monthKey);
      if (monthEntry) {
        if (ob.type === 'loan') monthEntry.loans++;
        else monthEntry.guarantees++;
      }
    });
    
    return months;
  }, [obligations]);

  const scatterData = useMemo(() => {
    const data: { x: string; y: number; z: number; type: string; month: string }[] = [];
    
    timelineData.forEach((month) => {
      if (month.loans > 0) {
        data.push({ x: month.label, y: 1, z: month.loans * 100, type: 'loan', month: month.label });
      }
      if (month.guarantees > 0) {
        data.push({ x: month.label, y: 0, z: month.guarantees * 100, type: 'guarantee', month: month.label });
      }
    });
    
    return data;
  }, [timelineData]);

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto pt-[0px] pb-[0px] pl-[10px] pr-[10px]">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              DTI 지표 (Y-1 기준)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="flex items-baseline gap-2">
              <span className={cn("text-3xl font-bold", dtiY1Status.color)}>
                {dtiY1 !== null ? `${dtiY1.toFixed(1)}%` : '-'}
              </span>
              <Badge 
                variant="outline" 
                className={cn("text-xs", dtiY1Status.color, `border-current`)}
              >
                <dtiY1Status.icon className="w-3 h-3 mr-1" />
                {dtiY1Status.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              총 부채 {formatCurrency(totalDebt)} / Y-1 매출 {customer.sales_y1 ? `${customer.sales_y1}억원` : '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              DTI 지표 (3년 평균)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="flex items-baseline gap-2">
              <span className={cn("text-3xl font-bold", dtiAvg3YStatus.color)}>
                {dtiAvg3Y !== null ? `${dtiAvg3Y.toFixed(1)}%` : '-'}
              </span>
              <Badge 
                variant="outline" 
                className={cn("text-xs", dtiAvg3YStatus.color, `border-current`)}
              >
                <dtiAvg3YStatus.icon className="w-3 h-3 mr-1" />
                {dtiAvg3YStatus.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              총 부채 {formatCurrency(totalDebt)} / 3년 평균 {avg3YSales ? `${avg3YSales.toFixed(1)}억원` : '-'}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="flex-1 min-h-[280px]">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            금융기관별 부채 비중
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-2 px-4 h-[calc(100%-52px)]">
          {institutionBreakdown.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              등록된 금융 내역이 없습니다
            </div>
          ) : (
            <div className="flex h-full gap-3">
              <div className="flex-[2] flex flex-col min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">채무 분포</p>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={institutionBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={48}
                        paddingAngle={1}
                        dataKey="value"
                        nameKey="name"
                      >
                        {institutionBreakdown.map((_, index) => (
                          <Cell 
                            key={`inner-${index}`} 
                            fill={CHART_COLORS[index % CHART_COLORS.length]} 
                          />
                        ))}
                      </Pie>
                      <Pie
                        data={sectorBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={65}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {sectorBreakdown.map((entry, index) => (
                          <Cell 
                            key={`outer-${index}`} 
                            fill={entry.fill} 
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string) => [formatCurrency(value), name]}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium mb-1.5">금융권 구분</p>
                <div className="flex flex-col gap-1.5">
                  {sectorBreakdown.map((sector) => (
                    <div key={sector.name} className="flex items-center gap-1.5">
                      <div 
                        className="w-2.5 h-2.5 rounded-sm shrink-0" 
                        style={{ backgroundColor: sector.fill }}
                      />
                      <span className="text-[11px] truncate">{sector.name}</span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {filteredTotalDebt > 0 ? ((sector.value / filteredTotalDebt) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium mb-1.5">금융기관</p>
                <div className="flex flex-col gap-1">
                  {institutionBreakdown.slice(0, 5).map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-1.5" title={item.name}>
                      <div 
                        className="w-2.5 h-2.5 rounded-sm shrink-0" 
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="text-[10px] truncate">
                        {item.name.length > 8 ? item.name.substring(0, 8) + '..' : item.name}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-medium">
                        {filteredTotalDebt > 0 ? ((item.value / filteredTotalDebt) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))}
                  {institutionBreakdown.length > 5 && (
                    <p className="text-[9px] text-muted-foreground">
                      +{institutionBreakdown.length - 5}개 기관
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            12개월 발생 추이
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-4 px-4 h-[120px]">
          {scatterData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              최근 12개월간 발생 내역이 없습니다
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                <XAxis 
                  type="category" 
                  dataKey="x" 
                  name="월" 
                  tick={{ fontSize: 10 }}
                  allowDuplicatedCategory={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                />
                <YAxis 
                  type="category" 
                  dataKey="y" 
                  name="유형"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => value === 1 ? '대출' : '보증'}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  width={35}
                />
                <ZAxis type="number" dataKey="z" range={[50, 300]} />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload?.[0]) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-card border rounded-md px-2 py-1 text-xs shadow-md">
                          <p className="font-medium">{data.month}</p>
                          <p className="text-muted-foreground">
                            {data.type === 'loan' ? '대출' : '보증'}: {data.z / 100}건
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter 
                  data={scatterData.filter(d => d.type === 'loan')} 
                  fill="hsl(var(--chart-1))"
                />
                <Scatter 
                  data={scatterData.filter(d => d.type === 'guarantee')} 
                  fill="hsl(var(--chart-3))"
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">적합도 요소</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-4 px-4">
          <div className="grid grid-cols-2 gap-3">
            {eligibilityFactors.map((factor) => (
              <div 
                key={factor.label} 
                className="flex items-center gap-2 p-2 rounded-md bg-muted/30"
              >
                <factor.icon className={cn(
                  "w-4 h-4 shrink-0",
                  factor.status === 'good' ? 'text-emerald-400' :
                  factor.status === 'warning' ? 'text-amber-400' :
                  factor.status === 'bad' ? 'text-red-400' :
                  'text-muted-foreground'
                )} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{factor.label}</p>
                  <p className="text-sm font-medium truncate">
                    {factor.value || '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="shrink-0">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">대출</p>
                <p className="font-semibold text-blue-400">{formatCurrency(totalLoanBalance)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">보증</p>
                <p className="font-semibold text-emerald-400">{formatCurrency(totalGuaranteeBalance)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">총 부채</p>
              <p className="text-xl font-bold">{formatCurrency(totalDebt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
