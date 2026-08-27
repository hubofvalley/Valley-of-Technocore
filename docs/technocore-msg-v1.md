# `technocore.msg.v1` verification profile

`technocore.msg.v1` verifies a supplied Technocore signed-room message entirely offline. It targets upstream Technocore commit [`9c7df0e3616cf28d17e7c8ebeb0c05de6adf117c`](https://github.com/flop-labs/technocore-chat/tree/9c7df0e3616cf28d17e7c8ebeb0c05de6adf117c).

The useful analogy is checking a letter's seal. A successful result means the supplied message matches the supplied signature and public key. It does not tell you who controls that key, whether a server included the message, whether the message is authorised or eligible for anything, or whether the same valid message was submitted before.

```sh
node ./bin/valley-technocore.js verify-technocore-message < message.json
```

Input is one UTF-8 JSON object, at most 1 MiB:

```json
{
  "schema": "technocore.msg.v1",
  "room": "lobby",
  "did": "did:key:z...",
  "nonce": "1787676243535",
  "text": "the supplied message text",
  "signature_b64u": "86-character-unpadded-base64url-Ed25519-signature"
}
```

Every field is required; unknown fields are rejected. `room` matches `^[a-z0-9][a-z0-9_-]{0,47}$`; `nonce` is a string of 1–19 ASCII decimal digits. The verifier replaces Unicode categories `Cc`, `Cf`, `Cs`, `Co`, `Zl`, and `Zp` with spaces, then trims Unicode whitespace from the two ends. For example, ZWJ, bidi override, and U+2028 become spaces. NBSP is preserved inside the text but trimmed from either end. The verifier then checks the exact UTF-8 bytes of `room|nonce|text-after-sweep`. It does not normalise NFC/NFD.

Run the checked-in signed fixture:

```sh
node ./bin/valley-technocore.js verify-technocore-message < fixtures/technocore-msg-v1-gauntlet.json; printf '\nexit: %s\n' "$?"
```

The expected report contains `"decision":"verified"` and `"signature_status":"valid"`, followed by `exit: 0`.

On a processable input it emits a canonical JSON report with `decision` of `verified` or `invalid`; a bad signature returns exit `3`. Malformed or unsupported input returns exit `2`. The report never says trusted, allowed, quarantined, eligible, or rewarded.

The fixture `fixtures/technocore-msg-v1-gauntlet.json` maps one public receipt supplied by [technocore-gauntlet](https://github.com/vaibhav0xq/technocore-gauntlet/blob/661ed9647e33f3eddf18deea716434be6a7a4823/evidence/technocore-receipts.json) at its pinned commit. It proves only that the supplied fields verify against the supplied public key. It does not establish identity, authorship beyond control of that key, source authenticity, server inclusion, contribution, recognition, eligibility, rewards, authority, or replay protection.

This profile has no network access, filesystem writes, replay ledger, TOFU/trust store, policy, quarantine, Agent Skill, server, or UI.
