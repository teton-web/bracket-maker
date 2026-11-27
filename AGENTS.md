# bracket-maker

Edits happen on the local `dev` branch in this checkout. Do not create a feature branch, an issue branch, or a worktree.

## Before you edit

Start the Water Cooler Protocol. The queue is the prose files in `.wcp/issues/`. There is no `wcp` binary and no daemon.

Read `.wcp/issues/in-progress/` before editing. An issue in `open/` is waiting. Move the issue you take to `in-progress/`, set `assignee`, and list each path under `files` before you write it. Do not edit a path another in-progress issue lists.

Issue status for David and the other seats is Teton Web MCP (`user-Teton-Web`): `list_task_queue`, `read_task`, `claim_task`, `update_task`, `add_task_comment`. Project codes look like `BM-1`. Do not use Notion or Linear. Do not call Teton while you are writing a source file.

## Commands

Project commands are in `README.md`. Production build is `bun run build`. Types are `bun run typecheck`. Unit tests are `bun test`.

## Accounts

Phase 1 accounts use Neon managed Better Auth through `@neon/auth`. Do not call `betterAuth()`, add a database adapter, or send mail from the app. Guest pages stay public. Tournaments stay in localStorage (`bracket-maker-tournaments`, `bracket-maker-player-lists`).
