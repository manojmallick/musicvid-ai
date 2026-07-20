import fs from "fs";
import path from "path";
import axios from "axios";

export interface WanGenerateResult {
  clipPath: string;
  description: string;
}

export class WanClient {
  private apiKey?: string;
  private baseUrl: string;
  private simulation: boolean;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.WAN_API_KEY;
    this.baseUrl = baseUrl || process.env.WAN_BASE_URL || "https://api.wan.video/v1";
    this.simulation = !this.apiKey;
  }

  async generate(
    prompt: string,
    outputDir: string,
    shotId: number
  ): Promise<string> {
    fs.mkdirSync(outputDir, { recursive: true });
    const placeholder = path.join(outputDir, `shot_${String(shotId).padStart(3, "0")}.txt`);
    fs.writeFileSync(placeholder, prompt);

    if (this.simulation) {
      return placeholder;
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    const payload = {
      model: "wan-2.1-t2v-14b",
      prompt,
      size: "1280x720",
      num_frames: 81,
    };

    const res = await axios.post(`${this.baseUrl}/videos/generations`, payload, {
      headers,
      timeout: 120000,
    });

    const data = res.data;
    const videoUrl = data.id ? await this.poll(data.id) : data.data[0].url;
    const videoPath = path.join(outputDir, `shot_${String(shotId).padStart(3, "0")}.mp4`);
    const videoRes = await axios.get(videoUrl, { responseType: "arraybuffer", timeout: 120000 });
    fs.writeFileSync(videoPath, Buffer.from(videoRes.data));
    return videoPath;
  }

  private async poll(jobId: string): Promise<string> {
    const headers = { Authorization: `Bearer ${this.apiKey}` };
    while (true) {
      const res = await axios.get(`${this.baseUrl}/videos/generations/${jobId}`, {
        headers,
        timeout: 30000,
      });
      const data = res.data;
      const status = data.status;
      if (status === "succeeded") return data.data[0].url;
      if (status === "failed") throw new Error(`Wan job ${jobId} failed: ${JSON.stringify(data)}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  describeClip(clipPath: string): string {
    if (clipPath.endsWith(".txt")) {
      return "[simulation] " + fs.readFileSync(clipPath, "utf-8").slice(0, 200);
    }
    return `[real clip] ${path.basename(clipPath)}`;
  }
}
