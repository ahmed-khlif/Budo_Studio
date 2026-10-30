'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { v2: cloudinary } = require('cloudinary');
const { GoogleGenAI } = require('@google/genai');
const { z } = require('zod');

const app = express();
const port = Number(process.env.PORT || 8787);
const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
const workspaceDefault = 'default';
// Vercel must never silently fall back to the shared "default" workspace.
// Local development can remain public unless REQUIRE_AUTH=true is configured.
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const requireAuth = String(process.env.REQUIRE_AUTH ?? (isVercel ? 'true' : 'false')).toLowerCase() === 'true';
const adminEmails = new Set(String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean));
const corsOrigins = String(process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8787')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: corsOrigins.length ? corsOrigins : true }));
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const allowed = /^(image\/(png|jpeg|webp)|application\/pdf)$/i.test(file.mimetype);
    callback(allowed ? null : new Error('Only PNG, JPG, WEBP, or PDF files are supported.'), allowed);
  },
});

const candidateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  birth: z.string().trim().max(80).optional().default(''),
  obtained: z.string().trim().max(80).optional().default(''),
  serial: z.string().trim().max(80).optional().default(''),
  belt: z.string().trim().max(100).optional().default(''),
  kyu: z.union([z.number().int().positive(), z.string().trim().max(40)]).nullable().optional(),
  examDate: z.string().trim().max(80).optional().default(''),
  ordinal: z.union([z.number().int(), z.string().trim().max(40)]).nullable().optional(),
  origin: z.string().trim().max(240).optional().default('Manual'),
  status: z.enum(['ready', 'incomplete', 'archived']).optional().default('incomplete'),
  sourceImageUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const presetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  belt: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().max(500).optional().default(''),
  config: z.record(z.string(), z.unknown()),
  previewUrl: z.string().url().nullable().optional(),
});

const memory = {
  candidates: new Map(),
  presets: new Map(),
  assets: new Map(),
};

const supabaseServerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = Boolean(process.env.SUPABASE_URL && supabaseServerKey);
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, supabaseServerKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
);
if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const hasGemini = Boolean(process.env.GEMINI_API_KEY);
const ai = hasGemini ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

function id() {
  return crypto.randomUUID();
}

function authError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function authenticatedUser(request) {
  if (request.authUser !== undefined) return request.authUser;
  const authorization = request.header('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    if (requireAuth) throw authError('Authentication is required for this workspace.', 401);
    request.authUser = null;
    return null;
  }
  if (!supabase) throw authError('Supabase authentication is not configured on the API.', 503);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw authError('The Supabase session is invalid or expired.', 401);
  request.authUser = data.user;
  return data.user;
}

function isAdminUser(user) {
  if (!user) return false;
  return user.app_metadata?.role === 'admin' || adminEmails.has(String(user.email || '').toLowerCase());
}

async function requireAdmin(request) {
  const user = await authenticatedUser(request);
  if (!user) throw authError('Authentication is required for admin access.', 401);
  if (!isAdminUser(user)) throw authError('Administrator access is required.', 403);
  if (!supabase) throw authError('Supabase authentication is not configured on the API.', 503);
  return user;
}

async function workspaceOf(request) {
  const requested = String(request.header('x-workspace-id') || '').trim().slice(0, 100);
  const user = await authenticatedUser(request);
  if (!user) return requested || workspaceDefault;
  const userWorkspace = String(user.app_metadata?.workspace_id || user.id).trim();
  if (requested && requested !== 'default' && requested !== userWorkspace) throw authError('You do not have access to this workspace.', 403);
  return requested && requested !== 'default' ? requested : userWorkspace;
}

function now() {
  return new Date().toISOString();
}

function cleanNullable(value) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text || null;
}

function candidateForStorage(candidate) {
  return {
    name: candidate.name,
    birth: candidate.birth,
    obtained: candidate.obtained,
    serial: candidate.serial,
    belt: candidate.belt,
    kyu: cleanNullable(candidate.kyu),
    exam_date: cleanNullable(candidate.examDate),
    ordinal: cleanNullable(candidate.ordinal),
    origin: candidate.origin || 'Manual',
    status: candidate.status || 'incomplete',
    source_image_url: candidate.sourceImageUrl || null,
    metadata: candidate.metadata || {},
  };
}

function candidateFromStorage(row) {
  return {
    id: row.id,
    name: row.name || '',
    birth: row.birth || '',
    obtained: row.obtained || '',
    serial: row.serial || '',
    belt: row.belt || '',
    kyu: row.kyu ?? null,
    examDate: row.exam_date || '',
    ordinal: row.ordinal ?? null,
    origin: row.origin || 'Manual',
    status: row.status || 'incomplete',
    sourceImageUrl: row.source_image_url || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function presetFromStorage(row) {
  return {
    id: row.id,
    name: row.name,
    belt: row.belt || '',
    description: row.description || '',
    config: row.config || {},
    previewUrl: row.preview_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listCandidates(request) {
  const workspaceId = await workspaceOf(request);
  const search = String(request.query.search || '').trim().toLowerCase();
  const belt = String(request.query.belt || '').trim();
  const status = String(request.query.status || '').trim();
  const page = Math.max(1, Number(request.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize || 25)));

  if (!supabase) {
    let rows = [...memory.candidates.values()].filter((row) => row.workspace_id === workspaceId);
    if (search) rows = rows.filter((row) => `${row.name} ${row.serial || ''}`.toLowerCase().includes(search));
    if (belt) rows = rows.filter((row) => row.belt === belt);
    if (status) rows = rows.filter((row) => row.status === status);
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const from = (page - 1) * pageSize;
    return { data: rows.slice(from, from + pageSize).map(candidateFromStorage), total: rows.length, page, pageSize };
  }

  let query = supabase.from('candidates').select('*', { count: 'exact' }).eq('workspace_id', workspaceId);
  if (search) query = query.or(`name.ilike.%${search}%,serial.ilike.%${search}%`);
  if (belt) query = query.eq('belt', belt);
  if (status) query = query.eq('status', status);
  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  return { data: (data || []).map(candidateFromStorage), total: count || 0, page, pageSize };
}

async function getCandidate(request, candidateId) {
  const workspaceId = await workspaceOf(request);
  if (!supabase) {
    const row = memory.candidates.get(candidateId);
    return row && row.workspace_id === workspaceId ? candidateFromStorage(row) : null;
  }
  const { data, error } = await supabase.from('candidates').select('*').eq('id', candidateId).eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw error;
  return data ? candidateFromStorage(data) : null;
}

async function saveCandidate(request, candidateId, body, replace = false) {
  const parsed = candidateSchema.parse(body);
  const workspaceId = await workspaceOf(request);
  const timestamp = now();
  const record = {
    ...candidateForStorage(parsed),
    id: candidateId || id(),
    workspace_id: workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
  };

  if (!supabase) {
    const existing = memory.candidates.get(record.id);
    if (existing && existing.workspace_id !== workspaceId) return null;
    memory.candidates.set(record.id, { ...existing, ...record, created_at: existing?.created_at || timestamp });
    return candidateFromStorage(memory.candidates.get(record.id));
  }

  if (!replace && candidateId) throw new Error('A candidate id cannot be supplied for creation.');
  const { data, error } = await supabase.from('candidates').upsert(record, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return candidateFromStorage(data);
}

async function deleteCandidate(request, candidateId) {
  const workspaceId = await workspaceOf(request);
  if (!supabase) {
    const row = memory.candidates.get(candidateId);
    if (!row || row.workspace_id !== workspaceId) return false;
    memory.candidates.delete(candidateId);
    return true;
  }
  const { error, count } = await supabase.from('candidates').delete({ count: 'exact' }).eq('id', candidateId).eq('workspace_id', workspaceId);
  if (error) throw error;
  return Boolean(count);
}

async function listPresets(request) {
  const workspaceId = await workspaceOf(request);
  if (!supabase) {
    return [...memory.presets.values()]
      .filter((row) => row.workspace_id === workspaceId)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .map(presetFromStorage);
  }
  const { data, error } = await supabase.from('template_presets').select('*').eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(presetFromStorage);
}

async function savePreset(request, presetId, body) {
  const parsed = presetSchema.parse(body);
  const workspaceId = await workspaceOf(request);
  const timestamp = now();
  const record = {
    id: presetId || id(),
    workspace_id: workspaceId,
    name: parsed.name,
    belt: parsed.belt || null,
    description: parsed.description || null,
    config: parsed.config,
    preview_url: parsed.previewUrl || null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  if (!supabase) {
    const existing = memory.presets.get(record.id);
    if (existing && existing.workspace_id !== workspaceId) throw authError('Preset not found.', 404);
    memory.presets.set(record.id, { ...existing, ...record, created_at: existing?.created_at || timestamp });
    return presetFromStorage(memory.presets.get(record.id));
  }
  if (presetId) {
    const { data: existing, error: lookupError } = await supabase.from('template_presets').select('id, created_at').eq('id', presetId).eq('workspace_id', workspaceId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) throw authError('Preset not found.', 404);
    record.created_at = existing.created_at;
  }
  const { data, error } = await supabase.from('template_presets').upsert(record, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return presetFromStorage(data);
}

async function deletePreset(request, presetId) {
  const workspaceId = await workspaceOf(request);
  if (!supabase) {
    const row = memory.presets.get(presetId);
    if (!row || row.workspace_id !== workspaceId) return false;
    memory.presets.delete(presetId);
    return true;
  }
  const { error, count } = await supabase.from('template_presets').delete({ count: 'exact' }).eq('id', presetId).eq('workspace_id', workspaceId);
  if (error) throw error;
  return Boolean(count);
}

function assetFromStorage(row) {
  return {
    id: row.id,
    belt: row.belt || '',
    name: row.name || '',
    url: row.cloudinary_url || row.url || '',
    previewUrl: row.preview_url || row.previewUrl || row.cloudinary_url || row.url || '',
    public_id: row.cloudinary_public_id || row.public_id || '',
    resourceType: row.resource_type || row.resourceType || 'image',
    mimeType: row.mime_type || row.mimeType || null,
    width: row.width || null,
    height: row.height || null,
    createdAt: row.created_at,
  };
}

async function listAssets(request) {
  const workspaceId = await workspaceOf(request);
  if (!supabase) {
    return [...memory.assets.values()]
      .filter((row) => row.workspace_id === workspaceId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(assetFromStorage);
  }
  const { data, error } = await supabase.from('template_assets').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(assetFromStorage);
}

async function deleteAsset(request, assetId) {
  const workspaceId = await workspaceOf(request);
  let asset;
  if (!supabase) {
    asset = memory.assets.get(assetId);
    if (!asset || asset.workspace_id !== workspaceId) return false;
    memory.assets.delete(assetId);
  } else {
    const { data, error } = await supabase.from('template_assets').select('*').eq('id', assetId).eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    if (!data) return false;
    asset = data;
    const deleted = await supabase.from('template_assets').delete().eq('id', assetId).eq('workspace_id', workspaceId);
    if (deleted.error) throw deleted.error;
  }
  const publicId = asset.public_id || asset.cloudinary_public_id;
  if (hasCloudinary && publicId) {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: asset.resourceType || asset.resource_type || 'image',
      invalidate: true,
    }).catch(() => {});
  }
  return true;
}

function uploadToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', use_filename: true, unique_filename: true, overwrite: false },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(file.buffer);
  });
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

async function generateText(contents, config = {}) {
  if (!ai) throw Object.assign(new Error('Gemini is not configured. Add GEMINI_API_KEY to .env.'), { statusCode: 503 });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents,
    config,
  });
  return response.text || '';
}

app.get('/api/health', async (_request, response) => {
  let schemaReady = !supabase;
  let schemaError = null;
  if (supabase) {
    const checks = await Promise.all([
      supabase.from('candidates').select('id').limit(1),
      supabase.from('template_presets').select('id').limit(1),
      supabase.from('template_assets').select('id,preview_url,resource_type,mime_type').limit(1),
    ]);
    const error = checks.map((result) => result.error).find(Boolean);
    schemaReady = !error;
    schemaError = error?.code === 'PGRST205' ? 'Run supabase/schema.sql in the connected project.' : (error?.message || null);
  }
  response.json({
    ok: true,
    service: 'budo-studio-api',
    storage: supabase ? 'supabase' : 'memory',
    schemaReady,
    schemaError,
    authRequired: requireAuth,
    cloudinary: hasCloudinary,
    gemini: hasGemini,
    clientSideExports: true,
  });
});

app.get('/api/admin/access', async (request, response, next) => {
  try {
    const user = await authenticatedUser(request);
    response.json({
      authenticated: Boolean(user),
      isAdmin: isAdminUser(user),
      user: user ? { id: user.id, email: user.email || null } : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/users', async (request, response, next) => {
  try {
    await requireAdmin(request);
    const page = Math.max(1, Number(request.query.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(request.query.perPage || 50)));
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    response.json((data.users || []).map((user) => ({
      id: user.id,
      email: user.email || null,
      role: user.app_metadata?.role === 'admin' ? 'admin' : 'member',
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
    })));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/users/:id/role', async (request, response, next) => {
  try {
    await requireAdmin(request);
    const role = request.body?.role;
    if (role !== 'admin' && role !== 'member') return response.status(400).json({ error: 'Role must be admin or member.' });
    const { data: existing, error: getError } = await supabase.auth.admin.getUserById(request.params.id);
    if (getError || !existing.user) return response.status(404).json({ error: 'User not found.' });
    const appMetadata = { ...(existing.user.app_metadata || {}), role };
    const { data, error } = await supabase.auth.admin.updateUserById(request.params.id, { app_metadata: appMetadata });
    if (error) throw error;
    response.json({ id: data.user.id, email: data.user.email || null, role });
  } catch (error) {
    next(error);
  }
});

app.get('/api/candidates', async (request, response, next) => {
  try {
    response.json(await listCandidates(request));
  } catch (error) {
    next(error);
  }
});

app.get('/api/candidates/:id', async (request, response, next) => {
  try {
    const candidate = await getCandidate(request, request.params.id);
    if (!candidate) return response.status(404).json({ error: 'Candidate not found.' });
    response.json(candidate);
  } catch (error) {
    next(error);
  }
});

app.post('/api/candidates', async (request, response, next) => {
  try {
    response.status(201).json(await saveCandidate(request, null, request.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/candidates/:id', async (request, response, next) => {
  try {
    const existing = await getCandidate(request, request.params.id);
    if (!existing) return response.status(404).json({ error: 'Candidate not found.' });
    response.json(await saveCandidate(request, request.params.id, { ...existing, ...request.body }, true));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/candidates/:id', async (request, response, next) => {
  try {
    // Deletion is intentionally idempotent: a stale browser copy may already
    // be gone from Supabase, and that should still count as a successful delete.
    await deleteCandidate(request, request.params.id);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/templates/presets', async (request, response, next) => {
  try {
    response.json(await listPresets(request));
  } catch (error) {
    next(error);
  }
});

app.post('/api/templates/presets', async (request, response, next) => {
  try {
    response.status(201).json(await savePreset(request, null, request.body));
  } catch (error) {
    next(error);
  }
});

app.put('/api/templates/presets/:id', async (request, response, next) => {
  try {
    response.json(await savePreset(request, request.params.id, request.body));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/templates/presets/:id', async (request, response, next) => {
  try {
    if (!(await deletePreset(request, request.params.id))) return response.status(404).json({ error: 'Preset not found.' });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/templates/assets', async (request, response, next) => {
  try {
    response.json(await listAssets(request));
  } catch (error) {
    next(error);
  }
});

app.post('/api/templates/assets', upload.single('file'), async (request, response, next) => {
  try {
    if (!request.file) return response.status(400).json({ error: 'Attach an image or PDF as the file field.' });
    if (!hasCloudinary) return response.status(503).json({ error: 'Cloudinary is not configured. Add the three CLOUDINARY_* values to .env.' });
    const belt = String(request.body.belt || '').trim();
    const result = await uploadToCloudinary(request.file, `budo-studio/templates/${belt || 'unassigned'}`);
    const isPdf = request.file.mimetype === 'application/pdf';
    const ratio = Number(result.width || 0) / Number(result.height || 1);
    const expectedRatio = 645.75 / 936.75;
    if (!isPdf && (!Number.isFinite(ratio) || Math.abs(ratio - expectedRatio) > 0.09)) {
      await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' }).catch(() => {});
      return response.status(422).json({ error: 'Template proportions are not portrait-compatible with the certificate canvas.' });
    }
    const previewUrl = isPdf
      ? cloudinary.url(result.public_id, { secure: true, resource_type: result.resource_type || 'image', format: 'png', transformation: [{ page: 1 }, { width: 1292, height: 1874, crop: 'fit' }] })
      : result.secure_url;
    const asset = {
      id: id(),
      workspace_id: await workspaceOf(request),
      belt,
      name: String(request.body.name || request.file.originalname).trim(),
      url: result.secure_url,
      previewUrl,
      public_id: result.public_id,
      resourceType: result.resource_type || 'image',
      mimeType: request.file.mimetype,
      width: result.width,
      height: result.height,
      created_at: now(),
    };
    if (supabase) {
      const { data, error } = await supabase.from('template_assets').insert({
        id: asset.id,
        workspace_id: asset.workspace_id,
        belt: asset.belt || null,
        name: asset.name,
        cloudinary_url: asset.url,
        cloudinary_public_id: asset.public_id,
        preview_url: asset.previewUrl,
        resource_type: asset.resourceType,
        mime_type: asset.mimeType,
        width: asset.width,
        height: asset.height,
        created_at: asset.created_at,
      }).select('*').single();
      if (error) throw error;
      response.status(201).json({ ...asset, ...data, url: data.cloudinary_url, previewUrl: data.preview_url || asset.previewUrl, public_id: data.cloudinary_public_id });
      return;
    }
    memory.assets.set(asset.id, asset);
    response.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/templates/assets/:id', async (request, response, next) => {
  try {
    if (!(await deleteAsset(request, request.params.id))) return response.status(404).json({ error: 'Template asset not found.' });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/brainstorm', async (request, response, next) => {
  try {
    const prompt = String(request.body.prompt || '').trim();
    if (!prompt) return response.status(400).json({ error: 'A brainstorming prompt is required.' });
    const context = request.body.context && typeof request.body.context === 'object' ? request.body.context : {};
    const text = await generateText([
      {
        role: 'user',
        parts: [{ text: `You are a certificate design assistant. Suggest practical layouts and wording for this editor. Return concise, actionable suggestions.\nContext: ${JSON.stringify(context)}\nRequest: ${prompt}` }],
      },
    ]);
    response.json({ suggestions: text });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/extract-candidate', upload.single('file'), async (request, response, next) => {
  try {
    if (!request.file) return response.status(400).json({ error: 'Attach the candidate image as the file field.' });
    const workspaceId = await workspaceOf(request);
    const sourceImageUrl = hasCloudinary
      ? (await uploadToCloudinary(request.file, `budo-studio/candidate-source/${workspaceId}`)).secure_url
      : null;
    const text = await generateText([
      { inlineData: { mimeType: request.file.mimetype, data: request.file.buffer.toString('base64') } },
      { text: 'Extract the candidate information visible in this image. Return only JSON with these keys: name, birth, obtained, serial, belt, kyu, examDate, ordinal, origin. Use empty strings or null when unreadable. Never invent missing values.' },
    ], { responseMimeType: 'application/json' });
    const extracted = extractJson(text);
    if (!extracted) return response.status(422).json({ error: 'Gemini returned unreadable data.', raw: text });
    response.json({ needsReview: true, candidate: { ...extracted, sourceImageUrl }, sourceImageUrl });
  } catch (error) {
    next(error);
  }
});

// Keep one user-facing product: the original full BUDO Studio app at `/`.
// React renders the original BUDO Studio interface at the main route.
app.use('/workspace', (_request, response) => response.redirect(302, '/'));
app.get('/', (_request, response) => response.sendFile(path.join(frontendDist, 'index.html'), (error) => {
  if (error) response.sendFile(path.resolve(__dirname, '..', 'index.html'));
}));
app.get('/legacy', (_request, response) => response.sendFile(path.resolve(__dirname, '..', 'index.html')));
app.use(express.static(frontendDist));
app.use(express.static(path.resolve(__dirname, '..')));

app.use((error, _request, response, _next) => {
  const status = Number(error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 413 : error.name === 'MulterError' ? 400 : error.name === 'ZodError' ? 400 : 500));
  const message = error.name === 'ZodError' ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') : error.message;
  console.error(error);
  response.status(status).json({ error: message || 'Unexpected server error.' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`BUDO Studio API listening on http://localhost:${port}`);
    console.log(`Storage: ${supabase ? 'Supabase' : 'local memory fallback'} | Cloudinary: ${hasCloudinary ? 'enabled' : 'disabled'} | Gemini: ${hasGemini ? 'enabled' : 'disabled'}`);
  });
}

module.exports = app;

