# C 盘 30GB 清理方案
生成时间：2026-08-12

## 📊 当前状态
- **C 盘容量**：201 GB
- **已使用**：182 GB (91%)
- **剩余空间**：19 GB
- **目标**：释放 30 GB，剩余约 49 GB

---

## 🎯 可转移的大目录清单

### 第一优先级：桌面文件（6.7 GB）
```
✅ 可安全转移到 E:\Desktop_Backup

- 王博弈专高5周考三 (4.6 GB) - 学习资料
- xm (897 MB)
- 时迹 (505 MB)
- 王博弈专高5周考二 (316 MB)
- 王博弈专高5周考1 (312 MB)
- 其他文件 (约 100 MB)
```

### 第二优先级：AppData 大目录（约 15 GB）

#### 可安全转移的应用数据
```
1. kingsoft (3.7 GB) - 金山软件数据
2. QQEX (2.6 GB) - QQ 数据
3. Code (2.2 GB) - VS Code 扩展
4. LarkShell (2.0 GB) - 飞书数据
5. webcast_mate (1.6 GB) - 直播软件
6. electron (1.3 GB) - Electron 应用缓存
7. Postman (932 MB) - API 测试工具
8. 5E对战平台 (825 MB)
9. KwaiLive (732 MB) - 快手直播
10. Kun (673 MB)
11. Quark (630 MB) - 夸克浏览器
12. xcdn (596 MB)

小计：约 18 GB
```

### 第三优先级：开发工具缓存（约 5 GB）
```
1. .vscode (1.2 GB) - VS Code 缓存
2. .codex (557 MB) - Codex 数据（需关闭 Claude Code）
3. .cache (1.1 GB) - 通用缓存
4. Temp (1.4 GB) - 临时文件
5. GitHubDesktop (985 MB)

小计：约 5.2 GB
```

### 第四优先级：可清理的缓存（约 5 GB）
```
1. JetBrains (2.7 GB) - IDE 缓存（可部分清理）
2. Programs (3.5 GB) - 本地安装的程序（检查后转移）
3. Microsoft (1.9 GB) - 系统缓存（部分可清理）
4. Packages (1.2 GB) - UWP 应用缓存

小计：约 9.3 GB（可清理约 5 GB）
```

---

## 📋 推荐转移方案（30+ GB）

### 方案 A：完全转移（32 GB）
```
桌面文件         → E:\Desktop_Backup         (6.7 GB)
AppData 应用数据  → E:\AppData_Backup        (18 GB)
开发工具缓存      → E:\Cache                 (5.2 GB)
临时文件清理      →                          (2 GB)

总计：约 32 GB
```

### 方案 B：保守转移（30 GB）
```
桌面文件         → E:\Desktop_Backup         (6.7 GB)
AppData 大应用    → E:\AppData_Backup        (15 GB)  
开发工具缓存      → E:\Cache                 (3 GB)
临时文件清理      →                          (2 GB)
JetBrains 缓存清理 →                          (3 GB)

总计：约 30 GB
```

---

## 🔧 具体执行步骤

### 步骤 1：转移桌面文件（6.7 GB）
```bash
# 创建备份目录
mkdir -p /e/Desktop_Backup

# 转移学习资料
mv "/c/Users/王博弈/Desktop/王博弈专高5周考三" /e/Desktop_Backup/
mv "/c/Users/王博弈/Desktop/xm" /e/Desktop_Backup/
mv "/c/Users/王博弈/Desktop/时迹" /e/Desktop_Backup/
mv "/c/Users/王博弈/Desktop/王博弈专高5周考二" /e/Desktop_Backup/
mv "/c/Users/王博弈/Desktop/王博弈专高5周考1" /e/Desktop_Backup/

# 创建桌面快捷方式指向 E 盘
ln -s /e/Desktop_Backup "/c/Users/王博弈/Desktop/学习资料(E盘)"
```

### 步骤 2：转移 AppData 应用数据（15-18 GB）
```bash
# 创建 AppData 备份目录
mkdir -p /e/AppData_Backup

# 转移大型应用数据
应用列表：
- kingsoft (3.7 GB)
- QQEX (2.6 GB)
- Code (2.2 GB)
- LarkShell (2.0 GB)
- webcast_mate (1.6 GB)
- electron (1.3 GB)
- Postman (932 MB)
- 其他小应用 (约 5 GB)

# 每个应用的操作：
1. 复制到 E:\AppData_Backup
2. 删除原目录
3. 创建符号链接
```

### 步骤 3：开发工具缓存（5 GB）
```bash
# VS Code
mv /c/Users/王博弈/.vscode /e/Cache/vscode
ln -s /e/Cache/vscode /c/Users/王博弈/.vscode

# .cache（如果还没转移）
mv /c/Users/王博弈/.cache /e/Cache/user-cache
ln -s /e/Cache/user-cache /c/Users/王博弈/.cache

# GitHub Desktop
mv /c/Users/王博弈/AppData/Local/GitHubDesktop /e/Cache/GitHubDesktop
ln -s /e/Cache/GitHubDesktop /c/Users/王博弈/AppData/Local/GitHubDesktop

# 临时文件清理
rm -rf /c/Users/王博弈/AppData/Local/Temp/*
```

### 步骤 4：清理缓存（2-3 GB）
```bash
# JetBrains 缓存清理
rm -rf /c/Users/王博弈/AppData/Roaming/JetBrains/*/eval
rm -rf /c/Users/王博弈/AppData/Roaming/JetBrains/*/system/log
rm -rf /c/Users/王博弈/AppData/Roaming/JetBrains/*/system/tmp

# 浏览器缓存
rm -rf /c/Users/王博弈/AppData/Local/Microsoft/Edge/User\ Data/*/Cache

# Windows 临时文件
rm -rf /c/Windows/Temp/*
```

---

## ⚠️ 安全提醒

### ✅ 可安全转移（不影响应用运行）
- 桌面文件
- kingsoft、QQEX、webcast_mate 等应用数据
- Postman、GitHubDesktop
- .vscode、.cache

### ⚠️ 需要注意
- **Code (VS Code)**：转移后需重新加载扩展
- **electron**：部分 Electron 应用可能需要重启
- **.codex**：必须关闭 Claude Code 才能转移

### ❌ 不建议转移
- `Programs` - 部分程序可能无法运行
- `Microsoft` - 系统核心数据
- `Packages` - UWP 应用数据

---

## 🚀 一键执行脚本

已生成自动化脚本：
```
E:\ai-chat-desktop\C盘30GB完整清理.bat
```

执行后预计释放：**30-35 GB**

---

## 📝 执行后验证

1. 检查 C 盘空间：`df -h /c`
2. 验证应用正常运行
3. 确认符号链接有效：`ls -la /c/Users/王博弈/`
4. 测试快捷方式可用

---

## 💾 回滚方案

如果出现问题，所有数据都在：
```
E:\Desktop_Backup     - 桌面文件
E:\AppData_Backup     - 应用数据
E:\Cache              - 缓存数据
```

删除符号链接，复制回 C 盘即可恢复。
