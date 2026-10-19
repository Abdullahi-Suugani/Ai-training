import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load local .env values without requiring an extra package.
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}

const demoImages = {
  square: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=900&q=85',
  landscape: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=85',
  portrait: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=85'
};

async function generate(body) {
  const { prompt, model = 'gpt-image-1', sizes = ['square'], quality = 'standard' } = body || {};
  if (!prompt?.trim()) throw new Error('Please enter a theme or prompt.');
  const chosen = Array.isArray(sizes) && sizes.length ? sizes : ['square'];
  const enhanced = `Editorial image inspired by: ${prompt.trim()}. Cinematic lighting, strong composition, high detail.`;
  try {
    if (process.env.GEMINI_API_KEY) {
      const results = await Promise.all(chosen.map(async size => {
        const format = size === 'landscape' ? 'wide landscape composition' : size === 'portrait' ? 'vertical portrait composition' : 'square composition';
        const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-image:generateContent', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: `${enhanced} Use a ${format}.` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Gemini image generation failed.');
        const imagePart = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
        if (!imagePart) throw new Error('Gemini returned no image. Check that image generation is enabled for your key.');
        return { id: crypto.randomUUID(), size, url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`, prompt: enhanced, model: 'gemini-2.5-flash-image', createdAt: new Date().toISOString(), cost: 0 };
      }));
      return { images: results, enhancedPrompt: enhanced, live: true, provider: 'gemini' };
    }
    if (process.env.OPENAI_API_KEY) {
      const results = await Promise.all(chosen.map(async size => {
        const apiSize = size === 'landscape' ? '1536x1024' : size === 'portrait' ? '1024x1536' : '1024x1024';
        const response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model, prompt: enhanced, size: apiSize, quality }) });
        const image = await response.json(); if (!response.ok) throw new Error(image.error?.message || 'Image API request failed.');
        return { id: crypto.randomUUID(), size, url: image.data[0].url || `data:image/png;base64,${image.data[0].b64_json}`, prompt: enhanced, model, createdAt: new Date().toISOString(), cost: quality === 'hd' ? 0.08 : 0.04 };
      }));
      return { images: results, enhancedPrompt: enhanced, live: true };
    }
    return { images: chosen.map(size => ({ id: crypto.randomUUID(), size, url: demoImages[size], prompt: enhanced, model, createdAt: new Date().toISOString(), cost: 0 })), enhancedPrompt: enhanced, live: false };
  } catch (error) { throw new Error(error.message || 'Generation failed.'); }
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer(async (req,res)=>{
  try {
    if(req.url==='/api/generate'&&req.method==='POST'){
      let raw=''; for await(const chunk of req) raw+=chunk;
      const result=await generate(JSON.parse(raw));
      res.writeHead(200,{'Content-Type':'application/json'});
      return res.end(JSON.stringify(result));
    }
    const file=req.url==='/'?'/index.html':req.url;
    const target=path.join(__dirname,'public',file);
    if(!target.startsWith(path.join(__dirname,'public'))) throw Error('Invalid path');
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});
    return res.end(fs.readFileSync(target));
  } catch(e) {
    if (res.headersSent) return res.end();
    res.writeHead(400,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({error:e.message}));
  }
});
server.listen(process.env.PORT||3000,()=>console.log(`Smart Image Generator running on http://localhost:${process.env.PORT||3000}`));
