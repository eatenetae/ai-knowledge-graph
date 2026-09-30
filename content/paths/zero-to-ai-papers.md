---
id: zero-to-ai-papers
title: 零基础到读懂 AI 论文
summary: 从「什么是机器学习」一路走到能自己翻开一篇 AI 论文而不发怵。
audience: 完全没接触过 AI、但愿意花时间把原理搞清楚的聪明人
updated_at: 2026-09-29
steps:
  - id: what-is-machine-learning
    note: 起点。先把「训练是调参数，不是写规则」这件事想通
  - id: tokenization
    note: 文字进模型前的第一道加工，决定模型「看见」的粒度
  - id: parameters-and-hyperparameters
    note: 分清模型自己学的和你提前定的，后面看论文才不会把两者搞混
  - id: loss-function
    note: 训练的唯一信号来源。看懂它，就看懂了论文里所有的训练目标
  - id: neural-network
    note: 理解「简单单元叠起来能拟合复杂规律」，这是深度的全部意义
  - id: training-vs-inference
    note: 划清学习和使用的边界，很多关于「模型会不会记住我」的困惑到此结束
  - id: embedding
    note: 关键一跳：把「意思」变成「距离」。检索、聚类、推荐全建立在这一步
  - id: vector-similarity
    note: 会算相似度，才看得懂论文里的「余弦距离」「点积」在比什么
  - id: attention
    note: 核心中的核心。务必把 Q/K/V 三步亲手写一遍
  - id: transformer
    note: 把注意力组装成完整架构，看清残差、前馈和三种形态的分工
  - id: positional-encoding
    note: 补上「顺序从哪来」这块拼图，RoPE 是现代论文的常客
  - id: encoder-decoder
    note: 三种架构形态的取舍，决定了一篇论文为什么选这个结构
  - id: next-token-prediction
    note: 想通「模型只是在猜下一个字」，很多诡异行为就都能解释了
  - id: self-supervised-learning
    note: 为什么不需要人工标注也能训练——大模型能出现的根本原因
  - id: llm-pretraining
    note: 收口：把上面所有东西串成「一个模型是怎么被训出来的」
---

## 这条路径怎么走

这条线是**严格的前置链**——每一张卡片都直接依赖前一张，**不建议跳步**。总共 15 步，走到第 12 步左右，你翻开一篇 Transformer 论文时就不会再有「每个字都认识，连起来不知道在说什么」的感觉。

和其它路径不同，这条追求的是**能自己推导**，而不是「知道有这么回事」。

## 三个必须动手的地方

1. **`attention` 里的 Q/K/V**。L3 那段 NumPy 代码，建议关掉文档自己重写一遍。先写不带掩码的版本确认形状，再加上因果掩码观察权重矩阵变成下三角，最后把 `√d` 缩放去掉，看 softmax 之后权重分布怎么变得极端——**那就是梯度消失的来源。**
2. **`loss-function` 里的交叉熵**。把 L3 代码里的 `target` 故意改错一个，看损失怎么飙升。**这是「模型被惩罚」唯一的具象样子。**
3. **`positional-encoding` 的相似度矩阵**。亲眼看一遍「相邻位置更接近、远端位置更疏远」，比读十遍公式管用。

## 建议节奏

- **第 1-6 步**：慢一点。这几张是地基，后面所有内容都建立在它们之上。大约一到两周。
- **第 7-12 步**：可以快一些，重点是把 `attention` 吃透。
- **第 13-15 步**：重新放慢。`next-token-prediction` 到 `llm-pretraining` 是从「结构」跨到「训练」的一步。

## 走完之后

你应该能回答：

- 为什么注意力的计算量随文本长度是平方级增长，以及这为什么让长文本很贵；
- 为什么位置信息必须额外注入，RoPE 相比正弦编码好在哪；
- 为什么「预测下一个词」这么简单的目标能逼出语法、事实和推理能力；
- 为什么模型会在你追问时改口，以及这跟它的训练目标有什么关系。

接下来可以往两条分支走：想**做出东西**就去 `backend-engineer-rag`，想**搞清模型为什么这样表现**就去读 `instruction-tuning` 和 `rlhf`。

到这一步，你已经具备读论文的最小词汇量了。建议从 `attention` 卡片引用的《Attention Is All You Need》开始——**它是唯一一篇你现在的知识储备刚好够读懂的奠基性论文。**
