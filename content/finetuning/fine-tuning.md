---
id: fine-tuning
title: 微调
domain: finetuning
pm: core
summary: 拿你自己的数据再训练一下模型，让它学会特定的风格、格式或领域说法。
prerequisites:
  - llm-pretraining
related: []
tags:
  - 训练
  - 应用开发
sources:
  - title: Fine-tuning (OpenAI Docs)
    url: https://platform.openai.com/docs/guides/fine-tuning
  - title: BERT - Pre-training of Deep Bidirectional Transformers (2019)
    url: https://arxiv.org/abs/1810.04805
updated_at: 2026-09-29
---

## 直觉

预训练出来的模型像个博学但没规矩的实习生。你想让它每次都按公司格式输出工单，光靠提示词写一长串规则，既费 token 又不稳定。

微调就是**拿几百到几万条「输入 → 你想要的输出」的例子，再训练它一小会儿**。训练完之后，那个格式成了它的**习惯**，不用每次都在提示词里叮嘱。

关键要分清微调**能**做什么、**不能**做什么：

- **能**：改变风格、固定输出格式、学会领域黑话、让模型熟悉你的任务模式、用小模型替代大模型来降本。
- **不能**：可靠地灌入新知识。想让它知道「我们上个月改了退款政策」，微调既贵又不可靠——**那是 `rag` 的活**。

一个类比：**新员工培训**。培训能让他学会公司的报表格式和说话方式（行为）。但公司昨天发的通知，培训是教不会的——他得去查公告栏（检索）。

## 细节

**几种做法**

| 方式 | 改动的参数 | 显存需求 | 适用 |
|---|---|---|---|
| 全量微调 | 全部 | 极高，通常要几十张卡 | 有大规模数据、要彻底改造模型 |
| LoRA | 极少量旁路参数 | 单卡可跑 | **绝大多数场景的默认选择** |
| 指令微调（SFT） | 视方式而定 | 中 | 让基座模型学会听指令 |

**数据质量 > 数据数量**

- 500 条**干净、一致、覆盖边界情况**的样本，通常打得过 5 万条噪声数据。
- **一致性是命门**：同类输入必须给同类输出。数据里前后矛盾，模型学到的就是随机。
- 一定要留**验证集**，而且要和训练集**不同分布**，否则你看到的只是「它背下来了」。

**什么时候该微调**

先问三个问题：

1. 提示词能不能解决？——**先穷尽提示工程**，包括 `few-shot-prompting`。
2. 是不是缺知识？——是的话去用 `rag`。
3. 是不是要**稳定行为 + 降低成本**？——是，才轮到微调。

**常见的翻车方式**

- **灾难性遗忘**：在小数据集上训太久，模型把通用能力忘了，变得只会做这一件事。缓解办法是混入一部分通用数据，并控制训练轮数。
- **过拟合**：训练损失一直降，验证损失开始升——**这时候就该停了**。
- **用错基座**：在基座模型（base）上做指令微调，和在对齐过的对话模型（instruct）上做，效果差别很大。多数场景应该从 instruct 版本起步。

**可运行代码**

用 PEFT 做一次 LoRA 微调，单卡就能跑：

```python
# pip install transformers peft datasets torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer

name = "Qwen/Qwen2.5-0.5B-Instruct"
tok = AutoTokenizer.from_pretrained(name)
model = AutoModelForCausalLM.from_pretrained(name)

# 只训练注意力里的低秩旁路，参数量不到 1%
model = get_peft_model(model, LoraConfig(
    r=8, lora_alpha=16, lora_dropout=0.05, task_type="CAUSAL_LM",
    target_modules=["q_proj", "v_proj"],
))
model.print_trainable_parameters()      # trainable: ~0.1%

# 数据必须是「同类输入 -> 同类输出」的一致样本
raw = [
    {"in": "工单：登录失败", "out": "【类型】账号 【优先级】P1 【处理】检查认证服务日志"},
    {"in": "工单：页面加载慢", "out": "【类型】性能 【优先级】P2 【处理】查看接口耗时与慢查询"},
]

def to_text(row):
    text = f"### 输入\n{row['in']}\n### 输出\n{row['out']}{tok.eos_token}"
    return tok(text, truncation=True, max_length=256)

ds = Dataset.from_list(raw).map(to_text, remove_columns=["in", "out"])

Trainer(
    model=model,
    args=TrainingArguments(output_dir="out", num_train_epochs=3,
                           per_device_train_batch_size=2, learning_rate=2e-4,
                           logging_steps=1, save_strategy="no"),
    train_dataset=ds,
).train()
```

真实项目里 `raw` 应该是几百到几千条。**注意 `num_train_epochs=3` 是个保守值**——小数据集上训 20 轮，你多半会得到一个小小年纪就只会背工单格式的模型。
