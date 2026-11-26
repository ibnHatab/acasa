---
name: acasa-cred-whatsapp-link
description: Link Nina to a WhatsApp number as a linked device (nina-live's nina-whatsapp, whatsmeow) by QR, choose its answering mode (named, self, none), the chats it keeps and the groups on her screen, list group names, and unlink. Use when giving Nina WhatsApp on a machine, when she shows WhatsApp as not linked, when changing which chats she answers, or when removing her from a number.
---

# Linking WhatsApp

Rules: `acasa-credentials`. And: **never send WhatsApp messages to anyone as a test**; on a person's
primary number she answers only its own "Message yourself" chat.

## Decide first (the person)

- It is an **unofficial client**: WhatsApp can ban a number for it. A spare number is safe to risk;
  the person's primary number only by their explicit choice.
- The number is registered in WhatsApp on a phone first. The phone stays the primary device and must
  come online at least every 14 days.

## Link by QR: her WhatsApp card (preferred)

Home Assistant → **Home → Nina** → *Her WhatsApp* (`nina-whatsapp-card`; `whatsapp.enabled: true` in her
config, Nina running). It shows linked / connected / the number's last digits. **Link a device** shows
a QR from her panel (a new one every ~20 s): on the phone, Settings → Linked devices → Link a device →
scan. She connects and lists her groups by herself. **Unlink** asks twice, then logs her out of the
number. The groups she is in are listed with a filter: tick the ones for her screen (the first ticked
is her WhatsApp card's; ticked groups are kept), **Save**; *Read her groups again* after she is added
to a new group. Her answer mode is shown, never changed there (`whatsapp.answer` in her config: on a
primary number a screen must not switch her to answering its contacts).

## Link by QR: the command line (fallback)

```sh
~/repo/nina-live/bin/nina-whatsapp link-qr
```

It writes a page that follows the codes: `http://HOST:8770/nina/wa-link.html`. Open it; on the phone:
Settings → Linked devices → Link a device → scan. A session lasts ~160 s (run again for a new one).
Then restart Nina (`systemctl --user restart nina` or `acasa-nina`). `link-qr` removes its PNG when it
exits; the HTML page stays: delete it by hand.

Pairing by phone code (`nina-whatsapp link PHONE`) failed twice ("Couldn't link device"): use the QR.
`-debug` prints whatsmeow's exchange.

## Configure (core yaml `whatsapp:`)

```yaml
whatsapp:
  enabled: true
  answer: named     # named: direct messages + groups that name her or reply to her | self: only "Message yourself" (a primary number) | none
  names: [nina]
  keep: [self]      # chats stored: self, chat names, all (none listed: all; with answer: self, only the self-chat)
  show: [Group Name]   # groups on her screen's chat card (also settable from her settings card)
  min_gap: 10s
  per_hour: 30
```

Group names: her WhatsApp card lists them (or: stop Nina, `~/repo/nina-live/bin/nina-whatsapp groups`,
start her — two connections of one device kick each other off).

## Check

- `curl -s http://127.0.0.1:8770/api/state` → `facts.whatsapp.linked`.
- Her log: `whatsapp: connected (answers: …)`.
- Test only through the self-chat (self mode) or a message the person sends her (named mode).
- Read receipts appear only while she is online (she sends presence at connect).

## Unlink

On the phone: Linked devices → her device (its name is what whatsmeow sends, often "Chrome": check the
list) → Log out. Then delete `~/.local/share/nina/whatsapp.db`
(whatsmeow's keys and her messages: treat it as a secret).
