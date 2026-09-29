---
id: model-quantization
title: 模型量化
domain: deployment
summary: 用更少的位数存模型的数字，让它跑得更快、更省显存，效果只掉一点点。
prerequisites:
  - llm-pretraining
related:
  - scaling-law
  - lora
tags:
  - 部署
  - 效率
sources:
  - title: GPTQ - Accurate Post-Training Quantization for Generative Pre-trained Transformers (2022)
    url: https://arxiv.org/abs/2210.17323
  - title: AWQ - Activation-aware Weight Quantization (2023)
    url: https://arxiv.org/abs/2306.00978
updated_at: 2026-09-29
---

## 直觉

模型里的参数默认用 16 位小数存储。一个 70 亿参数的模型，光权重就要占 14 GB 显存——一张 24G 的消费级显卡勉强能装，但装完就没剩多少给上下文了。

量化就是**把每个数字的精度降下来**：从 16 位降到 8 位、4 位。70 亿参数的模型从 14 GB 降到 3.5 GB，一张普通显卡就能跑，而且因为读取的数据量变小了，**生成速度还更快**。

代价是精度损失。但这里的经验很反直觉：**降到 8 位几乎无损，降到 4 位通常也只掉一两个百分点。** 因为神经网络本身对数值噪声有容忍度——它做的是统计近似，不是精确计算。

一个类比：**把无损音乐转成 320kbps**。文件小了七成，绝大多数人听不出区别。再往下压到 64kbps，才开始明显失真——量化也一样，4 位通常就是那个「还听得出来是同一首歌」的临界点。

## 细节

**关键机制**

- **对称量化**：把一组数字按最大绝对值缩放到整数范围，再存一个缩放因子。`w ≈ scale × q`。
- **分组量化**：整层共用一个缩放因子太粗，于是每 128 个权重分一组、各自一个缩放因子。**组越小越精确，元数据开销越大**。`group_size=128` 是常见的平衡点。
- **为什么 4 位还能用**：权重分布近似钟形，绝大多数值集中在 0 附近，真正需要高精度的离群值很少。GPTQ 用二阶信息逐列补偿误差，AWQ 则发现**保护 1% 的关键权重通道**比均匀量化所有通道重要得多。

**几种方案怎么选**

| 方案 | 特点 | 适用 |
|---|---|---|
| bitsandbytes | 一行代码就能加载，无需预先量化 | 快速试验、显存不够时先跑起来 |
| GPTQ | 需要校准数据离线量化，生态成熟 | 生产部署，追求吞吐 |
| AWQ | 保留关键通道，4 位下精度通常更好 | 生产部署，精度敏感 |
| GGUF | llama.cpp 生态，CPU/混合推理 | 本地跑、边缘设备 |

**实践建议**

- **8 位几乎是免费的午餐**，显存减半、速度提升、精度损失可忽略。没理由不做。
- **4 位要看任务**。通用对话基本无损，但**长链推理、代码生成、数学**这类任务对数值精度更敏感，掉点会更明显。
- **量化后必须重跑评估**（见 `llm-evaluation`）。别信「论文说只掉 1%」——那是论文的模型和任务，不是你的。

**可运行代码**

```python
# pip install transformers bitsandbytes torch
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

name = "Qwen/Qwen2.5-1.5B-Instruct"
tok = AutoTokenizer.from_pretrained(name)

def load(quant):
    if quant is None:
        return AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.float16, device_map="auto")
    cfg = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",              # 4bit NormalFloat，对钟形分布更友好
        bnb_4bit_compute_dtype=torch.float16,   # 计算时仍用 fp16，只有存储是 4bit
        bnb_4bit_use_double_quant=True,         # 对缩放因子再量化一次，再省一点
    )
    return AutoModelForCausalLM.from_pretrained(name, quantization_config=cfg, device_map="auto")

for label, quant in [("fp16", None), ("4bit", "nf4")]:
    model = load(quant)
    used = sum(p.numel() * p.element_size() for p in model.parameters()) / 1e9
    print(f"{label:>5}: 权重占用约 {used:.2f} GB")

    ids = tok("用一句话解释什么是量化。", return_tensors="pt").to(model.device)
    out = model.generate(**ids, max_new_tokens=60, do_sample=False)
    print(f"       {tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True)}\n")
```

跑一遍你会看到显存占用差了三四倍，而两段回答的质量通常难分高下。**这就是量化在生产环境几乎是默认选项的原因。**
