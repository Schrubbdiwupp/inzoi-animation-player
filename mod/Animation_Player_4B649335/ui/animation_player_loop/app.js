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
 * Animation: Neustart kurz VOR dem Ausblenden, damit der Zoi nicht erst ins Idle fällt und sich dabei dreht.
 *   v2.5: genauer Timer statt nur Abfrage. Bei Rucklern oder langsamen Antworten wurde das 0,3-s-Fenster
 *   vor dem Ende manchmal verpasst (Feedback: Dreher kam unregelmäßig wieder). Der Neustartpunkt
 *   berücksichtigt jetzt blend_out_time der Montage, die gemessene Antwortzeit und das tatsächlich
 *   gemessene Abspieltempo (Spielgeschwindigkeit, Tempo-Regler).
 * Montagen mit eigenem Loop-Abschnitt laufen allein von selbst weiter; in einer Zufallsliste wird nach einmal
 * Gesamtlänge gewechselt (v2.5.3, sonst blieben z. B. die SmartPhone-Animationen ewig hängen).
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
    var MARGIN = 0.12;         // Sekunden (Animationszeit) vor Beginn des Ausblendens neu starten
    var BLEND_DEFAULT = 0.25;  // falls die Montage kein blend_out_time meldet
    var BAG = 'Self_GeneratedMotionSlot';
    var latency = 0.08;        // gemessene Antwortzeit von motion.get_current (s), gleitender Mittelwert

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

    var runners = {};          // entity_id -> { job, busy, seen, fired, startedAt, timer, est, lastPos, lastT }
    var lastRaw = null;
    var motionInfo = {};       // "<entity_id>|<anim_id>" -> { loops, blend } (Montage hängt von Alter/Geschlecht ab)

    function getInfo(id, ent) {
        var k = ent + '|' + id;
        if (motionInfo[k]) return Promise.resolve(motionInfo[k]);
        return cli('motion.get_info', { anim_id: id, entity_id: ent }).then(function (info) {
            info = info || {};
            var secs = Array.isArray(info.sections) ? info.sections : [];
            // v2.5.3: Beginn eines End-Abschnitts (Rückweg in die Grundhaltung, dreht den Zoi oft zurück).
            // Feedback (Nexus, rxsteam3d): „still twirls between anims“ – der Neustart kam erst kurz vor dem
            // Ausblenden ganz am Schluss, also mitten im bzw. nach dem Zurückdrehen.
            var end = 0;
            secs.forEach(function (s) {
                if (s && /^end/i.test(s.name || '') && typeof s.start_time === 'number' && s.start_time > 0) end = end ? Math.min(end, s.start_time) : s.start_time;
            });
            motionInfo[k] = {
                loops: secs.some(function (s) { return s && s.is_loop; }),
                blend: (typeof info.blend_out_time === 'number' && info.blend_out_time >= 0) ? info.blend_out_time : BLEND_DEFAULT,
                endStart: end
            };
            return motionInfo[k];
        }).catch(function () { return { loops: false, blend: BLEND_DEFAULT }; });
    }

    function clearTimer(r) {
        if (r && r.timer) { clearTimeout(r.timer); r.timer = null; }
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
        clearTimer(r);
        r.fired = true; r.seen = false; r.startedAt = Date.now(); r.lastPos = null;
        if (job.kind === 'ai') {
            return cli('interaction.execute', { entity_id: ent, target_entity_id: ent, interaction_bag_id: BAG + job.slot, insert_front: true })
                .catch(function () {});
        }
        var id = nextAnim(job); job.current = id;
        return cli('motion.play', { anim_id: id, entity_id: ent }).catch(function () {});
    }

    function tickAnim(ent, r) {
        var job = r.job;
        var asked = Date.now();
        return cli('motion.get_current', { entity_id: ent }).then(function (cur) {
            var now = Date.now();
            latency = latency * 0.8 + Math.min(1, (now - asked) / 1000) * 0.2;
            cur = cur || {};
            var ms = Array.isArray(cur.motions) ? cur.motions : [];
            // Nach einem Neustart kann die alte Instanz beim Ausblenden noch gemeldet werden → die jüngste nehmen
            var m = null;
            for (var i = 0; i < ms.length; i++) {
                if (ms[i] && ms[i].anim_id === job.current && (!m || (ms[i].position || 0) < (m.position || 0))) m = ms[i];
            }
            var elapsed = (now - r.startedAt) / 1000;
            if (m) {
                // kurz nach dem (Neu-)Start meldet das Spiel evtl. noch die alte Instanz kurz vor dem Ende → nicht doppelt starten
                if (r.fired && elapsed < 0.6) return;
                r.seen = true; r.fired = false;
                if (typeof m.total_length !== 'number' || m.total_length <= 0) return;
                var pos = m.position || 0;
                // Tempo: rate_scale; nur wenn das über ≥ 1 s gemessene Tempo deutlich abweicht
                // (z. B. Spielgeschwindigkeit x2/x3), das gemessene nehmen. Kurze Messungen schwanken zu stark.
                var rate = (typeof m.rate_scale === 'number' && m.rate_scale > 0) ? m.rate_scale : 1;
                if (r.lastPos === null || r.lastPos === undefined || pos < r.lastPos) { r.lastPos = pos; r.lastT = now; }
                else if (now - r.lastT >= 1000) {
                    var e = (pos - r.lastPos) / ((now - r.lastT) / 1000);
                    r.est = (e > 0.05 && e < 10 && Math.abs(e - rate) / rate > 0.25) ? e : 0;
                }
                if (r.est) rate = r.est;
                if (r.timer) return;   // Neustart ist schon genau geplant
                var id = job.current;
                return getInfo(id, ent).then(function (info) {
                    if (info.loops) {
                        // v2.5.3: Montage mit eigenem Loop-Abschnitt (z. B. SmartPhone_Check). Allein läuft sie von selbst
                        // weiter; in einer Zufallsliste nach einmal Gesamtlänge (Abspielzeit × Tempo) zur nächsten wechseln.
                        // Feedback (Nexus, rxsteam3d): sie blieb sonst ewig in ihrem Loop-Abschnitt hängen.
                        // Tempo hier vom Spiel (rate_scale): die Messung über die Position taugt nicht, weil sie im Loop zurückspringt
                        var spielRate = (typeof m.rate_scale === 'number' && m.rate_scale > 0) ? m.rate_scale : 1;
                        if (job.random && (job.ids || []).length > 1 && elapsed * spielRate >= m.total_length) return start(ent, r);
                        return;
                    }
                    var at = Math.max(m.total_length * 0.5, m.total_length - info.blend - MARGIN);
                    // End-Abschnitt vorhanden: schon kurz vor dessen Beginn neu starten (nicht in den ersten 30 %)
                    if (info.endStart > m.total_length * 0.3 && info.endStart - MARGIN < at) at = info.endStart - MARGIN;
                    // echte Sekunden bis zum Neustartpunkt: die Position ist schon latency/2 alt,
                    // und motion.play braucht nochmal etwa latency/2, bis es im Spiel ankommt
                    var wait = (at - pos) / rate - latency;
                    if (wait <= 0.03) return start(ent, r);
                    // Liegt der Punkt vor der nächsten Abfrage (+ Antwortzeit + Reserve): Timer stellen
                    if (wait < POLL_MS / 1000 + latency + 0.35) {
                        r.timer = setTimeout(function () {
                            r.timer = null;
                            if (runners[ent] === r && r.job.current === id) start(ent, r);
                        }, Math.round(wait * 1000));
                    }
                });
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
            Object.keys(runners).forEach(function (ent) { if (!jobs[ent]) { clearTimer(runners[ent]); delete runners[ent]; } });
            Object.keys(jobs).forEach(function (ent) {
                var j = jobs[ent], r = runners[ent];
                // Neuer Auftrag (anderer Typ/Slot/Start-Animation): frisch beginnen – das Fenster hat ihn gerade gestartet
                var same = r && r.job.kind === j.kind && (j.kind === 'ai' ? r.job.slot === j.slot : r.cfgCurrent === j.current);
                if (!same) {
                    clearTimer(r);
                    runners[ent] = { job: j, cfgCurrent: j.current, busy: false, seen: false, fired: true, startedAt: Date.now(), timer: null, est: 0, lastPos: null, lastT: 0 };
                    return;
                }
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
