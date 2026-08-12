import subprocess, http.client, os, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(DIR)
os.environ['ELECTRON_MIRROR'] = 'https://npmmirror.com/mirrors/electron/'

NODE = r'C:\Program Files\nodejs\node.exe'
TSC = os.path.join(DIR, 'node_modules', 'typescript', 'bin', 'tsc')
VITE = os.path.join(DIR, 'node_modules', 'vite', 'bin', 'vite.js')
ELECTRON = os.path.join(DIR, 'node_modules', 'electron', 'dist', 'electron.exe')

CF = subprocess.CREATE_NO_WINDOW

def run_wait(exe, args):
    subprocess.run([exe] + args, cwd=DIR, creationflags=CF, check=False)

def run_bg(exe, args):
    subprocess.Popen([exe] + args, cwd=DIR, creationflags=CF)

def wait_port(port, timeout=40):
    start = time.time()
    while time.time() - start < timeout:
        try:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
            conn.request('GET', '/')
            resp = conn.getresponse()
            conn.close()
            if resp.status == 200:
                return True
        except:
            pass
        time.sleep(0.4)
    return False

# 1. Compile TypeScript
run_wait(NODE, [TSC, '-p', 'tsconfig.main.json'])

# 2. Start Vite dev server
run_bg(NODE, [VITE, '--host'])

# 3. Wait for Vite to be ready
if wait_port(5173):
    # 4. Start Electron
    run_bg(ELECTRON, ['.', '--dev'])

sys.exit(0)
