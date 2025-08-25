import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
	createVoucher,
	updateVoucher,
	listVouchers,
	assignVouchers,
	createPlan,
	listPlans,
	updatePlan,
	deletePlan,
	computeKPIs,
	daysSincePreviousForAll,
	getAuthRow
} from './db.js';

import {
	requireAuth,
	handleLogin,
	handleLogout,
	handleChangePassword,
	initAuth
} from './auth.js';

const APP_SECRET = process.env.APP_SECRET || 'change-me-secret';

function verifySignedCookie(signedValue) {
	if (!signedValue || !signedValue.includes('.')) return false;
	const [value, mac] = signedValue.split('.');
	const h = crypto.createHmac('sha256', APP_SECRET).update(value).digest('hex');
	try {
		return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(h));
	} catch {
		return false;
	}
}

async function main() {
	const app = express();
	app.disable('x-powered-by');
	app.use(helmet({
		// Disable HTTPS-only header for local HTTP usage
		strictTransportSecurity: false,
		// Disable COOP to avoid warnings on non-trustworthy origins
		crossOriginOpenerPolicy: false,
		// Disable Origin-Agent-Cluster to avoid mixed keying warnings
		originAgentCluster: false
	}));
	app.use(cors({ origin: true, credentials: true }));
	app.use(cookieParser());
	app.use(express.json({ limit: '2mb' }));

	// Ensure auth initialized (default password, optional reset flag)
	await initAuth();

	// Session
	app.get('/api/session', (_req, res) => {
		const row = getAuthRow();
		const authed = verifySignedCookie(_req.cookies && _req.cookies.session);
		res.json({ authed: !!authed, mustChange: !!(row && row.must_change) });
	});

	// Auth
	app.post('/api/login', handleLogin);
	app.post('/api/logout', handleLogout);
	app.post('/api/change-password', handleChangePassword);

	// KPIs
	app.get('/api/kpis', requireAuth, (_req, res) => {
		const data = computeKPIs();
		res.json(data);
	});

	// Vouchers
	app.get('/api/vouchers', requireAuth, (req, res) => {
		const availableOnly = String(req.query.available || '').toLowerCase() === 'true';
		const rows = listVouchers({ availableOnly });
		const map = daysSincePreviousForAll();
		const withDays = rows.map(r => ({ ...r, days_since_previous: map.get(r.id) ?? null }));
		res.json(withDays);
	});

	app.post('/api/vouchers', requireAuth, (req, res) => {
		const { date, code, value, remaining, shop, in_review } = req.body || {};
		if (!date || !code) return res.status(400).json({ error: 'date und code sind Pflicht' });
		const isoDate = new Date(date).toISOString();
		try {
			const result = createVoucher({
				date: isoDate,
				code: String(code).trim(),
				value: Number(value ?? 40),
				remaining: Number(remaining ?? (value ?? 40)),
				shop: String(shop || 'EU'),
				in_review: in_review ? 1 : 0,
				assigned_to: null,
				object: null,
				used: 0,
				used_date: null
			});
			res.json({ ok: true, id: result.lastInsertRowid });
		} catch (e) {
			res.status(400).json({ error: String(e.message || e) });
		}
	});

	app.put('/api/vouchers/:id', requireAuth, (req, res) => {
		const id = Number(req.params.id);
		if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
		const fields = { ...req.body };
		if (fields.date) fields.date = new Date(fields.date).toISOString();
		if (typeof fields.in_review === 'boolean') fields.in_review = fields.in_review ? 1 : 0;
		try {
			const result = updateVoucher(id, fields);
			if (result.changes === 0) return res.status(404).json({ error: 'not found or no changes' });
			res.json({ ok: true });
		} catch (e) {
			res.status(400).json({ error: String(e.message || e) });
		}
	});

	app.post('/api/vouchers/assign', requireAuth, (req, res) => {
		const { ids, name, object, date } = req.body || {};
		if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids erforderlich' });
		if (!name || String(name).trim() === '') return res.status(400).json({ error: 'name erforderlich' });
		try {
			assignVouchers(ids.map(Number), String(name).trim(), object ? String(object).trim() : null, date ? new Date(date).toISOString() : null);
			res.json({ ok: true });
		} catch (e) {
			res.status(400).json({ error: String(e.message || e) });
		}
	});

	app.post('/api/vouchers/import', requireAuth, (req, res) => {
		const { csv } = req.body || {};
		if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv erforderlich' });
		let created = 0, skipped = 0, used_marked = 0;
		const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(l => l);
		for (const line of lines) {
			// Expected: Datum;Gutschein;Name;Objekt
			const parts = line.split(';').map(s => s.trim());
			if (parts.length < 2) { skipped++; continue; }
			const [dateStr, code, name, object] = parts;
			if (!code) { skipped++; continue; }
			const isoDate = new Date(dateStr || new Date()).toISOString();
			try {
				const result = createVoucher({
					date: isoDate,
					code,
					value: 40,
					remaining: name ? 0 : 40,
					shop: 'EU',
					in_review: 0,
					assigned_to: name || null,
					object: object || null,
					used: name ? 1 : 0,
					used_date: name ? isoDate : null
				});
				created++;
				if (name) used_marked++;
			} catch {
				skipped++;
			}
		}
		res.json({ created, skipped, used_marked });
	});

	app.get('/api/vouchers/export', requireAuth, (_req, res) => {
		const rows = listVouchers();
		const header = 'Datum;Gutschein;Name;Objekt';
		const csv = [header, ...rows.map(r => {
			const d = r.used ? (r.used_date || r.date) : r.date;
			const ds = String(d || '').split('T')[0];
			return [ds, r.code || '', r.assigned_to || '', r.object || ''].join(';');
		})].join('\n');
		res.setHeader('Content-Type', 'text/csv; charset=utf-8');
		res.setHeader('Content-Disposition', 'attachment; filename="vouchers.csv"');
		res.send(csv);
	});

	// Plans
	app.get('/api/plans', requireAuth, (_req, res) => {
		res.json(listPlans());
	});

	app.post('/api/plans', requireAuth, (req, res) => {
		const { name, value, date } = req.body || {};
		if (!name || !value || !date) return res.status(400).json({ error: 'name, value, date erforderlich' });
		const isoDate = new Date(date).toISOString();
		const r = createPlan({ name: String(name), value: Number(value), date: isoDate });
		res.json({ ok: true, id: r.lastInsertRowid });
	});

	app.put('/api/plans/:id', requireAuth, (req, res) => {
		const id = Number(req.params.id);
		if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
		const { name, value, date, status } = req.body || {};
		const fields = {};
		if (name != null) fields.name = String(name);
		if (value != null) fields.value = Number(value);
		if (date != null) fields.date = new Date(date).toISOString();
		if (status != null) fields.status = String(status);
		const r = updatePlan(id, fields);
		if (r.changes === 0) return res.status(404).json({ error: 'not found or no changes' });
		res.json({ ok: true });
	});

	app.post('/api/plans/:id/erledigt', requireAuth, (req, res) => {
		const id = Number(req.params.id);
		const r = updatePlan(id, { status: 'erledigt' });
		if (r.changes === 0) return res.status(404).json({ error: 'not found' });
		res.json({ ok: true });
	});

	app.delete('/api/plans/:id', requireAuth, (req, res) => {
		const id = Number(req.params.id);
		const r = deletePlan(id);
		if (r.changes === 0) return res.status(404).json({ error: 'not found' });
		res.json({ ok: true });
	});

	// Static files
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const publicDir = path.join(__dirname, '..', 'public');
	app.use(express.static(publicDir, { index: 'index.html', maxAge: '1h' }));

	// Fallback to index.html for any other GET
	app.get('*', (_req, res) => {
		const indexPath = path.join(publicDir, 'index.html');
		if (fs.existsSync(indexPath)) {
			res.sendFile(indexPath);
		} else {
			res.status(404).send('Not found');
		}
	});

	const port = Number(process.env.PORT || 3000);
	app.listen(port, '0.0.0.0', () => {
		console.log(`Server listening on http://0.0.0.0:${port}`);
	});
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

