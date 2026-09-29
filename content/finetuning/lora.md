---
id: lora
title: LoRA
domain: finetuning
summary: 不碰原模型，只在旁边挂一小块可训练的参数，就能达到接近全量微调的效果。
prerequisites:
  - fine-tuning
related:
  - model-quantization
tags:
  - 训练
  - 效率
sources:
  - title: LoRA - Low-Rank Adaptation of Large Language Models (2021)
    url: https://arxiv.org/abs/2106.09685
  - title: QLoRA - Efficient Finetuning of Quantized LLMs (2023)
    url: https://arxiv.org/abs/2305.14314
updated_at: 2026-09-29
---

## 直觉

全量微调的痛点是：模型有 70 亿个参数，你就得为这 70 亿个参数准备梯度和优化器状态，显存直接翻好几倍，一张消费级显卡根本装不下。

LoRA 的观察很漂亮：**微调带来的改变，其实是「低秩」的**——模型不需要在每个方向上都大幅调整，真正变化的只是少数几个方向。既然如此，何必更新整个大矩阵？

做法是：**把原来那个巨大的权重矩阵冻住不动，在旁边挂两个瘦长的小矩阵，只训练它们。** 原来 4096×4096 的矩阵要训 1600 万个参数，LoRA 用 4096×8 和 8×4096 两个小矩阵，只要 6.5 万个——**少了 250 倍**。

一个类比：**给西装改尺寸，不是重做一件**。衣服基本合身，只需要在腰上收两针。LoRA 就是那两针。

## 细节

**关键机制**

- 原权重 `W` 冻结，新增旁路 `B·A`，前向变成 `h = Wx + (α/r)·BAx`。初始化时 `A` 用随机高斯、`B` 全零，所以**训练开始时旁路输出为零，模型行为与原来完全一致**——这是个很重要的设计，保证了微调不会一上来就把模型带偏。
- **秩 `r`** 是唯一的容量旋钮。`r=4~16` 适合风格和格式调整，`r=64+` 用于学习较复杂的新任务。调大 `r` 收益递减得很快。
- **`target_modules`** 决定挂在哪里。经验上挂在注意力层的 `q_proj` 和 `v_proj` 性价比最高；要更强的表达能力可以再加上 `k_proj`、`o_proj` 和 MLP 层，代价是参数变多。
- **`lora_alpha`** 是缩放系数，常取 `2r`。它和 `r` 一起决定旁路的实际影响强度。

**为什么生产环境特别爱它**

- **产物极小**：全量微调产出几十 GB 的完整模型，LoRA 只产出几十 MB 的适配器。
- **一个底座挂多个适配器**：不同客户、不同任务各训一个 LoRA，推理时按请求切换，不用为每个场景存一份完整模型。
- **可以合并**：需要时把 `BA` 加回 `W`，推理零额外开销。

**QLoRA：再省一层**

先把底座模型**量化到 4 bit 冻住**（见 `model-quantization`），再在上面挂 LoRA。这样 65B 的模型也能在单张 48G 卡上微调。代价是训练慢一些，效果略有损失——但对绝大多数团队来说，这是「能不能做」和「做不了」的区别。

**可运行代码**

```python
# pip install peft transformers torch
from peft import LoraConfig, get_peft_model, PeftModel
from transformers import AutoModelForCausalLM

base = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")

config = LoraConfig(
    r=8,                        # 秩：容量旋钮，先从小开始
    lora_alpha=16,              # 常取 2r
    lora_dropout=0.05,
    target_modules=["q_proj", "v_proj"],
    task_type="CAUSAL_LM",
)
model = get_peft_model(base, config)
model.print_trainable_parameters()
# trainable params: 540,672 || all params: 494,573,440 || trainable%: 0.1093

# ... 训练若干轮 ...

model.save_pretrained("adapter")            # 只有几 MB
# 推理时：底座 + 适配器，按需加载
merged = PeftModel.from_pretrained(
    AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct"),
    "adapter",
)
print(merged.merge_and_unload())            # 合并回底座，推理不再有额外开销
```

**注意 `trainable%` 这个数字**：0.1% 的参数就能改变模型行为。如果某次微调你需要调 50% 的参数，先回头看看是不是数据或任务定义出了问题。
