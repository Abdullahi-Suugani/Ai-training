import "dotenv/config";
import express from "express";
import archiver from "archiver";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "output");
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;
let latest = { content: null, image: null, audio: null };

app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () =>
    console.log(
      `${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`,
    ),
  );
  next();
});

const fail = (res, status, message) =>
  res.status(status).json({ error: message });
function requireApiKey(res) {
  if (!ai) {
    fail(
      res,
      503,
      "GEMINI_API_KEY is missing. Add it to .env and restart the server.",
    );
    return false;
  }
  return true;
}
function text(value, name, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${name} is required and must be under ${max} characters.`);
  return value.trim();
}
async function save(name, data) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, name), data);
}
function validateContent(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !value.title ||
    !value.article ||
    !value.summary ||
    !Array.isArray(value.socialPosts) ||
    value.socialPosts.length !== 3 ||
    !value.imagePrompt ||
    !value.narration
  )
    throw new Error("Gemini returned an incomplete content object.");
  return value;
}
async function generateFor(topic, audience, tone) {
  const request = {
    contents: `Create content about ${topic}. Audience: ${audience}. Tone: ${tone}.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          article: { type: "string" },
          summary: { type: "string" },
          socialPosts: { type: "array", items: { type: "string" } },
          imagePrompt: { type: "string" },
          narration: { type: "string" },
        },
        required: [
          "title",
          "article",
          "summary",
          "socialPosts",
          "imagePrompt",
          "narration",
        ],
      },
    },
  };
  let lastError;
  for (const model of ["gemini-2.5-flash", "gemini-3.8-flash"]) {
    try {
      const response = await ai.models.generateContent({ model, ...request });
      return validateContent(JSON.parse(response.text));
    } catch (error) {
      lastError = error;
    }
  }
  const raw = String(lastError?.message || lastError || "");
  let detail = raw;
  try { detail = JSON.parse(raw).message || raw; } catch {}
  throw new Error(`Gemini is temporarily unavailable. Please try again in a minute. Details: ${detail}`);
}

app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    configured: Boolean(ai),
    uptimeSeconds: Math.round(process.uptime()),
  }),
);

app.post("/api/generate", async (req, res) => {
  try {
    if (!requireApiKey(res)) return;
    const topic = text(req.body.topic, "Topic"),
      audience = text(req.body.audience, "Audience"),
      tone = text(req.body.tone, "Tone");
    const content = await generateFor(topic, audience, tone);
    latest.content = content;
    await save(
      "content.json",
      JSON.stringify({ ...content, topic, audience, tone }, null, 2),
    );
    await save("article.md", `# ${content.title}\n\n${content.article}`);
    await save("narration.txt", content.narration);
    res.json(content);
  } catch (error) {
    console.error(error);
    fail(res, 502, error.message || "Content generation failed.");
  }
});

app.post("/api/image", async (req, res) => {
  try {
    if (!requireApiKey(res)) return;
    const prompt = text(req.body.prompt, "Image prompt", 2000);
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: prompt,
      config: { responseModalities: ["IMAGE"] },
    });
    const part = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData,
    );
    if (!part)
      throw new Error(
        "The model did not return an image. Check image-model access for your API key.",
      );
    const buffer = Buffer.from(part.inlineData.data, "base64");
    await save("thumbnail.png", buffer);
    latest.image = true;
    res.json({ ok: true, url: "/output/thumbnail.png" });
  } catch (error) {
    console.error(error);
    fail(res, 502, error.message || "Image generation failed.");
  }
});

app.post("/api/audio", async (req, res) => {
  try {
    if (!requireApiKey(res)) return;
    const narration = text(req.body.narration, "Narration", 12000),
      voice = text(req.body.voice || "Kore", "Voice", 40),
      style = text(req.body.style || "professional", "Style", 80);
    const interaction = await ai.interactions.create({
      model: "gemini-3.8-flash-tts",
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text: narration,
              annotations: [{ type: "speech_metadata", style }],
            },
          ],
        },
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice }] },
    });
    const data = interaction.output_audio?.data;
    if (!data) throw new Error("The TTS model returned no audio.");
    const buffer = Buffer.from(data, "base64");
    await save("narration.wav", buffer);
    latest.audio = true;
    res.json({ ok: true, url: "/output/narration.wav" });
  } catch (error) {
    console.error(error);
    fail(res, 502, error.message || "Audio generation failed.");
  }
});

app.post("/api/batch", async (req, res) => {
  if (!requireApiKey(res)) return;
  const topics = Array.isArray(req.body.topics)
    ? req.body.topics.slice(0, 5)
    : [];
  if (!topics.length) return fail(res, 400, "Provide 1–5 topics.");
  const results = [];
  for (const topic of topics) {
    try {
      results.push({
        topic,
        content: await generateFor(
          text(topic, "Topic"),
          req.body.audience || "general readers",
          req.body.tone || "clear",
        ),
      });
    } catch (error) {
      results.push({ topic, error: error.message });
    }
  }
  res.json({ results });
});

app.get("/api/export", async (req, res) => {
  res.attachment("ai-content-studio-export.zip");
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (error) => res.destroy(error));
  archive.pipe(res);
  const files = [
    "content.json",
    "article.md",
    "narration.txt",
    "thumbnail.png",
    "narration.wav",
  ];
  for (const name of files) {
    try {
      archive.file(path.join(outputDir, name), { name });
    } catch {}
  }
  archive.append(
    "AI Content Studio export\nGenerated files are included only when they exist.\n",
    { name: "README.txt" },
  );
  await archive.finalize();
});

app.use("/output", express.static(outputDir));
app.listen(PORT, () =>
  console.log(`AI Content Studio running at http://localhost:${PORT}`),
);
