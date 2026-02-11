import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import type { Customer, User, Team } from '@shared/types';
import { format } from 'date-fns';

interface DataExportProps {
  customers: Customer[];
  users: User[];
  teams: Team[];
  isSuperAdmin: boolean;
}

export function DataExport({ customers, users, teams, isSuperAdmin }: DataExportProps) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const formatAmount = (amount: number | undefined): string => {
    if (!amount) return '';
    if (amount >= 10000) {
      return `${(amount / 10000).toFixed(2)}억원`;
    }
    return `${amount}만원`;
  };

  const getManagerName = (managerId: string): string => {
    const user = users.find(u => u.uid === managerId);
    return user?.name || '-';
  };

  const getTeamName = (teamId: string): string => {
    const team = teams.find(t => t.id === teamId);
    return team?.team_name || team?.name || '-';
  };

  const getProcessingOrgs = (customer: Customer) => {
    if (customer.processing_orgs && customer.processing_orgs.length > 0) {
      return customer.processing_orgs;
    }
    if (customer.processing_org && customer.processing_org !== '미등록') {
      return [{ org: customer.processing_org, status: '진행중' as const }];
    }
    return [];
  };

  const prepareCustomerData = () => {
    const rows: Record<string, string | number>[] = [];

    customers.forEach(customer => {
      const orgs = getProcessingOrgs(customer);

      const buildRow = (orgInfo?: { org: string; status: string; execution_date?: string; execution_amount?: number; is_re_execution?: boolean; applied_at?: string; approved_at?: string; rejected_at?: string }) => {
        const baseData: Record<string, string | number> = {
          '고객ID': customer.readable_id,
          '성함': customer.name,
          '상호명': customer.company_name,
          '연락처': customer.phone || '',
          '상태': customer.status_code,
          '담당자': customer.manager_name || getManagerName(customer.manager_id),
          '소속팀': customer.team_name || getTeamName(customer.team_id),
          '접수일자': customer.entry_date,
          '진행기관': orgInfo ? orgInfo.org : (customer.processing_org || '미등록'),
          '기관상태': orgInfo ? orgInfo.status : '',
          '집행구분': orgInfo ? (orgInfo.is_re_execution ? '재집행' : '최초집행') : '',
          '기관접수일': orgInfo?.applied_at || '',
          '기관승인일': orgInfo?.approved_at || '',
          '기관부결일': orgInfo?.rejected_at || '',
          '기관집행일': orgInfo?.execution_date || '',
          '기관집행금액(만원)': orgInfo?.execution_amount || '',
          '사업자등록번호': customer.business_registration_number || '',
          '설립일': customer.founding_date || '',
          '업종': customer.business_type || '',
          '종목': customer.business_item || '',
          '유입경로': customer.entry_source || '',
          '사업장주소': customer.business_address || '',
          '신용점수': customer.credit_score || '',
          '통신사': customer.carrier || '',
          '자택주소': [customer.home_address, customer.home_address_detail].filter(Boolean).join(' ') || '',
          '최근메모': customer.recent_memo || customer.latest_memo || '',
        };

        if (isSuperAdmin) {
          baseData['수수료율(%)'] = customer.commission_rate || 0;
          baseData['계약금(만원)'] = customer.contract_amount || 0;
          baseData['집행금액(만원)'] = customer.execution_amount || 0;
          baseData['승인금액(만원)'] = customer.approved_amount || 0;
        }

        return baseData;
      };

      if (orgs.length <= 1) {
        rows.push(buildRow(orgs[0]));
      } else {
        orgs.forEach(org => {
          rows.push(buildRow(org));
        });
      }
    });

    return rows;
  };

  const prepareStatisticsData = () => {
    const statusCounts: Record<string, number> = {};
    const teamCounts: Record<string, number> = {};
    const managerCounts: Record<string, number> = {};

    customers.forEach(customer => {
      statusCounts[customer.status_code] = (statusCounts[customer.status_code] || 0) + 1;
      
      const teamName = customer.team_name || getTeamName(customer.team_id);
      teamCounts[teamName] = (teamCounts[teamName] || 0) + 1;
      
      const managerName = customer.manager_name || getManagerName(customer.manager_id);
      managerCounts[managerName] = (managerCounts[managerName] || 0) + 1;
    });

    const statusStats = Object.entries(statusCounts).map(([status, count]) => ({
      '구분': '상태별',
      '항목': status,
      '건수': count,
      '비율(%)': ((count / customers.length) * 100).toFixed(1),
    }));

    const teamStats = Object.entries(teamCounts).map(([team, count]) => ({
      '구분': '팀별',
      '항목': team,
      '건수': count,
      '비율(%)': ((count / customers.length) * 100).toFixed(1),
    }));

    const managerStats = Object.entries(managerCounts).map(([manager, count]) => ({
      '구분': '담당자별',
      '항목': manager,
      '건수': count,
      '비율(%)': ((count / customers.length) * 100).toFixed(1),
    }));

    return [...statusStats, ...teamStats, ...managerStats];
  };

  const exportToExcel = async (type: 'customers' | 'statistics' | 'all') => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');

      if (type === 'customers' || type === 'all') {
        const customerData = prepareCustomerData();
        const ws = XLSX.utils.json_to_sheet(customerData);
        
        const colWidths = [
          { wch: 12 },  // 고객ID
          { wch: 10 },  // 성함
          { wch: 20 },  // 상호명
          { wch: 15 },  // 연락처
          { wch: 12 },  // 상태
          { wch: 10 },  // 담당자
          { wch: 12 },  // 소속팀
          { wch: 12 },  // 접수일자
          { wch: 10 },  // 진행기관
          { wch: 10 },  // 기관상태
          { wch: 10 },  // 집행구분
          { wch: 12 },  // 기관접수일
          { wch: 12 },  // 기관승인일
          { wch: 12 },  // 기관부결일
          { wch: 12 },  // 기관집행일
          { wch: 15 },  // 기관집행금액
          { wch: 15 },  // 사업자등록번호
          { wch: 12 },  // 설립일
          { wch: 15 },  // 업종
          { wch: 15 },  // 종목
          { wch: 10 },  // 유입경로
          { wch: 30 },  // 사업장주소
          { wch: 10 },  // 신용점수
          { wch: 10 },  // 통신사
          { wch: 30 },  // 자택주소
          { wch: 40 },  // 최근메모
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, '고객리스트');
      }

      if (type === 'statistics' || type === 'all') {
        const statsData = prepareStatisticsData();
        const ws = XLSX.utils.json_to_sheet(statsData);
        
        ws['!cols'] = [
          { wch: 12 },
          { wch: 20 },
          { wch: 10 },
          { wch: 10 },
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, '통계');
      }

      const fileName = type === 'all' 
        ? `CRM_전체_${timestamp}.xlsx`
        : type === 'customers'
        ? `CRM_고객리스트_${timestamp}.xlsx`
        : `CRM_통계_${timestamp}.xlsx`;

      XLSX.writeFile(wb, fileName);

      toast({
        title: '내보내기 완료',
        description: `${fileName} 파일이 다운로드되었습니다.`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: '오류',
        description: '데이터 내보내기 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = async (type: 'customers' | 'statistics') => {
    setExporting(true);
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      let data: Record<string, string | number>[];
      let fileName: string;

      if (type === 'customers') {
        data = prepareCustomerData();
        fileName = `CRM_고객리스트_${timestamp}.csv`;
      } else {
        data = prepareStatisticsData();
        fileName = `CRM_통계_${timestamp}.csv`;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(ws);
      
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: '내보내기 완료',
        description: `${fileName} 파일이 다운로드되었습니다.`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: '오류',
        description: '데이터 내보내기 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={exporting || customers.length === 0}
          className="border-border"
          data-testid="button-export-data"
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting ? '내보내는 중...' : '내보내기'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover border-border">
        <DropdownMenuItem
          onClick={() => exportToExcel('customers')}
          className="cursor-pointer"
          data-testid="menu-export-excel-customers"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
          고객 리스트 (Excel)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportToExcel('statistics')}
          className="cursor-pointer"
          data-testid="menu-export-excel-statistics"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
          통계 (Excel)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportToExcel('all')}
          className="cursor-pointer"
          data-testid="menu-export-excel-all"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
          전체 (Excel)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => exportToCSV('customers')}
          className="cursor-pointer"
          data-testid="menu-export-csv-customers"
        >
          <FileText className="w-4 h-4 mr-2 text-blue-600" />
          고객 리스트 (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportToCSV('statistics')}
          className="cursor-pointer"
          data-testid="menu-export-csv-statistics"
        >
          <FileText className="w-4 h-4 mr-2 text-blue-600" />
          통계 (CSV)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
