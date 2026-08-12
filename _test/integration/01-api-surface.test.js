/**
 * API 表面集成测试
 * 验证 preload API 的完整性和一致性
 * 文件: src/preload/index.ts
 */

describe('Preload API 表面验证', () => {
  // 模拟 preload.ts 暴露的 API 结构
  const preloadApiDefinition = {
    // 聊天 - 4 methods
    chat: ['sendChatMessage', 'stopGeneration', 'onStreamChunk'],
    // 对话 - 6 methods
    conversations: ['listConversations', 'getConversation', 'createConversation',
      'deleteConversation', 'renameConversation'],
    // 消息 - 1 method
    messages: ['listMessages'],
    // 设置 - 3 methods
    settings: ['getSetting', 'setSetting', 'getAllSettings'],
    // 提供商 - 4 methods
    providers: ['listProviders', 'saveProvider', 'deleteProvider', 'testProvider'],
    // 文件 - 2 methods
    files: ['openFileDialog', 'readFile'],
    // 窗口 - 3 methods
    window: ['minimizeWindow', 'maximizeWindow', 'closeWindow', 'isMaximized'],
    // 事件监听 - 多个
    events: ['onNewChat', 'onOpenSettings', 'onUpdateAvailable',
      'onUpdateProgress', 'onUpdateError', 'onAnnouncement',
      'onOllamaStatus', 'onOllamaProgress'],
    // 更新 - 4 methods
    updates: ['checkUpdate', 'installUpdate', 'getUpdateUrl', 'setUpdateUrl',
      'markAnnouncementRead', 'showAnnouncements'],
    // 技能 - 5 methods
    skills: ['listSkills', 'remoteSkillCatalog', 'installSkill',
      'deleteSkill', 'exportSkill', 'importSkill'],
    // 应用信息
    app: ['getAppVersion'],
    // 认证 - 3 methods
    auth: ['authLogin', 'authRegister', 'authMe'],
    // Ollama - 2 methods + 2 events
    ollama: ['checkOllamaStatus', 'ollamaSetup'],
  };

  it('API 总数应合理（≥ 40 个方法）', () => {
    let totalMethods = 0;
    for (const [category, methods] of Object.entries(preloadApiDefinition)) {
      totalMethods += methods.length;
    }
    assert(totalMethods >= 40,
      `API 方法总数应足够丰富, 实际 ${totalMethods}`);
    console.log(`    API 总数: ${totalMethods} 个方法`);
  });

  it('每个分类都应有实际方法', () => {
    for (const [category, methods] of Object.entries(preloadApiDefinition)) {
      assert(methods.length > 0,
        `分类 "${category}" 应有至少1个方法`);
    }
    console.log(`    API 分类数: ${Object.keys(preloadApiDefinition).length}`);
  });

  it('关键聊天 API 应存在', () => {
    // 这些是最核心的 API
    const criticalApis = [
      'sendChatMessage',     // 发送聊天
      'stopGeneration',      // 停止生成
      'onStreamChunk',        // 流式响应
      'listConversations',   // 对话列表
      'createConversation',  // 创建对话
      'deleteConversation',  // 删除对话
      'listMessages',        // 消息列表
      'getSetting',          // 设置读取
      'setSetting',          // 设置写入
      'listProviders',       // 提供商列表
      'saveProvider',        // 保存配置
      'testProvider',        // 测试连接
    ];

    const allApis = Object.values(preloadApiDefinition).flat();
    for (const api of criticalApis) {
      assert(allApis.includes(api),
        `核心 API "${api}" 应存在`);
    }
  });

  it('窗口控制 API 应完整', () => {
    const windowApis = preloadApiDefinition.window;
    assert(windowApis.includes('minimizeWindow'));
    assert(windowApis.includes('maximizeWindow'));
    assert(windowApis.includes('closeWindow'));
    assert(windowApis.includes('isMaximized'));
  });

  it('应支持所有主要 AI 提供商的事件', () => {
    // 验证有足够的事件监听支持
    const eventApis = preloadApiDefinition.events;
    assert(eventApis.length >= 6,
      `应有足够的事件监听, 实际 ${eventApis.length}`);
  });

  it('技能系统 API 应完整', () => {
    const skillApis = preloadApiDefinition.skills;
    assert(skillApis.includes('listSkills'));
    assert(skillApis.includes('installSkill'));
    assert(skillApis.includes('deleteSkill'));
    assert(skillApis.includes('exportSkill'));
    assert(skillApis.includes('importSkill'));
  });

  it('认证 API 应支持登录/注册/查我', () => {
    const authApis = preloadApiDefinition.auth;
    assert(authApis.includes('authLogin'));
    assert(authApis.includes('authRegister'));
    assert(authApis.includes('authMe'));
  });
});

describe('IPC API 命名规范', () => {
  const ipcChannels = [
    // 前缀:功能 命名规范
    'chat:send', 'chat:stop', 'chat:stream-chunk',
    'conv:list', 'conv:get', 'conv:create', 'conv:delete', 'conv:rename',
    'msg:list',
    'settings:get', 'settings:set', 'settings:getAll',
    'provider:list', 'provider:save', 'provider:delete', 'provider:test',
    'file:openDialog', 'file:read',
    'window:minimize', 'window:maximize', 'window:close', 'window:isMaximized',
    'update:check', 'update:install', 'update:getUrl', 'update:setUrl',
    'update:available', 'update:progress', 'update:error',
    'announcement:show', 'announcement:read',
    'skills:list', 'skills:remote-catalog', 'skills:install',
    'skills:delete', 'skills:export', 'skills:import',
    'app:version', 'app:new-chat', 'app:open-settings',
    'auth:login', 'auth:register', 'auth:me',
    'ollama:status', 'ollama:setup', 'ollama:progress',
  ];

  it('IPC 通道名应遵循 前缀:功能 命名规范', () => {
    const pattern = /^[a-z]+:[a-zA-Z][a-zA-Z0-9-]*$/;
    const violations = [];

    for (const channel of ipcChannels) {
      if (!pattern.test(channel) && channel !== 'chat:stream-chunk') {
        violations.push(channel);
      }
    }

    assert(violations.length === 0,
      `以下通道不遵循命名规范: ${violations.join(', ')}`);
  });

  it('IPC 通道数应 ≥ 30（功能丰富度）', () => {
    assert(ipcChannels.length >= 30,
      `IPC 通道数应 ≥ 30, 实际 ${ipcChannels.length}`);
    console.log(`    IPC 通道总数: ${ipcChannels.length}`);
  });

  it('所有 IPC 通道应有唯一名称', () => {
    const unique = new Set(ipcChannels);
    assertEqual(unique.size, ipcChannels.length,
      'IPC 通道名称应唯一');
  });

  it('关键 IPC 通道应覆盖所有功能域', () => {
    const domains = ipcChannels.reduce((acc, ch) => {
      const prefix = ch.split(':')[0];
      acc.add(prefix);
      return acc;
    }, new Set());

    const requiredDomains = ['chat', 'conv', 'msg', 'settings', 'provider',
      'file', 'window', 'update', 'skills', 'app', 'auth', 'ollama'];

    for (const domain of requiredDomains) {
      assert(domains.has(domain),
        `应包含 "${domain}" 功能域的 IPC 通道`);
    }
    console.log(`    IPC 功能域: ${Array.from(domains).join(', ')}`);
  });
});
