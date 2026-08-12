"""热部署脚本 —— 只更新文件，不重启服务（前端变更用）"""
import paramiko, time, io, os, tarfile

dist = r'E:\ai-chat-desktop\dist'

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tar:
    for name in ['renderer', 'server']:
        d = os.path.join(dist, name)
        if not os.path.isdir(d): continue
        for root, dirs, files in os.walk(d):
            for f in files:
                fp = os.path.join(root, f)
                arc = os.path.relpath(fp, dist).replace('\\', '/')
                tar.add(fp, arcname='dist/' + arc)

buf.seek(0)
print(f'Upload: {buf.getbuffer().nbytes / 1024:.0f} KB')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('115.190.236.179', username='root', password='WcySky159753', timeout=20)

sftp = ssh.open_sftp()
sftp.putfo(buf, '/root/xiaoxiaoyu/code.tar.gz')
sftp.close()

# 只解压覆盖文件，不重启 —— 前端静态文件即时生效
ssh.exec_command('cd /root/xiaoxiaoyu && tar -xzf code.tar.gz && echo OK', timeout=10)

# 验证
time.sleep(1)
stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:80')
print(f'HTTP: {stdout.read().decode().strip()}')
ssh.close()
print('热部署完成（无重启）')
