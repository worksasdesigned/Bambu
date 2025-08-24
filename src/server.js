import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { db, createVoucher, updateVoucher, listVouchers, getVoucherById, assignVouchers, createPlan, listPlans, updatePlan, deletePlan, computeKPIs, daysSincePreviousForAll } from './db.js';
import { initAuth, requireAuth, handleLogin, handleLogout, handleChangePassword } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
	// Allow plain HTTP usage on LAN: disable HTTPS-forcing headers and upgrades
	hsts: false,
	crossOriginOpenerPolicy: false,
	originAgentCluster: false,
	crossOriginEmbedderPolicy: false,
	contentSecurityPolicy: {
		useDefaults: true,
		directives: {
			"script-src": ["'self'", "'unsafe-inline'"],
			// Do not auto-upgrade http -> https for subresources
			"upgrade-insecure-requests": null
		}
	}
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (_req, res) => { res.json({ ok: true }); });

// Auth
app.post('/api/login', handleLogin);
app.post('/api/logout', handleLogout);
app.get('/api/session', (req, res) => {
	const authed = !!(req.cookies && req.cookies.session);
	const row = db.prepare('SELECT must_change FROM auth WHERE id=1').get();
	res.json({ authed, mustChange: row ? !!row.must_change : true });
});
app.post('/api/change-password', requireAuth, handleChangePassword);

// Protected API
app.use('/api', requireAuth);

app.get('/api/kpis', (_req, res) => {
	const data = computeKPIs();
	res.json(data);
});

app.get('/api/vouchers', (req, res) => {
	const availableOnly = String(req.query.available || '').toLowerCase() === 'true';
	const rows = listVouchers({ availableOnly });
	const daysMap = daysSincePreviousForAll();
	const out = rows.map(r => ({
		...r,
		days_since_previous: daysMap.get(r.id)
	}));
	res.json(out);
});

app.get('/api/vouchers/:id', (req, res) => {
	const row = getVoucherById(Number(req.params.id));
	if (!row) return res.status(404).json({ error: 'not found' });
	res.json(row);
});

app.post('/api/vouchers', (req, res) => {
	const { date, code, value = 40, remaining = 40, shop = 'EU', in_review = false } = req.body || {};
	if (!date || !code) return res.status(400).json({ error: 'date und code erforderlich' });
	try {
		const result = createVoucher({ date, code, value, remaining, shop, in_review: in_review ? 1 : 0, assigned_to: null, object: null, used: 0, used_date: null });
		res.json({ ok: true, id: result.lastInsertRowid });
	} catch (e) {
		res.status(400).json({ error: e.message });
	}
});

app.post('/api/vouchers/import', (req, res) => {
	const { csv } = req.body || {};
	if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv erforderlich' });
	const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
	let created = 0, skipped = 0, used_marked = 0;
	function parseDate(input) {
		if (!input) return new Date().toISOString().split('T')[0];
		const s = String(input).trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
		const m = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{2,4})$/);
		if (m) {
			const d = m[1].padStart(2,'0');
			const mo = m[2].padStart(2,'0');
			const y = m[3].length === 2 ? ('20'+m[3]) : m[3];
			return `${y}-${mo}-${d}`;
		}
		return new Date().toISOString().split('T')[0];
	}
	for (let idx = 0; idx < lines.length; idx++) {
		const line = lines[idx];
		const partsRaw = line.split(';');
		const parts = partsRaw.map(p => p.trim());
		if (idx === 0) {
			const hd0 = parts[0]?.toLowerCase();
			const hd1 = parts[1]?.toLowerCase();
			if (hd0?.includes('datum') && hd1?.includes('gutschein')) {
				continue; // header überspringen
			}
		}
		if (parts.length < 2) { skipped++; continue; }
		const date = parseDate(parts[0] || '');
		const code = parts[1] || '';
		const name = parts[2] || '';
		const object = parts[3] || '';
		if (!code) { skipped++; continue; }
		const used = (name && name.trim()) || (object && object.trim()) ? 1 : 0;
		const remaining = used ? 0 : 40;
		const used_date = used ? date : null;
		try {
			createVoucher({ date, code, value: 40, remaining, shop: 'EU', in_review: 0, assigned_to: name || null, object: object || null, used, used_date });
			created++;
			if (used) used_marked++;
		} catch (e) {
			// z.B. Duplikat -> überspringen
			skipped++;
		}
	}
	res.json({ ok: true, created, skipped, used_marked });
});

app.put('/api/vouchers/:id', (req, res) => {
	const id = Number(req.params.id);
	const result = updateVoucher(id, req.body || {});
	res.json({ ok: true, changes: result.changes });
});

app.post('/api/vouchers/assign', (req, res) => {
	const { ids, name, object, date } = req.body || {};
	if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids erforderlich' });
	if (!name) return res.status(400).json({ error: 'Name erforderlich' });
	assignVouchers(ids.map(Number), name, object || null, date);
	res.json({ ok: true });
});

// Plans
app.get('/api/plans', (_req, res) => {
	res.json(listPlans());
});
app.post('/api/plans', (req, res) => {
	const { name, value, date } = req.body || {};
	if (!name || !value || !date) return res.status(400).json({ error: 'name, value, date erforderlich' });
	const result = createPlan({ name, value, date });
	res.json({ ok: true, id: result.lastInsertRowid });
});
app.put('/api/plans/:id', (req, res) => {
	const id = Number(req.params.id);
	const result = updatePlan(id, req.body || {});
	res.json({ ok: true, changes: result.changes });
});
app.post('/api/plans/:id/erledigt', (req, res) => {
	const id = Number(req.params.id);
	const result = updatePlan(id, { status: 'erledigt' });
	res.json({ ok: true, changes: result.changes });
});
app.delete('/api/plans/:id', (req, res) => {
	const id = Number(req.params.id);
	const result = deletePlan(id);
	res.json({ ok: true, changes: result.changes });
});

app.get('*', (_req, res) => {
	res.sendFile(path.join(__dirname, '../public/index.html'));
});

await initAuth();

app.listen(PORT, '0.0.0.0', () => {
	console.log(`Server running on http://0.0.0.0:${PORT}`);
});