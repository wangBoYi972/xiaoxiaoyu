"""
小小榆微调环境安装脚本
自动安装所需的 Python 依赖包
"""

import subprocess
import sys

def install_packages():
    """安装微调所需的包"""

    print("🚀 小小榆微调环境安装")
    print("=" * 50)
    print("注意：此过程需要下载约 5GB 的依赖包")
    print("请确保有足够的磁盘空间和网络连接")
    print("=" * 50)

    # 检查 Python 版本
    if sys.version_info < (3, 8):
        print("❌ 需要 Python 3.8 或更高版本")
        print(f"当前版本: {sys.version}")
        return False

    print(f"✅ Python 版本: {sys.version.split()[0]}")

    # 检查是否有 CUDA
    try:
        import torch
        has_cuda = torch.cuda.is_available()
        if has_cuda:
            print(f"✅ 检测到 NVIDIA GPU: {torch.cuda.get_device_name(0)}")
        else:
            print("⚠️  未检测到 CUDA，将使用 CPU 训练（速度较慢）")
    except ImportError:
        print("⚠️  PyTorch 未安装，将在后续步骤安装")
        has_cuda = False

    # 安装包列表
    packages = [
        # PyTorch（根据是否有 CUDA 选择版本）
        "torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121" if has_cuda else "torch torchvision torchaudio",
        # Transformers 生态
        "transformers>=4.36.0",
        "accelerate>=0.25.0",
        "peft>=0.7.0",
        "datasets>=2.16.0",
        "trl>=0.7.0",
        # 量化支持
        "bitsandbytes>=0.41.0",
        # 其他工具
        "sentencepiece",
        "protobuf",
        "scipy",
    ]

    total = len(packages)
    for i, package in enumerate(packages, 1):
        print(f"\n[{i}/{total}] 安装 {package.split('>=')[0].split()[0]}...")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "--upgrade"] + package.split(),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE
            )
            print(f"  ✅ 安装成功")
        except subprocess.CalledProcessError as e:
            print(f"  ❌ 安装失败: {e.stderr.decode()}")
            return False

    print("\n" + "=" * 50)
    print("✅ 所有依赖安装完成！")
    print("=" * 50)

    # 验证安装
    print("\n🔍 验证安装...")
    try:
        import torch
        import transformers
        import peft
        import datasets
        import bitsandbytes
        import trl

        print("✅ 所有包导入成功")
        print(f"  - PyTorch: {torch.__version__}")
        print(f"  - Transformers: {transformers.__version__}")
        print(f"  - PEFT: {peft.__version__}")
        print(f"  - Datasets: {datasets.__version__}")

        if torch.cuda.is_available():
            print(f"  - CUDA: {torch.version.cuda}")
            print(f"  - GPU: {torch.cuda.get_device_name(0)}")
            print(f"  - 显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

        return True

    except Exception as e:
        print(f"❌ 验证失败: {e}")
        return False

if __name__ == "__main__":
    success = install_packages()
    sys.exit(0 if success else 1)
