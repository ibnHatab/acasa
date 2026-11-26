---
name: acasa-cred-gemini-key
description: Create and install the Gemini API key (Google AI Studio) that a Nina machine's voice, ears and task models use, check it, and deal with "high demand" 503s. Use when setting up a new Nina machine or role, when her voice cannot connect, or when tasks fail with Gemini errors.
---

# The Gemini API key

Follow the rules in `acasa-credentials` (the person creates the key; it lives only in a file).

## Create

1. The person opens **aistudio.google.com** signed in to **this role's** Google account → *Get API key*
   → create it in the account's own project (its quota is its own).
2. Keys now look like `AQ.` + 50 characters (53 in all); they work as they are.

## Install

```sh
umask 077; mkdir -p ~/.config/fsttm
# the person pastes the key into the file (an editor, or: read -rs K && printf %s "$K" > ~/.config/fsttm/gemini.key)
chmod 600 ~/.config/fsttm/gemini.key
```

The configs reference the file, never the key: the dialogue yaml's top-level `key:`, and in the core
yaml `tasks.key`, each `tasks.fallback[].key` (provider google), `search`'s key.

## Check

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H "x-goog-api-key: $(cat ~/.config/fsttm/gemini.key)" \
  -H 'Content-Type: application/json' -d '{"contents":[{"parts":[{"text":"ok"}]}]}' \
  https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent
```

200 is good. (The command reads the key without printing it; do not echo it.) Then restart Nina
and say "Nina" (or a wake-cycle phrase): she answers.

## 503 "This model is currently experiencing high demand"

Google's load, not the key. Give the task runner fallbacks in the core yaml (`tasks.fallback`, e.g.
the Flash-Lite models); nina-live passes over an overloaded model for 5 minutes instead of retrying.
On WhatsApp she answers within 100 s or says she is overloaded.
