/* Still Waters · Daily Prayer — application logic.
   No dependencies, no network. All personal data stays in localStorage. */
(function () {
  'use strict';

  var DATA = window.PRAYER_DATA || { devotions: [], classics: [], guided: null };

  var LORDS_PRAYER =
    'Our Father, who art in heaven,\nhallowed be thy name.\n' +
    'Thy kingdom come, thy will be done,\non earth as it is in heaven.\n' +
    'Give us this day our daily bread,\nand forgive us our trespasses,\n' +
    'as we forgive those who trespass against us.\n' +
    'And lead us not into temptation,\nbut deliver us from evil.\n' +
    'For thine is the kingdom, and the power,\nand the glory, forever. Amen.';

  /* ---------- storage ---------- */
  var K = {
    settings: 'sw.settings',
    completions: 'sw.completions',
    intentions: 'sw.intentions',
    journal: 'sw.journal'
  };

  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- date helpers ---------- */
  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return toISO(new Date()); }
  function daypart() {
    var h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'midday' : 'evening';
  }
  function prettyToday() {
    return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function prettyISO(iso) {
    var p = iso.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* Small deterministic PRNG seeded from a string, so the guided
     prayer picks the same prompts all day but varies day to day. */
  function seededRng(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  function pickWith(rng, arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(rng() * arr.length)];
  }

  function devotionForToday() {
    var list = DATA.devotions || [];
    if (!list.length) return null;
    var day = new Date().getDate();
    for (var i = 0; i < list.length; i++) if (list[i].day === day) return list[i];
    return list[(day - 1) % list.length];
  }

  /* ---------- tiny DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      t.textContent = '';
    }, 2200);
  }

  function copyText(text, doneMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length); // iOS Safari: select() alone is unreliable
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      toast(ok ? doneMsg : 'Copy failed');
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(doneMsg); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- sharing ---------- */
  /* URL share intents only — no SDKs, no trackers, nothing loaded from the
     platforms. The text itself is what gets shared. */
  var SHARE_ICONS = {
    device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.9l7.6-4.3M8.2 13.1l7.6 4.3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h3.6l4.7 6.2L17.6 4H20l-6.5 7.6L20.5 20h-3.6l-5-6.6L6.2 20H3.8l7-8.1z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.4 20.5v-6.1h2.4l.4-2.9h-2.8V9.6c0-.9.3-1.5 1.6-1.5h1.3V5.5c-.3 0-1.1-.1-2-.1-2.1 0-3.5 1.3-3.5 3.6v2.5H8.5v2.9h2.3v6.1z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M9.2 8.4c-.3-.7.1-1.2.7-1.5l.9 1.7-.7.8c.5 1.4 1.8 2.7 3.2 3.2l.8-.7 1.7.9c-.3.6-.8 1-1.5.7-2.3-.8-4.3-2.8-5.1-5.1z" fill="currentColor" stroke="none"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
    threads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/></svg>',
    reddit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="14" r="6.5"/><circle cx="9.5" cy="13.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13.5" r="0.8" fill="currentColor" stroke="none"/><path d="M9.5 16.7c1.7 1 3.3 1 5 0M12 7.5l1.2-3.6 3 1"/><circle cx="16.9" cy="5.4" r="1"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3 8 9 6 9-6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'
  };

  function truncateForPost(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }

  function shareTargets(title, text) {
    var pageUrl = window.location.href.split('#')[0];
    return [
      { name: 'X', icon: 'x', href: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(truncateForPost(text, 260)) },
      { name: 'Facebook', icon: 'facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl) + '&quote=' + encodeURIComponent(text) },
      { name: 'WhatsApp', icon: 'whatsapp', href: 'https://wa.me/?text=' + encodeURIComponent(text) },
      { name: 'Telegram', icon: 'telegram', href: 'https://t.me/share/url?url=' + encodeURIComponent(pageUrl) + '&text=' + encodeURIComponent(text) },
      { name: 'Threads', icon: 'threads', href: 'https://www.threads.net/intent/post?text=' + encodeURIComponent(text) },
      { name: 'Reddit', icon: 'reddit', href: 'https://www.reddit.com/submit?title=' + encodeURIComponent(title) + '&text=' + encodeURIComponent(text) },
      { name: 'Email', icon: 'email', href: 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(text), sameTab: true }
    ];
  }

  function closeShare() {
    var dlg = $('shareDialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function openShare(title, text) {
    var dlg = $('shareDialog');
    $('sharePreview').textContent = text.length > 160 ? text.slice(0, 160) + '…' : text;
    var grid = $('shareGrid');
    grid.textContent = '';

    if (navigator.share) {
      var native = el('button', 'share-btn share-native');
      native.type = 'button';
      native.innerHTML = SHARE_ICONS.device; // static markup, no user data
      native.appendChild(el('span', null, 'Share…'));
      native.addEventListener('click', function () {
        closeShare();
        navigator.share({ title: title, text: text }).catch(function () { /* user cancelled */ });
      });
      grid.appendChild(native);
    }

    shareTargets(title, text).forEach(function (t) {
      var a = el('a', 'share-btn');
      a.href = t.href;
      if (!t.sameTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      a.innerHTML = SHARE_ICONS[t.icon]; // static markup, no user data
      a.appendChild(el('span', null, t.name));
      a.addEventListener('click', closeShare);
      grid.appendChild(a);
    });

    var copyBtn = el('button', 'share-btn');
    copyBtn.type = 'button';
    copyBtn.innerHTML = SHARE_ICONS.copy; // static markup, no user data
    copyBtn.appendChild(el('span', null, 'Copy text'));
    copyBtn.addEventListener('click', function () {
      closeShare();
      copyText(text, 'Copied');
    });
    grid.appendChild(copyBtn);

    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  /* ---------- settings ---------- */
  var settings = Object.assign({ theme: 'auto', fontsize: 'md' }, store.get(K.settings, {}));
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function applySettings() {
    var resolved = settings.theme === 'auto'
      ? (darkQuery && darkQuery.matches ? 'dark' : 'light')
      : settings.theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.fontsize = settings.fontsize;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#14161c' : '#f6f2e9');
  }
  function saveSettings() {
    store.set(K.settings, settings);
    applySettings();
  }
  if (darkQuery && darkQuery.addEventListener) {
    darkQuery.addEventListener('change', function () {
      if (settings.theme === 'auto') applySettings();
    });
  }

  /* ---------- streak ---------- */
  function completionDates() { return store.get(K.completions, []); }
  function streakCount() {
    var set = {};
    var dates = completionDates();
    for (var i = 0; i < dates.length; i++) set[dates[i]] = true;
    var d = new Date();
    if (!set[toISO(d)]) d.setDate(d.getDate() - 1); // a streak survives until today is missed
    var count = 0;
    while (set[toISO(d)]) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }
  function renderStreak() {
    var n = streakCount();
    $('streakCount').textContent = String(n);
    $('streakLabel').textContent = n === 1 ? ' day prayer streak' : ' days prayer streak';
    $('streakBadge').title = n === 1
      ? '1 day of prayer in a row'
      : n + ' days of prayer in a row';
  }
  function markPrayed(iso) {
    var dates = completionDates();
    var t = iso || todayISO();
    if (dates.indexOf(t) === -1) {
      dates.push(t);
      if (!store.set(K.completions, dates)) {
        toast('Couldn’t save — storage is full or blocked');
      }
    }
    renderStreak();
  }

  /* ---------- navigation ---------- */
  var VIEWS = ['today', 'pray', 'library', 'journal'];
  function showView(name) {
    VIEWS.forEach(function (v) { $('view-' + v).hidden = (v !== name); });
    document.querySelectorAll('.tab').forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.view === name ? 'page' : 'false');
    });
    window.scrollTo(0, 0);
  }

  /* ---------- Today view ---------- */
  var showingMorning = daypart() !== 'evening';

  function renderDailyPrayer(dev) {
    $('segMorning').setAttribute('aria-pressed', String(showingMorning));
    $('segEvening').setAttribute('aria-pressed', String(!showingMorning));
    $('dailyPrayerText').textContent = showingMorning ? dev.morningPrayer : dev.eveningPrayer;
  }

  function renderToday() {
    var part = daypart();
    $('greeting').textContent =
      part === 'morning' ? 'Good morning' : part === 'midday' ? 'Good afternoon' : 'Good evening';
    $('todayDate').textContent = prettyToday();

    var dev = devotionForToday();
    if (!dev) {
      $('dataNotice').hidden = false;
      $('verseCard').hidden = true;
      $('prayerCard').hidden = true;
      document.querySelector('.reflect-card').hidden = true;
      return;
    }
    $('verseTheme').textContent = dev.theme;
    $('verseText').textContent = dev.verseText;
    $('verseRef').textContent = dev.verseRef + ' (WEB)';
    $('reflectionText').textContent = dev.reflection;
    renderDailyPrayer(dev);
  }

  /* ---------- guided prayer session ---------- */
  var session = null; // { steps: [], index: 0, completed: false }

  function buildSteps() {
    var dev = devotionForToday();
    var g = DATA.guided;
    var rng = seededRng('sw-' + todayISO() + '-' + daypart());
    var steps = [];

    steps.push({
      type: 'still',
      title: 'Be still',
      body: 'Settle into quiet. Breathe slowly with the circle, and let go of what you were carrying.',
      note: '“Be still, and know that I am God.” — Psalm 46:10 (WEB)'
    });

    if (g && g.openings) {
      var opening = pickWith(rng, g.openings[daypart()]);
      if (opening) steps.push({ type: 'reading', kicker: 'Opening', title: 'Come to him', body: opening });
    }

    if (dev) {
      steps.push({
        type: 'reading', kicker: 'Today’s word · ' + dev.theme, title: 'Hear the scriptures',
        body: dev.verseText, ref: dev.verseRef + ' (WEB)'
      });
    }

    if (g && g.acts) {
      steps.push({ type: 'reading', kicker: 'Adoration', title: 'Praise him for who he is', body: pickWith(rng, g.acts.adoration) || '' });
      steps.push({
        type: 'reading', kicker: 'Confession', title: 'Bring what weighs on you',
        body: pickWith(rng, g.acts.confession) || '',
        note: '“If we confess our sins, he is faithful and righteous to forgive us the sins, and to cleanse us from all unrighteousness.” — 1 John 1:9 (WEB)'
      });
      steps.push({ type: 'reading', kicker: 'Thanksgiving', title: 'Give thanks', body: pickWith(rng, g.acts.thanksgiving) || '' });
      steps.push({
        type: 'intercession', kicker: 'Supplication', title: 'Pray for others, and for yourself',
        body: pickWith(rng, g.acts.supplication) || ''
      });
    }

    steps.push({ type: 'reading', kicker: 'As Jesus taught us', title: 'The Lord’s Prayer', body: LORDS_PRAYER });

    if (g && g.blessings && g.blessings.length) {
      var b = pickWith(rng, g.blessings);
      var bref = b.ref.indexOf('(WEB)') === -1 ? b.ref + ' (WEB)' : b.ref;
      steps.push({ type: 'reading', kicker: 'Blessing', title: 'Go in peace', body: b.text, ref: bref });
    }

    steps.push({
      type: 'done', title: 'Amen',
      body: 'You have prayed today. Carry this stillness with you.'
    });

    return steps;
  }

  function renderDots() {
    var ol = $('progressDots');
    ol.textContent = '';
    session.steps.forEach(function (_, i) {
      var li = el('li');
      if (i < session.index) li.className = 'done';
      if (i === session.index) li.className = 'current';
      ol.appendChild(li);
    });
  }

  function renderIntercessionExtras(card) {
    var listWrap = el('div');
    function renderList() {
      listWrap.textContent = '';
      var items = intentions().filter(function (x) { return !x.answered; });
      if (items.length) {
        var list = el('ul', 'step-list');
        items.forEach(function (x) { list.appendChild(el('li', null, x.text)); });
        listWrap.appendChild(list);
      } else {
        listWrap.appendChild(el('p', 'muted', 'Your prayer list is empty — you can add to it below, or simply pray freely.'));
      }
    }
    renderList();
    card.appendChild(listWrap);
    var row = el('div', 'step-add');
    var input = el('input');
    input.type = 'text';
    input.maxLength = 140;
    input.placeholder = 'Add someone to pray for…';
    input.setAttribute('aria-label', 'Add someone to pray for');
    var btn = el('button', 'btn btn-ghost', 'Add');
    btn.type = 'button';
    function add() {
      var text = input.value.trim();
      if (!text) return;
      addIntention(text);
      input.value = '';
      renderList(); // update the list in place; the input keeps focus and the keyboard stays up
    }
    btn.addEventListener('click', add);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    row.appendChild(input);
    row.appendChild(btn);
    card.appendChild(row);
  }

  function renderStep() {
    var step = session.steps[session.index];
    var card = $('stepCard');
    card.textContent = '';

    card.appendChild(el('p', 'visually-hidden', 'Step ' + (session.index + 1) + ' of ' + session.steps.length));
    if (step.kicker) card.appendChild(el('p', 'step-kicker', step.kicker));
    card.appendChild(el('h3', 'step-title', step.title));
    if (step.type === 'still') {
      var circle = el('div', 'breath-circle');
      circle.setAttribute('aria-hidden', 'true');
      card.appendChild(circle);
    }
    if (step.body) card.appendChild(el('p', 'step-body', step.body));
    if (step.ref) card.appendChild(el('p', 'step-ref', step.ref));
    if (step.note) card.appendChild(el('p', 'step-note', step.note));
    if (step.type === 'intercession') renderIntercessionExtras(card);

    if (step.type === 'done') {
      if (!session.completed) {
        session.completed = true;
        markPrayed(session.startDate); // credit the day the session began, even across midnight
      }
      var n = streakCount();
      card.appendChild(el('p', 'muted', n > 1 ? n + ' days of prayer in a row.' : 'Come back tomorrow — a rhythm is beginning.'));
    }

    $('stepBackBtn').disabled = session.index === 0;
    $('stepNextBtn').textContent =
      step.type === 'done' ? 'Return to Today'
        : session.index === session.steps.length - 2 ? 'Finish'
          : 'Continue';

    renderDots();
    // restart the entrance animation, then move focus for screen readers
    card.style.animation = 'none';
    void card.offsetHeight;
    card.style.animation = '';
    card.focus({ preventScroll: true });
  }

  function startSession() {
    session = { steps: buildSteps(), index: 0, completed: false, startDate: todayISO() };
    $('prayIntro').hidden = true;
    $('praySession').hidden = false;
    renderStep();
  }

  function endSession(skipFocus) {
    session = null;
    $('praySession').hidden = true;
    $('prayIntro').hidden = false;
    // hiding the container drops focus to <body>; give it a sensible home
    if (!skipFocus) $('startSessionBtn').focus();
  }

  function stepNext() {
    if (!session) return;
    if (session.steps[session.index].type === 'done') {
      endSession(true);
      showView('today');
      renderToday();
      var g = $('greeting');
      g.setAttribute('tabindex', '-1');
      g.focus();
      return;
    }
    session.index++;
    renderStep();
  }

  function stepBack() {
    if (!session || session.index === 0) return;
    session.index--;
    renderStep();
  }

  /* ---------- library ---------- */
  var CATEGORY_LABELS = {
    all: 'All',
    essentials: 'Essentials',
    morning: 'Morning',
    evening: 'Evening',
    psalms: 'Psalms',
    blessings: 'Blessings'
  };
  var activeCategory = 'all';

  function renderLibraryChips() {
    var wrap = $('libraryChips');
    wrap.textContent = '';
    var present = { all: true };
    (DATA.classics || []).forEach(function (p) { present[p.category] = true; });
    Object.keys(CATEGORY_LABELS).forEach(function (cat) {
      if (!present[cat]) return;
      var chip = el('button', 'chip', CATEGORY_LABELS[cat]);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(cat === activeCategory));
      chip.addEventListener('click', function () {
        activeCategory = cat;
        renderLibraryChips();
        renderLibraryList();
        // re-rendering destroyed the clicked chip; keep keyboard focus in the group
        var active = $('libraryChips').querySelector('[aria-pressed="true"]');
        if (active) active.focus();
      });
      wrap.appendChild(chip);
    });
  }

  function renderLibraryList() {
    var wrap = $('libraryList');
    wrap.textContent = '';
    var items = (DATA.classics || []).filter(function (p) {
      return activeCategory === 'all' || p.category === activeCategory;
    });
    if (!items.length) {
      wrap.appendChild(el('p', 'muted', 'No prayers to show.'));
      return;
    }
    items.forEach(function (p) {
      var details = el('details', 'card library-item');
      var summary = el('summary');
      summary.appendChild(el('span', 'li-title', p.title));
      summary.appendChild(el('span', 'li-source', p.source));
      details.appendChild(summary);

      var body = el('div', 'library-body');
      body.appendChild(el('p', 'prayer-text', p.text));
      var actions = el('div', 'foot-actions');
      var copyBtn = el('button', 'ghost-btn', 'Copy prayer');
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', function () {
        copyText(p.title + '\n\n' + p.text, 'Prayer copied');
      });
      var shareBtn = el('button', 'ghost-btn', 'Share');
      shareBtn.type = 'button';
      shareBtn.addEventListener('click', function () {
        openShare(p.title, p.text + '\n\n— ' + p.title);
      });
      actions.appendChild(copyBtn);
      actions.appendChild(shareBtn);
      body.appendChild(actions);
      details.appendChild(body);
      wrap.appendChild(details);
    });
  }

  /* ---------- prayer list (intentions) ---------- */
  function intentions() { return store.get(K.intentions, []); }
  function setIntentions(list) {
    if (!store.set(K.intentions, list)) toast('Couldn’t save — storage is full or blocked');
  }

  /* after a list re-render destroys the focused button, land focus on the
     same-position button in the rebuilt list (or a sensible fallback) */
  function focusListButton(ul, index, fallback) {
    var lis = ul.querySelectorAll('li');
    if (lis.length) {
      var li = lis[Math.min(index, lis.length - 1)];
      var btn = li.querySelector('button');
      if (btn) { btn.focus(); return; }
    }
    if (fallback) fallback.focus();
  }

  function addIntention(text) {
    var list = intentions();
    list.unshift({ id: 'i' + Date.now() + Math.floor(Math.random() * 1e4), text: text, created: todayISO(), answered: null });
    setIntentions(list);
    renderIntentions();
  }

  function renderIntentions() {
    var list = intentions();
    var praying = list.filter(function (x) { return !x.answered; });
    var answered = list.filter(function (x) { return x.answered; });

    var ul = $('prayingList');
    ul.textContent = '';
    $('prayingEmpty').hidden = praying.length > 0;
    praying.forEach(function (item, idx) {
      var li = el('li');
      li.appendChild(el('span', 'item-text', item.text));
      li.appendChild(el('span', 'item-date', prettyISO(item.created)));
      var done = el('button', 'tiny-btn', 'Answered');
      done.type = 'button';
      done.title = 'Mark as answered';
      done.addEventListener('click', function () {
        item.answered = todayISO();
        setIntentions(list);
        renderIntentions();
        focusListButton($('prayingList'), idx, $('intentionInput'));
        toast('Thanks be to God');
      });
      var del = el('button', 'tiny-btn danger', 'Remove');
      del.type = 'button';
      del.addEventListener('click', function () {
        setIntentions(list.filter(function (x) { return x.id !== item.id; }));
        renderIntentions();
        focusListButton($('prayingList'), idx, $('intentionInput'));
      });
      li.appendChild(done);
      li.appendChild(del);
      ul.appendChild(li);
    });

    $('answeredWrap').hidden = answered.length === 0;
    $('answeredSummary').textContent = 'Answered prayers (' + answered.length + ')';
    var aul = $('answeredList');
    aul.textContent = '';
    answered.forEach(function (item, idx) {
      var li = el('li');
      li.appendChild(el('span', 'item-text answered', item.text));
      li.appendChild(el('span', 'item-date', 'answered ' + prettyISO(item.answered)));
      var del = el('button', 'tiny-btn danger', 'Remove');
      del.type = 'button';
      del.addEventListener('click', function () {
        setIntentions(list.filter(function (x) { return x.id !== item.id; }));
        renderIntentions();
        focusListButton($('answeredList'), idx,
          $('answeredWrap').hidden ? $('intentionInput') : $('answeredSummary'));
      });
      li.appendChild(del);
      aul.appendChild(li);
    });
  }

  /* ---------- journal ---------- */
  function journal() { return store.get(K.journal, {}); }

  /* the date the textarea was populated for — saves are keyed to this, not
     the wall clock, so text typed just before midnight lands on the right day */
  var journalDate = null;
  var warnedSaveFailure = false;
  var saveTimer = null;

  function saveJournalNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    var j = journal();
    var text = $('journalToday').value;
    var t = journalDate || todayISO();
    if (text.trim()) j[t] = text; else delete j[t];
    var ok = store.set(K.journal, j);
    $('saveState').textContent = !text.trim() ? '' : ok ? 'Saved' : 'Couldn’t save';
    if (!ok && text.trim() && !warnedSaveFailure) {
      warnedSaveFailure = true;
      toast('Couldn’t save — storage is full or blocked');
    }
    renderPastEntries();
  }

  function scheduleJournalSave() {
    $('saveState').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveJournalNow, 500);
  }

  function renderJournalToday() {
    journalDate = todayISO();
    $('journalTodayHeading').textContent = 'Today — ' + prettyToday();
    var j = journal();
    $('journalToday').value = j[journalDate] || '';
    $('saveState').textContent = j[journalDate] ? 'Saved' : '';
  }

  function renderPastEntries() {
    var wrap = $('pastEntries');
    wrap.textContent = '';
    var j = journal();
    var t = todayISO();
    var dates = Object.keys(j).filter(function (d) { return d !== t; }).sort().reverse();
    if (!dates.length) return;

    dates.forEach(function (iso) {
      var card = el('article', 'card entry-card');
      var head = el('div', 'entry-head');
      head.appendChild(el('h4', null, prettyISO(iso)));
      var del = el('button', 'tiny-btn danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!window.confirm('Delete this journal entry? This cannot be undone.')) return;
        var jj = journal();
        delete jj[iso];
        store.set(K.journal, jj);
        renderPastEntries();
      });
      head.appendChild(del);
      card.appendChild(head);
      card.appendChild(el('p', 'entry-text', j[iso]));
      wrap.appendChild(card);
    });
  }

  /* ---------- settings dialog ---------- */
  function openSettings() {
    var dlg = $('settingsDialog');
    dlg.querySelectorAll('input[name="theme"]').forEach(function (r) { r.checked = r.value === settings.theme; });
    dlg.querySelectorAll('input[name="fontsize"]').forEach(function (r) { r.checked = r.value === settings.fontsize; });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeSettings() {
    var dlg = $('settingsDialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function exportData() {
    var payload = {
      exportedAt: new Date().toISOString(),
      app: 'Still Waters',
      settings: settings,
      completions: completionDates(),
      intentions: intentions(),
      journal: journal()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'still-waters-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    closeSettings(); // the open modal's backdrop would otherwise cover the toast
    toast('Data exported');
  }

  function clearAllData() {
    if (!window.confirm('Clear your journal, prayer list, streak, and settings from this device? This cannot be undone.')) return;
    Object.keys(K).forEach(function (k) { store.remove(K[k]); });
    settings = { theme: 'auto', fontsize: 'md' };
    applySettings();
    renderStreak();
    renderIntentions();
    renderJournalToday();
    renderPastEntries();
    closeSettings();
    toast('All data cleared');
  }

  /* ---------- wiring ---------- */
  function wire() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.dataset.view); });
    });

    $('segMorning').addEventListener('click', function () {
      showingMorning = true;
      var dev = devotionForToday();
      if (dev) renderDailyPrayer(dev);
    });
    $('segEvening').addEventListener('click', function () {
      showingMorning = false;
      var dev = devotionForToday();
      if (dev) renderDailyPrayer(dev);
    });

    $('copyVerseBtn').addEventListener('click', function () {
      var dev = devotionForToday();
      if (dev) copyText('“' + dev.verseText + '” — ' + dev.verseRef + ' (WEB)', 'Verse copied');
    });

    $('shareVerseBtn').addEventListener('click', function () {
      var dev = devotionForToday();
      if (dev) openShare('Verse of the day — ' + dev.verseRef, '“' + dev.verseText + '” — ' + dev.verseRef + ' (WEB)');
    });
    $('copyDailyPrayerBtn').addEventListener('click', function () {
      var dev = devotionForToday();
      if (dev) copyText(showingMorning ? dev.morningPrayer : dev.eveningPrayer, 'Prayer copied');
    });
    $('shareDailyPrayerBtn').addEventListener('click', function () {
      var dev = devotionForToday();
      if (dev) openShare(showingMorning ? 'A morning prayer' : 'An evening prayer',
        showingMorning ? dev.morningPrayer : dev.eveningPrayer);
    });
    $('closeShareBtn').addEventListener('click', closeShare);
    $('shareDialog').addEventListener('click', function (e) {
      var dlg = $('shareDialog');
      if (e.target !== dlg) return;
      var r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        closeShare(); // true backdrop click, not the dialog's own padding
      }
    });

    $('journalThisBtn').addEventListener('click', function () {
      var dev = devotionForToday();
      showView('journal');
      var ta = $('journalToday');
      if (dev && !ta.value.trim()) {
        ta.value = dev.reflection + '\n\n';
        scheduleJournalSave();
      }
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });

    $('beginPrayerBtn').addEventListener('click', function () {
      showView('pray');
      if (!session) startSession(); // resume an in-progress session rather than discarding it
    });
    $('startSessionBtn').addEventListener('click', startSession);
    $('exitSessionBtn').addEventListener('click', function () { endSession(); });
    $('stepNextBtn').addEventListener('click', stepNext);
    $('stepBackBtn').addEventListener('click', stepBack);

    document.addEventListener('keydown', function (e) {
      if (!session || $('view-pray').hidden || $('settingsDialog').open || $('shareDialog').open) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); stepNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepBack(); }
      if (e.key === 'Escape') endSession();
    });

    $('intentionForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('intentionInput');
      var text = input.value.trim();
      if (!text) return;
      addIntention(text);
      input.value = '';
      input.focus();
    });

    $('journalToday').addEventListener('input', scheduleJournalSave);

    $('settingsBtn').addEventListener('click', openSettings);
    $('closeSettingsBtn').addEventListener('click', closeSettings);
    $('settingsDialog').addEventListener('click', function (e) {
      var dlg = $('settingsDialog');
      if (e.target !== dlg) return;
      // e.target is the dialog for both backdrop clicks and clicks on its own
      // padding; only coordinates outside the panel mean the backdrop
      var r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        closeSettings();
      }
    });
    $('settingsDialog').addEventListener('change', function (e) {
      if (e.target.name === 'theme') { settings.theme = e.target.value; saveSettings(); }
      if (e.target.name === 'fontsize') { settings.fontsize = e.target.value; saveSettings(); }
    });
    $('exportDataBtn').addEventListener('click', exportData);
    $('clearDataBtn').addEventListener('click', clearAllData);
  }

  /* ---------- date rollover ----------
     Mobile browsers resume suspended tabs without reloading, sometimes days
     later. Re-render whatever depends on "today" whenever the app comes back. */
  function refreshForNow() {
    var t = todayISO();
    if (journalDate && t !== journalDate) {
      if (saveTimer) saveJournalNow(); // flush pending text under the old day's key
      showingMorning = daypart() !== 'evening';
      renderStreak();
      renderJournalToday();
      renderPastEntries();
    }
    renderToday(); // greeting and daypart can change within the same day too
  }

  /* ---------- init ---------- */
  applySettings();
  wire();
  if (!DATA.guided) {
    // degraded mode (data.js failed to load): don't promise steps that won't exist
    $('prayIntroLead').textContent =
      'Today’s prayer content couldn’t be loaded, so this will be a simpler time of quiet: stillness, the Lord’s Prayer, and a moment to close.';
  }
  renderToday();
  renderStreak();
  renderLibraryChips();
  renderLibraryList();
  renderIntentions();
  renderJournalToday();
  renderPastEntries();
  showView('today');

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshForNow();
  });
  window.addEventListener('pageshow', refreshForNow);
})();
