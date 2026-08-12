"""完整部署脚本 —— 上传 Web + 安装包到云服务器"""
import paramiko, time, io, os, tarfile, glob, stat

project_root = r'E:\ai-chat-desktop'
dist = os.path.join(project_root, 'dist')
release_dir = os.path.join(project_root, 'release')

print("=" * 50)
print("小小榆 - 完整部署到云服务器")
print("=" * 50)

# ===== 1. 打包 Web 代码 =====
print("\n[1/4] 打包 Web 代码...")
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tar:
    for name in ['renderer', 'server']:
        d = os.path.join(dist, name)
        if not os.path.isdir(d):
            continue
        for root, dirs, files in os.walk(d):
            for f in files:
                fp = os.path.join(root, f)
                arc = os.path.relpath(fp, dist).replace('\\', '/')
                tar.add(fp, arcname='dist/' + arc)

buf.seek(0)
web_size = buf.getbuffer().nbytes / 1048576
print(f"   Web 代码: {web_size:.1f} MB")

# ===== 2. 找到安装包 =====
print("\n[2/4] 查找安装包...")
exe_files = [f for f in os.listdir(release_dir) if f.endswith('.exe') and 'Setup' in f]
if not exe_files:
    print("   错误：未找到安装包！请先运行 npm run pack")
    exit(1)

installer_name = exe_files[0]
installer_path = os.path.join(release_dir, installer_name)
installer_size = os.stat(installer_path).st_size / 1048576
print(f"   {installer_name} ({installer_size:.1f} MB)")

# ===== 3. 上传到服务器 =====
print("\n[3/4] 上传到服务器...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('115.190.236.179', username='root', password='WcySky159753', timeout=30)

sftp = ssh.open_sftp()

# 上传 Web 代码
sftp.putfo(buf, '/root/xiaoxiaoyu/code.tar.gz')
print("   Web 代码已上传")

# 上传安装包
print(f"   正在上传安装包 ({installer_size:.1f} MB)...")
sftp.put(installer_path, f'/root/xiaoxiaoyu/release/{installer_name}')
print("   安装包已上传")

sftp.close()

# ===== 4. 重启服务 =====
print("\n[4/4] 重启服务...")
ssh.exec_command('cd /root/xiaoxiaoyu && mkdir -p release data && tar -xzf code.tar.gz && echo "Extracted"', timeout=15)

# 杀掉旧进程
ssh.exec_command("kill $(ps aux | grep 'node dist/server' | grep -v grep | awk '{print $2}') 2>/dev/null; sleep 1")

# 启动新进程
ssh.exec_command('cd /root/xiaoxiaoyu && nohup node dist/server/server/index.js > server.log 2>&1 &', timeout=5)
time.sleep(4)

# 验证
stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000')
http_code = stdout.read().decode().strip()
print(f"   HTTP 状态: {http_code}")

# 检查下载接口
stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:3000/api/download/info')
download_info = stdout.read().decode().strip()
print(f"   下载信息: {download_info}")

# 检查数据
stdin, stdout, stderr = ssh.exec_command('ls /root/xiaoxiaoyu/data/ 2>/dev/null')
data_files = stdout.read().decode().strip()
print(f"   数据目录: {data_files or '空'}")

ssh.close()

print("\n" + "=" * 50)
print("部署完成！")
print(f"  Web: http://124.221.241.142")
print(f"  下载: http://124.221.241.142/api/download?platform=win")
print("=" * 50)
