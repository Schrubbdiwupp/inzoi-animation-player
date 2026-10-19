/**
 * app.js  --  animation_player_loop (unsichtbar, immer an)
 *
 * Hält die Loops des Animation Players am Laufen, auch wenn das F9-Fenster geschlossen ist
 * (das Fenster wird beim Schließen aus dem Spiel entfernt, sein JavaScript stoppt).
 * Das Fenster schreibt nur Aufträge, diese App führt sie aus:
 *   saved/loopjobs.cfg (Sektion ui/animation_player/saved) = { "jobs": { "<entity_id>": Auftrag } }
 *     Animation:     { kind: "anim", ids: [anim_id …], random: bool, current: anim_id }
 *     KI-Bewegung:   { kind: "ai", slot: n }
 * Pro Zoi läuft ein eigener Loop (mehrere Zois gleichzeitig möglich).
 *
 * Animation: Neustart kurz VOR dem Ende (Restzeit ≤ LEAD), damit der Zoi nicht erst ins Idle fällt und sich dabei dreht.
 * Montagen mit eigenem Loop-Abschnitt laufen von selbst weiter und werden nicht angefasst.
 * Zufall: nächste Animation zufällig aus ids (nicht zweimal dieselbe hintereinander).
 * KI-Bewegung: Interaktion Self_GeneratedMotionSlot<n> nach dem Ende neu starten.
 *
 * Verwendete CLI-Befehle: uimod.cfg_load, motion.get_current/get_info/play, interaction.get_current/execute
 */
(function () {
    'use strict';

    var SECTION = 'ui/animation_player/saved';
    var KEY = 'loopjobs';
    var CFG_MS = 500;          // Aufträge neu lesen
    var POLL_MS = 150;         // Zustand je Zoi abfragen
    var LEAD = 0.30;           // Sekunden vor dem Ende neu starten (vor dem Ausblenden)
    var BAG = 'Self_GeneratedMotionSlot';

    if (wf.root) wf.root.style.display = 'none';

    function cli(cmd, params) {
        return Promise.resolve(inzoi.cli.execute(cmd, params || {})).then(function (res) {
            if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) {} }
            if (res && typeof res === 'object' && res.success === false) throw res;
            var d = res;
            if (res && typeof res === 'object') {
                if (res.data !== undefined) d = res.data;
                else if (typeof res.message === 'string' && /^\s*[\[{]/.test(res.message)) d = res.message;
            }
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
            return d;
        });
    }

    var runners = {};          // entity_id -> { job, busy, seen, fired, startedAt }
    var lastRaw = null;
    var loopInfo = {};         // anim_id -> true (Montage hat Loop-Abschnitt) / false

    function hasLoopSection(id, ent) {
        if (loopInfo[id] !== undefined) return Promise.resolve(loopInfo[id]);
        return cli('motion.get_info', { anim_id: id, entity_id: ent }).then(function (info) {
            info = info || {};
            loopInfo[id] = Array.isArray(info.sections) && info.sections.some(function (s) { return s && s.is_loop; });
            return loopInfo[id];
        }).catch(function () { loopInfo[id] = false; return false; });
    }

    function nextAnim(job) {
        var ids = job.ids || [];
        if (!job.random || ids.length < 2) return job.current || ids[0];
        var pick = job.current;
        for (var i = 0; i < 6 && pick === job.current; i++) pick = ids[Math.floor(Math.random() * ids.length)];
        return pick;
    }

    function start(ent, r) {
        var job = r.job;
        r.fired = true; r.seen = false; r.startedAt = Date.now();
        if (job.kind === 'ai') {
            return cli('interaction.execute', { entity_id: ent, target_entity_id: ent, interaction_bag_id: BAG + job.slot, insert_front: true })
                .catch(function () {});
        }
        var id = nextAnim(job); job.current = id;
        return cli('motion.play', { anim_id: id, entity_id: ent }).catch(function () {});
    }

    function tickAnim(ent, r) {
        var job = r.job;
        return cli('motion.get_current', { entity_id: ent }).then(function (cur) {
            cur = cur || {};
            var ms = Array.isArray(cur.motions) ? cur.motions : [];
            var m = null;
            for (var i = 0; i < ms.length; i++) { if (ms[i] && ms[i].anim_id === job.current) { m = ms[i]; break; } }
            var elapsed = (Date.now() - r.startedAt) / 1000;
            if (m) {
                // kurz nach dem (Neu-)Start meldet das Spiel evtl. noch die alte Instanz kurz vor dem Ende → nicht doppelt starten
                if (r.fired && elapsed < 0.6) return;
                r.seen = true; r.fired = false;
                if (typeof m.total_length !== 'number' || m.total_length <= 0) return;
                var rate = (typeof m.rate_scale === 'number' && m.rate_scale > 0) ? m.rate_scale : 1;
                var rest = (m.total_length - (m.position || 0)) / rate;
                if (rest > LEAD) return;
                return hasLoopSection(job.current, ent).then(function (loops) { if (!loops) return start(ent, r); });
            }
            // nicht (mehr) aktiv: nach dem Ende neu starten; kurz nach dem Start ist sie evtl. noch nicht gemeldet
            if ((r.seen || elapsed > 3) && !(r.fired && elapsed < 1.0)) return start(ent, r);
        });
    }

    function tickAi(ent, r) {
        return cli('interaction.get_current', { entity_id: ent }).then(function (cur) {
            cur = cur || {};
            var elapsed = (Date.now() - r.startedAt) / 1000;
            if (cur.playing && cur.interaction_bag_id === BAG + r.job.slot) { r.seen = true; r.fired = false; return; }
            if ((r.seen || elapsed > 10) && !(r.fired && elapsed < 1.0)) return start(ent, r);
        });
    }

    function poll() {
        Object.keys(runners).forEach(function (ent) {
            var r = runners[ent];
            if (!r || r.busy) return;
            r.busy = true;
            (r.job.kind === 'ai' ? tickAi(ent, r) : tickAnim(ent, r))
                .catch(function () {})
                .then(function () { r.busy = false; });
        });
    }

    function readJobs() {
        cli('uimod.cfg_load', { mod_id: wf.MOD_ID, section: SECTION, key: KEY }).then(function (res) {
            var raw = (res && typeof res === 'object' && !Array.isArray(res)) ? (res.value !== undefined ? res.value : res) : res;
            var text = typeof raw === 'string' ? raw : JSON.stringify(raw);
            if (text === lastRaw) return;
            lastRaw = text;
            var obj = {}; try { obj = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch (e) { obj = {}; }
            var jobs = (obj && obj.jobs) || {};
            Object.keys(runners).forEach(function (ent) { if (!jobs[ent]) delete runners[ent]; });
            Object.keys(jobs).forEach(function (ent) {
                var j = jobs[ent], r = runners[ent];
                // Neuer Auftrag (anderer Typ/Slot/Start-Animation): frisch beginnen – das Fenster hat ihn gerade gestartet
                var same = r && r.job.kind === j.kind && (j.kind === 'ai' ? r.job.slot === j.slot : r.cfgCurrent === j.current);
                if (!same) { runners[ent] = { job: j, cfgCurrent: j.current, busy: false, seen: false, fired: true, startedAt: Date.now() }; return; }
                // Unveränderter Auftrag (cfg wegen eines anderen Zois neu geschrieben): Zufall behält seine aktuelle Animation
                if (j.kind === 'anim') j.current = r.job.current;
                r.job = j;
            });
        }).catch(function () {});
    }

    // Beim Start (Spielstart / Remount) alte Aufträge verwerfen – die Zois laufen dann nicht mehr
    cli('uimod.cfg_save', { mod_id: wf.MOD_ID, section: SECTION, key: KEY, value: JSON.stringify({ jobs: {} }) })
        .catch(function () {})
        .then(function () {
            setInterval(readJobs, CFG_MS);
            setInterval(poll, POLL_MS);
        });
})();
