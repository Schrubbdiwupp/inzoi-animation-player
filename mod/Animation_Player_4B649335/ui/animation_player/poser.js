/**
 * poser.js  --  Pose-Editor des Animation Players
 *
 * Verbiegt einzelne Knochen des Ziel-Zois über die (experimentellen)
 * pose.*-Befehle. Die Überschreibungen liegen als Schicht über der laufenden
 * Animation und wirken auch bei angehaltener Spielzeit ("Einfrieren").
 *
 * Verwendete CLI-Befehle:
 *   pose.list_bones {}                       -> { component, bones:[name] }
 *   pose.set_bone   { bone, mode, rot_pitch, rot_yaw, rot_roll }
 *   pose.get        {}                       -> { bones:[{ bone, rotate:{pitch,yaw,roll}, rotate_mode }] }
 *   pose.clear      { bone? }                -> ohne bone: alle Knochen
 *
 * Gespeicherte Posen: saved/poses.cfg
 *   { "Name": { "mode": "additive", "bones": { "Head": [pitch, yaw, roll], ... } } }
 *
 * Benötigt window.AP aus app.js (Ziel-Zoi, Status, Texte).
 */
(function () {
    'use strict';

    var AP = window.AP;
    var I18N = window.AP_I18N;
    var t = AP.t;

    var AXES = [
        { key: 'pitch', param: 'rot_pitch', label: 'Pitch' },
        { key: 'yaw',   param: 'rot_yaw',   label: 'Yaw' },
        { key: 'roll',  param: 'rot_roll',  label: 'Roll' }
    ];
    var ROT_MAX  = 180;
    var NUDGE    = 5;      // Grad pro Klick auf - / +
    var SEND_MS  = 70;     // höchstens alle 70 ms an das Spiel senden

    // Mitgelieferte Beispiel-Posen (Sprach-Schlüssel -> Pose). Sie erscheinen,
    // solange keine eigene Pose mit gleichem Namen gespeichert ist. Modus "additive".
    var EXAMPLE_POSES = {
        ex_tilt: { mode: 'additive', bones: { Head: [0, 0, 20], neck_01: [0, 0, 8] } },
        ex_down: { mode: 'additive', bones: { Head: [0, 35, 0], spine_05: [0, 10, 0] } },
        ex_back: { mode: 'additive', bones: { spine_02: [0, -12, 0], spine_03: [0, -10, 0], Head: [0, 15, 0] } }
    };

    var searchEl  = document.getElementById('bone-search');
    var groupsEl  = document.getElementById('bone-groups');
    var listEl    = document.getElementById('bone-list');
    var nameEl    = document.getElementById('bone-name');
    var axesEl    = document.getElementById('axes');
    var modeAdd   = document.getElementById('mode-add');
    var modeRep   = document.getElementById('mode-rep');
    var poseName  = document.getElementById('pose-name');
    var poseList  = document.getElementById('pose-list');

    var bones = [];           // alle Knochen des Ziels
    var bonesLoaded = false;
    var group = 'body';
    var selected = null;      // gewählter Knochen
    var mode = 'additive';    // additive | replace
    var pose = {};            // bone -> [pitch, yaw, roll] (nur geänderte Knochen)
    var saved = {};           // gespeicherte Posen

    // ------------------------------------------------------------------
    // Knochen: Gruppen und lesbare Namen
    // ------------------------------------------------------------------
    // Hilfs-/Technik-Knochen (Sockets, IK, Korrektur-Knochen) nur unter "Alle"
    var TECH_RE = /^(SOC_|IK_|ik_|VB |LookAt)|socket|twist|corrective|_in_|_out_|_fwd_|_bck_|bulge|_half|_dip|_side_|_inn|_outer|_inner|weapon|catch|stomach/i;

    var GROUPS = [
        { key: 'body',    re: /^(pelvis|spine_0\d|neck_0\d|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr]|thigh_[lr]|calf_[lr]|foot_[lr]|ball_[lr])$/ },
        { key: 'head',    re: /^(neck|head|jaw|eye)/i },
        { key: 'torso',   re: /^(pelvis|spine|clavicle)/i },
        { key: 'arms',    re: /^(upperarm|lowerarm|hand)_[lr]$/i },
        { key: 'fingers', re: /^(thumb|index|middle|ring|pinky)_(metacarpal|0\d)_[lr]$/i },
        { key: 'legs',    re: /^(thigh|calf|foot|ball|toe)/i },
        { key: 'changed', re: null },
        { key: 'all',     re: null }
    ];

    var PARTS = [
        [/^pelvis/i, 'b_pelvis'], [/^spine/i, 'b_spine'], [/^neck/i, 'b_neck'], [/^head$/i, 'b_head'],
        [/^jaw/i, 'b_jaw'], [/^eye/i, 'b_eye'], [/^clavicle/i, 'b_clavicle'], [/^upperarm/i, 'b_upperarm'],
        [/^lowerarm/i, 'b_lowerarm'], [/^hand/i, 'b_hand'], [/^thumb/i, 'b_thumb'], [/^index/i, 'b_index'],
        [/^middle/i, 'b_middle'], [/^ring/i, 'b_ring'], [/^pinky/i, 'b_pinky'], [/^thigh/i, 'b_thigh'],
        [/^calf/i, 'b_calf'], [/^foot/i, 'b_foot'], [/^(ball|toe)/i, 'b_toes'], [/^root$/i, 'b_root']
    ];

    function boneLabel(b) {
        for (var i = 0; i < PARTS.length; i++) {
            if (PARTS[i][0].test(b)) {
                var s = t(PARTS[i][1]);
                var num = b.match(/_0?(\d)(?:_[lr])?$/);
                if (num && !/^(Head)$/.test(b)) s += ' ' + num[1];
                if (/_l$/i.test(b)) s += ' ' + t('side_l');
                else if (/_r$/i.test(b)) s += ' ' + t('side_r');
                return s;
            }
        }
        return b;
    }

    function inGroup(b, g) {
        if (g.key === 'all') return true;
        if (g.key === 'changed') return pose.hasOwnProperty(b);
        if (TECH_RE.test(b)) return false;
        return g.re.test(b);
    }

    // ------------------------------------------------------------------
    // Gruppen-Knöpfe
    // ------------------------------------------------------------------
    var groupBtns = [];
    GROUPS.forEach(function (g) {
        var b = document.createElement('button');
        b.className = 'btn chip';
        b.addEventListener('click', function () { group = g.key; renderGroups(); renderBones(); });
        groupsEl.appendChild(b);
        groupBtns.push({ el: b, g: g });
    });

    function renderGroups() {
        groupBtns.forEach(function (x) {
            x.el.textContent = t('g_' + x.g.key) + (x.g.key === 'changed' ? ' (' + Object.keys(pose).length + ')' : '');
            x.el.className = 'btn chip' + (x.g.key === group ? ' active' : '');
        });
    }

    // ------------------------------------------------------------------
    // Knochen-Liste
    // ------------------------------------------------------------------
    function renderBones() {
        listEl.innerHTML = '';
        if (!bonesLoaded) {
            var w = document.createElement('div');
            w.className = 'empty';
            w.textContent = t('bone_none_loaded');
            listEl.appendChild(w);
            return;
        }
        var g = null;
        for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].key === group) g = GROUPS[i];
        var q = (searchEl.value || '').trim().toLowerCase();
        var shown = bones.filter(function (b) {
            if (q) return b.toLowerCase().indexOf(q) >= 0 || boneLabel(b).toLowerCase().indexOf(q) >= 0;
            return inGroup(b, g);
        });
        if (!shown.length) {
            var e = document.createElement('div');
            e.className = 'empty';
            e.textContent = t('bone_list_empty');
            listEl.appendChild(e);
            return;
        }
        var frag = document.createDocumentFragment();
        shown.forEach(function (b) {
            var it = document.createElement('div');
            it.className = 'item' + (b === selected ? ' selected' : '') + (pose.hasOwnProperty(b) ? ' changed' : '');
            it.title = b;
            var n = document.createElement('span');
            n.className = 'name';
            n.textContent = boneLabel(b);
            it.appendChild(n);
            if (boneLabel(b) !== b) {
                var tech = document.createElement('span');
                tech.className = 'tech';
                tech.textContent = b;
                it.appendChild(tech);
            }
            it.addEventListener('click', function () { selectBone(b); });
            frag.appendChild(it);
        });
        listEl.appendChild(frag);
    }

    function selectBone(b) {
        selected = b;
        nameEl.textContent = boneLabel(b) + (boneLabel(b) !== b ? ' (' + b + ')' : '');
        renderAxes();
        renderBones();
    }

    function loadBones() {
        bonesLoaded = false;
        renderBones();
        AP.cli('pose.list_bones', {})
            .then(function (res) {
                res = AP.unwrap(res) || {};
                var arr = Array.isArray(res) ? res : (res.bones || []);
                bones = arr.map(function (x) { return typeof x === 'string' ? x : (x && (x.name || x.bone)); })
                           .filter(function (x) { return !!x; });
                bonesLoaded = true;
                renderBones();
                AP.setStatus(t('bones_loaded', bones.length));
                return readPose();
            })
            .catch(function (e) {
                bonesLoaded = false;
                listEl.innerHTML = '';
                var d = document.createElement('div');
                d.className = 'empty';
                d.textContent = t('bones_failed', AP.errText(e));
                listEl.appendChild(d);
            });
    }

    // Vorhandene Überschreibungen aus dem Spiel übernehmen (z.B. nach Zielwechsel)
    function readPose() {
        return AP.cli('pose.get', {})
            .then(function (res) {
                res = AP.unwrap(res) || {};
                pose = {};
                (res.bones || []).forEach(function (o) {
                    if (!o || !o.bone || !o.rotate) return;
                    pose[o.bone] = [o.rotate.pitch || 0, o.rotate.yaw || 0, o.rotate.roll || 0];
                    if (o.rotate_mode === 'replace' || o.rotate_mode === 'additive') mode = o.rotate_mode;
                });
                renderMode(); renderGroups(); renderBones(); renderAxes();
            })
            .catch(function () {});
    }

    // ------------------------------------------------------------------
    // Schieberegler Pitch / Yaw / Roll
    // ------------------------------------------------------------------
    var axisUi = [];   // { fill, knob, val, idx }

    AXES.forEach(function (a, idx) {
        var row = document.createElement('div');
        row.className = 'row axis-row';
        var lab = document.createElement('span');
        lab.className = 'label';
        lab.textContent = a.label;
        var minus = document.createElement('button');
        minus.className = 'btn chip';
        minus.textContent = '-';
        var track = document.createElement('div');
        track.className = 'axis-track';
        var mid = document.createElement('div'); mid.className = 'mid';
        var fill = document.createElement('div'); fill.className = 'fill';
        var knob = document.createElement('div'); knob.className = 'knob';
        track.appendChild(mid); track.appendChild(fill); track.appendChild(knob);
        var plus = document.createElement('button');
        plus.className = 'btn chip';
        plus.textContent = '+';
        var val = document.createElement('span');
        val.className = 'val';
        var zero = document.createElement('button');
        zero.className = 'btn chip';
        zero.textContent = '0';
        row.appendChild(lab); row.appendChild(minus); row.appendChild(track);
        row.appendChild(plus); row.appendChild(val); row.appendChild(zero);
        axesEl.appendChild(row);
        axisUi.push({ fill: fill, knob: knob, val: val, idx: idx });

        function fromX(clientX) {
            var r = track.getBoundingClientRect();
            var f = r.width > 0 ? (clientX - r.left) / r.width : 0.5;
            setAxis(idx, Math.round((Math.max(0, Math.min(1, f)) * 2 - 1) * ROT_MAX));
        }
        var drag = false;
        track.addEventListener('mousedown', function (e) {
            drag = true; fromX(e.clientX); e.stopPropagation(); e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) { if (drag) fromX(e.clientX); });
        document.addEventListener('mouseup', function () { if (drag) { drag = false; flush(); } });
        minus.addEventListener('click', function () { setAxis(idx, current()[idx] - NUDGE); flush(); });
        plus.addEventListener('click', function () { setAxis(idx, current()[idx] + NUDGE); flush(); });
        zero.addEventListener('click', function () { setAxis(idx, 0); flush(); });
    });

    function current() { return (selected && pose[selected]) ? pose[selected] : [0, 0, 0]; }

    function renderAxes() {
        var v = current();
        axisUi.forEach(function (u) {
            var x = v[u.idx];
            var f = (x + ROT_MAX) / (2 * ROT_MAX);
            u.knob.style.left = (f * 100) + '%';
            u.fill.style.left = (Math.min(f, 0.5) * 100) + '%';
            u.fill.style.width = (Math.abs(f - 0.5) * 100) + '%';
            u.val.textContent = (x > 0 ? '+' : '') + x + '°';
        });
    }

    function setAxis(idx, value) {
        if (!selected) { AP.setStatus(t('bone_pick_first'), true); return; }
        value = Math.max(-ROT_MAX, Math.min(ROT_MAX, Math.round(value)));
        var v = current().slice();
        v[idx] = value;
        pose[selected] = v;
        renderAxes();
        scheduleSend();
    }

    // ------------------------------------------------------------------
    // An das Spiel senden (gedrosselt)
    // ------------------------------------------------------------------
    var sendTimer = null, sending = false, dirty = false;

    function scheduleSend() {
        dirty = true;
        if (!sendTimer) sendTimer = setTimeout(function () { sendTimer = null; flush(); }, SEND_MS);
    }

    function flush() {
        if (!dirty || !selected || sending) return;
        dirty = false;
        sending = true;
        var b = selected, v = current();
        applyBone(b, v)
            .then(function () {
                AP.setStatus(t('bone_set', boneLabel(b), v[0], v[1], v[2]));
                renderGroups();
            })
            .catch(function (e) { AP.setStatus(t('pose_failed', AP.errText(e)), true); })
            .then(function () { sending = false; if (dirty) scheduleSend(); });
    }

    function applyBone(b, v) {
        return AP.cli('pose.set_bone', { bone: b, mode: mode, rot_pitch: v[0], rot_yaw: v[1], rot_roll: v[2] });
    }

    // ------------------------------------------------------------------
    // Modus additiv / ersetzen
    // ------------------------------------------------------------------
    function renderMode() {
        modeAdd.className = 'btn chip' + (mode === 'additive' ? ' active' : '');
        modeRep.className = 'btn chip' + (mode === 'replace' ? ' active' : '');
    }

    function setMode(m) {
        if (m === mode) return;
        mode = m;
        renderMode();
        // Alle geänderten Knochen im neuen Modus neu senden
        sendAll().then(function () { AP.setStatus(t(m === 'additive' ? 'mode_add_info' : 'mode_rep_info')); });
    }
    modeAdd.addEventListener('click', function () { setMode('additive'); });
    modeRep.addEventListener('click', function () { setMode('replace'); });

    function sendAll() {
        var names = Object.keys(pose);
        var p = Promise.resolve();
        names.forEach(function (b) { p = p.then(function () { return applyBone(b, pose[b]).catch(function () {}); }); });
        return p;
    }

    // ------------------------------------------------------------------
    // Zurücksetzen
    // ------------------------------------------------------------------
    document.getElementById('bone-reset-btn').addEventListener('click', function () {
        if (!selected) { AP.setStatus(t('bone_pick_first'), true); return; }
        var b = selected;
        AP.cli('pose.clear', { bone: b })
            .then(function () {
                delete pose[b];
                renderAxes(); renderGroups(); renderBones();
                AP.setStatus(t('bone_reset_done', boneLabel(b)));
            })
            .catch(function (e) { AP.setStatus(t('pose_failed', AP.errText(e)), true); });
    });

    function clearAll() {
        return AP.cli('pose.clear', {}).then(function () {
            pose = {};
            renderAxes(); renderGroups(); renderBones();
        });
    }

    document.getElementById('pose-clear-btn').addEventListener('click', function () {
        clearAll()
            .then(function () { AP.setStatus(t('pose_cleared')); })
            .catch(function (e) { AP.setStatus(t('pose_failed', AP.errText(e)), true); });
    });

    // ------------------------------------------------------------------
    // Posen speichern / laden (saved/poses.cfg)
    // ------------------------------------------------------------------
    function savePoses() {
        return AP.cli('uimod.cfg_save', {
            mod_id: wf.MOD_ID, section: AP.cfgSection, key: 'poses', value: JSON.stringify(saved)
        });
    }

    function loadPoses() {
        AP.cli('uimod.cfg_load', { mod_id: wf.MOD_ID, section: AP.cfgSection, key: 'poses' })
            .then(function (res) {
                var raw = (res && typeof res === 'object' && !Array.isArray(res))
                    ? (res.value || (res.result && res.result.value) || null) : res;
                var obj = {};
                try { obj = (typeof raw === 'string') ? JSON.parse(raw) : (raw || {}); } catch (e) { obj = {}; }
                saved = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
                renderPoses();
            })
            .catch(function () { renderPoses(); });
    }

    function renderPoses() {
        poseList.innerHTML = '';
        var names = Object.keys(saved).sort();
        var examples = Object.keys(EXAMPLE_POSES).filter(function (k) { return !saved.hasOwnProperty(t(k)); });
        if (!names.length && !examples.length) {
            var e = document.createElement('div');
            e.className = 'empty';
            e.textContent = t('poses_empty');
            poseList.appendChild(e);
            return;
        }
        names.forEach(function (n) { poseList.appendChild(poseItem(n, saved[n], false)); });
        examples.forEach(function (k) { poseList.appendChild(poseItem(t(k), EXAMPLE_POSES[k], true)); });
    }

    function poseItem(name, data, isExample) {
        var it = document.createElement('div');
        it.className = 'item';
        it.title = t('pose_load_tip');
        var n = document.createElement('span');
        n.className = 'name';
        n.textContent = name;
        it.appendChild(n);
        var info = document.createElement('span');
        info.className = 'ex';
        info.textContent = (isExample ? t('example') + ', ' : '') + t('bone_count', Object.keys(data.bones || {}).length);
        it.appendChild(info);
        if (!isExample) {
            var del = document.createElement('span');
            del.className = 'del';
            del.textContent = 'x';
            del.title = t('pose_delete_tip');
            del.addEventListener('click', function (ev) {
                ev.stopPropagation();
                delete saved[name];
                savePoses().catch(function () {});
                renderPoses();
                AP.setStatus(t('pose_deleted', name));
            });
            it.appendChild(del);
        }
        it.addEventListener('click', function () { applyPose(name, data); });
        return it;
    }

    function applyPose(name, data) {
        AP.setStatus(t('pose_loading', name));
        clearAll()
            .then(function () {
                mode = (data.mode === 'replace') ? 'replace' : 'additive';
                renderMode();
                var b = data.bones || {};
                Object.keys(b).forEach(function (k) {
                    var v = b[k];
                    if (Array.isArray(v) && v.length >= 3) pose[k] = [+v[0] || 0, +v[1] || 0, +v[2] || 0];
                });
                return sendAll();
            })
            .then(function () {
                poseName.value = name;
                renderAxes(); renderGroups(); renderBones();
                AP.setStatus(t('pose_loaded', name, Object.keys(pose).length));
            })
            .catch(function (e) { AP.setStatus(t('pose_failed', AP.errText(e)), true); });
    }

    function saveCurrent() {
        var name = (poseName.value || '').trim();
        if (!name) { AP.setStatus(t('pose_need_name'), true); return; }
        if (!Object.keys(pose).length) { AP.setStatus(t('pose_nothing'), true); return; }
        var copy = {};
        Object.keys(pose).forEach(function (k) { copy[k] = pose[k].slice(); });
        saved[name] = { mode: mode, bones: copy };
        savePoses()
            .then(function () { renderPoses(); AP.setStatus(t('pose_saved', name)); })
            .catch(function (e) { AP.setStatus(t('save_failed', AP.errText(e)), true); });
    }

    document.getElementById('pose-save-btn').addEventListener('click', saveCurrent);
    poseName.addEventListener('keydown', function (e) {
        e.stopPropagation();   // Tastatureingaben nicht ans Spiel weiterreichen
        if (e.key === 'Enter' || e.keyCode === 13) saveCurrent();
    });
    searchEl.addEventListener('keydown', function (e) { e.stopPropagation(); });
    searchEl.addEventListener('input', function () { renderBones(); });
    document.getElementById('bone-load-btn').addEventListener('click', loadBones);

    // ------------------------------------------------------------------
    // Zielwechsel / Reiter / Sprache
    // ------------------------------------------------------------------
    AP.onTarget(function () {
        selected = null;
        pose = {};
        nameEl.textContent = t('bone_none');
        renderAxes(); renderGroups();
        if (bonesLoaded) loadBones();
    });

    AP.onTab(function (name) {
        if (name === 'pose' && !bonesLoaded) loadBones();
    });

    I18N.onChange(function () {
        renderGroups(); renderBones(); renderPoses();
        if (selected) nameEl.textContent = boneLabel(selected) + (boneLabel(selected) !== selected ? ' (' + selected + ')' : '');
    });

    renderMode();
    renderGroups();
    renderAxes();
    loadPoses();
})();
