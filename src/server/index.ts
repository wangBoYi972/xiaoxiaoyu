// 小小榆 Web 服务器入口
import { createApp } from './app';
import { initDatabase, closeDatabase } from './store/database';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '80', 10);

async function main(): Promise<void> {
  logger.info('小小榆 Web 服务器启动中...');

  // 初始化数据库
  await initDatabase();

  // 创建 Express 应用
  const app = createApp();

  // 启动监听
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`==========================================`);
    logger.info(`  小小榆 Web 服务已启动`);
    logger.info(`  地址: http://localhost:${PORT}`);
    logger.info(`  局域网: http://<your-ip>:${PORT}`);
    logger.info(`==========================================`);
  });

  // 优雅关闭
  const shutdown = (signal: string) => {
    logger.info(`收到 ${signal}，正在关闭...`);
    server.close(() => {
      closeDatabase();
      logger.info('服务器已关闭');
      process.exit(0);
    });
    // 强制退出超时
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('服务器启动失败', err);
  process.exit(1);
});
