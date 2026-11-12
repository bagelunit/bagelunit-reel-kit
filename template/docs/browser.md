# Setting things up on the web: Claude drives your browser

Every part of the kit's setup that happens on a website (your ElevenLabs key, the sound packs, switching Instagram to a professional account, the Meta app, your Facebook Page and Threads, a Google Cloud project for YouTube, a TikTok developer app, Cloudflare for the publisher, the Telegram bot, a host for the dashboard, the sticker host's image tool, Apify or Runway) is done by Claude in your own browser, with the **browser tool** (Claude in Chrome). You watch it work. Claude opens each page, clicks through the menus, fills in names and settings, and turns switches on. You do only three things: log in, copy a key into the file Claude opens for you, and click the last button when something is deleted.

## 1. Turn on the browser tool (once per computer)

1. **A browser it works in:** Google Chrome, Microsoft Edge, Brave, Arc, Vivaldi or Opera. Safari and Firefox are not supported, and neither is Windows inside WSL. If you use Safari or Firefox, install Chrome or Edge (both free) just for this; you can keep your usual browser for everything else.
2. **The Claude extension**, version 1.0.36 or later, from the Chrome Web Store: https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn. Sign in to it with the same Claude account you use in Claude Code.
3. **A Claude plan that includes it:** Pro, Max, Ultra, Team or Enterprise, with Claude Code signed in through `/login`. If you signed in to Claude Code with an API key, the browser tool stays off.
4. **Turn it on in Claude Code:** type `/chrome` and enable it (in a terminal you can also start with `claude --chrome`). In VS Code, `/chrome` works too, or Claude in Chrome under Customize. Choose "Enable by default" so you do not have to do it each session. The first time, restart the browser if Claude Code does not see the extension.
5. **Check:** `/chrome` shows "Status: Enabled" and "Extension: Installed".

The kit cannot turn the browser tool on for you: Claude Code does not let a folder switch it on, so you do step 4 yourself. If Claude needs the browser and it is off, Claude Code shows "Claude wants to use your browser": pick **Install extension** and follow it.

## 2. Who does what

**Claude does everything else on the page:** opening the site, finding the right menu, creating the app or account after you are logged in, filling in names, picking options and permissions, turning switches on, downloading files, and reading back ids that are not secret (an app id, a Page id, an account id). It says what it is doing as it goes.

**You do three things:**

1. **Log in.** Passwords, two-step codes, "are you a robot" checks and payment details are yours. Claude stops at the login page and carries on once you are in.
2. **Copy a key or token.** When the next thing on the page would show a token, key or secret, Claude first makes the file it belongs in and opens it in your text editor, with the place to paste it marked. Then it stops one click before the secret appears and tells you which button that is. You click it, copy the value, paste it into the open file, save, and tell Claude "done". Claude does not look at that tab while the secret is on screen. Then it carries on (and closes the tab, or asks you to).
3. **Click the last Delete.** Whenever something is removed (an app, a key, a token, a bot, a Worker, an account's access, a file), Claude goes all the way to the final Delete, Remove or Confirm button and stops there. You click it, or you say "leave it". The same goes for a command that deletes something: Claude shows you the command and you run it.

**Claude also stops and asks before** anything that costs money, makes something public or speaks for you to a company: choosing a paid plan, a checkout that asks for a card even on a free plan (Cloudflare R2 for the publisher, Cloudflare Zero Trust for a login in front of the dashboard), switching a Meta app to Live, sending an App Review or Business Verification request, making a site public, and agreeing to a site's terms. At a payment form Claude stops: the card details are yours to type. You can say yes in one word; it does not move on without it.

**Never in the browser:** Claude does not type a password or a token into any page, does not read a key back to you in the chat, and does not keep a copy anywhere but the file you pasted it into (in `~/.config/bagelunit-reels/`, readable by you only). Moving a key on from there, for example into Cloudflare, is done by the kit's own scripts, which never show it.

## 3. Without the browser tool

If you would rather not, or your browser cannot run it, every guide in the kit still has the same steps written out, and you click through them yourself. Claude offers once to help you install Chrome or Edge; say no and it walks you through the written steps instead, one at a time.

## 4. Where each web step is

| What | Guide |
| --- | --- |
| ElevenLabs account and key, the sound packs | `SETUP.md` in the kit's folder |
| Your brand's website, logo, colours and Instagram profile, read for `/brand-setup` | `/brand-setup` |
| Switching Instagram to a professional account, the Meta app, Facebook Page, Threads, making the app Live, the Google Cloud project for YouTube Shorts, the TikTok developer app | `docs/connect.md` |
| Cloudflare and the publisher | `docs/connect.md` step 6 |
| Keyword replies (Meta's App Review) | `docs/connect.md` step 7 |
| Telegram bot, Netlify or Cloudflare Pages | `docs/dashboard.md` |
| Apify, Runway (paid, optional) | `SETUP.md`, "Optional" |
| Sticker host: connecting Higgsfield, an OpenAI or Gemini key, or making each pose in ChatGPT or the Gemini app | `/sticker-host` |

## 5. When the browser tool misbehaves

- **It cannot open a file on your computer** (a `file://` address): open the file yourself (on a Mac, `open <file>` in the terminal).
- **Several browsers or profiles:** Claude may be connected to a different Chrome window or profile than the one you are looking at. Tell it which window has the extension and is logged in.
- **A Meta page shows an old state after Claude clicked in it:** reload the page and look again before trusting what it showed.
- **A file upload that fails in the tool** (for example a screen recording on Meta's App Review): do that one upload yourself, in the same window, and tell Claude when it is done.
