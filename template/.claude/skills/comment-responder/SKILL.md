---
name: comment-responder
description: >
  Turn comments into leads, with a person in the loop. Claude drafts the rule for a keyword CTA: a
  friendly public reply (never a link) and the DM that carries your lead magnet / resource. Nothing is
  sent unless the brand owner has turned on autopilot.dm_replies. Use when the user says "auto reply to
  comments", "DM everyone who comments", "comment to DM", "lead magnet automation", "turn comments into
  leads", or "capture leads from a reel". The kit has no comment monitor: the rule is written for your own tool.
user-invokable: true
argument-hint: "[the comment keyword + what to DM, e.g. SKILLS → the repo link]"
metadata:
  author: BagelUnit
  version: "1.1.0"
  category: content
---

# Comment Responder - turn comments into leads

Post a reel with a "comment WORD and I'll send it" CTA, and this skill writes the back half for you: the
rule that matches each new comment, a warm **link-free** public reply, and the DM that carries the
resource to the commenter.

## Gate (read first)

Before anything else, read `brand/brand.json`.

1. **`autopilot.dm_replies` is not `true` (the default): STOP.** Draft the rule, the public reply and the
   DM text only. Send nothing, post nothing, schedule nothing. Hand the drafts to the owner.
2. **`autopilot.dm_replies` is `true`:** each public reply and each DM still needs the owner's OK in the
   conversation, unless the owner wrote otherwise.
3. **The keyword must be listed in `brand.json` -> `cta.tested_keywords`.** That means the auto-reply was
   tested from a second account. If it is not listed, do not use it (CLAUDE.md rule 4).
4. **Facts only.** All reply and DM text may only state facts in `brand/facts.md` (rule 1). A question
   about price, or a comparison, with no cleared fact gets no answer: defer it to the owner.
5. **DMs only to people who commented.** No cold DMs. No link in the public reply, ever (rules 6 and 12).

If any of these fails, stop and say which one.

## Guided setup (when the owner wants comments answered automatically)

Walk the owner through it one step at a time. Ask every choice with a question block (AskUserQuestion). Keep
a short checklist in your reply so they always see where they are, and stop after any step they want to
finish later; next time, read `brand.json` -> `cta.dm_tool` and `cta.tested_keywords` to see where they got to.

1. **Explain in two lines:** the kit drafts the rule and the texts; something connected to their Instagram
   has to send them. Nothing goes out until they test it from a second account.
2. **Pick the route** (question block): "A no-code tool such as ManyChat (Recommended for most people)",
   "My own small service on Meta's API (for developers)", "Not now". Read `docs/auto-reply.md` for the route.
3. **Pick the keyword** (question block): offer 2 or 3 short, distinct words that fit the brand's resource,
   plus Other. Check it is not a common word people type anyway.
4. **Write the rule:** the keyword (and common typos), the public reply (warm, short, no link) and the DM
   (the resource and its link). Facts only from `brand/facts.md`. Show all three for approval (question block:
   "Use these", "Change something").
5. **Connect it, with the owner doing every login:**
   - no-code tool: give the exact clicks in plain words (connect the Instagram professional account, new
     "comment keyword" automation, paste the keyword, the public reply and the DM, limit it to one reel);
   - own service: follow `docs/auto-reply.md` section B with them; any code goes in a folder outside this
     workspace, and keys and tokens are typed by the owner into the service's own settings, never into chat.
   Record the route in `brand.json` -> `cta.dm_tool` (for example "ManyChat" or "own service").
6. **Test from a second account** (question block: "It worked: reply and DM arrived", "Something went wrong").
   If it worked, add the keyword to `cta.tested_keywords`. Only after the owner picks "Turn it on" in a final
   question block, set `autopilot.dm_replies` to `true` and write the date in `brand/brand.json`'s `_note`.
7. **From now on** a reel may end on "Comment <KEYWORD>" (rule 4). Remind them to check the DMs folder and the
   "left for a person" list (or the tool's inbox) once a day.

## When to use
Any reel/post with a keyword CTA ("comment SKILLS / BREAKDOWN / SETUP ..."). Set the rule once; it treats
every commenter the same way.

## What the kit does and does not include
The kit contains **no comment monitor**. This skill gives you the rule format, for your own tool (a
chat-automation service, a script, or answering by hand). See `docs/auto-reply.md` for how to connect one.
Any scheduled runner is the owner's own setup, never started by Claude, and it must still obey the Gate
section above.

## What you'll need
The **keyword(s)** people will comment, the **public reply** (no link), and the **DM** (the link/resource
lives here). Optional: the specific post to scope it to.

## Instructions
Define one rule per CTA. The format below is for the owner's own tool (for example a comment monitor's
rules file such as `auto_responses.json`):

```
You are my comment-to-lead responder. For the post with this CTA, draft a rule:
- match_text: ["KEYWORD", common typos]   (optionally match_media_id: ["<post id>"] to scope it)
- reply:  a warm, LINK-FREE public reply  (e.g. "just sent it to your DMs, check your inbox")
- dm:     the deliverable WITH the link/resource  (this is where the link goes - never the public reply)
Then show me the three pieces. Do not send, post or schedule anything.
For each comment my tool matches, I (or my tool, if I have turned dm_replies on) send the reply + the dm
and log the commenter as a lead.
Rules: ONE link, in the DM only. If a comment doesn't match any rule, defer it to me (don't guess).
```

**The honesty + safety rules (built in):**
- The **public reply NEVER contains a link** - the link goes in the DM only (platforms suppress link-y comments).
- Only promise what you deliver: if the CTA says "comment WORD → I'll DM it," the DM must actually send.
- No match → **defer to a human**, don't auto-reply with a guess.
- Only cleared facts from `brand/facts.md` in any reply or DM.

**Pairs with:** [reel-builder](../reel-builder/SKILL.md) ends the reel on a keyword CTA → this turns the
comments that CTA earns into DMs + leads, once the Gate above is satisfied.
