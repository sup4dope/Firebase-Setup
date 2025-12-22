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
  role: 'staff' | 'team_leader' | 'super_admin';
  team_id: string | null;
  team_name: string | null;
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
  const docRef = await addDoc(collection(db, 'todo_list'), {
    ...data,
    due_date: Timestamp.fromDate(data.due_date),
    created_at: Timestamp.now(),
  });
  
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
