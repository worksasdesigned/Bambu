import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'app.db');

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS auth (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	password_hash TEXT NOT NULL,
	must_change INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	date TEXT NOT NULL,
	code TEXT NOT NULL UNIQUE,
	value REAL NOT NULL DEFAULT 40,
	remaining REAL NOT NULL DEFAULT 40,
	shop TEXT NOT NULL DEFAULT 'EU',
	in_review INTEGER NOT NULL DEFAULT 0,
	assigned_to TEXT,
	object TEXT,
	used INTEGER NOT NULL DEFAULT 0,
	used_date TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	value REAL NOT NULL,
	date TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'offen', -- offen | erledigt
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
CREATE INDEX IF NOT EXISTS idx_vouchers_remaining ON vouchers(remaining);
CREATE INDEX IF NOT EXISTS idx_vouchers_used ON vouchers(used);
`);

export function getAuthRow() {
	const row = db.prepare('SELECT * FROM auth WHERE id = 1').get();
	return row || null;
}

export function setAuth(password_hash, must_change = 1) {
	const now = new Date().toISOString();
	db.prepare(`INSERT INTO auth (id, password_hash, must_change, updated_at)
		VALUES (1, @password_hash, @must_change, @updated_at)
		ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash, must_change=excluded.must_change, updated_at=excluded.updated_at`).run({ password_hash, must_change, updated_at: now });
}

export function setMustChange(flag) {
	const now = new Date().toISOString();
	db.prepare('UPDATE auth SET must_change=@flag, updated_at=@now WHERE id=1').run({ flag: flag ? 1 : 0, now });
}

export function initDefaultPasswordIfMissing(defaultHash) {
	const row = getAuthRow();
	if (!row) {
		setAuth(defaultHash, 1);
	}
}

export function createVoucher(voucher) {
	const now = new Date().toISOString();
	const stmt = db.prepare(`INSERT INTO vouchers (date, code, value, remaining, shop, in_review, assigned_to, object, used, used_date, created_at, updated_at)
		VALUES (@date, @code, @value, @remaining, @shop, @in_review, @assigned_to, @object, @used, @used_date, @created_at, @updated_at)`);
	return stmt.run({ ...voucher, created_at: now, updated_at: now });
}

export function updateVoucher(id, fields) {
	const allowed = ['date','code','value','remaining','shop','in_review','assigned_to','object','used','used_date'];
	const keys = Object.keys(fields).filter(k => allowed.includes(k));
	if (keys.length === 0) return { changes: 0 };
	const setClause = keys.map(k => `${k}=@${k}`).join(', ');
	const now = new Date().toISOString();
	return db.prepare(`UPDATE vouchers SET ${setClause}, updated_at=@now WHERE id=@id`).run({ ...fields, now, id });
}

export function listVouchers({ availableOnly = false } = {}) {
	if (availableOnly) {
		return db.prepare('SELECT * FROM vouchers WHERE remaining > 0 ORDER BY date DESC, id DESC').all();
	}
	return db.prepare('SELECT * FROM vouchers ORDER BY date DESC, id DESC').all();
}

export function getVoucherById(id) {
	return db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id);
}

export function assignVouchers(ids, name, object, date) {
	const now = new Date().toISOString();
	const usedDate = date || new Date().toISOString();
	const tx = db.transaction(() => {
		const stmt = db.prepare('UPDATE vouchers SET assigned_to=@name, object=@object, used=1, remaining=0, used_date=@usedDate, updated_at=@now WHERE id=@id');
		for (const id of ids) {
			stmt.run({ name, object, usedDate, now, id });
		}
	});
	tx();
}

export function createPlan(plan) {
	const now = new Date().toISOString();
	return db.prepare('INSERT INTO plans (name, value, date, status, created_at, updated_at) VALUES (@name,@value,@date,@status,@created_at,@updated_at)')
		.run({ ...plan, status: plan.status || 'offen', created_at: now, updated_at: now });
}

export function listPlans() {
	return db.prepare('SELECT * FROM plans ORDER BY date ASC, id ASC').all();
}

export function updatePlan(id, fields) {
	const allowed = ['name','value','date','status'];
	const keys = Object.keys(fields).filter(k => allowed.includes(k));
	if (keys.length === 0) return { changes: 0 };
	const setClause = keys.map(k => `${k}=@${k}`).join(', ');
	const now = new Date().toISOString();
	return db.prepare(`UPDATE plans SET ${setClause}, updated_at=@now WHERE id=@id`).run({ ...fields, now, id });
}

export function deletePlan(id) {
	return db.prepare('DELETE FROM plans WHERE id = ?').run(id);
}

export function computeKPIs() {
	const totalReceived = db.prepare('SELECT COALESCE(SUM(value),0) as sum FROM vouchers').get().sum || 0;
	const totalAvailable = db.prepare('SELECT COALESCE(SUM(remaining),0) as sum FROM vouchers WHERE remaining > 0').get().sum || 0;
	const vouchers = db.prepare('SELECT id, date, value FROM vouchers ORDER BY date ASC, id ASC').all();
	let forecast = { m3: 0, m6: 0, m12: 0 };
	if (vouchers.length >= 2) {
		let gaps = [];
		for (let i = 1; i < vouchers.length; i++) {
			const d1 = new Date(vouchers[i-1].date);
			const d2 = new Date(vouchers[i].date);
			const days = Math.max(1, Math.round((d2 - d1) / (1000*60*60*24)));
			gaps.push(days);
		}
		const avgGapDays = gaps.reduce((a,b)=>a+b,0) / gaps.length;
		const avgValue = vouchers.reduce((a,v)=>a+Number(v.value||0),0) / vouchers.length;
		function estimate(days) {
			const count = Math.floor(days / avgGapDays);
			return Math.max(0, Math.round(count * avgValue));
		}
		forecast = { m3: estimate(30*3), m6: estimate(30*6), m12: estimate(30*12) };
	}
	const assignedRows = db.prepare("SELECT assigned_to as name, COUNT(*) as count, COALESCE(SUM(value),0) as sum, MAX(used_date) as last_date FROM vouchers WHERE assigned_to IS NOT NULL GROUP BY assigned_to ORDER BY last_date DESC").all();
	const objects = db.prepare("SELECT object, COUNT(*) as count FROM vouchers WHERE object IS NOT NULL AND object <> '' GROUP BY object ORDER BY count DESC, object ASC").all();
	return { totalReceived, totalAvailable, forecast, assigned: assignedRows, objects };
}

export function daysSincePreviousForAll() {
	const rows = db.prepare('SELECT id, date FROM vouchers ORDER BY date ASC, id ASC').all();
	const map = new Map();
	let prevDate = null;
	for (const r of rows) {
		const d = new Date(r.date);
		let days = null;
		if (prevDate) {
			days = Math.max(0, Math.round((d - prevDate) / (1000*60*60*24)));
		}
		map.set(r.id, days);
		prevDate = d;
	}
	return map;
}