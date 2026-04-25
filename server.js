require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// ── In-memory store (swap for DB in production) ──────────────
let store = {
  profile: null, jobs: [], applications: [],
  settings: {
    name:'', email:'', linkedin:'', github:'',
    targetRoles:'Software Engineer', locations:'Remote',
    minSalary:'', workType:'Remote'
  }
};

// ── Claude AI helper ─────────────────────────────────────────
async function claude(system, user, maxTokens = 2000) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY not set. Add it to your .env file.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system, messages: [{ role:'user', content: user }] })
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Claude API ' + res.status); }
  const d = await res.json();
  return d.content[0].text;
}

function parseJSON(text) {
  return JSON.parse(text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim());
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════
// RESUME
// ═══════════════════════════════════════════════════
app.post('/api/resume/extract', upload.single('resume'), async (req, res) => {
  try {
    let text = '';
    if (req.file) {
      const ext = req.file.originalname.split('.').pop().toLowerCase();
      try {
        if (ext === 'pdf') {
          const pp = require('pdf-parse');
          text = (await pp(fs.readFileSync(req.file.path))).text;
        } else {
          text = fs.readFileSync(req.file.path, 'utf8');
        }
      } catch { text = fs.readFileSync(req.file.path, 'utf8').replace(/[^\x20-\x7E\n]/g,' '); }
      fs.unlinkSync(req.file.path);
    }
    res.json({ success: true, text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/resume/analyze', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text' });
  try {
    const raw = await claude(
      'You are a professional resume parser. Return ONLY valid JSON, no markdown, no explanation.',
      `Parse this resume and return a JSON object with these exact fields:
{
  "name": "full name",
  "email": "email or empty string",
  "phone": "phone or empty string",
  "location": "city/country or empty string",
  "linkedin": "linkedin url or empty string",
  "github": "github url or empty string",
  "currentRole": "most recent job title",
  "yearsExperience": "number like 5 or 5+",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1","skill2",...up to 20],
  "topSkills": ["top 5 most marketable skills"],
  "education": "degree and institution",
  "experience": [{"title":"","company":"","duration":"","highlights":["bullet"]}],
  "jobTitlesToApply": ["3-5 relevant job titles"]
}

Resume text:
${text.substring(0, 5500)}`, 1600);
    const profile = parseJSON(raw);
    store.profile = { ...profile, rawText: text, analyzedAt: new Date().toISOString() };
    res.json({ success: true, profile: store.profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/profile', (req, res) => res.json({ profile: store.profile }));
app.post('/api/profile', (req, res) => { store.profile = req.body; res.json({ success: true }); });

// ═══════════════════════════════════════════════════
// JOBS
// ═══════════════════════════════════════════════════
app.post('/api/jobs/find', async (req, res) => {
  if (!store.profile) return res.status(400).json({ error: 'No profile. Upload resume first.' });
  const { location } = req.body;
  try {
    const p = store.profile;
    const raw = await claude(
      'You are a job search AI. Generate realistic job listings. Return ONLY a valid JSON array.',
      `Generate 8 realistic job listings for this candidate:
Name: ${p.name}
Current Role: ${p.currentRole}
Experience: ${p.yearsExperience} years
Top Skills: ${(p.topSkills||[]).join(', ')}
All Skills: ${(p.skills||[]).slice(0,12).join(', ')}
Target Roles: ${(p.jobTitlesToApply||['Software Engineer']).join(', ')}
Location preference: ${location || store.settings.locations || 'Remote'}

Return JSON array of 8 jobs:
[{
  "id": "unique_string_id",
  "title": "job title",
  "company": "real company name",
  "location": "city or Remote",
  "salary": "$X–$Y",
  "type": "Full-time",
  "remote": true,
  "matchScore": 72-98,
  "postedAgo": "2 hours ago",
  "description": "2-3 sentence description mentioning key responsibilities",
  "requirements": ["req1","req2","req3","req4","req5"],
  "matchReasons": ["specific reason this matches candidate","reason2"],
  "logo": "single relevant emoji",
  "applyUrl": "https://careers.company.com/role"
}]

Mix FAANG, unicorn startups, mid-size companies. Vary scores 72-98. Be specific and relevant to candidate skills.`, 2000);
    store.jobs = parseJSON(raw).map(j => ({ ...j, status:'new', savedAt: new Date().toISOString() }));
    res.json({ success: true, jobs: store.jobs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/jobs', (req, res) => res.json({ jobs: store.jobs }));
app.post('/api/jobs', (req, res) => { store.jobs = req.body.jobs || []; res.json({ success: true }); });

// ═══════════════════════════════════════════════════
// AI TAILOR
// ═══════════════════════════════════════════════════
app.post('/api/tailor', async (req, res) => {
  if (!store.profile) return res.status(400).json({ error: 'No profile. Upload resume first.' });
  const { jobDescription, company, role, jobId } = req.body;
  if (!jobDescription) return res.status(400).json({ error: 'Job description required' });
  try {
    const p = store.profile;
    const text = await claude(
      'You are an expert resume writer specialising in ATS optimisation and human appeal. Tailor resumes to specific jobs while keeping real experience authentic.',
      `Tailor this resume for the target job.

CANDIDATE PROFILE:
Name: ${p.name}
Email: ${p.email || ''}
Phone: ${p.phone || ''}
LinkedIn: ${p.linkedin || ''}
GitHub: ${p.github || ''}
Current Role: ${p.currentRole}
Years Experience: ${p.yearsExperience}
Education: ${p.education}
All Skills: ${(p.skills||[]).join(', ')}
Experience: ${JSON.stringify(p.experience||[],null,1).substring(0,2500)}

TARGET JOB:
Company: ${company}
Role: ${role}
Description: ${jobDescription.substring(0,2200)}

Write a complete tailored resume in plain text:
1. Header with all contact info
2. Professional Summary (3-4 sentences, specifically mention ${company} and ${role})  
3. Core Skills (reordered to match job requirements exactly)
4. Professional Experience (rewrite bullet points to emphasise most relevant work, add metrics)
5. Education

After the resume on a NEW LINE write exactly:
KEYWORDS_JSON: {"matchedKeywords":["kw1","kw2","kw3","kw4","kw5","kw6"],"missingKeywords":["mk1","mk2","mk3"],"matchScore":88}`, 2200);

    let resume = text;
    let keywords = { matchedKeywords:[], missingKeywords:[], matchScore:80 };
    const km = text.match(/KEYWORDS_JSON:\s*(\{.*?\})\s*$/ms);
    if (km) { try { keywords = JSON.parse(km[1]); resume = text.replace(/KEYWORDS_JSON:.*$/ms,'').trim(); } catch{} }

    if (jobId) { const j = store.jobs.find(x=>x.id===jobId); if(j) j.tailoredResume = resume; }
    res.json({ success: true, tailoredResume: resume, keywords });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// COVER LETTER
// ═══════════════════════════════════════════════════
app.post('/api/cover-letter', async (req, res) => {
  if (!store.profile) return res.status(400).json({ error: 'No profile' });
  const { jobDescription, company, role, tone } = req.body;
  try {
    const p = store.profile;
    const cl = await claude(
      'Write compelling, specific cover letters. No generic fluff. Every sentence must earn its place.',
      `Write a cover letter for:
Candidate: ${p.name}, ${p.currentRole}, ${p.yearsExperience}+ years
Top Skills: ${(p.topSkills||[]).join(', ')}
Notable Achievements: ${(p.experience||[]).slice(0,1).map(e=>(e.highlights||[]).slice(0,2).join('; ')).join('')}

Target: ${role} at ${company}
Job Description: ${(jobDescription||'').substring(0,1500)}
Tone: ${tone || 'Professional and enthusiastic'}

Write exactly 3 paragraphs:
1. Opening — why ${company} specifically, mention the role
2. Body — 2-3 specific measurable achievements from their experience
3. Closing — clear call to action, express excitement

Address "Hiring Manager". Sign as ${p.name}. Under 330 words. No clichés.`, 800);
    res.json({ success: true, coverLetter: cl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// APPLICATIONS
// ═══════════════════════════════════════════════════
app.post('/api/applications/add', (req, res) => {
  const { jobId, job, tailoredResume, coverLetter, matchScore } = req.body;
  const existing = store.applications.find(a => a.jobId === jobId);
  if (existing) return res.json({ success:true, application:existing, existing:true });
  const application = {
    id: Date.now().toString(), jobId, job,
    tailoredResume: tailoredResume||'', coverLetter: coverLetter||'',
    status:'queued', matchScore: matchScore||80,
    addedAt: new Date().toISOString(), appliedAt:null, progress:0
  };
  store.applications.push(application);
  res.json({ success:true, application });
});

app.get('/api/applications', (req, res) => res.json({ applications: store.applications }));

app.delete('/api/applications/:id', (req, res) => {
  store.applications = store.applications.filter(a => a.id !== req.params.id);
  res.json({ success:true });
});

app.post('/api/applications/run', async (req, res) => {
  const toRun = store.applications.filter(a => a.status === 'queued');
  toRun.forEach(a => { a.status='processing'; a.progress=0; });
  res.json({ success:true, count: toRun.length });
  for (const a of toRun) {
    (async () => {
      for (const p of [15,35,60,82,100]) {
        await sleep(450 + Math.random()*600);
        a.progress = p;
      }
      a.status = 'applied';
      a.appliedAt = new Date().toISOString();
      const j = store.jobs.find(x=>x.id===a.jobId);
      if (j) j.status = 'applied';
    })();
  }
});

// ═══════════════════════════════════════════════════
// SETTINGS / STATS / RESET
// ═══════════════════════════════════════════════════
app.get('/api/settings', (req, res) => res.json({ settings: store.settings }));
app.put('/api/settings', (req, res) => { store.settings={...store.settings,...req.body}; res.json({success:true}); });

app.get('/api/stats', (req, res) => {
  res.json({ stats: {
    applied:     store.applications.filter(a=>a.status==='applied').length,
    queued:      store.applications.filter(a=>a.status==='queued').length,
    processing:  store.applications.filter(a=>a.status==='processing').length,
    totalJobs:   store.jobs.length,
    avgMatch:    store.jobs.length ? Math.round(store.jobs.reduce((s,j)=>s+(j.matchScore||0),0)/store.jobs.length) : 0,
    hasProfile:  !!store.profile,
    profileName: store.profile?.name || null
  }});
});

app.post('/api/reset', (req, res) => {
  store.profile=null; store.jobs=[]; store.applications=[];
  res.json({ success:true });
});

// ═══════════════════════════════════════════════════
// STATUS endpoint (health check + key info)
// ═══════════════════════════════════════════════════
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    aiReady: !!API_KEY,
    message: API_KEY ? 'Claude AI ready' : 'Set ANTHROPIC_API_KEY in .env to enable AI features'
  });
});

// Catch-all SPA
app.get('{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  ⚡ ApplyAI is LIVE                  ║`);
  console.log(`║  → http://localhost:${PORT}             ║`);
  console.log(`║  AI: ${API_KEY ? '✅ Claude connected' : '⚠️  Add ANTHROPIC_API_KEY'}     ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
