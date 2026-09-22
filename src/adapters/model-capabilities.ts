// 仅保存经过应用验证的工具调用能力，不包含、也不生成模型列表。
// 模型列表必须由供应商 API（或用户保存的自定义模型）提供。
const VERIFIED_TOOL_MODELS: Record<string, ReadonlySet<string>> = {
  openai: new Set(['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini', 'o1']),
  deepseek: new Set(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3-0324']),
  qwen: new Set(['qwen3-max', 'qwen3-plus', 'qwen-max', 'qwen-plus', 'qwen-turbo']),
  glm: new Set(['glm-4.5', 'glm-4-plus', 'glm-4-flash']),
  moonshot: new Set(['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest']),
};

export function supportsTools(providerId: string, modelId?: string): boolean {
  return !!modelId && (VERIFIED_TOOL_MODELS[providerId]?.has(modelId) ?? false);
}
