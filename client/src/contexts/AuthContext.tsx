import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  type User as FirebaseUser 
} from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import { updateLoginHistory } from '@/lib/firestore';
import type { User, UserRole, LoginHistory } from '@shared/types';

// IP 주소 가져오기 함수
const fetchClientIP = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'Unknown';
  } catch {
    return 'Unknown';
  }
};

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isStaff: boolean;
  isTeamLeader: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const userDocIdRef = useRef<string | null>(null);
  const statusUnsubscribeRef = useRef<(() => void) | null>(null);

  // 퇴직자 로그아웃 처리 함수
  const handleRetiredLogout = async () => {
    window.alert("접속 권한이 없습니다. (퇴사 처리된 계정입니다)");
    await firebaseSignOut(auth);
    setUser(null);
    window.location.href = '/login';
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      
      // 이전 상태 리스너 정리
      if (statusUnsubscribeRef.current) {
        statusUnsubscribeRef.current();
        statusUnsubscribeRef.current = null;
      }
      
      if (fbUser) {
        // 화이트리스트 체크: 이메일로 users 컬렉션 조회
        const userEmail = fbUser.email;
        
        if (!userEmail) {
          // 이메일이 없는 경우 로그아웃
          window.alert("이메일 정보를 가져올 수 없습니다. 다시 로그인해 주세요.");
          await firebaseSignOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }
        
        // Firestore에서 이메일로 사용자 조회
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', userEmail));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          // 미등록 사용자: alert 후 로그아웃 처리
          window.alert("등록된 승인 사용자가 아닙니다. 관리자에게 문의하세요.");
          await firebaseSignOut(auth);
          setUser(null);
          setLoading(false);
          // 로그인 페이지로 리다이렉트 (wouter 사용 시 window.location 사용)
          window.location.href = '/login';
          return;
        }
        
        // 등록된 사용자: 문서 데이터 로드
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data() as User;
        userDocIdRef.current = userDoc.id;
        
        // 퇴직자 체크: status가 '퇴사'인 경우 접근 차단
        if (userData.status === '퇴사') {
          await handleRetiredLogout();
          setLoading(false);
          return;
        }
        
        // uid가 아직 설정되지 않았거나 다르면 업데이트 (최초 로그인 시 uid 연결)
        if (!userData.uid || userData.uid !== fbUser.uid) {
          await updateDoc(doc(db, 'users', userDoc.id), {
            uid: fbUser.uid,
            name: fbUser.displayName || userData.name,
          });
          userData.uid = fbUser.uid;
          userData.name = fbUser.displayName || userData.name;
        }
        
        // 로그인 이력 기록 (실제 로그인 시에만 - 새로고침 제외)
        // sessionStorage를 사용해서 현재 세션에서 이미 기록했는지 확인
        const sessionLoginKey = `login_recorded_${fbUser.uid}`;
        const alreadyRecorded = sessionStorage.getItem(sessionLoginKey);
        
        if (!alreadyRecorded) {
          try {
            const clientIP = await fetchClientIP();
            const existingHistory: LoginHistory[] = (userData.login_history || []).map(h => ({
              ...h,
              logged_at: h.logged_at instanceof Timestamp 
                ? (h.logged_at as Timestamp).toDate() 
                : new Date(h.logged_at as unknown as string),
            }));
            await updateLoginHistory(userDoc.id, clientIP, existingHistory);
            userData.current_ip = clientIP;
            // 세션에 기록 완료 표시
            sessionStorage.setItem(sessionLoginKey, 'true');
          } catch (e) {
            console.error('Failed to update login history:', e);
          }
        } else {
          // 이미 기록된 경우 현재 IP만 업데이트
          try {
            const clientIP = await fetchClientIP();
            userData.current_ip = clientIP;
          } catch (e) {
            console.error('Failed to fetch IP:', e);
          }
        }
        
        setUser(userData);
        
        // 실시간 상태 감시: 관리자가 퇴사 처리하면 즉시 로그아웃
        const userDocRef = doc(db, 'users', userDoc.id);
        statusUnsubscribeRef.current = onSnapshot(userDocRef, (snapshot) => {
          if (snapshot.exists()) {
            const updatedData = snapshot.data() as User;
            // 퇴사 처리되면 즉시 로그아웃
            if (updatedData.status === '퇴사') {
              handleRetiredLogout();
            } else {
              // 다른 필드 변경 시 user 상태 업데이트
              setUser(updatedData);
            }
          }
        });
      } else {
        setUser(null);
        userDocIdRef.current = null;
      }
      
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (statusUnsubscribeRef.current) {
        statusUnsubscribeRef.current();
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const isStaff = user?.role === 'staff';
  const isTeamLeader = user?.role === 'team_leader';
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        loading,
        signInWithGoogle,
        signOut,
        isStaff,
        isTeamLeader,
        isSuperAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
