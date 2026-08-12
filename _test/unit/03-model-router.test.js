/**
 * 模型路由和适配器测试
 * 测试 ModelRouter 的适配器工厂、路由、模型预设等功能
 * 文件: src/adapters/index.ts
 */

describe('模型路由 (ModelRouter)', () => {
  let ModelRouter, getPresetModels;
  let BaseModelAdapter;

  before(() => {
    // 直接加载编译后的模块
    const adapterModule = require('../../dist/adapters/index');
    ModelRouter = adapterModule.ModelRouter;
    getPresetModels = adapterModule.getPresetModels;
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

describe('预置模型列表 (getPresetModels)', () => {

  it('Anthropic 应返回 3 个模型', () => {
    const models = getPresetModels('anthropic');
    assertEqual(models.length, 3);
    assert(models.some(m => m.id === 'claude-opus-4-8'));
    assert(models.some(m => m.id === 'claude-sonnet-5'));
    assert(models.some(m => m.id === 'claude-haiku-4-5'));
  });

  it('DeepSeek 应返回 3 个模型', () => {
    const models = getPresetModels('deepseek');
    assertEqual(models.length, 3);
    assert(models.some(m => m.id === 'deepseek-chat'));
    assert(models.some(m => m.id === 'deepseek-reasoner'));
    assert(models.some(m => m.id === 'deepseek-v3-0324'));
  });

  it('OpenAI 应返回多个模型', () => {
    const models = getPresetModels('openai');
    assert(models.length > 0, 'OpenAI 应有预置模型');
    assert(models.some(m => m.id.startsWith('gpt-') || m.id.startsWith('o')));
  });

  it('Gemini 应返回 3 个模型', () => {
    const models = getPresetModels('gemini');
    assertEqual(models.length, 3);
  });

  it('ERNIE 应返回正确的模型', () => {
    const models = getPresetModels('ernie');
    assert(models.length > 0);
    assert(models.every(m => m.id.startsWith('ernie-')));
  });

  it('Qwen 应返回 5 个模型', () => {
    const models = getPresetModels('qwen');
    assertEqual(models.length, 5);
  });

  it('GLM 应返回 3 个模型', () => {
    const models = getPresetModels('glm');
    assertEqual(models.length, 3);
    assert(models.some(m => m.displayName.includes('免费')));
  });

  it('Moonshot 应返回 4 个模型', () => {
    const models = getPresetModels('moonshot');
    assertEqual(models.length, 4);
    assert(models.some(m => m.id === 'kimi-latest'));
  });

  it('未知提供商应返回空数组', () => {
    const models = getPresetModels('nonexistent-provider');
    assertEqual(models.length, 0);
    assert(Array.isArray(models));
  });

  it('所有模型都应包含必填字段', () => {
    const allProviders = ['anthropic', 'openai', 'deepseek', 'qwen', 'glm', 'moonshot', 'gemini', 'ernie'];

    for (const provider of allProviders) {
      const models = getPresetModels(provider);
      for (const model of models) {
        assert(typeof model.id === 'string' && model.id.length > 0,
          `${provider} 模型缺少 id`);
        assert(typeof model.displayName === 'string' && model.displayName.length > 0,
          `${provider}/${model.id} 缺少 displayName`);
        assert(typeof model.provider === 'string',
          `${provider}/${model.id} 缺少 provider`);
        assert(typeof model.maxTokens === 'number' && model.maxTokens > 0,
          `${provider}/${model.id} maxTokens 无效: ${model.maxTokens}`);
        assert(typeof model.supportsVision === 'boolean',
          `${provider}/${model.id} 缺少 supportsVision`);
        assert(typeof model.supportsThinking === 'boolean',
          `${provider}/${model.id} 缺少 supportsThinking`);
      }
    }
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
