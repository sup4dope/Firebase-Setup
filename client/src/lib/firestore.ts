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
} from '@shared/types';
import { STATUS_LABELS } from '@shared/types';

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

// Teams
export const getTeams = async (): Promise<Team[]> => {
  const snapshot = await getDocs(collection(db, 'teams'));
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate(doc.data().created_at),
  } as Team));
};

export const createTeam = async (team: InsertTeam): Promise<Team> => {
  const docRef = await addDoc(collection(db, 'teams'), {
    ...team,
    created_at: Timestamp.now(),
  });
  return {
    id: docRef.id,
    ...team,
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
  const q = query(collection(db, 'customers'), orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate(doc.data().created_at),
  } as Customer));
};

export const getCustomersByManager = async (managerId: string): Promise<Customer[]> => {
  const q = query(
    collection(db, 'customers'),
    where('manager_id', '==', managerId),
    orderBy('created_at', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate(doc.data().created_at),
  } as Customer));
};

export const getCustomersByTeam = async (teamId: string): Promise<Customer[]> => {
  const q = query(
    collection(db, 'customers'),
    where('team_id', '==', teamId),
    orderBy('created_at', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    created_at: toDate(doc.data().created_at),
  } as Customer));
};

export const createCustomer = async (customer: InsertCustomer): Promise<Customer> => {
  const readable_id = await generateReadableId();
  const docRef = await addDoc(collection(db, 'customers'), {
    ...customer,
    readable_id,
    created_at: Timestamp.now(),
  });
  return {
    id: docRef.id,
    readable_id,
    ...customer,
    created_at: new Date(),
  };
};

export const updateCustomer = async (id: string, data: Partial<Customer>): Promise<void> => {
  await updateDoc(doc(db, 'customers', id), data);
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
  batch.update(doc(db, 'customers', customerId), { 
    status_code: newStatus,
    // If reaching contract completion for the first time
    ...(newStatus === '4-3' && { contract_completion_date: new Date().toISOString().split('T')[0] })
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
    const oldLabel = STATUS_LABELS[previousStatus] || previousStatus;
    const newLabel = STATUS_LABELS[newStatus] || newStatus;
    await addCustomerHistoryLog({
      customer_id: customerId,
      action_type: 'status_change',
      description: `상태 변경: ${oldLabel} → ${newLabel}`,
      changed_by: userId,
      changed_by_name: userName,
      old_value: oldLabel,
      new_value: newLabel,
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
