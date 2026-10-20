import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "Error: GEMINI_API_KEY is not set in the environment variables.",
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const outputDir = path.join(process.cwd(), "audio");

const dialogue = [
  {
    file: "speaker1_happy.wav",
    text: "Hey! I have some amazing news. I got accepted into an AI engineering training program!",
    voice: "Puck",
    style: "Happy, excited, energetic, and natural.",
  },
  {
    file: "speaker2_surprised.wav",
    text: "Really? That's fantastic! How did you manage to get accepted?",
    voice: "Kore",
    style:
      "Surprised, curious, and friendly, with a natural conversational tone.",
  },
  {
    file: "speaker1_confident.wav",
    text: "I worked on my programming skills, built projects, and kept learning every day.",
    voice: "Puck",
    style: "Confident, enthusiastic, and clear.",
  },
  {
    file: "speaker2_encouraging.wav",
    text: "That's inspiring! Keep going. One day, you'll become an excellent AI engineer.",
    voice: "Kore",
    style: "Warm, encouraging, supportive, and friendly.",
  },
];

async function generateAudio(turn) {
  console.log(`Generating ${turn.file}...`);

  const response = await ai.interactions.create({
    model: "gemini-3.8-flash-tts",
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text: turn.text,
            annotations: [
              {
                type: "speech_metadata",
                style: turn.style,
              },
            ],
          },
        ],
      },
    ],
    response_format: { type: "audio" },
    generation_config: {
      speech_config: [{ voice: turn.voice }],
    },
  });

  const audioData = response.output_audio?.data;

  if (!audioData) {
    throw new Error(`No audio data returned for ${turn.file}`);
  }

  fs.writeFileSync(
    path.join(outputDir, turn.file),
    Buffer.from(audioData, "base64"),
  );

  console.log(`Saved: ${path.join("audio", turn.file)}`);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  for (const turn of dialogue) {
    await generateAudio(turn);
  }

  console.log("\nDone! All speaker audio files are in the audio folder.");
}

main().catch((error) => {
  console.error("\nAudio generation failed:");
  console.error(error.message || error);
  process.exit(1);
});
