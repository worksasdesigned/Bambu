import argon2 from 'argon2';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getAuthRow, setAuth, initDefaultPasswordIfMissing, setMustChange } from './db.js';

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'bambu';
const APP_SECRET = process.env.APP_SECRET || 'change-me-secret';
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export async function initAuth() {
	const defaultHash = await argon2.hash(DEFAULT_PASSWORD);
	initDefaultPasswordIfMissing(defaultHash);
	const resetFlag = path.join(dataDir, 'reset-password');
	if (fs.existsSync(resetFlag)) {
		const hash = await argon2.hash(DEFAULT_PASSWORD);
		setAuth(hash, 1);
		try { fs.unlinkSync(resetFlag); } catch {}
	}
}

function sign(value) {
	const h = crypto.createHmac('sha256', APP_SECRET).update(value).digest('hex');
	return `${value}.${h}`;
}

function verify(signedValue) {
	if (!signedValue || !signedValue.includes('.')) return false;
	const [value, mac] = signedValue.split('.');
	const h = crypto.createHmac('sha256', APP_SECRET).update(value).digest('hex');
	return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(h));
}

export function requireAuth(req, res, next) {
	const cookie = req.cookies && req.cookies.session;
	if (cookie && verify(cookie)) {
		return next();
	}
	res.status(401).json({ error: 'unauthorized' });
}

export async function handleLogin(req, res) {
	const { password } = req.body || {};
	if (!password) return res.status(400).json({ error: 'password required' });
	const row = getAuthRow();
	if (!row) return res.status(500).json({ error: 'auth not initialized' });
	const ok = await argon2.verify(row.password_hash, password);
	if (!ok) return res.status(401).json({ error: 'invalid password' });
	res.cookie('session', sign('ok'), { httpOnly: true, sameSite: 'lax', maxAge: 7*24*3600*1000 });
	res.json({ ok: true, mustChange: !!row.must_change });
}

export function handleLogout(_req, res) {
	res.clearCookie('session');
	res.json({ ok: true });
}

export async function handleChangePassword(req, res) {
	const { oldPassword, newPassword } = req.body || {};
	if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'neues Passwort ist zu kurz' });
	const row = getAuthRow();
	if (!row) return res.status(500).json({ error: 'auth not initialized' });
	const ok = await argon2.verify(row.password_hash, oldPassword || '');
	if (!ok && !row.must_change) return res.status(401).json({ error: 'falsches Passwort' });
	const hash = await argon2.hash(newPassword);
	setAuth(hash, 0);
	setMustChange(0);
	res.json({ ok: true });
}