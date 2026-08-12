"""部署脚本 —— 只覆盖文件，不清除用户数据"""
import paramiko, time, io, os, tarfile

project_root = r'E:\ai-chat-desktop'
dist = os.path.join(project_root, 'dist')
release_dir = os.path.join(project_root, 'release')

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tar:
    # 打包 dist/renderer + dist/server
    for name in ['renderer', 'server']:
        d = os.path.join(dist, name)
        if not os.path.isdir(d):
            continue
        for root, dirs, files in os.walk(d):
            for f in files:
                fp = os.path.join(root, f)
                arc = os.path.relpath(fp, dist).replace('\\', '/')
                tar.add(fp, arcname='dist/' + arc)

    # 打包 release/ 安装包目录
    if os.path.isdir(release_dir):
        for root, dirs, files in os.walk(release_dir):
            for f in files:
                fp = os.path.join(root, f)
                arc = os.path.relpath(fp, project_root).replace('\\', '/')
                tar.add(fp, arcname=arc)

buf.seek(0)
print(f'Deploy: {buf.getbuffer().nbytes} bytes')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('115.190.236.179', username='root', password='WcySky159753', timeout=20)

sftp = ssh.open_sftp()
sftp.putfo(buf, '/root/xiaoxiaoyu/deploy.tar.gz')
sftp.close()
print('Uploaded')

# 只解压覆盖，不删除 dist 目录（保护 dist/data/ 用户数据库）
ssh.exec_command('cd /root/xiaoxiaoyu && tar -xzf deploy.tar.gz && echo OK', timeout=15)
print('Extracted')

# 确保 data 目录在项目根下也存在（旧数据迁移）
ssh.exec_command('mkdir -p /root/xiaoxiaoyu/data', timeout=5)

# 重启服务
ssh.exec_command("kill $(ps aux | grep 'node dist/server' | grep -v grep | awk '{print $2}') 2>/dev/null; sleep 1; cd /root/xiaoxiaoyu && nohup node dist/server/server/index.js > server.log 2>&1 &", timeout=10)
time.sleep(4)

stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000')
print('HTTP:', stdout.read().decode().strip())

stdin, stdout, stderr = ssh.exec_command('ls /root/xiaoxiaoyu/data/ 2>/dev/null')
print('Data dir:', stdout.read().decode().strip())

ssh.close()
print('Deployed (user data preserved)')
