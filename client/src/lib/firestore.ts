// Firestore CRUD operations
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  limit,
  QueryConstraint,
} from 'firebase/firestore';
import { db, addCustomerHistoryLog } from './firebase';
import type {
  User,
  Team,
  Customer,
  StatusLog,
  Todo,
  Holiday,
  InsertCustomer,
  InsertTeam,
  InsertTodo,
  InsertHoliday,
  InsertStatusLog,
  StatusCode,
  CustomerHistoryLog,
  LoginHistory,
  TodoItem,
  InsertTodoItem,
  CounselingLog,
  SettlementItem,
  InsertSettlementItem,
  MonthlySettlementSummary,
  EntrySourceType,
  CommissionRates,
  Consultation,
  Expense,
  InsertExpense,
  ExpenseCategory,
  LeaveRequest,
  InsertLeaveRequest,
  LeaveStatus,
  LeaveSummary,
  ProcessingOrg,
  Contract,
  InsertContract,
  ContractStatus,
  PaymentRecord,
  PaymintState,
} from '@shared/types';
// STATUS_LABELS removed - using Korean status names directly

// Helper to convert Firestore timestamp to Date
const toDate = (timestamp: Timestamp | Date | string): Date => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date(timestamp);
};

// Generate readable ID: YYMMDD-XXX
const generateReadableId = async (): Promise<string> => {
  const now = new Date();
  const datePrefix = now.toISOString().slice(2, 10).replace(/-/g, '').slice(0, 6);
  
  // Get count of customers created today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const customersRef = collection(db, 'customers');
  const q = query(
    customersRef,
    where('created_at', '>=', Timestamp.fromDate(todayStart)),
    orderBy('created_at', 'desc'),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  let sequence = 1;
  
  if (!snapshot.empty) {
    const lastCustomer = snapshot.docs[0].data() as Customer;
    const lastId = lastCustomer.readable_id;
    if (lastId && lastId.startsWith(datePrefix)) {
      const lastSequence = parseInt(lastId.split('-')[1], 10);
      sequence = lastSequence + 1;
    }
  }
  
  return `${datePrefix}-${sequence.toString().padStart(3, '0')}`;
};

// Users
export const getUsers = async (): Promise<User[]> => {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(doc => doc.data() as User);
};

export const getUsersByTeam = async (teamId: string): Promise<User[]> => {
  const q = query(collection(db, 'users'), where('team_id', '==', teamId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as User);
};

export const updateUser = async (uid: string, data: Partial<User>): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), data);
};

export const updateCustomersTeamByManager = async (
  managerId: string,
  newTeamId: string,
  newTeamName: string
): Promise<number> => {
  const q = query(collection(db, 'customers'), where('manager_id', '==', managerId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  snapshot.docs.forEach(docSnap => {
    batch.update(doc(db, 'customers', docSnap.id), {
      team_id: newTeamId,
      team_name: newTeamName,
      updated_at: Timestamp.now(),
    });
  });
  await batch.commit();
  return snapshot.size;
};

export const updateSettlementsTeamByManager = async (
  managerId: string,
  newTeamId: string,
  newTeamName: string
): Promise<number> => {
  const q = query(collection(db, 'settlements'), where('manager_id', '==', managerId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  snapshot.docs.forEach(docSnap => {
    batch.update(doc(db, 'settlements', docSnap.id), {
      team_id: newTeamId,
      team_name: newTeamName,
    });
  });
  await batch.commit();
  return snapshot.size;
};

// 로그인 이력 업데이트 (최근 5개 유지)
export const updateLoginHistory = async (
  userDocId: string,
  ip: string,
  existingHistory: LoginHistory[] = []
): Promise<void> => {
  const newEntry: LoginHistory = {
    ip,
    logged_at: new Date(),
  };
  
  // 기존 이력에 새 항목 추가 후 최근 5개만 유지
  const updatedHistory = [newEntry, ...existingHistory].slice(0, 5);
  
  await updateDoc(doc(db, 'users', userDocId), {
    current_ip: ip,
    last_login_at: Timestamp.now(),
    login_history: updatedHistory.map(h => ({
      ...h,
      logged_at: h.logged_at instanceof Date ? Timestamp.fromDate(h.logged_at) : h.logged_at,
    })),
  });
};

// Teams
export const getTeams = async (): Promise<Team[]> => {
  const snapshot = await getDocs(collection(db, 'teams'));
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      team_id: data.team_id || docSnap.id,
      team_name: data.team_name || data.name || '',
      name: data.name || data.team_name || '',
      created_at: toDate(data.created_at),
    } as Team;
  });
};

export const createTeam = async (team: InsertTeam): Promise<Team> => {
  const docRef = await addDoc(collection(db, 'teams'), {
    ...team,
    created_at: Timestamp.now(),
  });
  return {
    id: docRef.id,
    team_id: docRef.id,
    team_name: team.team_name,
    name: team.name,
    created_at: new Date(),
  };
};

export const updateTeam = async (id: string, data: Partial<Team>): Promise<void> => {
  await updateDoc(doc(db, 'teams', id), data);
  
  // If team name changed, update all users and customers in this team
  if (data.name) {
    const batch = writeBatch(db);
    
    // Update users
    const usersQuery = query(collection(db, 'users'), where('team_id', '==', id));
    const usersSnapshot = await getDocs(usersQuery);
    usersSnapshot.docs.forEach(userDoc => {
      batch.update(doc(db, 'users', userDoc.id), { team_name: data.name });
    });
    
    // Update customers
    const customersQuery = query(collection(db, 'customers'), where('team_id', '==', id));
    const customersSnapshot = await getDocs(customersQuery);
    customersSnapshot.docs.forEach(customerDoc => {
      batch.update(doc(db, 'customers', customerDoc.id), { team_name: data.name });
    });
    
    await batch.commit();
  }
};

export const deleteTeam = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'teams', id));
};

// Customers
// 고객 ID 단건 조회
export const getCustomerById = async (id: string): Promise<Customer | null> => {
  try {
    const snap = await getDoc(doc(db, 'customers', id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      ...data,
      id: snap.id,
      created_at: toDate(data.created_at),
      updated_at: data.updated_at ? toDate(data.updated_at) : toDate(data.created_at),
      daily_no: data.daily_no || null,
    } as Customer;
  } catch (err) {
    console.error('getCustomerById error:', err);
    return null;
  }
};

export const getCustomers = async (): Promise<Customer[]> => {
  // created_at 기준 내림차순 정렬 (최근 생성순 - 관리적 변경 시 순서 유지)
  const q = query(collection(db, 'customers'), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      created_at: toDate(data.created_at),
      updated_at: data.updated_at ? toDate(data.updated_at) : toDate(data.created_at),
      daily_no: data.daily_no || null,
    } as Customer;
  });
};

export const getCustomersSince = async (sinceDate: Date): Promise<Customer[]> => {
  const q = query(
    collection(db, 'customers'),
    where('created_at', '>=', Timestamp.fromDate(sinceDate)),
    orderBy('created_at', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      created_at: toDate(data.created_at),
      updated_at: data.updated_at ? toDate(data.updated_at) : toDate(data.created_at),
      daily_no: data.daily_no || null,
    } as Customer;
  });
};

export const getCustomersByManager = async (managerId: string): Promise<Customer[]> => {
  try {
    const q = query(
      collection(db, 'customers'),
      where('manager_id', '==', managerId),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        created_at: toDate(data.created_at),
        updated_at: data.updated_at ? toDate(data.updated_at) : toDate(data.created_at),
        daily_no: data.daily_no || null,
      } as Customer;
    });
  } catch (error: any) {
    if (error?.message?.includes('requires an index')) {
      console.warn('[Firestore] manager_id+created_at 복합 인덱스 미생성 - orderBy 없이 조회 후 클라이언트 정렬');
      const q = query(
        collection(db, 'customers'),
        where('manager_id', '==', managerId)
      );
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          created_at: toDate(data.created_at),
          updated_at: data.updated_at ? toDate(data.updated_at) : toDate(data.created_at),
          daily_no: data.daily_no || null,
        } as Customer;
      });
      return results.sort((a, b) => {
        const aTime = a.created_at instanceof Date ? a.created_at.getTime() : 0;
        const bTime = b.created_at instanceof Date ? b.created_at.getTime() : 0;
        return bTime - aTime;
      });
    }
    throw error;
  }
};

export const getCustomersByTeam = async (teamId: string): Promise<Customer[]> => {
  try {
    const q = query(
      collection(db, 'customers'),
      where('team_id', '==', teamId),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        created_at: toDate(data.created_at),
        updated_at: data.updated_at ? toDate(data.updated_at) : toDate(data.created_at),
        daily_no: data.daily_no || null,
      } as Customer;
    });
  } catch (error: any) {
    if (error?.message?.includes('requires an index')) {
      console.warn('[Firestore] team_id+created_at 복합 인덱스 미생성 - orderBy 없이 조회 후 클라이언트 정렬');
      const q = query(
        collection(db, 'customers'),
        where('team_id', '==', teamId)
      );
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          created_at: toDate(data.created_at),
          updated_at: data.updated_at ? toDate(data.updated_at) : toDate(data.created_at),
          daily_no: data.daily_no || null,
        } as Customer;
      });
      return results.sort((a, b) => {
        const aTime = a.created_at instanceof Date ? a.created_at.getTime() : 0;
        const bTime = b.created_at instanceof Date ? b.created_at.getTime() : 0;
        return bTime - aTime;
      });
    }
    throw error;
  }
};

// 당일 일련번호 채번 함수
const generateDailyNo = async (): Promise<number> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  // 오늘 등록된 모든 고객 수 조회 (사원 구분 없이 전체)
  const customersRef = collection(db, 'customers');
  const q = query(
    customersRef,
    where('created_at', '>=', Timestamp.fromDate(todayStart)),
    where('created_at', '<', Timestamp.fromDate(todayEnd))
  );
  
  const snapshot = await getDocs(q);
  return snapshot.size + 1; // 전체 등록 수 + 1
};

export const createCustomer = async (customer: InsertCustomer): Promise<Customer> => {
  const readable_id = await generateReadableId();
  const daily_no = await generateDailyNo();
  const now = Timestamp.now();
  
  const docRef = await addDoc(collection(db, 'customers'), {
    ...customer,
    readable_id,
    daily_no,
    created_at: now,
    updated_at: now, // 수정일자 필드 추가
  });
  return {
    id: docRef.id,
    readable_id,
    daily_no,
    ...customer,
    created_at: new Date(),
    updated_at: new Date(),
  };
};

export const updateCustomer = async (id: string, data: Partial<Customer>): Promise<void> => {
  try {
    // Remove undefined values which Firestore doesn't accept
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    // 자동으로 updated_at 갱신
    const dataWithTimestamp = {
      ...cleanData,
      updated_at: Timestamp.now(),
    };
    console.log('🔄 Firestore updateDoc called:', id, dataWithTimestamp);
    await updateDoc(doc(db, 'customers', id), dataWithTimestamp);
    console.log('✅ Firestore updateDoc success');
  } catch (error: any) {
    console.error('❌ Firestore updateDoc error:', error?.message || error?.code || error);
    throw error;
  }
};

export const deleteCustomer = async (id: string): Promise<void> => {
  // 1. 해당 고객의 정산 항목 삭제
  const settlementsQuery = query(
    collection(db, 'settlements'),
    where('customer_id', '==', id)
  );
  const settlementsSnapshot = await getDocs(settlementsQuery);
  const deletePromises = settlementsSnapshot.docs.map(docSnap => 
    deleteDoc(doc(db, 'settlements', docSnap.id))
  );
  await Promise.all(deletePromises);
  console.log(`[Delete Customer] 정산 ${settlementsSnapshot.docs.length}건 삭제: ${id}`);
  
  // 2. 고객 문서 삭제
  await deleteDoc(doc(db, 'customers', id));
};

// Status change with logging
export const updateCustomerStatus = async (
  customerId: string,
  previousStatus: StatusCode,
  newStatus: StatusCode,
  userId: string,
  userName: string
): Promise<void> => {
  const batch = writeBatch(db);
  
  // Update customer status
  const contractStatuses = ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)'];
  batch.update(doc(db, 'customers', customerId), { 
    status_code: newStatus,
    updated_at: Timestamp.now(),
    // If reaching contract completion for the first time (한글 상태명)
    ...(contractStatuses.includes(newStatus) && { 
      contract_completion_date: new Date().toISOString().split('T')[0],
      deposit_paid_date: new Date().toISOString().split('T')[0],
    })
  });
  
  // Create status log
  const logRef = doc(collection(db, 'status_logs'));
  batch.set(logRef, {
    customer_id: customerId,
    previous_status: previousStatus,
    new_status: newStatus,
    changed_by_user_id: userId,
    changed_by_user_name: userName,
    changed_at: Timestamp.now(),
  });
  
  await batch.commit();
  
  // Add customer history log for audit trail
  try {
    // 한글 상태명을 그대로 사용
    await addCustomerHistoryLog({
      customer_id: customerId,
      action_type: 'status_change',
      description: `상태 변경: ${previousStatus} → ${newStatus}`,
      changed_by: userId,
      changed_by_name: userName,
      old_value: previousStatus,
      new_value: newStatus,
    });
  } catch (error) {
    console.error('Error adding history log:', error);
  }
};

// Update customer manager with history log and sync settlements
export const updateCustomerManager = async (
  customerId: string,
  previousManagerId: string,
  previousManagerName: string,
  newManagerId: string,
  newManagerName: string,
  changedByUserId: string,
  changedByUserName: string,
  newTeamId?: string,
  newTeamName?: string
): Promise<void> => {
  const batch = writeBatch(db);
  
  // Update customer manager
  const customerRef = doc(db, 'customers', customerId);
  const customerUpdate: Record<string, any> = {
    manager_id: newManagerId,
    manager_name: newManagerName,
  };
  if (newTeamId !== undefined) {
    customerUpdate.team_id = newTeamId;
  }
  if (newTeamName !== undefined) {
    customerUpdate.team_name = newTeamName;
  }
  batch.update(customerRef, customerUpdate);
  
  // Sync settlements - update manager info for this customer's settlements
  try {
    const settlementsQuery = query(
      collection(db, 'settlements'),
      where('customer_id', '==', customerId)
    );
    const settlementsSnapshot = await getDocs(settlementsQuery);
    
    settlementsSnapshot.docs.forEach(docSnap => {
      const settlementUpdate: Record<string, any> = {
        manager_id: newManagerId,
        manager_name: newManagerName,
      };
      if (newTeamId !== undefined) {
        settlementUpdate.team_id = newTeamId;
      }
      if (newTeamName !== undefined) {
        settlementUpdate.team_name = newTeamName;
      }
      batch.update(docSnap.ref, settlementUpdate);
    });
    
    console.log(`Syncing ${settlementsSnapshot.size} settlements for customer ${customerId}`);
  } catch (error) {
    console.error('Error syncing settlements:', error);
  }
  
  await batch.commit();
  
  // Add customer history log for audit trail
  try {
    await addCustomerHistoryLog({
      customer_id: customerId,
      action_type: 'manager_change',
      description: `담당자 변경: ${previousManagerName || '없음'} → ${newManagerName}`,
      changed_by: changedByUserId,
      changed_by_name: changedByUserName,
      old_value: previousManagerName || '없음',
      new_value: newManagerName,
    });
  } catch (error) {
    console.error('Error adding history log:', error);
  }
};

// Status Logs
export const getStatusLogs = async (customerId?: string): Promise<StatusLog[]> => {
  let q;
  if (customerId) {
    q = query(
      collection(db, 'status_logs'),
      where('customer_id', '==', customerId),
      orderBy('changed_at', 'desc')
    );
  } else {
    q = query(collection(db, 'status_logs'), orderBy('changed_at', 'desc'), limit(100));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    changed_at: toDate(doc.data().changed_at),
  } as StatusLog));
};

// Get contract status logs for a specific month (optimized for KPI calculation)
export const getContractLogsForMonth = async (year: number, month: number): Promise<StatusLog[]> => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  const contractStatuses = ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)'];
  
  const q = query(
    collection(db, 'status_logs'),
    where('changed_at', '>=', Timestamp.fromDate(startDate)),
    where('changed_at', '<=', Timestamp.fromDate(endDate)),
    orderBy('changed_at', 'desc')
  );
  
  const snapshot = await getDocs(q);
  const logs = snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    changed_at: toDate(doc.data().changed_at),
  } as StatusLog));
  
  return logs.filter(log => contractStatuses.includes(log.new_status));
};

// Todos
export const getTodos = async (): Promise<Todo[]> => {
  const q = query(collection(db, 'todos'), orderBy('due_date', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate(doc.data().created_at),
  } as Todo));
};

export const getTodosByUser = async (userId: string): Promise<Todo[]> => {
  const q = query(
    collection(db, 'todos'),
    where('assigned_to', '==', userId),
    orderBy('due_date', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate(doc.data().created_at),
  } as Todo));
};

export const getTodosByTeam = async (teamId: string): Promise<Todo[]> => {
  // First get all users in the team
  const users = await getUsersByTeam(teamId);
  const userIds = users.map(u => u.uid);
  
  if (userIds.length === 0) return [];
  
  const q = query(
    collection(db, 'todos'),
    where('assigned_to', 'in', userIds),
    orderBy('due_date', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate(doc.data().created_at),
  } as Todo));
};

export const createTodo = async (todo: InsertTodo): Promise<Todo> => {
  const docRef = await addDoc(collection(db, 'todos'), {
    ...todo,
    created_at: Timestamp.now(),
  });
  return {
    id: docRef.id,
    ...todo,
    created_at: new Date(),
  };
};

export const updateTodo = async (id: string, data: Partial<Todo>): Promise<void> => {
  await updateDoc(doc(db, 'todos', id), data);
};

export const deleteTodo = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'todos', id));
};

// Holidays
export const getHolidays = async (): Promise<Holiday[]> => {
  const snapshot = await getDocs(collection(db, 'holidays'));
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
  } as Holiday));
};

export const createHoliday = async (holiday: InsertHoliday): Promise<Holiday> => {
  const id = holiday.date; // Use date as ID
  await addDoc(collection(db, 'holidays'), {
    ...holiday,
    id,
  });
  return { id, ...holiday };
};

export const deleteHoliday = async (id: string): Promise<void> => {
  // Find and delete by date
  const q = query(collection(db, 'holidays'), where('date', '==', id));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
};

// DEV ONLY: Promote user to super_admin
export const promoteToAdmin = async (uid: string): Promise<void> => {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { role: 'super_admin' });
};

// ============================================
// 담당자 자동배정 시스템 (라운드로빈)
// ============================================

// 오늘 승인된 연차가 있는 직원 ID 목록 조회
export const getTodayApprovedLeaveUserIds = async (): Promise<Set<string>> => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const q = query(
    collection(db, 'leave_requests'),
    where('leave_date', '==', todayStr),
    where('status', '==', 'approved')
  );
  const snapshot = await getDocs(q);
  
  const now = today.getHours();
  const userIds = new Set<string>();
  
  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const leaveType = data.leave_type;
    const minutes = today.getMinutes();
    const currentTime = now * 60 + minutes;
    const halfDayCutoff = 13 * 60 + 30;
    if (leaveType === 'full') {
      userIds.add(data.user_id);
    } else if (leaveType === 'am' && currentTime < halfDayCutoff) {
      userIds.add(data.user_id);
    } else if (leaveType === 'pm' && currentTime >= halfDayCutoff) {
      userIds.add(data.user_id);
    }
  });
  
  return userIds;
};

// 배정 가능한 활성 직원 목록 조회 (재직 상태만)
export const getActiveStaffForAssignment = async (): Promise<User[]> => {
  const snapshot = await getDocs(collection(db, 'users'));
  const allUsers = snapshot.docs.map(docSnap => ({
    ...docSnap.data(),
    uid: docSnap.data().uid || docSnap.id,
  } as User));
  
  const onLeaveUserIds = await getTodayApprovedLeaveUserIds();
  
  console.log('[StaffAssignment] 전체 직원 수:', allUsers.length, '명단:', allUsers.map(u => `${u.name}(uid=${u.uid}, status=${u.status}, db_dist=${(u as any).db_distribution_enabled})`));
  if (onLeaveUserIds.size > 0) {
    console.log('[StaffAssignment] 오늘 연차 직원:', [...onLeaveUserIds]);
  }
  
  const filtered = allUsers
    .filter(user => {
      if (user.status === '퇴사') {
        console.log(`[StaffAssignment] ${user.name} 제외: 퇴사`);
        return false;
      }
      if ((user as any).db_distribution_enabled === false) {
        console.log(`[StaffAssignment] ${user.name} 제외: DB분배 비활성화`);
        return false;
      }
      if (onLeaveUserIds.has(user.uid)) {
        console.log(`[StaffAssignment] ${user.name} 제외: 오늘 연차`);
        return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  
  console.log('[StaffAssignment] 필터 후 직원 수:', filtered.length, '명단:', filtered.map(u => u.name));
  return filtered;
};

// 마지막 배정 인덱스 조회
export const getLastAssignmentIndex = async (): Promise<number> => {
  const docRef = doc(db, 'meta', 'assignment_rotation');
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return docSnap.data().lastIndex || 0;
  }
  return 0;
};

// 마지막 배정 인덱스 업데이트
export const updateLastAssignmentIndex = async (index: number): Promise<void> => {
  const docRef = doc(db, 'meta', 'assignment_rotation');
  await setDoc(docRef, {
    lastIndex: index,
    updatedAt: Timestamp.now(),
  }, { merge: true });
};

// 특정 직원의 오늘 배정된 DB 수 조회
const getTodayAssignmentCount = async (managerId: string): Promise<number> => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const q = query(
    collection(db, 'customers'),
    where('manager_id', '==', managerId),
    where('entry_date', '==', todayStr)
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
};

// 다음 담당자 조회 및 배정 (라운드로빈 + 분배설정 반영)
export const getNextManagerForAssignment = async (): Promise<{ 
  managerId: string; 
  managerName: string; 
  managerPhone: string;
  teamId: string; 
  teamName: string;
} | null> => {
  const activeStaff = await getActiveStaffForAssignment();
  
  if (activeStaff.length === 0) {
    console.log('⚠️ 배정 가능한 활성 직원이 없습니다.');
    return null;
  }
  
  let lastIndex = await getLastAssignmentIndex();
  
  // 일일 한도를 초과하지 않은 직원을 찾을 때까지 순환
  for (let attempt = 0; attempt < activeStaff.length; attempt++) {
    const nextIndex = (lastIndex + 1 + attempt) % activeStaff.length;
    const candidate = activeStaff[nextIndex];
    
    const dailyLimit = (candidate as any).daily_db_limit || 0;
    if (dailyLimit > 0) {
      const todayCount = await getTodayAssignmentCount(candidate.uid);
      if (todayCount >= dailyLimit) {
        console.log(`⏭️ ${candidate.name}: 일일 한도 초과 (${todayCount}/${dailyLimit}), 건너뜀`);
        continue;
      }
    }
    
    await updateLastAssignmentIndex(nextIndex);
    console.log(`✅ 담당자 배정: ${candidate.name} (${nextIndex + 1}/${activeStaff.length}번째)`);
    
    return {
      managerId: candidate.uid,
      managerName: candidate.name,
      managerPhone: candidate.phone_work || candidate.phone || '',
      teamId: candidate.team_id || '',
      teamName: candidate.team_name || '미배정',
    };
  }
  
  console.log('⚠️ 모든 직원이 일일 한도를 초과했습니다.');
  return null;
};

// ============================================
// 인사/조직 관리 시스템 함수
// ============================================

// 모든 사용자 조회 (관리자용)
export const getAllUsers = async (): Promise<User[]> => {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(docSnap => ({
    ...docSnap.data(),
    uid: docSnap.data().uid || docSnap.id,
  } as User));
};

// 새 직원 등록 (화이트리스트 추가)
export const createUser = async (userData: {
  name: string;
  email: string;
  phone?: string;
  phone_work?: string;
  phone_personal?: string;
  ssn_front?: string;
  ssn_back?: string;
  address?: string;
  bank_name?: string;
  bank_account?: string;
  hire_date?: string;
  role: 'staff' | 'team_leader' | 'super_admin';
  team_id: string | null;
  team_name: string | null;
  totalLeave?: number;
  usedLeave?: number;
  commissionRates?: {
    teamOverride: number;
    ad: number;
    referral: number;
    reExecution: number;
    outsource: number;
  };
}): Promise<string> => {
  const docRef = await addDoc(collection(db, 'users'), {
    ...userData,
    uid: '', // 첫 로그인 시 Firebase uid 연결됨
    status: '재직',
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
  return docRef.id;
};

// 직원 정보 수정
export const updateUserInfo = async (
  docId: string,
  data: Partial<User>
): Promise<void> => {
  await updateDoc(doc(db, 'users', docId), {
    ...data,
    updated_at: Timestamp.now(),
  });
};

// 직원 삭제 (화이트리스트에서 제거 = 접속 차단)
export const deleteUser = async (docId: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', docId));
};

// 사용자 문서 ID로 조회 (이메일 기반)
export const getUserDocIdByEmail = async (email: string): Promise<string | null> => {
  const q = query(collection(db, 'users'), where('email', '==', email));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].id;
};

// 팀 생성 (관리자용)
export const createTeamAdmin = async (teamName: string): Promise<Team> => {
  const docRef = await addDoc(collection(db, 'teams'), {
    team_name: teamName,
    name: teamName,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
  
  // team_id를 문서 ID와 동일하게 업데이트
  await updateDoc(docRef, { team_id: docRef.id });
  
  return {
    id: docRef.id,
    team_id: docRef.id,
    team_name: teamName,
    name: teamName,
    created_at: new Date(),
  };
};

// 팀 삭제 (관리자용) - 소속 직원들의 team_id는 null로 처리
export const deleteTeamAdmin = async (teamId: string): Promise<void> => {
  const batch = writeBatch(db);
  
  // 해당 팀 소속 직원들의 team_id를 null로 변경
  const usersQuery = query(collection(db, 'users'), where('team_id', '==', teamId));
  const usersSnapshot = await getDocs(usersQuery);
  usersSnapshot.docs.forEach(userDoc => {
    batch.update(doc(db, 'users', userDoc.id), {
      team_id: null,
      team_name: null,
      updated_at: Timestamp.now(),
    });
  });
  
  // 팀 삭제
  batch.delete(doc(db, 'teams', teamId));
  
  await batch.commit();
};

// 팀 이름 수정 (관리자용)
export const updateTeamAdmin = async (teamId: string, newName: string): Promise<void> => {
  const batch = writeBatch(db);
  
  // 팀 이름 업데이트
  batch.update(doc(db, 'teams', teamId), {
    team_name: newName,
    name: newName,
    updated_at: Timestamp.now(),
  });
  
  // 해당 팀 소속 직원들의 team_name도 업데이트
  const usersQuery = query(collection(db, 'users'), where('team_id', '==', teamId));
  const usersSnapshot = await getDocs(usersQuery);
  usersSnapshot.docs.forEach(userDoc => {
    batch.update(doc(db, 'users', userDoc.id), {
      team_name: newName,
      updated_at: Timestamp.now(),
    });
  });
  
  // 해당 팀 고객들의 team_name도 업데이트 (관리성 변경이므로 updated_at 미갱신)
  const customersQuery = query(collection(db, 'customers'), where('team_id', '==', teamId));
  const customersSnapshot = await getDocs(customersQuery);
  customersSnapshot.docs.forEach(customerDoc => {
    batch.update(doc(db, 'customers', customerDoc.id), {
      team_name: newName,
    });
  });
  
  await batch.commit();
};

// ============================================
// TODO LIST (todo_list 컬렉션)
// ============================================

// 할 일 목록 조회 (전체)
export const getTodoItems = async (): Promise<TodoItem[]> => {
  const q = query(collection(db, 'todo_list'), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      due_date: toDate(data.due_date),
      created_at: toDate(data.created_at),
    } as TodoItem;
  });
};

// 할 일 목록 조회 (사용자별)
export const getTodoItemsByUser = async (email: string): Promise<TodoItem[]> => {
  const q = query(
    collection(db, 'todo_list'),
    where('created_by', '==', email),
    orderBy('created_at', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      due_date: toDate(data.due_date),
      created_at: toDate(data.created_at),
    } as TodoItem;
  });
};

export const getTodoItemsByScope = async (
  userEmail: string,
  userUid: string,
  teamEmails?: string[],
  teamUids?: string[]
): Promise<TodoItem[]> => {
  const colRef = collection(db, 'todo_list');
  const seen = new Set<string>();
  const results: TodoItem[] = [];

  const mapDoc = (docSnap: any): TodoItem => {
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      due_date: toDate(data.due_date),
      created_at: toDate(data.created_at),
    } as TodoItem;
  };

  const emails = teamEmails && teamEmails.length > 0 ? teamEmails : [userEmail];
  const uids = teamUids && teamUids.length > 0 ? teamUids : [userUid];

  const chunkSize = 30;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const q = query(colRef, where('created_by', 'in', chunk));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(d => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        results.push(mapDoc(d));
      }
    });
  }

  for (let i = 0; i < uids.length; i += chunkSize) {
    const chunk = uids.slice(i, i + chunkSize);
    const q = query(colRef, where('assigned_to', 'in', chunk));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(d => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        results.push(mapDoc(d));
      }
    });
  }

  results.sort((a, b) => {
    const dateA = a.created_at instanceof Date ? a.created_at : new Date(a.created_at);
    const dateB = b.created_at instanceof Date ? b.created_at : new Date(b.created_at);
    return dateB.getTime() - dateA.getTime();
  });

  return results;
};

// 할 일 등록
export const createTodoItem = async (data: InsertTodoItem): Promise<TodoItem> => {
  // undefined 값 제거 (Firestore는 undefined를 지원하지 않음)
  const cleanData: Record<string, any> = {
    title: data.title,
    due_date: Timestamp.fromDate(data.due_date),
    priority: data.priority,
    status: data.status,
    created_by: data.created_by,
    created_by_name: data.created_by_name,
    created_at: Timestamp.now(),
  };
  
  // 선택적 필드는 값이 있을 때만 추가
  if (data.memo) cleanData.memo = data.memo;
  if (data.customer_id) cleanData.customer_id = data.customer_id;
  if (data.customer_name) cleanData.customer_name = data.customer_name;
  
  const docRef = await addDoc(collection(db, 'todo_list'), cleanData);
  
  return {
    ...data,
    id: docRef.id,
    created_at: new Date(),
  };
};

// 할 일 수정
export const updateTodoItem = async (id: string, data: Partial<TodoItem>): Promise<void> => {
  const updateData: Record<string, any> = { ...data };
  if (data.due_date) {
    updateData.due_date = Timestamp.fromDate(data.due_date);
  }
  await updateDoc(doc(db, 'todo_list', id), updateData);
};

// 할 일 삭제
export const deleteTodoItem = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'todo_list', id));
};

export const deleteActiveTodosForCustomer = async (customerId: string): Promise<number> => {
  const q = query(
    collection(db, 'todo_list'),
    where('customer_id', '==', customerId),
    where('status', '==', '진행중'),
  );
  const snapshot = await getDocs(q);
  let deletedCount = 0;
  for (const docSnap of snapshot.docs) {
    await deleteDoc(docSnap.ref);
    deletedCount++;
  }
  return deletedCount;
};

export const hasActiveTodoForCustomer = async (customerId: string): Promise<boolean> => {
  const q = query(
    collection(db, 'todo_list'),
    where('customer_id', '==', customerId),
    where('status', '==', '진행중'),
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

// 특정 고객의 경과된 TODO 자동 삭제 (고객 액션 시 호출)
export const deleteOverdueTodosForCustomer = async (customerId: string): Promise<number> => {
  const now = new Date();
  const q = query(
    collection(db, 'todo_list'),
    where('customer_id', '==', customerId),
    where('status', '==', '진행중'),
  );
  const snapshot = await getDocs(q);
  let deletedCount = 0;
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const dueDate = data.due_date?.toDate?.() || new Date(data.due_date);
    if (dueDate <= now) {
      await deleteDoc(docSnap.ref);
      deletedCount++;
    }
  }
  return deletedCount;
};

export const getPreviousStatusForCustomer = async (customerId: string): Promise<string | null> => {
  const q = query(
    collection(db, 'status_logs'),
    where('customer_id', '==', customerId),
    orderBy('changed_at', 'desc'),
    limit(10),
  );
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  for (const docSnap of docs) {
    const data = docSnap.data();
    const prevStatus = data.previous_status;
    if (prevStatus && prevStatus !== '예약') {
      return prevStatus;
    }
  }
  return '상담대기';
};

// ============ Customer Info Logs (자문료율, 계약금, 집행금액 변경 이력) ============

export interface CustomerInfoLog {
  id: string;
  customer_id: string;
  field_name: 'commission_rate' | 'contract_amount' | 'execution_amount' | 'contract_date' | 'execution_date' | 'deposit_paid_date';
  old_value: string;
  new_value: string;
  changed_by: string;
  changed_by_name: string;
  changed_at: Timestamp;
}

// 정보 변경 이력 조회
export const getCustomerInfoLogs = async (customerId: string): Promise<CustomerInfoLog[]> => {
  // 복합 인덱스 없이 조회 후 클라이언트에서 정렬
  const q = query(
    collection(db, 'customer_info_logs'),
    where('customer_id', '==', customerId)
  );
  
  const snapshot = await getDocs(q);
  const logs = snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
  } as CustomerInfoLog));
  
  // 클라이언트에서 changed_at 기준 내림차순 정렬
  return logs.sort((a, b) => b.changed_at.toMillis() - a.changed_at.toMillis());
};

// 정보 변경 이력 추가
export const addCustomerInfoLog = async (log: Omit<CustomerInfoLog, 'id' | 'changed_at'>): Promise<void> => {
  await addDoc(collection(db, 'customer_info_logs'), {
    ...log,
    changed_at: Timestamp.now(),
  });
};

// 고객 정보 수정 (자문료율, 계약금, 수납일자, 기관별 집행정보) 및 변경 이력 기록
export const updateCustomerInfo = async (
  customerId: string,
  updates: {
    commission_rate?: number;
    contract_amount?: number;
    contract_date?: string;
    deposit_paid_date?: string;
    processing_orgs?: ProcessingOrg[];
  },
  currentCustomer: Customer,
  changedBy: string,
  changedByName: string
): Promise<void> => {
  const batch = writeBatch(db);
  const customerRef = doc(db, 'customers', customerId);
  
  // 변경된 필드만 업데이트
  const fieldsToUpdate: Record<string, any> = {};
  const logsToAdd: Omit<CustomerInfoLog, 'id' | 'changed_at'>[] = [];
  
  if (updates.commission_rate !== undefined) {
    const oldValue = currentCustomer.commission_rate || currentCustomer.contract_fee_rate || 0;
    if (Number(oldValue) !== updates.commission_rate) {
      fieldsToUpdate.commission_rate = updates.commission_rate;
      fieldsToUpdate.contract_fee_rate = updates.commission_rate;
      logsToAdd.push({
        customer_id: customerId,
        field_name: 'commission_rate',
        old_value: String(oldValue),
        new_value: String(updates.commission_rate),
        changed_by: changedBy,
        changed_by_name: changedByName,
      });
    }
  }
  
  if (updates.contract_amount !== undefined) {
    const oldValue = currentCustomer.contract_amount || currentCustomer.deposit_amount || 0;
    if (Number(oldValue) !== updates.contract_amount) {
      fieldsToUpdate.contract_amount = updates.contract_amount;
      fieldsToUpdate.approved_amount = updates.contract_amount;
      logsToAdd.push({
        customer_id: customerId,
        field_name: 'contract_amount',
        old_value: String(oldValue),
        new_value: String(updates.contract_amount),
        changed_by: changedBy,
        changed_by_name: changedByName,
      });
    }
  }
  
  if (updates.contract_date !== undefined) {
    const oldValue = (currentCustomer as any).contract_date || '';
    if (oldValue !== updates.contract_date) {
      fieldsToUpdate.contract_date = updates.contract_date;
      logsToAdd.push({
        customer_id: customerId,
        field_name: 'contract_date',
        old_value: String(oldValue || '미설정'),
        new_value: String(updates.contract_date),
        changed_by: changedBy,
        changed_by_name: changedByName,
      });
    }
  }

  if (updates.deposit_paid_date !== undefined) {
    const oldValue = (currentCustomer as any).deposit_paid_date || '';
    if (oldValue !== updates.deposit_paid_date) {
      fieldsToUpdate.deposit_paid_date = updates.deposit_paid_date;
      logsToAdd.push({
        customer_id: customerId,
        field_name: 'deposit_paid_date',
        old_value: String(oldValue || '미설정'),
        new_value: String(updates.deposit_paid_date),
        changed_by: changedBy,
        changed_by_name: changedByName,
      });
    }
  }
  
  // 기관별 집행 정보 업데이트 (processing_orgs)
  if (updates.processing_orgs) {
    const currentOrgs = currentCustomer.processing_orgs || [];
    let hasChanges = false;
    
    for (const updatedOrg of updates.processing_orgs) {
      if (updatedOrg.status !== '승인') continue;
      
      const currentOrg = currentOrgs.find((o: ProcessingOrg) => o.org === updatedOrg.org);
      if (!currentOrg) continue;
      
      // 집행금액 변경 확인
      if (updatedOrg.execution_amount !== currentOrg.execution_amount) {
        hasChanges = true;
        logsToAdd.push({
          customer_id: customerId,
          field_name: 'execution_amount',
          old_value: `${currentOrg.org}: ${currentOrg.execution_amount || 0}`,
          new_value: `${updatedOrg.org}: ${updatedOrg.execution_amount || 0}`,
          changed_by: changedBy,
          changed_by_name: changedByName,
        });
      }
      
      // 집행일 변경 확인
      if (updatedOrg.execution_date !== currentOrg.execution_date) {
        hasChanges = true;
        logsToAdd.push({
          customer_id: customerId,
          field_name: 'execution_date',
          old_value: `${currentOrg.org}: ${currentOrg.execution_date || '미설정'}`,
          new_value: `${updatedOrg.org}: ${updatedOrg.execution_date || '미설정'}`,
          changed_by: changedBy,
          changed_by_name: changedByName,
        });
      }
    }
    
    if (hasChanges) {
      fieldsToUpdate.processing_orgs = updates.processing_orgs;
    }
  }
  
  // 변경사항이 있을 때만 업데이트
  if (Object.keys(fieldsToUpdate).length > 0) {
    batch.update(customerRef, fieldsToUpdate);
    
    // 변경 이력 추가 (customer_info_logs)
    for (const log of logsToAdd) {
      const logRef = doc(collection(db, 'customer_info_logs'));
      batch.set(logRef, {
        ...log,
        changed_at: Timestamp.now(),
      });
    }

    // 상세페이지 변경이력에도 기록 (customer_history_logs)
    if (logsToAdd.length > 0) {
      const fieldLabels: Record<string, string> = {
        commission_rate: '자문료율',
        contract_amount: '계약금',
        contract_date: '계약일',
        deposit_paid_date: '수납일자',
        execution_amount: '집행금액',
        execution_date: '집행일',
      };
      const details = logsToAdd.map(log => {
        const label = fieldLabels[log.field_name] || log.field_name;
        return `${label}: ${log.old_value} → ${log.new_value}`;
      }).join(', ');

      const historyLogRef = doc(collection(db, 'customer_history_logs'));
      batch.set(historyLogRef, {
        customer_id: customerId,
        action_type: 'info_update',
        description: `정보 수정: ${details}`,
        old_value: logsToAdd.map(l => `${fieldLabels[l.field_name] || l.field_name}: ${l.old_value}`).join(', '),
        new_value: logsToAdd.map(l => `${fieldLabels[l.field_name] || l.field_name}: ${l.new_value}`).join(', '),
        changed_by_id: changedBy,
        changed_by_name: changedByName,
        changed_at: Timestamp.now(),
      });
    }
    
    await batch.commit();
  }
};

// CounselingLogs
export const getCounselingLogs = async (): Promise<CounselingLog[]> => {
  const snapshot = await getDocs(collection(db, 'counseling_logs'));
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      customer_id: data.customer_id || '',
      customer_name: data.customer_name || '',
      manager_id: data.manager_id || data.changed_by || '',
      manager_name: data.manager_name || data.changed_by_name || '',
      type: data.type || 'status_change',
      content: data.content || data.memo || '',
      old_status: data.old_status || '',
      new_status: data.new_status || '',
      rejection_reason: data.rejection_reason || data.new_status || '',
      created_at: data.created_at ? toDate(data.created_at) : new Date(),
    } as CounselingLog;
  });
};

// ========== 정산 관리 ==========

// 정산 대상 상태 목록 (이 상태를 가진 고객은 정산에 포함)
const SETTLEMENT_TARGET_STATUSES = [
  '계약', '계약완료', '계약완료(선불)', '계약완료(후불)',
  '서류취합완료', '서류취합완료(선불)', '서류취합완료(후불)',
  '신청완료', '신청완료(선불)', '신청완료(외주)', '신청완료(후불)',
  '집행', '집행완료', '집행대기', '집행중', '집행완료(채무조정)',
  '민원처리',
];

// 날짜를 YYYY-MM-DD 문자열로 변환하는 헬퍼 함수
const toDateString = (dateValue: Timestamp | Date | string | undefined): string | null => {
  if (!dateValue) return null;
  
  if (dateValue instanceof Timestamp) {
    return dateValue.toDate().toISOString().slice(0, 10);
  }
  if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 10);
  }
  if (typeof dateValue === 'string' && dateValue.length >= 10) {
    return dateValue.slice(0, 10);
  }
  return null;
};

// 고객 데이터에서 정산 항목 자동 생성 및 업데이트 (계약/집행 상태인 고객 대상)
// 다중 진행기관 지원: 각 승인된 기관별로 별도의 정산 항목 생성
export const syncCustomerSettlements = async (month: string, users: User[]): Promise<void> => {
  try {
    // 1. 모든 고객 가져오기
    const customersSnapshot = await getDocs(collection(db, 'customers'));
    const customers = customersSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        entry_date: toDateString(data.entry_date) || undefined,
        contract_completion_date: toDateString(data.contract_completion_date) || undefined,
        processing_orgs: data.processing_orgs || [],
      } as Customer;
    });

    // 2. 기존 정산 항목 가져오기
    const existingSettlements = await getSettlementItems(month);

    // 3. 정산 대상 상태이고, 해당 월에 등록된 고객 필터링
    const targetCustomers = customers.filter(customer => {
      const status = customer.status_code || '';
      const isTargetStatus = SETTLEMENT_TARGET_STATUSES.includes(status) ||
        (status.includes('계약완료') || status.includes('집행'));
      if (!isTargetStatus) return false;
      if (status === '수납대기') return false;

      const isPostContract = status === '계약완료(후불)';
      const isOutContract = status === '계약완료(외주)';
      
      // 기관별 집행일 확인 (processing_orgs 내 승인된 기관의 execution_date)
      const approvedOrgs = (customer.processing_orgs || []).filter(
        (org: ProcessingOrg) => org.status === '승인' && org.execution_amount && org.execution_date
      );

      const hasExecution = approvedOrgs.length > 0 || !!(customer.execution_date && customer.execution_amount);

      if ((isPostContract || isOutContract) && !hasExecution) {
        return false;
      }
      
      const depositPaidDate = (customer as any).deposit_paid_date || (customer as any).contract_date || customer.contract_completion_date || '';
      if (depositPaidDate && depositPaidDate.slice(0, 7) === month) return true;
      
      const hasOrgInMonth = approvedOrgs.some(
        (org: ProcessingOrg) => org.execution_date && org.execution_date.slice(0, 7) === month
      );
      
      if (hasOrgInMonth) return true;
      
      const dateForSettlement = customer.execution_date || (customer as any).contract_date || customer.contract_completion_date || customer.entry_date;
      if (!dateForSettlement) return false;
      
      const settlementMonth = dateForSettlement.slice(0, 7);
      return settlementMonth === month;
    });

    console.log(`[Settlement Sync] 정산 대상 고객 수: ${targetCustomers.length}`);

    // 4. 각 고객별로 syncSingleCustomerSettlement 호출 (다중 기관 지원)
    for (const customer of targetCustomers) {
      await syncSingleCustomerSettlement(customer.id, users);
    }
    
    console.log(`[Settlement Sync] 정산 동기화 완료: ${targetCustomers.length}건 처리`);
    
    // 5. 고아 정산 항목 삭제 (고객 DB에 존재하지 않는 정산 항목)
    const customerIdSet = new Set(customers.map(c => c.id));
    let deletedCount = 0;
    
    for (const settlement of existingSettlements) {
      // 고객이 존재하지 않거나 정산 대상 상태가 아닌 경우
      const customer = customers.find(c => c.id === settlement.customer_id);
      if (!customer) {
        // 고객이 완전히 삭제된 경우 정산 항목도 삭제
        await deleteDoc(doc(db, 'settlements', settlement.id));
        deletedCount++;
        continue;
      }
      
      const status = customer.status_code || '';
      const isTargetStatus = SETTLEMENT_TARGET_STATUSES.includes(status) ||
        (status.includes('계약완료') || status.includes('집행'));
      const isReservation = status === '예약';
      // 최종부결: 환수 처리 후 원본 정산 보존 필수 (Point-in-time 정확성)
      const isFinalRejection = status === '최종부결';
      
      if (settlement.status === '정상' && !settlement.is_clawback) {
        if (!isTargetStatus && !isReservation && !isFinalRejection) {
          await deleteDoc(doc(db, 'settlements', settlement.id));
          deletedCount++;
          continue;
        }
        
        // 정산월 확인 - 정산 항목 자체의 settlement_month 기준으로 확인
        // (정산 항목은 생성 시 이미 올바른 settlement_month가 설정됨)
        if (settlement.settlement_month !== month) {
          // 해당 월 정산이 아닌 경우 삭제 (다른 월로 이동된 경우)
          await deleteDoc(doc(db, 'settlements', settlement.id));
          deletedCount++;
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[Settlement Cleanup] 삭제: ${deletedCount}건`);
    }
  } catch (error) {
    console.error('Error syncing customer settlements:', error);
  }
};

export const cleanupInvalidSettlements = async (): Promise<{ deleted: number; details: string[] }> => {
  const details: string[] = [];
  let deleted = 0;
  
  try {
    const settlementsSnapshot = await getDocs(collection(db, 'settlements'));
    
    for (const settlementDoc of settlementsSnapshot.docs) {
      const settlement = settlementDoc.data();
      
      if (settlement.is_clawback || settlement.status === '취소') continue;
      
      const customerId = settlement.customer_id;
      if (!customerId) continue;
      
      const customerDoc = await getDoc(doc(db, 'customers', customerId));
      if (!customerDoc.exists()) continue;
      
      const customerData = customerDoc.data();
      const status = customerData.status_code || '';
      
      const isTargetStatus = SETTLEMENT_TARGET_STATUSES.includes(status) ||
        (status.includes('계약완료') || status.includes('집행'));
      const isPaymentPending = status === '수납대기';
      // 최종부결: 환수 처리된 고객의 원본 정산은 절대 삭제하지 않음 (Point-in-time 정확성)
      const isFinalRejection = status === '최종부결';
      
      if ((!isTargetStatus || isPaymentPending) && !isFinalRejection) {
        details.push(`삭제: ${customerData.name || customerData.company_name} (${status}) - 정산ID: ${settlementDoc.id}`);
        await deleteDoc(doc(db, 'settlements', settlementDoc.id));
        deleted++;
      }
    }
    
    console.log(`[Settlement Cleanup] 소급 정리 완료: ${deleted}건 삭제`);
    return { deleted, details };
  } catch (error) {
    console.error('Settlement cleanup error:', error);
    throw error;
  }
};

// 단일 고객 정산 동기화 (고객 정보 변경 시 실시간 반영)
// 다중 진행기관 지원: 각 승인된 기관별로 별도의 정산 항목 생성
export const syncSingleCustomerSettlement = async (customerId: string, users: User[]): Promise<boolean> => {
  // 정상 흐름(정산 대상 아님 등 early return 포함) → true 반환, 실제 예외 발생 시에만 false 반환
  // 호출자(글로벌 폴러)가 실패한 경우에만 재시도하도록 함
  let threwError = false;
  try {
    // 1. 해당 고객 정보 가져오기
    const customerDoc = await getDoc(doc(db, 'customers', customerId));
    if (!customerDoc.exists()) {
      console.log(`[Settlement Sync] 고객 ${customerId} 없음`);
      return true;
    }
    
    const data = customerDoc.data();
    const customer = {
      id: customerDoc.id,
      ...data,
      entry_date: toDateString(data.entry_date) || undefined,
      contract_completion_date: toDateString(data.contract_completion_date) || undefined,
      contract_date: toDateString(data.contract_date) || undefined,
      execution_date: toDateString(data.execution_date) || undefined,
      deposit_paid_date: data.deposit_paid_date || undefined,
      processing_orgs: data.processing_orgs || [],
    } as unknown as Customer;
    
    // 2. 정산 대상 상태인지 확인
    const status = customer.status_code || '';
    const isPostContract = status === '계약완료(후불)';
    const isOutContract = status === '계약완료(외주)';

    const hasExecution = !!(customer.execution_date || customer.execution_amount ||
      (customer.processing_orgs || []).some((org: ProcessingOrg) => org.status === '승인' && org.execution_amount && org.execution_date));

    if ((isPostContract || isOutContract) && !hasExecution) {
      console.log(`[Settlement Sync] ${isPostContract ? '후불' : '외주'}계약 - 집행 전이므로 정산 대상 제외: ${customer.company_name || customer.name}`);
      return true;
    }

    const isTargetStatus = SETTLEMENT_TARGET_STATUSES.includes(status) ||
      (status.includes('계약완료') || status.includes('집행'));
    const isPaymentPending = status === '수납대기';
    
    // 3. 해당 고객의 기존 정산 항목 가져오기
    const existingSettlementsQuery = query(
      collection(db, 'settlements'),
      where('customer_id', '==', customerId)
    );
    const existingSnapshot = await getDocs(existingSettlementsQuery);
    const existingSettlements = existingSnapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
    } as SettlementItem));
    
    const isReservation = status === '예약';
    // 최종부결: 환수 처리된 고객의 정산(원본 정상 + 환수)은 절대 삭제하지 않음 (Point-in-time 정확성)
    const isFinalRejection = status === '최종부결';
    if (!isTargetStatus || isPaymentPending) {
      if (isReservation && existingSettlements.length > 0) {
        console.log(`[Settlement Sync] 예약 상태이지만 기존 정산 ${existingSettlements.length}건 유지: ${customer.company_name || customer.name}`);
        return true;
      }
      if (isFinalRejection && existingSettlements.length > 0) {
        console.log(`[Settlement Sync] 최종부결 상태 - 기존 정산(원본+환수) ${existingSettlements.length}건 보존: ${customer.company_name || customer.name}`);
        return true;
      }
      if (existingSettlements.length > 0) {
        for (const settlement of existingSettlements) {
          await deleteDoc(doc(db, 'settlements', settlement.id));
        }
        console.log(`[Settlement Sync] 정산 대상 아님 - 기존 정산 ${existingSettlements.length}건 삭제: ${customer.company_name || customer.name}, 상태: ${status}`);
      } else {
        console.log(`[Settlement Sync] 정산 대상 아님: ${customer.company_name || customer.name}, 상태: ${status}`);
      }
      return true;
    }
    
    // 4. 최종부결에서 정상 상태로 복구된 경우: 기존 환수 항목 삭제 (이중 차감 방지)
    // - syncSingleCustomerSettlement은 정상 상태(계약완료/집행 등)에서만 여기까지 도달
    // - 따라서 status가 정상 상태인데 환수 항목이 남아있다면 이는 최종부결 → 복구된 케이스
    const lingeringClawbacks = existingSettlements.filter(s => s.is_clawback);
    if (lingeringClawbacks.length > 0) {
      for (const clawback of lingeringClawbacks) {
        await deleteDoc(doc(db, 'settlements', clawback.id));
      }
      console.log(`[Settlement Sync] 상태 복구 감지 - 기존 환수 ${lingeringClawbacks.length}건 삭제: ${customer.company_name || customer.name}, 상태: ${status}`);
      // existingSettlements에서도 제거하여 이후 로직에 영향 없도록 함
      const clawbackIds = new Set(lingeringClawbacks.map(c => c.id));
      for (let i = existingSettlements.length - 1; i >= 0; i--) {
        if (clawbackIds.has(existingSettlements[i].id)) {
          existingSettlements.splice(i, 1);
        }
      }
    }

    // 4-0. 채무조정에서 다른 정상 상태로 복구된 경우: 잔존하는 채무조정 정산 삭제 (이중 차감 방지)
    if (status !== '집행완료(채무조정)') {
      const lingeringDebt = existingSettlements.filter(s => s.is_debt_adjustment);
      if (lingeringDebt.length > 0) {
        for (const debt of lingeringDebt) {
          await deleteDoc(doc(db, 'settlements', debt.id));
        }
        console.log(`[Settlement Sync] 채무조정 → 일반 상태 전환 감지 - 기존 채무조정 정산 ${lingeringDebt.length}건 삭제: ${customer.company_name || customer.name}, 상태: ${status}`);
        const debtIds = new Set(lingeringDebt.map(d => d.id));
        for (let i = existingSettlements.length - 1; i >= 0; i--) {
          if (debtIds.has(existingSettlements[i].id)) {
            existingSettlements.splice(i, 1);
          }
        }
      }
    }

    // 4-0.5 정상 정산 중복 제거 (race condition으로 인한 동일 그룹 다중 생성 방지/자가치유)
    // - 그룹 키: org_name(있으면) | settlement_month + 채무조정 여부(없으면)
    // - 같은 그룹에 status='정상' && !is_clawback 레코드가 2건 이상이면 가장 오래된 것만 남기고 나머지 삭제
    const dedupeSettlements = async (items: SettlementItem[]): Promise<Set<string>> => {
      const dedupeGroups = new Map<string, SettlementItem[]>();
      for (const s of items) {
        if (s.status !== '정상' || s.is_clawback) continue;
        const orgKey = s.org_name || `__nolegacy__${s.settlement_month || ''}`;
        const debtKey = s.is_debt_adjustment ? 'debt' : 'normal';
        const key = `${orgKey}::${debtKey}`;
        const arr = dedupeGroups.get(key) || [];
        arr.push(s);
        dedupeGroups.set(key, arr);
      }
      const toDeleteIds = new Set<string>();
      const tsToMillis = (t: any): number => {
        if (!t) return 0;
        if (typeof t.toMillis === 'function') return t.toMillis();
        if (typeof t.toDate === 'function') return t.toDate().getTime();
        if (t instanceof Date) return t.getTime();
        if (typeof t === 'object' && typeof t.seconds === 'number') {
          return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
        }
        const parsed = new Date(t).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      };
      Array.from(dedupeGroups.values()).forEach((arr: SettlementItem[]) => {
        if (arr.length <= 1) return;
        arr.sort((a: SettlementItem, b: SettlementItem) => tsToMillis(a.created_at) - tsToMillis(b.created_at));
        for (let i = 1; i < arr.length; i++) {
          toDeleteIds.add(arr[i].id);
        }
      });
      if (toDeleteIds.size > 0) {
        const idsArr = Array.from(toDeleteIds);
        for (const id of idsArr) {
          await deleteDoc(doc(db, 'settlements', id));
        }
        console.log(`[Settlement Sync] 중복 정산 ${toDeleteIds.size}건 자동 정리: ${customer.company_name || customer.name}`);
      }
      return toDeleteIds;
    };

    // 사후 자가치유 헬퍼: 모든 쓰기 종료 후 다시 조회하여 중복 점검
    const runFinalDedupe = async (cid: string): Promise<void> => {
      try {
        const finalSnapshot = await getDocs(query(
          collection(db, 'settlements'),
          where('customer_id', '==', cid)
        ));
        const finalSettlements = finalSnapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        } as SettlementItem));
        await dedupeSettlements(finalSettlements);
      } catch (cleanupErr) {
        console.error(`[Settlement Sync] 사후 중복 점검 실패 (${cid}):`, cleanupErr);
      }
    };

    {
      const removed = await dedupeSettlements(existingSettlements);
      if (removed.size > 0) {
        for (let i = existingSettlements.length - 1; i >= 0; i--) {
          if (removed.has(existingSettlements[i].id)) {
            existingSettlements.splice(i, 1);
          }
        }
      }
    }

    // 4-1. 집행완료(채무조정) 특수 처리: 총관리자가 수기로 입력한 총 수당/직원 수당 사용
    // - 일반 집행 수당 계산식(commissionRate, fee_rate 등)을 적용하지 않음
    // - 단일 정산 항목 생성 (기관별 분리 없음)
    if (status === '집행완료(채무조정)') {
      const debtMgr = users.find(u => u.uid === customer.manager_id);
      const debtEntrySource = (customer.entry_source as EntrySourceType) || '기타';
      const totalRevenueManwon = (customer as any).debt_adjustment_total_revenue || 0;
      const grossCommissionManwon = (customer as any).debt_adjustment_employee_commission || 0;
      const taxAmount = Math.round(grossCommissionManwon * 0.033 * 100) / 100;
      const netCommission = Math.round((grossCommissionManwon - taxAmount) * 100) / 100;
      const debtExecDate = customer.execution_date || customer.contract_completion_date || customer.entry_date || '';
      const debtSettlementMonth = debtExecDate ? debtExecDate.slice(0, 7) : new Date().toISOString().slice(0, 7);

      const debtSettlementData: InsertSettlementItem = {
        customer_id: customer.id,
        customer_name: customer.company_name || customer.name,
        manager_id: customer.manager_id,
        manager_name: customer.manager_name || debtMgr?.name || '',
        team_id: customer.team_id,
        team_name: customer.team_name || '',
        entry_source: debtEntrySource,
        contract_amount: 0,
        execution_amount: 0,
        fee_rate: 0,
        total_revenue: totalRevenueManwon,
        commission_rate: 0,
        deposit_commission_rate: 0,
        gross_commission: grossCommissionManwon,
        tax_amount: taxAmount,
        net_commission: netCommission,
        settlement_month: debtSettlementMonth,
        contract_date: (customer as any).contract_date || customer.contract_completion_date || '',
        execution_date: debtExecDate,
        status: '정상',
        is_clawback: false,
        is_debt_adjustment: true,
      };

      // 기존 채무조정 정산이 있으면 업데이트, 없으면 신규 생성
      const existingDebtSettlement = existingSettlements.find(s => s.is_debt_adjustment);
      if (existingDebtSettlement) {
        await updateSettlementItem(existingDebtSettlement.id, debtSettlementData);
        console.log(`[Settlement Sync] 채무조정 정산 업데이트: ${customer.company_name || customer.name}, 총수당=${totalRevenueManwon}만원, 직원수당=${grossCommissionManwon}만원`);
      } else {
        await createSettlementItem(debtSettlementData);
        console.log(`[Settlement Sync] 채무조정 정산 신규 생성: ${customer.company_name || customer.name}, 총수당=${totalRevenueManwon}만원, 직원수당=${grossCommissionManwon}만원`);
      }

      // 채무조정 외 다른 기존 정산(이전 상태에서 생성된)은 정리
      const nonDebtSettlements = existingSettlements.filter(s => !s.is_debt_adjustment && !s.is_clawback);
      for (const stale of nonDebtSettlements) {
        await deleteDoc(doc(db, 'settlements', stale.id));
        console.log(`[Settlement Sync] 채무조정 전환으로 기존 정산 삭제: ${customer.company_name || customer.name}, ID=${stale.id}`);
      }

      await runFinalDedupe(customerId);
      return true;
    }

    // 5. 승인된 진행기관 목록 확인
    const approvedOrgs = (customer.processing_orgs || [])
      .filter((org: { status: string }) => org.status === '승인');
    
    // 담당자 정보
    const manager = users.find(u => u.uid === customer.manager_id);
    const entrySource = (customer.entry_source as EntrySourceType) || '기타';
    const commissionRate = getCommissionRate(manager?.commissionRates, entrySource);
    const depositCommissionRate = getDepositCommissionRate(manager?.commissionRates, entrySource);
    const reExecutionRate = manager?.commissionRates?.reExecution || 0;
    const contractDate = (customer as any).contract_date || customer.contract_completion_date || customer.entry_date || '';
    const feeRate = customer.contract_fee_rate || customer.commission_rate || 3;
    
    // 모든 집행 항목 수집 (기관별 is_re_execution 플래그 사용)
    interface ExecutionEntry {
      orgName: string;
      executionDate: string;
      executionAmount: number;
      isReExecution: boolean;
    }
    const allExecutions: ExecutionEntry[] = [];
    
    for (const org of approvedOrgs) {
      if (org.execution_date && org.execution_amount) {
        allExecutions.push({
          orgName: org.org,
          executionDate: org.execution_date,
          executionAmount: org.execution_amount,
          isReExecution: org.is_re_execution || false,
        });
      }
    }
    
    allExecutions.sort((a, b) => a.executionDate.localeCompare(b.executionDate));
    
    // 5. 집행 항목이 있으면 각각 정산 생성/업데이트
    const depositPaidDate = (customer as any).deposit_paid_date || contractDate || '';
    const hasDepositSettlement = depositPaidDate && existingSettlements.some(s =>
      s.status === '정상' && !s.is_clawback && (s.contract_amount || 0) > 0 && !(s.execution_amount)
    );

    if (allExecutions.length > 0) {
      const legacySettlements = existingSettlements.filter(s => 
        s.status === '정상' && !s.is_clawback && !s.org_name
      );
      for (const legacy of legacySettlements) {
        const isDepositOnly = (legacy.contract_amount || 0) > 0 && !(legacy.execution_amount);
        if (isDepositOnly && depositPaidDate) {
          const correctMonth = depositPaidDate.slice(0, 7);
          if (legacy.settlement_month !== correctMonth) {
            await updateSettlementItem(legacy.id, { settlement_month: correctMonth });
            console.log(`[Settlement Sync] 계약금 수납 정산 정산월 수정 (${legacy.settlement_month} → ${correctMonth}): ${customer.company_name || customer.name}`);
          } else {
            console.log(`[Settlement Sync] 계약금 수납 정산 유지: ${customer.company_name || customer.name}`);
          }
          continue;
        }
        await deleteDoc(doc(db, 'settlements', legacy.id));
        console.log(`[Settlement Sync] 레거시 정산 삭제 (org_name 없음): ${customer.company_name || customer.name}`);
      }
      
      const processedOrgs = new Set<string>();
      
      const customerContractAmount = customer.contract_amount || customer.deposit_amount || 0;
      const depositMonth = depositPaidDate ? depositPaidDate.slice(0, 7) : '';
      const firstExecDate = allExecutions.find(e => !e.isReExecution)?.executionDate || '';
      const execMonth = firstExecDate ? firstExecDate.slice(0, 7) : '';
      const needsDepositSplit = depositPaidDate && customerContractAmount > 0 && depositMonth !== execMonth;
      
      let depositSettlementExists = !!hasDepositSettlement;
      
      if (needsDepositSplit && !depositSettlementExists) {
        const existingDepositSettlement = existingSettlements.find(s =>
          s.status === '정상' && !s.is_clawback && !s.org_name && (s.contract_amount || 0) > 0 && !(s.execution_amount)
        );
        
        if (existingDepositSettlement) {
          if (existingDepositSettlement.settlement_month !== depositMonth) {
            await updateSettlementItem(existingDepositSettlement.id, { settlement_month: depositMonth });
            console.log(`[Settlement Sync] 계약금 정산 정산월 수정 (${existingDepositSettlement.settlement_month} → ${depositMonth}): ${customer.company_name || customer.name}`);
          }
          depositSettlementExists = true;
        } else {
          const depositCalc = calculateSettlement(customerContractAmount, 0, feeRate, commissionRate, depositCommissionRate);
          const depositSettlementData: InsertSettlementItem = {
            customer_id: customer.id,
            customer_name: customer.company_name || customer.name,
            manager_id: customer.manager_id,
            manager_name: customer.manager_name || manager?.name || '',
            team_id: customer.team_id,
            team_name: customer.team_name || '',
            entry_source: entrySource,
            contract_amount: customerContractAmount,
            execution_amount: 0,
            fee_rate: feeRate,
            total_revenue: depositCalc.totalRevenue,
            commission_rate: commissionRate,
            deposit_commission_rate: depositCommissionRate,
            gross_commission: depositCalc.grossCommission,
            tax_amount: depositCalc.taxAmount,
            net_commission: depositCalc.netCommission,
            settlement_month: depositMonth,
            contract_date: contractDate,
            execution_date: '',
            status: '정상',
            is_clawback: false,
          };
          await createSettlementItem(depositSettlementData);
          depositSettlementExists = true;
          console.log(`[Settlement Sync] 계약금 별도 정산 생성 (${depositMonth}): ${customer.company_name || customer.name}`);
        }
      }
      
      for (const execEntry of allExecutions) {
        const { orgName, executionDate, executionAmount, isReExecution } = execEntry;
        
        const settlementOrgName = isReExecution ? `${orgName}(재집행)` : orgName;
        
        if (processedOrgs.has(settlementOrgName)) {
          continue;
        }
        processedOrgs.add(settlementOrgName);
        
        const contractAmount = (depositSettlementExists || hasDepositSettlement) ? 0
          : (!isReExecution && processedOrgs.size === 1 && !needsDepositSplit)
            ? customerContractAmount
            : 0;
        
        const settlementMonth = (contractAmount > 0 && depositPaidDate)
          ? depositPaidDate.slice(0, 7)
          : executionDate.slice(0, 7);
        if (!settlementMonth) {
          console.log(`[Settlement Sync] 정산월 결정 불가: ${customer.company_name || customer.name} - ${orgName}`);
          continue;
        }
        
        const effectiveCommissionRate = isReExecution ? reExecutionRate : commissionRate;
        const effectiveDepositRate = isReExecution ? 0 : depositCommissionRate;
        
        const calc = calculateSettlement(contractAmount, executionAmount, feeRate, effectiveCommissionRate, effectiveDepositRate);
        
        const existingOrgSettlement = existingSettlements.find(s => 
          s.status === '정상' && !s.is_clawback && s.org_name === settlementOrgName
        );
        
        if (existingOrgSettlement) {
          const updatePayload: Record<string, any> = {
            customer_name: customer.company_name || customer.name,
            manager_id: customer.manager_id,
            manager_name: customer.manager_name || manager?.name || '',
            team_id: customer.team_id,
            team_name: customer.team_name || '',
            entry_source: isReExecution ? '승인복제' as EntrySourceType : entrySource,
            contract_amount: contractAmount,
            execution_amount: executionAmount,
            fee_rate: feeRate,
            total_revenue: calc.totalRevenue,
            commission_rate: effectiveCommissionRate,
            deposit_commission_rate: effectiveDepositRate,
            gross_commission: calc.grossCommission,
            tax_amount: calc.taxAmount,
            net_commission: calc.netCommission,
            contract_date: contractDate,
            execution_date: executionDate,
          };
          if (existingOrgSettlement.settlement_month !== settlementMonth) {
            updatePayload.settlement_month = settlementMonth;
            console.log(`[Settlement Sync] 기관별 정산 정산월 수정 (${existingOrgSettlement.settlement_month} → ${settlementMonth}): ${customer.company_name || customer.name} - ${settlementOrgName}`);
          }
          await updateSettlementItem(existingOrgSettlement.id, updatePayload);
          console.log(`[Settlement Sync] 기관별 정산 업데이트: ${customer.company_name || customer.name} - ${settlementOrgName}, 집행금액: ${executionAmount}만원`);
        } else {
          const settlementData: InsertSettlementItem = {
            customer_id: customer.id,
            customer_name: customer.company_name || customer.name,
            manager_id: customer.manager_id,
            manager_name: customer.manager_name || manager?.name || '',
            team_id: customer.team_id,
            team_name: customer.team_name || '',
            org_name: settlementOrgName,
            entry_source: isReExecution ? '승인복제' as EntrySourceType : entrySource,
            contract_amount: contractAmount,
            execution_amount: executionAmount,
            fee_rate: feeRate,
            total_revenue: calc.totalRevenue,
            commission_rate: effectiveCommissionRate,
            deposit_commission_rate: effectiveDepositRate,
            gross_commission: calc.grossCommission,
            tax_amount: calc.taxAmount,
            net_commission: calc.netCommission,
            settlement_month: settlementMonth,
            contract_date: contractDate,
            execution_date: executionDate,
            status: '정상',
            is_clawback: false,
          };
          
          await createSettlementItem(settlementData);
          console.log(`[Settlement Sync] 기관별 정산 생성: ${customer.company_name || customer.name} - ${settlementOrgName}, 집행금액: ${executionAmount}만원, 재집행: ${isReExecution}`);
        }
        
      }
    } else {
      // 승인된 기관이 없는 경우 (레거시 호환: 단일 정산 방식)
      const activeSettlement = existingSettlements.find(s => 
        s.status === '정상' && !s.is_clawback && !s.org_name
      );
      
      const contractAmount = customer.contract_amount || customer.deposit_amount || 0;
      const executionAmount = customer.execution_amount || 0;
      const executionDate = customer.execution_date || '';
      const depositPaidDate = (customer as any).deposit_paid_date || contractDate || '';
      const dateForMonth = (contractAmount > 0 && depositPaidDate) ? depositPaidDate : (executionDate || contractDate);
      const settlementMonth = dateForMonth ? dateForMonth.slice(0, 7) : '';
      
      if (!settlementMonth) {
        console.log(`[Settlement Sync] 정산월 결정 불가: ${customer.company_name || customer.name}`);
        return true;
      }
      
      const calc = calculateSettlement(contractAmount, executionAmount, feeRate, commissionRate, depositCommissionRate);
      
      if (activeSettlement) {
        const updatePayload: Record<string, any> = {
          customer_name: customer.company_name || customer.name,
          manager_id: customer.manager_id,
          manager_name: customer.manager_name || manager?.name || '',
          team_id: customer.team_id,
          team_name: customer.team_name || '',
          entry_source: entrySource,
          contract_amount: contractAmount,
          execution_amount: executionAmount,
          fee_rate: feeRate,
          total_revenue: calc.totalRevenue,
          commission_rate: commissionRate,
          deposit_commission_rate: depositCommissionRate,
          gross_commission: calc.grossCommission,
          tax_amount: calc.taxAmount,
          net_commission: calc.netCommission,
          contract_date: contractDate,
          execution_date: executionDate,
        };
        if (depositPaidDate && activeSettlement.settlement_month !== settlementMonth) {
          updatePayload.settlement_month = settlementMonth;
          console.log(`[Settlement Sync] 정산월 수정 (${activeSettlement.settlement_month} → ${settlementMonth}): ${customer.company_name || customer.name}`);
        }
        await updateSettlementItem(activeSettlement.id, updatePayload);
        console.log(`[Settlement Sync] 단일 고객 업데이트: ${customer.company_name || customer.name}`);
      } else if (!existingSettlements.some(s => s.customer_id === customerId && !s.org_name)) {
        const settlementData: InsertSettlementItem = {
          customer_id: customer.id,
          customer_name: customer.company_name || customer.name,
          manager_id: customer.manager_id,
          manager_name: customer.manager_name || manager?.name || '',
          team_id: customer.team_id,
          team_name: customer.team_name || '',
          entry_source: entrySource,
          contract_amount: contractAmount,
          execution_amount: executionAmount,
          fee_rate: feeRate,
          total_revenue: calc.totalRevenue,
          commission_rate: commissionRate,
          deposit_commission_rate: depositCommissionRate,
          gross_commission: calc.grossCommission,
          tax_amount: calc.taxAmount,
          net_commission: calc.netCommission,
          settlement_month: settlementMonth,
          contract_date: contractDate,
          execution_date: executionDate,
          status: '정상',
          is_clawback: false,
        };
        
        await createSettlementItem(settlementData);
        console.log(`[Settlement Sync] 단일 고객 생성: ${customer.company_name || customer.name}`);
      }
    }

    // 6. 마지막 안전장치: 쓰기 직후 다시 한번 중복 정산 점검 (동시 실행 race condition 자가치유)
    await runFinalDedupe(customerId);
  } catch (error: any) {
    threwError = true;
    console.error(`Error syncing single customer settlement (${customerId}):`, error?.message || error?.code || JSON.stringify(error) || error);
  }
  return !threwError;
};

// 정산 항목 조회 (월별, 선택적으로 담당자별/팀별 필터링)
export const getSettlementItems = async (month?: string, managerId?: string, teamId?: string): Promise<SettlementItem[]> => {
  try {
    const constraints: QueryConstraint[] = [];
    
    if (month) {
      constraints.push(where('settlement_month', '==', month));
    }
    
    // 담당자 ID가 제공되면 해당 담당자의 정산만 조회 (staff 권한용)
    if (managerId) {
      constraints.push(where('manager_id', '==', managerId));
    }
    
    // 팀 ID가 제공되면 해당 팀의 정산만 조회 (team_leader 권한용)
    if (teamId) {
      constraints.push(where('team_id', '==', teamId));
    }
    
    console.log(`[Settlement Query] month: ${month}, managerId: ${managerId}, teamId: ${teamId}`);
    
    const q = constraints.length > 0 
      ? query(collection(db, 'settlements'), ...constraints)
      : query(collection(db, 'settlements'));
    
    const snapshot = await getDocs(q);
    console.log(`[Settlement Query] Found ${snapshot.docs.length} settlements`);
    
    const items = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        created_at: data.created_at ? toDate(data.created_at) : new Date(),
        updated_at: data.updated_at ? toDate(data.updated_at) : undefined,
      } as SettlementItem;
    });
    return items.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  } catch (error) {
    console.error('Error fetching settlement items:', error);
    console.error('[Settlement Query] Query failed - check Firebase Security Rules. Staff users need rules allowing read where resource.data.manager_id == request.auth.uid');
    return [];
  }
};

// 정산 항목 생성
export const createSettlementItem = async (data: InsertSettlementItem): Promise<SettlementItem> => {
  const docRef = await addDoc(collection(db, 'settlements'), {
    ...data,
    created_at: Timestamp.now(),
  });
  return {
    id: docRef.id,
    ...data,
    created_at: new Date(),
  };
};

// 고객 ID로 정산 항목 조회 (환수 처리용)
export const getSettlementsByCustomerId = async (customerId: string): Promise<SettlementItem[]> => {
  try {
    const q = query(
      collection(db, 'settlements'),
      where('customer_id', '==', customerId)
    );
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        created_at: data.created_at ? toDate(data.created_at) : new Date(),
        updated_at: data.updated_at ? toDate(data.updated_at) : undefined,
      } as SettlementItem;
    });
    return items.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  } catch (error) {
    console.error('Error fetching settlement items by customer ID:', error);
    return [];
  }
};

// 최종부결 시 환수 처리 (계약금만 환수, 자문료는 보존)
// - 배치 트랜잭션 사용으로 원자성 보장
// - 원본 정산 항목은 유지 (해당 월에 실제 수령한 금액을 보여줌)
// - 환수 적용월에 음수 환수 항목 생성 (clawback)
// 예: 12월 계약 → 1월 최종부결 시 12월 정상 유지, 1월에 -금액 환수 항목 생성
export const processClawbackForFinalRejection = async (
  customerId: string,
  currentMonth: string
): Promise<{ clawbackCreated: boolean; clawbackItems: SettlementItem[]; totalClawbackAmount: number }> => {
  try {
    // 해당 고객의 정상 정산 항목 조회
    const settlements = await getSettlementsByCustomerId(customerId);
    
    // 정상 상태이고 계약금이 있는 항목 모두 찾기 (아직 환수 처리되지 않은 것)
    const normalSettlements = settlements.filter(
      item => item.status === '정상' && item.contract_amount > 0 && !item.is_clawback
    );
    
    // 이미 환수 처리된 항목이 있는지 확인 (중복 방지)
    const existingClawbacks = settlements.filter(item => item.is_clawback);
    const clawbackedOriginalIds = new Set(existingClawbacks.map(item => item.original_item_id));
    
    // 아직 환수되지 않은 정산 항목만 필터링
    const unclawbackedSettlements = normalSettlements.filter(
      item => !clawbackedOriginalIds.has(item.id)
    );
    
    if (unclawbackedSettlements.length === 0) {
      console.log('No unclawbacked settlements found for clawback');
      return { clawbackCreated: false, clawbackItems: [], totalClawbackAmount: 0 };
    }
    
    // 배치로 원자적 처리
    const batch = writeBatch(db);
    const clawbackDataList: InsertSettlementItem[] = [];
    let totalClawbackAmount = 0;
    
    for (const settlement of unclawbackedSettlements) {
      // 계약금 수당 계산 (deposit_commission_rate 우선 사용, 없으면 commission_rate 사용)
      const depositRate = settlement.deposit_commission_rate ?? settlement.commission_rate;
      const contractCommission = Math.round(settlement.contract_amount * (depositRate / 100) * 100) / 100;
      const contractTax = Math.round(contractCommission * 0.033 * 100) / 100;
      const contractNet = Math.round(contractCommission * 0.967 * 100) / 100;
      
      // 중요: 원본 정산 항목은 절대 수정하지 않음 (Point-in-time 정확성)
      // - 12월 정산을 볼 때 12월 시점의 원본 데이터가 보여야 함
      // - 1월에 환수가 발생해도 12월 원본은 그대로 유지
      // - 복합 정산(계약금+자문료)도 원본 유지, 환수 항목만 별도 생성
      // 예: 12월 계약금 50만 → 1월 환수 -50만 (12월 원본은 50만 유지)
      
      // 환수 적용일 생성 (정산월 1일)
      const [year, month] = currentMonth.split('-');
      const clawbackAppliedAt = `${currentMonth}-01`;
      
      // 환수 항목 데이터 준비 (음수 값으로 저장 - 표준 회계 방식)
      const clawbackData: InsertSettlementItem = {
        customer_id: settlement.customer_id,
        customer_name: settlement.customer_name,
        manager_id: settlement.manager_id,
        manager_name: settlement.manager_name,
        team_id: settlement.team_id,
        team_name: settlement.team_name,
        entry_source: settlement.entry_source,
        contract_amount: -settlement.contract_amount, // 음수로 환수 표시
        execution_amount: 0,
        fee_rate: 0,
        total_revenue: -settlement.contract_amount, // 음수
        commission_rate: settlement.commission_rate,
        gross_commission: -contractCommission, // 음수
        tax_amount: -contractTax, // 음수
        net_commission: -contractNet, // 음수
        settlement_month: currentMonth, // 환수 적용월
        contract_date: settlement.contract_date || '', // 원본 계약일 보존
        status: '환수',
        is_clawback: true,
        original_item_id: settlement.id, // 원본 정산 항목 ID 연결
        clawback_applied_at: clawbackAppliedAt, // 환수 적용일
      };
      
      // 환수 항목 추가
      const newClawbackRef = doc(collection(db, 'settlements'));
      batch.set(newClawbackRef, {
        ...clawbackData,
        created_at: Timestamp.now(),
      });
      
      clawbackDataList.push({ ...clawbackData, id: newClawbackRef.id } as any);
      totalClawbackAmount += contractNet;
    }
    
    // 배치 커밋 (원자적 실행)
    await batch.commit();
    
    // 생성된 환수 항목 반환
    const clawbackItems: SettlementItem[] = clawbackDataList.map(data => ({
      ...data,
      created_at: new Date(),
    } as SettlementItem));
    
    console.log('Clawback batch completed:', clawbackItems.length, '건, 원본 정산 유지됨');
    
    return { 
      clawbackCreated: clawbackItems.length > 0, 
      clawbackItems, 
      totalClawbackAmount: Math.round(totalClawbackAmount * 100) / 100 
    };
  } catch (error) {
    console.error('Error processing clawback batch:', error);
    return { clawbackCreated: false, clawbackItems: [], totalClawbackAmount: 0 };
  }
};

// 정산 항목 수정
export const updateSettlementItem = async (id: string, data: Partial<SettlementItem>): Promise<void> => {
  const updateData = { ...data, updated_at: Timestamp.now() };
  delete (updateData as any).id;
  delete (updateData as any).created_at;
  await updateDoc(doc(db, 'settlements', id), updateData);
};

// 정산 항목 삭제
export const deleteSettlementItem = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'settlements', id));
};

export const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
};

// UTM 소스 → 유입경로 매핑 (구글 기본은 dm)
const UTM_SOURCE_MAP: Record<string, EntrySourceType> = {
  cashnote: '캐시노트 인앱광고',
  google: '구글애즈(dm)',
};

export const mapUtmToEntrySource = (
  utmSource?: string,
  source?: string,
  utmCampaign?: string,
  utmMedium?: string,
): EntrySourceType => {
  if (source === 'GoogleAds_Agency_Sheet') return '구글애즈(QS)';
  if (utmCampaign === 'policy_funds_cashnote') return '캐시노트 인앱광고';
  if (utmCampaign === 'policy_funds_qs_easy') return '구글애즈(QSe)';
  // 디스플레이 캠페인 (display medium) → dp-e
  if (utmCampaign === 'policy_funds_easy' && utmMedium === 'display') return '구글애즈(dp-e)';
  if (utmCampaign === 'policy_funds_easy') return '구글애즈(dm-e)';
  if (utmCampaign === 'policy_funds_detail') return '구글애즈(dm-d)';
  if (!utmSource || utmSource === 'direct' || utmSource === 'organic') return '광고';
  const mapped = UTM_SOURCE_MAP[utmSource.toLowerCase()];
  return mapped || '광고';
};

// 기존 DB에 저장된 구버전 라벨 → 신버전 라벨 정규화 (표시/집계 시 사용)
// 저장 데이터는 유지하고 화면에서만 신규 명칭으로 보이도록 함
export const normalizeEntrySource = (value?: string | null): EntrySourceType => {
  if (!value) return '광고';
  if (value === '구글애즈') return '구글애즈(dm)';
  if (value === '구글애즈(e)') return '구글애즈(dm-e)';
  if (value === '구글애즈(D)') return '구글애즈(dm-d)';
  return value as EntrySourceType;
};

// 수당률 조회 (유입경로별)
export const getCommissionRate = (rates: CommissionRates | undefined, entrySource: EntrySourceType): number => {
  if (!rates) return 0;
  switch (entrySource) {
    case '광고':
    case '캐시노트 인앱광고':
    case '구글애즈':
    case '구글애즈(QS)':
    case '구글애즈(QSe)':
    case '구글애즈(e)':
    case '구글애즈(D)':
    case '구글애즈(dm)':
    case '구글애즈(dm-e)':
    case '구글애즈(dm-d)':
    case '구글애즈(dp-e)':
      return rates.ad || 0;
    case '고객소개':
      return rates.referral || 0;
    case '승인복제':
      return rates.reExecution || 0;
    case '외주':
      return rates.outsource || 0;
    default:
      return 0;
  }
};

// 계약금(선수금) 수당율 조회 - 광고, 지인소개만 해당
export const getDepositCommissionRate = (rates: CommissionRates | undefined, entrySource: EntrySourceType): number => {
  if (!rates) return 0;
  switch (entrySource) {
    case '광고':
    case '캐시노트 인앱광고':
    case '구글애즈':
    case '구글애즈(QS)':
    case '구글애즈(QSe)':
    case '구글애즈(e)':
    case '구글애즈(D)':
    case '구글애즈(dm)':
    case '구글애즈(dm-e)':
    case '구글애즈(dm-d)':
    case '구글애즈(dp-e)':
      return rates.adDeposit || rates.ad || 0;
    case '고객소개':
      return rates.referralDeposit || rates.referral || 0;
    case '승인복제':
    case '외주':
      return 0;
    default:
      return 0;
  }
};

// 정산 계산 (계약금과 자문료에 별도 수당율 적용)
export const calculateSettlement = (
  contractAmount: number,
  executionAmount: number,
  feeRate: number,
  commissionRate: number,
  depositCommissionRate?: number
): { totalRevenue: number; grossCommission: number; taxAmount: number; netCommission: number } => {
  const advisoryFee = executionAmount * feeRate / 100;
  const totalRevenue = contractAmount + advisoryFee;
  
  const depositRate = depositCommissionRate ?? commissionRate;
  const contractCommission = contractAmount * depositRate / 100;
  const advisoryCommission = advisoryFee * commissionRate / 100;
  const grossCommission = contractCommission + advisoryCommission;
  
  const taxAmount = grossCommission * 0.033;
  const netCommission = grossCommission * 0.967;
  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    grossCommission: Math.round(grossCommission * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    netCommission: Math.round(netCommission * 100) / 100,
  };
};

// 월별 정산 요약 계산 (Point-in-time 정확성 보장)
// - 해당 월의 원본 정산 항목은 모두 포함 (is_clawback=false)
// - 해당 월에 발생한 환수 항목도 포함 (is_clawback=true)
// - 환수 적용월에만 환수 금액이 차감됨
export const calculateMonthlySettlementSummary = (
  items: SettlementItem[],
  managerId: string,
  managerName: string,
  month: string
): MonthlySettlementSummary => {
  const managerItems = items.filter(item => item.manager_id === managerId && item.settlement_month === month);
  
  // 원본 정산 항목: 환수 항목이 아닌 모든 항목 (status와 관계없이)
  // Point-in-time: 12월 정산을 볼 때 12월에 발생한 원본 계약은 모두 표시
  // 나중에 환수되더라도 원본 정산월에는 양수로 표시되어야 함
  const originalItems = managerItems.filter(item => !item.is_clawback);
  
  // 환수 항목: 해당 월에 환수가 적용된 항목 (음수 값)
  const clawbackItems = managerItems.filter(item => item.is_clawback);
  
  // 계약 건수: 고유 고객 수로 계산 (같은 고객의 중복 승인/재집행은 1건으로 처리)
  const uniqueCustomerIds = new Set(originalItems.map(item => item.customer_id));
  const totalContracts = uniqueCustomerIds.size;
  // 계약금 수당: 계약금 * 계약금 수당율 적용 (deposit_commission_rate 우선, 없으면 commission_rate 사용)
  const totalContractAmount = originalItems.reduce((sum, item) => sum + (item.contract_amount * (item.deposit_commission_rate ?? item.commission_rate) / 100), 0);
  // 집행 건수: 실제 집행된 기관 수 (각 기관별 집행을 개별 건수로 카운트) + 채무조정 건
  const executedItems = originalItems.filter(item => item.execution_amount > 0 || item.is_debt_adjustment);
  const executionCount = executedItems.length;
  const totalExecutionAmount = originalItems.reduce((sum, item) => sum + item.execution_amount, 0);
  const totalRevenue = originalItems.reduce((sum, item) => sum + item.total_revenue, 0);
  // 총 자문금액 = 집행금액 × 자문료율% × 수당률%
  const totalExecutionFee = originalItems.reduce((sum, item) => {
    return sum + (item.execution_amount * (item.fee_rate / 100) * (item.commission_rate / 100));
  }, 0);
  const totalGrossCommission = originalItems.reduce((sum, item) => sum + item.gross_commission, 0);
  const totalTax = originalItems.reduce((sum, item) => sum + item.tax_amount, 0);
  const totalNetCommission = originalItems.reduce((sum, item) => sum + item.net_commission, 0);
  
  const clawbackCount = clawbackItems.length;
  const clawbackAmount = clawbackItems.reduce((sum, item) => sum + Math.abs(item.net_commission), 0);
  
  const finalPayment = totalNetCommission - clawbackAmount;
  
  return {
    manager_id: managerId,
    manager_name: managerName,
    settlement_month: month,
    total_contracts: totalContracts,
    total_contract_amount: Math.round(totalContractAmount * 100) / 100,
    execution_count: executionCount,
    total_execution_amount: Math.round(totalExecutionAmount * 100) / 100,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_execution_fee: Math.round(totalExecutionFee * 100) / 100,
    total_gross_commission: Math.round(totalGrossCommission * 100) / 100,
    total_tax: Math.round(totalTax * 100) / 100,
    total_net_commission: Math.round(totalNetCommission * 100) / 100,
    clawback_count: clawbackCount,
    clawback_amount: Math.round(clawbackAmount * 100) / 100,
    final_payment: Math.round(finalPayment * 100) / 100,
  };
};

// 취소 처리 및 환수 생성
export const cancelSettlementWithClawback = async (
  item: SettlementItem,
  currentMonth: string
): Promise<SettlementItem | null> => {
  await updateSettlementItem(item.id, { status: '취소' });
  
  if (item.settlement_month < currentMonth) {
    const clawbackData: InsertSettlementItem = {
      customer_id: item.customer_id,
      customer_name: item.customer_name,
      manager_id: item.manager_id,
      manager_name: item.manager_name,
      team_id: item.team_id,
      team_name: item.team_name,
      entry_source: item.entry_source,
      contract_amount: 0,
      execution_amount: 0,
      fee_rate: 0,
      total_revenue: -item.total_revenue,
      commission_rate: item.commission_rate,
      gross_commission: -item.gross_commission,
      tax_amount: -item.tax_amount,
      net_commission: -item.net_commission,
      settlement_month: currentMonth,
      contract_date: item.contract_date,
      status: '환수',
      is_clawback: true,
      original_item_id: item.id,
    };
    return await createSettlementItem(clawbackData);
  }
  
  return null;
};

// ========== 상담 신청 (Consultations) ==========

// Firestore 데이터를 Consultation 타입으로 변환 (신규/레거시 둘 다 지원)
const mapFirestoreToConsultation = (docId: string, data: Record<string, unknown>): Consultation => {
  const createdAt = (data.createdAt as { toDate?: () => Date })?.toDate?.() 
    || (data.createdAt ? new Date(data.createdAt as string) : new Date());
  
  return {
    id: docId,
    name: (data.name as string) || (data.customername as string) || (data.customerName as string) || '',
    phone: (data.phone as string) || '',
    businessName: (data.businessName as string) || '',
    businessNumber: (data.businessNumber as string) || '',
    businessAge: (data.businessAge as string) || (data.businessStartDate as string) || '',
    revenue: (data.revenue as string) || '',
    region: (data.region as string) || '',
    creditScore: String(data.creditScore || ''),
    taxStatus: (data.taxStatus as string) || (data.taxDelinquency as string) || '',
    services: (data.services as string[]) || [],
    source: (data.source as string) || 'unknown',
    createdAt,
    email: (data.email as string) || '',
    linked_customer_id: (data.linked_customer_id as string) || undefined,
    processed: (data.processed as boolean) || false,
    utm_source: (data.utm_source as string) || (data['유입경로'] as string) || undefined,
    utm_medium: (data.utm_medium as string) || undefined,
    utm_campaign: (data.utm_campaign as string) || undefined,
  };
};

// 모든 상담 신청 데이터 가져오기
export const getConsultations = async (): Promise<Consultation[]> => {
  try {
    const consultationsRef = collection(db, 'consultations');
    const q = query(consultationsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(docSnap => 
      mapFirestoreToConsultation(docSnap.id, docSnap.data() as Record<string, unknown>)
    );
  } catch (error) {
    console.error('Error fetching consultations:', error);
    return [];
  }
};

// 특정 상담 신청 데이터 가져오기
export const getConsultationById = async (id: string): Promise<Consultation | null> => {
  try {
    const docRef = doc(db, 'consultations', id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    return mapFirestoreToConsultation(docSnap.id, docSnap.data() as Record<string, unknown>);
  } catch (error) {
    console.error('Error fetching consultation by ID:', error);
    return null;
  }
};

// 고객 ID로 연결된 상담 신청 데이터 가져오기
export const getConsultationByCustomerId = async (customerId: string): Promise<Consultation | null> => {
  try {
    const consultationsRef = collection(db, 'consultations');
    const q = query(consultationsRef, where('linked_customer_id', '==', customerId), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return null;
    
    const docSnap = snapshot.docs[0];
    return mapFirestoreToConsultation(docSnap.id, docSnap.data() as Record<string, unknown>);
  } catch (error) {
    console.error('Error fetching consultation by customer ID:', error);
    return null;
  }
};

// 상담 데이터를 고객과 연결
export const linkConsultationToCustomer = async (consultationId: string, customerId: string): Promise<void> => {
  try {
    const consultationRef = doc(db, 'consultations', consultationId);
    await updateDoc(consultationRef, {
      linked_customer_id: customerId,
    });
  } catch (error) {
    console.error('Error linking consultation to customer:', error);
    throw error;
  }
};

// 상담 데이터 처리 완료 표시
export const markConsultationProcessed = async (consultationId: string): Promise<void> => {
  try {
    const consultationRef = doc(db, 'consultations', consultationId);
    await updateDoc(consultationRef, {
      processed: true,
    });
  } catch (error) {
    console.error('Error marking consultation as processed:', error);
    throw error;
  }
};

// 전화번호로 기존 고객 조회
export const getCustomerByPhone = async (phone: string): Promise<Customer | null> => {
  try {
    const raw = phone.replace(/[-\s]/g, '').trim();
    if (raw.length < 10) return null;

    const variants = new Set<string>();
    variants.add(raw);
    if (raw.length === 11) {
      variants.add(`${raw.slice(0,3)}-${raw.slice(3,7)}-${raw.slice(7)}`);
      variants.add(`${raw.slice(0,3)}-${raw.slice(3,6)}-${raw.slice(6)}`);
    } else if (raw.length === 10) {
      variants.add(`${raw.slice(0,3)}-${raw.slice(3,6)}-${raw.slice(6)}`);
      variants.add(`${raw.slice(0,2)}-${raw.slice(2,6)}-${raw.slice(6)}`);
    }

    const customersRef = collection(db, 'customers');
    const phoneArray = Array.from(variants);

    for (let i = 0; i < phoneArray.length; i += 10) {
      const batch = phoneArray.slice(i, i + 10);
      const q = query(customersRef, where('phone', 'in', batch), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Customer;
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching customer by phone:', error);
    return null;
  }
};

// 사업자등록번호로 기존 고객 조회
export const getCustomerByBusinessNumber = async (businessNumber: string): Promise<Customer | null> => {
  try {
    if (!businessNumber || businessNumber.trim() === '') return null;

    const raw = businessNumber.replace(/[-\s]/g, '').trim();
    const variants = new Set<string>();
    variants.add(raw);
    variants.add(businessNumber.trim());
    if (raw.length === 10) {
      variants.add(`${raw.slice(0,3)}-${raw.slice(3,5)}-${raw.slice(5)}`);
    }

    const customersRef = collection(db, 'customers');
    const bizArray = Array.from(variants);

    for (let i = 0; i < bizArray.length; i += 10) {
      const batch = bizArray.slice(i, i + 10);
      const q = query(customersRef, where('business_registration_number', 'in', batch), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Customer;
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching customer by business number:', error);
    return null;
  }
};

// 상담 데이터에서 메모 요약 생성
export const generateConsultationMemoSummary = (consultation: Consultation): string => {
  const formatDate = (date: Date | string): string => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatServices = (services: string[] | undefined): string => {
    if (!services || services.length === 0) return '-';
    return services.join(', ');
  };

  const utmInfo = consultation.utm_source && consultation.utm_source !== 'direct'
    ? `\n- 유입경로: ${mapUtmToEntrySource(consultation.utm_source, consultation.source, consultation.utm_campaign, consultation.utm_medium)} (${consultation.utm_source}/${consultation.utm_medium || '-'}/${consultation.utm_campaign || '-'})`
    : '';

  return `[상담 신청 요약]
- 신청 일시: ${formatDate(consultation.createdAt)}
- 대표자명: ${consultation.name || '-'}
- 신용점수: ${consultation.creditScore || '-'}
- 업체명: ${consultation.businessName || '-'}
- 사업자등록번호: ${consultation.businessNumber || '-'}
- 지역: ${consultation.region || '-'}
- 개업일: ${consultation.businessAge || '-'}
- 매출: ${consultation.revenue || '-'}
- 세금체납: ${consultation.taxStatus || '-'}
- 신청 서비스: ${formatServices(consultation.services)}${utmInfo}`;
};

// 미처리 상담 신청 개수 조회
export const getPendingConsultationsCount = async (): Promise<number> => {
  try {
    const consultationsRef = collection(db, 'consultations');
    const snapshot = await getDocs(consultationsRef);
    
    let count = 0;
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      // processed가 명시적으로 false이거나, processed가 없고 linked_customer_id도 없는 경우
      const isUnprocessed = data.processed === false || 
        (data.processed === undefined && !data.linked_customer_id);
      if (isUnprocessed) {
        count++;
      }
    });
    
    return count;
  } catch (error) {
    console.error('Error counting pending consultations:', error);
    return 0;
  }
};

// 미처리 상담 신청 목록 조회
export const getPendingConsultations = async (): Promise<{ id: string; data: Consultation }[]> => {
  try {
    const consultationsRef = collection(db, 'consultations');
    const q = query(consultationsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const pending: { id: string; data: Consultation }[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      // processed가 명시적으로 false이거나, processed가 없고 linked_customer_id도 없는 경우
      const isUnprocessed = data.processed === false || 
        (data.processed === undefined && !data.linked_customer_id);
      if (isUnprocessed) {
        pending.push({
          id: docSnap.id,
          data: {
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(),
          } as Consultation,
        });
      }
    });
    
    return pending;
  } catch (error) {
    console.error('Error fetching pending consultations:', error);
    return [];
  }
};

// 상담 데이터를 고객으로 일괄 변환 (수동 유입)
export const deleteConsultation = async (consultationId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'consultations', consultationId));
  } catch (error) {
    console.error('Error deleting consultation:', error);
    throw error;
  }
};

export const processConsultationToCustomer = async (
  consultationId: string,
  consultation: Consultation,
  managerOverride?: { managerId: string; managerName: string; managerPhone: string; teamId: string; teamName: string } | null
): Promise<Customer | null> => {
  try {
    const phone = formatPhoneNumber(consultation.phone || '');
    const name = consultation.name || '';
    const companyName = consultation.businessName || '';
    const businessNumber = consultation.businessNumber || '';
    
    if (!phone && !name && !businessNumber) {
      console.log(`⏭️ 상담 ${consultationId}: 필수 정보 없음, 건너뜀`);
      return null;
    }
    
    let existingCustomer: Customer | null = null;
    if (businessNumber) {
      existingCustomer = await getCustomerByBusinessNumber(businessNumber);
    }
    if (!existingCustomer && phone) {
      existingCustomer = await getCustomerByPhone(phone);
    }
    
    const memoSummary = generateConsultationMemoSummary(consultation);
    
    const now = new Date();
    const memoEntry = {
      content: memoSummary,
      author_id: 'system',
      author_name: '시스템',
      created_at: now,
    };

    if (existingCustomer) {
      // 기존 고객: 메모 추가 + 유입경로/유입일자(DB분배일)을 최신 상담 기준으로 갱신
      console.log(`📝 기존 고객 발견 (${existingCustomer.name}): 메모 추가 + 유입정보 갱신`);
      
      // counseling_logs에 저장
      await addDoc(collection(db, 'counseling_logs'), {
        customer_id: existingCustomer.id,
        content: memoSummary,
        author_name: '시스템',
        author_id: 'system',
        created_at: now,
        type: 'system',
      });

      // 최신 유입경로 매핑
      const newEntrySource = mapUtmToEntrySource(consultation.utm_source, consultation.source, consultation.utm_campaign, consultation.utm_medium);
      const newEntryDate = new Date().toISOString().split('T')[0]; // DB분배 기준일 = 오늘
      const prevEntrySource = existingCustomer.entry_source || '기타';
      const prevEntryDate = existingCustomer.entry_date || '';

      // 유입경로 변경 이력 메모 (변경된 경우에만)
      const entryChangeMemo = (prevEntrySource !== newEntrySource)
        ? {
            content: `[유입정보 갱신] 유입경로: ${prevEntrySource} → ${newEntrySource} / 유입일자: ${prevEntryDate || '없음'} → ${newEntryDate}`,
            author_id: 'system',
            author_name: '시스템',
            created_at: now,
          }
        : null;
      
      // 고객 문서의 memo_history 필드도 업데이트 (모달 재오픈 시 즉시 표시되도록)
      const existingMemoHistory = existingCustomer.memo_history || [];
      const updatedMemoHistory = entryChangeMemo
        ? [...existingMemoHistory, memoEntry, entryChangeMemo]
        : [...existingMemoHistory, memoEntry];
      await updateDoc(doc(db, 'customers', existingCustomer.id), {
        memo_history: updatedMemoHistory,
        recent_memo: memoSummary,
        entry_source: newEntrySource,
        entry_date: newEntryDate,
        utm_source: consultation.utm_source || existingCustomer.utm_source || 'direct',
        utm_medium: consultation.utm_medium || existingCustomer.utm_medium || 'direct',
        utm_campaign: consultation.utm_campaign || existingCustomer.utm_campaign || 'direct',
        updated_at: Timestamp.now(),
      });

      if (entryChangeMemo) {
        await addDoc(collection(db, 'counseling_logs'), {
          customer_id: existingCustomer.id,
          content: entryChangeMemo.content,
          author_name: '시스템',
          author_id: 'system',
          created_at: now,
          type: 'system',
        });
      }
      
      // 상담 처리 완료 및 연결
      await markConsultationProcessed(consultationId);
      await linkConsultationToCustomer(consultationId, existingCustomer.id);
      
      return existingCustomer;
    } else {
      // 신규 고객 생성
      console.log(`✨ 신규 고객 생성: ${name || companyName}`);
      
      const assignedManager = managerOverride !== undefined 
        ? managerOverride 
        : await getNextManagerForAssignment();
      
      const customerData: InsertCustomer & { manager_name?: string; team_name?: string; memo_history?: any[]; services?: string[] } = {
        name: name,
        company_name: companyName,
        phone: phone,
        business_registration_number: consultation.businessNumber || '',
        credit_score: 0,
        entry_source: mapUtmToEntrySource(consultation.utm_source, consultation.source, consultation.utm_campaign, consultation.utm_medium),
        entry_date: new Date().toISOString().split('T')[0],
        status_code: '상담대기' as StatusCode,
        recent_memo: memoSummary,
        memo_history: [memoEntry], // 메모 이력에도 저장
        manager_id: assignedManager?.managerId || '',
        manager_name: assignedManager?.managerName || '미배정',
        team_id: assignedManager?.teamId || '',
        team_name: assignedManager?.teamName || '미배정',
        approved_amount: 0,
        commission_rate: 0,
        services: consultation.services || [],
        utm_source: consultation.utm_source || 'direct',
        utm_medium: consultation.utm_medium || 'direct',
        utm_campaign: consultation.utm_campaign || 'direct',
      };
      
      const newCustomer = await createCustomer(customerData);
      
      // 상담 로그 추가
      await addDoc(collection(db, 'counseling_logs'), {
        customer_id: newCustomer.id,
        content: memoSummary,
        author_name: '시스템',
        author_id: 'system',
        created_at: now,
        type: 'system',
      });
      
      // 상담 처리 완료 및 연결
      await markConsultationProcessed(consultationId);
      await linkConsultationToCustomer(consultationId, newCustomer.id);
      
      // 담당자 배정 알림톡 발송 (담당자가 배정된 경우에만)
      if (assignedManager && phone) {
        try {
          const { authFetch } = await import('./firebase');
          await authFetch('/api/solapi/assignment-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerPhone: phone,
              customerName: name || companyName,
              managerName: assignedManager.managerName,
              managerPhone: assignedManager.managerPhone,
              region: consultation.region || '',
            }),
          });
          console.log(`📤 담당자 배정 알림톡 발송 요청: ${name || companyName} → ${assignedManager.managerName}`);
        } catch (notifyError) {
          console.error('담당자 배정 알림톡 발송 실패:', notifyError);
          // 알림톡 발송 실패해도 고객 생성은 성공으로 처리
        }
      }
      
      return newCustomer;
    }
  } catch (error) {
    console.error(`❌ 상담 처리 실패 (${consultationId}):`, error);
    throw error;
  }
};

// 모든 미처리 상담을 일괄 처리
export const importAllPendingConsultations = async (): Promise<{
  success: number;
  failed: number;
  newCustomers: number;
  existingCustomers: number;
}> => {
  const pending = await getPendingConsultations();
  
  let success = 0;
  let failed = 0;
  let newCustomers = 0;
  let existingCustomers = 0;
  
  for (const { id, data } of pending) {
    try {
      const businessNumber = data.businessNumber || '';
      const phone = data.phone ? data.phone.replace(/[-\s]/g, '').trim() : '';
      let wasExisting = false;
      
      if (businessNumber) {
        const existing = await getCustomerByBusinessNumber(businessNumber);
        wasExisting = !!existing;
      }
      if (!wasExisting && phone) {
        const existing = await getCustomerByPhone(phone);
        wasExisting = !!existing;
      }
      
      await processConsultationToCustomer(id, data);
      success++;
      
      if (wasExisting) {
        existingCustomers++;
      } else {
        newCustomers++;
      }
    } catch (error) {
      console.error(`Failed to process consultation ${id}:`, error);
      failed++;
    }
  }
  
  return { success, failed, newCustomers, existingCustomers };
};

// ========== 회사 정산 관련 함수 (Expenses) ==========

// 비용 항목 조회 (월별) - 반복 비용도 포함
export const getExpensesByMonth = async (month: string): Promise<Expense[]> => {
  // 1. 해당 월의 일반 비용 조회
  const monthQuery = query(
    collection(db, 'expenses'),
    where('month', '==', month)
  );
  const monthSnapshot = await getDocs(monthQuery);
  const monthExpenses = monthSnapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate((doc.data() as any).created_at),
    updated_at: (doc.data() as any).updated_at ? toDate((doc.data() as any).updated_at) : undefined,
  } as Expense));
  
  // 2. 반복 비용 조회 (복합 인덱스 없이 클라이언트 필터링)
  const recurringQuery = query(
    collection(db, 'expenses'),
    where('is_recurring', '==', true)
  );
  const recurringSnapshot = await getDocs(recurringQuery);
  const recurringExpenses = recurringSnapshot.docs
    .map(doc => ({
      ...doc.data(),
      id: doc.id,
      created_at: toDate((doc.data() as any).created_at),
      updated_at: (doc.data() as any).updated_at ? toDate((doc.data() as any).updated_at) : undefined,
    } as Expense))
    .filter(exp => exp.month <= month && exp.month !== month); // 시작월 이전이거나 같은 월은 제외
  
  // 3. 합치고 카테고리, 이름순 정렬
  const allExpenses = [...monthExpenses, ...recurringExpenses];
  allExpenses.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
  
  return allExpenses;
};

// 전체 비용 항목 조회
export const getAllExpenses = async (): Promise<Expense[]> => {
  const q = query(
    collection(db, 'expenses'),
    orderBy('month', 'desc'),
    orderBy('category'),
    orderBy('name')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate((doc.data() as any).created_at),
    updated_at: (doc.data() as any).updated_at ? toDate((doc.data() as any).updated_at) : undefined,
  } as Expense));
};

// 반복 비용 항목 조회 (매월 반복)
export const getRecurringExpenses = async (): Promise<Expense[]> => {
  const q = query(
    collection(db, 'expenses'),
    where('is_recurring', '==', true)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate((doc.data() as any).created_at),
    updated_at: (doc.data() as any).updated_at ? toDate((doc.data() as any).updated_at) : undefined,
  } as Expense));
};

// 비용 항목 생성
export const createExpense = async (data: InsertExpense): Promise<Expense> => {
  const docRef = await addDoc(collection(db, 'expenses'), {
    ...data,
    created_at: Timestamp.now(),
  });
  
  return {
    ...data,
    id: docRef.id,
    created_at: new Date(),
  };
};

// 비용 항목 수정
export const updateExpense = async (id: string, data: Partial<Expense>): Promise<void> => {
  await updateDoc(doc(db, 'expenses', id), {
    ...data,
    updated_at: Timestamp.now(),
  });
};

// 비용 항목 삭제
export const deleteExpense = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'expenses', id));
};

// 월별 비용 카테고리별 합계 계산 (반복 비용 자동 포함)
export const getExpenseSummaryByMonth = async (month: string): Promise<{
  marketing: number;
  fixed: number;
  operational: number;
  other: number;
  total: number;
}> => {
  // getExpensesByMonth가 이미 반복 비용을 포함하므로 그대로 사용
  const expenses = await getExpensesByMonth(month);
  
  const summary = {
    marketing: 0,
    fixed: 0,
    operational: 0,
    other: 0,
    total: 0,
  };
  
  expenses.forEach(expense => {
    const amountInMan = expense.amount / 10000;
    switch (expense.category) {
      case '마케팅비':
        summary.marketing += amountInMan;
        break;
      case '고정비':
        summary.fixed += amountInMan;
        break;
      case '운영비':
        summary.operational += amountInMan;
        break;
      case '기타':
        summary.other += amountInMan;
        break;
    }
    summary.total += amountInMan;
  });
  
  return summary;
};

// 월별 광고 유입 DB 수 조회
export const getAdDbCountByMonth = async (month: string): Promise<number> => {
  const startDate = `${month}-01`;
  const endDate = `${month}-31`;
  
  const q = query(
    collection(db, 'customers'),
    where('entry_source', '==', '광고'),
    where('entry_date', '>=', startDate),
    where('entry_date', '<=', endDate)
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
};

// 월별 확정 계약 건수 조회 (정상 상태만)
export const getContractCountByMonth = async (month: string): Promise<number> => {
  const q = query(
    collection(db, 'settlements'),
    where('settlement_month', '==', month),
    where('status', '==', '정상'),
    where('is_clawback', '==', false)
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
};

// 월별 총 매출 및 환수 계산 (settlements 기반)
// Point-in-time 정확성: 환수 항목이 아닌 원본 정산은 모두 포함 (status 관계없이)
// 12월 정산을 볼 때 12월에 발생한 계약은 나중에 환수되더라도 양수로 표시
export const getRevenueDataByMonth = async (month: string): Promise<{
  totalDeposits: number;
  clawbackLoss: number;
  grossRevenue: number;
  employeeCommission: number;
  contractCount: number;
  executionCount: number;
  totalContractAmount: number;
  totalAdvisoryFee: number;
}> => {
  const q = query(
    collection(db, 'settlements'),
    where('settlement_month', '==', month)
  );
  const snapshot = await getDocs(q);
  
  let totalDeposits = 0;
  let clawbackLoss = 0;
  let employeeCommission = 0;
  let totalContractAmount = 0;
  let totalAdvisoryFee = 0;
  
  // 고유 고객 수 추적 (계약 건수용)
  const uniqueContractCustomerIds = new Set<string>();
  // 집행 건수: 실제 집행된 기관 수
  let executionCount = 0;
  
  snapshot.docs.forEach(doc => {
    const data = doc.data() as SettlementItem;
    
    if (data.is_clawback) {
      // 환수 항목: total_revenue의 절대값을 환수 손실로 기록
      clawbackLoss += Math.abs(data.total_revenue || 0);
    } else {
      // 원본 정산 항목: status와 관계없이 모두 집계 (Point-in-time 정확성)
      // 나중에 환수/취소되더라도 해당 월에는 원래 수익으로 표시
      totalDeposits += data.total_revenue || 0;
      employeeCommission += data.gross_commission || 0;
      totalContractAmount += data.contract_amount || 0;
      
      // 고유 고객 ID로 계약 건수 집계
      if (data.customer_id) {
        uniqueContractCustomerIds.add(data.customer_id);
      }
      
      if ((data.execution_amount || 0) > 0) {
        // 집행 건수: 각 기관별 집행을 개별 건수로 카운트
        executionCount++;
        const advisoryFee = (data.execution_amount || 0) * ((data.fee_rate || 0) / 100);
        totalAdvisoryFee += advisoryFee;
      } else if (data.is_debt_adjustment) {
        // 채무조정 정산: 집행 건수에 포함 (총 자문료에는 total_revenue를 그대로 합산)
        executionCount++;
        totalAdvisoryFee += data.total_revenue || 0;
      }
    }
  });
  
  return {
    totalDeposits,
    clawbackLoss,
    grossRevenue: totalDeposits - clawbackLoss,
    employeeCommission,
    contractCount: uniqueContractCustomerIds.size,
    executionCount,
    totalContractAmount,
    totalAdvisoryFee,
  };
};

export const getCumulativeSummary = async (): Promise<{
  totalRevenue: number;
  totalExpense: number;
  totalEmployeeCommission: number;
  netProfit: number;
  netProfitRate: number;
}> => {
  const [settlementsSnapshot, expensesSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'settlements'))),
    getDocs(query(collection(db, 'expenses'))),
  ]);

  let totalDeposits = 0;
  let clawbackLoss = 0;
  let totalEmployeeCommission = 0;

  settlementsSnapshot.docs.forEach(doc => {
    const data = doc.data() as SettlementItem;
    if (data.is_clawback) {
      clawbackLoss += Math.abs(data.total_revenue || 0);
    } else {
      totalDeposits += data.total_revenue || 0;
      totalEmployeeCommission += data.gross_commission || 0;
    }
  });

  const totalRevenue = totalDeposits - clawbackLoss;

  let totalExpenseWon = 0;
  const allMonths = new Set<string>();

  settlementsSnapshot.docs.forEach(doc => {
    const data = doc.data() as SettlementItem;
    if (data.settlement_month) allMonths.add(data.settlement_month);
  });
  expensesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.month) allMonths.add(data.month);
  });

  expensesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const amount = data.amount || 0;
    if (data.is_recurring) {
      const startMonth = data.month;
      const sortedMonths = Array.from(allMonths).sort();
      sortedMonths.forEach(m => {
        if (m >= startMonth) {
          totalExpenseWon += amount;
        }
      });
    } else {
      totalExpenseWon += amount;
    }
  });

  const totalExpense = totalExpenseWon / 10000;
  const netProfit = totalRevenue - totalEmployeeCommission - totalExpense;
  const netProfitRate = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalExpense,
    totalEmployeeCommission,
    netProfit,
    netProfitRate,
  };
};

export const getCumulativeTaxReserve = async (upToMonth: string): Promise<number> => {
  const q = query(collection(db, 'settlements'));
  const snapshot = await getDocs(q);
  
  let cumulativeRevenue = 0;
  
  snapshot.docs.forEach(doc => {
    const data = doc.data() as SettlementItem;
    const settlementMonth = data.settlement_month;
    
    if (settlementMonth && settlementMonth <= upToMonth) {
      if (data.is_clawback) {
        cumulativeRevenue -= Math.abs(data.total_revenue || 0);
      } else {
        cumulativeRevenue += data.total_revenue || 0;
      }
    }
  });
  
  return Math.round(cumulativeRevenue * 0.15);
};

// ========================================
// 연차 관리 (Leave Requests)
// ========================================

const mapLeaveRequestDoc = (docSnap: any): LeaveRequest => ({
  id: docSnap.id,
  ...docSnap.data(),
  created_at: toDate(docSnap.data().created_at),
  updated_at: docSnap.data().updated_at ? toDate(docSnap.data().updated_at) : undefined,
  leader_approved_at: docSnap.data().leader_approved_at ? toDate(docSnap.data().leader_approved_at) : undefined,
  admin_approved_at: docSnap.data().admin_approved_at ? toDate(docSnap.data().admin_approved_at) : undefined,
  rejected_at: docSnap.data().rejected_at ? toDate(docSnap.data().rejected_at) : undefined,
  cancelled_at: docSnap.data().cancelled_at ? toDate(docSnap.data().cancelled_at) : undefined,
});

const sortByCreatedAtDesc = (a: LeaveRequest, b: LeaveRequest) => 
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

export const getLeaveRequests = async (): Promise<LeaveRequest[]> => {
  const snapshot = await getDocs(collection(db, 'leave_requests'));
  return snapshot.docs.map(mapLeaveRequestDoc).sort(sortByCreatedAtDesc);
};

export const getLeaveRequestsByUser = async (userId: string): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leave_requests'),
    where('user_id', '==', userId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapLeaveRequestDoc).sort(sortByCreatedAtDesc);
};

export const getLeaveRequestsByTeam = async (teamId: string): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leave_requests'),
    where('team_id', '==', teamId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapLeaveRequestDoc).sort(sortByCreatedAtDesc);
};

export const getLeaveRequestsByStatus = async (status: LeaveStatus): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leave_requests'),
    where('status', '==', status)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapLeaveRequestDoc).sort(sortByCreatedAtDesc);
};

export const createLeaveRequest = async (data: InsertLeaveRequest): Promise<string> => {
  const docRef = await addDoc(collection(db, 'leave_requests'), {
    ...data,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
  return docRef.id;
};

export const approveLeaveByLeader = async (
  requestId: string,
  approverId: string,
  approverName: string
): Promise<void> => {
  await updateDoc(doc(db, 'leave_requests', requestId), {
    status: 'pending_admin',
    leader_approved_by: approverId,
    leader_approved_name: approverName,
    leader_approved_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
};

export const approveLeaveByAdmin = async (
  requestId: string,
  approverId: string,
  approverName: string,
  userId: string,
  leaveDays: number
): Promise<void> => {
  const batch = writeBatch(db);
  
  batch.update(doc(db, 'leave_requests', requestId), {
    status: 'approved',
    admin_approved_by: approverId,
    admin_approved_name: approverName,
    admin_approved_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
  
  const userDocRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userDocRef);
  if (userDoc.exists()) {
    const userData = userDoc.data();
    const currentUsed = userData.usedLeave || 0;
    batch.update(userDocRef, {
      usedLeave: currentUsed + leaveDays,
      updated_at: Timestamp.now(),
    });
  }
  
  await batch.commit();
};

export const rejectLeaveRequest = async (
  requestId: string,
  rejecterId: string,
  rejecterName: string,
  reason: string
): Promise<void> => {
  await updateDoc(doc(db, 'leave_requests', requestId), {
    status: 'rejected',
    rejected_by: rejecterId,
    rejected_name: rejecterName,
    rejected_at: Timestamp.now(),
    rejected_reason: reason,
    updated_at: Timestamp.now(),
  });
};

export const deleteLeaveRequest = async (requestId: string): Promise<void> => {
  await deleteDoc(doc(db, 'leave_requests', requestId));
};

export const cancelApprovedLeave = async (
  requestId: string,
  cancelledBy: string,
  cancelledByName: string,
  userId: string,
  leaveDays: number
): Promise<void> => {
  // 1. 연차 신청 상태를 cancelled로 변경
  await updateDoc(doc(db, 'leave_requests', requestId), {
    status: 'cancelled',
    cancelled_by: cancelledBy,
    cancelled_by_name: cancelledByName,
    cancelled_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
  
  // 2. 사용자의 usedLeave 차감 (잔여 연차 복원)
  const userDocRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userDocRef);
  if (userDoc.exists()) {
    const userData = userDoc.data();
    const currentUsed = userData.usedLeave || 0;
    const newUsedLeave = Math.max(0, currentUsed - leaveDays);
    await updateDoc(userDocRef, {
      usedLeave: newUsedLeave,
      updated_at: Timestamp.now(),
    });
  }
};

export const getLeaveSummary = async (userId: string): Promise<LeaveSummary> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  
  let totalLeave = 15;
  let usedLeave = 0;
  
  if (userDoc.exists()) {
    const userData = userDoc.data();
    totalLeave = userData.totalLeave ?? 15;
    usedLeave = userData.usedLeave ?? 0;
  }
  
  const userRequestsQuery = query(
    collection(db, 'leave_requests'),
    where('user_id', '==', userId)
  );
  const userRequestsSnapshot = await getDocs(userRequestsQuery);
  
  const pendingCount = userRequestsSnapshot.docs.filter(docSnap => {
    const status = docSnap.data().status;
    return status === 'pending_leader' || status === 'pending_admin';
  }).length;
  
  return {
    totalLeave,
    usedLeave,
    remainingLeave: totalLeave - usedLeave,
    pendingCount,
  };
};

export const updateUserLeaveQuota = async (userId: string, totalLeave: number): Promise<void> => {
  await updateDoc(doc(db, 'users', userId), {
    totalLeave,
    updated_at: Timestamp.now(),
  });
};

// ============================================
// 전자계약 (eformsign) CRUD
// ============================================

export const createContract = async (contract: InsertContract): Promise<Contract> => {
  const now = Timestamp.now();
  const docData: Record<string, any> = {
    ...contract,
    created_at: now,
  };
  if (contract.sent_at) {
    docData.sent_at = Timestamp.fromDate(contract.sent_at instanceof Date ? contract.sent_at : new Date(contract.sent_at));
  }
  if (contract.completed_at) {
    docData.completed_at = Timestamp.fromDate(contract.completed_at instanceof Date ? contract.completed_at : new Date(contract.completed_at));
  }

  const docRef = await addDoc(collection(db, 'contracts_eformsign'), docData);
  return {
    id: docRef.id,
    ...contract,
    created_at: now.toDate(),
  };
};

const parseContractDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  if (val._seconds || val.seconds) return new Date((val._seconds || val.seconds) * 1000);
  return new Date();
};

export const getContracts = async (): Promise<Contract[]> => {
  const { authFetch } = await import('@/lib/firebase');
  const res = await authFetch('/api/contracts');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '계약 목록 조회 실패');
  return (json.data || []).map((c: any) => ({
    ...c,
    created_at: parseContractDate(c.created_at),
    sent_at: c.sent_at ? parseContractDate(c.sent_at) : undefined,
    completed_at: c.completed_at ? parseContractDate(c.completed_at) : undefined,
  }));
};

export const getContractsByCustomer = async (customerId: string): Promise<Contract[]> => {
  const { authFetch } = await import('@/lib/firebase');
  const res = await authFetch(`/api/contracts?customer_id=${encodeURIComponent(customerId)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '고객 계약 조회 실패');
  return (json.data || []).map((c: any) => ({
    ...c,
    created_at: parseContractDate(c.created_at),
    sent_at: c.sent_at ? parseContractDate(c.sent_at) : undefined,
    completed_at: c.completed_at ? parseContractDate(c.completed_at) : undefined,
  }));
};

export const updateContractStatus = async (
  contractId: string,
  status: ContractStatus,
  additionalData?: Partial<Contract>
): Promise<void> => {
  const updateData: Record<string, any> = { status };
  if (additionalData?.completed_at) {
    updateData.completed_at = Timestamp.fromDate(
      additionalData.completed_at instanceof Date ? additionalData.completed_at : new Date(additionalData.completed_at as any)
    );
  }
  if (additionalData?.sent_at) {
    updateData.sent_at = Timestamp.fromDate(
      additionalData.sent_at instanceof Date ? additionalData.sent_at : new Date(additionalData.sent_at as any)
    );
  }
  if (additionalData?.document_id) {
    updateData.document_id = additionalData.document_id;
  }
  await updateDoc(doc(db, 'contracts_eformsign', contractId), updateData);
};

export const getPaymentsByCustomer = async (customerId: string): Promise<PaymentRecord[]> => {
  const { authFetch } = await import('@/lib/firebase');
  const res = await authFetch(`/api/paymint/payments?customer_id=${encodeURIComponent(customerId)}`);
  const payments = await res.json();
  return (payments || []).map((p: any) => ({
    ...p,
    created_at: p.created_at?._seconds ? new Date(p.created_at._seconds * 1000) : (p.created_at ? new Date(p.created_at) : new Date()),
    updated_at: p.updated_at?._seconds ? new Date(p.updated_at._seconds * 1000) : (p.updated_at ? new Date(p.updated_at) : undefined),
  })) as PaymentRecord[];
};

export const getAllPayments = async (): Promise<PaymentRecord[]> => {
  const { authFetch } = await import('@/lib/firebase');
  const res = await authFetch('/api/paymint/payments');
  const payments = await res.json();
  return (payments || []).map((p: any) => ({
    ...p,
    created_at: p.created_at?._seconds ? new Date(p.created_at._seconds * 1000) : (p.created_at ? new Date(p.created_at) : new Date()),
    updated_at: p.updated_at?._seconds ? new Date(p.updated_at._seconds * 1000) : (p.updated_at ? new Date(p.updated_at) : undefined),
  })) as PaymentRecord[];
};
