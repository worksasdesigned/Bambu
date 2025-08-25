const state = {
	session: { authed: false, mustChange: false },
	kpis: null,
	vouchers: [],
	available: [],
	plans: [],
	selection: new Set(),
};

const SHOPS = [
	{ code: 'EU', label: 'EU', flag: '🇪🇺' },
	{ code: 'USA', label: 'USA', flag: '🇺🇸' },
	{ code: 'UK', label: 'UK', flag: '🇬🇧' },
	{ code: 'CA', label: 'CA', flag: '🇨🇦' },
	{ code: 'AU', label: 'AU', flag: '🇦🇺' },
	{ code: 'JP', label: 'JP', flag: '🇯🇵' },
	{ code: 'ASIA', label: 'ASIA', flag: '🌏' },
	{ code: 'KR', label: 'KR', flag: '🇰🇷' },
	{ code: 'CN', label: 'CN', flag: '🇨🇳' },
];

function h(tag, attrs={}, ...children) {
	const el = document.createElement(tag);
	for (const [k,v] of Object.entries(attrs)) {
		if (k === 'class') el.className = v;
		else if (k === 'onclick') el.addEventListener('click', v);
		else if (k === 'oninput') el.addEventListener('input', v);
		else if (k === 'onchange') el.addEventListener('change', v);
		else if (k === 'value') el.value = v;
		else if (k === 'checked') el.checked = !!v;
		else if (k === 'selected') { if (v) el.selected = true; }
		else if (typeof v === 'boolean') { if (v) el.setAttribute(k, ''); }
		else el.setAttribute(k, v);
	}
	for (const c of children.flat()) {
		if (c == null) continue;
		if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') el.appendChild(document.createTextNode(String(c)));
		else if (c instanceof Node) el.appendChild(c);
	}
	return el;
}

async function api(path, opts={}) {
	const p = location.pathname;
	const base = (p === '/') ? '' : (p.endsWith('/') ? p.slice(0, -1) : p);
	const url = path.startsWith('/') ? `${base}${path}` : path;
	const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
	const readAsJsonSafe = async () => {
		const text = await res.text();
		try { return JSON.parse(text); } catch { return { error: text || 'Fehler' }; }
	};
	if (!res.ok) {
		const data = await readAsJsonSafe();
		throw new Error(data.error || 'Fehler');
	}
	const okText = await res.text();
	try { return JSON.parse(okText); } catch { return okText; }
}

function money(v) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(v||0)); }
function fmtDate(s) { return s ? s.split('T')[0] : ''; }
function today() { return new Date().toISOString().split('T')[0]; }

async function bootstrap() {
	const sess = await api('/api/session');
	state.session = sess;
	render();
	if (sess.authed && !sess.mustChange) {
		await refreshData();
	}
}

async function refreshData() {
	[state.kpis, state.vouchers, state.available, state.plans] = await Promise.all([
		api('/api/kpis'),
		api('/api/vouchers'),
		api('/api/vouchers?available=true'),
		api('/api/plans')
	]);
	render();
}

function render() {
	const root = document.getElementById('app');
	root.innerHTML = '';
	const container = h('div', { class: 'container' });
	container.appendChild(header());
	if (!state.session.authed) {
		container.appendChild(loginCard());
	} else if (state.session.mustChange) {
		container.appendChild(changePasswordCard());
	} else {
		container.appendChild(dashboard());
	}
	root.appendChild(container);
}

function header() {
	return h('div', { class: 'header' },
		// Title + subtitle with line break
		h('div', { class: 'title' }, 'deZents kleine Bambu-Gutschein-Verwaltung', h('small', {}, 'Wenn Hobbies Hobbies finanzieren.')),
		h('hr', { class: 'divider' }),
		state.session.authed ? h('div', { class: 'button-bar' },
			h('button', { class: 'button', onclick: () => showCaptureForm() }, 'Gutschein erfassen'),
			h('button', { class: 'button alt', onclick: () => showAssignList() }, 'Gutscheine verwenden'),
			h('button', { class: 'button warn', onclick: () => showPlanManager() }, 'Gutscheine planen'),
			h('button', { class: 'button', onclick: () => showImportModal() }, 'Import Data'),
			h('button', { class: 'button', onclick: async () => { await api('/api/logout', { method: 'POST' }); location.reload(); } }, 'Logout')
		) : ''
	);
}

function loginCard() {
	let pwd;
	return h('div', { class: 'card' },
		h('div', { style:'margin-bottom:8px;font-weight:600' }, 'Bitte Passwort eingeben'),
		h('div', {}, h('input', { type:'password', placeholder:'Passwort', oninput: e => pwd = e.target.value })),
		h('div', { style:'margin-top:10px' }, h('button', { class:'button', onclick: async () => {
			try {
				const r = await api('/api/login', { method:'POST', body: JSON.stringify({ password: pwd }) });
				state.session = { authed: true, mustChange: r.mustChange };
				render();
				if (!r.mustChange) await refreshData();
			} catch (e) { alert(e.message); }
		} }, 'Login')),
		h('div', { class:'footer' }, 'Standardpasswort: bambu')
	);
}

function changePasswordCard() {
	let oldP, newP;
	return h('div', { class: 'card' },
		h('div', { style:'margin-bottom:8px;font-weight:600' }, 'Neues Passwort vergeben'),
		h('div', { class:'form-row' },
			h('div', {}, h('label', {}, 'Altes Passwort'), h('input', { type:'password', oninput: e => oldP = e.target.value })),
			h('div', {}, h('label', {}, 'Neues Passwort'), h('input', { type:'password', oninput: e => newP = e.target.value }))
		),
		h('div', { style:'margin-top:10px' }, h('button', { class:'button primary', onclick: async () => {
			try {
				await api('/api/change-password', { method:'POST', body: JSON.stringify({ oldPassword: oldP, newPassword: newP }) });
				state.session.mustChange = false;
				await refreshData();
			} catch (e) { alert(e.message); }
		} }, 'Passwort speichern'))
	);
}

function dashboard() {
	const wrap = h('div', { class: 'stack' });

	// Chart section (large tile)
	if (state.vouchers && state.kpis) {
		wrap.appendChild(card('Wertentwicklung', chartCard()));
	}

	// KPI grid
	if (state.kpis) {
		const totalCount = (state.vouchers||[]).length;
		const availableCount = (state.available||[]).length;
		const g = h('div', { class:'grid' },
			kpiCard('Anzahl Gutschein gesamt', totalCount),
			kpiCard('Anzahl Gutscheine verfügbar', availableCount),
			kpiCard('Summe erhalten', money(state.kpis.totalReceived)),
			kpiCard('Summe verfügbar', money(state.kpis.totalAvailable)),
			kpiCard('Prognose 3 Monate', money(state.kpis.forecast.m3)),
			kpiCard('Prognose 6 Monate', money(state.kpis.forecast.m6)),
			kpiCard('Prognose 12 Monate', money(state.kpis.forecast.m12))
		);
		wrap.appendChild(g);
		// Assigned table (sortable)
		wrap.appendChild(card('Verteilt an', assignedTable(state.kpis.assigned||[])));
	}
	// Planned vouchers tiles
	if (state.plans && state.kpis) {
		const available = Number(state.kpis.totalAvailable||0);
		const grid = h('div', { class:'grid' }, ...state.plans.filter(p=>p.status==='offen').map(p => plannedCard(p, available)));
		wrap.appendChild(card('Geplante Gutscheine', grid));
	}
	// All vouchers table
	if (state.vouchers) {
		const rows = state.vouchers.map(v => voucherRow(v));
		wrap.appendChild(card('Alle Gutscheine', tableEl(rows, ['Datum','Gutscheinnummer','Tage seit letztem Gutschein','Restwert','Objekt'])));
	}
	return wrap;
}

function kpiCard(label, value) {
	return h('div', { class:'card kpi' }, h('div', { class:'label' }, label), h('div', { class:'value' }, value));
}

function card(title, inner) {
	return h('div', { class:'card' }, h('div', { style:'font-weight:700;margin-bottom:8px' }, title), inner);
}

function chartCard() {
	const box = h('div', {});
	const canvas = h('canvas', { style:'width:100%;height:300px;display:block' });
	box.appendChild(canvas);

	function computeSeries() {
		const vouchers = (state.vouchers||[]).map(v => ({
			date: new Date(v.date),
			value: Number(v.value||0),
			remaining: Number(v.remaining||0),
			used_date: v.used_date ? new Date(v.used_date) : null
		}));
		vouchers.sort((a,b) => a.date - b.date);
		const dates = new Set();
		for (const v of vouchers) { dates.add(v.date.toISOString().slice(0,10)); if (v.used_date) dates.add(v.used_date.toISOString().slice(0,10)); }
		const sortedDates = Array.from(dates).sort();
		let cumReceived = 0;
		const points = [];
		for (const ds of sortedDates) {
			const d = new Date(ds);
			// increment received for vouchers created on this date
			for (const v of vouchers) { if (v.date.toISOString().slice(0,10) === ds) cumReceived += v.value; }
			// available at date ds: sum remaining for vouchers born on/before d and not used before/at d
			let available = 0;
			for (const v of vouchers) {
				const born = v.date <= d;
				const stillAvailable = !v.used_date || v.used_date > d;
				if (born && stillAvailable) available += v.remaining;
			}
			points.push({ date: d, received: cumReceived, available });
		}
		return points;
	}

	function draw() {
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = Math.floor(rect.width * dpr);
		canvas.height = Math.floor(rect.height * dpr);
		const ctx = canvas.getContext('2d');
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, rect.width, rect.height);

		const series = computeSeries();
		if (series.length === 0) return;
		const pad = { l: 40, r: 12, t: 8, b: 24 };
		const w = rect.width - pad.l - pad.r;
		const h = rect.height - pad.t - pad.b;
		const maxY = Math.max(...series.map(p => Math.max(p.received, p.available))) || 1;
		const minX = series[0].date.getTime();
		const maxX = series[series.length - 1].date.getTime();

		function xFor(t) { return pad.l + w * ((t - minX) / Math.max(1, (maxX - minX))); }
		function yFor(v) { return pad.t + h - (h * (v / maxY)); }

		// axes
		ctx.strokeStyle = '#1f2937';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(pad.l, pad.t);
		ctx.lineTo(pad.l, pad.t + h);
		ctx.lineTo(pad.l + w, pad.t + h);
		ctx.stroke();

		// ticks (y)
		ctx.fillStyle = '#9ca3af';
		ctx.font = '12px sans-serif';
		const steps = 4;
		for (let i = 1; i <= steps; i++) {
			const v = (maxY / steps) * i;
			const y = yFor(v);
			ctx.strokeStyle = 'rgba(31,41,55,.5)';
			ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
			ctx.fillText(money(v), 4, y - 2);
		}

		// build paths
		const pathReceived = new Path2D();
		const pathAvailable = new Path2D();
		series.forEach((p, idx) => {
			const x = xFor(p.date.getTime());
			const yr = yFor(p.received);
			const ya = yFor(p.available);
			if (idx === 0) { pathReceived.moveTo(x, yr); pathAvailable.moveTo(x, ya); }
			else { pathReceived.lineTo(x, yr); pathAvailable.lineTo(x, ya); }
		});

		// animated draw
		let t = 0;
		function frame() {
			ctx.clearRect(0, 0, rect.width, rect.height);
			// redraw axes and grid
			ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + h); ctx.lineTo(pad.l + w, pad.t + h); ctx.stroke();
			ctx.fillStyle = '#9ca3af'; ctx.font = '12px sans-serif';
			for (let i = 1; i <= steps; i++) { const v = (maxY / steps) * i; const y = yFor(v); ctx.strokeStyle = 'rgba(31,41,55,.5)'; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke(); ctx.fillText(money(v), 4, y - 2); }

			ctx.save();
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#06b6d4'; // cyan received
			ctx.setLineDash([w]);
			ctx.lineDashOffset = (1 - t) * w;
			ctx.stroke(pathReceived);
			ctx.restore();

			ctx.save();
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#10b981'; // green available
			ctx.setLineDash([w]);
			ctx.lineDashOffset = (1 - t) * w;
			ctx.stroke(pathAvailable);
			ctx.restore();

			if (t < 1) { t += 0.03; requestAnimationFrame(frame); }
		}
		frame();
	}

	// draw now and on resize
	setTimeout(draw, 0);
	window.addEventListener('resize', draw);
	return box;
}

function plannedCard(p, available) {
	const pct = Math.max(0, Math.min(100, Math.round((available / Number(p.value||0)) * 100)));
	const bar = h('div', { style:'height:10px;background:#111827;border:1px solid #24324a;border-radius:8px;overflow:hidden' },
		h('div', { style:`height:100%;width:${isFinite(pct)?pct:0}%;background:#10b981` })
	);
	return h('div', { class:'card' },
		h('div', { style:'font-weight:700' }, `${p.name} – ${money(p.value)}`),
		h('div', { class:'label' }, `Zieldatum: ${fmtDate(p.date)}`),
		bar
	);
}

function table(headers, rows) {
	// Generic static table (kept for legacy usage)
	const thead = h('tr', {}, ...headers.map(hd => h('th', { style:'text-align:left;color:#9ca3af;font-weight:600' }, hd)));
	const body = rows.map(r => h('tr', {}, ...r.map(c => h('td', {}, c))));
	return h('table', { class:'table' }, thead, ...body);
}

function tableEl(rows, headers) {
	const thead = h('tr', {}, ...headers.map(hd => h('th', { style:'text-align:left;color:#9ca3af;font-weight:600' }, hd)));
	return h('table', { class:'table' }, thead, ...rows);
}

function voucherRow(v) {
	const assigned = v.assigned_to && String(v.assigned_to).trim() !== '';
	let cls = 'row-green';
	if (Number(v.remaining||0) > 0 && Number(v.remaining||0) < 40) cls = 'row-blue';
	else if (v.used || assigned) cls = 'row-red';
	else if (v.in_review) cls = 'row-yellow';
	const tr = h('tr', { class: cls, onclick: () => editVoucher(v) },
		h('td', {}, fmtDate(v.date)),
		h('td', {}, v.code),
		h('td', {}, v.days_since_previous == null ? '-' : String(v.days_since_previous)),
		h('td', {}, money(v.remaining)),
		h('td', {}, v.object || '-')
	);
	return tr;
}

function showCaptureForm() {
	const wrap = modal('Gutschein erfassen');
	let date=today(), code='', value=40, remaining=40, shop='EU', in_review=false;
	wrap.body.append(
		formRow('Datum', h('input', { type:'date', value:date, oninput:e=>date=e.target.value })),
		formRow('Gutscheincode', h('input', { oninput:e=>code=e.target.value })),
		formRow('Wert', h('input', { type:'number', value:40, oninput:e=>value=Number(e.target.value) })),
		formRow('Restwert', h('input', { type:'number', value:40, oninput:e=>remaining=Number(e.target.value) })),
		formRow('Shop', selectShop(shop, v=>shop=v)),
		formRow('In Prüfung', h('input', { type:'checkbox', checked:false, oninput:e=>in_review = e.target.checked }))
	);
	wrap.footer.append(h('button', { class:'button primary', onclick: async () => {
		try {
			await api('/api/vouchers', { method:'POST', body: JSON.stringify({ date, code, value, remaining, shop, in_review }) });
			wrap.close();
			showToast('Datensatz erfasst');
			await refreshData();
		} catch (e) { alert(e.message); }
	} }, 'Speichern'));
}

function showAssignList() {
	state.selection.clear();
	const wrap = modal('Gutscheine verwenden');
	let sumSpan = h('span', { style:'font-weight:700' }, money(0));
	const rows = (state.available||[]).map(v => {
		const cb = h('input', { type:'checkbox', onclick: () => {
			if (cb.checked) state.selection.add(v.id); else state.selection.delete(v.id);
			sumSpan.textContent = money((state.available||[]).filter(x=>state.selection.has(x.id)).reduce((a,b)=>a+Number(b.remaining||0),0));
		}});
		const tr = h('tr', {}, h('td', {}, cb), h('td', {}, fmtDate(v.date)), h('td', {}, v.code), h('td', {}, money(v.remaining)));
		return tr;
	});
	const tbl = h('table', { class:'table' }, h('tr', {}, h('th', {}, ''), h('th', {}, 'Datum'), h('th', {}, 'Gutschein'), h('th', {}, 'Restwert')), ...rows);
	wrap.body.append(h('div', {}, tbl), h('div', { style:'margin:10px 0' }, 'Summe markiert: ', sumSpan));
	wrap.footer.append(h('button', { class:'button alt', onclick: () => assignSelected(wrap) }, 'Gutscheine zuweisen'));
}

function assignSelected(wrap) {
	if (state.selection.size === 0) { alert('Bitte mindestens einen Gutschein markieren'); return; }
	let name='', object='', date=today();
	wrap.body.innerHTML='';
	wrap.title.textContent='Gutscheine zuweisen';
	wrap.body.append(
		formRow('Name (Pflicht)', h('input', { oninput:e=>name=e.target.value })),
		formRow('Objekt (optional)', h('input', { oninput:e=>object=e.target.value })),
		formRow('Datum', h('input', { type:'date', value:date, oninput:e=>date=e.target.value }))
	);
	wrap.footer.innerHTML='';
	wrap.footer.append(h('button', { class:'button primary', onclick: async () => {
		if (!name) { alert('Name ist Pflicht'); return; }
		try {
			await api('/api/vouchers/assign', { method:'POST', body: JSON.stringify({ ids: Array.from(state.selection), name, object, date }) });
			wrap.close();
			showToast('Datensatz gespeichert');
			await refreshData();
		} catch (e) { alert(e.message); }
	} }, 'Speichern'));
}

function showPlanManager() {
	const wrap = modal('Gutscheine planen');
	let name='', value=40, date=today();
	wrap.body.append(
		formRow('Name', h('input', { oninput:e=>name=e.target.value })),
		formRow('Wert', h('input', { type:'number', value:40, oninput:e=>value=Number(e.target.value) })),
		formRow('Datum', h('input', { type:'date', value:date, oninput:e=>date=e.target.value }))
	);
	wrap.footer.append(h('button', { class:'button primary', onclick: async () => {
		if (!name || !value || !date) { alert('Bitte alle Pflichtfelder ausfüllen'); return; }
		await api('/api/plans', { method:'POST', body: JSON.stringify({ name, value, date }) });
		showToast('Datensatz gespeichert');
		wrap.close();
		await refreshPlansTable();
	} }, 'Speichern'));
	wrap.body.append(h('div', { style:'margin-top:10px' }, plansTable()));
}

async function refreshPlansTable() {
	state.plans = await api('/api/plans');
	render();
}

function plansTable() {
	const rows = (state.plans||[]).map(p => {
		const btns = h('div', {},
			h('button', { class:'button', onclick: async () => { await api(`/api/plans/${p.id}/erledigt`, { method:'POST' }); await refreshPlansTable(); } }, 'erledigt'),
			h('button', { class:'button', onclick: async () => { const name=prompt('Neuer Name', p.name)||p.name; const value=Number(prompt('Neuer Wert', p.value)||p.value); const date=prompt('Neues Datum (YYYY-MM-DD)', fmtDate(p.date))||fmtDate(p.date); await api(`/api/plans/${p.id}`, { method:'PUT', body: JSON.stringify({ name, value, date }) }); await refreshPlansTable(); } }, 'ändern'),
			h('button', { class:'button warn', onclick: async () => { await api(`/api/plans/${p.id}`, { method:'DELETE' }); await refreshPlansTable(); } }, 'löschen')
		);
		return h('tr', {}, h('td', {}, p.status), h('td', {}, fmtDate(p.date)), h('td', {}, p.name), h('td', {}, money(p.value)), h('td', {}, btns));
	});
	return h('table', { class:'table' }, h('tr', {}, h('th', {}, 'Status'), h('th', {}, 'Datum'), h('th', {}, 'Name'), h('th', {}, 'Wert'), h('th', {}, 'Aktionen')), ...rows);
}

function editVoucher(v) {
	const wrap = modal('Gutschein bearbeiten');
	let date=v.date.split('T')[0], code=v.code, value=v.value, remaining=v.remaining, shop=v.shop, in_review=!!v.in_review, assigned_to=v.assigned_to||'', object=v.object||'';
	wrap.body.append(
		formRow('Datum', h('input', { type:'date', value:date, oninput:e=>date=e.target.value })),
		formRow('Gutscheincode', h('input', { value:code, oninput:e=>code=e.target.value })),
		formRow('Wert', h('input', { type:'number', value:value, oninput:e=>value=Number(e.target.value) })),
		formRow('Restwert', h('input', { type:'number', value:remaining, oninput:e=>remaining=Number(e.target.value) })),
		formRow('Shop', selectShop(shop, v=>shop=v)),
		formRow('In Prüfung', h('input', { type:'checkbox', checked:in_review, oninput:e=>in_review = e.target.checked })),

		formRow('Name', h('input', { value:assigned_to, oninput:e=>assigned_to=e.target.value })),
		formRow('Objekt', h('input', { value:object, oninput:e=>object=e.target.value }))
	);
	wrap.footer.append(h('button', { class:'button primary', onclick: async () => {
		try {
			await api(`/api/vouchers/${v.id}`, { method:'PUT', body: JSON.stringify({ date, code, value, remaining, shop, in_review, assigned_to, object }) });
			wrap.close();
			showToast('Datensatz gespeichert');
			await refreshData();
		} catch (e) { alert(e.message); }
	} }, 'Speichern'));
}

function formRow(labelText, inputEl) { return h('div', { class:'form-row' }, h('div', {}, h('label', {}, labelText), inputEl)); }

function selectShop(selected, onChange) {
	const options = SHOPS.map(s => h('option', { value:s.code, selected: s.code === selected }, `${s.flag} ${s.code}`));
	const sel = h('select', { onchange: e=>onChange(e.target.value) }, ...options);
	// Ensure the correct initial selection after options are appended
	if (selected) sel.value = selected;
	return sel;
}

function assignedTable(rows) {
	let sortKey = 'last_date';
	let asc = false; // default: last date desc
	const tbl = h('table', { class:'table' });
	const headCells = ['Name','Anzahl','Summe','Letztes Datum'];
	const keyByIndex = ['name','count','sum','last_date'];
	const thead = h('thead', {}, h('tr', {}, ...headCells.map((hd, idx) => h('th', { style:'text-align:left;color:#9ca3af;font-weight:600;cursor:pointer', onclick: () => {
		const key = keyByIndex[idx];
		if (sortKey === key) asc = !asc; else { sortKey = key; asc = true; }
		renderBody();
	} }, hd))));
	const tbody = h('tbody', {});
	tbl.append(thead, tbody);
	function renderBody() {
		tbody.innerHTML = '';
		const sorted = [...rows].sort((a,b) => {
			const va = a[sortKey];
			const vb = b[sortKey];
			if (sortKey === 'count' || sortKey === 'sum') return asc ? (Number(va||0) - Number(vb||0)) : (Number(vb||0) - Number(va||0));
			if (sortKey === 'last_date') {
				const da = va || '';
				const db = vb || '';
				return asc ? da.localeCompare(db) : db.localeCompare(da);
			}
			const sa = String(va||'');
			const sb = String(vb||'');
			return asc ? sa.localeCompare(sb) : sb.localeCompare(sa);
		});
		for (const r of sorted) {
			tbody.appendChild(h('tr', {}, h('td', {}, r.name), h('td', {}, r.count), h('td', {}, money(r.sum)), h('td', {}, fmtDate(r.last_date))));
		}
	}
	renderBody();
	return tbl;
}

function showToast(message) {
	let container = document.getElementById('toast-container');
	if (!container) {
		container = h('div', { id:'toast-container', class:'toast-container' });
		document.body.appendChild(container);
	}
	const el = h('div', { class:'toast' }, message);
	container.appendChild(el);
	setTimeout(() => { el.remove(); }, 2000);
}

function modal(titleText) {
	const overlay = h('div', { style:'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:50' });
	const box = h('div', { class:'card', style:'width:min(720px,95vw);max-height:90vh;overflow:auto' });
	const title = h('div', { style:'font-weight:800;margin-bottom:8px' }, titleText);
	const body = h('div', {});
	const footer = h('div', { style:'margin-top:10px;display:flex;gap:8px;justify-content:flex-end' }, h('button', { class:'button', onclick: () => close() }, 'Schließen'));
	box.append(title, body, footer);
	document.body.appendChild(overlay);
	overlay.appendChild(box);
	function close(){ overlay.remove(); }
	return { body, footer, close, title };
}

function showImportModal() {
	const wrap = modal('Import Data');
	let text='';
	const textarea = h('textarea', { style:'width:100%;min-height:280px', placeholder:'Datum;Gutschein;Name;Objekt', oninput:e=>text=e.target.value });
	wrap.body.append(
		h('div', { class:'label' }, 'CSV einfügen (Semikolon-getrennt): Datum; Gutschein; Name; Objekt'),
		textarea
	);
	wrap.footer.append(h('button', { class:'button primary', onclick: async () => {
		if (!text.trim()) { alert('Bitte CSV einfügen'); return; }
		try {
			const res = await api('/api/vouchers/import', { method:'POST', body: JSON.stringify({ csv: text }) });
			alert(`Import fertig: ${res.created} erstellt, ${res.skipped} übersprungen, ${res.used_marked} verwendet markiert`);
			wrap.close();
			await refreshData();
		} catch (e) {
			alert(e.message);
		}
	} }, 'Speichern'));
}

bootstrap().catch(err => { console.error(err); });