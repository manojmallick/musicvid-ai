import fs from "fs";
import path from "path";
import { QwenClient } from "./qwenClient";
import { WanClient } from "./wanClient";

export interface Shot {
  id: number;
  section: string;
  startSeconds: number;
  endSeconds: number;
  description: string;
  cameraMovement: string;
  cameraAngle: string;
  lighting: string;
  emotionalTone: string;
  durationSeconds: number;
  wanPrompt: string;
  clipPath?: string;
  qualityScore: number;
}

export interface MusicVideo {
  songTitle: string;
  artistStyle: string;
  mood: string;
  durationSeconds: number;
  themeBrief: Record<string, any>;
  shots: Shot[];
  editPlan: Record<string, any>;
  manifestPath: string;
}

export class MusicVidAI {
  private client: QwenClient;
  private wan: WanClient;

  constructor(client?: QwenClient, wan?: WanClient) {
    this.client = client || new QwenClient();
    this.wan = wan || new WanClient();
  }

  async analyzeTheme(
    title: string,
    artistStyle: string,
    mood: string,
    lyrics = ""
  ): Promise<Record<string, any>> {
    const prompt = `You are a cinematic music video analyst.
Given this song, produce a concise thematic brief.

Title: ${title}
Artist style: ${artistStyle}
Mood: ${mood}
Lyrics:
${lyrics || "[not provided]"}

Return JSON:
{
  "themes": ["..."],
  "visual_palette": "...",
  "narrative_arc": "...",
  "color_grade": "...",
  "overall_style": "..."
}`;
    return this.client.jsonChat({
      messages: [{ role: "user", content: prompt }],
      model: "qwen-max",
      temperature: 0.6,
    });
  }

  async createShotList(
    themeBrief: Record<string, any>,
    durationSeconds: number
  ): Promise<Shot[]> {
    const prompt = `You are a music video director. Create a shot list for a ${durationSeconds}s video.

Thematic brief:
${JSON.stringify(themeBrief, null, 2)}

Return JSON with a list of shots. Total duration must sum to approximately ${durationSeconds}s.
{
  "shots": [
    {
      "id": 1,
      "section": "Intro",
      "start_seconds": 0,
      "end_seconds": 15,
      "description": "...",
      "camera_movement": "...",
      "camera_angle": "...",
      "lighting": "...",
      "emotional_tone": "..."
    }
  ]
}`;
    const result = await this.client.jsonChat<{ shots: any[] }>({
      messages: [{ role: "user", content: prompt }],
      model: "qwen-max",
      temperature: 0.5,
    });

    return (result.shots || []).map((raw) => ({
      id: raw.id,
      section: raw.section || "Section",
      startSeconds: raw.start_seconds || 0,
      endSeconds: raw.end_seconds || 5,
      description: raw.description || "",
      cameraMovement: raw.camera_movement || "static",
      cameraAngle: raw.camera_angle || "eye level",
      lighting: raw.lighting || "natural",
      emotionalTone: raw.emotional_tone || "neutral",
      durationSeconds: (raw.end_seconds || 5) - (raw.start_seconds || 0),
      wanPrompt: "",
      qualityScore: 0,
    }));
  }

  shotToWanPrompt(shot: Shot, styleBrief: string): string {
    return `Cinematic music video shot, 4K quality, professional color grading.
Visual style: ${styleBrief}
Scene: ${shot.description}
Camera: ${shot.cameraMovement} — ${shot.cameraAngle}
Lighting: ${shot.lighting}
Mood: ${shot.emotionalTone}
Duration cue: ${shot.durationSeconds.toFixed(1)} seconds
NO text, NO watermarks, NO artificial elements.
Film aesthetic, shallow depth of field, natural motion blur.`;
  }

  async evaluateClip(shotBrief: any, clipDescription: string): Promise<any> {
    const prompt = `You are a video quality reviewer.
Shot brief: ${JSON.stringify(shotBrief)}
Generated clip description: ${clipDescription}
Does the clip match the brief? Score 0-1 and suggest a prompt addition if it needs regeneration.
Return JSON: {"score": 0.0-1.0, "retry_prompt_addition": "..."}`;
    return this.client.jsonChat({
      messages: [{ role: "user", content: prompt }],
      model: "qwen-max",
      temperature: 0.2,
    });
  }

  async generateClips(
    shots: Shot[],
    themeBrief: Record<string, any>,
    outputDir: string,
    maxRetries = 2
  ): Promise<Shot[]> {
    const styleBrief = themeBrief["overall_style"] || "cinematic, filmic";
    for (const shot of shots) {
      let prompt = this.shotToWanPrompt(shot, styleBrief);
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const clipPath = await this.wan.generate(prompt, outputDir, shot.id);
        const description = this.wan.describeClip(clipPath);
        const evaluation = await this.evaluateClip(
          {
            description: shot.description,
            camera: `${shot.cameraMovement} — ${shot.cameraAngle}`,
            lighting: shot.lighting,
            mood: shot.emotionalTone,
          },
          description
        );
        const score = parseFloat(evaluation.score || "0");
        shot.clipPath = clipPath;
        shot.qualityScore = score;
        shot.wanPrompt = prompt;
        if (score >= 0.7 || attempt === maxRetries) break;
        const addition = evaluation.retry_prompt_addition || "";
        prompt = `${prompt}\nAdditional direction: ${addition}`;
      }
    }
    return shots;
  }

  async createEditPlan(video: MusicVideo): Promise<Record<string, any>> {
    const shotsJson = video.shots.map((s) => ({
      id: s.id,
      section: s.section,
      description: s.description,
      duration: s.durationSeconds,
      quality_score: s.qualityScore,
      clip_path: s.clipPath,
    }));
    const prompt = `You are a video editor. Create an assembly plan for this music video.

Song: ${video.songTitle}
Style: ${video.artistStyle}
Mood: ${video.mood}

Shots:
${JSON.stringify(shotsJson, null, 2)}

Return JSON:
{
  "timeline": [{"shot_id": 1, "start": 0, "end": 15, "transition": "cut|dissolve|fade"}],
  "speed_adjustments": {"1": "100%"},
  "color_grade_notes": "...",
  "lyrics_overlay": {"enabled": true, "style": "..."}
}`;
    return this.client.jsonChat({
      messages: [{ role: "user", content: prompt }],
      model: "qwen-max",
      temperature: 0.4,
    });
  }

  async produce(
    title: string,
    artistStyle: string,
    mood: string,
    durationSeconds: number,
    lyrics = "",
    outputDir = "musicvid_output"
  ): Promise<MusicVideo> {
    fs.mkdirSync(outputDir, { recursive: true });

    const themeBrief = await this.analyzeTheme(title, artistStyle, mood, lyrics);
    const video: MusicVideo = {
      songTitle: title,
      artistStyle,
      mood,
      durationSeconds,
      themeBrief,
      shots: await this.createShotList(themeBrief, durationSeconds),
      editPlan: {},
      manifestPath: "",
    };

    video.shots = await this.generateClips(
      video.shots,
      video.themeBrief,
      path.join(outputDir, "clips")
    );
    video.editPlan = await this.createEditPlan(video);

    const manifest = {
      song_title: video.songTitle,
      artist_style: video.artistStyle,
      mood: video.mood,
      theme_brief: video.themeBrief,
      shots: video.shots,
      edit_plan: video.editPlan,
    };
    const manifestPath = path.join(outputDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    video.manifestPath = manifestPath;
    return video;
  }
}

async function demo() {
  const ai = new MusicVidAI();
  const video = await ai.produce(
    "Fade Into You",
    "Mazzy Star",
    "melancholic",
    60,
    "I want to hold the hand inside you..."
  );
  console.log(`Manifest written to: ${video.manifestPath}`);
  console.log(`Shots: ${video.shots.length}`);
  for (const s of video.shots.slice(0, 3)) {
    console.log(
      `  ${s.id}: ${s.section} (${s.durationSeconds.toFixed(1)}s) score=${s.qualityScore.toFixed(2)}`
    );
  }
}

if (require.main === module) {
  demo().catch(console.error);
}
