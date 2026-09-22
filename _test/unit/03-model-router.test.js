/**
 * 模型路由和适配器测试
 * 测试 ModelRouter 的适配器工厂、路由、模型预设等功能
 * 文件: src/adapters/index.ts
 */

describe('模型路由 (ModelRouter)', () => {
  let ModelRouter, supportsTools;
  let BaseModelAdapter;

  before(() => {
    // 直接加载编译后的模块
    const adapterModule = require('../../dist/adapters/index');
    ModelRouter = adapterModule.ModelRouter;
    supportsTools = adapterModule.supportsTools;
    BaseModelAdapter = require('../../dist/adapters/base-adapter').BaseModelAdapter;
  });

  describe('ModelRouter 初始化', () => {
    it('应成功创建 ModelRouter 实例', () => {
      const router = new ModelRouter();
      assert(router !== null && router !== undefined, '应创建实例');
      assert(typeof router.getAdapter === 'function', '应有 getAdapter 方法');
      assert(typeof router.chat === 'function', '应有 chat 方法');
      assert(typeof router.testProvider === 'function', '应有 testProvider 方法');
      assert(typeof router.listModels === 'function', '应有 listModels 方法');
    });

    it('应注册所有内置提供商适配器', () => {
      const router = new ModelRouter();
      const providerIds = ['anthropic', 'openai', 'deepseek', 'qwen', 'glm', 'moonshot', 'gemini', 'ernie', 'ollama'];

      for (const id of providerIds) {
        const adapter = router.getAdapter({
          id, name: id, apiKey: 'test-key',
          baseUrl: '', enabled: true, models: [],
        });
        assert(adapter !== null && adapter !== undefined,
          `提供商 "${id}" 应有适配器`);
        assert(adapter instanceof BaseModelAdapter,
          `提供商 "${id}" 的适配器应是 BaseModelAdapter 子类`);
      }
    });

    it('未知提供商应回退到 OpenAICompatAdapter', () => {
      const router = new ModelRouter();
      const adapter = router.getAdapter({
        id: 'unknown-provider',
        name: 'Unknown',
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com/v1',
        enabled: true,
        models: [],
      });
      assert(adapter !== null, '未知提供商应创建回退适配器');
      assertEqual(adapter.providerId, 'unknown-provider');
    });
  });

  describe('适配器缓存', () => {
    it('相同配置应返回缓存的适配器实例', () => {
      const router = new ModelRouter();
      const config = {
        id: 'deepseek',
        name: 'DeepSeek',
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.deepseek.com/v1',
        enabled: true,
        models: [],
      };

      const adapter1 = router.getAdapter(config);
      const adapter2 = router.getAdapter(config);
      assert(adapter1 === adapter2,
        '相同配置应返回同一适配器实例（缓存命中）');
    });

    it('不同 API Key 应返回不同适配器实例', () => {
      const router = new ModelRouter();
      const config1 = {
        id: 'deepseek', name: 'DeepSeek', apiKey: 'sk-key-1',
        baseUrl: '', enabled: true, models: [],
      };
      const config2 = {
        id: 'deepseek', name: 'DeepSeek', apiKey: 'sk-key-2',
        baseUrl: '', enabled: true, models: [],
      };

      const adapter1 = router.getAdapter(config1);
      const adapter2 = router.getAdapter(config2);
      // 不同 key 末尾不同 → 不同缓存键
      assert(adapter1 !== adapter2,
        '不同 API Key 应使用不同适配器实例');
    });
  });
});

describe('工具调用能力标记', () => {
  it('仅已验证的模型可启用工具调用', () => {
    assert(supportsTools('openai', 'gpt-4o'));
    assert(supportsTools('deepseek', 'deepseek-chat'));
    assert(!supportsTools('openai', 'unknown-model'));
    assert(!supportsTools('custom_gateway', 'gpt-4o'));
  });
});

describe('适配器类型层级', () => {

  it('BaseModelAdapter 应有核心方法', () => {
    // TypeScript abstract 方法不会出现在编译后的 JS prototype 上
    // 检查编译后实际存在的方法
    assert(typeof BaseModelAdapter.prototype.buildHeaders === 'function',
      '应有 buildHeaders 方法');
    assert(typeof BaseModelAdapter.prototype.simpleFetch === 'function',
      '应有 simpleFetch 方法');
    assert(typeof BaseModelAdapter.prototype.fetchStream === 'function',
      '应有 fetchStream 方法');
    assert(typeof BaseModelAdapter.prototype.readSSEStream === 'function',
      '应有 readSSEStream 方法');
    assert(typeof BaseModelAdapter.prototype.toOpenAIMessages === 'function',
      '应有 toOpenAIMessages 方法');
  });

  it('所有具体适配器应实现 providerId getter', () => {
    const { ModelRouter } = require('../../dist/adapters/index');
    const router = new ModelRouter();
    const providers = ['openai', 'deepseek', 'anthropic', 'gemini', 'ernie'];

    for (const id of providers) {
      const adapter = router.getAdapter({
        id, name: id, apiKey: 'test',
        baseUrl: '', enabled: true, models: [],
      });
      assertEqual(adapter.providerId, id,
        `适配器 ${id} 的 providerId 应匹配`);
    }
  });
});
