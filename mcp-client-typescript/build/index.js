import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
dotenv.config();
const BASE_API = process.env.BASE_API;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
}
class MCPClient {
    mcpClient;
    openaiLLM;
    transport = null;
    tools = [];
    constructor() {
        this.openaiLLM = new OpenAI({
            baseURL: BASE_API,
            apiKey: ANTHROPIC_API_KEY,
        });
        this.mcpClient = new Client({
            name: "mcp-client-cli",
            version: "1.0.0",
            capabilities: {
                logger: {}
            }
        });
    }
    // 方法1: 连接到server 示例：/Users/tangjiao/MCP/weather/build/index.js
    async connectToServer(serverScriptPath) {
        try {
            const isJs = serverScriptPath.endsWith(".js");
            const isPy = serverScriptPath.endsWith(".py");
            if (!isJs && !isPy) {
                throw new Error("Server script must be a .js or .py file");
            }
            const command = isPy
                ? process.platform === "win32"
                    ? "python"
                    : "python3"
                : process.execPath;
            this.transport = new StdioClientTransport({
                command,
                args: [serverScriptPath],
            });
            // mcp-client连接stdio输入/输出
            this.mcpClient.connect(this.transport);
            // 获取mcp的工具清单
            const toolsResult = await this.mcpClient.listTools();
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    type: "function",
                    function: {
                        name: tool.name,
                        description: tool.description || "",
                        parameters: tool.inputSchema,
                    }
                };
            });
            console.log("Connected to server with tools:", toolsResult.tools.map((tool) => tool.name));
        }
        catch (e) {
            console.log("Failed to connect to MCP server: ", e);
            throw e;
        }
    }
    // 方法2: 进行用户输入处理
    async processQuery(query) {
        const messages = [
            {
                role: "user",
                content: query || "今天天津的天气如何",
            },
        ];
        // LLM进行回答
        const response = await this.openaiLLM.chat.completions.create({
            model: MODEL || "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            messages,
            tools: this.tools,
            stream: false
        });
        console.log('LLM 问询的response===>', JSON.stringify(response));
        const content = response.choices[0];
        const { finish_reason, message } = content;
        // LLM的最终语言结果【for users】
        const finalText = [];
        // mcp-server tool的result集合
        const toolResults = [];
        if (finish_reason === 'tool_calls' && message && message.tool_calls) {
            const tool_call = message.tool_calls[0];
            if (!tool_call) {
                console.log("No tool calls found in response");
                return '没有获取天气数据的工具';
            }
            const toolName = tool_call.function.name;
            const toolArgs = JSON.parse(tool_call.function.arguments);
            console.log(`\n调用 MCP Server ${toolName} with args ${JSON.stringify(toolArgs)}\n`);
            // 开始调用MCP-server的tool
            const result = await this.mcpClient.callTool({
                name: toolName,
                arguments: toolArgs
            });
            console.log('MCP server 的response is===》', result);
            if (result.isError) {
                console.log("Error calling tool: ", result.error);
                return;
            }
            toolResults.push(result);
            messages.push(message);
            messages.push({
                role: 'tool',
                content: JSON.stringify(result.content),
                tool_call_id: tool_call.id,
            });
            // 此处需要openai的进行【server-tool-output】的语言输出
            try {
                const chatResult = await this.openaiLLM.chat.completions.create({
                    model: MODEL || 'claude-3-5-sonnet-20241022',
                    messages: messages,
                    tools: this.tools
                    // max_tokens: 1000,
                    // stream: false
                });
                console.log('chatResult====>', JSON.stringify(chatResult));
                finalText.push(chatResult.choices[0].message);
            }
            catch (err) {
                console.error('LLM response output error：', err);
            }
        }
        return finalText.join('\n');
    }
    // 创建【用户命令行工具】
    async chatLoop() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        try {
            console.log("\nMCP Client Started!");
            console.log("Type your queries or 'quit' to exit.");
            while (true) {
                const message = await rl.question("\nQuery: ");
                if (message.toLowerCase() === "quit") {
                    break;
                }
                // 该processQuery进行用户问询处理
                const response = await this.processQuery(message);
                console.log("\n" + response);
            }
        }
        finally {
            rl.close();
        }
    }
    // 进行客户端关闭
    async cleanup() {
        await this.mcpClient.close();
    }
}
// 启动该MCP-Client
async function main() {
    if (process.argv.length < 3) {
        console.log("Usage: node index.ts <path_to_server_script>");
        return;
    }
    const mcpClient = new MCPClient();
    try {
        // step1: client连接到server
        await mcpClient.connectToServer(process.argv[2]);
        // step2: 保持用户状态的可连接
        await mcpClient.chatLoop();
    }
    finally {
        // 否则，断开连接
        await mcpClient.cleanup();
        process.exit(0);
    }
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
