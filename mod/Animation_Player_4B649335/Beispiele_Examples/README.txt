==============================================================================
  ANIMATION PLAYER for inZOI  -  README (English)
  Deutsche Version: LIESMICH.txt
==============================================================================

The Animation Player lets you play any animation or pose on your Zoi (or
another Zoi nearby), freeze it for photos, and bend individual bones with
the Pose Editor. The "AI Motions" tab also plays the AI emotes you created
in the game, in a loop if you like.

Source code and read-in script: https://github.com/Schrubbdiwupp/inzoi-animation-player

Open/close: F9 key  (or the game command  animation_player.toggle)
Language: "DE"/"EN" button at the top right of the title bar. On first
start, the game's language is used automatically.


------------------------------------------------------------------------------
 0. INSTALLATION
------------------------------------------------------------------------------
  1. Copy the folder "Animation_Player_4B649335" from the ZIP to:
       Documents\inZOI\Mods\
  2. Start the game and enable "Animation_Player" in the mod manager.
  3. Press F9 in the game.

  Updating from an older version: delete the old folder first. Your
  settings (favorites, poses) live in Mods\InGame\... and are kept.


------------------------------------------------------------------------------
 1. TARGET ZOI
------------------------------------------------------------------------------
  My Zoi         the Zoi you are currently controlling (default)
  Zoi in view    point the camera at a Zoi, then click
  Nearby         all Zois around you, tap a name = target
  My household   all members of your household

Everything (animations AND the Pose Editor) always affects the selected
target Zoi.


------------------------------------------------------------------------------
 2. "ANIMATIONS" TAB
------------------------------------------------------------------------------
  All         loads ALL animations of the game (takes a moment), the search
              field then filters the list instantly
  Poses       photo poses of the game (cat heart, selfie, muscles, leaning
              against a wall, sitting on the floor, ...) + your pose_anims.cfg
  Mod anims   animations from other mods (see section 6)
  * Own       your favorites and named lists (see below)
  Dance, Wave, ...   quick search categories

  Click an entry = select, click again = play.
  "Only matching for this Zoi" hides animations that don't fit the Zoi's
  age, gender or posture. This now also applies to the fixed lists (Own,
  your named lists, Mod anims, Poses): every entry is checked for the
  selected Zoi. With the switch off, entries that don't fit are only
  struck through. Handy for teens and children.

  Named lists (under "* Own"):
    Besides "Own" you can create as many lists as you like, e.g.
    "media-1", "emo-happy", "emo-sad". Type a name -> "+ New".
    Click a list = select it. "Rename" and "Delete" (click twice) work on
    the selected list. "* Add to list" saves the highlighted animation in
    the selected list.
    Every list is a file saved\lists\<name>.cfg. You can also create or
    share such files yourself, then click "Reload".
    A + in front of an ID (e.g. "+Self_TakePhoto") skips the "fits this
    Zoi" check for that entry: it is never struck through or hidden, the
    game decides when you press Play (since 2.5.1). If the game has no
    animation for that age, you get the game's error message.

  Play        plays the selected animation on the target Zoi
  Loop        repeats the animation endlessly - even with the window (F9)
              closed. Every Zoi can have its own loop.
  Random      toggle (purple = on): Play picks a random animation from the
              shown list. With Loop it keeps going randomly.
  Stop        stops only the selected target Zoi
  Stop all    stops every Zoi with a running animation or loop
  Debug       Play unpauses the game, Stop pauses it
              (handy for mocap and video recordings)
  Freeze      stops game time, the current pose stays.
              "Unfreeze" (or Play in the game) continues.
  At the end: pause game   (default: off)
              pauses the WHOLE GAME just before the animation ends,
              so the last pose stays. Ideal for photos.
              "Unfreeze" (or Play in the game) continues.
  Speed       0.25x to 3x
  * Add to list: ...   saves the selected animation in the selected list


------------------------------------------------------------------------------
 2b. "AI MOTIONS" TAB
------------------------------------------------------------------------------
  Plays the AI motions you created in the game (click a Zoi > "AI Emote").
  The game loads at most 30 of them from
    Documents\inZOI\AIGenerated\MyAIMotions
  into 30 fixed slots, sorted by folder name.

  - Double-click an entry or "Play": the target Zoi plays it.
  - "Loop": restarts the motion automatically when it ends (also with the
    window closed, several Zois at once).
  - "Stop": cancels the motion.
  - "Rename": custom name for the selected slot (empty = name back).

  Show titles and lengths:
    Double-click "KI-Bewegungen_einlesen.bat". It is in this folder or, if it
    is missing (e.g. Nexus download), on GitHub:
      https://github.com/Schrubbdiwupp/inzoi-animation-player
    It reads the titles and lengths from MyAIMotions and saves them to
    saved\ai_motions.cfg. Then click "Reload" in the game.
    Run it again after adding or deleting AI motions.
    Without the file the tab simply shows "Slot 1" to "Slot 30".

  Note: AI motions always play at normal speed. The speed slider, "Freeze"
  and the game pause do not affect them.
------------------------------------------------------------------------------
 3. "POSE EDITOR" TAB
------------------------------------------------------------------------------
  Rotate individual bones (head, arms, spine, fingers, ...).

  1. Click a bone in the list (groups: Body, Head, Torso, Arms, Fingers,
     Legs, Changed, All - or search at the top).
  2. Rotate with the Pitch / Yaw / Roll sliders (-180° to +180°).
     "-" / "+" = 5° steps, "0" = reset that axis.
     Axes are local to each bone - just try them out.
  3. Mode:
       Additive  the rotation is added ON TOP of the running animation
                 (recommended, the Zoi keeps moving)
       Replace   the rotation REPLACES the animation for that bone
  4. Enter a name and click "Save" - the pose appears in the list below.
     Click a saved pose to load it again, "x" deletes it.

  Pro tip for photos:
     play a pose -> "Freeze" -> fine-tune in the Pose Editor
     (e.g. turn the head towards the camera) -> take the photo -> "Reset all".

  Note: the bone commands are marked "experimental" by the game.
  If a Zoi looks odd: "Reset all".


------------------------------------------------------------------------------
 4. WHERE ARE THE SETTINGS STORED?
------------------------------------------------------------------------------
  Documents\inZOI\Mods\InGame\Animation_Player_4B649335\ui\animation_player\saved\

  custom.cfg       your "* Own" list
  lists\         your named lists, one <name>.cfg each
  mod_anims.cfg    list for the "Mod anims" button        (YOU create it)
  pose_anims.cfg   extra poses for "Poses"                 (YOU create it)
  poses.cfg        poses saved in the Pose Editor
  lang.cfg         chosen language ("de" or "en")
  ai_motions.cfg   titles/lengths of your AI motions (from KI-Bewegungen_einlesen.bat)
  ai_names.cfg     custom names of the AI motion slots
  window.cfg       window position and size

  All .cfg files are plain text (JSON) and can be edited with Notepad.
  Close the game first, or close and reopen the player with F9 afterwards.
  If the "saved" folder doesn't exist yet: open the player once and move
  the window - the game then creates it.


------------------------------------------------------------------------------
 5. EXAMPLE FILES (folder "Beispiele_Examples\saved")
------------------------------------------------------------------------------
  custom.cfg       6 nice game animations as starter favorites
  pose_anims.cfg   3 extra poses (Confident, Dazzled, Cheer up)
  poses.cfg        2 ready-made bone poses ("Curious", "Proud")
  mod_anims.cfg    template for mod animations (see section 6)

  Usage: copy the file you want into the saved folder from section 4.
  WARNING: an existing custom.cfg / poses.cfg will be overwritten - back
  it up first if you already have your own entries!


------------------------------------------------------------------------------
 6. ADDING MOD ANIMATIONS  (step by step)
------------------------------------------------------------------------------
  The player plays "CharacterAnim" IDs. Every animation a mod adds to the
  game has such an ID (e.g. "MyMod_Dance_01").

  STEP 1 - Find the ID. Three ways:
    a) Click "All" in the player and type the mod name (or part of it)
       into the search field. If the animation shows up: that's the ID.
    b) Check the mod's description (many modders list their IDs).
    c) In the mod folder (Documents\inZOI\Mods\...\<Mod>\non_ufs\JsonPatch\)
       open a file "AnimCharacter_..._patch.json" with Notepad and search
       for  "Id":  - the text after it is the ID.

  STEP 2 - Create the file mod_anims.cfg
    Copy the example file "Beispiele_Examples\saved\mod_anims.cfg" to:
      Documents\inZOI\Mods\InGame\Animation_Player_4B649335\ui\animation_player\saved\

  STEP 3 - Enter the IDs
    Open the file with Notepad. It contains a list in square brackets,
    each ID in quotes, separated by commas:

      ["MyMod_Dance_01","MyMod_Dance_02","Lover_DeepKiss_MF"]

    Replace the example IDs "Meine_Mod_Animation_01/02" with your real IDs.
    ("Lover_DeepKiss_MF" is a game animation and always works - good for
    testing.)

  STEP 4 - Test
    Start the game (or close and reopen the player with F9). The
    "Mod anims" button is no longer greyed out. Clicking an entry checks
    whether the game knows the animation ("OK ..." or an error).

  IMPORTANT:
    - The mod in question must be installed and active.
    - Animations from mod_anims.cfg only play on Zois aged "young adult"
      or older (protection for children/teens).
      Exception: a + in front of the ID allows it for all ages,
      e.g. ["+Self_TakePhoto","+Multi_Smartphone_Check","Lover_DeepKiss_MF"].
      Game animations for teens are best put in "* Own" or a named list -
      there is no age lock there.
    - Want extra poses instead of mod animations? Same principle with
      pose_anims.cfg - the entries then appear under "Poses".


------------------------------------------------------------------------------
 7. FOR MODDERS: MAKING YOUR OWN ANIMATIONS PLAYABLE
------------------------------------------------------------------------------
  If a mod only ships montages (AnimMontage files) but NO CharacterAnim
  row, the player cannot find them. You then need two JsonPatch entries in
  the ModKit (examples in the folder "Beispiele_Examples\modder"):

    AnimCharacter_Interaction_patch.json
        - one row per playable animation ("Id" = the ID for the player)
        - one AnimInfoList entry per gender and age group
          (always include Youth = young adults, otherwise the game reports
          "wrong age")
        - "Animation" points to your mod's montage asset

    Montage_patch.json
        - EVERY custom montage needs an entry here (Id = montage name).
          Without it, the game silently cancels the animation!
        - AnimReferenceName = name of the animation sequence
        - leave "Notifies" empty

  Replace the placeholders "MyMod_12345678" (plugin folder) and
  "MyMod_Dance_01..." with your own names, then package in the ModKit.


------------------------------------------------------------------------------
 8. COMMON PROBLEMS
------------------------------------------------------------------------------
  "Mod anims" is greyed out
      -> mod_anims.cfg is missing, empty or in the wrong folder.
         Typo? Every ID needs quotes, commas in between, square brackets
         around the whole list.

  "Mod animations are for adults only"
      -> Entries from mod_anims.cfg only play on young adults and older.
         To allow all ages, put a + in front of the ID (see section 6),
         or put the animation in "* Own" / a named list.

  Zoi spins around once between two loop runs
      -> Much rarer since 2.5 (precise restart before the blend-out).
         It can still happen during very heavy stutters.

  "No results" / animation doesn't start
      -> Untick "Only matching for this Zoi" and try again. Some animations
         need a specific posture (sitting, lying) or an object.

  The game stands still after "Freeze" / "At the end: pause game"
      -> That's intended: click "Unfreeze" or Play in the game.

  AI Motions: only "Slot 1" to "Slot 30" or wrong titles
      -> Run KI-Bewegungen_einlesen.bat (again), then click "Reload" in the
         "AI Motions" tab. Repeat after adding or deleting AI motions.

  AI motion ignores speed, freeze or game pause
      -> That's the game: AI motions always play in real time.

  More than 30 AI motions
      -> The game loads at most 30. Move the extra ones out of the
         MyAIMotions folder first.

  Zoi looks twisted after using the Pose Editor
      -> "Pose Editor" tab -> "Reset all".

  Changing the speed restarts the animation from the beginning
      -> The game currently can't resume a running animation at a specific
         point. Best set the speed before playing.


------------------------------------------------------------------------------
  Have fun!  -  Schrubbi
==============================================================================
