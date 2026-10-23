/**
 * app.js  --  Animation Player
 *
 * Kleines Panel zum Auswählen und Abspielen von Charakter-Animationen
 * auf dem aktuell gesteuerten Zoi.
 *   F9 (oder Befehl "animation_player.toggle") blendet das Panel ein/aus.
 *
 * Funktionen:
 *   - Kategorien / Suche über motion.list
 *   - Abspielen, Zufall, Stopp
 *   - Loop-Modus: Animation wird nach Ende automatisch neu gestartet
 *   - "Eigene": selbst eingetragene Animations-IDs (dauerhaft gespeichert)
 *   - "Posen": Foto-/Pose-Animationen des Spiels (+ saved/pose_anims.cfg)
 *   - Einfrieren / Am Ende: Spiel anhalten (über die Spielzeit, siehe unten)
 *   - Reiter "KI-Bewegungen" (aimotion.js): KI-Emote-Slots des Spiels abspielen
 *   - Oberfläche Deutsch/Englisch (lang.js, Schalter in der Titelleiste)
 *
 * Verwendete CLI-Befehle (cli_catalog.json):
 *   motion.list        { filter, max, validate }  -> [{ anim_id }]
 *   motion.play        { anim_id }
 *   motion.play_random { filter }
 *   motion.stop        {}                         -> stoppt alle Motions
 *   motion.get_info    { anim_id }                -> { total_length, ... }
 *   motion.get_current {}                         -> { playing, motions:[{anim_id}] }
 *   environment.time_speed { speed }              -> 0 = Zeit steht (Einfrieren)
 *   gameplay.get_settings {}                      -> { language: "de-DE" }
 *   uimod.cfg_save / uimod.cfg_load               -> eigene Listen speichern
 *
 * Window management is handled by window.js (loaded before this file).
 * Der Pose-Editor (poser.js) nutzt window.AP aus dieser Datei.
 */
(function () {
    'use strict';

    var I18N = window.AP_I18N;
    var t = I18N.t;

    // Führt einen Spielbefehl aus und liefert direkt die (geparsten) Nutzdaten.
    // Das Spiel antwortet mit { success, message, data }, wobei data oft ein
    // JSON-String ist. success:false wird als Fehler (reject) weitergereicht.
    // Ziel-Zoi: null = aktuell gesteuerter Zoi, sonst entity_id. Wird bei allen
    // motion.*- und pose.*-Befehlen automatisch als entity_id mitgeschickt.
    var targetId = null;

    function cli(cmd, params) {
        params = params || {};
        if (targetId !== null && (cmd.indexOf('motion.') === 0 || cmd.indexOf('pose.') === 0) &&
            params.entity_id === undefined) {
            var p = {};
            for (var k in params) { if (params.hasOwnProperty(k)) p[k] = params[k]; }
            p.entity_id = targetId;
            params = p;
        }
        return Promise.resolve(wf.cli(cmd, params)).then(function (res) {
            if (typeof res === 'string') { try { res = JSON.parse(protectIds(res)); } catch (e) {} }
            if (res && typeof res === 'object' && res.success === false) {
                throw { message: res.message || res.errorMessage || res.error || t('cmd_failed', cmd) };
            }
            var d = res;
            if (res && typeof res === 'object') {
                // Manche Befehle (z.B. interaction.get_current) liefern ihr JSON in 'message' statt in 'data'
                if (res.data !== undefined) d = res.data;
                else if (typeof res.message === 'string' && /^\s*[\[{]/.test(res.message)) d = res.message;
            }
            if (typeof d === 'string') { try { d = JSON.parse(protectIds(d)); } catch (e) {} }
            return d;
        });
    }

    // Entity-IDs können 64-Bit groß sein und würden von JSON.parse gerundet
    // (JS-Zahlen sind nur bis 2^53 exakt). Lange ID-Zahlen daher als Text behalten.
    function protectIds(json) {
        return json.replace(/("(?:entity_id|household_id|spouse_id)"\s*:\s*)(-?\d{16,})/g, '$1"$2"');
    }

    // Kategorien: Sprach-Schlüssel -> Filter-Stichwort für motion.list
    var CATEGORIES = [
        { key: 'cat_dance', filter: 'dance' },
        { key: 'cat_wave',  filter: 'wave' },
        { key: 'cat_laugh', filter: 'laugh' },
        { key: 'cat_cry',   filter: 'cry' },
        { key: 'cat_angry', filter: 'angry' },
        { key: 'cat_sit',   filter: 'sit' },
        { key: 'cat_yoga',  filter: 'yoga' },
        { key: 'cat_hug',   filter: 'hug' },
        { key: 'cat_kiss',  filter: 'kiss' },
        { key: 'cat_sleep', filter: 'sleep' },
        { key: 'cat_eat',   filter: 'eat' },
        { key: 'cat_drink', filter: 'drink' }
    ];
    // Posen des Spiels (aus den CharacterAnim-Tabellen, Stand ModKit 16078).
    // Paar-Posen (PicturePose_Couple_*) brauchen eigentlich einen Partner,
    // sehen allein aber trotzdem gut aus. Weitere Posen: saved/pose_anims.cfg
    var GAME_POSES = [
        'Self_Pose_CatHeart', 'Selfie_Pose', 'TableCam_Selfie_Pose', 'Mirror_MusclePose', 'Muscle_Brag_Self',
        'Self_Wall_CrossarmsLean', 'Self_Wall_Mobile_Texting', 'Self_Floor_Sitting', 'Self_Floor_Sitting_CrossLeg',
        'Self_Floor_Sitting_Calyx', 'Bed_Lean_Sit_L', 'Hanbok_Pose', 'Hanbok_Fan_Pose', 'Event_Cakepose',
        'Vehicle_Pose_MotorCycle', 'Halloween_JackOLantern_Pose_01', 'Halloween_JackOLantern_Pose_02',
        'Halloween_JackOLantern_Pose_03', 'PumpkinHead_Pose_B', 'Self_Snowman_Pose',
        'PicturePose_Couple_MF', 'PicturePose_Couple_FM', 'PicturePose_Couple_MM', 'PicturePose_Couple_FF',
        'PicturePose_Couple_B_MF', 'PicturePose_Couple_B_FM', 'PicturePose_Couple_B_MM', 'PicturePose_Couple_B_FF',
        'PicturePose_AdultChild_M', 'PicturePose_AdultChild_F'
    ];
    var POSE_ANIMS   = [];        // aus saved/pose_anims.cfg
    var CUSTOM_KEY   = '__custom__';
    var ALL_KEY      = '__all__';
    var MODS_KEY     = '__mods__';
    var POSES_KEY    = '__poses__';
    // Animationen anderer Mods: werden aus saved/mod_anims.cfg geladen (JSON-Array mit IDs).
    // Fehlt die Datei oder ist sie leer, bleibt der Knopf "Mod-Anims" ausgegraut.
    var MOD_ANIMS    = [];
    // Erwachsenen-Animationen: werden nur auf Zois ab junger Erwachsener abgespielt.
    // (gleiches Array-Objekt wie MOD_ANIMS -> gilt automatisch für alle geladenen Mod-Anims)
    var ADULT_ONLY   = MOD_ANIMS;
    // v2.5: Einträge mit "+" davor (z. B. "+Self_TakePhoto") sind für alle Altersstufen freigegeben
    // (Feedback: Teens durften Spiel-Animationen aus mod_anims.cfg nicht abspielen).
    var MOD_ALL_AGES = [];
    // v2.5.1: "+" in eigenen Listen (Eigene/benannte) = Teen-Prüfung überspringen, das Spiel entscheidet beim Abspielen
    // (Feedback: "+Self_TakePhoto" in saved/lists/*.cfg wurde wörtlich mit "+" gesucht). '' = "Eigene".
    var listPlus     = { '': [] };   // Liste -> [anim_id mit "+"]
    // v2.5: benannte Listen, je eine Datei saved/lists/<Name>.cfg (JSON-Array mit IDs).
    // '' = die bisherige Liste "Eigene" (saved/custom.cfg).
    var LISTS_SECTION = 'ui/' + wf.APP_NAME + '/saved/lists';
    var LIST_NAME_RE  = /^[A-Za-z0-9_-]{1,40}$/;
    var namedLists    = {};       // Name -> [anim_id, ...]
    var activeList    = '';
    var listsLoaded   = false;
    var MAX_RESULTS  = 200;
    // motion.list liefert max. 500 Treffer pro Abfrage -> "Alle" fragt jedes
    // Zeichen einzeln ab und führt die Ergebnisse zusammen.
    var ALL_MAX      = 500;
    var ALL_CHARS    = 'abcdefghijklmnopqrstuvwxyz0123456789_'.split('');
    var CFG_SECTION  = 'ui/' + wf.APP_NAME + '/saved';

    var targetsEl   = document.getElementById('targets');
    var catsEl      = document.getElementById('cats');
    var searchEl    = document.getElementById('search');
    var validateEl  = document.getElementById('validate');
    var listEl      = document.getElementById('list');
    var statusEl    = document.getElementById('status');
    var customRow   = document.getElementById('custom-add');
    var customIdEl  = document.getElementById('custom-id');
    var loopBtn     = document.getElementById('loop-btn');
    var favBtn      = document.getElementById('fav-btn');

    // Umschalt-Knöpfe statt Checkboxen (die Spiel-UI zeichnet keine Checkboxen).
    // el.checked bleibt als Zustand, Klick schaltet um und ruft el._onToggle auf.
    function makeToggle(el) {
        el.checked = (" " + el.className + " ").indexOf(" on ") >= 0;
        el.setChecked = function (on) {
            el.checked = !!on;
            el.className = 'btn toggle' + (el.checked ? ' on' : '');
        };
        el.addEventListener('click', function () {
            el.setChecked(!el.checked);
            if (el._onToggle) el._onToggle();
        });
        return el;
    }
    makeToggle(validateEl);

    var currentFilter = '';
    var selectedId = null;
    var catButtons = [];
    var customList = [];          // [anim_id, ...]
    var allCache = null;          // { validate: bool, ids: [...] }
    var shownIds = [];            // aktuell angezeigte Liste (für Zufall in "Alle")

    function setStatus(msg, isErr) {
        statusEl.textContent = msg;
        statusEl.className = isErr ? 'err' : '';
    }

    function errText(e) {
        if (!e) return t('err_unknown');
        if (typeof e === 'string') return e;
        return e.message || e.error || JSON.stringify(e);
    }

    // Ergebnis von inzoi.cli.execute robust entpacken (Wert direkt oder in einer Hülle).
    function unwrap(res) {
        if (res && typeof res === 'object' && !Array.isArray(res)) {
            if (res.result !== undefined) return res.result;
            if (res.data !== undefined && res.playing === undefined) return res.data;
        }
        return res;
    }

    function unwrapList(res) {
        if (Array.isArray(res)) return res;
        if (res && typeof res === 'object') {
            var keys = ['result', 'data', 'motions', 'anim_ids', 'animations', 'items', 'list', 'rows'];
            for (var i = 0; i < keys.length; i++) {
                var v = res[keys[i]];
                if (Array.isArray(v)) return v;
                if (v && typeof v === 'object') {
                    var inner = unwrapList(v);
                    if (inner.length) return inner;
                }
            }
        }
        return [];
    }

    function toAnimId(entry) {
        if (typeof entry === 'string') return entry;
        return entry && (entry.anim_id || entry.id || entry.name) || null;
    }

    // cfg-Wert (JSON-Text) aus einer uimod.cfg_load-Antwort holen
    function cfgValue(res) {
        return (res && typeof res === 'object' && !Array.isArray(res))
            ? (res.value || (res.result && res.result.value) || null)
            : res;
    }

    // JSON-Array mit Animations-IDs aus einer cfg-Datei lesen (doppelte/leere entfernt).
    // "+" davor wird immer entfernt; plus (optional): solche IDs landen zusätzlich in plus.
    function loadIdList(key, target, done, plus) {
        cli('uimod.cfg_load', { mod_id: wf.MOD_ID, section: CFG_SECTION, key: key })
            .then(function (res) {
                target.length = 0;   // Array-Objekt behalten (ADULT_ONLY zeigt auf MOD_ANIMS)
                if (plus) plus.length = 0;
                parseIds(cfgValue(res), target, plus);
                done(target.length > 0);
            })
            .catch(function () { done(false); });
    }

    // JSON-Text oder Array -> IDs in target eintragen
    function parseIds(raw, target, plus) {
        var arr = [];
        try { arr = (typeof raw === 'string') ? JSON.parse(raw) : (raw || []); } catch (e) { arr = []; }
        if (!Array.isArray(arr)) return;
        arr.forEach(function (x) {
            if (typeof x !== 'string') return;
            var id = x.trim();
            if (id.charAt(0) === '+') {
                id = id.slice(1).trim();
                if (plus && id && plus.indexOf(id) < 0) plus.push(id);
            }
            if (id && target.indexOf(id) < 0) target.push(id);
        });
    }

    // ------------------------------------------------------------------
    // Kategorie-Buttons (inkl. "Eigene", "Posen")
    // ------------------------------------------------------------------
    function addCatButton(labelKey, key, extraClass, onClick) {
        var b = document.createElement('button');
        b.className = 'btn' + (extraClass ? ' ' + extraClass : '');
        b.textContent = t(labelKey);
        b.addEventListener('click', onClick);
        catsEl.appendChild(b);
        catButtons.push({ el: b, key: key, cls: extraClass || '', labelKey: labelKey });
        return b;
    }

    addCatButton('cat_all', ALL_KEY, 'all', function () { loadAll(); });
    addCatButton('cat_poses', POSES_KEY, 'poses', function () { showPoses(); });
    function showMods() {
        currentFilter = MODS_KEY;
        highlightCategory(MODS_KEY);
        renderList(MOD_ANIMS, false);
        setStatus(t('mods_info'));
    }
    var modsBtn = addCatButton('cat_mods', MODS_KEY, 'custom', showMods);

    // Feste Liste nach Ziel- oder Filterwechsel neu zeigen (Prüfung hängt vom Zoi ab)
    function reshowFixed() {
        if (currentFilter === CUSTOM_KEY) showCustom();
        else if (currentFilter === MODS_KEY) showMods();
        else if (currentFilter === POSES_KEY) showPoses();
    }
    // Ausgegraut, solange saved/mod_anims.cfg fehlt oder leer ist
    var modsEnabled = false;
    function setModsEnabled(on) {
        modsEnabled = !!on;
        modsBtn.disabled = !on;
        modsBtn.style.opacity = on ? '' : '0.4';
        modsBtn.style.cursor = on ? '' : 'not-allowed';
        modsBtn.title = on
            ? t('mods_tip_on', MOD_ANIMS.length)
            : t('mods_tip_off', 'Documents\\inZOI\\Mods\\InGame\\' + wf.MOD_ID + '\\ui\\' + wf.APP_NAME + '\\saved\\');
    }
    setModsEnabled(false);
    addCatButton('cat_custom', CUSTOM_KEY, 'custom', function () { showCustom(); });
    CATEGORIES.forEach(function (c) {
        addCatButton(c.key, c.filter, '', function () {
            searchEl.value = c.filter;
            loadList(c.filter);
        });
    });

    function highlightCategory(key) {
        catButtons.forEach(function (cb) {
            cb.el.className = 'btn' + (cb.cls ? ' ' + cb.cls : '') + (cb.key === key ? ' active' : '');
        });
        var isCustom = (key === CUSTOM_KEY);
        customRow.style.display = isCustom ? 'flex' : 'none';
        var bar = document.getElementById('list-bar');
        if (bar) bar.style.display = isCustom ? 'flex' : 'none';
        favBtn.style.display = isCustom ? 'none' : '';
    }

    // ------------------------------------------------------------------
    // Posen: Spiel-Posen + eigene aus saved/pose_anims.cfg
    // ------------------------------------------------------------------
    function poseIds() {
        var ids = GAME_POSES.slice();
        POSE_ANIMS.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
        return ids;
    }

    function showPoses() {
        currentFilter = POSES_KEY;
        highlightCategory(POSES_KEY);
        renderList(poseIds(), false);
        setStatus(t('poses_info', poseIds().length));
    }

    // ------------------------------------------------------------------
    // Ziel-Zoi: "Mein Zoi" oder ein Zoi aus der Umgebung (entity.scan_characters)
    // ------------------------------------------------------------------
    // true, wenn currentFilter ein Suchbegriff ist (keine Sonderliste)
    function isSearchFilter(f) {
        return !!f && f !== CUSTOM_KEY && f !== ALL_KEY && f !== MODS_KEY && f !== POSES_KEY;
    }

    var targetChips = [];   // [{ el, id }]
    var targetListeners = [];

    function zoiName(c) {
        var n = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
        return n || ('Zoi #' + c.entity_id);
    }

    function addTargetChip(label, id, title, isMine) {
        var b = document.createElement('button');
        b.className = 'btn chip';
        b.textContent = label;
        if (title) b.title = title;
        b.addEventListener('click', function () { setTarget(id, isMine ? t('my_zoi') : label); });
        targetsEl.appendChild(b);
        targetChips.push({ el: b, id: id, mine: !!isMine });
    }

    function addMyZoiChip() { addTargetChip(t('my_zoi'), null, t('my_zoi_tip'), true); }

    function highlightTarget() {
        targetChips.forEach(function (c) {
            c.el.className = 'btn chip' + (c.id === targetId ? ' active' : '');
        });
    }

    function setTarget(id, label) {
        if (id === targetId) { setStatus(t('target_same', label)); return; }
        targetId = id;
        highlightTarget();
        // v2.4: Loops laufen pro Zoi weiter (Feedback: zweiter Zoi stoppte den ersten)
        cancelHold();
        lastPlayedId = null;
        setStatus(t('target_set', label));
        targetListeners.forEach(function (fn) { try { fn(id, label); } catch (e) {} });
        // "Nur passende" hängt vom Zoi ab -> Listen neu laden
        if (validateEl.checked) {
            allCache = null;
            if (currentFilter === ALL_KEY) loadAll();
            else if (isSearchFilter(currentFilter)) loadList(currentFilter);
        }
        // Feste Listen werden immer für den neuen Zoi geprüft (grau markieren / ausblenden)
        reshowFixed();
    }

    function rawText(res) {
        try { return (typeof res === 'string') ? res : JSON.stringify(res); } catch (e) { return String(res); }
    }

    // Zoi-Liste aus einer Antwort holen (scan_characters -> characters, get_members -> members)
    function charList(res) {
        if (res && typeof res === 'object' && !Array.isArray(res)) {
            if (Array.isArray(res.characters)) return res.characters;
            if (Array.isArray(res.members)) return res.members;
        }
        return unwrapList(res);
    }

    // Chips neu aufbauen: "Mein Zoi" + gefundene Zois. sel: entity_id, die direkt gewählt wird.
    function showTargets(chars, whatKey, sel) {
        targetsEl.innerHTML = '';
        targetChips = [];
        addMyZoiChip();
        var stillThere = (targetId === null);
        var selLabel = null;
        chars.forEach(function (c) {
            var label = zoiName(c);
            var dist = (typeof c.distance === 'number') ? Math.round(c.distance) + ' m' : '';
            addTargetChip(label, c.entity_id,
                label + (c.age_group_text ? ', ' + c.age_group_text : '') + (dist ? ', ' + dist : ''));
            if (c.entity_id === targetId) stillThere = true;
            if (sel !== undefined && c.entity_id === sel) selLabel = label;
        });
        if (selLabel !== null) { setTarget(sel, selLabel); }
        else if (!stillThere) { setTarget(null, t('my_zoi')); }
        highlightTarget();
        if (selLabel === null) setStatus(t('zois_found', chars.length, t(whatKey)));
    }

    function fetchTargets(cmd, params, whatKey, onChars) {
        setStatus(t('zoi_searching'));
        cli(cmd, params)
            .then(function (res) {
                var chars = charList(res).filter(function (c) {
                    return c && c.entity_id !== undefined && c.entity_id !== null;
                });
                if (!chars.length) {
                    setStatus(t('no_zois', t(whatKey), rawText(res).slice(0, 160)), true);
                    return;
                }
                onChars(chars);
            })
            .catch(function (e) { setStatus(t('zoi_search_failed', errText(e)), true); });
    }

    // Alle Zois im Umkreis
    function scanTargets() {
        fetchTargets('entity.scan_characters',
            { radius: 60, limit: 30, sort: 'distance', direction: 'all' },
            'where_near', function (chars) { showTargets(chars, 'where_near'); });
    }

    // Ersatz für "anklicken": der Zoi, auf den die Kamera zeigt (enger Kegel, nächster zuerst)
    function pickInView() {
        fetchTargets('entity.scan_characters',
            { radius: 40, limit: 5, direction: 'front', cone: 12, sort: 'angle', ref: 'camera' },
            'where_view', function (chars) {
                showTargets(chars, 'where_view', chars[0].entity_id);
            });
    }

    // Mitglieder des eigenen Haushalts
    function householdTargets() {
        fetchTargets('household.get_members', {}, 'where_house',
            function (chars) { showTargets(chars, 'where_house'); });
    }

    addMyZoiChip();
    highlightTarget();
    document.getElementById('scan-btn').addEventListener('click', scanTargets);
    document.getElementById('view-btn').addEventListener('click', pickInView);
    document.getElementById('house-btn').addEventListener('click', householdTargets);

    // ------------------------------------------------------------------
    // Längen der Animationen (motion.get_info) - im Hintergrund nachladen
    // ------------------------------------------------------------------
    var lenCache = {};        // id -> Sekunden, -1 = unbekannt
    var durEls = {};          // id -> <span class="dur"> der aktuellen Liste
    var lenQueue = [];
    var lenActive = 0;
    var LEN_PARALLEL = 3;

    function fmtLen(s) {
        if (s === undefined) return '...';
        if (s < 0) return '';
        if (s >= 60) {
            var m = Math.floor(s / 60), r = Math.round(s - m * 60);
            return m + ':' + (r < 10 ? '0' : '') + r;
        }
        return s.toFixed(1) + ' s';
    }

    // ------------------------------------------------------------------
    // v2.5: Passt die Animation zum Ziel-Zoi (Alter/Geschlecht/Haltung)?
    //   Suche und "Alle" filtert das Spiel selbst (motion.list validate=true mit entity_id).
    //   Feste Listen (Eigene/benannte Listen, Mod-Anims, Posen) werden pro Eintrag geprüft:
    //   motion.list mit der ID als Filter und validate=true. Unpassende werden grau markiert,
    //   bei "Nur passende für diesen Zoi" ausgeblendet. Ergebnis pro Ziel-Zoi gemerkt.
    // ------------------------------------------------------------------
    var compat = {};          // "<ziel>|<anim_id>" -> true / false / null (unbekannt)
    var itemEls = {};         // id -> Listeneintrag der aktuellen Liste

    function compatKey(id) { return (targetId === null ? 'me' : String(targetId)) + '|' + id; }
    function isBad(id) { return compat[compatKey(id)] === false && !skipsCompat(id); }
    // v2.5.1: "+"-Einträge werden nie als unpassend markiert/ausgeblendet
    function skipsCompat(id) {
        if (currentFilter === CUSTOM_KEY) return activePlus().indexOf(id) >= 0;
        if (currentFilter === MODS_KEY) return MOD_ALL_AGES.indexOf(id) >= 0;
        return false;
    }
    function isFixedList(f) { return f === CUSTOM_KEY || f === MODS_KEY || f === POSES_KEY; }
    function needsCompat(id) { return isFixedList(currentFilter) && compat[compatKey(id)] === undefined; }

    function checkCompat(id) {
        var k = compatKey(id);
        return cli('motion.list', { filter: id, max: ALL_MAX, validate: true })
            .then(function (res) {
                var ids = unwrapList(res).map(toAnimId);
                compat[k] = ids.indexOf(id) >= 0;
            })
            .catch(function () { compat[k] = null; });
    }

    function markItem(id) {
        var el = itemEls[id];
        if (!el) return;
        var bad = isBad(id);
        el.className = 'item' + (selectedId === id ? ' selected' : '') + (bad ? ' bad' : '');
        el.title = bad ? id + ' - ' + t('compat_no') : id;
        el.style.display = (bad && validateEl.checked) ? 'none' : '';
    }

    // Nach der Prüfung einer festen Liste melden, wie viele nicht passen
    function compatSummary() {
        if (!isFixedList(currentFilter) || lenQueue.length || lenActive) return;
        var n = shownIds.filter(isBad).length;
        if (n) setStatus(t(validateEl.checked ? 'compat_hidden' : 'compat_marked', n));
    }

    function queueLengths(ids) {
        lenQueue = ids.filter(function (id) { return lenCache[id] === undefined || needsCompat(id); });
        pumpLengths();
    }

    // Sichtbare Einträge nach vorne holen (beim Scrollen)
    function prioritizeVisible() {
        var first = listEl.querySelector('.item');
        if (!first || !lenQueue.length) return;
        var h = first.offsetHeight || 24;
        var from = Math.max(0, Math.floor(listEl.scrollTop / h) - 2);
        var to = from + Math.ceil(listEl.clientHeight / h) + 4;
        var vis = shownIds.slice(from, to).filter(function (id) { return lenCache[id] === undefined || needsCompat(id); });
        lenQueue = vis.concat(lenQueue.filter(function (id) { return vis.indexOf(id) < 0; }));
    }

    function pumpLengths() {
        while (lenActive < LEN_PARALLEL && lenQueue.length) {
            (function (id) {
                lenActive++;
                var lenJob = lenCache[id] !== undefined ? Promise.resolve() :
                    cli('motion.get_info', { anim_id: id })
                        .then(function (res) {
                            var info = unwrap(res) || {};
                            lenCache[id] = (typeof info.total_length === 'number') ? info.total_length : -1;
                        })
                        .catch(function () { lenCache[id] = -1; });
                var compatJob = needsCompat(id) ? checkCompat(id) : Promise.resolve();
                Promise.all([lenJob, compatJob]).then(function () {
                    lenActive--;
                    if (durEls[id]) durEls[id].textContent = fmtLen(lenCache[id]);
                    markItem(id);
                    pumpLengths();
                    compatSummary();
                });
            })(lenQueue.shift());
        }
    }

    var scrollTimer = null;
    listEl.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(prioritizeVisible, 120);
    });

    // ------------------------------------------------------------------
    // Liste anzeigen
    // ------------------------------------------------------------------
    function renderList(ids, removable) {
        listEl.innerHTML = '';
        selectedId = null;
        shownIds = ids;
        durEls = {};
        itemEls = {};
        if (!ids.length) {
            var e = document.createElement('div');
            e.className = 'empty';
            e.textContent = removable ? t('custom_empty') : t('list_empty');
            listEl.appendChild(e);
            return;
        }
        var frag = document.createDocumentFragment();   // ein Reflow statt tausender
        ids.forEach(function (id) {
            var it = document.createElement('div');
            itemEls[id] = it;
            markItem(id);
            var name = document.createElement('span');
            name.className = 'name';
            name.textContent = id;
            it.appendChild(name);
            var dur = document.createElement('span');
            dur.className = 'dur';
            dur.textContent = fmtLen(lenCache[id]);
            durEls[id] = dur;
            it.appendChild(dur);
            if (removable) {
                var del = document.createElement('span');
                del.className = 'del';
                del.textContent = 'x';
                del.title = t('custom_remove_tip');
                del.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    removeCustom(id);
                });
                it.appendChild(del);
            }
            it.addEventListener('click', function () {
                var prevId = selectedId;
                selectedId = id;
                if (prevId && prevId !== id) markItem(prevId);
                markItem(id);
                if (prevId === id) { play(id); }   // zweiter Klick = abspielen
                else if (currentFilter === MODS_KEY || currentFilter === POSES_KEY) { checkAnim(id); }
            });
            frag.appendChild(it);
        });
        listEl.appendChild(frag);
        listEl.scrollTop = 0;
        queueLengths(ids);
        prioritizeVisible();
    }

    function fetchIds(filter, max, withValidate) {
        return cli('motion.list', { filter: filter, max: max, validate: withValidate })
            .then(function (res) {
                var ids = unwrapList(res).map(toAnimId);
                // Fallback: reine Textantwort (IDs zeilen-/kommagetrennt)
                if (!ids.length && typeof res === 'string') {
                    ids = res.split(/[\r\n,;]+/).map(function (s) { return s.trim(); });
                }
                return { ids: ids.filter(function (x) { return !!x; }), raw: res };
            });
    }

    function loadList(filter) {
        filter = (filter || '').trim();
        if (!filter) { setStatus(t('need_search'), true); return; }
        currentFilter = filter;
        wf.state.lastFilter = filter;   // über Spielstände merken
        highlightCategory(filter);
        setStatus(t('loading_filter', filter));
        var validate = !!validateEl.checked;

        fetchIds(filter, MAX_RESULTS, validate)
            .then(function (r) {
                // Mit "Nur passende" nichts gefunden -> ohne Einschränkung erneut versuchen
                if (!r.ids.length && validate) {
                    return fetchIds(filter, MAX_RESULTS, false).then(function (r2) { r2.unvalidated = true; return r2; });
                }
                return r;
            })
            .then(function (r) {
                if (currentFilter !== filter) return;   // inzwischen anderer Tab
                renderList(r.ids, false);
                if (!r.ids.length) {
                    setStatus(t('no_hits', filter, (rawText(r.raw) || t('empty_answer')).slice(0, 160)), true);
                    return;
                }
                setStatus(t('hits', r.ids.length, filter) + (r.unvalidated ? ' ' + t('unchecked') : '') +
                          '. ' + t('click_hint'));
            })
            .catch(function (e) {
                if (currentFilter !== filter) return;
                renderList([], false);
                setStatus(t('load_error', errText(e)), true);
            });
    }

    // ------------------------------------------------------------------
    // "Alle": jedes Zeichen einzeln abfragen, Ergebnisse vereinigen und
    // zwischenspeichern. Das Suchfeld filtert die Liste dann lokal.
    // ------------------------------------------------------------------
    var allLoadToken = 0;

    function showAll() {
        if (!allCache) return;
        var q = (searchEl.value || '').trim().toLowerCase();
        var ids = q
            ? allCache.ids.filter(function (id) { return id.toLowerCase().indexOf(q) >= 0; })
            : allCache.ids;
        renderList(ids, false);
        setStatus((q ? t('all_of', ids.length, allCache.ids.length, q) : t('all_count', allCache.ids.length)) +
                  (allCache.unvalidated ? ' ' + t('unchecked') : '') + '. ' + t('all_filter_hint'));
    }

    function loadAll(forceReload) {
        currentFilter = ALL_KEY;
        highlightCategory(ALL_KEY);
        searchEl.value = '';
        var validate = !!validateEl.checked;
        if (allCache && allCache.validate === validate && !forceReload) { showAll(); return; }

        var token = ++allLoadToken;
        var seen = {};
        var ids = [];
        var idx = 0;
        var lastRaw = null;
        listEl.innerHTML = '';
        var wait = document.createElement('div');
        wait.className = 'empty';
        wait.textContent = t('all_loading');
        listEl.appendChild(wait);

        function collect(withValidate, done) {
            if (token !== allLoadToken || currentFilter !== ALL_KEY) return;   // abgebrochen
            if (idx >= ALL_CHARS.length) { done(); return; }
            var ch = ALL_CHARS[idx++];
            setStatus(t('all_progress', idx, ALL_CHARS.length, ids.length));
            fetchIds(ch, ALL_MAX, withValidate)
                .then(function (r) {
                    lastRaw = r.raw;
                    r.ids.forEach(function (id) { if (!seen[id]) { seen[id] = true; ids.push(id); } });
                })
                .catch(function () {})
                .then(function () { collect(withValidate, done); });
        }

        function finish(unvalidated) {
            if (token !== allLoadToken || currentFilter !== ALL_KEY) return;
            ids.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
            allCache = { validate: validate, ids: ids, unvalidated: !!unvalidated };
            if (!ids.length) {
                renderList([], false);
                setStatus(t('all_none', (rawText(lastRaw) || t('empty_answer')).slice(0, 160)), true);
                allCache = null;
                return;
            }
            showAll();
        }

        collect(validate, function () {
            // Mit "Nur passende" nichts gefunden -> ohne Einschränkung erneut
            if (!ids.length && validate) {
                idx = 0;
                collect(false, function () { finish(true); });
            } else {
                finish(false);
            }
        });
    }

    // ------------------------------------------------------------------
    // Eigene Animationen (dauerhaft in cfg gespeichert, unabhängig vom Spielstand)
    // ------------------------------------------------------------------
    // v2.5: aktive Liste ('' = "Eigene" aus custom.cfg, sonst saved/lists/<Name>.cfg)
    function activeIds() { return activeList ? (namedLists[activeList] || []) : customList; }
    function activeLabel() { return activeList || t('list_own'); }
    function activePlus() { return listPlus[activeList] || (listPlus[activeList] = []); }
    // v2.5.1: beim Speichern das "+" wieder vor die IDs setzen
    function withPlus(ids, plus) { return ids.map(function (id) { return plus.indexOf(id) >= 0 ? '+' + id : id; }); }

    function showCustom() {
        currentFilter = CUSTOM_KEY;
        highlightCategory(CUSTOM_KEY);
        renderListBar();
        renderList(activeIds(), true);
        setStatus(t('custom_count', activeIds().length, activeLabel()));
    }

    function saveCustom() {
        var named = !!activeList;
        cli('uimod.cfg_save', {
            mod_id:  wf.MOD_ID,
            section: named ? LISTS_SECTION : CFG_SECTION,
            key:     named ? activeList : 'custom',
            value:   JSON.stringify(withPlus(activeIds(), activePlus()))
        }).catch(function (e) { setStatus(t('save_failed', errText(e)), true); });
    }

    function loadCustom() {
        loadIdList('custom', customList, function () {
            if (currentFilter === CUSTOM_KEY) showCustom();
        }, listPlus['']);
    }

    // ------------------------------------------------------------------
    // v2.5: benannte Listen (Feedback: mehrere eigene Listen mit eigenen Namen)
    //   Jede Datei saved/lists/<Name>.cfg ist eine Liste – auch selbst angelegte/kopierte Dateien.
    //   uimod.cfg_load ohne key liefert alle Dateien der Sektion. Löschen geht per CLI nicht:
    //   die Datei wird geleert ("") und danach ignoriert.
    // ------------------------------------------------------------------
    var listBarEl   = document.getElementById('list-bar');
    var listChipsEl = document.getElementById('list-chips');
    var listNameEl  = document.getElementById('list-name');

    // Antwort von cfg_load ohne key -> { Name: Wert } (Form der Antwort robust erkennen)
    function sectionEntries(res) {
        var r = res;
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { return {}; } }
        if (r && typeof r === 'object' && !Array.isArray(r)) {
            ['values', 'keys', 'entries', 'result', 'value'].forEach(function (k) {
                if (r && r[k] && typeof r[k] === 'object') r = r[k];
            });
        }
        var out = {};
        if (Array.isArray(r)) {
            r.forEach(function (e) {
                if (e && typeof e === 'object') {
                    var n = e.key || e.name || e.file;
                    if (typeof n === 'string') out[n.replace(/\.cfg$/i, '')] = e.value;
                }
            });
        } else if (r && typeof r === 'object') {
            Object.keys(r).forEach(function (n) { out[n.replace(/\.cfg$/i, '')] = r[n]; });
        }
        return out;
    }

    function loadLists(done) {
        cli('uimod.cfg_load', { mod_id: wf.MOD_ID, section: LISTS_SECTION })
            .then(function (res) {
                var ents = sectionEntries(res);
                namedLists = {};
                Object.keys(ents).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; })
                    .forEach(function (n) {
                        var v = ents[n];
                        if (v === '' || v === null || v === undefined) return;   // gelöscht
                        if (typeof v === 'string' && !/^\s*\[/.test(v)) return;   // keine Liste
                        var ids = [], plus = [];
                        parseIds(v, ids, plus);
                        namedLists[n] = ids;
                        listPlus[n] = plus;
                    });
            })
            .catch(function () {})
            .then(function () {
                listsLoaded = true;
                if (activeList && !namedLists[activeList]) activeList = '';
                renderListBar();
                if (currentFilter === CUSTOM_KEY) showCustom();
                if (done) done();
            });
    }

    function saveList(name, value) {
        return cli('uimod.cfg_save', { mod_id: wf.MOD_ID, section: LISTS_SECTION, key: name, value: value });
    }

    function selectList(name) {
        activeList = name;
        wf.state.activeList = name;
        refreshFavText();
        showCustom();
    }

    function refreshFavText() {
        favBtn.textContent = t('fav_to', activeLabel());
    }

    function renderListBar() {
        if (!listChipsEl) return;
        listChipsEl.innerHTML = '';
        [''].concat(Object.keys(namedLists)).forEach(function (n) {
            var b = document.createElement('button');
            b.className = 'btn chip' + (n === activeList ? ' active' : '');
            b.textContent = n || t('list_own');
            b.title = n ? 'saved/lists/' + n + '.cfg' : 'saved/custom.cfg';
            b.addEventListener('click', function () { selectList(n); });
            listChipsEl.appendChild(b);
        });
        var named = !!activeList;
        document.getElementById('list-rename-btn').disabled = !named;
        document.getElementById('list-delete-btn').disabled = !named;
        refreshFavText();
    }

    function readListName() {
        var n = (listNameEl.value || '').trim().replace(/\s+/g, '-');
        if (!LIST_NAME_RE.test(n)) { setStatus(t('list_bad_name'), true); return null; }
        if (namedLists[n] || n.toLowerCase() === 'custom') { setStatus(t('list_exists', n), true); return null; }
        return n;
    }

    function newList() {
        var n = readListName();
        if (!n) return;
        namedLists[n] = [];
        saveList(n, '[]').then(function () {
            listNameEl.value = '';
            selectList(n);
            setStatus(t('list_created', n));
        }).catch(function (e) { delete namedLists[n]; setStatus(t('save_failed', errText(e)), true); });
    }

    function renameList() {
        if (!activeList) return;
        var n = readListName();
        if (!n) return;
        var old = activeList, ids = namedLists[old], plus = listPlus[old] || [];
        saveList(n, JSON.stringify(withPlus(ids, plus)))
            .then(function () { return saveList(old, ''); })
            .then(function () {
                delete namedLists[old];
                delete listPlus[old];
                namedLists[n] = ids;
                listPlus[n] = plus;
                listNameEl.value = '';
                selectList(n);
                setStatus(t('list_renamed', old, n));
            })
            .catch(function (e) { setStatus(t('save_failed', errText(e)), true); });
    }

    // Zweimal klicken zum Löschen (Schutz vor Versehen)
    var deleteArmed = null;
    function deleteList() {
        if (!activeList) return;
        var n = activeList;
        if (deleteArmed !== n) {
            deleteArmed = n;
            setStatus(t('list_delete_confirm', n, namedLists[n].length), true);
            setTimeout(function () { if (deleteArmed === n) deleteArmed = null; }, 4000);
            return;
        }
        deleteArmed = null;
        saveList(n, '').then(function () {
            delete namedLists[n];
            delete listPlus[n];
            selectList('');
            setStatus(t('list_deleted', n));
        }).catch(function (e) { setStatus(t('save_failed', errText(e)), true); });
    }

    document.getElementById('list-new-btn').addEventListener('click', newList);
    document.getElementById('list-rename-btn').addEventListener('click', renameList);
    document.getElementById('list-delete-btn').addEventListener('click', deleteList);
    document.getElementById('list-reload-btn').addEventListener('click', function () {
        loadCustom();
        loadLists(function () { setStatus(t('lists_loaded', Object.keys(namedLists).length)); });
    });
    listNameEl.addEventListener('keydown', function (e) {
        e.stopPropagation();   // Tastatureingaben nicht ans Spiel weiterreichen
        if (e.key === 'Enter' || e.keyCode === 13) newList();
    });

    // Mod-Animationen aus saved/mod_anims.cfg (vom Nutzer gepflegt, JSON-Array mit IDs)
    function loadModAnims() {
        loadIdList('mod_anims', MOD_ANIMS, setModsEnabled, MOD_ALL_AGES);
    }

    // Zusätzliche Posen aus saved/pose_anims.cfg
    function loadPoseAnims() {
        loadIdList('pose_anims', POSE_ANIMS, function () {
            if (currentFilter === POSES_KEY) showPoses();
        });
    }

    function addCustom(id) {
        id = (id || '').trim();
        if (!id) { setStatus(t('need_id'), true); return false; }
        var list = activeIds();
        if (list.indexOf(id) >= 0) { setStatus(t('custom_exists', id, activeLabel())); return false; }
        list.push(id);
        saveCustom();
        setStatus(t('custom_added', id, activeLabel()));
        checkAnim(id);
        return true;
    }

    // Fragt beim Spiel nach, ob es die Animation (für das Ziel) kennt, und meldet das Ergebnis.
    function checkAnim(id) {
        cli('motion.get_info', { anim_id: id })
            .then(function (res) {
                var info = unwrap(res) || {};
                var len = (typeof info.total_length === 'number') ? info.total_length.toFixed(1) + ' s' : '?';
                var secs = Array.isArray(info.sections)
                    ? info.sections.map(function (s) { return s.name; }).join('/') : '';
                setStatus(t('check_ok', id, len) + (secs ? t('check_sections', secs) : '') +
                          (info.montage_id ? t('check_montage', info.montage_id) : ''));
            })
            .catch(function (e) { setStatus(t('check_failed', id, errText(e)), true); });
    }

    function removeCustom(id) {
        var list = activeIds();
        var i = list.indexOf(id);
        if (i < 0) return;
        list.splice(i, 1);
        saveCustom();
        showCustom();
        setStatus(t('custom_removed', id));
    }

    document.getElementById('custom-add-btn').addEventListener('click', function () {
        if (addCustom(customIdEl.value)) { customIdEl.value = ''; showCustom(); }
    });
    customIdEl.addEventListener('keydown', function (e) {
        e.stopPropagation();   // Tastatureingaben nicht ans Spiel weiterreichen
        if (e.key === 'Enter' || e.keyCode === 13) {
            if (addCustom(customIdEl.value)) { customIdEl.value = ''; showCustom(); }
        }
    });
    favBtn.addEventListener('click', function () {
        if (!selectedId) { setStatus(t('select_first'), true); return; }
        addCustom(selectedId);
    });

    // ------------------------------------------------------------------
    // Loop-Modus (v2.4): die unsichtbare App animation_player_loop führt die Loops aus – auch wenn
    //   dieses Fenster geschlossen ist (Fenster wird beim Schließen entfernt, sein JavaScript stoppt).
    //   Hier werden nur Aufträge pro Zoi in saved/loopjobs.cfg geschrieben:
    //   { jobs: { "<entity_id>": { kind: "anim", ids: [...], random: bool, current: id } | { kind: "ai", slot: n } } }
    //   Mehrere Zois können gleichzeitig loopen; ein Zielwechsel stoppt nichts mehr.
    // ------------------------------------------------------------------
    var loopEnabled = false;
    var jobs = {};             // entity_id -> Auftrag (Spiegel der cfg; nur dieses Fenster schreibt)
    var jobsTimer = null;

    function saveJobs() {
        if (jobsTimer) clearTimeout(jobsTimer);
        jobsTimer = setTimeout(function () {
            jobsTimer = null;
            cli('uimod.cfg_save', { mod_id: wf.MOD_ID, section: CFG_SECTION, key: 'loopjobs', value: JSON.stringify({ jobs: jobs }) })
                .catch(function (e) { setStatus(t('save_failed', errText(e)), true); });
        }, 80);
    }

    function loadJobs() {
        cli('uimod.cfg_load', { mod_id: wf.MOD_ID, section: CFG_SECTION, key: 'loopjobs' })
            .then(function (res) {
                var raw = cfgValue(res), o = null;
                try { o = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { o = null; }
                jobs = (o && o.jobs && typeof o.jobs === 'object') ? o.jobs : {};
            }).catch(function () { jobs = {}; });
    }

    // entity_id des Ziels (auch für „Mein Zoi“ eine echte ID, damit der Auftrag am richtigen Zoi hängt)
    function targetEntity() {
        if (targetId !== null) return Promise.resolve(String(targetId));
        return cli('entity.get_possessed', {}).then(function (res) {
            var r = unwrap(res);
            if (r && typeof r === 'object' && r.entity_id !== undefined) return String(r.entity_id);
            var m = String(typeof r === 'string' ? r : JSON.stringify(r)).match(/\d+/);
            if (!m) throw { message: t('ai_no_zoi') };
            return m[0];
        });
    }

    function setJob(ent, job) {
        if (job) jobs[ent] = job; else delete jobs[ent];
        saveJobs();
    }

    function setLoopEnabled(on) {
        loopEnabled = !!on;
        loopBtn.textContent = t(loopEnabled ? 'loop_on' : 'loop_off');
        loopBtn.className = 'btn loop' + (loopEnabled ? ' on' : '');
        wf.state.loop = loopEnabled;
        if (!loopEnabled) stopLoopWatch();
    }

    // Auftrag für den aktuellen Ziel-Zoi entfernen (andere Zois loopen weiter)
    function stopLoopWatch() {
        return targetEntity().then(function (ent) { if (jobs[ent]) setJob(ent, null); }).catch(function () {});
    }

    // Auftrag für den aktuellen Ziel-Zoi: Zufall → nacheinander zufällig aus der Liste, sonst diese eine Animation
    function startLoopWatch(id) {
        return targetEntity().then(function (ent) {
            var ids = randomOn && randomPool.length ? randomPool.slice(0, 400) : [id];
            setJob(ent, { kind: 'anim', ids: ids, random: !!(randomOn && ids.length > 1), current: id });
        }).catch(function (e) { setStatus(t('loop_aborted', errText(e)), true); });
    }

    // ------------------------------------------------------------------
    // Zufall (v2.4: Schalter statt Einmal-Knopf): „Abspielen“ wählt zufällig aus der angezeigten Liste,
    //   mit Loop geht es danach zufällig weiter. Erwachsenen-Animationen nur bei passendem Alter.
    // ------------------------------------------------------------------
    var randomOn = false;
    var randomPool = [];
    var randomBtn = document.getElementById('random-btn');

    function setRandomOn(on) {
        randomOn = !!on;
        randomBtn.textContent = t(randomOn ? 'random_on' : 'random_off');
        randomBtn.className = 'btn random' + (randomOn ? ' on' : '');
        wf.state.random = randomOn;
    }

    function buildRandomPool() {
        // v2.5: in festen Listen nur die, die zum Zoi passen (bzw. noch ungeprüft sind)
        var pool = shownIds.filter(function (id) { return !isBad(id); });
        if (!pool.some(isAdultOnly)) return Promise.resolve(pool);
        return checkAdult().then(function () { return pool; })
            .catch(function () { return pool.filter(function (id) { return !isAdultOnly(id); }); });
    }

    loopBtn.addEventListener('click', function () {
        setLoopEnabled(!loopEnabled);
        if (loopEnabled) {
            setStatus(t('loop_info_on'));
            if (lastPlayedId) startLoopWatch(lastPlayedId);   // laufende Animation gleich mitloopen
        } else {
            setStatus(t('loop_info_off'));
        }
    });

    // ------------------------------------------------------------------
    // Abspielen / Zufall / Stopp
    // ------------------------------------------------------------------
    var lastPlayedId = null;

    // Altersstufen (EB1GrowthStep), für die Erwachsenen-Animationen freigegeben sind:
    // Youth = junge Erwachsene, Adult, Old, Elderly. Kinder/Teenager sind gesperrt.
    var ADULT_STEPS = { Youth: 1, Adult: 1, Old: 1, Elderly: 1, '32': 1, '64': 1, '128': 1, '256': 1 };

    function isAdultOnly(id) { return ADULT_ONLY.indexOf(id) >= 0 && MOD_ALL_AGES.indexOf(id) < 0; }

    // Prüft das Alter des Ziel-Zois. Unbekanntes Alter wird sicherheitshalber gesperrt.
    function checkAdult() {
        var p = {};
        if (targetId !== null) p.entity_id = targetId;
        return cli('entity.get_character_info', p).then(function (res) {
            var info = unwrap(res) || {};
            var step = info.growth_step !== undefined ? info.growth_step
                     : (info.growthStep !== undefined ? info.growthStep : info.age_group);
            if (step === undefined || step === null || !ADULT_STEPS[String(step)]) {
                throw { message: t('adult_only', step || t('age_unknown')) };
            }
        });
    }

    // ------------------------------------------------------------------
    // Tempo-Regler
    //   motion.play hat keinen Tempo-Parameter. Stattdessen wird per data.patch
    //   der RateScale-Wert der Montage-Zeile geändert (wirkt nur beim Start
    //   einer Animation) und die laufende Animation neu gestartet.
    //   Hinweis (Build 16078): motion.play ignoriert 'position' und startet
    //   immer am Anfang. Originalwerte werden gemerkt und bei Stopp
    //   zurückgesetzt, damit andere Zois die Animation wieder normal abspielen.
    // ------------------------------------------------------------------
    var SPEED_MIN = 0.25, SPEED_MAX = 3, SPEED_STEP = 0.05;
    var speed = 1;
    var origRates = {};   // montage_id -> ursprünglicher RateScale

    function round2(x) { return Math.round(x * 100) / 100; }

    function patchRate(montageId, rate) {
        // Parameternamen exakt wie im cli_catalog (klein geschrieben)
        return cli('data.patch', {
            method: 'Override',
            query:  'Montage[Id=' + montageId + '].RateScale',
            value:  String(round2(rate))
        });
    }

    // Setzt das aktuelle Tempo für die Montage, die die Animation beim Ziel verwendet.
    function applySpeedFor(id) {
        return cli('motion.get_info', { anim_id: id })
            .then(function (res) {
                var info = unwrap(res) || {};
                var m = info.montage_id;
                if (!m) return;
                if (!origRates.hasOwnProperty(m)) {
                    if (speed === 1) return;   // nichts zu tun
                    origRates[m] = (typeof info.rate_scale === 'number' && info.rate_scale > 0) ? info.rate_scale : 1;
                }
                return patchRate(m, origRates[m] * speed);
            })
            // Tempo ist optional: Abspielen nicht blockieren, aber den Fehler zeigen
            .catch(function (e) {
                setStatus(t('speed_failed', errText(e)), true);
                speedError = true;
            });
    }
    var speedError = false;

    function restoreRates() {
        var jobs = Object.keys(origRates).map(function (m) {
            return patchRate(m, origRates[m]).catch(function () {});
        });
        origRates = {};
        return Promise.all(jobs);
    }

    // Laufende Animation mit neuem Tempo neu starten.
    function respeedCurrent() {
        var id = lastPlayedId;
        var later = t('speed_later', speed.toFixed(2));
        if (!id) { setStatus(later); return; }
        cli('motion.get_current', {})
            .then(function (res) {
                var cur = unwrap(res) || {};
                var m = (cur.motions || []).filter(function (x) { return x && x.anim_id === id; })[0];
                if (!m) { setStatus(later); return; }
                var pos = (typeof m.position === 'number') ? m.position : 0;
                speedError = false;
                return applySpeedFor(id)
                    .then(function () { return cli('motion.play', { anim_id: id, position: pos }); })
                    .then(function () {
                        if (loopEnabled) startLoopWatch(id);
                        if (!speedError) setStatus(t('speed_now', speed.toFixed(2), id));
                    });
            })
            .catch(function (e) { setStatus(t('speed_change_failed', errText(e)), true); });
    }

    var speedTrack = document.getElementById('speed-track');
    var speedFill  = document.getElementById('speed-fill');
    var speedKnob  = document.getElementById('speed-knob');
    var speedLabel = document.getElementById('speed-value');
    var speedTimer = null;

    function renderSpeed() {
        var f = (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
        speedFill.style.width = (f * 100) + '%';
        speedKnob.style.left  = (f * 100) + '%';
        speedLabel.textContent = speed.toFixed(2) + 'x';
    }

    function setSpeed(v, apply) {
        v = Math.max(SPEED_MIN, Math.min(SPEED_MAX, v));
        v = round2(Math.round(v / SPEED_STEP) * SPEED_STEP);
        if (v === speed) { renderSpeed(); return; }
        speed = v;
        wf.state.speed = speed;
        renderSpeed();
        if (apply === false) return;
        if (speedTimer) clearTimeout(speedTimer);
        speedTimer = setTimeout(function () { speedTimer = null; respeedCurrent(); }, 250);
    }

    function speedFromX(clientX) {
        var r = speedTrack.getBoundingClientRect();
        var f = r.width > 0 ? (clientX - r.left) / r.width : 0;
        setSpeed(SPEED_MIN + Math.max(0, Math.min(1, f)) * (SPEED_MAX - SPEED_MIN));
    }

    var speedDrag = false;
    speedTrack.addEventListener('mousedown', function (e) {
        speedDrag = true; speedFromX(e.clientX); e.stopPropagation(); e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) { if (speedDrag) speedFromX(e.clientX); });
    document.addEventListener('mouseup', function () { speedDrag = false; });
    document.getElementById('speed-minus').addEventListener('click', function () { setSpeed(speed - 0.25); });
    document.getElementById('speed-plus').addEventListener('click', function () { setSpeed(speed + 0.25); });
    document.getElementById('speed-reset').addEventListener('click', function () { setSpeed(1); });
    renderSpeed();

    // ------------------------------------------------------------------
    // Fortschrittsbalken (motion.get_current: position / total_length)
    //   Löst außerdem "Am Ende: Spiel anhalten" aus (siehe holdCheck).
    // ------------------------------------------------------------------
    var progFill = document.getElementById('prog-fill');
    var progText = document.getElementById('prog-text');
    var progTimer = null, progBusy = false, progIdle = 0;

    function progReset() {
        progFill.style.width = '0%';
        progText.textContent = '--';
    }

    function progStop() {
        if (progTimer) clearInterval(progTimer);
        progTimer = null; progBusy = false;
    }

    function progStart() {
        progStop();
        progIdle = 0;
        progTimer = setInterval(function () {
            if (progBusy || frozen) return;
            progBusy = true;
            cli('motion.get_current', {})
                .then(function (res) {
                    var r = unwrap(res) || {};
                    var ms = Array.isArray(r.motions) ? r.motions : [];
                    var m = null;
                    for (var i = 0; i < ms.length; i++) { if (ms[i].anim_id === lastPlayedId) { m = ms[i]; break; } }
                    if (!m && ms.length) m = ms[0];
                    if (!r.playing || !m || typeof m.total_length !== 'number' || m.total_length <= 0) {
                        if (++progIdle >= 3) { progFill.style.width = '100%'; if (!loopEnabled) progStop(); }
                        return;
                    }
                    progIdle = 0;
                    var pos = Math.max(0, Math.min(m.position || 0, m.total_length));
                    progFill.style.width = (pos / m.total_length * 100).toFixed(1) + '%';
                    progText.textContent = pos.toFixed(1) + ' / ' + m.total_length.toFixed(1) + ' s';
                    holdCheck(m);
                })
                .catch(function () {})
                .then(function () { progBusy = false; });
        }, 250);
    }

    // ------------------------------------------------------------------
    // Spielzeit anhalten / fortsetzen (gemeinsam für Debug, Einfrieren, Halten)
    //   Pause über die Spielgeschwindigkeit (0 = Pause), damit der normale
    //   Play-Knopf des Spiels die Pause wieder aufheben kann.
    //   environment.pause wäre eine eigene Simulations-Pause, die der
    //   Play-Knopf NICHT aufhebt.
    //   Hinweis: Animationen lassen sich in diesem Build nicht einzeln anhalten
    //   (RateScale 0 hält am ersten Frame, 'position' wird ignoriert), daher
    //   friert "Einfrieren" die ganze Spielzeit ein. Knochen-Posen (poser.js)
    //   wirken auch bei angehaltener Zeit.
    // ------------------------------------------------------------------
    var savedTimeSpeed = 1;

    function currentTimeScale() {
        return cli('environment.get_time', {}).then(function (res) {
            var tm = unwrap(res) || {};
            var s = tm.time_scale !== undefined ? tm.time_scale : (tm.time_speed !== undefined ? tm.time_speed : tm.speed);
            return (typeof s === 'number') ? s : null;
        }).catch(function () { return null; });
    }

    function pauseTime() {
        return currentTimeScale().then(function (s) {
            if (s !== null && s > 0) savedTimeSpeed = s;
            return cli('environment.time_speed', { speed: 0 });
        });
    }

    function resumeTime() {
        return cli('environment.resume', {}).catch(function () {})          // evtl. alte Simulations-Pause lösen
            .then(function () { return currentTimeScale(); })
            .then(function (s) {
                if (s === null || s <= 0) {
                    return cli('environment.time_speed', { speed: savedTimeSpeed > 0 ? savedTimeSpeed : 1 }).catch(function () {});
                }
            });
    }

    // ------------------------------------------------------------------
    // Debug-Modus: Abspielen hebt die Spielpause auf, Stopp pausiert wieder.
    // ------------------------------------------------------------------
    var debugEnabled = false;
    var debugBtn = document.getElementById('debug-btn');

    function setDebugEnabled(on) {
        debugEnabled = !!on;
        debugBtn.textContent = t(debugEnabled ? 'debug_on' : 'debug_off');
        debugBtn.className = 'btn debug' + (debugEnabled ? ' on' : '');
        wf.state.debug = debugEnabled;
    }

    function debugResume() {
        if (!debugEnabled && !frozen) return Promise.resolve();
        setFrozen(false);
        return resumeTime();
    }

    function debugPause() {
        if (!debugEnabled) return Promise.resolve();
        return pauseTime().catch(function () {});
    }

    debugBtn.addEventListener('click', function () {
        setDebugEnabled(!debugEnabled);
        if (wf.save) wf.save();
        setStatus(t(debugEnabled ? 'debug_info_on' : 'debug_info_off'));
    });

    // ------------------------------------------------------------------
    // Einfrieren / Am Ende: Spiel anhalten
    // ------------------------------------------------------------------
    var frozen = false;
    var freezeBtn = document.getElementById('freeze-btn');
    var holdEl = makeToggle(document.getElementById('hold-chk'));
    var hold = null;   // { id, at, timer } -> Zeitpunkt (s), an dem eingefroren wird

    function setFrozen(on) {
        frozen = !!on;
        freezeBtn.textContent = t(frozen ? 'unfreeze' : 'freeze');
        freezeBtn.className = 'btn freeze' + (frozen ? ' on' : '');
    }

    function freezeNow(msgKey) {
        cancelHold();
        return pauseTime()
            .then(function () {
                setFrozen(true);
                setStatus(t(msgKey || 'frozen'));
            })
            .catch(function (e) { setStatus(t('freeze_failed', errText(e)), true); });
    }

    function unfreeze() {
        setFrozen(false);
        return resumeTime().then(function () {
            setStatus(t('unfrozen'));
            if (lastPlayedId) progStart();
        });
    }

    freezeBtn.addEventListener('click', function () {
        if (frozen) unfreeze(); else freezeNow('frozen');
    });

    holdEl._onToggle = function () {
        wf.state.hold = !!holdEl.checked;
        if (!holdEl.checked) cancelHold();
        setStatus(t(holdEl.checked ? 'hold_info_on' : 'hold_info_off'));
    };

    function cancelHold() {
        if (hold && hold.timer) clearTimeout(hold.timer);
        hold = null;
    }

    // Nach dem Start: Zeitpunkt kurz vor dem Ausblenden bestimmen.
    // Montagen mit Loop-Abschnitt halten ihre Pose ohnehin selbst.
    function armHold(id) {
        cancelHold();
        if (!holdEl.checked || loopEnabled) return;
        cli('motion.get_info', { anim_id: id })
            .then(function (res) {
                var info = unwrap(res) || {};
                var loops = Array.isArray(info.sections) && info.sections.some(function (s) { return s && s.is_loop; });
                if (loops || typeof info.total_length !== 'number') return;
                var blend = (typeof info.blend_out_time === 'number') ? info.blend_out_time : 0.25;
                hold = { id: id, at: Math.max(0, info.total_length - blend - 0.1), timer: null };
            })
            .catch(function () {});
    }

    // Wird vom Fortschrittsbalken aufgerufen: kurz vor dem Ziel einen genauen Timer stellen.
    function holdCheck(m) {
        if (!hold || hold.timer || m.anim_id !== hold.id) return;
        var rate = (typeof m.rate_scale === 'number' && m.rate_scale > 0) ? m.rate_scale : 1;
        var eta = (hold.at - (m.position || 0)) / rate;
        if (eta > 0.6) return;
        hold.timer = setTimeout(function () { freezeNow('held'); }, Math.max(0, eta * 1000 - 80));
    }

    function play(id) {
        if (!id) { setStatus(t('select_anim'), true); return; }
        setStatus(t('playing_start', id));
        var gate = isAdultOnly(id) ? checkAdult() : Promise.resolve();
        stopLoopWatch();
        cancelHold();
        gate
            // Vorherige Animation beenden: Montagen verschiedener Gruppen
            // (z.B. DefaultGroup/PostureGroup) würden sich sonst überlagern.
            .then(function () { return cli('motion.stop', {}).catch(function () {}); })
            .then(function () { speedError = false; return applySpeedFor(id); })
            .then(function () { return debugResume(); })
            .then(function () { return cli('motion.play', { anim_id: id }); })
            .then(function () {
                lastPlayedId = id;
                progReset(); progStart();
                if (loopEnabled) startLoopWatch(id); else stopLoopWatch();
                armHold(id);
                if (speedError) return;   // Tempo-Fehlermeldung stehen lassen
                setStatus(t(loopEnabled ? 'playing_loop' : 'playing', id) +
                          (speed !== 1 ? ' (' + speed.toFixed(2) + 'x)' : ''));
            })
            .catch(function (e) {
                stopLoopWatch();
                setStatus(t('error', errText(e)), true);
            });
    }

    // „Abspielen“: mit Zufall-Schalter eine zufällige Animation aus der angezeigten Liste
    function playPressed() {
        if (!randomOn) { play(selectedId); return; }
        if (!shownIds.length) { setStatus(t('random_need_list'), true); return; }
        buildRandomPool().then(function (pool) {
            if (!pool.length) { setStatus(t('list_is_empty'), true); return; }
            randomPool = pool;
            play(pool[Math.floor(Math.random() * pool.length)]);
        });
    }

    // Stopp: nur der gewählte Zoi (andere Zois loopen weiter)
    function stopAll() {
        progStop(); progReset();
        stopLoopWatch();          // Loop-Auftrag dieses Zois beenden (Loop-Schalter bleibt)
        cancelHold();
        lastPlayedId = null;
        var wasFrozen = frozen;
        setFrozen(false);
        (wasFrozen && !debugEnabled ? resumeTime() : Promise.resolve())
            .then(function () { return cli('motion.stop', {}); })
            .then(function () { return restoreRates(); })   // Original-Tempo für alle Zois
            .then(function () { return debugPause(); })
            .then(function () { setStatus(t(debugEnabled ? 'stopped_paused' : 'stopped')); })
            .catch(function (e) { setStatus(t('stop_failed', errText(e)), true); });
    }

    // Alle stoppen: jeden Zoi mit Loop-Auftrag (Animation oder KI-Bewegung) und den gewählten Zoi
    function stopEveryone() {
        var ents = Object.keys(jobs), was = jobs;
        jobs = {};
        saveJobs();
        stopAll();
        Promise.all(ents.map(function (ent) {
            return (was[ent].kind === 'ai'
                ? cli('interaction.cancel', { entity_id: ent })
                : cli('motion.stop', { entity_id: ent })).catch(function () {});
        })).then(function () { setStatus(t('stopped_all', ents.length)); });
    }

    document.getElementById('play-btn').addEventListener('click', playPressed);
    randomBtn.addEventListener('click', function () {
        setRandomOn(!randomOn);
        setStatus(t(randomOn ? 'random_info_on' : 'random_info_off'));
    });
    document.getElementById('stop-btn').addEventListener('click', stopAll);
    document.getElementById('stopall-btn').addEventListener('click', stopEveryone);
    // In "Alle" filtert das Suchfeld lokal, sonst wird im Spiel gesucht.
    function doSearch() {
        if (currentFilter === ALL_KEY && allCache) showAll();
        else loadList(searchEl.value);
    }
    var searchTimer = null;
    document.getElementById('search-btn').addEventListener('click', doSearch);
    searchEl.addEventListener('keydown', function (e) {
        e.stopPropagation();   // Tastatureingaben nicht ans Spiel weiterreichen
        if (e.key === 'Enter' || e.keyCode === 13) doSearch();
    });
    searchEl.addEventListener('input', function () {
        if (currentFilter !== ALL_KEY || !allCache) return;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(showAll, 200);   // live filtern beim Tippen
    });
    validateEl._onToggle = function () {
        if (currentFilter === ALL_KEY) loadAll();
        else if (isSearchFilter(currentFilter)) loadList(currentFilter);
        else if (isFixedList(currentFilter)) {
            Object.keys(itemEls).forEach(markItem);
            compatSummary();
        }
    };

    // ------------------------------------------------------------------
    // Reiter: Animationen / Pose-Editor
    // ------------------------------------------------------------------
    var tabs = {
        anim: { btn: document.getElementById('tab-anim-btn'), el: document.getElementById('tab-anim') },
        ai:   { btn: document.getElementById('tab-ai-btn'),   el: document.getElementById('tab-ai') },
        pose: { btn: document.getElementById('tab-pose-btn'), el: document.getElementById('tab-pose') }
    };
    var tabListeners = [];

    function showTab(name) {
        for (var k in tabs) {
            if (!tabs.hasOwnProperty(k)) continue;
            tabs[k].el.style.display = (k === name) ? 'flex' : 'none';
            tabs[k].btn.className = 'btn' + (k === name ? ' active' : '');
        }
        wf.state.tab = name;
        tabListeners.forEach(function (fn) { try { fn(name); } catch (e) {} });
    }
    tabs.anim.btn.addEventListener('click', function () { showTab('anim'); });
    tabs.ai.btn.addEventListener('click', function () { showTab('ai'); });
    tabs.pose.btn.addEventListener('click', function () { showTab('pose'); });

    // ------------------------------------------------------------------
    // Sprache: gespeichert in saved/lang.cfg ("de"/"en"), sonst Spielsprache.
    // ------------------------------------------------------------------
    var langBtn = document.getElementById('lang-btn');

    // Dynamische Texte nach einem Sprachwechsel neu setzen
    function refreshTexts() {
        catButtons.forEach(function (cb) { cb.el.textContent = t(cb.labelKey); });
        setModsEnabled(modsEnabled);
        targetChips.forEach(function (c) {
            if (c.mine) { c.el.textContent = t('my_zoi'); c.el.title = t('my_zoi_tip'); }
        });
        setLoopEnabled(loopEnabled);
        setRandomOn(randomOn);
        setDebugEnabled(debugEnabled);
        setFrozen(frozen);
        langBtn.textContent = I18N.lang.toUpperCase();
        renderListBar();
        if (currentFilter === CUSTOM_KEY) showCustom();
        else if (currentFilter === POSES_KEY) showPoses();
        else if (!listEl.querySelector('.item')) {
            var e = listEl.querySelector('.empty');
            if (e && !currentFilter) e.textContent = t('list_start');
        }
    }
    I18N.onChange(refreshTexts);

    langBtn.addEventListener('click', function () {
        var next = I18N.lang === 'de' ? 'en' : 'de';
        I18N.set(next);
        cli('uimod.cfg_save', { mod_id: wf.MOD_ID, section: CFG_SECTION, key: 'lang', value: next }).catch(function () {});
        setStatus(t('lang_changed'));
    });

    function initLanguage() {
        cli('uimod.cfg_load', { mod_id: wf.MOD_ID, section: CFG_SECTION, key: 'lang' })
            .then(function (res) {
                var v = cfgValue(res);
                if (typeof v === 'string') v = v.replace(/"/g, '').trim().toLowerCase();
                if (v === 'de' || v === 'en') { I18N.set(v); return; }
                return cli('gameplay.get_settings', {}).then(function (s) {
                    s = unwrap(s) || {};
                    var l = String(s.language || s.Language || '');
                    I18N.set(/^de\b|^de-|german|deutsch/i.test(l) ? 'de' : 'en');
                });
            })
            .catch(function () { I18N.set(I18N.lang); });
    }

    // ------------------------------------------------------------------
    // Schließen-Button (window.js blendet ihn bei Keybind-Triggern aus,
    // da hier auch der Befehl-Trigger existiert, wird er wieder aktiviert).
    // ------------------------------------------------------------------
    var closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
        closeBtn.style.display = '';
        closeBtn.addEventListener('click', function () {
            wf.save();
            setTimeout(function () {
                try {
                    if (window.inzoi && inzoi.view && inzoi.view.hide) { inzoi.view.hide(); return; }
                } catch (e) {}
                try {
                    if (typeof engine !== 'undefined') {
                        engine.call('_uimod_request', JSON.stringify({ type: 'view', action: 'hide', promiseId: 0 }));
                    }
                } catch (e) {}
            }, 0);
        });
    }

    window._onStateLoaded = function (s) {
        if (!s) return;
        if (s.lastFilter) { searchEl.value = s.lastFilter; highlightCategory(s.lastFilter); }
        if (typeof s.loop === 'boolean') setLoopEnabled(s.loop);
        if (typeof s.random === 'boolean') setRandomOn(s.random);
        if (typeof s.debug === 'boolean') setDebugEnabled(s.debug);
        if (typeof s.speed === 'number') setSpeed(s.speed, false);
        if (typeof s.hold === 'boolean') holdEl.setChecked(s.hold);
        // gemerkte Liste erst nach dem Laden der Listen wählen (loadLists prüft, ob es sie noch gibt)
        if (typeof s.activeList === 'string') {
            activeList = (listsLoaded && !namedLists[s.activeList]) ? '' : s.activeList;
            renderListBar();
        }
        if (tabs.hasOwnProperty(s.tab)) showTab(s.tab);
    };

    if (window.inzoi && inzoi.trigger && inzoi.trigger.onActivated) {
        inzoi.trigger.onActivated(function () {
            if (isSearchFilter(currentFilter) &&
                !listEl.querySelector('.item')) loadList(currentFilter);
        });
    }

    // Schnittstelle für poser.js
    window.AP = {
        cli: cli,
        t: t,
        unwrap: unwrap,
        errText: errText,
        setStatus: setStatus,
        cfgSection: CFG_SECTION,
        getTarget: function () { return targetId; },
        setJob: setJob,           // Loop-Auftrag pro Zoi (für aimotion.js)
        getJob: function (ent) { return jobs[String(ent)] || null; },
        onTarget: function (fn) { targetListeners.push(fn); },
        onTab: function (fn) { tabListeners.push(fn); }
    };

    I18N.apply();
    setLoopEnabled(false);
    setRandomOn(false);
    setFrozen(false);
    loadJobs();
    initLanguage();
    loadCustom();
    loadLists();
    loadModAnims();
    loadPoseAnims();
})();
