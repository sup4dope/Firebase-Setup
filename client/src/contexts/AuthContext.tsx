import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  type User as FirebaseUser 
} from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import type { User, UserRole } from '@shared/types';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      
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
        
        // uid가 아직 설정되지 않았거나 다르면 업데이트 (최초 로그인 시 uid 연결)
        if (!userData.uid || userData.uid !== fbUser.uid) {
          await updateDoc(doc(db, 'users', userDoc.id), {
            uid: fbUser.uid,
            name: fbUser.displayName || userData.name,
          });
          userData.uid = fbUser.uid;
          userData.name = fbUser.displayName || userData.name;
        }
        
        setUser(userData);
      } else {
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
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
