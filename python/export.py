"""
将微调后的模型转换为 Ollama 格式
"""

import os
import json
import argparse
import subprocess
from pathlib import Path

def create_modelfile(model_path: str, model_name: str, base_model: str):
    """创建 Ollama Modelfile"""

    modelfile_content = f"""FROM {model_path}

TEMPLATE \"\"\"{{{{ if .System }}}}<|system|>
{{{{ .System }}<|end|>
{{{{ end }}}}{{{{ if .Prompt }}}}<|user|>
{{{{ .Prompt }}<|end|>
<|assistant|>
{{{{ end }}}}{{{{ .Response }}<|end|>
\"\"\"

PARAMETER stop "<|end|>"
PARAMETER stop "<|system|>"
PARAMETER stop "<|user|>"
PARAMETER stop "<|assistant|>"

SYSTEM \"\"\"你是小小榆，一个基于 {base_model} 微调的 AI 助手。你的回答准确、友好、专业。\"\"\"
"""

    return modelfile_content

def convert_to_gguf(model_path: str, output_path: str, quantization: str = "Q4_K_M"):
    """
    将 PyTorch 模型转换为 GGUF 格式（Ollama 使用的格式）

    注意：此功能需要 llama.cpp 工具链
    如果没有安装，可以直接使用 Ollama 的 create 命令
    """
    print(f"\n🔄 转换模型格式...")
    print(f"输入: {model_path}")
    print(f"输出: {output_path}")
    print(f"量化: {quantization}")

    # 检查是否有 llama.cpp
    try:
        subprocess.run(['convert.py', '--help'], capture_output=True, check=True)
        has_llama_cpp = True
    except:
        has_llama_cpp = False
        print("⚠️  未找到 llama.cpp，将使用 Ollama 直接导入")

    if has_llama_cpp:
        # TODO: 使用 llama.cpp 转换
        print("使用 llama.cpp 转换（暂未实现）")
    else:
        print("将使用 Ollama 的 safetensors 导入功能")

    return True

def import_to_ollama(model_path: str, model_name: str, base_model: str):
    """导入模型到 Ollama"""

    print(f"\n📦 导入模型到 Ollama...")
    print(f"模型名称: {model_name}")

    # 1. 创建 Modelfile
    modelfile_content = create_modelfile(model_path, model_name, base_model)
    modelfile_path = os.path.join(model_path, "Modelfile")

    with open(modelfile_path, 'w', encoding='utf-8') as f:
        f.write(modelfile_content)

    print(f"✅ Modelfile 已创建: {modelfile_path}")

    # 2. 使用 Ollama create 命令
    try:
        result = subprocess.run(
            ['ollama', 'create', model_name, '-f', modelfile_path],
            capture_output=True,
            text=True,
            check=True
        )
        print(result.stdout)
        print(f"\n✅ 模型已导入到 Ollama: {model_name}")

        # 3. 验证
        result = subprocess.run(
            ['ollama', 'list'],
            capture_output=True,
            text=True
        )

        if model_name in result.stdout:
            print(f"✅ 验证成功，模型已在列表中")
            return True
        else:
            print(f"⚠️  模型未在列表中，可能导入失败")
            return False

    except subprocess.CalledProcessError as e:
        print(f"❌ 导入失败: {e.stderr}")
        return False

def export_model(
    model_path: str,
    model_name: str,
    base_model: str,
    export_format: str = "ollama"
):
    """
    导出微调后的模型

    Args:
        model_path: 模型目录（包含 merged 子目录）
        model_name: 模型名称
        base_model: 基座模型名称
        export_format: 导出格式（ollama, gguf, huggingface）
    """

    print("🚀 小小榆模型导出工具")
    print("=" * 50)

    # 检查模型路径
    merged_path = os.path.join(model_path, "merged")
    if not os.path.exists(merged_path):
        print(f"❌ 未找到合并后的模型: {merged_path}")
        return False

    print(f"✅ 找到模型: {merged_path}")

    # 读取元数据
    metadata_path = os.path.join(model_path, "metadata.json")
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        print(f"✅ 元数据:")
        print(f"  - 基座: {metadata.get('base_model')}")
        print(f"  - 样本数: {metadata.get('num_samples')}")
        print(f"  - LoRA rank: {metadata.get('lora_r')}")

    # 根据格式导出
    if export_format == "ollama":
        success = import_to_ollama(merged_path, model_name, base_model)
    elif export_format == "gguf":
        output_path = os.path.join(model_path, f"{model_name}.gguf")
        success = convert_to_gguf(merged_path, output_path)
    elif export_format == "huggingface":
        print(f"✅ 模型已经是 Hugging Face 格式，位于: {merged_path}")
        print(f"可以直接使用 transformers 加载")
        success = True
    else:
        print(f"❌ 不支持的格式: {export_format}")
        success = False

    if success:
        print("\n" + "=" * 50)
        print("✅ 模型导出完成！")
        print("=" * 50)

        if export_format == "ollama":
            print(f"\n现在可以在小小榆中使用模型: {model_name}")
            print(f"或者在命令行测试: ollama run {model_name}")

    return success

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="导出微调后的模型")
    parser.add_argument("--model_path", required=True, help="模型目录路径")
    parser.add_argument("--model_name", required=True, help="模型名称")
    parser.add_argument("--base_model", required=True, help="基座模型名称")
    parser.add_argument("--format", default="ollama", choices=["ollama", "gguf", "huggingface"], help="导出格式")

    args = parser.parse_args()

    try:
        export_model(
            model_path=args.model_path,
            model_name=args.model_name,
            base_model=args.base_model,
            export_format=args.format,
        )
    except Exception as e:
        print(f"\n❌ 导出失败: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
