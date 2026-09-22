// 账号 / 登录状态 —— 唯一真源
// 桌面端必须登录或注册后才能使用，便于后续订阅权益与订单归属。
import { create } from 'zustand';

export interface AuthUser {
  id: number;
  username: string;
  role?: string;
}

interface AuthState {
  /** 登录页是否可见 */
  loginVisible: boolean;
  /** 当前用户（null = 尚未登录） */
  user: AuthUser | null;
  /** 应用启动时从本地恢复 */
  init: () => void;
  /** 登录成功（LoginPage 回调） */
  signIn: (user: AuthUser) => void;
  /** 打开登录页（防御性保留） */
  openLogin: () => void;
  /** 退出登录：清除本地凭据并回到登录页 */
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  loginVisible: true,
  user: null,

  init: () => {
    let user: AuthUser | null = null;
    try { user = JSON.parse(localStorage.getItem('auth_user') || 'null'); } catch { user = null; }
    if (!user) {
      try { user = JSON.parse(localStorage.getItem('desktop_user') || 'null'); } catch { user = null; }
    }
    if (!user || !user.id) user = null;
    set({ user, loginVisible: !user });
  },

  signIn: (user) => set({ user, loginVisible: false }),

  openLogin: () => set({ loginVisible: true }),

  logout: () => {
    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('desktop_user');
    } catch { /* 忽略存储异常 */ }
    set({ user: null, loginVisible: true });
  },
}));
