import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
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

export function ReviewSummaryTab({ customer, obligations, creditSummary }: ReviewSummaryTabProps) {
  const institutionBreakdown = useMemo(() => {
    const breakdown = new Map<string, number>();
    
    obligations.forEach(ob => {
      const current = breakdown.get(ob.institution) || 0;
      breakdown.set(ob.institution, current + ob.balance);
    });
    
    return Array.from(breakdown.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [obligations]);

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

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto">
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

      <Card className="flex-1 min-h-[250px]">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            금융기관별 부채 비중
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-4 px-4 h-[calc(100%-52px)]">
          {institutionBreakdown.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              등록된 금융 내역이 없습니다
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={institutionBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => 
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                  labelLine={false}
                >
                  {institutionBreakdown.map((_, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CHART_COLORS[index % CHART_COLORS.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs text-foreground">{value}</span>
                  )}
                />
              </PieChart>
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
