'use strict';

const express = require('express');
const puppeteer = require('puppeteer');
const { execSync, spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Temp dir ──────────────────────────────────────────────────────────────
const TMP = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

// ─── Cleanup helper ────────────────────────────────────────────────────────
function cleanup(...files) {
  files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
}

// ══════════════════════════════════════════════════════════════════════════
// ENDPOINT 1: /generate-image
// Body: { urduPoetry, meaning, poet, caption }
// Returns: PNG binary (image/png)
// ══════════════════════════════════════════════════════════════════════════
app.post('/generate-image', async (req, res) => {
  const { urduPoetry = '', meaning = '', poet = 'شاعر', caption = '' } = req.body;

  if (!urduPoetry) return res.status(400).json({ error: 'urduPoetry is required' });

  const lines = urduPoetry.split('\n').filter(Boolean);
  const poetryHTML = lines
    .map(l => `<p class="verse">${l}</p>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ur" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=1080, height=1920"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&family=Space+Mono:wght@400;700&display=swap');

  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

  :root {
    --black: #000000;
    --white: #FFFFFF;
    --lime: #C8FF00;
    --grey: #111111;
    --mid: #1A1A1A;
  }

  html, body {
    width: 1080px;
    height: 1920px;
    background: var(--black);
    overflow: hidden;
  }

  .root {
    width: 1080px;
    height: 1920px;
    background: var(--black);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 80px 72px;
    gap: 0;
  }

  /* ── Noise grain overlay ── */
  .root::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    opacity: 0.15;
    pointer-events: none;
    z-index: 1;
  }

  /* ── Lime corner accent ── */
  .corner-tl {
    position: absolute;
    top: 0; left: 0;
    width: 220px; height: 220px;
    border-top: 6px solid var(--lime);
    border-left: 6px solid var(--lime);
    z-index: 2;
  }
  .corner-br {
    position: absolute;
    bottom: 0; right: 0;
    width: 220px; height: 220px;
    border-bottom: 6px solid var(--lime);
    border-right: 6px solid var(--lime);
    z-index: 2;
  }

  /* ── Top badge ── */
  .badge {
    position: absolute;
    top: 72px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Space Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    color: var(--lime);
    letter-spacing: 0.25em;
    text-transform: uppercase;
    white-space: nowrap;
    z-index: 3;
  }

  /* ── Divider line ── */
  .divider {
    width: 100%;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, var(--lime) 30%, var(--white) 50%, var(--lime) 70%, transparent 100%);
    margin: 0 0 56px 0;
    z-index: 3;
    flex-shrink: 0;
  }

  /* ── Poetry block ── */
  .poetry-block {
    width: 100%;
    text-align: center;
    direction: rtl;
    z-index: 3;
    margin-bottom: 56px;
  }

  .verse {
    font-family: 'Noto Nastaliq Urdu', serif;
    font-size: 72px;
    font-weight: 700;
    color: var(--white);
    line-height: 1.9;
    letter-spacing: 0.01em;
    text-shadow: 0 0 40px rgba(200,255,0,0.18);
  }

  /* ── Meaning card ── */
  .meaning-card {
    width: 100%;
    background: var(--mid);
    border: 1.5px solid rgba(200,255,0,0.35);
    border-radius: 16px;
    padding: 44px 52px;
    margin-bottom: 52px;
    z-index: 3;
    position: relative;
    overflow: hidden;
  }

  .meaning-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: var(--lime);
  }

  .meaning-label {
    font-family: 'Space Mono', monospace;
    font-size: 20px;
    font-weight: 700;
    color: var(--lime);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 20px;
    direction: ltr;
  }

  .meaning-text {
    font-family: 'Space Mono', monospace;
    font-size: 32px;
    color: rgba(255,255,255,0.85);
    line-height: 1.6;
    direction: ltr;
    font-weight: 400;
  }

  /* ── Poet name ── */
  .poet-name {
    font-family: 'Noto Nastaliq Urdu', serif;
    font-size: 42px;
    font-weight: 400;
    color: rgba(255,255,255,0.45);
    direction: rtl;
    text-align: center;
    z-index: 3;
    margin-bottom: 0;
  }

  .poet-name span {
    color: var(--lime);
  }

  /* ── Bottom handle ── */
  .handle {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Space Mono', monospace;
    font-size: 24px;
    color: rgba(255,255,255,0.25);
    letter-spacing: 0.12em;
    white-space: nowrap;
    z-index: 3;
  }

  /* ── Decorative dot grid (background) ── */
  .dot-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(200,255,0,0.06) 1px, transparent 1px);
    background-size: 54px 54px;
    z-index: 0;
  }
</style>
</head>
<body>
<div class="root">
  <div class="dot-grid"></div>
  <div class="corner-tl"></div>
  <div class="corner-br"></div>
  <div class="badge">اردو شاعری</div>

  <div class="divider"></div>

  <div class="poetry-block">
    ${poetryHTML}
  </div>

  <div class="meaning-card">
    <div class="meaning-label">// MEANING</div>
    <div class="meaning-text">${meaning}</div>
  </div>

  <div class="poet-name">— <span>${poet}</span></div>

  <div class="handle">@urduaesthetic</div>
</div>
</body>
</html>`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    // Extra wait for Noto Nastaliq font load
    await new Promise(r => setTimeout(r, 2000));

    const imgBuffer = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'inline; filename="poetry.png"');
    res.send(imgBuffer);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('/generate-image error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ENDPOINT 2: /generate-audio
// Body: { romanUrdu, voice? }
// Returns: MP3 binary (audio/mpeg)
// ══════════════════════════════════════════════════════════════════════════
app.post('/generate-audio', async (req, res) => {
  const {
    romanUrdu = '',
    voice = 'ur-PK-AsadNeural'  // Free Microsoft Edge Neural voice (Urdu Pakistan Male)
  } = req.body;

  if (!romanUrdu) return res.status(400).json({ error: 'romanUrdu is required' });

  const outFile = path.join(TMP, `audio_${uuidv4()}.mp3`);

  try {
    // edge-tts CLI wrapper
    await new Promise((resolve, reject) => {
      // edge-tts package exposes a CLI: npx edge-tts
      const proc = spawn('node', [
        path.join(__dirname, 'node_modules', 'edge-tts', 'src', 'cli.js'),
        '--voice', voice,
        '--text', romanUrdu,
        '--write-media', outFile,
      ]);

      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`edge-tts exited ${code}: ${stderr}`));
      });
      proc.on('error', reject);
    });

    const audioBuffer = fs.readFileSync(outFile);
    cleanup(outFile);

    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', 'inline; filename="voice.mp3"');
    res.send(audioBuffer);
  } catch (err) {
    cleanup(outFile);
    console.error('/generate-audio error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ENDPOINT 3: /generate-video
// Body: { imageBase64, audioBase64 }  (base64 encoded PNG + MP3)
// Returns: MP4 binary (video/mp4)  — 1080x1920, 10s, Ken Burns zoom
// ══════════════════════════════════════════════════════════════════════════
app.post('/generate-video', async (req, res) => {
  const { imageBase64, audioBase64 } = req.body;

  if (!imageBase64 || !audioBase64) {
    return res.status(400).json({ error: 'imageBase64 and audioBase64 are required' });
  }

  const id = uuidv4();
  const imgFile  = path.join(TMP, `img_${id}.png`);
  const audFile  = path.join(TMP, `aud_${id}.mp3`);
  const outFile  = path.join(TMP, `vid_${id}.mp4`);

  try {
    fs.writeFileSync(imgFile, Buffer.from(imageBase64, 'base64'));
    fs.writeFileSync(audFile, Buffer.from(audioBase64, 'base64'));

    await new Promise((resolve, reject) => {
      // Ken Burns: slow zoom-in from 1.0 to 1.08 over 10s at 30fps = 300 frames
      // zoompan filter: z='min(zoom+0.0003,1.08)', d=300, s=1080x1920
      ffmpeg()
        .input(imgFile)
        .inputOptions([
          '-loop 1',
          '-framerate 30',
        ])
        .input(audFile)
        .complexFilter([
          // Scale image to 2x to give zoom-pan room, then apply Ken Burns
          `[0:v]scale=2160:3840,zoompan=z='min(zoom+0.0003,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=300:s=1080x1920:fps=30[zoomed]`,
          // Fade in/out overlaid on zoomed video
          `[zoomed]fade=t=in:st=0:d=0.5,fade=t=out:st=9.5:d=0.5[v]`,
        ])
        .outputOptions([
          '-map [v]',
          '-map 1:a',
          '-c:v libx264',
          '-preset fast',
          '-crf 22',
          '-c:a aac',
          '-b:a 192k',
          '-pix_fmt yuv420p',
          '-t 10',            // Hard cap at 10 seconds
          '-movflags +faststart',
          '-shortest',
        ])
        .output(outFile)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const videoBuffer = fs.readFileSync(outFile);
    cleanup(imgFile, audFile, outFile);

    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'inline; filename="reel.mp4"');
    res.send(videoBuffer);
  } catch (err) {
    cleanup(imgFile, audFile, outFile);
    console.error('/generate-video error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Urdu Reels Server running on :${PORT}`));
