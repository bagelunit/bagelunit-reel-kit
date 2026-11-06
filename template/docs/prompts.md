# Prompts to copy and send

These are ready-made messages for Claude Code. You copy one, fill in the blanks, and send it. You do not need to know any technical words.

## How to use any prompt (4 steps)

1. **Open Claude Code in the right folder.** Open a terminal window in that folder and type `claude`, then press Enter.
   - Mac: open the Terminal app, type `cd ` (with a space after it), drag the folder from Finder into the Terminal window, press Enter, then type `claude`.
   - Windows: open the folder in File Explorer, click the address bar at the top, type `powershell`, press Enter, then type `claude`.
2. **Copy the prompt** from the grey box below (everything inside it).
3. **Replace every part in [SQUARE BRACKETS]** with your own answer, brackets included. Each bracket tells you what to write. Not sure about one? Delete that whole line: Claude will ask you about it later in plain choices, so nothing is lost.
4. **Paste it into Claude Code and press Enter.**

Tip: to put a file's location into a prompt, drag the file from Finder or File Explorer into the terminal window. It types the location for you; copy it from there.

The prompt for the kit's own folder (installing the kit) is in the main README. These are for a brand folder, which is a copy of this template.

---

## 1. Set up this brand (once per brand)

Send this in a fresh copy of this template. It teaches Claude who the brand is. It takes about five minutes.

```
Set up this brand. Follow the first-run brand setup in CLAUDE.md. Use my answers below where I filled them in, and ask me the rest as multiple-choice questions (a few at a time, recommended option first).

ABOUT ME
- My name: [YOUR NAME]
- Who approves the reels before they are posted: [me / someone else: THEIR NAME]

ABOUT THE BRAND
- Brand or business name: [BRAND NAME]
- Instagram handle: [@HANDLE, or "no account yet"]
- Website (Claude reads it to suggest answers; I confirm each one): [https://YOURSITE.COM, or "skip"]
- What the brand does, in one sentence: [ONE SENTENCE]
- Who it talks to, in one sentence: [ONE SENTENCE]

HOW IT LOOKS
- Main colour: [A COLOUR CODE LIKE #E4572E, or a colour name, or "read it from my logo", or "pick for me"]
- Background and text colours (optional): [CODES, or skip]
- Logo file: [PATH TO A PNG OR SVG FILE, or "none yet"]
- Fonts: [use the kit's fonts, or "display font: NAME, body font: NAME"]
- On-screen host: [a cartoon-style host using my pose pictures in FOLDER PATH / make my host later / no host / the kit's simple drawn host]

HOW IT SOUNDS
- Voice: [pick an ElevenLabs voice together now / use the voice already saved / my own recording / decide later]
- Words the voice must never say: [WORDS, or "none"]
- Names the voice might mispronounce, and how they sound: [NAME = how it sounds, or "none"]

HOW EACH REEL ENDS
- The one thing viewers are asked to do: [Save this / Follow for more / Visit the link in bio]
- Keep a private history of this folder on my computer only (never uploaded): [yes / no]
- Tell me when a newer kit version is out: [yes / no]

Rules: write down only what I confirm. Do not put any number, result, price or client name in brand/facts.md unless I state it here and you read it back to me. Never ask for or show any key or password. When done, give me a short summary of what you wrote and what is still empty.
```

**What goes in each blank**
- **Who approves:** the person who says yes at the three checkpoints. Usually you, even for a client's brand.
- **Website:** Claude only suggests a name, colours and fonts from it. It never takes claims, numbers or prices from it.
- **Main colour:** a code looks like `#E4572E`. Do not know it? Write the colour's name, or "read it from my logo" and Claude will suggest one.
- **Logo file:** drag the file into the terminal to get its location. A PNG or SVG works best.
- **On-screen host:** optional. A host is a character who appears on screen. Skip it ("no host") if you are unsure; you can add one later.
- **Voice:** the AI voice that reads the script. "Pick together" lets you listen to a few options. You need an ElevenLabs account for this.
- **Words the voice must never say:** for example a brand name it says wrongly. Claude puts those on screen as text instead.
- **The one thing viewers are asked to do:** keep it to one. "Comment a keyword" is not offered until you have tested the auto-reply yourself.

---

## 2. Make a reel (every time)

Send this in the brand folder, after the brand is set up. Claude writes the script, builds the video, and stops three times for your yes. Nothing is ever posted for you.

```
Make a reel for [BRAND NAME] on [THE TOPIC, IN ONE LINE].

WHAT I WANT FROM IT
- The one goal: [save / share / follow / lead (people ask for something)]
- The angle (optional; if blank, suggest one different from my last post): [result first / the reel proves itself / go against common advice / start with the pain / something goes wrong]
- Length: [about 30 seconds / about 45 seconds]
- Style: [Print / 3D / Talking head / not sure: recommend one and ask me]

WHAT IS TRUE AND OK TO SAY
- Facts you may use: [FACT 1; FACT 2; or "none yet, so use no numbers"]
- Something only we can say (our own story, result we really got, or way of doing it): [ONE OR TWO LINES]
- Things to avoid: [WORDS, CLAIMS, COMPETITORS OR TOPICS, or "none"]

IF I ALREADY HAVE A SCRIPT
- [PASTE IT HERE and use it word for word, or delete this whole part]

Follow the house rules in CLAUDE.md. Check the first-frame hook checklist before writing the script. Run the voice credit check and tell me the number before I approve the script. Stop at each of the three checkpoints (script, visual plan, final video) and wait for my yes. Do not post, schedule or send anything; I will post it myself.
```

**What goes in each blank**
- **Goal:** pick the single result you want. Save = people keep it for later. Share = people send it to others. Follow = people follow you. Lead = people ask you for something.
- **Style:** Print is the safe default. 3D is more cinematic. Talking head edits your own video of you talking. Unsure? Leave "not sure" and Claude recommends one.
- **Facts:** Claude will only state facts you give it here or have saved in `brand/facts.md`. If you give none, it uses no numbers.
- **Something only we can say:** the part nobody can copy, like what you actually do differently. This is what makes a reel yours.

**A filled-in example** (a made-up bakery, so you can see the level of detail):

```
Make a reel for Maple Street Bakery on why we let our sourdough rise for two days.

WHAT I WANT FROM IT
- The one goal: save
- The angle: start with the pain
- Length: about 30 seconds
- Style: not sure: recommend one and ask me

WHAT IS TRUE AND OK TO SAY
- Facts you may use: our dough rises for 48 hours; we use only flour, water and salt
- Something only we can say: my grandmother's starter is over 20 years old and we feed it every morning
- Things to avoid: the word "healthy", any price

IF I ALREADY HAVE A SCRIPT
- (none, so write it)

Follow the house rules in CLAUDE.md. Check the first-frame hook checklist before writing the script. Run the voice credit check and tell me the number before I approve the script. Stop at each of the three checkpoints (script, visual plan, final video) and wait for my yes. Do not post, schedule or send anything; I will post it myself.
```

---

## 3. After you post (a day or more later)

Copy the numbers from Instagram's insights for the reel.

```
Read these numbers for [REEL NAME OR TOPIC] and tell me what to do next. Compare them with this brand's own usual results, not outside benchmarks. Views: [NUMBER]. Percent who watched past 3 seconds: [NUMBER, or "not shown"]. Saves: [NUMBER]. Shares: [NUMBER]. Comments: [NUMBER]. New follows from this reel: [NUMBER]. Give me two things to do next, not twelve, and tell me what these numbers cannot tell us.
```

---

## 4. Plan a week of reels (optional)

```
Plan this week's reels for [BRAND NAME]: [2 or 3] reels. Give each its own goal and a different angle, write all the scripts, and bring them to the first checkpoint together. I will approve each one separately. Topics I have in mind: [TOPICS, or "suggest some"].
```
