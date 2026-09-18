// 账号 / 登录状态 —— 唯一真源
// 游客模式已按产品要求移除：桌面端与 Web 端都必须登录才能使用。
import { create } from 'zustand';

export interface AuthUser {
  id: number;
  username: string;
  role?: string;
}

interface AuthState {
  /** 登录页是否可见 */
  loginVisible: boolean;
  /** 当前用户（null = 未登录 → 强制显示登录页） */
  user: AuthUser | null;
  /** 应用启动时从本地恢复 */
  init: () => void;
  /** 登录成功（LoginPage 回调） */
  signIn: (user: AuthUser) => void;
  /** 打开登录页（防御性保留） */
  openLogin: () => void;
  /** 退出登录：清凭据并回到登录页 */
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  loginVisible: false,
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
