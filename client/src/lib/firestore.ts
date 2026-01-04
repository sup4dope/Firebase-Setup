// Firestore CRUD operations
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  limit,
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
export const getCustomers = async (): Promise<Customer[]> => {
  // updated_at 기준 내림차순 정렬 (최근 수정순)
  const q = query(collection(db, 'customers'), orderBy('updated_at', 'desc'));
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
  const q = query(
    collection(db, 'customers'),
    where('manager_id', '==', managerId),
    orderBy('updated_at', 'desc')
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

export const getCustomersByTeam = async (teamId: string): Promise<Customer[]> => {
  const q = query(
    collection(db, 'customers'),
    where('team_id', '==', teamId),
    orderBy('updated_at', 'desc')
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
    // If reaching contract completion for the first time (한글 상태명)
    ...(contractStatuses.includes(newStatus) && { contract_completion_date: new Date().toISOString().split('T')[0] })
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

// Update customer manager with history log
export const updateCustomerManager = async (
  customerId: string,
  previousManagerId: string,
  previousManagerName: string,
  newManagerId: string,
  newManagerName: string,
  changedByUserId: string,
  changedByUserName: string
): Promise<void> => {
  // Update customer manager
  await updateDoc(doc(db, 'customers', customerId), {
    manager_id: newManagerId,
    manager_name: newManagerName,
  });
  
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
  
  // 해당 팀 고객들의 team_name도 업데이트
  const customersQuery = query(collection(db, 'customers'), where('team_id', '==', teamId));
  const customersSnapshot = await getDocs(customersQuery);
  customersSnapshot.docs.forEach(customerDoc => {
    batch.update(doc(db, 'customers', customerDoc.id), {
      team_name: newName,
      updated_at: Timestamp.now(),
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

// ============ Customer Info Logs (자문료율, 계약금, 집행금액 변경 이력) ============

export interface CustomerInfoLog {
  id: string;
  customer_id: string;
  field_name: 'commission_rate' | 'contract_amount' | 'execution_amount' | 'contract_date' | 'execution_date';
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

// 고객 정보 수정 (자문료율, 계약금, 집행금액, 계약일, 집행일) 및 변경 이력 기록
export const updateCustomerInfo = async (
  customerId: string,
  updates: {
    commission_rate?: number;
    contract_amount?: number;
    execution_amount?: number;
    contract_date?: string;
    execution_date?: string;
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
  
  if (updates.execution_amount !== undefined) {
    const oldValue = currentCustomer.execution_amount || 0;
    if (Number(oldValue) !== updates.execution_amount) {
      fieldsToUpdate.execution_amount = updates.execution_amount;
      logsToAdd.push({
        customer_id: customerId,
        field_name: 'execution_amount',
        old_value: String(oldValue),
        new_value: String(updates.execution_amount),
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
  
  if (updates.execution_date !== undefined) {
    const oldValue = (currentCustomer as any).execution_date || '';
    if (oldValue !== updates.execution_date) {
      fieldsToUpdate.execution_date = updates.execution_date;
      logsToAdd.push({
        customer_id: customerId,
        field_name: 'execution_date',
        old_value: String(oldValue || '미설정'),
        new_value: String(updates.execution_date),
        changed_by: changedBy,
        changed_by_name: changedByName,
      });
    }
  }
  
  // 변경사항이 있을 때만 업데이트
  if (Object.keys(fieldsToUpdate).length > 0) {
    batch.update(customerRef, fieldsToUpdate);
    
    // 변경 이력 추가
    for (const log of logsToAdd) {
      const logRef = doc(collection(db, 'customer_info_logs'));
      batch.set(logRef, {
        ...log,
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
  '집행', '집행완료', '집행대기', '집행중',
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
export const syncCustomerSettlements = async (month: string, users: User[]): Promise<void> => {
  try {
    // 1. 모든 고객 가져오기
    const customersSnapshot = await getDocs(collection(db, 'customers'));
    const customers = customersSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        // 날짜 필드 정규화 (toDateString 헬퍼 사용)
        entry_date: toDateString(data.entry_date) || undefined,
        contract_completion_date: toDateString(data.contract_completion_date) || undefined,
      } as Customer;
    });

    // 2. 기존 정산 항목 가져오기
    const existingSettlements = await getSettlementItems(month);
    const existingSettlementMap = new Map(existingSettlements.map(s => [s.customer_id, s]));

    // 3. 정산 대상 상태이고, 해당 월에 등록된 고객 필터링
    const targetCustomers = customers.filter(customer => {
      // 정산 대상 상태인지 확인 (명시적 목록 또는 '계약'/'집행' 포함)
      const status = customer.status_code || '';
      const isTargetStatus = SETTLEMENT_TARGET_STATUSES.includes(status) ||
        status.includes('계약') || status.includes('집행');
      if (!isTargetStatus) return false;
      
      // 정산월 결정: 계약도달일 > 등록일 순서로 확인
      const dateForSettlement = customer.contract_completion_date || customer.entry_date;
      if (!dateForSettlement) return false;
      
      const settlementMonth = dateForSettlement.slice(0, 7); // YYYY-MM 형식
      return settlementMonth === month;
    });

    let createdCount = 0;
    let updatedCount = 0;

    // 4. 정산 항목 생성 또는 업데이트
    for (const customer of targetCustomers) {
      const manager = users.find(u => u.uid === customer.manager_id);
      const entrySource = (customer.entry_source || '기타') as EntrySourceType;
      const commissionRate = getCommissionRate(manager?.commissionRates, entrySource);
      const contractAmount = customer.deposit_amount || customer.contract_amount || 0;
      const executionAmount = customer.execution_amount || 0;
      // 자문료율: contract_fee_rate 우선, 없으면 commission_rate (레거시), 기본값 3%
      const feeRate = customer.contract_fee_rate || customer.commission_rate || 3;
      
      const calc = calculateSettlement(contractAmount, executionAmount, feeRate, commissionRate);
      
      // 정산일자: 계약도달일 우선, 없으면 등록일
      const contractDate = customer.contract_completion_date || customer.entry_date || '';
      
      const existingSettlement = existingSettlementMap.get(customer.id);
      
      // 해당 고객의 활성(정상) 정산 항목 찾기
      const activeSettlement = existingSettlement && 
        existingSettlement.status === '정상' && 
        !existingSettlement.is_clawback ? existingSettlement : null;
      
      if (activeSettlement) {
        // 기존 활성 정산 항목이 있으면 업데이트
        // 변경사항이 있는지 확인
        const hasChanges = 
          activeSettlement.contract_amount !== contractAmount ||
          activeSettlement.execution_amount !== executionAmount ||
          activeSettlement.fee_rate !== feeRate ||
          activeSettlement.commission_rate !== commissionRate ||
          activeSettlement.customer_name !== (customer.company_name || customer.name) ||
          activeSettlement.manager_id !== customer.manager_id;
        
        if (hasChanges) {
          await updateSettlementItem(activeSettlement.id, {
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
            gross_commission: calc.grossCommission,
            tax_amount: calc.taxAmount,
            net_commission: calc.netCommission,
            contract_date: contractDate,
          });
          updatedCount++;
        }
      } else if (!existingSettlement) {
        // 정산 항목이 전혀 없는 경우에만 신규 생성
        // (취소/환수 항목이 있는 경우 중복 생성 방지)
        // 신규 정산 항목 생성
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
          gross_commission: calc.grossCommission,
          tax_amount: calc.taxAmount,
          net_commission: calc.netCommission,
          settlement_month: month,
          contract_date: contractDate,
          status: '정상',
          is_clawback: false,
        };
        
        await createSettlementItem(settlementData);
        createdCount++;
      }
    }
    
    if (createdCount > 0 || updatedCount > 0) {
      console.log(`[Settlement Sync] 생성: ${createdCount}건, 업데이트: ${updatedCount}건`);
    }
  } catch (error) {
    console.error('Error syncing customer settlements:', error);
  }
};

// 정산 항목 조회 (월별)
export const getSettlementItems = async (month?: string): Promise<SettlementItem[]> => {
  try {
    let q;
    if (month) {
      q = query(
        collection(db, 'settlements'),
        where('settlement_month', '==', month)
      );
    } else {
      q = query(collection(db, 'settlements'));
    }
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
    console.error('Error fetching settlement items:', error);
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

// 수당률 조회 (유입경로별)
export const getCommissionRate = (rates: CommissionRates | undefined, entrySource: EntrySourceType): number => {
  if (!rates) return 0;
  switch (entrySource) {
    case '광고':
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

// 정산 계산
export const calculateSettlement = (
  contractAmount: number,
  executionAmount: number,
  feeRate: number,
  commissionRate: number
): { totalRevenue: number; grossCommission: number; taxAmount: number; netCommission: number } => {
  const totalRevenue = contractAmount + (executionAmount * feeRate / 100);
  const grossCommission = totalRevenue * commissionRate / 100;
  const taxAmount = grossCommission * 0.033;
  const netCommission = grossCommission * 0.967;
  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    grossCommission: Math.round(grossCommission * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    netCommission: Math.round(netCommission * 100) / 100,
  };
};

// 월별 정산 요약 계산
export const calculateMonthlySettlementSummary = (
  items: SettlementItem[],
  managerId: string,
  managerName: string,
  month: string
): MonthlySettlementSummary => {
  const managerItems = items.filter(item => item.manager_id === managerId && item.settlement_month === month);
  
  const normalItems = managerItems.filter(item => item.status === '정상');
  const clawbackItems = managerItems.filter(item => item.is_clawback);
  
  const totalContracts = normalItems.length;
  const totalContractAmount = normalItems.reduce((sum, item) => sum + item.contract_amount, 0);
  const executionCount = normalItems.filter(item => item.execution_amount > 0).length;
  const totalExecutionAmount = normalItems.reduce((sum, item) => sum + item.execution_amount, 0);
  const totalRevenue = normalItems.reduce((sum, item) => sum + item.total_revenue, 0);
  const totalGrossCommission = normalItems.reduce((sum, item) => sum + item.gross_commission, 0);
  const totalTax = normalItems.reduce((sum, item) => sum + item.tax_amount, 0);
  const totalNetCommission = normalItems.reduce((sum, item) => sum + item.net_commission, 0);
  
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
