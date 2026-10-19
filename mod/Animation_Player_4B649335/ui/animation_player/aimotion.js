/**
 * aimotion.js  --  Reiter "KI-Bewegungen" des Animation Players
 *
 * Spielt die im Spiel erzeugten KI-Bewegungen (KI-Emote) ab. Das Spiel lädt
 * bis zu 30 Bewegungen aus Documents\inZOI\AIGenerated\MyAIMotions (Ordner
 * alphabetisch sortiert) in die Slots 0-29. Jeder Slot ist eine Interaktion:
 *   Self_GeneratedMotionSlot0 ... Self_GeneratedMotionSlot29
 *
 * KI-Bewegungen sind keine Montagen: motion.* sieht sie nicht, Tempo und
 * Spielpause wirken nicht auf die Bewegung (sie läuft in Echtzeit).
 *
 * Verwendete CLI-Befehle:
 *   interaction.execute { entity_id, interaction_bag_id, target_entity_id, insert_front }
 *   interaction.get_current { entity_id } -> { playing, interaction_bag_id, state }
 *   interaction.cancel  { entity_id }
 *   entity.get_possessed {}               -> entity_id des gesteuerten Zois
 *
 * Titel und Längen: saved/ai_motions.cfg (JSON-Array, erzeugt von
 * "KI-Bewegungen_einlesen.bat"), eigene Namen: saved/ai_names.cfg
 *   ai_motions: [{ "slot": 0, "title": "...", "frames": 557 }, ...]
 *   ai_names:   { "0": "Mein Tanz", ... }
 *
 * Benötigt window.AP aus app.js (Ziel-Zoi, Status, Texte).
 */
(function () {
    'use strict';

    var AP = window.AP;
    var I18N = window.AP_I18N;
    var t = AP.t;

    var SLOTS      = 30;
    var BAG_PREFIX = 'Self_GeneratedMotionSlot';
    var FPS        = 30;      // motion.dat-Frames pro Sekunde (gemessen: 557 Frames = 18,6 s)
    var POLL_MS    = 400;

    var listEl   = document.getElementById('ai-list');
    var countEl  = document.getElementById('ai-count');
    var loopBtn  = document.getElementById('ai-loop-btn');
    var nameEl   = document.getElementById('ai-name');
    var progFill = document.getElementById('ai-prog-fill');
    var progText = document.getElementById('ai-prog-text');

    var motions = [];         // aus ai_motions.cfg: [{ slot, title, frames }]
    var names = {};           // eigene Namen: slot -> Name
    var selected = null;      // gewählter Slot
    var loopOn = false;
    var run = null;           // { slot, zoi, startedAt, seen, timer, busy }

    function cfgLoad(key) {
        return AP.cli('uimod.cfg_load', { mod_id: wf.MOD_ID, section: AP.cfgSection, key: key })
            .then(function (res) {
                var raw = (res && typeof res === 'object' && !Array.isArray(res))
                    ? (res.value || (res.result && res.result.value) || null) : res;
                if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
                return raw;
            })
            .catch(function () { return null; });
    }

    function saveNames() {
        AP.cli('uimod.cfg_save', {
            mod_id: wf.MOD_ID, section: AP.cfgSection, key: 'ai_names', value: JSON.stringify(names)
        }).catch(function (e) { AP.setStatus(t('save_failed', AP.errText(e)), true); });
    }

    function info(slot) {
        for (var i = 0; i < motions.length; i++) { if (motions[i].slot === slot) return motions[i]; }
        return null;
    }

    function lengthOf(slot) {
        var m = info(slot);
        return (m && m.frames > 0) ? m.frames / FPS : 0;
    }

    function labelOf(slot) {
        if (names[slot]) return names[slot];
        var m = info(slot);
        return (m && m.title) ? m.title : t('ai_slot', slot + 1);
    }

    function fmt(s) {
        if (s >= 60) {
            var m = Math.floor(s / 60), r = Math.round(s - m * 60);
            return m + ':' + (r < 10 ? '0' : '') + r;
        }
        return s.toFixed(1) + ' s';
    }

    // ------------------------------------------------------------------
    // Liste
    // ------------------------------------------------------------------
    // Mit ai_motions.cfg nur belegte Slots, sonst alle 30 (Belegung unbekannt).
    function shownSlots() {
        if (motions.length) return motions.map(function (m) { return m.slot; });
        var all = [];
        for (var i = 0; i < SLOTS; i++) all.push(i);
        return all;
    }

    function render() {
        var slots = shownSlots();
        countEl.textContent = motions.length ? t('ai_count', motions.length, SLOTS) : t('ai_count_unknown');
        countEl.title = motions.length ? t('ai_count_tip') : t('ai_read_tip');
        listEl.innerHTML = '';
        var frag = document.createDocumentFragment();
        slots.forEach(function (slot) {
            var it = document.createElement('div');
            it.className = 'item' + (slot === selected ? ' selected' : '');
            it.title = BAG_PREFIX + slot;
            var nr = document.createElement('span');
            nr.className = 'nr';
            nr.textContent = (slot + 1) + '.';
            it.appendChild(nr);
            var name = document.createElement('span');
            name.className = 'name';
            name.textContent = labelOf(slot);
            it.appendChild(name);
            var dur = document.createElement('span');
            dur.className = 'dur';
            dur.textContent = lengthOf(slot) ? fmt(lengthOf(slot)) : '';
            it.appendChild(dur);
            it.addEventListener('click', function () {
                if (selected === slot) { play(slot); return; }   // zweiter Klick = abspielen
                var prev = listEl.querySelector('.item.selected');
                if (prev) prev.className = 'item';
                it.className = 'item selected';
                selected = slot;
                nameEl.value = names[slot] || '';
            });
            frag.appendChild(it);
        });
        listEl.appendChild(frag);
    }

    function load() {
        Promise.all([cfgLoad('ai_motions'), cfgLoad('ai_names')]).then(function (r) {
            motions = [];
            if (Array.isArray(r[0])) {
                r[0].forEach(function (m) {
                    var slot = m && parseInt(m.slot, 10);
                    if (isNaN(slot) || slot < 0 || slot >= SLOTS) return;
                    motions.push({ slot: slot, title: String(m.title || ''), frames: Number(m.frames) || 0 });
                });
                motions.sort(function (a, b) { return a.slot - b.slot; });
            }
            names = (r[1] && typeof r[1] === 'object' && !Array.isArray(r[1])) ? r[1] : {};
            render();
        });
    }

    // ------------------------------------------------------------------
    // Abspielen / Loop / Stopp
    // ------------------------------------------------------------------
    // Interaktionen brauchen eine echte entity_id als Ziel (auch beim eigenen Zoi).
    function resolveZoi() {
        var id = AP.getTarget();
        if (id !== null) return Promise.resolve(id);
        return AP.cli('entity.get_possessed', {}).then(function (res) {
            var r = AP.unwrap(res);
            if (r && typeof r === 'object' && r.entity_id !== undefined) return r.entity_id;
            var m = String(typeof r === 'string' ? r : JSON.stringify(r)).match(/\d+/);
            if (!m) throw { message: t('ai_no_zoi') };
            return m[0];
        });
    }

    function execSlot(slot, zoi) {
        return AP.cli('interaction.execute', {
            entity_id: zoi, target_entity_id: zoi,
            interaction_bag_id: BAG_PREFIX + slot, insert_front: true
        });
    }

    function stopWatch() {
        if (run && run.timer) clearInterval(run.timer);
        run = null;
    }

    function progReset() {
        progFill.style.width = '0%';
        progText.textContent = '--';
    }

    function startWatch(slot, zoi) {
        stopWatch();
        run = { slot: slot, zoi: zoi, startedAt: Date.now(), seen: false, timer: null, busy: false };
        var r = run;
        r.timer = setInterval(function () { tick(r); }, POLL_MS);
    }

    // Fortschritt nach Echtzeit (die Bewegung läuft unabhängig vom Spieltempo),
    // Ende = Interaktion nicht mehr aktiv.
    function tick(r) {
        if (run !== r) return;
        var elapsed = (Date.now() - r.startedAt) / 1000;
        var len = lengthOf(r.slot);
        if (len > 0) {
            var e = Math.min(elapsed, len);
            progFill.style.width = (e / len * 100).toFixed(1) + '%';
            progText.textContent = e.toFixed(1) + ' / ' + len.toFixed(1) + ' s';
        } else {
            progText.textContent = elapsed.toFixed(1) + ' s';
        }
        if (r.busy || elapsed < 0.8) return;
        r.busy = true;
        AP.cli('interaction.get_current', { entity_id: r.zoi })
            .then(function (res) {
                if (run !== r) return;
                var cur = AP.unwrap(res) || {};
                if (cur.playing && cur.interaction_bag_id === BAG_PREFIX + r.slot) { r.seen = true; return; }
                // Nie gesehen und nach 10 s nichts: Slot vermutlich leer
                if (!r.seen && elapsed < 10) return;
                if (loopOn && r.seen) { restart(r); return; }
                progFill.style.width = '100%';
                stopWatch();
                AP.setStatus(r.seen ? t('ai_done', labelOf(r.slot)) : t('ai_empty_slot', r.slot + 1), !r.seen);
            })
            .catch(function () {})
            .then(function () { r.busy = false; });
    }

    function restart(r) {
        r.startedAt = Date.now();
        r.seen = false;
        execSlot(r.slot, r.zoi).catch(function (e) {
            AP.setStatus(t('loop_aborted', AP.errText(e)), true);
            stopWatch();
        });
    }

    function play(slot) {
        if (slot === null) { AP.setStatus(t('ai_select'), true); return; }
        stopWatch();
        progReset();
        AP.setStatus(t('playing_start', labelOf(slot)));
        var zoi;
        resolveZoi()
            .then(function (id) {
                zoi = id;
                // Laufende Interaktion (z.B. vorige KI-Bewegung) beenden, sonst wartet die neue
                return AP.cli('interaction.cancel', { entity_id: zoi }).catch(function () {});
            })
            .then(function () { return execSlot(slot, zoi); })
            .then(function () {
                startWatch(slot, zoi);
                AP.setStatus(t(loopOn ? 'playing_loop' : 'playing', labelOf(slot)));
            })
            .catch(function (e) { AP.setStatus(t('error', AP.errText(e)), true); });
    }

    function stop() {
        var r = run;
        stopWatch();
        progReset();
        var p = r ? Promise.resolve(r.zoi) : resolveZoi();
        p.then(function (zoi) { return AP.cli('interaction.cancel', { entity_id: zoi }); })
            .then(function () { AP.setStatus(t('stopped')); })
            .catch(function (e) { AP.setStatus(t('stop_failed', AP.errText(e)), true); });
    }

    function setLoop(on) {
        loopOn = !!on;
        loopBtn.textContent = t(loopOn ? 'loop_on' : 'loop_off');
        loopBtn.className = 'btn loop' + (loopOn ? ' on' : '');
        wf.state.aiLoop = loopOn;
    }

    loopBtn.addEventListener('click', function () {
        setLoop(!loopOn);
        AP.setStatus(t(loopOn ? 'loop_info_on' : 'loop_info_off'));
    });
    document.getElementById('ai-play-btn').addEventListener('click', function () { play(selected); });
    document.getElementById('ai-stop-btn').addEventListener('click', stop);
    document.getElementById('ai-reload-btn').addEventListener('click', function () {
        load();
        AP.setStatus(t('ai_reloaded'));
    });

    // Umbenennen: leerer Name = Titel aus ai_motions.cfg bzw. "Slot N"
    function rename() {
        if (selected === null) { AP.setStatus(t('ai_select'), true); return; }
        var v = (nameEl.value || '').trim();
        if (v) names[selected] = v; else delete names[selected];
        saveNames();
        render();
        AP.setStatus(t('ai_renamed', selected + 1, labelOf(selected)));
    }
    document.getElementById('ai-rename-btn').addEventListener('click', rename);
    nameEl.addEventListener('keydown', function (e) {
        e.stopPropagation();   // Tastatureingaben nicht ans Spiel weiterreichen
        if (e.key === 'Enter' || e.keyCode === 13) rename();
    });

    // Ziel gewechselt: laufende Wiederholung gehört zum alten Zoi
    AP.onTarget(function () { stopWatch(); progReset(); });
    AP.onTab(function (name) { if (name === 'ai' && !listEl.querySelector('.item')) load(); });
    I18N.onChange(function () { setLoop(loopOn); render(); });

    var prevStateLoaded = window._onStateLoaded;
    window._onStateLoaded = function (s) {
        if (prevStateLoaded) prevStateLoaded(s);
        if (s && typeof s.aiLoop === 'boolean') setLoop(s.aiLoop);
    };

    setLoop(false);
    load();
})();
