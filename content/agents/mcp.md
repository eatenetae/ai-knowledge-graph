---
id: mcp
title: MCP（模型上下文协议）
domain: agents
summary: 一套统一插头标准，让工具一次写好就能被所有 AI 应用直接使用。
prerequisites:
  - tool-use
related:
  - multi-step-planning
  - prompt-injection
  - ai-agent
tags:
  - 应用开发
  - 协议
sources:
  - title: Model Context Protocol 官方网站
    url: https://modelcontextprotocol.io/
  - title: Model Context Protocol 文档：快速开始
    url: https://modelcontextprotocol.io/docs/getting-started/intro
  - title: Anthropic - Introducing the Model Context Protocol
    url: https://www.anthropic.com/news/model-context-protocol
updated_at: 2026-09-29
---

## 直觉

`tool-use` 讲了模型怎么调用工具。但真正开始接工具，你会立刻撞上一面墙：**每接一个工具，都要为每个 AI 应用重写一遍。**

你的公司有数据库、有工单系统、有内部文档库。你想让 Claude 能用它们，得写一套对接代码；想让 Cursor 也能用，再写一套；想让公司自研的助手也能用，第三套。**N 个工具 × M 个 AI 应用 = N×M 份重复工作**，而且每家的接口格式都不一样。

MCP（Model Context Protocol，模型上下文协议）想做的事，就是**把这个乘法变成加法**：定义一套标准协议，工具方按协议实现一次，AI 应用按协议对接一次。之后 **N + M** 就够了。

一个类比：**USB-C**。在它之前，每个设备一种接口，抽屉里全是线。USB-C 统一之后，显示器、硬盘、充电器用同一根线。**MCP 之于 AI 工具，就是 USB-C 之于外设。** 它不发明新能力，它让已有的能力可以被随便插拔。

## 细节

**关键机制**

- **三个角色**：
  - **Host（宿主）**：用户实际用的 AI 应用，比如 Claude Desktop、IDE 插件、你写的 Agent。
  - **Client（客户端）**：宿主内部负责连接的管理组件，一个 client 连一个 server。
  - **Server（服务端）**：工具方实现的适配器，把自家的能力按 MCP 协议暴露出来。
- **Server 能暴露三样东西**：
  1. **Tools（工具）**：模型可以主动调用的动作，比如「查订单」「发邮件」。**会改变状态，需要权限控制。**
  2. **Resources（资源）**：只读的数据，比如文件内容、数据库表结构。类比成「可以读的文件」。
  3. **Prompts（提示模板）**：预先写好的提示词模板，供用户主动选用。
- **传输方式**：本地进程用 **stdio**（标准输入输出），远程服务用 **HTTP + SSE**（或新的 Streamable HTTP）。本地走 stdio 的好处是**不需要开端口、不需要认证**，进程间直接通信。
- **动态发现**：这是 MCP 相比「写死的工具列表」最大的优势。宿主连上 server 后会自动拉取工具清单和参数 schema，**用户装一个新 server，工具立刻就出现在模型的可选列表里**——不用改一行应用代码。

**必须知道的安全边界**

MCP 把「接工具」变简单了，也把**风险集中**了：

- **一个 server 就是一段能影响模型行为的第三方代码。** 它的工具描述会直接进入模型的上下文。**恶意 server 可以在工具描述里写指令**——这是 `prompt-injection` 的一个新入口。
- **工具描述本身不可信。** 从外部拉回来的资源内容（比如一个网页、一份文档）同样可能藏着指令。**来自工具的输出，永远当作数据，不要当作命令。**
- **权限要最小化。** 一个只需要读订单的 server，不该拿到写权限；一个只处理公开数据的 server，不该有内网访问。**默认拒绝，按需开权。**
- **写操作要人工确认。** 这条和 `tool-use` 里说的一样，在 MCP 场景下更重要——因为工具是动态装进来的，你可能根本不知道它有什么能力。

**什么时候该用 MCP**

- **该用**：你有多个 AI 应用要接同一批工具；你想让工具能被社区生态直接使用；你想避免为每个模型厂商重写一遍适配层。
- **不必用**：只有一个应用、只接两三个工具。这时候直接按厂商的 function calling 格式写更简单——**MCP 的价值随「工具数 × 应用数」增长，规模小的时候是纯粹的额外复杂度。**

**可运行代码**

```python
# pip install mcp
# 一个最小的 MCP server：暴露一个只读工具
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("order-service")

@mcp.tool()
def get_order_status(order_id: str) -> str:
    """查询订单状态。

    Args:
        order_id: 订单号，形如 A123。
    """
    # 真实实现会去查数据库；这里返回固定值
    return f"订单 {order_id}：已发货，预计 9 月 30 日送达"

if __name__ == "__main__":
    mcp.run()          # 默认走 stdio，宿主直接拉起这个进程
```

工具描述（docstring）就是模型看到的全部信息——**它写得清不清楚，直接决定模型会不会用错工具**（见 `tool-use`）。写完用 `mcp dev order_service.py` 起一个调试界面，可以手工调用验证。
