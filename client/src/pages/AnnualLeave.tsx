import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getLeaveRequests,
  getLeaveRequestsByUser,
  getLeaveRequestsByTeam,
  getLeaveRequestsByStatus,
  createLeaveRequest,
  approveLeaveByLeader,
  approveLeaveByAdmin,
  rejectLeaveRequest,
  deleteLeaveRequest,
  getLeaveSummary,
} from '@/lib/firestore';
import { fetchYearlyHolidays, isWeekend } from '@/lib/publicHolidays';
import type { LeaveRequest, LeaveType, LeaveStatus, LeaveSummary, InsertLeaveRequest } from '@shared/types';
import { cn } from '@/lib/utils';

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  full: '전일 (1.0일)',
  am: '오전 반차 (0.5일)',
  pm: '오후 반차 (0.5일)',
};

const LEAVE_TYPE_DAYS: Record<LeaveType, number> = {
  full: 1.0,
  am: 0.5,
  pm: 0.5,
};

const STATUS_LABELS: Record<LeaveStatus, string> = {
  pending_leader: '팀장 승인 대기',
  pending_admin: '총관리자 승인 대기',
  approved: '승인완료',
  rejected: '반려',
};

const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending_leader: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  pending_admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function AnnualLeave() {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [publicHolidays, setPublicHolidays] = useState<Map<string, string>>(new Map());
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummary | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [leaveType, setLeaveType] = useState<LeaveType>('full');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingRequest, setRejectingRequest] = useState<LeaveRequest | null>(null);

  const fetchData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const year = currentMonth.getFullYear();
      const [holidays, summary, myReqs] = await Promise.all([
        fetchYearlyHolidays(year),
        getLeaveSummary(user.uid),
        getLeaveRequestsByUser(user.uid),
      ]);

      setPublicHolidays(holidays);
      setLeaveSummary(summary);
      setMyRequests(myReqs);

      if (isSuperAdmin) {
        const [leaderPending, adminPending] = await Promise.all([
          getLeaveRequestsByStatus('pending_leader'),
          getLeaveRequestsByStatus('pending_admin'),
        ]);
        setPendingRequests([...leaderPending, ...adminPending]);
        const all = await getLeaveRequests();
        setAllRequests(all);
      } else if (isTeamLeader && user.team_id) {
        const teamReqs = await getLeaveRequestsByTeam(user.team_id);
        const pending = teamReqs.filter(r => r.status === 'pending_leader');
        setPendingRequests(pending);
        setAllRequests(teamReqs);
      }
    } catch (error) {
      console.error('Error fetching leave data:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, currentMonth.getFullYear()]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    const startDayOfWeek = start.getDay();
    const prefixDays = Array(startDayOfWeek).fill(null);

    return [...prefixDays, ...days];
  }, [currentMonth]);

  const approvedLeaveDates = useMemo(() => {
    const dates = new Map<string, LeaveRequest[]>();
    [...myRequests, ...allRequests].forEach(req => {
      if (req.status === 'approved' || req.status === 'pending_leader' || req.status === 'pending_admin') {
        const existing = dates.get(req.leave_date) || [];
        if (!existing.find(r => r.id === req.id)) {
          dates.set(req.leave_date, [...existing, req]);
        }
      }
    });
    return dates;
  }, [myRequests, allRequests]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    if (isWeekend(date)) {
      toast({
        title: '주말 선택 불가',
        description: '주말에는 연차를 신청할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }
    
    if (publicHolidays.has(dateStr)) {
      toast({
        title: '공휴일 선택 불가',
        description: `${publicHolidays.get(dateStr)}은(는) 공휴일입니다.`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedDate(dateStr);
  };

  const handleSubmitRequest = async () => {
    if (!user || !selectedDate) return;
    
    if (!leaveSummary || leaveSummary.remainingLeave < LEAVE_TYPE_DAYS[leaveType]) {
      toast({
        title: '잔여 연차 부족',
        description: '신청 가능한 연차가 부족합니다.',
        variant: 'destructive',
      });
      return;
    }

    const alreadyRequested = myRequests.find(
      r => r.leave_date === selectedDate && r.status !== 'rejected'
    );
    if (alreadyRequested) {
      toast({
        title: '중복 신청',
        description: '해당 날짜에 이미 연차 신청이 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const requestData: InsertLeaveRequest = {
        user_id: user.uid,
        user_name: user.name,
        team_id: user.team_id,
        team_name: user.team_name,
        leave_date: selectedDate,
        leave_type: leaveType,
        leave_days: LEAVE_TYPE_DAYS[leaveType],
        reason: reason.trim() || '개인 사유',
        status: 'pending_leader',
      };

      await createLeaveRequest(requestData);
      
      toast({
        title: '신청 완료',
        description: '연차 신청이 접수되었습니다. 팀장 승인을 기다려주세요.',
      });

      setSelectedDate('');
      setReason('');
      setLeaveType('full');
      await fetchData();
    } catch (error) {
      console.error('Error creating leave request:', error);
      toast({
        title: '오류',
        description: '연차 신청 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (request: LeaveRequest) => {
    if (!user) return;

    try {
      if (request.status === 'pending_leader' && (isTeamLeader || isSuperAdmin)) {
        await approveLeaveByLeader(request.id, user.uid, user.name);
        toast({
          title: '1차 승인 완료',
          description: '총관리자 승인을 기다립니다.',
        });
      } else if (request.status === 'pending_admin' && isSuperAdmin) {
        await approveLeaveByAdmin(
          request.id,
          user.uid,
          user.name,
          request.user_id,
          request.leave_days
        );
        toast({
          title: '최종 승인 완료',
          description: '연차가 최종 승인되어 사용 연차에 반영되었습니다.',
        });
      }
      await fetchData();
    } catch (error) {
      console.error('Error approving leave:', error);
      toast({
        title: '오류',
        description: '승인 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleRejectClick = (request: LeaveRequest) => {
    setRejectingRequest(request);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!user || !rejectingRequest || !rejectReason.trim()) {
      toast({
        title: '반려 사유 필요',
        description: '반려 사유를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await rejectLeaveRequest(
        rejectingRequest.id,
        user.uid,
        user.name,
        rejectReason.trim()
      );
      toast({
        title: '반려 완료',
        description: '연차 신청이 반려되었습니다.',
      });
      setRejectDialogOpen(false);
      setRejectingRequest(null);
      await fetchData();
    } catch (error) {
      console.error('Error rejecting leave:', error);
      toast({
        title: '오류',
        description: '반려 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleCancelRequest = async (request: LeaveRequest) => {
    try {
      await deleteLeaveRequest(request.id);
      toast({
        title: '취소 완료',
        description: '연차 신청이 취소되었습니다.',
      });
      await fetchData();
    } catch (error) {
      console.error('Error canceling leave:', error);
      toast({
        title: '오류',
        description: '취소 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">연차 관리</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">총 연차</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-leave">
                {leaveSummary?.totalLeave ?? 15}일
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">사용 연차</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-used-leave">
                {leaveSummary?.usedLeave ?? 0}일
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">잔여 연차</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary" data-testid="text-remaining-leave">
                {leaveSummary?.remainingLeave ?? 15}일
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">승인 대기</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">
                {leaveSummary?.pendingCount ?? 0}건
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-center pb-2">
              <div className="flex items-center bg-muted/50 rounded-lg border">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevMonth}
                  className="rounded-l-lg rounded-r-none border-r"
                  data-testid="button-prev-month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="px-6 py-2 min-w-[180px] text-center font-medium select-none">
                  {format(currentMonth, 'yyyy년 M월', { locale: ko })}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextMonth}
                  className="rounded-r-lg rounded-l-none border-l"
                  data-testid="button-next-month"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                  <div
                    key={day}
                    className={cn(
                      'text-center text-sm font-medium py-2',
                      i === 0 && 'text-red-500',
                      i === 6 && 'text-blue-500'
                    )}
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="h-16" />;
                  }

                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isHoliday = publicHolidays.has(dateStr);
                  const holidayName = publicHolidays.get(dateStr);
                  const isWeekendDay = isWeekend(date);
                  const dayOfWeek = date.getDay();
                  const isSelected = selectedDate === dateStr;
                  const leaveOnDate = approvedLeaveDates.get(dateStr);

                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleDateClick(date)}
                      disabled={isWeekendDay || isHoliday}
                      className={cn(
                        'h-16 p-1 rounded-md border text-left relative transition-colors',
                        !isSameMonth(date, currentMonth) && 'opacity-50',
                        isToday(date) && 'border-primary border-2',
                        isSelected && 'bg-primary/20 border-primary',
                        isHoliday && 'bg-red-50 dark:bg-red-950/30',
                        isWeekendDay && !isHoliday && 'bg-muted/50',
                        !isWeekendDay && !isHoliday && 'hover:bg-muted cursor-pointer',
                        (isWeekendDay || isHoliday) && 'cursor-not-allowed'
                      )}
                      data-testid={`calendar-day-${dateStr}`}
                    >
                      <span
                        className={cn(
                          'text-sm font-medium',
                          dayOfWeek === 0 && 'text-red-500',
                          dayOfWeek === 6 && 'text-blue-500',
                          isHoliday && 'text-red-500'
                        )}
                      >
                        {format(date, 'd')}
                      </span>
                      {isHoliday && (
                        <div className="text-[10px] text-red-500 truncate">
                          {holidayName}
                        </div>
                      )}
                      {leaveOnDate && leaveOnDate.length > 0 && (
                        <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 flex-wrap">
                          {leaveOnDate.slice(0, 2).map(req => (
                            <div
                              key={req.id}
                              className={cn(
                                'h-1.5 flex-1 rounded-full',
                                req.status === 'approved' && 'bg-green-500',
                                req.status === 'pending_leader' && 'bg-yellow-500',
                                req.status === 'pending_admin' && 'bg-blue-500'
                              )}
                              title={`${req.user_name}: ${STATUS_LABELS[req.status]}`}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span>승인완료</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <span>팀장 대기</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span>총관리자 대기</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-red-100 dark:bg-red-950" />
                  <span>공휴일</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>연차 신청</CardTitle>
              <CardDescription>원하는 날짜를 달력에서 클릭하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>선택된 날짜</Label>
                <Input
                  value={selectedDate ? format(parseISO(selectedDate), 'yyyy년 M월 d일 (E)', { locale: ko }) : ''}
                  placeholder="달력에서 날짜를 선택하세요"
                  readOnly
                  data-testid="input-selected-date"
                />
              </div>
              <div className="space-y-2">
                <Label>연차 유형</Label>
                <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                  <SelectTrigger data-testid="select-leave-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">전일 (1.0일)</SelectItem>
                    <SelectItem value="am">오전 반차 (0.5일)</SelectItem>
                    <SelectItem value="pm">오후 반차 (0.5일)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>사유 (선택)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="연차 사유를 입력하세요"
                  rows={3}
                  data-testid="textarea-reason"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSubmitRequest}
                disabled={!selectedDate || isSubmitting}
                data-testid="button-submit-leave"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    신청 중...
                  </>
                ) : (
                  '연차 신청'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="my-requests" className="w-full">
          <TabsList>
            <TabsTrigger value="my-requests" data-testid="tab-my-requests">내 신청 내역</TabsTrigger>
            {(isTeamLeader || isSuperAdmin) && (
              <TabsTrigger value="pending-approval" data-testid="tab-pending-approval">
                승인 대기 
                {pendingRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="all-requests" data-testid="tab-all-requests">전체 내역</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="my-requests">
            <Card>
              <CardContent className="pt-6">
                {myRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    신청 내역이 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>신청일</TableHead>
                        <TableHead>사용일</TableHead>
                        <TableHead>유형</TableHead>
                        <TableHead>사유</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead>작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myRequests.map(req => (
                        <TableRow key={req.id}>
                          <TableCell>{format(req.created_at, 'yyyy-MM-dd')}</TableCell>
                          <TableCell>{req.leave_date}</TableCell>
                          <TableCell>{LEAVE_TYPE_LABELS[req.leave_type]}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[req.status]}>
                              {STATUS_LABELS[req.status]}
                            </Badge>
                            {req.rejected_reason && (
                              <div className="text-xs text-red-500 mt-1">
                                사유: {req.rejected_reason}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {(req.status === 'pending_leader' || req.status === 'pending_admin') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCancelRequest(req)}
                                data-testid={`button-cancel-${req.id}`}
                              >
                                취소
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {(isTeamLeader || isSuperAdmin) && (
            <TabsContent value="pending-approval">
              <Card>
                <CardContent className="pt-6">
                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      승인 대기 중인 신청이 없습니다.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>신청자</TableHead>
                          <TableHead>팀</TableHead>
                          <TableHead>사용일</TableHead>
                          <TableHead>유형</TableHead>
                          <TableHead>사유</TableHead>
                          <TableHead>상태</TableHead>
                          <TableHead>작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRequests.map(req => {
                          const canApprove = 
                            (req.status === 'pending_leader' && (isTeamLeader || isSuperAdmin)) ||
                            (req.status === 'pending_admin' && isSuperAdmin);

                          return (
                            <TableRow key={req.id}>
                              <TableCell>{req.user_name}</TableCell>
                              <TableCell>{req.team_name || '-'}</TableCell>
                              <TableCell>{req.leave_date}</TableCell>
                              <TableCell>{LEAVE_TYPE_LABELS[req.leave_type]}</TableCell>
                              <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                              <TableCell>
                                <Badge className={STATUS_COLORS[req.status]}>
                                  {STATUS_LABELS[req.status]}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {canApprove && (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleApprove(req)}
                                      className="text-green-600"
                                      data-testid={`button-approve-${req.id}`}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      승인
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRejectClick(req)}
                                      className="text-red-600"
                                      data-testid={`button-reject-${req.id}`}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      반려
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="all-requests">
              <Card>
                <CardContent className="pt-6">
                  {allRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      신청 내역이 없습니다.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>신청자</TableHead>
                          <TableHead>팀</TableHead>
                          <TableHead>사용일</TableHead>
                          <TableHead>유형</TableHead>
                          <TableHead>상태</TableHead>
                          <TableHead>1차 승인</TableHead>
                          <TableHead>최종 승인</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allRequests.map(req => (
                          <TableRow key={req.id}>
                            <TableCell>{req.user_name}</TableCell>
                            <TableCell>{req.team_name || '-'}</TableCell>
                            <TableCell>{req.leave_date}</TableCell>
                            <TableCell>{LEAVE_TYPE_LABELS[req.leave_type]}</TableCell>
                            <TableCell>
                              <Badge className={STATUS_COLORS[req.status]}>
                                {STATUS_LABELS[req.status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {req.leader_approved_name && (
                                <div className="text-sm">
                                  {req.leader_approved_name}
                                  <div className="text-xs text-muted-foreground">
                                    {req.leader_approved_at && format(req.leader_approved_at, 'MM/dd HH:mm')}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {req.admin_approved_name && (
                                <div className="text-sm">
                                  {req.admin_approved_name}
                                  <div className="text-xs text-muted-foreground">
                                    {req.admin_approved_at && format(req.admin_approved_at, 'MM/dd HH:mm')}
                                  </div>
                                </div>
                              )}
                              {req.rejected_name && (
                                <div className="text-sm text-red-500">
                                  {req.rejected_name} (반려)
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>연차 신청 반려</DialogTitle>
              <DialogDescription>
                {rejectingRequest?.user_name}님의 {rejectingRequest?.leave_date} 연차 신청을 반려합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>반려 사유 (필수)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="반려 사유를 입력하세요"
                  rows={3}
                  data-testid="textarea-reject-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                취소
              </Button>
              <Button variant="destructive" onClick={handleRejectConfirm} data-testid="button-confirm-reject">
                반려 확정
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}
