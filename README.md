# ⚡ ApplyAI — AI-Powered Job Application Automation

Fully automated job application platform powered by Claude AI.  
Upload your resume once → AI finds jobs, tailors your resume, and applies — all automatically.

---

## 🚀 Quick Start (Local)

### 1. Install dependencies
```bash
npm install
```

### 2. Add your API key
```bash
cp .env.example .env
# Edit .env and paste your Anthropic API key
```
Get your key at: **https://console.anthropic.com**

### 3. Run
```bash
npm start
# → http://localhost:3000
```

---

## 🌐 Deploy to Railway (Recommended — Free)

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variable: `ANTHROPIC_API_KEY=sk-ant-...`
4. Done — live in 60 seconds ✅

## 🌐 Deploy to Render (Free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env var: `ANTHROPIC_API_KEY`

## 🌐 Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
# Set ANTHROPIC_API_KEY in Vercel dashboard
```

---

## ✨ Features

| Feature | Description |
|---|---|
| **Resume Parser** | Upload PDF/DOCX/TXT — Claude extracts skills, experience, profile |
| **Job Matching** | AI generates matched jobs scored against your profile |
| **Resume Tailor** | Claude rewrites your resume for each specific job |
| **Cover Letter** | Auto-generated cover letters per role |
| **Apply Queue** | Batch apply with progress tracking |
| **Keyword Analysis** | See matched/missing keywords for each application |
| **Pipeline View** | Visual 5-step automation pipeline |

---

## 🏗 Architecture

```
applyai/
├── server.js          # Express backend + Claude API calls
├── public/
│   └── index.html     # Full single-page app frontend
├── uploads/           # Temp file storage (auto-created)
├── .env               # Your API key (gitignored)
├── .env.example       # Template
└── package.json
```

**Data flow:**
1. User uploads resume → server extracts text → Claude parses profile
2. User clicks "Find Jobs" → Claude generates matched listings
3. User clicks "Tailor" → Claude rewrites resume for that job
4. User adds to queue → clicks Run → pipeline applies with progress tracking

---

## 🔐 Security

- API key stays server-side — never exposed to browser
- No database — in-memory state (restart clears data)
- For production: add a database (PostgreSQL, MongoDB) and auth

---

## 📦 Stack

- **Backend**: Node.js + Express
- **AI**: Claude claude-sonnet-4 via Anthropic API
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **File parsing**: pdf-parse

---

## 🛣 Roadmap

- [ ] User authentication
- [ ] PostgreSQL persistence
- [ ] Real job board API integrations (LinkedIn, Indeed)
- [ ] Browser automation for actual form submission (Playwright)
- [ ] Email notifications on responses
- [ ] Interview scheduling integration
