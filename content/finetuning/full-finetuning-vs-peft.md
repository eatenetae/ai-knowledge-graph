---
id: full-finetuning-vs-peft
title: 全量微调与参数高效微调
domain: finetuning
pm: useful
summary: 一种是改动模型里全部数字，另一种只加一小撮新数字，后者便宜得多。
prerequisites:
  - fine-tuning
  - lora
related:
  - model-quantization
  - catastrophic-forgetting
  - inference-cost
tags:
  - 微调
  - 工程取舍
sources:
  - title: Parameter-Efficient Transfer Learning for NLP (Adapters, 2019)
    url: https://arxiv.org/abs/1902.00751
  - title: LoRA - Low-Rank Adaptation of Large Language Models (2021)
    url: https://arxiv.org/abs/2106.09685
  - title: Parameter-Efficient Fine-Tuning for Large Models - A Comprehensive Survey (2024)
    url: https://arxiv.org/abs/2403.14608
updated_at: 2026-09-29
---

## 直觉

微调听起来是一件事，其实是两条完全不同的路。

**全量微调（full fine-tuning）**：把模型里**所有**参数都打开，用你的数据重新调一遍。就像把整栋房子重新装修。

**参数高效微调（PEFT，Parameter-Efficient Fine-Tuning）**：**冻结原来的全部参数**，只在旁边挂一小撮新参数来训练。就像不改房子，只在墙上贴几张便利贴。

差距有多大：一个 70 亿参数的模型，全量微调要更新 70 亿个数字，需要好几张卡；用 LoRA 可能只需要训练几百万个数字，**一张消费级显卡就能跑**，产物文件从 14 GB 变成几十 MB。

为什么这是过去几年最重要的工程进展之一：**它把微调从「大公司的活」变成了「个人开发者的活」。** 在这之前，想让模型适配你的领域，基本只有大厂做得到。

一个类比：**改一本教科书**。全量微调是把整本书重写一遍——彻底，但贵，而且容易把原来对的内容改错（见 `catastrophic-forgetting`）。PEFT 是在书页边缘贴便利贴：**「这一章我们公司的叫法是 XXX」**。原书一字未动，你的补充随时可以撕掉。

## 细节

**关键机制**

- **主流 PEFT 方法**：
  - **LoRA（低秩适配）**：在权重矩阵旁边加一对小矩阵 `A × B`，只训练它们。推理时可以合并回原权重，**不增加任何延迟**。今天最常用。
  - **Adapter**：在层与层之间插入小的瓶颈网络。比 LoRA 早，但**会引入额外推理延迟**（多了一层要算）。
  - **Prefix / Prompt Tuning**：在输入前面学一段虚拟的「前缀向量」。参数量最小，但效果对任务类型敏感，且**占用了宝贵的上下文位置**。
- **对比表**：

| | 全量微调 | PEFT（以 LoRA 为代表） |
|---|---|---|
| 可训练参数 | 100% | 通常 0.01% - 1% |
| 显存需求 | 高（含优化器状态，约为参数量的 4-8 倍） | 低（常可单卡） |
| 产物大小 | 数十 GB | 几 MB 到几百 MB |
| 多任务切换 | 每个任务存一份完整模型 | **一份底座 + 多个小适配器，随时热插拔** |
| 效果上限 | 略高 | 接近，多数场景差距很小 |
| 灾难性遗忘风险 | **高** | 低（原参数没动） |
| 能灌入多少新知识 | 更多 | 有限 |

- **什么时候仍然必须全量微调**：
  - 要**大幅改变模型能力**（不只是风格和格式），比如让小模型学会一个全新领域；
  - 要继续**预训练**（增加语种、扩充词表）；
  - 有充足的算力和数据，且追求最后那一点效果上限。
- **PEFT 的隐藏成本**：**多适配器部署**虽然灵活，但推理时要么为每个请求切换适配器（有开销），要么为每个适配器起一份实例（吃显存）。规模化时这反而可能比一个大模型更贵。
- **量化 + PEFT 是黄金组合**：把底座模型 4 位量化（`model-quantization`），再在上面挂 LoRA 训练（QLoRA）。这让**单张 24 GB 显卡微调 70 亿甚至更大模型**成为现实，是当前个人开发者最常用的路线。

**一个决策顺序**

先问「我需要的是新知识还是新行为」：要新知识 → 优先 `rag`；要新行为（固定格式、特定语气、领域术语）→ 先试提示工程和少样本，还不够再上 PEFT，**最后才考虑全量微调**。

**可运行代码**

```python
# pip install transformers peft
from transformers import AutoModelForCausalLM
from peft import LoraConfig, get_peft_model

model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-0.5B")

total = sum(p.numel() for p in model.parameters())

config = LoraConfig(
    r=8,                      # 秩：越大容量越强，也越容易过拟合
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],   # 通常只挂在注意力的投影上
    lora_dropout=0.05,
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, config)
model.print_trainable_parameters()

# 输出类似：
# trainable params: 540,672 || all params: 494,032,768 || trainable%: 0.1094
```

最后那行百分比就是全部要点：**只训练 0.1% 的参数**。而且 `model.save_pretrained()` 存出来的只有那 540K 个数字——**几 MB，可以直接塞进 git 仓库**，底座模型共用一份。
