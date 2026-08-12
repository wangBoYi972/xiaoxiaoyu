import paramiko, time, os, io, tarfile

dist = r'E:\ai-chat-desktop\dist'
project = r'E:\ai-chat-desktop'

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
    tar.add(os.path.join(project, 'package.json'), arcname='package.json')

buf.seek(0)
print(f'Upload: {buf.getbuffer().nbytes / 1048576:.1f} MB')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('115.190.236.179', username='root', password='WcySky159753', timeout=20)

sftp = ssh.open_sftp()
sftp.putfo(buf, '/root/xiaoxiaoyu/code.tar.gz')
sftp.close()

stdin, stdout, stderr = ssh.exec_command(
    'cd /root/xiaoxiaoyu && tar -xzf code.tar.gz && '
    "kill $(ps aux | grep 'node dist/server' | grep -v grep | awk '{print $2}') 2>/dev/null; "
    'sleep 1; nohup node dist/server/server/index.js > server.log 2>&1 & sleep 3 && '
    'curl -s -o /dev/null -w "HTTP:%{http_code}" http://localhost:3000',
    timeout=20
)
print(stdout.read().decode().strip())

ssh.close()
print('Done')
