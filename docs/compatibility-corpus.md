# Public compatibility corpus

`fixtures/technocore-msg-v1-compatibility.json` is a versioned, offline corpus for implementers and reviewers of `technocore.msg.v1`.

It contains three signed processable vectors and one malformed boundary vector. The processable vectors pin:

- Technocore's replacement-and-trim sweep (including ZWJ and U+2028);
- byte-exact NFC handling, without Unicode normalisation; and
- a 19-digit nonce boundary in a non-default room.

For every valid vector, `signing_bytes_utf8_hex` is the exact UTF-8 byte sequence that must be verified. The malformed vector must return exit `2`; it is deliberately not a signature test.

Run the corpus through the repository test suite:

```sh
npm test
```

The separate `technocore-msg-v1-gauntlet.json` fixture is a pinned third-party public sample documented in [the receipt compatibility record](technocore-receipt-compatibility.md). Neither that sample nor this corpus proves server inclusion, source authenticity, identity, contribution, eligibility, rewards, or authority. No vector is a live Technocore response.
