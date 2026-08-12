#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
小小榆微调快速测试脚本
用于验证完整的训练流程
"""

import os
import sys
import json
from pathlib import Path

# 添加 python 目录到路径
script_dir = Path(__file__).parent
python_dir = script_dir / 'python'
sys.path.insert(0, str(python_dir))

def main():
    print("🚀 小小榆微调快速测试")
    print("=" * 60)

    # 1. 检查 Python 环境
    print("\n📋 步骤 1/5: 检查 Python 环境")
    print("-" * 60)

    try:
        from train import check_environment
        if not check_environment():
            print("\n❌ Python 环境检查失败")
            print("请先运行: python python/setup.py")
            return False
    except ImportError as e:
        print(f"❌ 无法导入训练模块: {e}")
        print("请确保 python/train.py 文件存在")
        return False

    print("✅ Python 环境检查通过")

    # 2. 检查测试数据集
    print("\n📊 步骤 2/5: 检查测试数据集")
    print("-" * 60)

    dataset_path = script_dir / 'datasets' / 'example_dataset.json'
    if not dataset_path.exists():
        print(f"❌ 测试数据集不存在: {dataset_path}")
        return False

    with open(dataset_path, 'r', encoding='utf-8') as f:
        dataset = json.load(f)

    print(f"✅ 找到测试数据集: {dataset_path}")
    print(f"   样本数: {len(dataset)} 条")

    # 3. 检查 Ollama 模型
    print("\n🤖 步骤 3/5: 检查 Ollama 模型")
    print("-" * 60)

    import subprocess
    try:
        result = subprocess.run(
            ['ollama', 'list'],
            capture_output=True,
            text=True,
            check=True
        )

        # 检查可用的模型
        available_models = []
        recommended_models = ['deepseek-r1:1.5b', 'deepseek-r1:7b', 'qwen2.5:0.5b', 'qwen2.5:3b']

        for model in recommended_models:
            if model in result.stdout:
                available_models.append(model)

        if not available_models:
            print("❌ 未找到推荐的基座模型")
            print("请先下载模型，例如:")
            print("  ollama pull deepseek-r1:1.5b")
            return False

        print("✅ 找到可用模型:")
        for model in available_models:
            print(f"   - {model}")

        # 选择最小的模型用于测试
        base_model = available_models[0]
        print(f"\n📌 将使用模型: {base_model}")

    except subprocess.CalledProcessError as e:
        print(f"❌ 无法访问 Ollama: {e}")
        print("请确保 Ollama 已安装并运行")
        return False
    except FileNotFoundError:
        print("❌ 未找到 ollama 命令")
        print("请先安装 Ollama: https://ollama.ai")
        return False

    # 4. 准备训练
    print("\n⚙️  步骤 4/5: 准备训练")
    print("-" * 60)

    # 创建输出目录
    output_dir = script_dir / 'finetune' / 'test_quick'
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"✅ 输出目录: {output_dir}")

    # 训练配置
    config = {
        'base_model': base_model,
        'dataset': str(dataset_path),
        'output_dir': str(output_dir),
        'model_name': 'xiaoxiaoyu-v1',  # 微调后的模型名称
        'lora_r': 8,
        'lora_alpha': 16,
        'epochs': 1,  # 快速测试只训练 1 轮
        'learning_rate': 2e-4,
    }

    print("\n训练配置:")
    for key, value in config.items():
        print(f"  {key}: {value}")

    # 5. 询问是否开始训练
    print("\n🔥 步骤 5/5: 开始训练")
    print("-" * 60)
    print("\n⚠️  注意事项:")
    print("  - 这将占用你的 GPU 进行真实训练")
    print("  - 训练时间: 约 5-10 分钟（10 条数据 × 1 轮）")
    print("  - 训练期间请勿关闭此窗口")
    print("  - 可以按 Ctrl+C 中断训练\n")

    response = input("是否开始训练？(y/n): ").strip().lower()

    if response != 'y':
        print("\n❌ 用户取消训练")
        return False

    # 开始训练
    print("\n" + "=" * 60)
    print("🔥 开始训练...")
    print("=" * 60 + "\n")

    try:
        from train import train_model

        merged_path = train_model(
            base_model=config['base_model'],
            dataset_path=config['dataset'],
            output_dir=config['output_dir'],
            model_name=config['model_name'],
            lora_r=config['lora_r'],
            lora_alpha=config['lora_alpha'],
            epochs=config['epochs'],
            learning_rate=config['learning_rate'],
        )

        print("\n" + "=" * 60)
        print("✅ 训练完成！")
        print("=" * 60)
        print(f"\n📁 模型位置: {merged_path}")

        # 询问是否导出到 Ollama
        print("\n" + "-" * 60)
        response = input("\n是否导出到 Ollama？(y/n): ").strip().lower()

        if response == 'y':
            print("\n📦 导出模型到 Ollama...")
            from export import export_model

            success = export_model(
                model_path=config['output_dir'],
                model_name=config['model_name'],
                base_model=config['base_model'],
                export_format='ollama',
            )

            if success:
                print("\n✅ 全部完成！")
                print(f"\n现在可以使用模型: ollama run {config['model_name']}")
            else:
                print("\n⚠️  导出失败，但训练成功的模型已保存")

        return True

    except KeyboardInterrupt:
        print("\n\n❌ 用户中断训练")
        return False
    except Exception as e:
        print(f"\n\n❌ 训练失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n用户中断")
        sys.exit(1)
