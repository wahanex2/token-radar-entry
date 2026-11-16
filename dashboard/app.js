// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the filters, the per-protocol detail
// view and the model sandbox. No network: every byte it shows is in data.js.
// The page recomputes every implied value with the same function main.ts runs,
// so the screenshots, the code and board.json carry the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;
  var state = {
    q: '', category: 'all', chain: 'all', watchlistOnly: false,
    tab: 'pre-token', sort: 'implied', dir: -1, selected: null,
    sandbox: { multiple: DATA.multiple, growthWeight: MODEL.growth_weight, active: false }
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, exactly as lib/model.ts scores it: TVL x the calibrated
  // multiple x a bounded growth multiplier x a saturating maturity multiplier.
  function impliedOf(row, multiple, growthWeight) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : Math.max(0, row.age_days);
    var maturity = MODEL.maturity_floor + MODEL.maturity_range * (1 - Math.exp(-age / MODEL.maturity_scale_days));
    return { implied: Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity)), growthMult: growthMult, maturityMult: maturity, growthPct: growth };
  }
  function shownValue(row) {
    if (!state.sandbox.active) return row.implied_value_usd;
    return impliedOf(row, state.sandbox.multiple, state.sandbox.growthWeight).implied;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: the
  // category, the chain, the TVL and the age decide the action, the capital,
  // the gas tier, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasTier(chain) {
    var c = chain.toLowerCase();
    if (c === 'ethereum' || c === 'bitcoin' || c.indexOf('tron') >= 0) return { tx: 'about $6 of gas', weekly: 'about $6 of gas a week' };
    if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near' || c === 'sei') return { tx: 'under $0.10 of gas', weekly: 'under $0.10 of gas a week' };
    return { tx: 'about $1 of gas', weekly: 'about $1 of gas a week' };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then leave the stake working.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('options') >= 0 || c.indexOf('structured') >= 0) return 'Deposit $' + capital + " into " + name + "'s main vault on " + chain + ' and let one full epoch run.';
    if (c.indexOf('launchpad') >= 0 || c.indexOf('fundraising') >= 0) return 'Stake $' + capital + ' of the required asset on ' + name + ' and join one sale allocation.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow up to half the supplied value against the position on ' + name + ', then repay it within the same week.';
    if (c.indexOf('dex') >= 0) return "Route one swap a week through " + name + "'s own router on " + chain + ' instead of an aggregator.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return "Restake or compound the vault's rewards back into the same " + name + ' position once a month.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close and reopen the hedge once a month so the position shows fresh activity on ' + name + '.';
    if (c.indexOf('prediction') >= 0) return 'Settle or roll the position on ' + name + ' before each market resolves, and open the next one the same day.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Top the position up by $' + Math.max(10, Math.round(capital / 5)) + ' once a month so deposits span several snapshots.';
    return "Use " + name + "'s own app for one extra action a week, such as a swap, a vote or a claim, on " + chain + '.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasTier(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline, never in a screenshot or a chat.', cost: 'nothing to create the wallet', time: '5 minutes' },
      { text: 'Bridge or buy $' + capital + ' of USDC on ' + chain + ", keeping a little of the chain's gas token aside for fees.", cost: gas.tx + ' plus the bridge fee, if any', time: '15 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas.tx, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: gas.weekly, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and do not empty the wallet between snapshots.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Check the protocol's own points or rewards page once a month from the link its own docs publish, and never follow a claim link from a direct message.", cost: 'no fee to check, and never pay to claim', time: '10 minutes a month' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, so you can repeat the position, prove the activity or unwind it in one pass.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = shownValue(a); bv = shownValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } renderBoard(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var shown = document.getElementById('count');
    if (shown) shown.textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: clearFilters })
      ));
    }
    var max = 1;
    list.forEach(function (r) { max = Math.max(max, shownValue(r)); });
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankLabel = state.sandbox.active ? String(i + 1) : String(r.rank);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: rankLabel }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, el('span', { class: 'dot' + (r.on_watchlist ? '' : ' early'), 'aria-hidden': 'true' }), document.createTextNode(r.name)),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.on_watchlist ? '  ·  watchlist' : '  ·  early find') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownValue(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownValue(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Rank' }),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var shown = document.getElementById('count');
    if (shown) shown.textContent = DATA.live.length + ' live-token protocols, set aside from the ranking';
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They calibrate the multiple and stay out of the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  var dialog = document.getElementById('detail');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); renderBoard(); });

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    renderBoard();
    var calc = impliedOf(row, DATA.multiple, MODEL.growth_weight);
    var steps = farmSteps(row);
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? '  ·  watchlist' : '  ·  early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + '  ·  records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this rank' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Base multiple (median live mcap / TVL)' }), el('b', { class: 'num', text: DATA.multiple.toFixed(3) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + '  →  x' + calc.growthMult.toFixed(3) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + '  →  x' + calc.maturityMult.toFixed(3) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. This page recomputes the row as ' + fmtUsd(calc.implied) + (calc.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate, not a price, and no promise a token ever issues.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function clearFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false;
    document.getElementById('q').value = '';
    document.getElementById('category').value = 'all';
    document.getElementById('chain').value = 'all';
    document.getElementById('watchlist-only').checked = false;
    writeHash(); renderBoard();
  }

  function renderBoard() {
    var board = document.getElementById('board');
    board.textContent = '';
    board.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    board.setAttribute('aria-busy', 'false');
    var whatif = document.getElementById('whatif');
    if (state.sandbox.active && state.tab === 'pre-token') {
      whatif.hidden = false;
      whatif.textContent = 'What-if view: the board is re-scored with base multiple ' + state.sandbox.multiple.toFixed(2) + ' and growth weight ' + state.sandbox.growthWeight.toFixed(2) + '. board.json keeps the calibrated model.';
    } else {
      whatif.hidden = true;
    }
    document.getElementById('tab-pre').setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
  }

  function fillStatic() {
    document.getElementById('meta-date').textContent = 'Snapshot ' + DATA.as_of;
    document.getElementById('meta-model').textContent = DATA.model_version + ' model';
    document.getElementById('meta-cover').textContent = 'Watchlist ' + DATA.watchlist_size + '/' + DATA.watchlist_size;
    document.getElementById('headline').textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
    document.getElementById('lede-text').textContent = 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The radar adds ' + DATA.early_size + ' more pre-token protocols the floor leaves out, and sets the live-token protocols aside with their market caps. Implied value is a model, not a promise.';
    var total = 0;
    DATA.rows.forEach(function (r) { total += r.implied_value_usd; });
    var facts = document.getElementById('facts');
    [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Pre-token rows ranked', String(DATA.board_size)],
      ['Total implied value', fmtUsd(total)],
      ['Calibrated multiple', DATA.multiple.toFixed(3) + 'x']
    ].forEach(function (f) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: f[0] }), el('b', { text: f[1] })));
    });
    document.getElementById('model-intro').textContent = 'One function scores every row from the snapshot figures alone. The base multiple is not typed in: it is the median market-cap-to-TVL ratio of the ' + DATA.multiple_sample + ' live-token protocols in this snapshot, CEX excluded. No protocol name is special-cased, and no row is hand-picked.';
    var formula = document.getElementById('formula');
    formula.textContent = '';
    formula.appendChild(document.createTextNode('implied = round( tvl_usd x '));
    formula.appendChild(el('b', { text: DATA.multiple.toFixed(3) }));
    formula.appendChild(document.createTextNode(' x (1 + clamp(change_7d, ' + MODEL.growth_floor + ', ' + MODEL.growth_cap + ') / 100 x ' + MODEL.growth_weight + ') x (' + MODEL.maturity_floor + ' + ' + MODEL.maturity_range + ' x (1 - exp(-age_days / ' + MODEL.maturity_scale_days + '))) )'));
    document.getElementById('model-notes').textContent = 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + MODEL.unknown_age_days + ' days. Growth is clamped so one wild week cannot crown a protocol, and maturity saturates, so a year with no token already says most of what age can say. Wrapped, staked, bridged and exchange products are excluded by the same rule the watchlist was drawn with.';
    document.getElementById('foot-text').textContent = 'Data: ' + DATA.source + '. "Records no token" means the snapshot carries no market cap, CoinGecko id or symbol for the protocol; it is not proof none exists. Farm costs are estimates for one position and move with gas prices. This page runs with no network and no tracking.';
  }

  function fillControls() {
    var categories = [];
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; if (categories.indexOf(c) < 0) categories.push(c); });
    categories.sort();
    var catSel = document.getElementById('category');
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    var chains = [];
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var chainSel = document.getElementById('chain');
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });

    var q = document.getElementById('q');
    q.value = state.q;
    q.addEventListener('input', function () { state.q = q.value; writeHash(); renderBoard(); });
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); renderBoard(); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); renderBoard(); });
    var wl = document.getElementById('watchlist-only');
    wl.checked = state.watchlistOnly;
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); renderBoard(); });
    document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; writeHash(); renderBoard(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); renderBoard(); });

    var mult = document.getElementById('mult');
    var growth = document.getElementById('growth');
    var multVal = document.getElementById('mult-val');
    var growthVal = document.getElementById('growth-val');
    mult.value = String(DATA.multiple);
    growth.value = String(MODEL.growth_weight);
    multVal.textContent = DATA.multiple.toFixed(2) + 'x';
    growthVal.textContent = MODEL.growth_weight.toFixed(2);
    function onSandbox() {
      state.sandbox.multiple = parseFloat(mult.value);
      state.sandbox.growthWeight = parseFloat(growth.value);
      state.sandbox.active = Math.abs(state.sandbox.multiple - DATA.multiple) > 0.001 || Math.abs(state.sandbox.growthWeight - MODEL.growth_weight) > 0.001;
      multVal.textContent = state.sandbox.multiple.toFixed(2) + 'x';
      growthVal.textContent = state.sandbox.growthWeight.toFixed(2);
      renderBoard();
    }
    mult.addEventListener('input', onSandbox);
    growth.addEventListener('input', onSandbox);
    document.getElementById('sandbox-reset').addEventListener('click', function () {
      mult.value = String(DATA.multiple);
      growth.value = String(MODEL.growth_weight);
      onSandbox();
    });
  }

  readHash();
  fillStatic();
  fillControls();
  renderBoard();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
