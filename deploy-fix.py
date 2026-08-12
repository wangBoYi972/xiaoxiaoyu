"""一键修复部署 — 上传全部 dist/ 并重启服务"""
import paramiko, time, io, os, tarfile

dist = os.path.join(os.path.dirname(__file__), 'dist')

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
print(f'Upload: {buf.getbuffer().nbytes / 1024:.0f} KB')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('115.190.236.179', username='root', password='WcySky159753', timeout=30)

# Kill old
ssh.exec_command('fuser -k 80/tcp 2>/dev/null; sleep 2')

# Upload
sftp = ssh.open_sftp()
sftp.putfo(buf, '/root/xiaoxiaoyu/code.tar.gz')
sftp.close()

# Extract
ssh.exec_command('cd /root/xiaoxiaoyu && tar -xzf code.tar.gz', timeout=10)

# Verify fix is there
stdin, stdout, stderr = ssh.exec_command(
    'grep "api/chat" /root/xiaoxiaoyu/dist/server/server/app.js | head -1'
)
print('Fix:', stdout.read().decode().strip()[:100])

# Start
ssh.exec_command(
    'cd /root/xiaoxiaoyu && PORT=80 nohup node dist/server/server/index.js > server.log 2>&1 &'
)
time.sleep(4)

# Verify
for _ in range(3):
    stdin, stdout, stderr = ssh.exec_command(
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:80'
    )
    code = stdout.read().decode().strip()
    if code == '200':
        print(f'HTTP: {code}')
        break
    time.sleep(2)

ssh.close()
print('Done! Refresh http://115.190.236.179 and try chatting.')
