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
		else if (k === 'value') el.value = v;
		else if (k === 'checked') el.checked = !!v;
		else el.setAttribute(k, v);
	}
	for (const c of children.flat()) {
		if (c == null) continue;
		if (typeof c === 'string') el.appendChild(document.createTextNode(c));
		else el.appendChild(c);
	}
	return el;
}

async function api(path, opts={}) {
	const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
	if (!res.ok) throw new Error((await res.json()).error || 'Fehler');
	return res.json();
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
		h('div', { class: 'title' }, 'deZents kleine Bambu-Gutschein Verwaltung ', h('small', { style:'color:#9ca3af;font-weight:400' }, '- wenn Hobbies Hobbies finanzieren')),
		state.session.authed ? h('div', {},
			h('button', { class: 'button', onclick: () => showCaptureForm() }, 'Gutschein erfassen'),
			h('button', { class: 'button alt', onclick: () => showAssignList() }, 'Gutscheine verwenden'),
			h('button', { class: 'button warn', onclick: () => showPlanManager() }, 'Gutscheine Planen'),
			h('button', { class: 'button', style:'margin-left:8px', onclick: async () => { await api('/api/logout', { method: 'POST' }); location.reload(); } }, 'Logout')
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
		h('div', { style:'margin-top:10px' }, h('button', { class:'button', onclick: async () => {
			try {
				await api('/api/change-password', { method:'POST', body: JSON.stringify({ oldPassword: oldP, newPassword: newP }) });
				state.session.mustChange = false;
				await refreshData();
			} catch (e) { alert(e.message); }
		} }, 'Passwort speichern'))
	);
}

function dashboard() {
	const wrap = h('div', {});
	// KPI grid
	if (state.kpis) {
		const g = h('div', { class:'grid' },
			kpiCard('Summe erhalten', money(state.kpis.totalReceived)),
			kpiCard('Summe verfügbar', money(state.kpis.totalAvailable)),
			kpiCard('Prognose 3 Monate', money(state.kpis.forecast.m3)),
			kpiCard('Prognose 6 Monate', money(state.kpis.forecast.m6)),
			kpiCard('Prognose 12 Monate', money(state.kpis.forecast.m12))
		);
		wrap.appendChild(g);
		// Assigned table
		wrap.appendChild(card('Verteilt an', table(['Name','Anzahl','Summe','Letztes Datum'], (state.kpis.assigned||[]).map(r => [r.name, r.count, money(r.sum), fmtDate(r.last_date)]))));
		// Objects list
		wrap.appendChild(card('Objekte (gekauft)', table(['Objekt','Anzahl'], (state.kpis.objects||[]).map(r => [r.object, r.count]))));
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
		wrap.appendChild(card('Alle Gutscheine', tableEl(rows, ['Datum','Gutscheinnummer','Tage seit letztem Gutschein'])));
	}
	return wrap;
}

function kpiCard(label, value) {
	return h('div', { class:'card kpi' }, h('div', { class:'label' }, label), h('div', { class:'value' }, value));
}

function card(title, inner) {
	return h('div', { class:'card' }, h('div', { style:'font-weight:700;margin-bottom:8px' }, title), inner);
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
	const thead = h('tr', {}, ...headers.map(hd => h('th', { style:'text-align:left;color:#9ca3af;font-weight:600' }, hd)));
	const body = rows.map(r => h('tr', {}, ...r.map(c => h('td', {}, c))));
	return h('table', { class:'table' }, thead, ...body);
}

function tableEl(rows, headers) {
	const thead = h('tr', {}, ...headers.map(hd => h('th', { style:'text-align:left;color:#9ca3af;font-weight:600' }, hd)));
	return h('table', { class:'table' }, thead, ...rows);
}

function voucherRow(v) {
	const cls = v.used ? 'row-red' : (v.in_review ? 'row-yellow' : 'row-green');
	const tr = h('tr', { class: cls, onclick: () => editVoucher(v) },
		h('td', {}, fmtDate(v.date)),
		h('td', {}, v.code),
		h('td', {}, v.days_since_previous == null ? '-' : String(v.days_since_previous))
	);
	return tr;
}

function showCaptureForm() {
	const wrap = modal('Gutschein erfassen');
	let date=today(), code='', value=40, remaining=40, shop='EU', in_review=false;
	wrap.body.append(
		formRow('Datum', h('input', { type:'date', value:date, oninput:e=>date=e.target.value })),
		formRow('Gutscheincode (20)', h('input', { maxlength:20, placeholder:'20 Stellen', oninput:e=>code=e.target.value })),
		formRow('Wert', h('input', { type:'number', value:40, oninput:e=>value=Number(e.target.value) })),
		formRow('Restwert', h('input', { type:'number', value:40, oninput:e=>remaining=Number(e.target.value) })),
		formRow('Shop', selectShop(shop, v=>shop=v)),
		formRow('In Prüfung', h('input', { type:'checkbox', checked:false, oninput:e=>in_review = e.target.checked }))
	);
	wrap.footer.append(h('button', { class:'button', onclick: async () => {
		try {
			await api('/api/vouchers', { method:'POST', body: JSON.stringify({ date, code, value, remaining, shop, in_review }) });
			wrap.close();
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
	wrap.footer.append(h('button', { class:'button', onclick: async () => {
		if (!name) { alert('Name ist Pflicht'); return; }
		try {
			await api('/api/vouchers/assign', { method:'POST', body: JSON.stringify({ ids: Array.from(state.selection), name, object, date }) });
			wrap.close();
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
	wrap.footer.append(h('button', { class:'button', onclick: async () => {
		if (!name || !value || !date) { alert('Bitte alle Pflichtfelder ausfüllen'); return; }
		await api('/api/plans', { method:'POST', body: JSON.stringify({ name, value, date }) });
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
	wrap.footer.append(h('button', { class:'button', onclick: async () => {
		try {
			await api(`/api/vouchers/${v.id}`, { method:'PUT', body: JSON.stringify({ date, code, value, remaining, shop, in_review, assigned_to, object }) });
			wrap.close();
			await refreshData();
		} catch (e) { alert(e.message); }
	} }, 'Speichern'));
}

function formRow(labelText, inputEl) { return h('div', { class:'form-row' }, h('div', {}, h('label', {}, labelText), inputEl)); }

function selectShop(selected, onChange) {
	const sel = h('select', { onchange: e=>onChange(e.target.value) }, ...SHOPS.map(s => h('option', { value:s.code, selected:selected===s.code }, `${s.flag} ${s.code}`)));
	return sel;
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

bootstrap().catch(err => { console.error(err); });