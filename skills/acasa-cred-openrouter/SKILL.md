---
name: acasa-cred-openrouter
description: Install the optional OpenRouter API key that gives Nina's task runner non-Google fallback models, and wire it into the core config's tasks.fallback. Use when adding a fallback provider for her tasks, or when a fallback with provider openrouter fails for lack of a key.
---

# The OpenRouter key (optional)

Rules: `acasa-credentials`. Also: **never spend OpenRouter credit on images** for tests.

## Install

The person creates a key at openrouter.ai (their account, their credit), then:

```sh
umask 077; mkdir -p ~/.config/metis
# the person writes one line: OPENROUTER_API_KEY=…   into ~/.config/metis/openrouter.env
chmod 600 ~/.config/metis/openrouter.env
```

Core config, a fallback entry after the Google ones:

```yaml
tasks:
  fallback:
    - {provider: openrouter, model: deepseek/deepseek-v4.1-flash, key: ~/.config/metis/openrouter.env}
```

## Check

Restart Nina; when the Google models are overloaded, her task events show the fallback model in use
(`sqlite3 ~/.local/share/nina/nina.db "select data from events where stream='task' and kind='fallback' order by seq desc limit 3"`).
