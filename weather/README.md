### MCP-server 开发指南
- 环境：node > 17 && tsc
- 依赖包：
1. @modelcontextprotocol/sdk： 提供 @McpServer对象、@StdioServerTransport 标准输入/输出；
2. @Zod：是一个 TypeScript 优先的模式声明和验证库。

> step1: 创建MCP-server，new McpServer api
> step2: 给MCP-server注册工具（天气等）：server.tool api
- 其实这步的功能时：weather api的进行实际请求
> step3: 启动server：建立stdio输入/输出与server连接。
> step4: node process error处理

#### 注意事项：
1. weather api
```
http://t.weather.itboy.net/api/weather/city/101010100
```
1. 如何测试MCP-server功能
使用内置模块`@modelcontextprotocol/inspector`
```
npx @modelcontextprotocol/inspector node build/index.js
```
### code流程
```
McpServer = StdioServerTransport（connect） +  tool（register）
```

