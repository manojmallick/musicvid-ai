import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

export const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

export function getApiKey(): string {
  const key = process.env.QWEN_API_KEY;
  if (!key) {
    throw new Error(
      "QWEN_API_KEY not found. Copy .env.example to .env and add your key."
    );
  }
  return key;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Strip markdown code fences and any prose around the first JSON object/array. */
export function cleanJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.search(/[[{]/);
  if (start >= 0) {
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (end > start) return text.slice(start, end + 1);
  }
  return text.trim();
}

export class QwenClient {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || getApiKey(),
      baseURL: QWEN_BASE_URL,
    });
  }

  async chat(options: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: options.model || "qwen-max",
      messages: options.messages as any,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    });
    return res.choices[0].message.content || "";
  }

  async jsonChat<T = any>(options: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
  }): Promise<T> {
    const text = await this.chat({
      ...options,
      model: options.model || "qwen-max",
      temperature: options.temperature ?? 0.2,
    });
    return JSON.parse(cleanJson(text));
  }
}
