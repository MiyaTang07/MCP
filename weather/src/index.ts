import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "http://t.weather.itboy.net/api/weather/city/";

// step1: 创建server实例
const server = new McpServer({ 
  name: "weather",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
    logging: {}
  },
});

// step2:工具的服务请求
async function makeNWSRequest<T>(url: string): Promise<T | null> {  
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      console.error("Error making NWS request:", error);
      return null;
    }
  }
  
  interface forecast {
    high: string; // 高温
    low: string; // 低温
  }

  interface WeatherResponse {
    date: string,
    cityInfo: {
      city: string;
    };
    data: {
      forecast: forecast[];
    };
  }
  // 天气api的response的handler
  function format_weather(data: WeatherResponse | null): string {
    if (!data) {
      return "无法检索天气数据";
    }
    const today = data.date
    const cityInfo = data.cityInfo;
    const forecast = data.data.forecast[0];
    return [
      `日期: ${today}`,
      `城市: ${cityInfo.city || "Unknown"}`,
      `high: ${forecast.high || "Unknown"}`,
      `low: ${forecast.low || "Unknown"}`,
      "---",
    ].join("\n");
  }

  server.tool(
    "get-forecast",
    "获取中国国内某个城市天气",
    {
      code: z.string().length(9).describe("城市代码（例如 101280601=深圳,101010100=北京）"),
    },
    async ({ code }) => {
      const cityCode = code.toUpperCase()
      const pointsUrl = `${BASE_URL}${cityCode}`;
      const pointsData = await makeNWSRequest<WeatherResponse>(pointsUrl);
      
      // error first
      if (!pointsData) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve grid point data for city code: ${cityCode}.`,
            },
          ],
        };
      }
      const text = format_weather(pointsData);

      return {
        content: [
          {
            type: "text",
            text: text,
          },
        ],
      };
    },
  );

  async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP Server running on stdio");
  }
  
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });