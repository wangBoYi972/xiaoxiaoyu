"""
小小榆大模型微调训练脚本
基于 QLoRA 方法，适配 RTX 4060 8GB 显存
"""

import os
import sys
import json
import argparse
from pathlib import Path

def check_environment():
    """检查 Python 环境和依赖"""
    print("🔍 检查 Python 环境...")

    required_packages = {
        'torch': 'PyTorch',
        'transformers': 'Transformers',
        'peft': 'PEFT (LoRA)',
        'datasets': 'Datasets',
        'bitsandbytes': 'BitsAndBytes (量化)',
        'trl': 'TRL (训练工具)',
    }

    missing = []
    for package, name in required_packages.items():
        try:
            __import__(package)
            print(f"  ✅ {name}")
        except ImportError:
            print(f"  ❌ {name} - 未安装")
            missing.append(package)

    if missing:
        print(f"\n⚠️  缺少依赖包：{', '.join(missing)}")
        print("请运行以下命令安装：")
        print(f"pip install {' '.join(missing)}")
        return False

    return True

def train_model(
    base_model: str,
    dataset_path: str,
    output_dir: str,
    model_name: str,
    **kwargs
):
    """执行模型微调"""

    if not check_environment():
        sys.exit(1)

    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling,
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from datasets import load_dataset

    print(f"\n🚀 开始微调训练")
    print(f"基座模型: {base_model}")
    print(f"数据集: {dataset_path}")
    print(f"输出目录: {output_dir}")

    # 1. 加载数据集
    print("\n📊 加载数据集...")
    with open(dataset_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 转换为 Hugging Face Dataset 格式
    dataset_dict = {
        'train': [
            {
                'text': f"### 指令\n{item['instruction']}\n\n### 输入\n{item.get('input', '')}\n\n### 输出\n{item['output']}"
            }
            for item in data
        ]
    }

    from datasets import Dataset, DatasetDict
    dataset = DatasetDict({
        'train': Dataset.from_list(dataset_dict['train'])
    })

    print(f"训练样本数: {len(dataset['train'])}")

    # 2. 加载 Tokenizer
    print("\n🔤 加载 Tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 3. 加载模型（4bit 量化）
    print("\n🧠 加载模型...")
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        load_in_4bit=True,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )

    model = prepare_model_for_kbit_training(model)

    # 4. 配置 LoRA
    print("\n⚙️  配置 LoRA...")
    lora_config = LoraConfig(
        r=kwargs.get('lora_r', 8),
        lora_alpha=kwargs.get('lora_alpha', 16),
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 5. 预处理数据
    def tokenize_function(examples):
        return tokenizer(
            examples['text'],
            padding="max_length",
            truncation=True,
            max_length=512,
        )

    tokenized_dataset = dataset.map(
        tokenize_function,
        batched=True,
        remove_columns=dataset["train"].column_names,
    )

    # 6. 训练配置
    print("\n📝 训练配置...")
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=kwargs.get('epochs', 3),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=kwargs.get('learning_rate', 2e-4),
        fp16=True,
        logging_steps=10,
        save_steps=100,
        save_total_limit=2,
        report_to="none",
    )

    # 7. 开始训练
    print("\n🔥 开始训练...")
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset["train"],
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )

    trainer.train()

    # 8. 保存模型
    print("\n💾 保存模型...")
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)

    # 9. 合并 LoRA 权重（可选）
    print("\n🔀 合并 LoRA 权重...")
    merged_output = os.path.join(output_dir, "merged")
    os.makedirs(merged_output, exist_ok=True)

    # 重新加载基座模型
    base = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )

    # 加载 LoRA 权重
    from peft import PeftModel
    model_with_lora = PeftModel.from_pretrained(base, output_dir)

    # 合并
    merged_model = model_with_lora.merge_and_unload()
    merged_model.save_pretrained(merged_output)
    tokenizer.save_pretrained(merged_output)

    print(f"\n✅ 训练完成！")
    print(f"LoRA 权重: {output_dir}")
    print(f"合并模型: {merged_output}")

    # 生成元数据
    metadata = {
        'base_model': base_model,
        'model_name': model_name,
        'dataset': dataset_path,
        'num_samples': len(dataset['train']),
        'lora_r': kwargs.get('lora_r', 8),
        'lora_alpha': kwargs.get('lora_alpha', 16),
        'epochs': kwargs.get('epochs', 3),
        'learning_rate': kwargs.get('learning_rate', 2e-4),
    }

    with open(os.path.join(output_dir, 'metadata.json'), 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    return merged_output

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="小小榆模型微调")
    parser.add_argument("--base_model", required=True, help="基座模型路径或名称")
    parser.add_argument("--dataset", required=True, help="数据集 JSON 文件路径")
    parser.add_argument("--output_dir", required=True, help="输出目录")
    parser.add_argument("--model_name", required=True, help="模型名称")
    parser.add_argument("--lora_r", type=int, default=8, help="LoRA rank")
    parser.add_argument("--lora_alpha", type=int, default=16, help="LoRA alpha")
    parser.add_argument("--epochs", type=int, default=3, help="训练轮数")
    parser.add_argument("--learning_rate", type=float, default=2e-4, help="学习率")

    args = parser.parse_args()

    try:
        train_model(
            base_model=args.base_model,
            dataset_path=args.dataset,
            output_dir=args.output_dir,
            model_name=args.model_name,
            lora_r=args.lora_r,
            lora_alpha=args.lora_alpha,
            epochs=args.epochs,
            learning_rate=args.learning_rate,
        )
    except Exception as e:
        print(f"\n❌ 训练失败: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
