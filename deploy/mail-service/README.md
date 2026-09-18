# 小小榆 · 在线发码服务

让别人安装你的安装包后也能收到注册验证码，同时**不把你的 QQ 授权码交给任何人**。

原理：验证码由服务端用你的 QQ 邮箱发出；授权码只存在于服务端环境变量里，客户端（别人的电脑）从头到尾拿不到。

```
别人的小小榆  ──POST /send-code──▶  发码服务(云函数)  ──SMTP 465──▶  smtp.qq.com  ──▶  对方 QQ 邮箱
                                    ▲
                            授权码只存在这里（环境变量）
```

## 一、本地先跑通

```bash
cd deploy/mail-service
npm install

# Windows PowerShell
$env:SMTP_USER="835376335@qq.com"
$env:SMTP_PASS="你的QQ邮箱授权码"
$env:APP_TOKEN="随机长字符串A"
$env:CODE_SECRET="随机长字符串B"
node index.js
```

另开一个终端验证（APP_TOKEN 要对上）：

```bash
curl -X POST http://127.0.0.1:8787/send-code -H "Content-Type: application/json" -H "X-App-Token: 随机长字符串A" -d "{\"email\":\"835376335@qq.com\",\"purpose\":\"register\"}"
```

收到邮件说明配置正确。

> 授权码怎么拿：QQ 邮箱 → 设置 → 账号 → 开启 IMAP/SMTP 服务 → 生成**授权码**（16 位字母，不是 QQ 密码）。

## 二、部署到腾讯云函数（SCF）

1. 打开 [腾讯云函数控制台](https://console.cloud.tencent.com/scf) → 新建函数
   - 创建方式：**自定义创建**
   - 函数类型：**Web 函数**（事件函数也行，代码两种入口都导出了）
   - 运行环境：**Nodejs 18** 或 Nodejs 16
   - 执行超时：建议 30 秒
2. 函数代码：把 `index.js` + `package.json` 打包成 zip 上传（**不要**带 node_modules，平台会按 package.json 装依赖）
   - 入口填 `index.handler`（Web 函数）或 `index.main_handler`
3. 环境变量（函数配置 → 环境变量）填这 5 个：

   | 变量 | 值 |
   |---|---|
   | `SMTP_USER` | `835376335@qq.com` |
   | `SMTP_PASS` | QQ 邮箱授权码 |
   | `SMTP_HOST` | `smtp.qq.com`（可留空用默认） |
   | `SMTP_PORT` | `465`（可留空用默认） |
   | `APP_TOKEN` | 随机长字符串，客户端要用同一个值 |
   | `CODE_SECRET` | 随机长字符串，换掉会让已发出的验证码失效 |

4. 触发器：勾选 **API 网关触发**，记下它给的 https 地址，例如
   `https://service-xxxxxx.gz.apigw.tencentcs.com/release/xxx`
5. 验证：

```bash
curl https://你的地址/health
# → {"ok":true,"service":"xiaoxiaoyu-mail","smtpConfigured":true}
```

> ⚠️ 腾讯云函数默认**封禁 25 端口出网**，本服务走 465（SSL），不受影响。
> 若发信报 `ETIMEDOUT`，在函数配置里确认出网放行 465。

## 三、把地址接回客户端

把拿到的 https 地址填进 `src/shared/online-auth.ts`：

```ts
export const ONLINE_AUTH_URL = 'https://你的地址';
export const ONLINE_AUTH_TOKEN = '刚才设的 APP_TOKEN';
```

然后 `npm run pack` 重新打包。之后：

- 你自己这台（本地有 SMTP）→ 照旧走本地，行为不变
- 别人那台（本地没 SMTP）→ 自动走在线发码服务

## 安全说明

- 客户端拿不到授权码：授权码只在云函数环境变量里，加密存储，接口也不返回
- `APP_TOKEN` 泄露的后果：别人可以借你的邮箱发验证码（有频率限制：同邮箱 60 秒一次、10 分钟 5 次），但**拿不到你的授权码**，也无法读你的邮件
- 验证码是 HMAC 推导的，不落库不落内存，云函数多实例/冷启动都不会失效
- 想彻底停用：把云函数停掉，客户端会退回原来的提示（不影响已注册账号登录）
