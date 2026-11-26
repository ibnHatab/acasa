---
name: acasa-cred-openrouter
description: Install the OpenRouter API key that gives Nina's task runner a non-Google backup model (when Google's free tier is busy), wire it into the core config's tasks.fallback, and choose the chain on her "Her models" card. Use when adding a backup provider for her tasks or WhatsApp answers, when a fallback with provider openrouter fails for lack of a key, or when changing which models her tasks use.
---

# The OpenRouter key (optional)

Rules: `acasa-credentials`. Also: **never spend OpenRouter credit on images** for tests.

## Why

Her tasks (and her WhatsApp answers) run on Google's free tier first. When Google is busy ("high
demand") or silent, a model is given up after 45 s and the next in her chain takes the task. An
OpenRouter model as the last link means a busy Google never leaves her without an answer.

## Install

The person creates a key at openrouter.ai (their account, their credit), then on each machine:

```sh
umask 077; mkdir -p ~/.config/nina
# the person writes one line: OPENROUTER_API_KEY=…   into ~/.config/nina/openrouter.env
chmod 600 ~/.config/nina/openrouter.env
# another machine of theirs: copy the file without printing it
#   scp ~/.config/nina/openrouter.env nina@HOST.local:.config/nina/ && ssh nina@HOST.local chmod 600 .config/nina/openrouter.env
```

Core config, a fallback entry after the Google ones:

```yaml
tasks:
  fallback:
    - {provider: openrouter, model: deepseek/deepseek-v4.1-flash, key: ~/.config/nina/openrouter.env}
```

The model is whichever one the person's OpenRouter plan offers (its id as on openrouter.ai); change it
in the config. Restart Nina.

## Choose the chain: "Her models" card

Home Assistant → Home → Nina → **Her models**: her config's models (the main one and its fallbacks),
each on or off and moved up or down; **Save** keeps the order with her settings (applied at once, and
after a restart); **Her config's** goes back to the file's order. E.g. a Flash model first, then the
OpenRouter one.

## Check

Restart Nina; when the Google models are overloaded, her task events show the fallback model in use
(`sqlite3 ~/.local/share/nina/nina.db "select data from events where stream='task' and kind='fallback' order by seq desc limit 3"`).
