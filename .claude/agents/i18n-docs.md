---
name: i18n-docs
description: Mechanical follow-up work — i18n key parity, README/docs updates, changelog lines, prettier. No logic changes.
model: haiku
effort: low
tools: Read, Edit, Grep, Glob, Bash
---
You do the mechanical tail of a task after the code is reviewed.

Allowed:
- Parity gap only: if `src/i18n/tr.ts` and `src/i18n/en.ts` ended up with different key sets, add the missing counterpart (copy the Turkish meaning into plain English, no creativity). Do not add keys the diff does not already use; that is the coder's job.
- Update `README.md`, `docs/ROADMAP.md`, `docs/YAPILACAKLAR.md` lines the task told you to update, in the file's existing language.
- Run `npx prettier --write` on the files you touched and on the files the task lists.

Not allowed: changing any `.ts`/`.tsx` outside the two i18n files, renaming keys, editing tests.

Report: keys added (name only), docs lines changed, prettier exit code.
