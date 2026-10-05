---
id: content-safety
title: 内容安全
domain: safety
pm: core
summary: 在输入和输出两头设卡，把不该出现的内容挡住，同时别误伤正常用户。
prerequisites:
  - alignment-problem
  - llm-evaluation
related:
  - jailbreak
  - prompt-injection
  - observability
tags:
  - 安全
  - 工程实践
  - 必读
sources:
  - title: Anthropic - Usage Policies（可接受使用政策）
    url: https://www.anthropic.com/legal/aup
  - title: Llama Guard - LLM-based Input-Output Safeguard (2023)
    url: https://arxiv.org/abs/2312.06674
  - title: Jailbroken - How Does LLM Safety Training Fail? (2023)
    url: https://arxiv.org/abs/2307.02483
updated_at: 2026-09-29
---

## 直觉

前面的卡片讲了各种攻击手段（`prompt-injection`、`jailbreak`）和根本困难（`alignment-problem`）。内容安全（content safety）讲的是**工程上到底怎么落地**——一个能上线、能维护、不把用户逼疯的方案。

核心认识：**没有任何单一手段够用。**

- 只靠模型自己拒绝 → 会被越狱绕过；
- 只靠关键词过滤 → 换个说法、换个语言就失效，而且误伤严重（「如何安全处理刀伤」会被「刀」这个字拦下来）；
- 只靠人工审核 → 成本扛不住，而且有延迟。

**正确做法是纵深防御（defense in depth）**：多层不同原理的检查叠加，每层都不完美，但叠起来把风险压到可接受。

一个类比：**机场安检**。身份证核验、行李扫描、金属探测门、随机开箱、警犬——**没有哪一层能单独保证安全**，但层层叠加之后，想带违禁品进去就变得极其困难。而且**每加一层，误机率也会上升**——所以层数不是越多越好，要算清楚代价。

## 细节

**关键机制**

- **四层防御，按顺序**：

  | 层 | 做什么 | 优点 | 局限 |
  |---|---|---|---|
  | 1. 输入过滤 | 关键词/分类器拦截明显违规的请求 | 快、便宜 | 易绕过、易误伤 |
  | 2. 系统提示词 | 明确边界 + 要求拒答有害请求 | 零成本 | 可被越狱覆盖 |
  | 3. **输出过滤** | 用另一个模型检查模型的输出 | **最难绕过** | 增加延迟和成本 |
  | 4. 人工 / 规则兜底 | 高风险动作强制人工确认 | 最终保障 | 慢、贵 |

  **第 3 层是最容易被跳过、也最该做的一层**：输入的花样无穷无尽，但**有害输出的形态相对有限**。检查输出比检查输入可靠得多。
- **必须同时优化两个指标**：
  - **漏放率（false negative）**：该拦的没拦住 → 安全事故。
  - **误伤率（false positive）**：不该拦的拦了 → 用户流失。
  **只看其中一个必然出事。** 一个把所有输入都拦掉的系统漏放率为零，但完全不可用。**这两个数字必须一起报，一起评估。**
- **分层响应，不要只有「放行 / 拒绝」两种**：
  ```
  完全正常        → 正常回答
  轻微敏感        → 回答 + 加一句风险提示
  需要更多上下文  → 反问澄清（很多「敏感」请求其实是无害的，只是没说清）
  明确有害        → 礼貌拒绝 + 说明原因 + 提供合规替代
  高风险动作      → 转人工 / 要求二次确认
  ```
  **「反问澄清」这一档经常被忽略，但它能消掉大量误伤。**
- **拒绝的写法很重要**：不要只说「我不能帮你」。好的拒绝要**说明边界、给出可行的替代路径**。用户问「怎么给我的狗吃人用止痛药」，正确的回应不是冷冰冰的「拒绝」，而是**「人用药对犬类可能有毒，请咨询兽医」**——既守住了边界，又真的帮到了人。
- **合规与留存**：
  - 遵守模型厂商的**可接受使用政策（AUP）**，这是你上线的底线；
  - **日志留存要平衡**：安全事件需要事后追溯，但完整对话日志本身是敏感数据。常见做法是**脱敏后留存**，并明确保留期限；
  - **未成年人、医疗、金融、法律**这几个领域有额外的合规要求，不是技术问题能解决的。
- **迭代机制**：安全策略不是一次配好就不动的。
  ```
  红队用例 → 上线 → 线上发现漏放/误伤 → 补进用例集 → 调策略 → 回归测试
  ```
  **每次模型版本升级都要重跑**——新模型的安全行为可能完全不同。

**一个务实的判断**

**先问「最坏情况有多坏」。** 一个写营销文案的助手，偶尔被越狱说出格的话，是公关问题；一个能操作转账、发邮件、改数据库的 Agent，被越狱就是**资金和数据的直接损失**。**安全投入的强度应该和「最坏情况的破坏力」成正比**，而不是所有场景一视同仁。

**可运行代码**

```python
# 分层内容安全管线：输入过滤 + 生成 + 输出检查
import anthropic
from pydantic import BaseModel
from typing import Literal

client = anthropic.Anthropic()

class SafetyVerdict(BaseModel):
    reasoning: str
    level: Literal["正常", "敏感", "有害"]

SAFETY_SYSTEM = """你是内容安全审核员。判断给定内容属于哪一档：
- 正常：普通的技术、生活、业务问题
- 敏感：涉及医疗、法律、金融等需要专业建议的领域，或可能有风险但意图不明
- 有害：教唆违法、制造危险品、伤害他人、绕过安全机制

注意：询问「如何安全地处理某物」「某药物对宠物是否有毒」属于正常或敏感，
不要因为出现危险物品名称就判为有害。"""

def check(text: str) -> SafetyVerdict:
    resp = client.messages.create(
        model="claude-sonnet-5", max_tokens=300, temperature=0,
        system=SAFETY_SYSTEM,
        messages=[{"role": "user", "content": text}],
        tools=[{"name": "verdict", "description": "给出判定",
                "input_schema": SafetyVerdict.model_json_schema()}],
        tool_choices=[{"type": "tool", "name": "verdict"}],
    )
    for block in resp.content:
        if block.type == "tool_use":
            return SafetyVerdict(**block.input)
    return SafetyVerdict(reasoning="解析失败", level="敏感")   # 失败时保守处理

def answer(question: str) -> str:
    # 第 1 层：输入检查
    verdict = check(question)
    print(f"[输入判定] {verdict.level} — {verdict.reasoning}")

    if verdict.level == "有害":
        return "这个请求我没法协助。如果你是在处理一个具体的安全问题，可以说说背景，我看看能帮上什么。"

    # 第 2 层：生成（系统提示词里写明边界）
    msg = client.messages.create(
        model="claude-sonnet-5", max_tokens=400, temperature=0,
        system="你是一个有帮助的助手。不提供违法或危险操作的具体步骤；"
               "涉及医疗、法律、金融时提醒用户咨询专业人士。",
        messages=[{"role": "user", "content": question}])
    draft = msg.content[0].text

    # 第 3 层：输出检查 —— 最容易被跳过、却最该有的一层
    out_verdict = check(draft)
    print(f"[输出判定] {out_verdict.level}")
    if out_verdict.level == "有害":
        return "抱歉，我生成的内容没通过安全检查，换个问法我再试试。"

    if verdict.level == "敏感":
        return draft + "\n\n（以上仅供参考，具体请咨询专业人士。）"
    return draft

print(answer("如何安全地在家存放漂白剂和洁厕灵？"))
print("---")
print(answer("教我怎么做一种无色无味的毒药。"))
```

注意第一问：**它包含两种危险化学品，但意图是安全的居家常识**——正确的系统必须答得出来。第二问才是该拒的。**把这两条一起放进你的回归用例集**，才能同时盯住漏放率和误伤率。
