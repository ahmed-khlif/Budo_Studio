'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
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
  clientId: z.string().max(120).optional(),
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

const beltSchema = z.object({
  id: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(100),
  swatches: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(2).optional().default(['#6b7f95']),
  kyu: z.union([z.number().int().positive(), z.string().trim().max(40)]).nullable().optional(),
});

const preferencesSchema = z.record(z.string(), z.unknown());

const memory = {
  candidates: new Map(),
  presets: new Map(),
  assets: new Map(),
  preferences: new Map(),
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
const PDF_PREVIEW_WIDTH = 1938;
const PDF_PREVIEW_HEIGHT = 2811;
function cloudinaryPdfPreview(publicId, resourceType = 'image') {
  if (!hasCloudinary || !publicId) return '';
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType || 'image',
    format: 'png',
    transformation: [{ page: 1 }, { width: PDF_PREVIEW_WIDTH, height: PDF_PREVIEW_HEIGHT, crop: 'fit' }],
  });
}
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
  // Keep API pages large enough for the studio to fetch every candidate in a
  // few requests. The browser still paginates the visible table independently.
  const pageSize = Math.min(1000, Math.max(1, Number(request.query.pageSize || 100)));

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
  const publicId = row.cloudinary_public_id || row.public_id || '';
  const isPdf = (row.mime_type || row.mimeType) === 'application/pdf' || /\.pdf$/i.test(row.name || '');
  return {
    id: row.id,
    belt: row.belt || '',
    name: row.name || '',
    url: row.cloudinary_url || row.url || '',
    previewUrl: isPdf && publicId ? cloudinaryPdfPreview(publicId, row.resource_type || row.resourceType || 'image') : row.preview_url || row.previewUrl || row.cloudinary_url || row.url || '',
    public_id: publicId,
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

const builtinBelts = [
  { id: 'أبيض', name: 'أبيض', swatches: ['#f6f7f9'], kyu: null, builtin: true },
  { id: 'أبيض وأصفر', name: 'أبيض وأصفر', swatches: ['#ffffff', '#f5cc4e'], kyu: null, builtin: true },
  { id: 'أصفر', name: 'أصفر', swatches: ['#f5c94a'], kyu: 9, builtin: true },
  { id: 'أصفر وبرتقالي', name: 'أصفر وبرتقالي', swatches: ['#f5c94a', '#ee9b4e'], kyu: null, builtin: true },
  { id: 'برتقالي', name: 'برتقالي', swatches: ['#ed9850'], kyu: null, builtin: true },
  { id: 'برتقالي وأخضر', name: 'برتقالي وأخضر', swatches: ['#ed9850', '#50a46d'], kyu: null, builtin: true },
  { id: 'أخضر', name: 'أخضر', swatches: ['#4fa46c'], kyu: null, builtin: true },
  { id: 'أخضر وأزرق', name: 'أخضر وأزرق', swatches: ['#4fa46c', '#2f7ebd'], kyu: null, builtin: true },
  { id: 'أزرق', name: 'أزرق', swatches: ['#2c7abb'], kyu: null, builtin: true },
  { id: 'أزرق وبني', name: 'أزرق وبني', swatches: ['#2c7abb', '#9b6c42'], kyu: null, builtin: true },
  { id: 'بني', name: 'بني', swatches: ['#986b45'], kyu: null, builtin: true },
];

async function readPreferences(request) {
  const workspaceId = await workspaceOf(request);
  if (!supabase) return { workspaceId, config: memory.preferences.get(workspaceId) || {} };
  const { data, error } = await supabase.from('workspace_preferences').select('config').eq('workspace_id', workspaceId).maybeSingle();
  if (error && ['PGRST205', '42P01'].includes(error.code)) return { workspaceId, config: {}, available: false };
  if (error) throw error;
  return { workspaceId, config: data?.config && typeof data.config === 'object' ? data.config : {} };
}

async function writePreferences(request, config) {
  const parsed = preferencesSchema.parse(config);
  const { workspaceId, available = true } = await readPreferences(request);
  if (!available) throw authError('Run supabase/template_customization.sql to enable account preferences and custom belts.', 503);
  if (!supabase) {
    memory.preferences.set(workspaceId, parsed);
    return parsed;
  }
  const { data, error } = await supabase.from('workspace_preferences').upsert({ workspace_id: workspaceId, config: parsed }, { onConflict: 'workspace_id' }).select('config').single();
  if (error) throw error;
  return data?.config || parsed;
}

async function listBelts(request) {
  const { config } = await readPreferences(request);
  const custom = Array.isArray(config.customBelts) ? config.customBelts : [];
  return [...builtinBelts, ...custom.filter(belt => belt && belt.name && !builtinBelts.some(item => item.id === belt.id || item.name === belt.name)).map(belt => ({ ...belt, builtin: false }))];
}

async function saveBelt(request, body) {
  const belt = beltSchema.parse(body);
  const { config } = await readPreferences(request);
  const customBelts = Array.isArray(config.customBelts) ? config.customBelts.filter(item => item && item.name) : [];
  const normalized = { id: belt.id || belt.name, name: belt.name, swatches: belt.swatches, kyu: belt.kyu ?? null, builtin: false };
  const next = [...customBelts.filter(item => item.id !== normalized.id && item.name !== normalized.name), normalized];
  await writePreferences(request, { ...config, customBelts: next });
  return normalized;
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

async function createTemplateAsset(request) {
  if (!request.file) throw authError('Attach an image or PDF as the file field.', 400);
  if (!hasCloudinary) throw authError('Cloudinary is not configured. Add the three CLOUDINARY_* values to .env.', 503);
  const belt = String(request.body.belt || '').trim();
  const result = await uploadToCloudinary(request.file, `budo-studio/templates/${belt || 'unassigned'}`);
  const isPdf = request.file.mimetype === 'application/pdf';
  const previewUrl = isPdf
    ? cloudinaryPdfPreview(result.public_id, result.resource_type || 'image')
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
    return { ...asset, ...data, url: data.cloudinary_url, previewUrl: data.preview_url || asset.previewUrl, public_id: data.cloudinary_public_id };
  }
  memory.assets.set(asset.id, asset);
  return asset;
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
  let preferencesReady = !supabase;
  if (supabase) {
    const checks = await Promise.all([
      supabase.from('candidates').select('id').limit(1),
      supabase.from('template_presets').select('id').limit(1),
      supabase.from('template_assets').select('id,preview_url,resource_type,mime_type').limit(1),
    ]);
    const error = checks.map((result) => result.error).find(Boolean);
    const preferencesCheck = await supabase.from('workspace_preferences').select('workspace_id').limit(1);
    preferencesReady = !preferencesCheck.error;
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
    preferencesReady,
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

// PATCH is the public API spelling; keep PUT for the legacy editor.
app.patch('/api/candidates/:id', async (request, response, next) => {
  try {
    const existing = await getCandidate(request, request.params.id);
    if (!existing) return response.status(404).json({ error: 'Candidate not found.' });
    response.json(await saveCandidate(request, request.params.id, { ...existing, ...request.body }, true));
  } catch (error) {
    next(error);
  }
});

app.post('/api/candidates/bulk', async (request, response, next) => {
  try {
    const items = Array.isArray(request.body) ? request.body : request.body?.candidates;
    if (!Array.isArray(items) || !items.length) return response.status(400).json({ error: 'Provide a non-empty candidates array.' });
    if (items.length > 4000) return response.status(413).json({ error: 'A bulk request cannot contain more than 4000 candidates.' });
    const parsedItems = items.map(item => candidateSchema.parse(item));
    const workspaceId = await workspaceOf(request);
    const timestamp = now();
    const records = parsedItems.map(item => ({
      ...candidateForStorage(item), id: id(), workspace_id: workspaceId,
      created_at: timestamp, updated_at: timestamp,
    }));
    let rows;
    if (!supabase) {
      rows = records.map(record => { memory.candidates.set(record.id, record); return record; });
    } else {
      const { data, error } = await supabase.from('candidates').insert(records).select('*');
      if (error) throw error;
      rows = data || [];
    }
    const byId = new Map(rows.map(row => [row.id, candidateFromStorage(row)]));
    const data = records.map((record, index) => ({ ...byId.get(record.id), clientId: parsedItems[index].clientId || null }));
    response.status(201).json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/candidates/bulk-update', async (request, response, next) => {
  try {
    const items = Array.isArray(request.body) ? request.body : request.body?.candidates;
    if (!Array.isArray(items) || !items.length) return response.status(400).json({ error: 'Provide candidates with ids to update.' });
    if (items.length > 4000) return response.status(413).json({ error: 'A bulk request cannot contain more than 4000 candidates.' });
    const ids = items.map(item => String(item?.id || '').trim());
    if (ids.some(candidateId => !candidateId)) throw authError('Every bulk update item needs an id.', 400);
    if (new Set(ids).size !== ids.length) throw authError('Bulk update contains duplicate ids.', 400);
    const workspaceId = await workspaceOf(request);
    if (!supabase) {
      const data = [];
      for (const item of items) {
        const existing = await getCandidate(request, String(item.id));
        if (!existing) throw authError(`Candidate not found: ${item.id}`, 404);
        data.push(await saveCandidate(request, String(item.id), { ...existing, ...item }, true));
      }
      return response.json({ data, count: data.length });
    }
    const { data: existingRows, error: lookupError } = await supabase.from('candidates').select('*').eq('workspace_id', workspaceId).in('id', ids);
    if (lookupError) throw lookupError;
    const existingById = new Map((existingRows || []).map(row => [row.id, row]));
    if (existingById.size !== ids.length) throw authError('One or more candidates were not found in this workspace.', 404);
    const timestamp = now();
    const records = items.map(item => {
      const candidateId = String(item.id);
      const parsed = candidateSchema.parse({ ...candidateFromStorage(existingById.get(candidateId)), ...item });
      return { ...candidateForStorage(parsed), id: candidateId, workspace_id: workspaceId, created_at: existingById.get(candidateId).created_at, updated_at: timestamp };
    });
    const { data: rows, error } = await supabase.from('candidates').upsert(records, { onConflict: 'id' }).select('*');
    if (error) throw error;
    const byId = new Map((rows || []).map(row => [row.id, candidateFromStorage(row)]));
    const data = ids.map(candidateId => byId.get(candidateId));
    response.json({ data, count: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/candidates/bulk-delete', async (request, response, next) => {
  try {
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || !ids.length) return response.status(400).json({ error: 'Provide a non-empty ids array.' });
    if (ids.length > 4000) return response.status(413).json({ error: 'A bulk delete cannot contain more than 4000 ids.' });
    const uniqueIds = [...new Set(ids.map(value => String(value || '').trim()).filter(Boolean))];
    const workspaceId = await workspaceOf(request);
    if (!supabase) {
      const deleted = uniqueIds.filter(candidateId => {
        const row = memory.candidates.get(candidateId);
        if (!row || row.workspace_id !== workspaceId) return false;
        memory.candidates.delete(candidateId);
        return true;
      });
      return response.json({ deleted, count: deleted.length });
    }
    const { data, error } = await supabase.from('candidates').delete().eq('workspace_id', workspaceId).in('id', uniqueIds).select('id');
    if (error) throw error;
    const deleted = (data || []).map(row => row.id);
    response.json({ deleted, count: deleted.length });
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

// Public API aliases. The editor keeps using /templates/presets for backwards compatibility.
app.get('/api/templates', async (request, response, next) => {
  try { response.json(await listPresets(request)); } catch (error) { next(error); }
});

app.post('/api/templates', async (request, response, next) => {
  try { response.status(201).json(await savePreset(request, null, request.body)); } catch (error) { next(error); }
});

app.patch('/api/templates/:id', async (request, response, next) => {
  try { response.json(await savePreset(request, request.params.id, request.body)); } catch (error) { next(error); }
});

app.get('/api/presets', async (request, response, next) => {
  try { response.json(await listPresets(request)); } catch (error) { next(error); }
});

app.post('/api/presets', async (request, response, next) => {
  try { response.status(201).json(await savePreset(request, null, request.body)); } catch (error) { next(error); }
});

app.patch('/api/presets/:id', async (request, response, next) => {
  try { response.json(await savePreset(request, request.params.id, request.body)); } catch (error) { next(error); }
});

app.delete('/api/presets/:id', async (request, response, next) => {
  try {
    if (!(await deletePreset(request, request.params.id))) return response.status(404).json({ error: 'Preset not found.' });
    response.status(204).end();
  } catch (error) { next(error); }
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
    response.status(201).json(await createTemplateAsset(request));
  } catch (error) {
    next(error);
  }
});

app.post('/api/assets/template', upload.single('file'), async (request, response, next) => {
  try {
    response.status(201).json(await createTemplateAsset(request));
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

// Keep remote Cloudinary backgrounds same-origin when they are drawn into the
// browser canvas for PDF export. Direct remote images may otherwise taint it.
app.get('/api/media/template', async (request, response, next) => {
  try {
    const target = new URL(String(request.query.url || ''));
    const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const allowed = target.protocol === 'https:'
      && target.hostname === 'res.cloudinary.com'
      && cloudName
      && target.pathname.startsWith(`/${cloudName}/`);
    if (!allowed) return response.status(400).json({ error: 'Only assets from the configured Cloudinary cloud can be proxied.' });
    const upstream = await fetch(target);
    if (!upstream.ok) return response.status(upstream.status).end();
    response.set('Content-Type', upstream.headers.get('content-type') || 'image/png');
    response.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) response.set('Content-Length', contentLength);
    if (!upstream.body) return response.end();
    try {
      await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      if (response.headersSent) response.destroy(error);
      else next(error);
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/belts', async (request, response, next) => {
  try { response.json(await listBelts(request)); } catch (error) { next(error); }
});

app.post('/api/belts', async (request, response, next) => {
  try { response.status(201).json(await saveBelt(request, request.body)); } catch (error) { next(error); }
});

app.get('/api/preferences', async (request, response, next) => {
  try {
    const preferences = await readPreferences(request);
    if (preferences.available === false) throw authError('Run supabase/template_customization.sql to enable account preferences and custom belts.', 503);
    response.json(preferences.config);
  } catch (error) { next(error); }
});

app.put('/api/preferences', async (request, response, next) => {
  try {
    const config = request.body?.preferences && typeof request.body.preferences === 'object' ? request.body.preferences : request.body;
    response.json(await writePreferences(request, config || {}));
  } catch (error) { next(error); }
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

// Short API alias for clients that expose the generic "extract" action.
app.post('/api/ai/extract', upload.single('file'), async (request, response, next) => {
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

app.post('/api/ai/extract-exam-list', upload.single('file'), async (request, response, next) => {
  try {
    if (!request.file) return response.status(400).json({ error: 'Attach the exam list image or PDF as the file field.' });
    await workspaceOf(request);
    const text = await generateText([
      { inlineData: { mimeType: request.file.mimetype, data: request.file.buffer.toString('base64') } },
      { text: `You are an expert Arabic/French document OCR system. Read every page of this exam registration list, including all rows of a table. Return ONLY valid JSON with this exact shape:
{"examDate":"","belt":"","kyu":null,"candidates":[{"name":"","birth":"","obtained":"","serial":"","ordinal":"","confidence":0,"warnings":[]}]}
Rules:
- Preserve Arabic names exactly as visible, without translating, reordering, or transliterating them.
- Keep right-to-left columns aligned with the correct candidate row.
- Extract the official diploma number labelled رقم تسلسلي / N° diplôme only when it is visibly present. Never invent a serial number.
- Put a visible row number or source order in ordinal only when it is clearly printed. Never use ordinal as a replacement for serial.
- Keep examDate separate from obtained. Do not copy one into the other unless the document explicitly shows they are the same.
- Use empty strings for unreadable text and null for an unreadable kyu.
- Use the list's exam date, belt, and grade only when visible in the document.
- Do not invent candidates, dates, serials, belts, grades, or missing characters.
- Include every readable candidate row from every page, in original order, without deduplicating.
- Set confidence from 0 to 1 for each row. Use a lower value when Arabic letters, digits, dates, or row alignment are uncertain.
- Add short French warning strings such as "Nom incertain", "Numéro illisible", or "Ligne partiellement coupée" when applicable.` },
    ], { responseMimeType: 'application/json', temperature: 0.05 });
    const extracted = extractJson(text);
    const candidates = Array.isArray(extracted) ? extracted : extracted?.candidates;
    if (!Array.isArray(candidates)) return response.status(422).json({ error: 'Gemini could not identify a candidate list.', raw: text });
    response.json({
      needsReview: true,
      exam: {
        examDate: cleanNullable(extracted?.examDate) || '',
        belt: cleanNullable(extracted?.belt) || '',
        kyu: extracted?.kyu ?? null,
        candidates: candidates.slice(0, 4000).map(candidate => ({
          name: cleanNullable(candidate?.name) || '',
          birth: cleanNullable(candidate?.birth) || '',
          obtained: cleanNullable(candidate?.obtained) || '',
          serial: cleanNullable(candidate?.serial) || '',
          ordinal: cleanNullable(candidate?.ordinal) || '',
          confidence: Number.isFinite(Number(candidate?.confidence)) ? Math.max(0, Math.min(1, Number(candidate.confidence))) : null,
          warnings: Array.isArray(candidate?.warnings) ? candidate.warnings.map(warning => cleanNullable(warning)).filter(Boolean).slice(0, 5) : [],
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Keep one user-facing product: the React-authenticated BUDO Studio at `/`.
// Never expose the legacy HTML shell directly: it does not mount AuthGate.
app.use('/workspace', (_request, response) => response.redirect(302, '/'));
app.get(['/legacy', '/index.html'], (_request, response) => response.redirect(302, '/'));
app.get('/', (_request, response) => response.sendFile(path.join(frontendDist, 'index.html'), (error) => {
  if (error) response.status(503).send('BUDO Studio frontend is not built. Run npm run build:full.');
}));
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

